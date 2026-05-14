/**
 * Byzantine Consensus - PBFT Implementation
 * 
 * Practical Byzantine Fault Tolerance for distributed consensus
 * Tolerates up to f faulty nodes where n >= 3f + 1
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface ConsensusConfig {
  faultTolerance: number; // 0.0 - 0.5 (typically 0.33)
  consensusTimeout: number;
  blockTime: number;
  viewChangeTimeout: number;
  enableBatching: boolean;
  batchSize: number;
  enableHotStuff: boolean;
  maxChainLength: number;
  optimisticResponsiveness: boolean;
}

export interface ConsensusMessage {
  type: 'request' | 'preprepare' | 'prepare' | 'commit' | 'reply' | 'viewchange' | 'newview';
  view: number;
  sequence: number;
  digest: string;
  payload: any;
  sender: string;
  signature: string;
  timestamp: number;
}

export interface ConsensusState {
  view: number;
  sequence: number;
  prepared: Set<string>;
  committed: Set<string>;
  requests: Map<number, any>;
  checkpoints: Map<number, string>;
  lastCheckpoint: number;
}

export interface NodeVote {
  sender: string;
  signature: string;
  timestamp: number;
}

export class ByzantineConsensus extends EventEmitter {
  private nodeId: string;
  private nodes: Set<string> = new Set();
  private config: ConsensusConfig;
  private state: ConsensusState;
  private isPrimary: boolean = false;
  private messageLog: Map<string, ConsensusMessage[]> = new Map();
  private viewChangeTimer: NodeJS.Timeout | null = null;
  private consensusTimer: NodeJS.Timeout | null = null;
  
  // Dynamic batch sizing
  private dynamicBatchSize: number;
  private loadHistory: number[] = [];
  private lastBatchAdjustment: number = 0;
  private batchAdjustmentIntervalMs: number = 30000;

  constructor(nodeId: string, config: Partial<ConsensusConfig> = {}) {
    super();
    this.nodeId = nodeId;
    this.config = {
      faultTolerance: config.faultTolerance || 0.33,
      consensusTimeout: config.consensusTimeout || 5000,
      blockTime: config.blockTime || 2000,
      viewChangeTimeout: config.viewChangeTimeout || 10000,
      enableBatching: config.enableBatching ?? true,
      batchSize: config.batchSize || 100,
      enableHotStuff: config.enableHotStuff ?? true,
      maxChainLength: config.maxChainLength || 10,
      optimisticResponsiveness: config.optimisticResponsiveness ?? true
    };
    this.state = {
      view: 0,
      sequence: 0,
      prepared: new Set(),
      committed: new Set(),
      requests: new Map(),
      checkpoints: new Map(),
      lastCheckpoint: 0
    };
    
    // Initialize dynamic batch sizing
    this.dynamicBatchSize = this.config.batchSize;
  }

  /**
   * Initialize consensus engine
   */
  async initialize(nodeIds: string[]): Promise<void> {
    logger.info('ByzantineConsensus', {
      nodeId: this.nodeId,
      nodeCount: nodeIds.length,
      message: 'Initializing Byzantine consensus'
    });

    // Register all nodes
    for (const id of nodeIds) {
      this.nodes.add(id);
    }

    // Determine if this node is primary
    this.updatePrimary();

    this.emit('initialized', { nodeId: this.nodeId, isPrimary: this.isPrimary });
  }

  /**
   * Submit a request for consensus
   */
  async requestConsensus(payload: any): Promise<any> {
    if (!this.isPrimary) {
      // Forward to primary
      this.emit('forward_to_primary', payload);
      return null;
    }

    const sequence = ++this.state.sequence;
    const digest = this.hashPayload(payload);

    // Create pre-prepare message
    const preprepare: ConsensusMessage = {
      type: 'preprepare',
      view: this.state.view,
      sequence,
      digest,
      payload,
      sender: this.nodeId,
      signature: this.sign(digest),
      timestamp: Date.now()
    };

    // Broadcast to all nodes
    this.broadcast(preprepare);

    // Start consensus timer
    this.startConsensusTimer(sequence);

    // Wait for consensus
    return this.waitForConsensus(sequence, digest);
  }

  /**
   * Handle incoming consensus message
   */
  handleMessage(message: ConsensusMessage): void {
    // Validate message
    if (!this.validateMessage(message)) {
      logger.warn('ByzantineConsensus', {
        sender: message.sender,
        type: message.type,
        message: 'Invalid message rejected'
      });
      return;
    }

    // Ignore messages from old views
    if (message.view < this.state.view) {
      return;
    }

    // Process based on type
    switch (message.type) {
      case 'preprepare':
        this.handlePreprepare(message);
        break;
      case 'prepare':
        this.handlePrepare(message);
        break;
      case 'commit':
        this.handleCommit(message);
        break;
      case 'viewchange':
        this.handleViewChange(message);
        break;
      case 'newview':
        this.handleNewView(message);
        break;
    }
  }

  /**
   * Handle pre-prepare message (from primary)
   */
  private handlePreprepare(message: ConsensusMessage): void {
    // Verify sender is primary
    if (message.sender !== this.getPrimaryId()) {
      logger.warn('ByzantineConsensus', {
        sender: message.sender,
        expected: this.getPrimaryId(),
        message: 'Preprepare from non-primary rejected'
      });
      return;
    }

    // Check sequence number
    if (this.state.requests.has(message.sequence)) {
      return; // Duplicate
    }

    // Store request
    this.state.requests.set(message.sequence, message.payload);

    // Send prepare
    const prepare: ConsensusMessage = {
      type: 'prepare',
      view: this.state.view,
      sequence: message.sequence,
      digest: message.digest,
      payload: null,
      sender: this.nodeId,
      signature: this.sign(message.digest),
      timestamp: Date.now()
    };

    this.broadcast(prepare);
    this.logMessage(message.sequence, prepare);

    // Track our own prepare
    this.state.prepared.add(this.nodeId);

    // Check if prepared
    this.checkPrepared(message.sequence, message.digest);
  }

  /**
   * Handle prepare message
   */
  private handlePrepare(message: ConsensusMessage): void {
    // Log the prepare
    this.logMessage(message.sequence, message);

    // Count prepares
    const prepares = this.getPrepares(message.sequence, message.digest);
    
    if (prepares.length >= this.quorum() && !this.state.prepared.has(message.digest)) {
      this.state.prepared.add(message.digest);
      this.checkPrepared(message.sequence, message.digest);
    }
  }

  /**
   * Handle commit message
   */
  private handleCommit(message: ConsensusMessage): void {
    // Log the commit
    this.logMessage(message.sequence, message);

    // Count commits
    const commits = this.getCommits(message.sequence, message.digest);

    if (commits.length >= this.quorum() && !this.state.committed.has(message.digest)) {
      this.state.committed.add(message.digest);
      this.checkCommitted(message.sequence, message.digest);
    }
  }

  /**
   * Check if prepared
   */
  private checkPrepared(sequence: number, digest: string): void {
    const request = this.state.requests.get(sequence);
    if (!request) return;

    // Send commit
    const commit: ConsensusMessage = {
      type: 'commit',
      view: this.state.view,
      sequence,
      digest,
      payload: null,
      sender: this.nodeId,
      signature: this.sign(digest),
      timestamp: Date.now()
    };

    this.broadcast(commit);
    this.logMessage(sequence, commit);

    // Track our own commit
    this.state.committed.add(digest);

    // Check committed
    this.checkCommitted(sequence, digest);

    this.emit('prepared', { sequence, digest });
  }

  /**
   * Check if committed
   */
  private checkCommitted(sequence: number, digest: string): void {
    const request = this.state.requests.get(sequence);
    if (!request) return;

    // Consensus achieved!
    this.emit('committed', { sequence, digest, request });

    // Send reply to client
    const reply: ConsensusMessage = {
      type: 'reply',
      view: this.state.view,
      sequence,
      digest,
      payload: request,
      sender: this.nodeId,
      signature: this.sign(digest),
      timestamp: Date.now()
    };

    this.broadcast(reply);

    logger.info('ByzantineConsensus', {
      sequence,
      digest: digest.slice(0, 16),
      message: 'Consensus achieved'
    });
  }

  /**
   * Handle view change
   */
  private handleViewChange(message: ConsensusMessage): void {
    // Collect view change messages
    this.logMessage(this.state.view, message);

    const viewChanges = this.getViewChanges(this.state.view + 1);
    
    if (viewChanges.length >= this.quorum()) {
      // New primary takes over
      this.state.view++;
      this.updatePrimary();

      if (this.isPrimary) {
        // Broadcast new view
        const newView: ConsensusMessage = {
          type: 'newview',
          view: this.state.view,
          sequence: this.state.sequence,
          digest: '',
          payload: { viewChanges: viewChanges.map(vc => vc.payload) },
          sender: this.nodeId,
          signature: this.sign('newview'),
          timestamp: Date.now()
        };

        this.broadcast(newView);
      }

      this.emit('view_changed', { view: this.state.view, primary: this.getPrimaryId() });
    }
  }

  /**
   * Handle new view
   */
  private handleNewView(message: ConsensusMessage): void {
    // Verify sender is new primary
    const expectedPrimary = this.nodes[message.view % this.nodes.size];
    if (message.sender !== expectedPrimary) {
      return;
    }

    // Accept new view
    this.state.view = message.view;
    this.updatePrimary();

    // Replay any pending requests
    this.emit('view_changed', { view: this.state.view, primary: this.getPrimaryId() });
  }

  /**
   * Initiate view change (when primary fails)
   */
  initiateViewChange(): void {
    const viewChange: ConsensusMessage = {
      type: 'viewchange',
      view: this.state.view + 1,
      sequence: this.state.sequence,
      digest: '',
      payload: {
        lastSequence: this.state.sequence,
        checkpoints: Array.from(this.state.checkpoints.entries())
      },
      sender: this.nodeId,
      signature: this.sign('viewchange'),
      timestamp: Date.now()
    };

    this.broadcast(viewChange);
    this.logMessage(this.state.view + 1, viewChange);

    logger.info('ByzantineConsensus', {
      view: this.state.view + 1,
      message: 'View change initiated'
    });
  }

  /**
   * Update primary status
   */
  private updatePrimary(): void {
    const nodeArray = Array.from(this.nodes);
    const primaryIndex = this.state.view % nodeArray.length;
    this.isPrimary = nodeArray[primaryIndex] === this.nodeId;
  }

  /**
   * Get current primary node ID
   */
  private getPrimaryId(): string {
    const nodeArray = Array.from(this.nodes);
    const primaryIndex = this.state.view % nodeArray.length;
    return nodeArray[primaryIndex];
  }

  /**
   * Calculate quorum size (2f + 1)
   */
  private quorum(): number {
    const n = this.nodes.size;
    const f = Math.floor((n - 1) / 3);
    return 2 * f + 1;
  }

  /**
   * Validate message signature and format
   */
  private validateMessage(message: ConsensusMessage): boolean {
    // Basic validation
    if (!message.sender || !message.signature) return false;
    if (!this.nodes.has(message.sender)) return false;
    if (message.timestamp > Date.now() + 60000) return false; // Future message

    // Signature validation (simplified)
    const expected = this.sign(message.digest || 'viewchange');
    return message.signature === expected;
  }

  /**
   * Hash payload for digest
   */
  private hashPayload(payload: any): string {
    return this.hashString(JSON.stringify(payload));
  }

  /**
   * Sign message (simplified crypto)
   */
  private sign(data: string): string {
    // Simplified signature - in production use proper crypto
    return this.hashString(data + this.nodeId + 'secret');
  }

  /**
   * Hash string
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16).padStart(16, '0');
  }

  /**
   * Log message for tracking
   */
  private logMessage(key: number | string, message: ConsensusMessage): void {
    const keyStr = key.toString();
    if (!this.messageLog.has(keyStr)) {
      this.messageLog.set(keyStr, []);
    }
    this.messageLog.get(keyStr)!.push(message);
  }

  /**
   * Get prepares for sequence
   */
  private getPrepares(sequence: number, digest: string): ConsensusMessage[] {
    const messages = this.messageLog.get(sequence.toString()) || [];
    return messages.filter(m => 
      m.type === 'prepare' && m.digest === digest
    );
  }

  /**
   * Get commits for sequence
   */
  private getCommits(sequence: number, digest: string): ConsensusMessage[] {
    const messages = this.messageLog.get(sequence.toString()) || [];
    return messages.filter(m => 
      m.type === 'commit' && m.digest === digest
    );
  }

  /**
   * Get view change messages
   */
  private getViewChanges(view: number): ConsensusMessage[] {
    const messages = this.messageLog.get(view.toString()) || [];
    return messages.filter(m => m.type === 'viewchange');
  }

  /**
   * Broadcast message to all nodes
   */
  private broadcast(message: ConsensusMessage): void {
    this.emit('broadcast', message);
  }

  /**
   * Wait for consensus on sequence
   */
  private waitForConsensus(sequence: number, digest: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Consensus timeout'));
      }, this.config.consensusTimeout);

      this.once('committed', (data: any) => {
        if (data.sequence === sequence) {
          clearTimeout(timeout);
          resolve(data.request);
        }
      });
    });
  }

  /**
   * Start consensus timer
   */
  private startConsensusTimer(sequence: number): void {
    this.consensusTimer = setTimeout(() => {
      if (!this.state.committed.has(sequence.toString())) {
        logger.warn('ByzantineConsensus', {
          sequence,
          message: 'Consensus timeout - initiating view change'
        });
        this.initiateViewChange();
      }
    }, this.config.consensusTimeout);
  }

  /**
   * Create checkpoint
   */
  createCheckpoint(): void {
    const checkpointSeq = this.state.sequence;
    const checkpointDigest = this.hashString(
      Array.from(this.state.requests.entries())
        .filter(([seq]) => seq <= checkpointSeq)
        .map(([_, req]) => JSON.stringify(req))
        .join('')
    );

    this.state.checkpoints.set(checkpointSeq, checkpointDigest);
    this.state.lastCheckpoint = checkpointSeq;

    // Clean up old requests
    for (const seq of Array.from(this.state.requests.keys())) {
      if (seq < checkpointSeq - 100) {
        this.state.requests.delete(seq);
      }
    }

    this.emit('checkpoint', { sequence: checkpointSeq, digest: checkpointDigest });
  }

  /**
   * Batch request consensus for multiple payloads
   */
  async requestBatchConsensus(payloads: any[]): Promise<any[]> {
    if (!this.config.enableBatching) {
      // Fall back to individual consensus requests
      const results = [];
      for (const payload of payloads) {
        const result = await this.requestConsensus(payload);
        results.push(result);
      }
      return results;
    }

    if (!this.isPrimary) {
      this.emit('forward_to_primary', { type: 'batch', payloads });
      return [];
    }

    const batchSize = Math.min(payloads.length, this.dynamicBatchSize);
    const batch = payloads.slice(0, batchSize);
    
    // Create batch digest
    const batchDigest = this.hashPayload(batch);
    const sequence = ++this.state.sequence;

    logger.info('ByzantineConsensus', {
      sequence,
      batchSize: batch.length,
      message: 'Processing batch consensus'
    });

    // Create single pre-prepare for entire batch
    const preprepare: ConsensusMessage = {
      type: 'preprepare',
      view: this.state.view,
      sequence,
      digest: batchDigest,
      payload: { type: 'batch', items: batch },
      sender: this.nodeId,
      signature: this.sign(batchDigest),
      timestamp: Date.now()
    };

    this.broadcast(preprepare);
    this.startConsensusTimer(sequence);

    // Wait for consensus
    return this.waitForConsensus(sequence, batchDigest);
  }

  /**
   * Track load for dynamic batch sizing
   */
  trackLoad(pendingRequests: number): void {
    this.loadHistory.push(pendingRequests);
    
    // Keep only last 10 measurements (5 minutes at 30s intervals)
    if (this.loadHistory.length > 10) {
      this.loadHistory.shift();
    }
    
    // Adjust batch size periodically
    const now = Date.now();
    if (now - this.lastBatchAdjustment > this.batchAdjustmentIntervalMs) {
      this.adjustBatchSize();
      this.lastBatchAdjustment = now;
    }
  }

  /**
   * Adjust batch size based on load patterns
   */
  private adjustBatchSize(): void {
    if (this.loadHistory.length < 3) return;
    
    const avgLoad = this.loadHistory.reduce((a, b) => a + b, 0) / this.loadHistory.length;
    const currentSize = this.dynamicBatchSize;
    let newSize = currentSize;
    
    // Scale up if load is high
    if (avgLoad > currentSize * 0.8) {
      newSize = Math.min(currentSize * 1.5, this.config.batchSize * 2);
    }
    // Scale down if load is low
    else if (avgLoad < currentSize * 0.3) {
      newSize = Math.max(currentSize * 0.8, 10);
    }
    
    if (newSize !== currentSize) {
      this.dynamicBatchSize = Math.floor(newSize);
      
      logger.info('ByzantineConsensus', {
        message: 'Dynamic batch size adjusted',
        previousSize: currentSize,
        newSize: this.dynamicBatchSize,
        avgLoad
      });
    }
  }

  /**
   * Get current dynamic batch size
   */
  getDynamicBatchSize(): number {
    return this.dynamicBatchSize;
  }

  /**
   * HotStuff: Chained consensus for improved throughput
   */
  private processChainedConsensus(message: ConsensusMessage): void {
    if (!this.config.enableHotStuff) return;

    // In HotStuff, we overlap prepare/commit phases
    // This allows pipelining multiple consensus instances
    const chainLength = this.state.sequence - this.state.lastCheckpoint;
    
    if (chainLength >= this.config.maxChainLength) {
      // Create checkpoint to prevent chain from growing too long
      this.createCheckpoint();
    }
  }

  /**
   * Optimistic responsiveness: Skip timeouts when network is healthy
   */
  private shouldUseOptimisticResponse(): boolean {
    return this.config.optimisticResponsiveness && this.getHealthyNodeRatio() > 0.8;
  }

  /**
   * Get ratio of healthy nodes
   */
  private getHealthyNodeRatio(): number {
    // This would integrate with actual health checking
    // For now, assume all registered nodes are healthy
    return 1.0;
  }

  /**
   * Get consensus statistics with batch info
   */
  getStats(): any {
    return {
      view: this.state.view,
      sequence: this.state.sequence,
      isPrimary: this.isPrimary,
      primary: this.getPrimaryId(),
      nodeCount: this.nodes.size,
      quorum: this.quorum(),
      lastCheckpoint: this.state.lastCheckpoint,
      preparedCount: this.state.prepared.size,
      committedCount: this.state.committed.size,
      config: {
        enableBatching: this.config.enableBatching,
        batchSize: this.config.batchSize,
        enableHotStuff: this.config.enableHotStuff,
        optimisticResponsiveness: this.config.optimisticResponsiveness
      }
    };
  }

  /**
   * Stop consensus engine
   */
  stop(): void {
    if (this.viewChangeTimer) clearTimeout(this.viewChangeTimer);
    if (this.consensusTimer) clearTimeout(this.consensusTimer);
    logger.info('ByzantineConsensus', { 
      message: 'Consensus engine stopped',
      finalView: this.state.view,
      finalSequence: this.state.sequence
    });
    this.emit('stopped');
  }
}
