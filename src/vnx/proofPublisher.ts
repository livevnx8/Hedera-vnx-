import { Client, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config } from '../config.js';

export interface VnxProofReceipt {
  topicId: string;
  sequenceNumber: number | null;
  transactionId: string;
  hashscanUrl: string;
  mirrorNodeUrl: string;
}

export interface PublishVnxProofResult {
  ok: true;
  receipt: VnxProofReceipt;
}

function getHederaClient(): Client | null {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) return null;
  const client = config.HEDERA_NETWORK === 'testnet' ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, config.HEDERA_OPERATOR_PRIVATE_KEY);
  return client;
}

function resolveTopicId(): string | null {
  return config.VNX_PROOF_TOPIC_ID || config.VERA_PROOF_TOPIC_ID || config.HCS_TOPIC_ID || null;
}

function buildHashscanUrl(topicId: string, seq: number | null, network: string): string {
  return `https://hashscan.io/${network}/topic/${topicId}/${seq ?? ''}`;
}

function buildMirrorNodeUrl(topicId: string, seq: number | null, network: string): string {
  const base =
    network === 'mainnet'
      ? 'https://mainnet-public.mirrornode.hedera.com'
      : network === 'testnet'
        ? 'https://testnet.mirrornode.hedera.com'
        : 'https://previewnet.mirrornode.hedera.com';
  return `${base}/api/v1/topics/${topicId}/messages/${seq ?? ''}`;
}

export async function publishVnxProof(hcsReadySummary: object): Promise<PublishVnxProofResult> {
  const topicId = resolveTopicId();
  if (!topicId) {
    throw new Error('VNX_PROOF_TOPIC_ID, VERA_PROOF_TOPIC_ID, or HCS_TOPIC_ID must be configured');
  }

  const client = getHederaClient();
  if (!client) {
    throw new Error('Hedera operator not configured — set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY');
  }

  const envelope = {
    _vera: {
      version: '1.0.0',
      schema: 'vnx-lm-proof-1',
      eventType: 'vnx.inference.proof',
      timestamp: Date.now(),
      network: config.HEDERA_NETWORK,
    },
    _hip993: {
      type: 'VNX_PROOF_PACKET',
      version: '1.0',
      encoding: 'utf-8',
    },
    proof: hcsReadySummary,
  };

  const message = JSON.stringify(envelope);

  const tx = await new TopicMessageSubmitTransaction({
    topicId,
    message,
  }).execute(client);

  const receipt = await tx.getReceipt(client);
  const seq = receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : null;

  return {
    ok: true,
    receipt: {
      topicId,
      sequenceNumber: seq,
      transactionId: tx.transactionId.toString(),
      hashscanUrl: buildHashscanUrl(topicId, seq, config.HEDERA_NETWORK),
      mirrorNodeUrl: buildMirrorNodeUrl(topicId, seq, config.HEDERA_NETWORK),
    },
  };
}
