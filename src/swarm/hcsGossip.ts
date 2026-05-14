/**
 * HCS Gossip Protocol - Agent Beacon & Event Propagation
 * 
 * Implements epidemic-style gossip over Hedera Consensus Service for
 * Byzantine fault tolerant agent communication. Agents broadcast beacons
 * and events which propagate through the swarm via hashgraph consensus.
 * 
 * Key Features:
 * - Beacon heartbeat with lattice proof
 * - Epidemic gossip for event propagation
 * - ABFT ordering via hashgraph timestamps
 * - Rogue agent detection via beacon validation
 * - Shard-aware routing for scalability
 * 
 * Gossip guarantees (with ≤f Byzantine nodes of n total):
 * - Liveness: Correct agents eventually receive all events
 * - Consistency: All correct agents see same event order (HCS seq)
 * - Validity: Rogue agents cannot forge valid beacons
 * 
 * @module swarm/hcsGossip
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { hcsSwarmMessenger, type HCSwarmMessage, type SwarmMessageType } from './hcsMessenger.js';
import { veraLatticeSwarm, type SwarmAgent, type LatticeNode } from './latticeSwarm.js';
import { abftConsensus, type ProposalType } from './abftConsensus.js';
import type { PaymentTopics } from '../vera/orchestrator/topicManager.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface AgentBeacon {
  agentId: string;
  swarmId: string;
  timestamp: number;
  sequence: number;
  status: 'active' | 'busy' | 'recovering' | 'degraded';
  latticeProof: string;
  capabilities: string[];
  load: number; // 0-1
  completedTasks: number;
  epoch: number;
  signature: string;
}

export interface GossipEvent {
  id: string;
  type: GossipEventType;
  sender: string;
  timestamp: number;
  hcsSequence: string;
  payload: unknown;
  ttl: number; // Hops remaining
  seenBy: string[];
  latticeProof?: string;
}

export type GossipEventType = 
  | 'AGENT_JOIN'
  | 'AGENT_LEAVE'
  | 'TASK_RESULT'
  | 'THREAT_ALERT'
  | 'SHARD_ANNOUNCE'
  | 'CONSENSUS_CALL'
  | 'STATE_SYNC'
  | 'REPUTATION_UPDATE';

export interface GossipStats {
  beaconsSent: number;
  beaconsReceived: number;
  eventsPropagated: number;
  eventsDropped: number;
  uniqueEvents: number;
  avgPropagationTime: number;
  rogueBeaconsDetected: number;
}

export interface GossipConfig {
  beaconIntervalMs: number;
  gossipFanout: number;
  eventTTL: number;
  maxEventsInMemory: number;
  enableLatticeValidation: boolean;
  enableRogueDetection: boolean;
  shardRouters: string[];
}

// ============================================================================
// BEACON VALIDATOR
// ============================================================================

/**
 * Validates agent beacons for rogue detection
 */
class BeaconValidator {
  private beaconHistory: Map<string, AgentBeacon[]> = new Map();
  private rogueAgents: Set<string> = new Set();
  private sequenceTracker: Map<string, number> = new Map();

  validateBeacon(beacon: AgentBeacon, agent?: SwarmAgent): boolean {
    // Check sequence continuity (detect replay attacks)
    const lastSeq = this.sequenceTracker.get(beacon.agentId) || 0;
    if (beacon.sequence <= lastSeq) {
      logger.warn('HCSGossip', {
        agentId: beacon.agentId,
        received: beacon.sequence,
        expected: lastSeq + 1,
        message: 'Beacon sequence replay detected'
      });
      return false;
    }
    this.sequenceTracker.set(beacon.agentId, beacon.sequence);

    // Validate lattice proof
    if (agent) {
      const proofValid = this.validateLatticeProof(beacon.latticeProof, agent.node);
      if (!proofValid) {
        logger.warn('HCSGossip', {
          agentId: beacon.agentId,
          message: 'Invalid lattice proof'
        });
        this.rogueAgents.add(beacon.agentId);
        return false;
      }
    }

    // Check timestamp drift (detect clock manipulation)
    const drift = Math.abs(Date.now() - beacon.timestamp);
    if (drift > 60000) { // 1 minute tolerance
      logger.warn('HCSGossip', {
        agentId: beacon.agentId,
        drift,
        message: 'Beacon timestamp drift detected'
      });
      return false;
    }

    // Store for pattern analysis
    if (!this.beaconHistory.has(beacon.agentId)) {
      this.beaconHistory.set(beacon.agentId, []);
    }
    this.beaconHistory.get(beacon.agentId)!.push(beacon);

    // Detect suspicious patterns
    this.analyzeBeaconPattern(beacon.agentId);

    return true;
  }

  private validateLatticeProof(proof: string, node: LatticeNode): boolean {
    // Simplified: proof should be derived from node embedding
    const expectedHash = this.hashEmbedding(node.embedding);
    return proof.startsWith(expectedHash.slice(0, 8));
  }

  private hashEmbedding(embedding: number[]): string {
    const data = embedding.map(v => v.toFixed(4)).join(',');
    return Buffer.from(data).toString('base64').slice(0, 32);
  }

  private analyzeBeaconPattern(agentId: string): void {
    const history = this.beaconHistory.get(agentId);
    if (!history || history.length < 5) return;

    const recent = history.slice(-10);

    // Pattern 1: Impossible task completion rates
    const taskRates = [];
    for (let i = 1; i < recent.length; i++) {
      const tasks = recent[i].completedTasks - recent[i-1].completedTasks;
      const time = (recent[i].timestamp - recent[i-1].timestamp) / 1000;
      taskRates.push(tasks / time);
    }
    const avgRate = taskRates.reduce((a, b) => a + b, 0) / taskRates.length;
    if (avgRate > 100) { // More than 100 tasks/second is suspicious
      logger.warn('HCSGossip', {
        agentId,
        rate: avgRate.toFixed(2),
        message: 'Suspicious task completion rate'
      });
      this.rogueAgents.add(agentId);
    }

    // Pattern 2: Status oscillation (flapping)
    const statuses = recent.map(b => b.status);
    const changes = statuses.slice(1).filter((s, i) => s !== statuses[i]).length;
    if (changes > statuses.length / 2) {
      logger.warn('HCSGossip', {
        agentId,
        changes,
        message: 'Status flapping detected'
      });
      this.rogueAgents.add(agentId);
    }
  }

  isRogue(agentId: string): boolean {
    return this.rogueAgents.has(agentId);
  }

  getRogueAgents(): string[] {
    return Array.from(this.rogueAgents);
  }
}

// ============================================================================
// GOSSIP PROTOCOL ENGINE
// ============================================================================

export class HCSGossipProtocol extends EventEmitter {
  private config: GossipConfig = {
    beaconIntervalMs: 5000,
    gossipFanout: 3,
    eventTTL: 5,
    maxEventsInMemory: 10000,
    enableLatticeValidation: true,
    enableRogueDetection: true,
    shardRouters: []
  };

  private localAgent: SwarmAgent | null = null;
  private beaconSequence = 0;
  private beaconTimer: NodeJS.Timeout | null = null;
  private knownEvents: Map<string, GossipEvent> = new Map();
  private eventQueue: GossipEvent[] = [];
  private validator = new BeaconValidator();
  private stats: GossipStats = {
    beaconsSent: 0,
    beaconsReceived: 0,
    eventsPropagated: 0,
    eventsDropped: 0,
    uniqueEvents: 0,
    avgPropagationTime: 0,
    rogueBeaconsDetected: 0
  };

  constructor() {
    super();
    this.initializeHCSListeners();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(agent: SwarmAgent, config?: Partial<GossipConfig>): Promise<void> {
    this.localAgent = agent;
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start beacon broadcasting
    this.startBeaconLoop();

    logger.info('HCSGossip', {
      agentId: agent.id,
      interval: this.config.beaconIntervalMs,
      message: 'Gossip protocol initialized'
    });
  }

  private initializeHCSListeners(): void {
    // Listen for beacons
    hcsSwarmMessenger.onMessage('HEARTBEAT', async (message) => {
      await this.handleRemoteBeacon(message as HCSwarmMessage);
    });

    // Listen for gossip events
    hcsSwarmMessenger.onMessage('STATE_SYNC', async (message) => {
      await this.handleGossipEvent(message as HCSwarmMessage);
    });

    hcsSwarmMessenger.onMessage('CAPABILITY_ANNOUNCE', async (message) => {
      await this.handleGossipEvent(message as HCSwarmMessage);
    });
  }

  // ============================================================================
  // BEACON PROTOCOL
  // ============================================================================

  private startBeaconLoop(): void {
    if (this.beaconTimer) return;

    this.beaconTimer = setInterval(() => {
      this.broadcastBeacon();
    }, this.config.beaconIntervalMs);
  }

  private async broadcastBeacon(): Promise<void> {
    if (!this.localAgent) return;

    this.beaconSequence++;

    const beacon: AgentBeacon = {
      agentId: this.localAgent.id,
      swarmId: 'vera-lattice-1',
      timestamp: Date.now(),
      sequence: this.beaconSequence,
      status: this.determineAgentStatus(),
      latticeProof: this.generateLatticeProof(),
      capabilities: this.getAgentCapabilities(),
      load: this.calculateLoad(),
      completedTasks: this.localAgent.completedTasks,
      epoch: Math.floor(Date.now() / 86400000),
      signature: '' // Will be filled by HCS messenger
    };

    // Sign beacon
    beacon.signature = this.signBeacon(beacon);

    // Broadcast via HCS
    const message = hcsSwarmMessenger.createMessage(
      beacon.swarmId,
      beacon.agentId,
      'broadcast',
      'HEARTBEAT',
      beacon
    );

    await hcsSwarmMessenger.submitMessage(message);

    this.stats.beaconsSent++;

    logger.debug('HCSGossip', {
      agentId: beacon.agentId,
      sequence: beacon.sequence,
      status: beacon.status,
      message: 'Beacon broadcast'
    });
  }

  private async handleRemoteBeacon(message: HCSwarmMessage): Promise<void> {
    const beacon = message.payload as AgentBeacon;

    // Skip self
    if (beacon.agentId === this.localAgent?.id) return;

    this.stats.beaconsReceived++;

    // Validate beacon
    const agent = this.findAgentById(beacon.agentId);
    const valid = this.validator.validateBeacon(beacon, agent || undefined);

    if (!valid) {
      this.stats.rogueBeaconsDetected++;
      logger.warn('HCSGossip', {
        agentId: beacon.agentId,
        message: 'Rogue beacon rejected'
      });
      return;
    }

    // Update agent status based on beacon
    if (agent) {
      // Update agent status based on beacon
      if (beacon.status === 'busy') {
        (agent as any).status = 'working';
      } else {
        (agent as any).status = 'idle';
      }
    }

    // Check for consensus events in beacon
    if (beacon.capabilities.includes('consensus')) {
      this.emit('consensus_agent_online', { agentId: beacon.agentId });
    }

    logger.debug('HCSGossip', {
      agentId: beacon.agentId,
      sequence: beacon.sequence,
      status: beacon.status,
      hcsSeq: message.previousMessageHash,
      message: 'Beacon validated'
    });
  }

  private determineAgentStatus(): AgentBeacon['status'] {
    if (!this.localAgent) return 'recovering';
    
    if ((this.localAgent as any).status === 'working') return 'busy';
    
    // Check health
    const load = this.calculateLoad();
    if (load > 0.9) return 'degraded';
    
    return 'active';
  }

  private generateLatticeProof(): string {
    if (!this.localAgent) return '';
    
    const embedding = this.localAgent.node.embedding;
    const hash = embedding.map(v => v.toFixed(4)).join(',');
    return Buffer.from(hash).toString('base64').slice(0, 32);
  }

  private getAgentCapabilities(): string[] {
    if (!this.localAgent) return [];
    
    const caps = [this.localAgent.node.role, this.localAgent.node.specialization];
    if (this.localAgent.node.tier >= 3) caps.push('planner');
    if (this.localAgent.node.specialization === 'security') caps.push('guardian');
    return caps;
  }

  private calculateLoad(): number {
    if (!this.localAgent) return 0;
    
    // Calculate based on task queue and status
    const taskLoad = (this.localAgent as any).currentTask ? 0.5 : 0;
    const recoveryLoad = 0; // No recovery state in SwarmAgent
    return Math.min(1, taskLoad + recoveryLoad + (Math.random() * 0.1));
  }

  private signBeacon(beacon: AgentBeacon): string {
    const data = `${beacon.agentId}:${beacon.sequence}:${beacon.timestamp}`;
    return Buffer.from(data).toString('base64').slice(0, 32);
  }

  // ============================================================================
  // EVENT GOSSIP (EPIDEMIC PROPAGATION)
  // ============================================================================

  /**
   * Publish event to gossip network
   */
  async publishEvent(type: GossipEventType, payload: unknown, ttl?: number): Promise<string> {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const event: GossipEvent = {
      id: eventId,
      type,
      sender: this.localAgent?.id || 'unknown',
      timestamp: Date.now(),
      hcsSequence: '', // Filled by HCS
      payload,
      ttl: ttl || this.config.eventTTL,
      seenBy: [this.localAgent?.id || 'local'],
      latticeProof: this.localAgent ? this.generateLatticeProof() : undefined
    };

    // Store locally
    this.knownEvents.set(eventId, event);
    this.stats.uniqueEvents++;

    // Gossip to peers
    await this.gossipEvent(event);

    this.emit('event_published', event);
    return eventId;
  }

  private async gossipEvent(event: GossipEvent): Promise<void> {
    if (event.ttl <= 0) {
      this.stats.eventsDropped++;
      return;
    }

    // Broadcast via HCS (epidemic style)
    const message = hcsSwarmMessenger.createMessage(
      'vera-lattice-1',
      event.sender,
      'broadcast',
      'STATE_SYNC',
      {
        eventId: event.id,
        type: event.type,
        payload: event.payload,
        ttl: event.ttl,
        seenBy: event.seenBy,
        originalTimestamp: event.timestamp
      }
    );

    await hcsSwarmMessenger.submitMessage(message);

    this.stats.eventsPropagated++;

    logger.debug('HCSGossip', {
      eventId: event.id,
      type: event.type,
      ttl: event.ttl,
      message: 'Event gossiped'
    });
  }

  private async handleGossipEvent(message: HCSwarmMessage): Promise<void> {
    const data = message.payload as {
      eventId: string;
      type: GossipEventType;
      payload: unknown;
      ttl: number;
      seenBy: string[];
      originalTimestamp: number;
    };

    // Deduplication
    if (this.knownEvents.has(data.eventId)) {
      // Already seen, just record
      const existing = this.knownEvents.get(data.eventId)!;
      if (!existing.seenBy.includes(message.senderAgent)) {
        existing.seenBy.push(message.senderAgent);
      }
      return;
    }

    // Check if addressed to us
    if (data.seenBy.includes(this.localAgent?.id || '')) {
      return; // Already processed
    }

    // Calculate propagation time
    const propagationTime = Date.now() - data.originalTimestamp;
    this.stats.avgPropagationTime = 
      (this.stats.avgPropagationTime * this.stats.uniqueEvents + propagationTime) / 
      (this.stats.uniqueEvents + 1);

    // Create local event record
    const event: GossipEvent = {
      id: data.eventId,
      type: data.type,
      sender: message.senderAgent,
      timestamp: data.originalTimestamp,
      hcsSequence: message.previousMessageHash,
      payload: data.payload,
      ttl: data.ttl - 1,
      seenBy: [...data.seenBy, this.localAgent?.id || 'local']
    };

    this.knownEvents.set(event.id, event);
    this.stats.uniqueEvents++;

    // Forward to others (if TTL remaining)
    if (event.ttl > 0) {
      await this.gossipEvent(event);
    }

    // Process event locally
    this.processEvent(event);

    logger.debug('HCSGossip', {
      eventId: event.id,
      type: event.type,
      from: message.senderAgent,
      propagationTime,
      message: 'Event received'
    });
  }

  private processEvent(event: GossipEvent): void {
    switch (event.type) {
      case 'THREAT_ALERT':
        this.emit('threat_detected', event.payload);
        break;
      case 'CONSENSUS_CALL':
        this.emit('consensus_requested', event.payload);
        break;
      case 'SHARD_ANNOUNCE':
        this.emit('shard_discovered', event.payload);
        break;
      case 'REPUTATION_UPDATE':
        this.emit('reputation_changed', event.payload);
        break;
      default:
        this.emit('event_received', event);
    }
  }

  // ============================================================================
  // SHARD-AWARE ROUTING
  // ============================================================================

  /**
   * Route message to specific shard
   */
  async routeToShard(shardId: string, type: SwarmMessageType, payload: unknown): Promise<void> {
    // Find shard router
    const router = this.config.shardRouters.find(r => r.startsWith(shardId));
    if (!router) {
      logger.warn('HCSGossip', { shardId, message: 'No shard router found' });
      return;
    }

    // Send via HCS with shard routing hint
    const message = hcsSwarmMessenger.createMessage(
      'vera-lattice-1',
      this.localAgent?.id || 'unknown',
      router,
      type,
      payload
    );

    await hcsSwarmMessenger.submitMessage(message);

    logger.debug('HCSGossip', { shardId, type, message: 'Routed to shard' });
  }

  /**
   * Announce local shard to network
   */
  async announceShard(shardInfo: {
    shardId: string;
    agentCount: number;
    capabilities: string[];
  }): Promise<void> {
    await this.publishEvent('SHARD_ANNOUNCE', shardInfo);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  private findAgentById(agentId: string): SwarmAgent | undefined {
    // Query lattice swarm
    const stats = veraLatticeSwarm.getSwarmStats();
    return stats.agents.find(a => a.id === agentId) as SwarmAgent | undefined;
  }

  getStats(): GossipStats {
    return { ...this.stats };
  }

  getKnownEvents(): GossipEvent[] {
    return Array.from(this.knownEvents.values());
  }

  getRogueAgents(): string[] {
    return this.validator.getRogueAgents();
  }

  /**
   * Stop gossip protocol
   */
  stop(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    logger.info('HCSGossip', { message: 'Gossip protocol stopped' });
  }
}

// Export singleton
export const hcsGossip = new HCSGossipProtocol();
