/**
 * Vera HashScan Integration
 * 
 * Fetches and displays HCS topic data from Hedera HashScan.
 * Provides real-time visibility into HCS messages with
 * HIP-993 large message reconstruction.
 */

import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface HashScanTopicMessage {
  consensus_timestamp: string;
  message: string; // Base64 encoded
  running_hash: string;
  running_hash_version: number;
  sequence_number: number;
  topic_id: string;
}

export interface HashScanTopicResponse {
  messages: HashScanTopicMessage[];
  links: {
    next: string | null;
  };
}

export interface HIP993ChunkMetadata {
  chunk: number;
  total: number;
  messageId: string;
  timestamp: number;
  version?: string;
  max_chunk_size?: number;
  features?: string[];
}

export interface HIP993Wrapper {
  _hip993: HIP993ChunkMetadata;
  data: unknown;
}

export interface ParsedHCSMessage {
  sequenceNumber: number;
  timestamp: string;
  topicId: string;
  decodedMessage: object | string;
  isChunked: boolean;
  hip993?: HIP993ChunkMetadata;
  rawSize: number;
}

export interface ReconstructedMessage {
  messageId: string;
  totalChunks: number;
  chunks: ParsedHCSMessage[];
  reconstructedData: object | string;
  firstTimestamp: string;
  lastTimestamp: string;
}

// ─── HashScan Client ────────────────────────────────────────────────────────

export class HashScanClient {
  private baseUrl: string;
  private network: string;

  constructor() {
    this.network = config.HEDERA_NETWORK || 'mainnet';
    // Mirror node REST API endpoint
    this.baseUrl = this.network === 'mainnet'
      ? 'https://mainnet-public.mirrornode.hedera.com/api/v1'
      : 'https://testnet.mirrornode.hedera.com/api/v1';
  }

  /**
   * Fetch topic messages from mirror node
   */
  async fetchTopicMessages(
    topicId: string,
    options: {
      limit?: number;
      order?: 'asc' | 'desc';
      sequenceNumber?: number;
    } = {}
  ): Promise<HashScanTopicResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.order) params.append('order', options.order);
    if (options.sequenceNumber) params.append('sequencenumber', options.sequenceNumber.toString());

    const url = `${this.baseUrl}/topics/${topicId}/messages?${params.toString()}`;
    
    logger.debug('HashScanClient', { message: 'Fetching topic messages', topicId, url });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HashScan API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Parse and decode HCS messages
   */
  parseMessages(messages: HashScanTopicMessage[]): ParsedHCSMessage[] {
    return messages.map(msg => {
      const decoded = Buffer.from(msg.message, 'base64').toString('utf8');
      let parsed: object | string;
      let isChunked = false;
      let hip993: ParsedHCSMessage['hip993'] | undefined;

      try {
        const rawParsed = JSON.parse(decoded) as unknown;
        
        // Check for HIP-993 chunked message
        if (typeof rawParsed === 'object' && rawParsed !== null && '_hip993' in rawParsed) {
          isChunked = true;
          const wrapper = rawParsed as HIP993Wrapper;
          hip993 = wrapper._hip993;
          
          // Extract actual data from chunked message
          if ('data' in wrapper) {
            const data = wrapper.data;
            // Try to parse nested data if it's JSON string
            if (typeof data === 'string') {
              try {
                parsed = JSON.parse(data) as object | string;
              } catch {
                parsed = data; // Keep as string if not valid JSON
              }
            } else if (typeof data === 'object' && data !== null) {
              parsed = data as object;
            } else {
              parsed = String(data);
            }
          } else {
            parsed = rawParsed as object | string;
          }
        } else {
          parsed = rawParsed as object | string;
        }
      } catch {
        // Not JSON, keep as string
        parsed = decoded;
      }

      return {
        sequenceNumber: msg.sequence_number,
        timestamp: msg.consensus_timestamp,
        topicId: msg.topic_id,
        decodedMessage: parsed,
        isChunked,
        hip993,
        rawSize: msg.message.length
      };
    });
  }

  /**
   * Reconstruct chunked HIP-993 messages
   */
  reconstructMessages(parsedMessages: ParsedHCSMessage[]): {
    single: ParsedHCSMessage[];
    reconstructed: ReconstructedMessage[];
  } {
    const chunksByMessageId = new Map<string, ParsedHCSMessage[]>();
    const singleMessages: ParsedHCSMessage[] = [];

    // Group chunks by messageId
    for (const msg of parsedMessages) {
      if (msg.hip993 && msg.hip993.total > 1) {
        const messageId = msg.hip993.messageId;
        if (!chunksByMessageId.has(messageId)) {
          chunksByMessageId.set(messageId, []);
        }
        chunksByMessageId.get(messageId)!.push(msg);
      } else {
        singleMessages.push(msg);
      }
    }

    // Reconstruct chunked messages
    const reconstructed: ReconstructedMessage[] = [];
    for (const [messageId, chunks] of chunksByMessageId) {
      // Sort by chunk number
      chunks.sort((a, b) => (a.hip993?.chunk || 0) - (b.hip993?.chunk || 0));

      // Verify all chunks present
      const totalChunks = chunks[0]?.hip993?.total || chunks.length;
      const isComplete = chunks.length === totalChunks;

      if (isComplete) {
        // Concatenate data
        let reconstructedData: object | string = '';
        for (const chunk of chunks) {
          const data = chunk.decodedMessage;
          if (typeof data === 'string') {
            reconstructedData += data;
          } else {
            reconstructedData = data; // Take last object if multiple
          }
        }

        // Try to parse as JSON
        if (typeof reconstructedData === 'string') {
          try {
            reconstructedData = JSON.parse(reconstructedData);
          } catch {
            // Keep as string
          }
        }

        reconstructed.push({
          messageId,
          totalChunks,
          chunks,
          reconstructedData,
          firstTimestamp: chunks[0].timestamp,
          lastTimestamp: chunks[chunks.length - 1].timestamp
        });
      } else {
        logger.warn('HashScanClient', {
          message: 'Incomplete chunked message',
          messageId,
          have: chunks.length,
          need: totalChunks
        });
      }
    }

    return { single: singleMessages, reconstructed };
  }

  /**
   * Get HashScan URL for topic
   */
  getHashScanUrl(topicId: string): string {
    const network = this.network === 'mainnet' ? 'mainnet' : 'testnet';
    return `https://hashscan.io/${network}/topic/${topicId}`;
  }

  /**
   * Get comprehensive topic analysis
   */
  async analyzeTopic(topicId: string, limit: number = 100): Promise<{
    topicId: string;
    hashscanUrl: string;
    totalMessages: number;
    hip993Messages: number;
    chunkedMessages: number;
    reconstructedMessages: number;
    recentMessages: ParsedHCSMessage[];
    reconstructed: ReconstructedMessage[];
    stats: {
      avgMessageSize: number;
      largestMessage: ParsedHCSMessage | null;
      totalBytes: number;
    };
  }> {
    const response = await this.fetchTopicMessages(topicId, { limit, order: 'desc' });
    const parsed = this.parseMessages(response.messages);
    const { single, reconstructed } = this.reconstructMessages(parsed);

    const hip993Count = parsed.filter(m => m.hip993).length;
    const chunkedCount = parsed.filter(m => m.isChunked).length;

    // Calculate stats
    const totalBytes = parsed.reduce((sum, m) => sum + m.rawSize, 0);
    const largestMessage = parsed.reduce((max, m) => 
      m.rawSize > (max?.rawSize || 0) ? m : max, null as ParsedHCSMessage | null
    );

    return {
      topicId,
      hashscanUrl: this.getHashScanUrl(topicId),
      totalMessages: parsed.length,
      hip993Messages: hip993Count,
      chunkedMessages: chunkedCount,
      reconstructedMessages: reconstructed.length,
      recentMessages: parsed.slice(0, 10),
      reconstructed: reconstructed.slice(0, 5),
      stats: {
        avgMessageSize: totalBytes / parsed.length || 0,
        largestMessage,
        totalBytes
      }
    };
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const hashScanClient = new HashScanClient();
export default hashScanClient;
