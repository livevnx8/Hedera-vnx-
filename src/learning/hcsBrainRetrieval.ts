/**
 * Vera HCS Brain Retrieval System
 * 
 * Provides full access to historical HCS messages for:
 * - Memory restoration on startup
 * - Contextual learning retrieval (RAG-style)
 * - Pattern recognition from 100k+ logged interactions
 * 
 * Uses Hedera Mirror Node REST API for efficient querying
 */

import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';

interface HCSMessage {
  consensus_timestamp: string;
  message: string;
  running_hash: string;
  running_hash_version: number;
  sequence_number: number;
  topic_id: string;
  chunk_info?: {
    initial_transaction_id: string;
    number: number;
    total: number;
    scheduled: boolean;
  };
}

interface MirrorNodeResponse {
  messages: HCSMessage[];
  links?: {
    next?: string;
  };
}

interface BrainRetrievalOptions {
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  order?: 'asc' | 'desc';
  decodeBase64?: boolean;
}

interface ContextualQuery {
  query: string;
  keywords?: string[];
  categories?: string[];
  timeWindow?: number; // hours back
  limit?: number;
}

export interface RetrievedMemory {
  sequence: number;
  timestamp: Date;
  content: any;
  topicId: string;
  relevanceScore?: number;
}

interface BrainStats {
  totalMessages: number;
  topicsMonitored: number;
  oldestMessage: Date | null;
  newestMessage: Date | null;
  messagesByTopic: Record<string, number>;
  knowledgeCategories: string[];
}

export class HCSBrainRetrieval {
  private mirrorNodeUrl: string;
  private lastRetrievedTimestamps: Map<string, string> = new Map();
  private knowledgeCache: Map<string, RetrievedMemory[]> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.mirrorNodeUrl = config.MIRROR_NODE_BASE_URL || 'https://mainnet-public.mirrornode.hedera.com';
  }

  /**
   * Query HCS messages from mirror node
   * Fully implements Hedera Mirror Node REST API
   */
  async queryTopicMessages(
    topicId: string,
    options: BrainRetrievalOptions = {}
  ): Promise<RetrievedMemory[]> {
    const {
      startTime,
      endTime,
      limit = 100,
      order = 'desc',
      decodeBase64 = true
    } = options;

    const params = new URLSearchParams();
    params.set('limit', limit.toString());
    params.set('order', order);
    
    if (startTime) {
      // Convert to nanoseconds timestamp
      params.set('timestamp', `gt:${startTime.getTime()}000000`);
    }
    if (endTime) {
      params.set('timestamp', `lt:${endTime.getTime()}000000`);
    }

    const url = `${this.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?${params.toString()}`;
    
    logger.debug('HCSBrainRetrieval', {
      topicId,
      url: url.replace(this.mirrorNodeUrl, ''),
      message: 'Querying mirror node for HCS messages'
    });

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
        // 30 second timeout for large queries
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn('HCSBrainRetrieval', { topicId, message: 'Topic not found or no messages' });
          return [];
        }
        throw new Error(`Mirror node error: ${response.status} ${response.statusText}`);
      }

      const data: MirrorNodeResponse = await response.json();
      
      logger.info('HCSBrainRetrieval', {
        topicId,
        messageCount: data.messages?.length || 0,
        hasMore: !!data.links?.next,
        message: 'Retrieved HCS messages from mirror node'
      });

      if (!data.messages || data.messages.length === 0) {
        return [];
      }

      // Update last retrieved timestamp
      if (data.messages.length > 0) {
        const newestTimestamp = data.messages[0].consensus_timestamp;
        this.lastRetrievedTimestamps.set(topicId, newestTimestamp);
      }

      return this.parseMessages(data.messages, topicId, decodeBase64);
      
    } catch (error) {
      logger.error('HCSBrainRetrieval', {
        topicId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to query HCS messages'
      });
      return [];
    }
  }

  /**
   * Parse raw HCS messages into structured memory
   */
  private parseMessages(
    messages: HCSMessage[],
    topicId: string,
    decodeBase64: boolean
  ): RetrievedMemory[] {
    return messages.map(msg => {
      let content: any;
      
      if (decodeBase64) {
        try {
          // HCS messages are base64 encoded
          const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
          
          // Try to parse as JSON
          try {
            content = JSON.parse(decoded);
          } catch {
            content = decoded; // Plain text
          }
        } catch {
          content = msg.message; // Raw if decoding fails
        }
      } else {
        content = msg.message;
      }

      // Convert nanosecond timestamp to Date
      const timestampNanos = parseInt(msg.consensus_timestamp);
      const timestamp = new Date(timestampNanos / 1000000);

      return {
        sequence: msg.sequence_number,
        timestamp,
        content,
        topicId,
      };
    });
  }

  /**
   * Contextual retrieval - find relevant memories based on query
   * Uses keyword matching and timestamp recency
   */
  async retrieveContextualMemories(
    query: ContextualQuery
  ): Promise<RetrievedMemory[]> {
    const {
      query: searchQuery,
      keywords = [],
      categories = [],
      timeWindow = 24, // hours
      limit = 20
    } = query;

    // Extract keywords from query if not provided
    const searchTerms = keywords.length > 0 
      ? keywords 
      : this.extractKeywords(searchQuery);

    // Calculate time window
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeWindow * 60 * 60 * 1000);

    // Get learning topic IDs
    const topicIds = this.getLearningTopicIds();
    
    let allMemories: RetrievedMemory[] = [];

    // Query all learning topics
    for (const topicId of topicIds) {
      const memories = await this.queryTopicMessages(topicId, {
        startTime,
        endTime,
        limit: Math.min(limit * 3, 100), // Get more for filtering
        order: 'desc'
      });
      allMemories = allMemories.concat(memories);
    }

    // Score and filter by relevance
    const scoredMemories = allMemories.map(memory => ({
      ...memory,
      relevanceScore: this.calculateRelevanceScore(memory, searchTerms, categories)
    }));

    // Sort by relevance and return top results
    return scoredMemories
      .filter(m => m.relevanceScore > 0)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, limit);
  }

  /**
   * Extract keywords from natural language query
   */
  private extractKeywords(query: string): string[] {
    // Common Hedera/VERA terms to prioritize
    const hederaTerms = [
      'hts', 'hcs', 'token', 'topic', 'account', 'contract',
      'defi', 'saucerswap', 'bonzo', 'hbarx', 'staking',
      'carbon', 'dovu', 'guardian', 'audit',
      'payment', 'escrow', 'x402', 'settlement',
      'agent', 'swarm', 'lattice', 'orchestrator',
      'bridge', 'evm', 'solidity', 'hardhat'
    ];

    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Prioritize Hedera terms
    const priorityTerms = words.filter(w => hederaTerms.includes(w));
    const otherTerms = words.filter(w => !hederaTerms.includes(w));

    return [...priorityTerms, ...otherTerms].slice(0, 10);
  }

  /**
   * Calculate relevance score for a memory
   */
  private calculateRelevanceScore(
    memory: RetrievedMemory,
    searchTerms: string[],
    categories: string[]
  ): number {
    let score = 0;
    const content = JSON.stringify(memory.content).toLowerCase();

    // Keyword matching
    for (const term of searchTerms) {
      if (content.includes(term.toLowerCase())) {
        score += 10;
        // Higher score for exact matches in specific fields
        if (memory.content?.category?.toLowerCase().includes(term)) {
          score += 5;
        }
        if (memory.content?.user_query?.toLowerCase().includes(term)) {
          score += 5;
        }
      }
    }

    // Category matching
    for (const category of categories) {
      if (memory.content?.category === category) {
        score += 15;
      }
    }

    // Recency boost (exponential decay over 7 days)
    const ageHours = (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60);
    const recencyBoost = Math.exp(-ageHours / (7 * 24)) * 5;
    score += recencyBoost;

    // Success bonus
    if (memory.content?.success === true) {
      score += 3;
    }

    return score;
  }

  /**
   * Get all learning topic IDs
   */
  private getLearningTopicIds(): string[] {
    const topics: string[] = [];
    
    // Learning topics
    if (process.env.VERA_LEARNING_TOPIC_ID) {
      topics.push(process.env.VERA_LEARNING_TOPIC_ID);
    }
    if (process.env.VERA_METRICS_TOPIC_ID) {
      topics.push(process.env.VERA_METRICS_TOPIC_ID);
    }
    
    // Orchestration topics
    if (config.HCS_TOPIC_ID) topics.push(config.HCS_TOPIC_ID);
    if (config.VERA_REGISTRY_TOPIC_ID) topics.push(config.VERA_REGISTRY_TOPIC_ID);
    if (config.VERA_TASK_TOPIC_ID) topics.push(config.VERA_TASK_TOPIC_ID);
    if (config.VERA_RESULT_TOPIC_ID) topics.push(config.VERA_RESULT_TOPIC_ID);
    if (config.VERA_AUDIT_TOPIC_ID) topics.push(config.VERA_AUDIT_TOPIC_ID);
    
    // Swarm topics
    if (config.VERA_SWARM_STATE_TOPIC_ID) topics.push(config.VERA_SWARM_STATE_TOPIC_ID);
    if (config.VERA_SWARM_CONSENSUS_TOPIC_ID) topics.push(config.VERA_SWARM_CONSENSUS_TOPIC_ID);
    
    return topics.filter(Boolean);
  }

  /**
   * Get brain statistics - total messages, oldest/newest, etc.
   */
  async getBrainStats(): Promise<BrainStats> {
    const topicIds = this.getLearningTopicIds();
    
    let totalMessages = 0;
    let oldestMessage: Date | null = null;
    let newestMessage: Date | null = null;
    const messagesByTopic: Record<string, number> = {};
    const knowledgeCategories = new Set<string>();

    for (const topicId of topicIds) {
      try {
        // Query single message to get topic info
        const messages = await this.queryTopicMessages(topicId, { limit: 1 });
        messagesByTopic[topicId] = 0; // Will be updated

        // Try to get message count via mirror node
        const url = `${this.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=1&order=asc`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        
        if (response.ok) {
          const data: MirrorNodeResponse = await response.json();
          if (data.messages && data.messages.length > 0) {
            const firstMsg = data.messages[0];
            const firstTime = new Date(parseInt(firstMsg.consensus_timestamp) / 1000000);
            
            if (!oldestMessage || firstTime < oldestMessage) {
              oldestMessage = firstTime;
            }
          }
        }

        // Get newest
        const newestMessages = await this.queryTopicMessages(topicId, { limit: 100 });
        messagesByTopic[topicId] = newestMessages.length;
        totalMessages += newestMessages.length;

        for (const msg of newestMessages) {
          if (msg.content?.category) {
            knowledgeCategories.add(msg.content.category);
          }
          if (msg.content?.category_performance) {
            Object.keys(msg.content.category_performance).forEach(c => knowledgeCategories.add(c));
          }
        }

        if (newestMessages.length > 0) {
          const newest = newestMessages[0].timestamp;
          if (!newestMessage || newest > newestMessage) {
            newestMessage = newest;
          }
        }
      } catch (error) {
        logger.warn('HCSBrainRetrieval', { topicId, message: 'Failed to get topic stats' });
      }
    }

    return {
      totalMessages,
      topicsMonitored: topicIds.length,
      oldestMessage,
      newestMessage,
      messagesByTopic,
      knowledgeCategories: Array.from(knowledgeCategories)
    };
  }

  /**
   * Stream messages for large historical imports (100k+ items)
   * Uses pagination for efficient retrieval
   */
  async *streamHistoricalMessages(
    topicId: string,
    startTime?: Date,
    chunkSize: number = 100
  ): AsyncGenerator<RetrievedMemory[]> {
    let hasMore = true;
    let currentEndTime = startTime;
    let totalRetrieved = 0;

    while (hasMore && totalRetrieved < 100000) { // Safety limit
      const messages = await this.queryTopicMessages(topicId, {
        startTime: currentEndTime,
        endTime: new Date(),
        limit: chunkSize,
        order: 'asc'
      });

      if (messages.length === 0) {
        hasMore = false;
        break;
      }

      yield messages;
      totalRetrieved += messages.length;

      // Update cursor to after the last message
      const lastMessage = messages[messages.length - 1];
      currentEndTime = new Date(lastMessage.timestamp.getTime() + 1);

      // Rate limiting - be nice to mirror node
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('HCSBrainRetrieval', {
      topicId,
      totalRetrieved,
      message: 'Completed historical message streaming'
    });
  }

  /**
   * Quick query for recent memories (last hour)
   */
  async getRecentMemories(minutesBack: number = 60): Promise<RetrievedMemory[]> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - minutesBack * 60 * 1000);
    
    const topicIds = this.getLearningTopicIds();
    let allRecent: RetrievedMemory[] = [];

    for (const topicId of topicIds) {
      const memories = await this.queryTopicMessages(topicId, {
        startTime,
        endTime,
        limit: 100,
        order: 'desc'
      });
      allRecent = allRecent.concat(memories);
    }

    return allRecent.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

// Export singleton instance
export const hcsBrainRetrieval = new HCSBrainRetrieval();
export default hcsBrainRetrieval;
