/**
 * Macro Swarm Agent - Bus Layer
 * 
 * Specialized for cross-application coordination and data bus operations
 * - 40% Tier-1 Executors (data carriers)
 * - 35% Tier-2 Analysts (cross-domain aggregators)
 * - 25% Tier-3 Planners (system-wide orchestrators)
 */

import { BaseSwarmAgent, AgentConfig, Task } from './baseSwarmAgent.js';
import { logger } from '../../monitoring/logger.js';

export interface BusMessage {
  id: string;
  source: string;
  destination: string;
  payload: any;
  priority: number;
  timestamp: number;
  ttl: number; // Time to live in seconds
  routing: string[]; // Hops taken
}

export interface FederatedState {
  region: string;
  timestamp: number;
  consensus: Map<string, any>;
  participants: string[];
  proof: string;
}

export class MacroAgent extends BaseSwarmAgent {
  private busQueue: BusMessage[] = [];
  private federatedStates: Map<string, FederatedState> = new Map();
  private regionalPeers: string[] = [];
  private maxBusQueueSize: number = 10000;
  private busFlushIntervalMs: number = 5000; // 5 second batches
  private busTimer: NodeJS.Timeout | null = null;
  private messagesRouted: number = 0;
  private consensusRounds: number = 0;

  constructor(config: AgentConfig) {
    super({
      ...config,
      swarmClass: 'macro',
      timeoutMs: 5000, // 5 second timeout for bus operations
      maxConcurrentTasks: 3 // Lower concurrency, higher complexity
    });

    this.startBusLoop();
  }

  /**
   * Execute task based on role
   */
  protected async executeTask(task: Task): Promise<void> {
    const startTime = Date.now();

    try {
      switch (this.config.role) {
        case 'executor':
          await this.executeBusTask(task);
          break;
        case 'analyst':
          await this.executeFederationTask(task);
          break;
        case 'planner':
          await this.executeCoordinationTask(task);
          break;
      }

      const duration = Date.now() - startTime;
      this.handleTaskCompletion(task, { duration, success: true });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Tier-1: Execute bus task (data carrier)
   */
  private async executeBusTask(task: Task): Promise<void> {
    const message = task.payload as BusMessage;
    
    if (!message || !message.destination) {
      throw new Error('Invalid bus message');
    }

    // Route message through bus
    await this.routeMessage(message);

    logger.debug('MacroAgent', {
      agentId: this.config.id,
      messageId: message.id,
      destination: message.destination,
      priority: message.priority,
      message: 'Bus task executed'
    });
  }

  /**
   * Route a bus message
   */
  private async routeMessage(message: BusMessage): Promise<void> {
    // Add to routing history
    message.routing.push(this.config.id);

    // Check TTL
    if (Date.now() - message.timestamp > message.ttl * 1000) {
      logger.warn('MacroAgent', {
        agentId: this.config.id,
        messageId: message.id,
        message: 'Message TTL expired'
      });
      return;
    }

    // Simulate routing
    await new Promise(resolve => setTimeout(resolve, 10));

    this.messagesRouted++;

    // In production, publish to appropriate HCS topic
  }

  /**
   * Tier-2: Execute federation task (cross-domain aggregation)
   */
  private async executeFederationTask(task: Task): Promise<void> {
    const { region, states, consensusType } = task.payload;
    
    if (!states || !Array.isArray(states)) {
      throw new Error('Invalid federation states');
    }

    // Perform federated consensus
    const consensus = await this.performConsensus(region, states, consensusType);

    // Store federated state
    this.federatedStates.set(region, consensus);

    logger.info('MacroAgent', {
      agentId: this.config.id,
      region,
      consensusType,
      participantCount: consensus.participants.length,
      message: 'Federation task executed'
    });

    task.payload.result = consensus;
  }

  /**
   * Perform federated consensus
   */
  private async performConsensus(
    region: string, 
    states: any[], 
    consensusType: string
  ): Promise<FederatedState> {
    
    let consensusValue: any;
    let confidence: number = 0;

    switch (consensusType) {
      case 'majority':
        // Simple majority vote
        const votes = new Map<string, number>();
        states.forEach(state => {
          const key = JSON.stringify(state.value);
          votes.set(key, (votes.get(key) || 0) + 1);
        });
        
        let maxVotes = 0;
        let winner = '';
        for (const [key, count] of votes) {
          if (count > maxVotes) {
            maxVotes = count;
            winner = key;
          }
        }
        
        consensusValue = JSON.parse(winner);
        confidence = maxVotes / states.length;
        break;

      case 'average':
        // Average of numeric values
        const numericStates = states.filter(s => typeof s.value === 'number');
        const sum = numericStates.reduce((acc, s) => acc + s.value, 0);
        consensusValue = sum / numericStates.length;
        confidence = numericStates.length / states.length;
        break;

      case 'intersection':
        // Meet operation - common elements
        const meet = this.performMeetConsensus(states.map(s => s.value));
        consensusValue = meet.common;
        confidence = meet.score;
        break;

      default:
        consensusValue = states[0]?.value;
        confidence = 1 / states.length;
    }

    this.consensusRounds++;

    return {
      region,
      timestamp: Date.now(),
      consensus: new Map([['value', consensusValue], ['confidence', confidence]]),
      participants: states.map(s => s.source),
      proof: `consensus-${region}-${Date.now()}`
    };
  }

  /**
   * Perform meet consensus (intersection)
   */
  private performMeetConsensus(values: any[]): { score: number; common: any[] } {
    if (values.length === 0) return { score: 0, common: [] };

    // Find common properties/elements
    const first = values[0];
    let common: any[] = [];

    if (Array.isArray(first)) {
      const firstSet = new Set(first);
      common = values.slice(1).reduce((acc, curr) => {
        const currSet = new Set(curr);
        return acc.filter(x => currSet.has(x));
      }, Array.from(firstSet));
    } else if (typeof first === 'object') {
      const keys = Object.keys(first);
      common = keys.filter(key => 
        values.every(v => v[key] === first[key])
      );
    }

    const score = values.length > 0 ? common.length / values.length : 0;
    return { score, common };
  }

  /**
   * Tier-3: Execute coordination task (system-wide orchestration)
   */
  private async executeCoordinationTask(task: Task): Promise<void> {
    const { 
      action, 
      targets, 
      coordinationType,
      deadline 
    } = task.payload;
    
    logger.info('MacroAgent', {
      agentId: this.config.id,
      action,
      coordinationType,
      targetCount: targets?.length || 0,
      deadline: new Date(deadline).toISOString(),
      message: 'Coordination task executed'
    });

    // Coordinate with regional peers
    const coordination = await this.coordinateWithPeers(action, targets, deadline);

    task.payload.result = {
      coordinated: coordination.success,
      peersContacted: this.regionalPeers.length,
      timestamp: Date.now()
    };
  }

  /**
   * Coordinate with regional peers
   */
  private async coordinateWithPeers(
    action: string, 
    targets: string[], 
    deadline: number
  ): Promise<{ success: boolean; acks: number }> {
    
    // In production, communicate with peer macro agents
    // For now, simulate coordination
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      success: true,
      acks: this.regionalPeers.length
    };
  }

  /**
   * Add message to bus queue
   */
  enqueueMessage(message: BusMessage): boolean {
    if (this.busQueue.length >= this.maxBusQueueSize) {
      logger.warn('MacroAgent', {
        agentId: this.config.id,
        message: 'Bus queue full, dropping message'
      });
      return false;
    }

    this.busQueue.push(message);
    return true;
  }

  /**
   * Start bus processing loop
   */
  private startBusLoop(): void {
    this.busTimer = setInterval(() => {
      this.processBusQueue();
    }, this.busFlushIntervalMs);
  }

  /**
   * Process bus queue
   */
  private processBusQueue(): void {
    if (this.busQueue.length === 0) return;

    const batch = this.busQueue.splice(0, 100); // Process in batches of 100

    // Sort by priority
    batch.sort((a, b) => b.priority - a.priority);

    // Process messages
    for (const message of batch) {
      this.routeMessage(message).catch(error => {
        logger.error('MacroAgent', {
          agentId: this.config.id,
          messageId: message.id,
          error: error.message,
          message: 'Message routing failed'
        });
      });
    }

    logger.debug('MacroAgent', {
      agentId: this.config.id,
      batchSize: batch.length,
      queueRemaining: this.busQueue.length,
      message: 'Bus queue processed'
    });
  }

  /**
   * Add regional peer
   */
  addRegionalPeer(peerId: string): void {
    if (!this.regionalPeers.includes(peerId)) {
      this.regionalPeers.push(peerId);
    }
  }

  /**
   * Remove regional peer
   */
  removeRegionalPeer(peerId: string): void {
    this.regionalPeers = this.regionalPeers.filter(id => id !== peerId);
  }

  /**
   * Get federated state for a region
   */
  getFederatedState(region: string): FederatedState | undefined {
    return this.federatedStates.get(region);
  }

  /**
   * Get macro-specific metrics
   */
  getMacroMetrics() {
    return {
      ...this.metrics,
      messagesRouted: this.messagesRouted,
      consensusRounds: this.consensusRounds,
      busQueueSize: this.busQueue.length,
      regionalPeers: this.regionalPeers.length,
      federatedRegions: this.federatedStates.size,
      busThroughput: this.messagesRouted / (Date.now() - this.metrics.lastHeartbeat) * 1000
    };
  }

  /**
   * Shutdown agent
   */
  shutdown(): void {
    if (this.busTimer) {
      clearInterval(this.busTimer);
      this.busTimer = null;
    }

    // Flush remaining bus messages
    this.processBusQueue();

    super.shutdown();
  }
}
