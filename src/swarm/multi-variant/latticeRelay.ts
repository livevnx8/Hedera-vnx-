/**
 * Lattice Relay Core
 * 
 * Implements the HCS Topic Relay pattern for multi-variant swarm communication:
 * - Micro → Normal via micro topics (up direction)
 * - Normal → Macro via normal topics (up direction)  
 * - Macro → Normal via normal topics (down direction)
 * - Normal → Micro via micro topics (down direction)
 * 
 * Supports meet/join operations for lattice-based coordination
 */

import { Client, TopicMessageSubmitTransaction, TopicMessageQuery } from '@hashgraph/sdk';
import { EventEmitter } from 'events';
import { BaseSwarmAgent } from './baseSwarmAgent.js';
import { MicroAgent, StreamEvent } from './microAgent.js';
import { NormalAgent, Workflow } from './normalAgent.js';
import { MacroAgent, BusMessage } from './macroAgent.js';
import { HCSTopicInfrastructure, SwarmClass } from './hcsTopicInfrastructure.js';
import { logger } from '../../monitoring/logger.js';

export interface RelayMessage {
  id: string;
  source: string; // Agent ID
  sourceClass: SwarmClass;
  target: string; // Topic ID
  payload: any;
  timestamp: number;
  direction: 'up' | 'down';
  meetScore?: number;
  joinCoverage?: number;
}

export interface MeetOperation {
  agents: string[];
  constraints: string[];
  overlapScore: number;
  result: any;
}

export interface JoinOperation {
  agents: string[];
  coverage: number;
  aggregatedIntents: string[];
  result: any;
}

export class LatticeRelay extends EventEmitter {
  private client: Client;
  private topicInfrastructure: HCSTopicInfrastructure;
  private messageQueue: RelayMessage[] = [];
  private maxQueueSize: number = 10000;
  private flushIntervalMs: number = 100;
  private flushTimer: NodeJS.Timeout | null = null;
  private stats = {
    messagesUp: 0,
    messagesDown: 0,
    meetOperations: 0,
    joinOperations: 0,
    errors: 0
  };

  constructor(topicInfrastructure: HCSTopicInfrastructure) {
    super();
    this.topicInfrastructure = topicInfrastructure;
    this.initializeClient();
    this.startFlushLoop();
  }

  private initializeClient(): void {
    // Client initialized via config
    // In production, use proper Hedera client setup
    this.client = {} as Client; // Placeholder
  }

  /**
   * Route message from micro to normal (up direction)
   */
  async routeMicroToNormal(
    agent: MicroAgent, 
    events: StreamEvent[], 
    functionType: string
  ): Promise<string> {
    const topicId = this.topicInfrastructure.getOptimalTopic(
      'micro', 
      functionType, 
      'up',
      agent.getCurrentLoad()
    );

    const message: RelayMessage = {
      id: `relay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: agent.getId(),
      sourceClass: 'micro',
      target: topicId,
      payload: {
        events,
        eventCount: events.length,
        patterns: agent.getMicroMetrics().processedEvents
      },
      timestamp: Date.now(),
      direction: 'up'
    };

    this.queueMessage(message);
    this.stats.messagesUp++;

    logger.debug('LatticeRelay', {
      source: agent.getId(),
      target: topicId,
      eventCount: events.length,
      direction: 'up',
      message: 'Micro→Normal routed'
    });

    return topicId;
  }

  /**
   * Route message from normal to macro (up direction)
   */
  async routeNormalToMacro(
    agent: NormalAgent,
    workflow: Workflow,
    functionType: string
  ): Promise<string> {
    const topicId = this.topicInfrastructure.getOptimalTopic(
      'normal',
      functionType,
      'up',
      agent.getCurrentLoad()
    );

    const message: RelayMessage = {
      id: `relay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: agent.getId(),
      sourceClass: 'normal',
      target: topicId,
      payload: {
        workflow,
        stepsCompleted: workflow.steps.filter(s => s.status === 'completed').length,
        result: workflow.result
      },
      timestamp: Date.now(),
      direction: 'up'
    };

    this.queueMessage(message);
    this.stats.messagesUp++;

    logger.debug('LatticeRelay', {
      source: agent.getId(),
      target: topicId,
      workflowId: workflow.id,
      direction: 'up',
      message: 'Normal→Macro routed'
    });

    return topicId;
  }

  /**
   * Route message from macro to normal (down direction)
   */
  async routeMacroToNormal(
    agent: MacroAgent,
    busMessage: BusMessage,
    functionType: string
  ): Promise<string> {
    const topicId = this.topicInfrastructure.getOptimalTopic(
      'normal',
      functionType,
      'down',
      0.5 // Broadcast uses balanced distribution
    );

    const message: RelayMessage = {
      id: `relay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: agent.getId(),
      sourceClass: 'macro',
      target: topicId,
      payload: {
        busMessage,
        messagesRouted: agent.getMacroMetrics().messagesRouted,
        federatedState: agent.getFederatedState('global')
      },
      timestamp: Date.now(),
      direction: 'down'
    };

    this.queueMessage(message);
    this.stats.messagesDown++;

    logger.debug('LatticeRelay', {
      source: agent.getId(),
      target: topicId,
      messageId: busMessage.id,
      direction: 'down',
      message: 'Macro→Normal routed'
    });

    return topicId;
  }

  /**
   * Route message from normal to micro (down direction)
   */
  async routeNormalToMicro(
    agent: NormalAgent,
    task: any,
    functionType: string
  ): Promise<string> {
    const topicId = this.topicInfrastructure.getOptimalTopic(
      'micro',
      functionType,
      'down',
      0.5
    );

    const message: RelayMessage = {
      id: `relay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: agent.getId(),
      sourceClass: 'normal',
      target: topicId,
      payload: {
        task,
        queueDepth: agent.getNormalMetrics().queueSize
      },
      timestamp: Date.now(),
      direction: 'down'
    };

    this.queueMessage(message);
    this.stats.messagesDown++;

    logger.debug('LatticeRelay', {
      source: agent.getId(),
      target: topicId,
      taskType: task.type,
      direction: 'down',
      message: 'Normal→Micro routed'
    });

    return topicId;
  }

  /**
   * Execute meet operation (intersection) between agents
   */
  async executeMeet(agents: BaseSwarmAgent[]): Promise<MeetOperation> {
    if (agents.length < 2) {
      throw new Error('Meet requires at least 2 agents');
    }

    // Calculate meet between all pairs
    let totalOverlap = 0;
    const allConstraints: Set<string> = new Set();

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const meet = agents[i].calculateMeet(agents[j]);
        totalOverlap += meet.overlapScore;
        meet.constraints.forEach(c => allConstraints.add(c));
      }
    }

    const avgOverlap = totalOverlap / (agents.length * (agents.length - 1) / 2);

    // Create meet result
    const meet: MeetOperation = {
      agents: agents.map(a => a.getId()),
      constraints: Array.from(allConstraints),
      overlapScore: avgOverlap,
      result: {
        sharedIntent: agents[0]?.getIntent(),
        commonClass: agents.every(a => a.getSwarmClass() === agents[0].getSwarmClass())
          ? agents[0].getSwarmClass()
          : 'mixed',
        timestamp: Date.now()
      }
    };

    this.stats.meetOperations++;

    logger.info('LatticeRelay', {
      agentCount: agents.length,
      overlapScore: avgOverlap.toFixed(3),
      constraints: meet.constraints.length,
      message: 'Meet operation executed'
    });

    this.emit('meet', meet);
    return meet;
  }

  /**
   * Execute join operation (union) between agents
   */
  async executeJoin(agents: BaseSwarmAgent[]): Promise<JoinOperation> {
    if (agents.length < 2) {
      throw new Error('Join requires at least 2 agents');
    }

    // Calculate join between all pairs
    let totalCoverage = 0;
    const allIntents: Set<string> = new Set();

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const join = agents[i].calculateJoin(agents[j]);
        totalCoverage += join.coverage;
        join.aggregatedIntents.forEach(intent => {
          if (intent) allIntents.add(intent);
        });
      }
    }

    const avgCoverage = totalCoverage / (agents.length * (agents.length - 1) / 2);

    // Create join result
    const join: JoinOperation = {
      agents: agents.map(a => a.getId()),
      coverage: avgCoverage,
      aggregatedIntents: Array.from(allIntents),
      result: {
        agentCount: agents.length,
        classes: [...new Set(agents.map(a => a.getSwarmClass()))],
        roles: [...new Set(agents.map(a => a.getRole()))],
        timestamp: Date.now()
      }
    };

    this.stats.joinOperations++;

    logger.info('LatticeRelay', {
      agentCount: agents.length,
      coverage: avgCoverage.toFixed(3),
      intents: join.aggregatedIntents.length,
      message: 'Join operation executed'
    });

    this.emit('join', join);
    return join;
  }

  /**
   * Queue message for relay
   */
  private queueMessage(message: RelayMessage): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      // Remove oldest message
      this.messageQueue.shift();
      this.stats.errors++;
    }

    this.messageQueue.push(message);
  }

  /**
   * Start flush loop
   */
  private startFlushLoop(): void {
    this.flushTimer = setInterval(() => {
      this.flushMessages();
    }, this.flushIntervalMs);
  }

  /**
   * Flush messages to HCS
   */
  private async flushMessages(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    // Group messages by topic
    const byTopic: Map<string, RelayMessage[]> = new Map();
    
    for (const message of this.messageQueue) {
      const topicMessages = byTopic.get(message.target) || [];
      topicMessages.push(message);
      byTopic.set(message.target, topicMessages);
    }

    // Clear queue
    this.messageQueue = [];

    // Flush to HCS (in production, use actual HCS transactions)
    for (const [topicId, messages] of byTopic) {
      try {
        // In production:
        // const transaction = new TopicMessageSubmitTransaction()
        //   .setTopicId(topicId)
        //   .setMessage(JSON.stringify(messages));
        // await transaction.execute(this.client);

        logger.debug('LatticeRelay', {
          topicId,
          messageCount: messages.length,
          message: 'Messages flushed to HCS'
        });

        this.emit('flushed', { topicId, count: messages.length });

      } catch (error) {
        logger.error('LatticeRelay', {
          topicId,
          error: (error as Error).message,
          message: 'Failed to flush messages'
        });
        this.stats.errors++;
      }
    }
  }

  /**
   * Get relay statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.messageQueue.length,
      uptime: Date.now(), // In production, track actual uptime
      topicsConfigured: this.topicInfrastructure.getStatistics().totalTopics
    };
  }

  /**
   * Get HashScan links for all relay topics
   */
  getHashScanLinks(): Record<string, string> {
    return this.topicInfrastructure.getHashScanLinks();
  }

  /**
   * Shutdown relay
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    this.flushMessages().catch(() => {});

    logger.info('LatticeRelay', { message: 'Relay shutdown' });
  }
}
