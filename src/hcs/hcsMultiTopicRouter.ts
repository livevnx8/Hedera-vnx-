/**
 * HCS v2 - Multi-Topic Message Routing
 * 
 * Advanced HCS integration with automatic topic discovery,
 * message prioritization, and intelligent routing
 */

import { Client, TopicMessageSubmitTransaction, TopicCreateTransaction, TopicId } from '@hashgraph/sdk';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface HCSTopic {
  id: string;
  topicId: string;
  name: string;
  domain: string;
  priority: number;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  status: 'active' | 'inactive' | 'error';
}

export interface HCSMessage {
  type: string;
  payload: any;
  priority: number;
  targetTopics: string[];
  timestamp: number;
  ttl?: number;
}

export interface RoutingRule {
  condition: (message: HCSMessage) => boolean;
  targetTopics: string[];
  priority: number;
}

export class HCSMultiTopicRouter extends EventEmitter {
  private client: Client;
  private topics: Map<string, HCSTopic> = new Map();
  private routingRules: RoutingRule[] = [];
  private messageQueue: Map<string, HCSMessage[]> = new Map();
  private retryQueue: HCSMessage[] = [];
  private isRunning = false;
  private processInterval: NodeJS.Timeout | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    super();
    this.client = client;
    this.initializeRoutingRules();
  }

  /**
   * Initialize the HCS router
   */
  async initialize(): Promise<void> {
    logger.info('HCSMultiTopicRouter', { message: 'Initializing HCS v2 router' });

    // Register default topics
    await this.registerDefaultTopics();

    // Start message processing
    this.startProcessing();

    // Start topic discovery
    this.startDiscovery();

    this.emit('initialized');
  }

  /**
   * Register default topics
   */
  private async registerDefaultTopics(): Promise<void> {
    const defaultTopics = [
      { id: 'core', topicId: '0.0.10409351', name: 'Core Coordination', domain: 'coordination' },
      { id: 'defi', topicId: '0.0.10412577', name: 'DeFi Analysis', domain: 'defi' },
      { id: 'energy', topicId: '0.0.10412579', name: 'Energy Auditing', domain: 'energy' },
      { id: 'security', topicId: '0.0.10412580', name: 'Security Monitoring', domain: 'security' },
      { id: 'bridge', topicId: '0.0.10412578', name: 'Cross-Chain Bridge', domain: 'bridge' },
      // FedEx Supply Chain Topics
      { id: 'fedex_route', topicId: process.env.FEDEX_ROUTE_TOPIC_ID || '0.0.0', name: 'FedEx Route Coordination', domain: 'logistics' },
      { id: 'fedex_pkg', topicId: process.env.FEDEX_PKG_TOPIC_ID || '0.0.0', name: 'FedEx Package Tracking', domain: 'logistics' },
      { id: 'fedex_chain', topicId: process.env.FEDEX_CHAIN_TOPIC_ID || '0.0.0', name: 'FedEx Supply Chain', domain: 'logistics' },
      { id: 'fedex_air', topicId: process.env.FEDEX_AIR_TOPIC_ID || '0.0.0', name: 'FedEx Air Transport', domain: 'logistics' },
      { id: 'fedex_ground', topicId: process.env.FEDEX_GROUND_TOPIC_ID || '0.0.0', name: 'FedEx Ground Transport', domain: 'logistics' },
      { id: 'fedex_intl', topicId: process.env.FEDEX_INTL_TOPIC_ID || '0.0.0', name: 'FedEx International', domain: 'logistics' },
      { id: 'fedex_opt', topicId: process.env.FEDEX_OPT_TOPIC_ID || '0.0.0', name: 'FedEx Route Optimization', domain: 'logistics' },
      { id: 'fedex_audit', topicId: process.env.FEDEX_AUDIT_TOPIC_ID || '0.0.0', name: 'FedEx Compliance Audit', domain: 'logistics' }
    ];

    for (const topic of defaultTopics) {
      this.topics.set(topic.id, {
        ...topic,
        priority: 1,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        status: 'active'
      });
    }

    logger.info('HCSMultiTopicRouter', { 
      topics: this.topics.size,
      message: 'Default topics registered' 
    });
  }

  /**
   * Initialize routing rules
   */
  private initializeRoutingRules(): void {
    // High priority messages
    this.routingRules.push({
      condition: (msg) => msg.priority >= 8,
      targetTopics: ['core', 'security'],
      priority: 10
    });

    // DeFi messages
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('defi_'),
      targetTopics: ['defi', 'core'],
      priority: 5
    });

    // Energy messages
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('energy_'),
      targetTopics: ['energy', 'core'],
      priority: 5
    });

    // Security messages
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('security_') || msg.type.includes('threat'),
      targetTopics: ['security', 'core'],
      priority: 8
    });

    // FedEx Supply Chain messages
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('fedex_') || msg.type.startsWith('route_'),
      targetTopics: ['fedex_route', 'fedex_audit', 'core'],
      priority: 7
    });

    // FedEx Package tracking
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('package_') || msg.type.startsWith('tracking_'),
      targetTopics: ['fedex_pkg', 'fedex_route', 'core'],
      priority: 6
    });

    // FedEx Optimization messages
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('optimize_') || msg.type.startsWith('recommend_'),
      targetTopics: ['fedex_opt', 'fedex_route', 'core'],
      priority: 4
    });

    // FedEx Compliance/Audit messages
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('audit_') || msg.type.startsWith('compliance_'),
      targetTopics: ['fedex_audit', 'fedex_chain', 'core'],
      priority: 9
    });

    // FedEx Air transport
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('air_') || msg.payload?.transportMode === 'air',
      targetTopics: ['fedex_air', 'fedex_route', 'core'],
      priority: 6
    });

    // FedEx Ground transport
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('ground_') || msg.payload?.transportMode === 'ground',
      targetTopics: ['fedex_ground', 'fedex_route', 'core'],
      priority: 6
    });

    // FedEx International
    this.routingRules.push({
      condition: (msg) => msg.type.startsWith('intl_') || msg.type.startsWith('customs_') || msg.payload?.isInternational,
      targetTopics: ['fedex_intl', 'fedex_chain', 'fedex_audit', 'core'],
      priority: 7
    });

    // Default routing
    this.routingRules.push({
      condition: () => true,
      targetTopics: ['core'],
      priority: 1
    });
  }

  /**
   * Route message to appropriate topics
   */
  async routeMessage(message: Omit<HCSMessage, 'timestamp'>): Promise<string[]> {
    const fullMessage: HCSMessage = {
      ...message,
      timestamp: Date.now()
    };

    // Find matching routing rules
    const matchingRules = this.routingRules
      .filter(rule => rule.condition(fullMessage))
      .sort((a, b) => b.priority - a.priority);

    // Collect target topics
    const targetTopics = new Set<string>();
    for (const rule of matchingRules) {
      for (const topicId of rule.targetTopics) {
        targetTopics.add(topicId);
      }
    }

    // If message specifies target topics, use those
    if (message.targetTopics && message.targetTopics.length > 0) {
      for (const topicId of message.targetTopics) {
        targetTopics.add(topicId);
      }
    }

    const topicIds = Array.from(targetTopics);

    logger.debug('HCSMultiTopicRouter', {
      messageType: message.type,
      targetTopics: topicIds,
      message: 'Message routed'
    });

    // Queue for submission
    for (const topicId of topicIds) {
      if (!this.messageQueue.has(topicId)) {
        this.messageQueue.set(topicId, []);
      }
      this.messageQueue.get(topicId)!.push(fullMessage);
    }

    return topicIds;
  }

  /**
   * Submit message to specific topic
   */
  async submitToTopic(topicId: string, message: HCSMessage): Promise<boolean> {
    const topic = this.topics.get(topicId);
    if (!topic) {
      logger.warn('HCSMultiTopicRouter', { topicId, message: 'Unknown topic' });
      return false;
    }

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topic.topicId))
        .setMessage(JSON.stringify({
          type: message.type,
          payload: message.payload,
          priority: message.priority,
          timestamp: message.timestamp
        }))
        .execute(this.client);

      const record = await tx.getRecord(this.client);
      const sequence = record.receipt.topicSequenceNumber?.toString();

      // Update topic stats
      topic.lastActivity = Date.now();
      topic.messageCount++;

      logger.debug('HCSMultiTopicRouter', {
        topicId: topic.topicId,
        sequence,
        messageType: message.type,
        message: 'Message submitted'
      });

      this.emit('message_submitted', {
        topicId: topic.topicId,
        sequence,
        message
      });

      return true;
    } catch (error) {
      logger.error('HCSMultiTopicRouter', {
        topicId: topic.topicId,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to submit message'
      });

      // Add to retry queue
      this.retryQueue.push(message);
      topic.status = 'error';

      return false;
    }
  }

  /**
   * Create new topic
   */
  async createTopic(name: string, domain: string): Promise<HCSTopic | null> {
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(`Vera: ${name}`)
        .setAdminKey(this.client.operatorPublicKey!)
        .execute(this.client);

      const record = await tx.getRecord(this.client);
      const topicId = record.receipt.topicId!.toString();

      const topic: HCSTopic = {
        id: `auto-${Date.now()}`,
        topicId,
        name,
        domain,
        priority: 1,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        status: 'active'
      };

      this.topics.set(topic.id, topic);

      logger.info('HCSMultiTopicRouter', {
        topicId,
        name,
        message: 'New topic created'
      });

      this.emit('topic_created', topic);

      return topic;
    } catch (error) {
      logger.error('HCSMultiTopicRouter', {
        name,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to create topic'
      });

      return null;
    }
  }

  /**
   * Discover topics automatically
   */
  async discoverTopics(): Promise<void> {
    logger.debug('HCSMultiTopicRouter', { message: 'Running topic discovery' });

    // In production, this would:
    // 1. Query mirror node for topics with Vera memo
    // 2. Check lattice node advertisements
    // 3. Validate topic health

    // Simulate discovery
    const discoveredTopics = [
      { topicId: `0.0.${Math.floor(Math.random() * 1000000) + 10000000}`, name: 'Auto-discovered', domain: 'auto' }
    ];

    for (const topic of discoveredTopics) {
      // Check if already known
      const exists = Array.from(this.topics.values())
        .some(t => t.topicId === topic.topicId);

      if (!exists) {
        const newTopic: HCSTopic = {
          id: `discovered-${Date.now()}`,
          topicId: topic.topicId,
          name: topic.name,
          domain: topic.domain,
          priority: 1,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0,
          status: 'active'
        };

        this.topics.set(newTopic.id, newTopic);

        logger.info('HCSMultiTopicRouter', {
          topicId: topic.topicId,
          message: 'Topic discovered'
        });

        this.emit('topic_discovered', newTopic);
      }
    }
  }

  /**
   * Start message processing loop
   */
  private startProcessing(): void {
    this.isRunning = true;

    this.processInterval = setInterval(async () => {
      await this.processQueues();
    }, 100);

    logger.info('HCSMultiTopicRouter', { message: 'Message processing started' });
  }

  /**
   * Process message queues
   */
  private async processQueues(): Promise<void> {
    // Process main queues
    for (const [topicId, messages] of Array.from(this.messageQueue)) {
      // Sort by priority (high first)
      messages.sort((a, b) => b.priority - a.priority);

      // Process batch
      const batch = messages.splice(0, 10);
      for (const message of batch) {
        await this.submitToTopic(topicId, message);
      }

      // If queue still has messages, they stay for next iteration
      if (messages.length === 0) {
        this.messageQueue.delete(topicId);
      }
    }

    // Process retry queue
    if (this.retryQueue.length > 0) {
      const retryBatch = this.retryQueue.splice(0, 5);
      for (const message of retryBatch) {
        // Decrease priority to prevent infinite retries
        message.priority = Math.max(1, message.priority - 1);

        if (message.ttl && message.ttl <= 0) {
          logger.warn('HCSMultiTopicRouter', {
            messageType: message.type,
            message: 'Message expired after retries'
          });
          continue;
        }

        // Re-route with reduced TTL
        await this.routeMessage({
          ...message,
          ttl: (message.ttl || 5) - 1
        });
      }
    }
  }

  /**
   * Start topic discovery loop
   */
  private startDiscovery(): void {
    this.discoveryInterval = setInterval(async () => {
      await this.discoverTopics();
    }, 60000); // Discover every minute

    logger.info('HCSMultiTopicRouter', { message: 'Topic discovery started' });
  }

  /**
   * Get topic statistics
   */
  getTopicStats(topicId: string): any {
    const topic = this.topics.get(topicId);
    if (!topic) return null;

    return {
      id: topic.id,
      topicId: topic.topicId,
      name: topic.name,
      domain: topic.domain,
      messageCount: topic.messageCount,
      lastActivity: topic.lastActivity,
      status: topic.status
    };
  }

  /**
   * Get all topics
   */
  getTopics(): HCSTopic[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get router statistics
   */
  getStats(): any {
    return {
      topics: this.topics.size,
      routingRules: this.routingRules.length,
      messageQueues: this.messageQueue.size,
      retryQueueSize: this.retryQueue.length,
      totalMessages: Array.from(this.topics.values())
        .reduce((sum, t) => sum + t.messageCount, 0)
    };
  }

  /**
   * Stop the router
   */
  stop(): void {
    this.isRunning = false;

    if (this.processInterval) {
      clearInterval(this.processInterval);
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    logger.info('HCSMultiTopicRouter', { message: 'Router stopped' });
    this.emit('stopped');
  }
}

export default HCSMultiTopicRouter;
