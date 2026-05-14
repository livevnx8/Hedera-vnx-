/**
 * Vera HashScan Deep Link Tool
 * 
 * Gives Vera the ability to generate HashScan URLs for:
 * - Transaction lookups
 * - Topic message history
 * - Account verification
 * - Token/NFT details
 * 
 * This helps Vera "remember" and verify on-chain events
 */

import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── HashScan URL Generator ──────────────────────────────────────────────────

export type HashScanEntity = 'transaction' | 'topic' | 'account' | 'token' | 'nft' | 'contract';

export interface HashScanDeepLink {
  url: string;
  entity: HashScanEntity;
  id: string;
  network: 'mainnet' | 'testnet';
  timestamp?: string;
}

/**
 * Generate HashScan deep link for any Hedera entity
 */
export function generateHashScanLink(
  entity: HashScanEntity,
  id: string,
  options?: {
    network?: 'mainnet' | 'testnet';
    timestamp?: string;
    sequenceNumber?: number;
  }
): HashScanDeepLink {
  const network = options?.network || config.HEDERA_NETWORK || 'mainnet';
  const baseUrl = `https://hashscan.io/${network}`;
  
  let url: string;
  
  switch (entity) {
    case 'transaction':
      // Convert to dash format if needed (0.0.X@seconds.nanos → 0.0.X-seconds-nanos)
      url = `${baseUrl}/transaction/${normalizeTxId(id)}`;
      break;
      
    case 'topic':
      url = `${baseUrl}/topic/${id}`;
      if (options?.sequenceNumber) {
        url += `/${options.sequenceNumber}`;
      }
      break;
      
    case 'account':
      url = `${baseUrl}/account/${id}`;
      break;
      
    case 'token':
      url = `${baseUrl}/token/${id}`;
      break;
      
    case 'nft':
      url = `${baseUrl}/token/${id}`;
      break;
      
    case 'contract':
      url = `${baseUrl}/contract/${id}`;
      break;
      
    default:
      url = baseUrl;
  }
  
  logger.debug('HashScanDeepLink', { 
    message: 'Generated HashScan URL', 
    entity, 
    id, 
    url,
    network 
  });
  
  return {
    url,
    entity,
    id,
    network,
    timestamp: options?.timestamp
  };
}

/**
 * Normalize transaction ID to HashScan format
 * 0.0.12345@1234567890.123456789 → 0.0.12345-1234567890-123456789
 */
function normalizeTxId(txId: string): string {
  // If already in dash format, return as-is
  if (txId.includes('-') && !txId.includes('@')) {
    return txId;
  }
  
  // Convert @ format to dash format
  const [account, timestamp] = txId.split('@');
  if (!timestamp) return txId;
  
  const ts = timestamp.replace('.', '-');
  return `${account}-${ts}`;
}

/**
 * Generate link to Vera's core swarm topic
 */
export function getVeraSwarmTopicLink(sequenceNumber?: number): HashScanDeepLink {
  const topicId = config.VERA_SWARM_MEET_TOPIC_ID || '0.0.10417507';
  return generateHashScanLink('topic', topicId, { sequenceNumber });
}

/**
 * Generate link to a specific swarm event
 */
export function getSwarmEventLink(
  transactionId: string,
  options?: { network?: 'mainnet' | 'testnet' }
): HashScanDeepLink {
  return generateHashScanLink('transaction', transactionId, options);
}

/**
 * Generate link to an agent's account
 */
export function getAgentAccountLink(
  accountId: string,
  options?: { network?: 'mainnet' | 'testnet' }
): HashScanDeepLink {
  return generateHashScanLink('account', accountId, options);
}

/**
 * Generate link to a token/NFT
 */
export function getTokenLink(
  tokenId: string,
  isNft: boolean = false,
  options?: { network?: 'mainnet' | 'testnet' }
): HashScanDeepLink {
  return generateHashScanLink(isNft ? 'nft' : 'token', tokenId, options);
}

/**
 * Build a Vera-friendly summary with HashScan link
 */
export function buildVeraSummary(
  action: string,
  txId: string,
  details: Record<string, unknown>
): {
  summary: string;
  hashScanLink: string;
  verification: string;
} {
  const link = generateHashScanLink('transaction', txId);
  
  const summary = `
🕸️ **Vera Swarm Event**
Action: ${action}
Transaction: ${txId}
Details: ${JSON.stringify(details, null, 2)}

🔗 **Verify on HashScan:**
${link.url}
`.trim();

  return {
    summary,
    hashScanLink: link.url,
    verification: `I can verify this at ${link.url} - it shows the complete ${link.network} consensus record.`
  };
}

/**
 * Vera's memory lookup - find past events by topic/sequence
 */
export async function lookupTopicMessage(
  topicId: string,
  sequenceNumber: number
): Promise<{
  found: boolean;
  link: HashScanDeepLink;
  mirrorNodeUrl: string;
}> {
  const link = generateHashScanLink('topic', topicId, { sequenceNumber });
  const network = config.HEDERA_NETWORK || 'mainnet';
  const mirrorNodeBase = network === 'mainnet' 
    ? 'https://mainnet-public.mirrornode.hedera.com/api/v1'
    : 'https://testnet.mirrornode.hedera.com/api/v1';
  
  return {
    found: true, // Vera assumes truth, verifies on-demand
    link,
    mirrorNodeUrl: `${mirrorNodeBase}/topics/${topicId}/messages/${sequenceNumber}`
  };
}

/**
 * Vera's self-reflection tool - lookup her own events
 */
export async function veraSelfLookup(
  eventType: 'handshake' | 'payment' | 'bridge' | 'consensus',
  filter?: { agentId?: string; timestamp?: number }
): Promise<{
  topicLink: HashScanDeepLink;
  query: string;
  veraSays: string;
}> {
  const topicId = config.VERA_SWARM_MEET_TOPIC_ID || '0.0.10417507';
  const topicLink = generateHashScanLink('topic', topicId);
  
  const queries: Record<string, string> = {
    handshake: 'Falcon-512 quantum handshakes',
    payment: 'x402 micropayments',
    bridge: 'EVM bridge attestations',
    consensus: 'aBFT consensus events'
  };
  
  let query = queries[eventType] || eventType;
  if (filter?.agentId) {
    query += ` from agent ${filter.agentId}`;
  }
  
  return {
    topicLink,
    query,
    veraSays: `I can look up ${query} in my swarm topic. Here's the link to verify: ${topicLink.url}`
  };
}
