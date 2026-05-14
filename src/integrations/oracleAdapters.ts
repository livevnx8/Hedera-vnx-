/**
 * Chainlink + Pyth Oracle Adapters
 *
 * Pull price feeds and push Vera-derived attestations (carbon scores, reputation)
 * on-chain via Hedera HCS or EVM bridges.
 */

import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';

// ─── Chainlink Data Streams (Hedera EVM) ────────────────────────────────────

const CHAINLINK_FEED_ADDRESSES: Record<string, string> = {
  'HBAR/USD': config.CHAINLINK_HBAR_USD_FEED || '',
};

export async function fetchChainlinkPrice(pair: string): Promise<{ price: number; timestamp: number; decimals: number }> {
  const feed = CHAINLINK_FEED_ADDRESSES[pair];
  if (!feed || feed === '') throw new Error(`Chainlink feed not configured for ${pair}. Set CHAINLINK_${pair.replace('/', '_')}_FEED in env.`);

  try {
    // In production, call Hedera EVM JSON-RPC to read the aggregator contract
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(config.HEDERA_EVM_RPC);
    const abi = ['function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)'];
    const contract = new ethers.Contract(feed, abi, provider);
    const [, answer, , updatedAt] = await contract.latestRoundData();

    return {
      price: Number(answer) / 1e8,
      timestamp: Number(updatedAt) * 1000,
      decimals: 8,
    };
  } catch (error) {
    logger.error('ChainlinkAdapter', { message: 'Price fetch failed', pair, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ─── Pyth Network Price Feeds ───────────────────────────────────────────────

const PYTH_HEDERA_HERMES = 'https://hermes.pyth.network';

export async function fetchPythPrice(
  priceId: string,
  confidenceThreshold: number = 0.01
): Promise<{ price: number; confidence: number; timestamp: number }> {
  try {
    const res = await fetch(`${PYTH_HEDERA_HERMES}/api/latest_price_feeds?ids[]=${priceId}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

    const data = (await res.json()) as Array<{
      id: string;
      price: { price: string; conf: string; expo: number; publish_time: number };
    }>;

    const feed = data[0];
    if (!feed) throw new Error('Price feed not found');

    const price = Number(feed.price.price) * Math.pow(10, feed.price.expo);
    const confidence = Number(feed.price.conf) * Math.pow(10, feed.price.expo);
    const relativeConfidence = confidence / price;

    if (relativeConfidence > confidenceThreshold) {
      logger.warn('PythAdapter', { message: 'Confidence exceeds threshold', priceId, relativeConfidence });
    }

    return {
      price,
      confidence,
      timestamp: feed.price.publish_time * 1000,
    };
  } catch (error) {
    logger.error('PythAdapter', { message: 'Price fetch failed', priceId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ─── Vera Attestation Oracle ─────────────────────────────────────────────────

interface AttestationPayload {
  type: 'carbon_score' | 'reputation' | 'compliance' | 'price';
  subject: string;
  value: number;
  confidence: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

export async function publishAttestation(payload: AttestationPayload): Promise<{ txId: string; topicSequenceNumber: number | null }> {
  const { TopicMessageSubmitTransaction, TopicId } = await import('@hashgraph/sdk');
  const { getClient } = await import('../hedera/tools/client.js');

  const client = getClient();
  const topicId = process.env.VERA_ATTESTATION_TOPIC_ID;
  if (!topicId) throw new Error('VERA_ATTESTATION_TOPIC_ID not configured');
  if (!client) throw new Error('Hedera client not available');

  const message = JSON.stringify({
    ...payload,
    issuedAt: Date.now(),
    issuer: 'vera-oracle',
  });

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message)
    .execute(client);

  const receipt = await tx.getReceipt(client);

  logger.info('AttestationOracle', {
    message: 'Attestation published',
    type: payload.type,
    subject: payload.subject,
    txId: tx.transactionId.toString(),
    sequenceNumber: receipt.topicSequenceNumber?.toString(),
  });

  return {
    txId: tx.transactionId.toString(),
    topicSequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : null,
  };
}

// ─── Composite Price Feed (Chainlink + Pyth Consensus) ────────────────────────

export async function getConsensusPrice(
  pair: string,
  pythPriceId: string
): Promise<{ price: number; sources: number; spread: number }> {
  const [chainlink, pyth] = await Promise.allSettled([
    fetchChainlinkPrice(pair),
    fetchPythPrice(pythPriceId),
  ]);

  const prices: number[] = [];
  if (chainlink.status === 'fulfilled') prices.push(chainlink.value.price);
  if (pyth.status === 'fulfilled') prices.push(pyth.value.price);

  if (prices.length === 0) throw new Error(`All price sources failed for ${pair}`);

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const spread = prices.length > 1 ? Math.abs(prices[0] - prices[1]) / avg : 0;

  if (spread > 0.05) {
    logger.warn('OracleConsensus', { message: 'High price spread detected', pair, spread, prices });
  }

  return { price: avg, sources: prices.length, spread };
}

// ─── Fastify Route Handlers ─────────────────────────────────────────────────

export async function getOracleRoutes() {
  return {
    async getPrice(pair: string, source: 'chainlink' | 'pyth' | 'consensus' = 'consensus', pythPriceId?: string) {
      if (source === 'chainlink') return fetchChainlinkPrice(pair);
      if (source === 'pyth') {
        if (!pythPriceId) throw new Error('pythPriceId required for Pyth source');
        return fetchPythPrice(pythPriceId);
      }
      if (!pythPriceId) throw new Error('pythPriceId required for consensus');
      return getConsensusPrice(pair, pythPriceId);
    },

    async publishCarbonScore(projectId: string, tonnes: number, verifier: string) {
      return publishAttestation({
        type: 'carbon_score',
        subject: projectId,
        value: tonnes,
        confidence: 0.95,
        expiresAt: Date.now() + 86400000 * 365,
        metadata: { verifier, standard: 'VCS' },
      });
    },

    async publishReputation(agentId: string, score: number) {
      return publishAttestation({
        type: 'reputation',
        subject: agentId,
        value: score,
        confidence: 0.9,
        expiresAt: Date.now() + 86400000 * 30,
      });
    },
  };
}
