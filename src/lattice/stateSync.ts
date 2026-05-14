/**
 * State Synchronization - CRDT-based State Management
 * 
 * Implements conflict-free replicated data types for distributed state
 * Ensures eventual consistency across the lattice
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface CRDTState {
  id: string;
  type: 'gset' | 'lww' | 'pncounter' | 'ormap';
  data: any;
  timestamp: number;
  nodeId: string;
  vectorClock: Record<string, number>;
}

export interface StateDelta {
  stateId: string;
  changes: any[];
  fromVectorClock: Record<string, number>;
  toVectorClock: Record<string, number>;
}

export interface SyncConfig {
  syncInterval: number;
  maxDeltaSize: number;
  compressionEnabled: boolean;
}

/**
 * G-Set (Grow-only Set) CRDT
 */
export class GSet<T> {
  private elements: Set<T> = new Set();

  add(element: T): void {
    this.elements.add(element);
  }

  has(element: T): boolean {
    return this.elements.has(element);
  }

  merge(other: GSet<T>): void {
    for (const elem of Array.from(other.elements)) {
      this.elements.add(elem);
    }
  }

  toArray(): T[] {
    return Array.from(this.elements);
  }

  getState(): T[] {
    return this.toArray();
  }
}

/**
 * LWW-Register (Last-Write-Wins) CRDT
 */
export class LWWRegister<T> {
  private value: T | null = null;
  private timestamp: number = 0;
  private nodeId: string = '';

  set(value: T, timestamp: number, nodeId: string): void {
    if (timestamp > this.timestamp || 
        (timestamp === this.timestamp && nodeId > this.nodeId)) {
      this.value = value;
      this.timestamp = timestamp;
      this.nodeId = nodeId;
    }
  }

  get(): T | null {
    return this.value;
  }

  merge(other: LWWRegister<T>): void {
    if (other.timestamp > this.timestamp ||
        (other.timestamp === this.timestamp && other.nodeId > this.nodeId)) {
      this.value = other.value;
      this.timestamp = other.timestamp;
      this.nodeId = other.nodeId;
    }
  }
}

/**
 * PN-Counter (Positive-Negative Counter) CRDT
 */
export class PNCounter {
  private increments: Map<string, number> = new Map();
  private decrements: Map<string, number> = new Map();

  increment(nodeId: string, amount: number = 1): void {
    const current = this.increments.get(nodeId) || 0;
    this.increments.set(nodeId, current + amount);
  }

  decrement(nodeId: string, amount: number = 1): void {
    const current = this.decrements.get(nodeId) || 0;
    this.decrements.set(nodeId, current + amount);
  }

  value(): number {
    const inc = Array.from(this.increments.values()).reduce((a, b) => a + b, 0);
    const dec = Array.from(this.decrements.values()).reduce((a, b) => a + b, 0);
    return inc - dec;
  }

  merge(other: PNCounter): void {
    for (const [nodeId, value] of Array.from(other.increments)) {
      const current = this.increments.get(nodeId) || 0;
      this.increments.set(nodeId, Math.max(current, value));
    }
    for (const [nodeId, value] of Array.from(other.decrements)) {
      const current = this.decrements.get(nodeId) || 0;
      this.decrements.set(nodeId, Math.max(current, value));
    }
  }
}

export class StateSync extends EventEmitter {
  private states: Map<string, CRDTState> = new Map();
  private localNodeId: string;
  private vectorClock: Record<string, number> = {};
  private config: SyncConfig;
  private syncInterval: NodeJS.Timeout | null = null;
  private pendingDeltas: StateDelta[] = [];

  constructor(localNodeId: string, config: Partial<SyncConfig> = {}) {
    super();
    this.localNodeId = localNodeId;
    this.config = {
      syncInterval: config.syncInterval || 1000,
      maxDeltaSize: config.maxDeltaSize || 1000,
      compressionEnabled: config.compressionEnabled !== false
    };
    this.vectorClock[localNodeId] = 0;
  }

  /**
   * Initialize state synchronization
   */
  async initialize(): Promise<void> {
    logger.info('StateSync', { 
      nodeId: this.localNodeId,
      message: 'Initializing state synchronization' 
    });

    this.startSyncLoop();
    this.emit('initialized');
  }

  /**
   * Create a new CRDT state
   */
  createState<T>(id: string, type: CRDTState['type'], initialValue: T): CRDTState {
    const state: CRDTState = {
      id,
      type,
      data: initialValue,
      timestamp: Date.now(),
      nodeId: this.localNodeId,
      vectorClock: { ...this.vectorClock }
    };

    this.states.set(id, state);
    this.incrementVectorClock();
    
    this.emit('state_created', state);
    return state;
  }

  /**
   * Update state with CRDT semantics
   */
  updateState(id: string, operation: string, value: any): void {
    const state = this.states.get(id);
    if (!state) {
      logger.warn('StateSync', { stateId: id, message: 'State not found' });
      return;
    }

    this.incrementVectorClock();
    state.vectorClock = { ...this.vectorClock };
    state.timestamp = Date.now();
    state.nodeId = this.localNodeId;

    // Apply operation based on CRDT type
    switch (state.type) {
      case 'gset':
        this.applyGSetOperation(state, operation, value);
        break;
      case 'lww':
        this.applyLWWOperation(state, operation, value);
        break;
      case 'pncounter':
        this.applyPNCounterOperation(state, operation, value);
        break;
      case 'ormap':
        this.applyORMapOperation(state, operation, value);
        break;
    }

    this.emit('state_updated', state);
  }

  /**
   * Get state by ID
   */
  getState(id: string): any {
    const state = this.states.get(id);
    return state ? state.data : null;
  }

  /**
   * Calculate delta for synchronization
   */
  calculateDelta(targetVectorClock: Record<string, number>): StateDelta | null {
    const changes: any[] = [];

    for (const [stateId, state] of Array.from(this.states)) {
      // Check if this state is newer than what target has
      if (this.isNewerThan(state.vectorClock, targetVectorClock)) {
        changes.push({
          stateId,
          type: state.type,
          data: state.data,
          timestamp: state.timestamp,
          nodeId: state.nodeId,
          vectorClock: state.vectorClock
        });
      }
    }

    if (changes.length === 0) return null;

    return {
      stateId: 'batch',
      changes: changes.slice(0, this.config.maxDeltaSize),
      fromVectorClock: targetVectorClock,
      toVectorClock: { ...this.vectorClock }
    };
  }

  /**
   * Apply delta from remote node
   */
  applyDelta(delta: StateDelta): void {
    for (const change of delta.changes) {
      const existingState = this.states.get(change.stateId);

      if (!existingState) {
        // New state - just add it
        this.states.set(change.stateId, {
          id: change.stateId,
          type: change.type,
          data: change.data,
          timestamp: change.timestamp,
          nodeId: change.nodeId,
          vectorClock: change.vectorClock
        });
      } else {
        // Merge CRDTs
        this.mergeCRDTs(existingState, change);
      }
    }

    // Update vector clock
    for (const [nodeId, time] of Object.entries(delta.toVectorClock)) {
      this.vectorClock[nodeId] = Math.max(this.vectorClock[nodeId] || 0, time);
    }

    this.emit('delta_applied', delta);
  }

  /**
   * Generate Merkle tree for quick state comparison
   */
  generateMerkleRoot(): string {
    const stateHashes = Array.from(this.states.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, state]) => this.hashState(state));

    return this.computeMerkleRoot(stateHashes);
  }

  /**
   * Private methods
   */
  private incrementVectorClock(): void {
    this.vectorClock[this.localNodeId] = (this.vectorClock[this.localNodeId] || 0) + 1;
  }

  private isNewerThan(clockA: Record<string, number>, clockB: Record<string, number>): boolean {
    let hasNewer = false;
    
    for (const [nodeId, time] of Object.entries(clockA)) {
      const otherTime = clockB[nodeId] || 0;
      if (time > otherTime) {
        hasNewer = true;
      } else if (time < otherTime) {
        // Other has newer entry - not strictly newer
        return false;
      }
    }

    return hasNewer;
  }

  private applyGSetOperation(state: CRDTState, operation: string, value: any): void {
    if (operation === 'add') {
      const set = new GSet();
      // Restore existing data
      if (Array.isArray(state.data)) {
        for (const item of state.data) {
          set.add(item);
        }
      }
      set.add(value);
      state.data = set.toArray();
    }
  }

  private applyLWWOperation(state: CRDTState, operation: string, value: any): void {
    if (operation === 'set') {
      state.data = value;
    }
  }

  private applyPNCounterOperation(state: CRDTState, operation: string, value: number): void {
    const counter = new PNCounter();
    // Restore counter state
    if (Array.isArray(state.data)) {
      const [incs, decs] = state.data;
      for (const [k, v] of Object.entries(incs || {})) counter.increment(k, v as number);
      for (const [k, v] of Object.entries(decs || {})) counter.decrement(k, v as number);
    }

    if (operation === 'increment') {
      counter.increment(this.localNodeId, value);
    } else if (operation === 'decrement') {
      counter.decrement(this.localNodeId, value);
    }

    state.data = [counter['increments'], counter['decrements']];
  }

  private applyORMapOperation(state: CRDTState, operation: string, value: any): void {
    if (!state.data) state.data = {};
    
    if (operation === 'set') {
      state.data[value.key] = value.value;
    } else if (operation === 'delete') {
      delete state.data[value.key];
    }
  }

  private mergeCRDTs(existing: CRDTState, incoming: any): void {
    switch (existing.type) {
      case 'gset':
        const setA = new GSet();
        const setB = new GSet();
        // Restore existing data
        if (Array.isArray(existing.data)) {
          for (const item of existing.data) setA.add(item);
        }
        if (Array.isArray(incoming.data)) {
          for (const item of incoming.data) setB.add(item);
        }
        setA.merge(setB);
        existing.data = setA.toArray();
        break;
      case 'lww':
        if (incoming.timestamp > existing.timestamp ||
            (incoming.timestamp === existing.timestamp && incoming.nodeId > existing.nodeId)) {
          existing.data = incoming.data;
          existing.timestamp = incoming.timestamp;
          existing.nodeId = incoming.nodeId;
        }
        break;
      case 'pncounter':
        // Merge counters
        existing.data = this.mergeCounters(existing.data, incoming.data);
        break;
      case 'ormap':
        // Merge maps (LWW per key)
        existing.data = { ...existing.data, ...incoming.data };
        break;
    }
  }

  private mergeCounters(a: any[], b: any[]): any[] {
    const mergedIncs = new Map();
    const mergedDecs = new Map();

    for (const [k, v] of Object.entries(a[0] || {})) mergedIncs.set(k, v as number);
    for (const [k, v] of Object.entries(b[0] || {})) {
      mergedIncs.set(k, Math.max(mergedIncs.get(k) || 0, v as number));
    }

    for (const [k, v] of Object.entries(a[1] || {})) mergedDecs.set(k, v as number);
    for (const [k, v] of Object.entries(b[1] || {})) {
      mergedDecs.set(k, Math.max(mergedDecs.get(k) || 0, v as number));
    }

    return [Object.fromEntries(mergedIncs), Object.fromEntries(mergedDecs)];
  }

  private hashState(state: CRDTState): string {
    const str = `${state.id}:${JSON.stringify(state.data)}:${state.timestamp}`;
    return this.hashString(str);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private computeMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];

    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      nextLevel.push(this.hashString(left + right));
    }

    return this.computeMerkleRoot(nextLevel);
  }

  private startSyncLoop(): void {
    this.syncInterval = setInterval(() => {
      if (this.pendingDeltas.length > 0) {
        this.emit('sync_ready', this.pendingDeltas);
        this.pendingDeltas = [];
      }
    }, this.config.syncInterval);
  }

  /**
   * Get sync statistics
   */
  getStats(): any {
    return {
      stateCount: this.states.size,
      vectorClock: this.vectorClock,
      pendingDeltas: this.pendingDeltas.length,
      config: this.config
    };
  }

  /**
   * Stop synchronization
   */
  stop(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    logger.info('StateSync', { message: 'State synchronization stopped' });
    this.emit('stopped');
  }
}
