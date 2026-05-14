/**
 * Vera Lattice Coordinator - Week 2 Implementation
 * Cross-topic intelligence and routing system
 */

import { EventEmitter } from 'events';
import { hederaMaster } from '../hedera/hederaMasterClass.js';

export interface LatticeTopic {
  id: number;
  name: string;
  topicId: string;
  layer: 'data' | 'memory' | 'system' | 'coordination';
  shard: string;
  emoji: string;
}

export interface CrossTopicMessage {
  type: string;
  sourceTopic: number;
  targetTopics?: number[];
  intent: string;
  payload: any;
  coherenceScore?: number;
  timestamp: number;
}

export interface RoutingDecision {
  messageType: string;
  intent: string;
  recommendedTopic: number;
  alternativeTopics?: number[];
  reason: string;
  confidence: number;
}

export class VeraLatticeCoordinator extends EventEmitter {
  private topics: Map<number, LatticeTopic> = new Map();
  private coordinationTopicId: string = '0.0.10409351'; // Fallback to existing
  private messageIndex: Map<string, { topic: number; sequence: string }[]> = new Map();
  private routingTable: Map<string, number> = new Map();

  constructor() {
    super();
    this.initializeRoutingTable();
  }

  private initializeRoutingTable(): void {
    // Intent-based routing rules
    this.routingTable.set('defi_research', 0);
    this.routingTable.set('carbon_credits', 1);
    this.routingTable.set('ai_agents', 2);
    this.routingTable.set('cross_reference', 3);
    this.routingTable.set('audit', 4);
    this.routingTable.set('knowledge', 5);
    this.routingTable.set('metrics', 6);
    this.routingTable.set('security', 7);
    this.routingTable.set('health', 8);
    this.routingTable.set('coordination', 9);
  }

  /**
   * Register a topic in the lattice
   */
  registerTopic(topic: LatticeTopic): void {
    this.topics.set(topic.id, topic);
    console.log(`✅ Registered topic ${topic.id}: ${topic.name} (${topic.topicId})`);
  }

  /**
   * Route message to appropriate topic based on intent
   */
  async routeMessage(messageType: string, intent: string, payload: any): Promise<RoutingDecision> {
    const recommendedTopic = this.routingTable.get(intent) || 0;
    const topic = this.topics.get(recommendedTopic);

    const decision: RoutingDecision = {
      messageType,
      intent,
      recommendedTopic,
      reason: `Intent "${intent}" matches topic ${topic?.name || 'default'}`,
      confidence: 0.85
    };

    // Find alternative topics in same layer
    const layer = topic?.layer || 'data';
    const alternatives = Array.from(this.topics.values())
      .filter(t => t.layer === layer && t.id !== recommendedTopic)
      .map(t => t.id);

    if (alternatives.length > 0) {
      decision.alternativeTopics = alternatives;
    }

    this.emit('routing_decision', decision);
    return decision;
  }

  /**
   * Submit message with cross-topic coordination
   */
  async submitCoordinatedMessage(
    messageType: string,
    intent: string,
    payload: any,
    options?: { crossReference?: boolean; priority?: number }
  ): Promise<{ decision: RoutingDecision; sequence?: string; coordinationSequence?: string }> {
    
    // Get routing decision
    const decision = await this.routeMessage(messageType, intent, payload);
    const topic = this.topics.get(decision.recommendedTopic);

    if (!topic) {
      throw new Error(`Topic ${decision.recommendedTopic} not registered`);
    }

    // Create cross-topic message
    const message: CrossTopicMessage = {
      type: messageType,
      sourceTopic: decision.recommendedTopic,
      intent,
      payload,
      timestamp: Date.now()
    };

    // Add cross-reference info if needed
    if (options?.crossReference) {
      message.targetTopics = decision.alternativeTopics;
      message.coherenceScore = this.calculateCoherence(intent);
    }

    // Submit to target topic with HIP-993 format
    let sequence: string | undefined;
    try {
      const result = await hederaMaster.submitMessage(topic.topicId, message, {
        maxChunkSize: 4096 // HIP-993 max
      });
      sequence = result.sequenceNumber.toString();

      console.log(`🔗 Submitted to ${topic.name}: Seq ${sequence}`);

      // Index the message
      if (sequence) {
        this.indexMessage(intent, decision.recommendedTopic, sequence);
      }

    } catch (error) {
      console.error(`❌ Failed to submit to ${topic.name}:`, error);
    }

    // Log to coordination topic if cross-referencing (HIP-993 format)
    let coordinationSequence: string | undefined;
    if (options?.crossReference) {
      try {
        const coordResult = await hederaMaster.submitMessage(this.coordinationTopicId, {
          type: 'cross_reference',
          source: { topic: decision.recommendedTopic, sequence },
          targets: decision.alternativeTopics?.map(tid => ({ topic: tid })),
          intent,
          coherence: message.coherenceScore,
          timestamp: Date.now()
        }, {
          maxChunkSize: 4096 // HIP-993 max
        });
        coordinationSequence = coordResult.sequenceNumber.toString();

        console.log(`🌐 Coordination logged: Seq ${coordinationSequence}`);
      } catch (error) {
        console.error('❌ Failed to log coordination:', error);
      }
    }

    return { decision, sequence, coordinationSequence };
  }

  /**
   * Query messages across topics by intent
   */
  async queryCrossTopic(intent: string, options?: { 
    timeWindow?: number; 
    includeRelated?: boolean;
  }): Promise<{ intent: string; matches: Array<{ topic: LatticeTopic; sequences: string[] }> }> {
    
    const results: Array<{ topic: LatticeTopic; sequences: string[] }> = [];
    
    // Get sequences for this intent from index
    const indexed = this.messageIndex.get(intent);
    if (indexed) {
      // Group by topic
      const byTopic = new Map<number, string[]>();
      for (const entry of indexed) {
        if (!byTopic.has(entry.topic)) {
          byTopic.set(entry.topic, []);
        }
        byTopic.get(entry.topic)!.push(entry.sequence);
      }

      // Build results
      for (const [topicId, sequences] of byTopic) {
        const topic = this.topics.get(topicId);
        if (topic) {
          results.push({ topic, sequences });
        }
      }
    }

    // Include related intents if requested
    if (options?.includeRelated) {
      const relatedIntents = this.findRelatedIntents(intent);
      for (const related of relatedIntents) {
        const relatedIndexed = this.messageIndex.get(related);
        if (relatedIndexed) {
          // Similar grouping logic...
        }
      }
    }

    return { intent, matches: results };
  }

  /**
   * Calculate coherence score for intent
   */
  private calculateCoherence(intent: string): number {
    // Simple coherence based on intent frequency in index
    const entries = this.messageIndex.get(intent);
    if (!entries || entries.length === 0) return 1.0;

    // More entries = higher coherence (up to a point)
    const baseCoherence = Math.min(0.5 + (entries.length * 0.05), 0.95);
    
    // Add some variation
    return Math.min(0.99, baseCoherence + (Math.random() * 0.1));
  }

  /**
   * Index a message for cross-topic queries
   */
  private indexMessage(intent: string, topic: number, sequence: string): void {
    if (!this.messageIndex.has(intent)) {
      this.messageIndex.set(intent, []);
    }
    this.messageIndex.get(intent)!.push({ topic, sequence });
  }

  /**
   * Find related intents (simple semantic similarity)
   */
  private findRelatedIntents(intent: string): string[] {
    const related: string[] = [];
    const intentWords = intent.toLowerCase().split('_');

    for (const [key] of this.messageIndex) {
      const keyWords = key.toLowerCase().split('_');
      const overlap = intentWords.filter(w => keyWords.includes(w));
      if (overlap.length > 0 && key !== intent) {
        related.push(key);
      }
    }

    return related.slice(0, 3); // Top 3 related
  }

  /**
   * Get lattice statistics
   */
  getStats(): any {
    return {
      registeredTopics: this.topics.size,
      coordinationTopic: this.coordinationTopicId,
      indexedIntents: this.messageIndex.size,
      totalIndexedMessages: Array.from(this.messageIndex.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      routingRules: this.routingTable.size
    };
  }

  /**
   * Meet operation: Find intersection of two topic intents
   */
  async meetTopics(topicA: number, topicB: number): Promise<{ overlap: string[]; score: number }> {
    const intentsA = this.getIntentsForTopic(topicA);
    const intentsB = this.getIntentsForTopic(topicB);
    
    const overlap = intentsA.filter(i => intentsB.includes(i));
    const score = overlap.length / Math.max(intentsA.length, intentsB.length);

    return { overlap, score };
  }

  /**
   * Join operation: Union of two topic intents
   */
  async joinTopics(topicA: number, topicB: number): Promise<{ union: string[]; coverage: number }> {
    const intentsA = this.getIntentsForTopic(topicA);
    const intentsB = this.getIntentsForTopic(topicB);
    
    const union = [...new Set([...intentsA, ...intentsB])];
    const coverage = union.length / (intentsA.length + intentsB.length);

    return { union, coverage };
  }

  private getIntentsForTopic(topicId: number): string[] {
    const intents: string[] = [];
    for (const [intent, entries] of this.messageIndex) {
      if (entries.some(e => e.topic === topicId)) {
        intents.push(intent);
      }
    }
    return intents;
  }
}

// Export singleton instance
export const latticeCoordinator = new VeraLatticeCoordinator();
