/**
 * HCS Topic Infrastructure for Multi-Variant Swarm Architecture
 * 
 * Manages hierarchical topic structure:
 * - Micro topics (high-frequency, short TTL)
 * - Normal topics (medium-frequency, medium TTL)  
 * - Macro topics (low-frequency, long TTL)
 */

import { Client, TopicCreateTransaction, TopicInfoQuery } from '@hashgraph/sdk';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

export type SwarmClass = 'micro' | 'normal' | 'macro';

export interface TopicConfig {
  id: string;
  swarmClass: SwarmClass;
  function: string;
  shardId: number;
  direction: 'up' | 'down';
  createdAt: number;
  messageCount: number;
  lastActivity: number;
}

export interface TopicHierarchyConfig {
  micro: {
    shardCount: number;
    retentionHours: number;
    maxMessageSize: number;
    functions: string[];
  };
  normal: {
    shardCount: number;
    retentionHours: number;
    maxMessageSize: number;
    functions: string[];
  };
  macro: {
    shardCount: number;
    retentionHours: number;
    maxMessageSize: number;
    functions: string[];
  };
}

export const DEFAULT_HIERARCHY: TopicHierarchyConfig = {
  micro: {
    shardCount: 100,
    retentionHours: 24,
    maxMessageSize: 500, // bytes
    functions: ['hcs', 'verification', 'streaming', 'iot', 'price']
  },
  normal: {
    shardCount: 20,
    retentionHours: 168, // 7 days
    maxMessageSize: 2048, // 2KB
    functions: ['processing', 'workflow', 'analysis', 'batch']
  },
  macro: {
    shardCount: 5,
    retentionHours: 720, // 30 days
    maxMessageSize: 10240, // 10KB
    functions: ['bus', 'coordination', 'federation', 'global']
  }
};

export class HCSTopicInfrastructure {
  private client: Client;
  private topics: Map<string, TopicConfig> = new Map();
  private config: TopicHierarchyConfig;

  constructor(hierarchyConfig: TopicHierarchyConfig = DEFAULT_HIERARCHY) {
    this.config = hierarchyConfig;
    this.client = this.initializeClient();
  }

  private initializeClient(): Client {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      // Client initialization handled by config
    }
    
    return client;
  }

  /**
   * Generate topic ID from components
   */
  generateTopicId(swarmClass: SwarmClass, functionType: string, shardId: number, direction: 'up' | 'down'): string {
    return `${swarmClass}.${functionType}.${shardId.toString().padStart(3, '0')}.${direction}`;
  }

  /**
   * Parse topic ID into components
   */
  parseTopicId(topicId: string): { swarmClass: SwarmClass; function: string; shardId: number; direction: 'up' | 'down' } | null {
    const parts = topicId.split('.');
    if (parts.length !== 4) return null;
    
    const [swarmClass, func, shard, direction] = parts;
    if (!['micro', 'normal', 'macro'].includes(swarmClass)) return null;
    if (!['up', 'down'].includes(direction)) return null;
    
    return {
      swarmClass: swarmClass as SwarmClass,
      function: func,
      shardId: parseInt(shard),
      direction: direction as 'up' | 'down'
    };
  }

  /**
   * Get topic configuration for a swarm class
   */
  getTopicConfig(swarmClass: SwarmClass): TopicHierarchyConfig[SwarmClass] {
    return this.config[swarmClass];
  }

  /**
   * Provision a complete topic hierarchy
   */
  async provisionHierarchy(): Promise<Map<string, TopicConfig>> {
    logger.info('HCSTopicInfrastructure', { message: 'Provisioning HCS topic hierarchy...' });
    
    const provisioned = new Map<string, TopicConfig>();

    // Provision micro topics
    for (const func of this.config.micro.functions) {
      for (let shard = 0; shard < this.config.micro.shardCount; shard++) {
        for (const direction of ['up', 'down'] as const) {
          const topicId = this.generateTopicId('micro', func, shard, direction);
          // In production, create actual HCS topics
          // For now, create config entries
          provisioned.set(topicId, {
            id: topicId,
            swarmClass: 'micro',
            function: func,
            shardId: shard,
            direction,
            createdAt: Date.now(),
            messageCount: 0,
            lastActivity: Date.now()
          });
        }
      }
    }

    // Provision normal topics
    for (const func of this.config.normal.functions) {
      for (let shard = 0; shard < this.config.normal.shardCount; shard++) {
        for (const direction of ['up', 'down'] as const) {
          const topicId = this.generateTopicId('normal', func, shard, direction);
          provisioned.set(topicId, {
            id: topicId,
            swarmClass: 'normal',
            function: func,
            shardId: shard,
            direction,
            createdAt: Date.now(),
            messageCount: 0,
            lastActivity: Date.now()
          });
        }
      }
    }

    // Provision macro topics
    for (const func of this.config.macro.functions) {
      for (let shard = 0; shard < this.config.macro.shardCount; shard++) {
        for (const direction of ['up', 'down'] as const) {
          const topicId = this.generateTopicId('macro', func, shard, direction);
          provisioned.set(topicId, {
            id: topicId,
            swarmClass: 'macro',
            function: func,
            shardId: shard,
            direction,
            createdAt: Date.now(),
            messageCount: 0,
            lastActivity: Date.now()
          });
        }
      }
    }

    this.topics = provisioned;
    
    logger.info('HCSTopicInfrastructure', {
      microTopics: this.config.micro.functions.length * this.config.micro.shardCount * 2,
      normalTopics: this.config.normal.functions.length * this.config.normal.shardCount * 2,
      macroTopics: this.config.macro.functions.length * this.config.macro.shardCount * 2,
      message: 'HCS topic hierarchy provisioned'
    });

    return provisioned;
  }

  /**
   * Get optimal topic for a message
   */
  getOptimalTopic(swarmClass: SwarmClass, functionType: string, direction: 'up' | 'down', loadFactor: number = 0.5): string {
    const config = this.config[swarmClass];
    
    // Select shard based on load factor (simple round-robin with load balancing)
    const shardId = Math.floor(loadFactor * config.shardCount) % config.shardCount;
    
    return this.generateTopicId(swarmClass, functionType, shardId, direction);
  }

  /**
   * Get all topics for a swarm class
   */
  getTopicsByClass(swarmClass: SwarmClass): TopicConfig[] {
    return Array.from(this.topics.values()).filter(t => t.swarmClass === swarmClass);
  }

  /**
   * Get topics for a specific function
   */
  getTopicsByFunction(functionType: string): TopicConfig[] {
    return Array.from(this.topics.values()).filter(t => t.function === functionType);
  }

  /**
   * Get topic statistics
   */
  getStatistics() {
    const stats = {
      totalTopics: this.topics.size,
      byClass: {
        micro: this.getTopicsByClass('micro').length,
        normal: this.getTopicsByClass('normal').length,
        macro: this.getTopicsByClass('macro').length
      },
      byFunction: {} as Record<string, number>
    };

    // Count by function
    for (const topic of this.topics.values()) {
      stats.byFunction[topic.function] = (stats.byFunction[topic.function] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get HashScan URLs for all topics
   */
  getHashScanLinks(): Record<string, string> {
    const links: Record<string, string> = {};
    
    // In production, these would be actual topic IDs
    // For now, return placeholder URLs showing the structure
    for (const topic of this.topics.values()) {
      links[topic.id] = `https://hashscan.io/mainnet/topic/[${topic.id}]`;
    }
    
    return links;
  }
}

// Export singleton
export const hcsTopicInfrastructure = new HCSTopicInfrastructure();
