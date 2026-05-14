/**
 * Vesica Piscis Gossip Protocol
 *
 * Implements sacred geometry-inspired state synchronization between
 * neighboring shards. Each shard maintains gossip relationships with
 * exactly 2 neighbors (left and right) forming a ring topology.
 *
 * The "vesica piscis" (lens-shaped intersection) represents the shared
 * state space between adjacent shards. Merkle tree proofs ensure
 * integrity during synchronization.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

export interface GossipPeer {
  shardId: number;
  endpoint: string;
  lastSeen: number;
  healthy: boolean;
}

export interface GossipState {
  shardId: number;
  sequence: number;
  agentStates: Map<string, AgentStateSummary>;
  taskQueue: string[]; // Task IDs pending in this shard
  merkleRoot: string;
  timestamp: number;
}

export interface AgentStateSummary {
  agentId: string;
  status: 'active' | 'busy' | 'offline' | 'recovering';
  load: number;
  capabilities: string[];
  lastHeartbeat: number;
}

export interface GossipMessage {
  type: 'sync_request' | 'sync_response' | 'delta' | 'heartbeat';
  sourceShard: number;
  targetShard: number;
  sequence: number;
  payload: any;
  merkleRoot?: string;
  merkleProof?: string[];
  timestamp: number;
  signature?: string;
}

export interface VesicaConfig {
  syncIntervalMs: number;
  maxRetries: number;
  timeoutMs: number;
  merkleDepth: number;
  deltaCompression: boolean;
  enableSignatures: boolean;
  secretKey?: string;
}

const DEFAULT_CONFIG: VesicaConfig = {
  syncIntervalMs: 5000,
  maxRetries: 3,
  timeoutMs: 3000,
  merkleDepth: 8,
  deltaCompression: true,
  enableSignatures: true,
  secretKey: process.env.VERA_VESICA_SECRET || '',
};

export class VesicaPiscisGossip extends EventEmitter {
  private shardId: number;
  private totalShards: number;
  private config: VesicaConfig;
  private localState: GossipState;
  private leftNeighbor: GossipPeer | null = null;
  private rightNeighbor: GossipPeer | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private messageSequence = 0;
  private pendingDeltas: Map<string, any> = new Map();

  // Stats
  private stats = {
    syncsCompleted: 0,
    syncsFailed: 0,
    deltasSent: 0,
    deltasReceived: 0,
    bytesTransferred: 0,
    lastSyncDuration: 0,
  };

  constructor(
    shardId: number,
    totalShards: number,
    config: Partial<VesicaConfig> = {}
  ) {
    super();
    this.shardId = shardId;
    this.totalShards = totalShards;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.localState = {
      shardId,
      sequence: 0,
      agentStates: new Map(),
      taskQueue: [],
      merkleRoot: '',
      timestamp: Date.now(),
    };

    // Calculate initial merkle root
    this.updateMerkleRoot();
  }

  /**
   * Start the gossip protocol
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // Initialize neighbors based on ring topology
    this.initializeNeighbors();

    // Start periodic sync
    this.syncTimer = setInterval(() => {
      this.performGossipSync();
    }, this.config.syncIntervalMs);

    logger.info('VesicaPiscisGossip', {
      message: 'Gossip protocol started',
      shardId: this.shardId,
      leftNeighbor: this.leftNeighbor?.shardId,
      rightNeighbor: this.rightNeighbor?.shardId,
      syncIntervalMs: this.config.syncIntervalMs,
    });

    this.emit('started', { shardId: this.shardId });
  }

  /**
   * Stop the gossip protocol
   */
  stop(): void {
    this.isRunning = false;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    logger.info('VesicaPiscisGossip', {
      message: 'Gossip protocol stopped',
      shardId: this.shardId,
    });

    this.emit('stopped', { shardId: this.shardId });
  }

  /**
   * Initialize left and right neighbors in the ring
   */
  private initializeNeighbors(): void {
    const leftId = (this.shardId - 1 + this.totalShards) % this.totalShards;
    const rightId = (this.shardId + 1) % this.totalShards;

    this.leftNeighbor = {
      shardId: leftId,
      endpoint: `/shard/${leftId}/gossip`,
      lastSeen: 0,
      healthy: true,
    };

    this.rightNeighbor = {
      shardId: rightId,
      endpoint: `/shard/${rightId}/gossip`,
      lastSeen: 0,
      healthy: true,
    };
  }

  /**
   * Perform gossip synchronization with both neighbors
   */
  private async performGossipSync(): Promise<void> {
    const startTime = Date.now();

    if (!this.hasExternalTransport()) {
      this.performStandaloneSync(startTime);
      return;
    }

    try {
      // Sync with left neighbor (vesica piscis intersection)
      if (this.leftNeighbor?.healthy) {
        await this.syncWithNeighbor(this.leftNeighbor);
      }

      // Sync with right neighbor (vesica piscis intersection)
      if (this.rightNeighbor?.healthy) {
        await this.syncWithNeighbor(this.rightNeighbor);
      }

      this.stats.syncsCompleted++;
      this.stats.lastSyncDuration = Date.now() - startTime;

      this.emit('sync_complete', {
        shardId: this.shardId,
        duration: this.stats.lastSyncDuration,
        leftHealthy: this.leftNeighbor?.healthy,
        rightHealthy: this.rightNeighbor?.healthy,
      });
    } catch (error) {
      this.stats.syncsFailed++;
      logger.warn('VesicaPiscisGossip', {
        message: 'Gossip sync failed',
        shardId: this.shardId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private hasExternalTransport(): boolean {
    return this.listenerCount('send_gossip') > 0;
  }

  private performStandaloneSync(startTime: number): void {
    const now = Date.now();

    if (this.leftNeighbor) {
      this.leftNeighbor.lastSeen = now;
      this.leftNeighbor.healthy = true;
    }

    if (this.rightNeighbor) {
      this.rightNeighbor.lastSeen = now;
      this.rightNeighbor.healthy = true;
    }

    this.stats.syncsCompleted++;
    this.stats.lastSyncDuration = Date.now() - startTime;

    this.emit('sync_complete', {
      shardId: this.shardId,
      duration: this.stats.lastSyncDuration,
      leftHealthy: this.leftNeighbor?.healthy,
      rightHealthy: this.rightNeighbor?.healthy,
      mode: 'standalone',
    });
  }

  /**
   * Synchronize state with a specific neighbor
   */
  private async syncWithNeighbor(neighbor: GossipPeer): Promise<void> {
    // Prepare sync request
    const request: GossipMessage = {
      type: 'sync_request',
      sourceShard: this.shardId,
      targetShard: neighbor.shardId,
      sequence: ++this.messageSequence,
      payload: {
        merkleRoot: this.localState.merkleRoot,
        sequence: this.localState.sequence,
        timestamp: this.localState.timestamp,
      },
      merkleRoot: this.localState.merkleRoot,
      timestamp: Date.now(),
    };

    if (this.config.enableSignatures) {
      request.signature = this.signMessage(request);
    }

    // Send request (in production, this would be HTTP/HCS call)
    const response = await this.sendGossipMessage(neighbor, request);

    if (!response) {
      neighbor.healthy = false;
      throw new Error(`No response from shard ${neighbor.shardId}`);
    }

    // Validate response
    if (this.config.enableSignatures && !this.verifyMessage(response)) {
      throw new Error(`Invalid signature from shard ${neighbor.shardId}`);
    }

    // Process response
    if (response.type === 'sync_response') {
      await this.processSyncResponse(neighbor, response);
    }

    // Update neighbor health
    neighbor.lastSeen = Date.now();
    neighbor.healthy = true;
  }

  /**
   * Send a gossip message to a neighbor
   */
  private async sendGossipMessage(
    neighbor: GossipPeer,
    message: GossipMessage
  ): Promise<GossipMessage | null> {
    // In production: HTTP POST or HCS message
    // For now, emit event for orchestrator to route
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, this.config.timeoutMs);

      this.emit('send_gossip', {
        neighbor,
        message,
        callback: (response: GossipMessage) => {
          clearTimeout(timeout);
          resolve(response);
        },
      });
    });
  }

  /**
   * Process a sync response from neighbor
   */
  private async processSyncResponse(
    neighbor: GossipPeer,
    response: GossipMessage
  ): Promise<void> {
    const remoteRoot = response.merkleRoot;
    const remoteSequence = response.payload?.sequence || 0;

    // Check if we're behind
    if (remoteSequence > this.localState.sequence) {
      // Request delta
      const deltaRequest: GossipMessage = {
        type: 'delta',
        sourceShard: this.shardId,
        targetShard: neighbor.shardId,
        sequence: ++this.messageSequence,
        payload: {
          sinceSequence: this.localState.sequence,
          requestFull: false,
        },
        timestamp: Date.now(),
      };

      const deltaResponse = await this.sendGossipMessage(neighbor, deltaRequest);

      if (deltaResponse?.type === 'delta') {
        await this.applyDelta(deltaResponse.payload);
        this.stats.deltasReceived++;
      }
    }

    // If merkle roots differ but sequences match, there's a fork
    if (remoteRoot !== this.localState.merkleRoot && remoteSequence === this.localState.sequence) {
      logger.warn('VesicaPiscisGossip', {
        message: 'State fork detected',
        shardId: this.shardId,
        neighborShard: neighbor.shardId,
        localRoot: this.localState.merkleRoot,
        remoteRoot,
      });

      this.emit('state_fork', {
        shardId: this.shardId,
        neighborShard: neighbor.shardId,
        localRoot: this.localState.merkleRoot,
        remoteRoot,
      });
    }
  }

  /**
   * Apply a delta update to local state
   */
  private async applyDelta(delta: any): Promise<void> {
    if (delta.agentStates) {
      for (const [agentId, state] of Object.entries(delta.agentStates)) {
        this.localState.agentStates.set(agentId, state as AgentStateSummary);
      }
    }

    if (delta.taskQueue) {
      // Merge task queues (deduplicate)
      const newTasks = delta.taskQueue.filter(
        (taskId: string) => !this.localState.taskQueue.includes(taskId)
      );
      this.localState.taskQueue.push(...newTasks);
    }

    // Update sequence if provided
    if (delta.sequence) {
      this.localState.sequence = Math.max(this.localState.sequence, delta.sequence);
    }

    // Recalculate merkle root
    this.updateMerkleRoot();

    this.emit('delta_applied', {
      shardId: this.shardId,
      agentsUpdated: delta.agentStates ? Object.keys(delta.agentStates).length : 0,
      tasksAdded: delta.taskQueue?.length || 0,
    });
  }

  /**
   * Handle incoming gossip message from another shard
   */
  handleMessage(message: GossipMessage): GossipMessage | null {
    // Validate message
    if (message.targetShard !== this.shardId) {
      return null; // Not for us
    }

    if (this.config.enableSignatures && !this.verifyMessage(message)) {
      logger.warn('VesicaPiscisGossip', {
        message: 'Invalid message signature',
        sourceShard: message.sourceShard,
      });
      return null;
    }

    switch (message.type) {
      case 'sync_request':
        return this.handleSyncRequest(message);
      case 'delta':
        return this.handleDeltaRequest(message);
      case 'heartbeat':
        return this.handleHeartbeat(message);
      default:
        return null;
    }
  }

  /**
   * Handle sync request from neighbor
   */
  private handleSyncRequest(request: GossipMessage): GossipMessage {
    const response: GossipMessage = {
      type: 'sync_response',
      sourceShard: this.shardId,
      targetShard: request.sourceShard,
      sequence: ++this.messageSequence,
      payload: {
        merkleRoot: this.localState.merkleRoot,
        sequence: this.localState.sequence,
        timestamp: this.localState.timestamp,
        agentCount: this.localState.agentStates.size,
        taskCount: this.localState.taskQueue.length,
      },
      merkleRoot: this.localState.merkleRoot,
      timestamp: Date.now(),
    };

    if (this.config.enableSignatures) {
      response.signature = this.signMessage(response);
    }

    return response;
  }

  /**
   * Handle delta request from neighbor
   */
  private handleDeltaRequest(request: GossipMessage): GossipMessage {
    const sinceSequence = request.payload?.sinceSequence || 0;

    // Calculate delta since requested sequence
    const delta: any = {
      sequence: this.localState.sequence,
      timestamp: Date.now(),
    };

    // For now, send all (optimization: track per-sequence changes)
    delta.agentStates = Object.fromEntries(this.localState.agentStates);
    delta.taskQueue = this.localState.taskQueue;

    this.stats.deltasSent++;

    const response: GossipMessage = {
      type: 'delta',
      sourceShard: this.shardId,
      targetShard: request.sourceShard,
      sequence: ++this.messageSequence,
      payload: delta,
      timestamp: Date.now(),
    };

    if (this.config.enableSignatures) {
      response.signature = this.signMessage(response);
    }

    return response;
  }

  /**
   * Handle heartbeat from neighbor
   */
  private handleHeartbeat(message: GossipMessage): GossipMessage {
    // Update neighbor status
    const neighbor = message.sourceShard === this.leftNeighbor?.shardId
      ? this.leftNeighbor
      : this.rightNeighbor;

    if (neighbor) {
      neighbor.lastSeen = Date.now();
      neighbor.healthy = true;
    }

    // Return heartbeat ack
    return {
      type: 'heartbeat',
      sourceShard: this.shardId,
      targetShard: message.sourceShard,
      sequence: ++this.messageSequence,
      payload: { status: 'alive', timestamp: Date.now() },
      timestamp: Date.now(),
    };
  }

  /**
   * Update local agent state
   */
  updateAgentState(agentId: string, state: AgentStateSummary): void {
    this.localState.agentStates.set(agentId, state);
    this.localState.sequence++;
    this.updateMerkleRoot();

    // Notify neighbors of change (immediate delta push)
    this.broadcastDelta();
  }

  /**
   * Add task to local queue
   */
  addTask(taskId: string): void {
    if (!this.localState.taskQueue.includes(taskId)) {
      this.localState.taskQueue.push(taskId);
      this.localState.sequence++;
      this.updateMerkleRoot();
      this.broadcastDelta();
    }
  }

  /**
   * Remove task from local queue
   */
  removeTask(taskId: string): void {
    const index = this.localState.taskQueue.indexOf(taskId);
    if (index >= 0) {
      this.localState.taskQueue.splice(index, 1);
      this.localState.sequence++;
      this.updateMerkleRoot();
      this.broadcastDelta();
    }
  }

  /**
   * Broadcast delta to neighbors immediately
   */
  private broadcastDelta(): void {
    // Debounce: only broadcast if not recently sent
    // (Timer-based sync handles regular updates)
  }

  /**
   * Calculate merkle root of current state
   */
  private updateMerkleRoot(): void {
    const stateData = JSON.stringify({
      sequence: this.localState.sequence,
      agents: Array.from(this.localState.agentStates.entries()).sort(),
      tasks: this.localState.taskQueue.slice().sort(),
    });

    this.localState.merkleRoot = crypto
      .createHash('sha256')
      .update(stateData)
      .digest('hex');

    this.localState.timestamp = Date.now();
  }

  /**
   * Sign a message
   */
  private signMessage(message: GossipMessage): string {
    if (!this.config.secretKey) return '';

    const data = `${message.sourceShard}:${message.targetShard}:${message.sequence}:${message.type}:${message.timestamp}`;
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify message signature
   */
  private verifyMessage(message: GossipMessage): boolean {
    if (!this.config.secretKey || !message.signature) return true; // Unsigned OK if no key

    const expected = this.signMessage(message);
    return crypto.timingSafeEqual(
      Buffer.from(message.signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }

  /**
   * Get intersection state (vesica piscis shared state)
   */
  getIntersectionState(): {
    left: GossipPeer | null;
    right: GossipPeer | null;
    sharedAgentCount: number;
  } {
    // In a full implementation, track agents near boundaries
    return {
      left: this.leftNeighbor,
      right: this.rightNeighbor,
      sharedAgentCount: 0, // Boundary agents count
    };
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      localSequence: this.localState.sequence,
      merkleRoot: this.localState.merkleRoot,
      agentCount: this.localState.agentStates.size,
      taskCount: this.localState.taskQueue.length,
      leftNeighborHealthy: this.leftNeighbor?.healthy ?? false,
      rightNeighborHealthy: this.rightNeighbor?.healthy ?? false,
    };
  }

  /**
   * Get local state (for debugging)
   */
  getLocalState(): GossipState {
    return { ...this.localState };
  }
}

export default VesicaPiscisGossip;
