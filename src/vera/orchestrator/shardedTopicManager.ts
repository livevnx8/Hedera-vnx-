/**
 * Vera Sharded Topic Manager
 * Distributes HCS messages across 50 topics for linear scalability
 */

import { Client, TopicCreateTransaction } from '@hashgraph/sdk';
import { createHash } from 'crypto';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';

export class ShardedTopicManager {
  private topics: Map<number, string> = new Map();
  private client: Client;
  private shardCount: number = 50;

  constructor(client: Client, shardCount: number = 50) {
    this.client = client;
    this.shardCount = shardCount;
  }

  /**
   * Initialize 50 sharded topics for HCS distribution
   */
  async initializeTopics(): Promise<void> {
    console.log(`🔧 Initializing ${this.shardCount} sharded HCS topics...`);

    for (let i = 0; i < this.shardCount; i++) {
      try {
        // Check if topic already exists in environment
        const envTopicId = process.env[`VERA_HCS_SHARD_${i}_TOPIC_ID`];
        
        if (envTopicId) {
          this.topics.set(i, envTopicId);
          console.log(`  ✓ Shard ${i}: Using existing topic ${envTopicId}`);
        } else {
          // Create new topic
          const tx = await new TopicCreateTransaction()
            .setTopicMemo(`Vera HCS Shard ${i} - 5000 Agent Distribution`)
            .setSubmitKey(this.client.operatorPublicKey!)
            .execute(this.client);

          const receipt = await tx.getReceipt(this.client);
          const topicId = receipt.topicId!.toString();

          this.topics.set(i, topicId);
          console.log(`  ✓ Shard ${i}: Created topic ${topicId}`);
        }
      } catch (error) {
        console.error(`  ✗ Shard ${i}: Failed - ${error}`);
        throw error;
      }
    }

    console.log(`✅ All ${this.shardCount} sharded topics ready`);
  }

  /**
   * Get topic for agent using consistent hashing
   */
  getTopicForAgent(agentId: string): string {
    const hash = this.hashAgentId(agentId);
    const shardIndex = hash % this.shardCount;
    const topicId = this.topics.get(shardIndex);

    if (!topicId) {
      throw new Error(`No topic found for shard ${shardIndex}`);
    }

    return topicId;
  }

  /**
   * Submit message to appropriate shard
   */
  async submitMessage(agentId: string, message: unknown): Promise<string> {
    const topicId = this.getTopicForAgent(agentId);
    const payload = {
      agentId,
      timestamp: Date.now(),
      data: message,
    };

    // Submit via hederaMaster with HIP-993 wrapper
    const result = await hederaMaster.submitMessage(topicId, payload, {
      maxChunkSize: 4096
    });

    return result.sequenceNumber.toString();
  }

  /**
   * Hash agent ID to determine shard
   */
  private hashAgentId(agentId: string): number {
    const hash = createHash('sha256').update(agentId).digest();
    return hash.readUInt32BE(0) % this.shardCount;
  }

  /**
   * Get all topic IDs
   */
  getAllTopics(): string[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    shardCount: number;
    topicsReady: number;
    topics: Map<number, string>;
  } {
    return {
      shardCount: this.shardCount,
      topicsReady: this.topics.size,
      topics: this.topics,
    };
  }
}

/**
 * Consistent Hashing Router for O(1) agent lookup
 */
export class ConsistentHashRouter {
  private ring: Map<number, string> = new Map();
  private virtualNodes: number = 10;
  private sortedHashes: number[] = [];

  /**
   * Add agent to hash ring with virtual nodes
   */
  addAgent(agentId: string): void {
    // Create virtual nodes for better distribution
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hash(`${agentId}:${i}`);
      this.ring.set(hash, agentId);
    }

    // Resort hashes
    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Remove agent from hash ring
   */
  removeAgent(agentId: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hash(`${agentId}:${i}`);
      this.ring.delete(hash);
    }

    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Get agent for task - O(log n) with binary search
   */
  getAgentForTask(taskId: string): string | null {
    if (this.ring.size === 0) return null;

    const hash = this.hash(taskId);
    
    // Binary search for nearest hash
    let left = 0;
    let right = this.sortedHashes.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedHashes[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Wrap around if needed
    const targetHash = this.sortedHashes[left] || this.sortedHashes[0];
    return this.ring.get(targetHash) || null;
  }

  /**
   * Get multiple candidate agents for redundancy
   */
  getAgentCandidates(taskId: string, count: number = 3): string[] {
    const candidates: string[] = [];
    let hash = this.hash(taskId);

    while (candidates.length < count && candidates.length < this.ring.size / this.virtualNodes) {
      // Find next agent
      for (const h of this.sortedHashes) {
        if (h >= hash) {
          const agent = this.ring.get(h);
          if (agent && !candidates.includes(agent)) {
            candidates.push(agent);
            if (candidates.length >= count) break;
          }
        }
      }

      // Wrap around
      if (candidates.length < count) {
        hash = 0;
      } else {
        break;
      }
    }

    return candidates;
  }

  /**
   * Get ring statistics
   */
  getStats(): {
    totalVirtualNodes: number;
    uniqueAgents: number;
    ringDistribution: number[];
  } {
    const uniqueAgents = new Set(this.ring.values());
    return {
      totalVirtualNodes: this.ring.size,
      uniqueAgents: uniqueAgents.size,
      ringDistribution: this.sortedHashes,
    };
  }

  /**
   * Simple hash function (murmur-like)
   */
  private hash(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = Math.imul(31, h) + key.charCodeAt(i) | 0;
    }
    return Math.abs(h);
  }
}

// Export singleton instance
export const shardedTopicManager = new ShardedTopicManager(
  Client.forMainnet(),
  50
);

export const consistentHashRouter = new ConsistentHashRouter();
