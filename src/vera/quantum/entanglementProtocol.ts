/**
 * Entanglement Protocol
 *
 * Implements quantum-inspired state entanglement between critical agent pairs.
 * When agents become "entangled", they share state changes instantaneously
 * (within network limits), enabling instant failover and state synchronization.
 *
 * Key concepts:
 * - Entangled pairs: Two agents share a quantum-like bond
 * - State teleportation: Changes on one agent reflect on the other
 * - Bell state preservation: Maintains coherence between entangled pairs
 * - Decoherence handling: Graceful handling of network partitions
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

export interface EntangledPair {
  id: string;
  agentA: string;
  agentB: string;
  bellState: 'phi_plus' | 'phi_minus' | 'psi_plus' | 'psi_minus';
  coherenceLevel: number; // 0-1, quantum coherence
  establishedAt: number;
  lastSync: number;
  sharedState: Map<string, any>;
  active: boolean;
}

export interface EntanglementOperation {
  pairId: string;
  operation: 'read' | 'write' | 'teleport' | 'measure';
  key: string;
  value?: any;
  timestamp: number;
  signature: string;
}

export interface EntanglementConfig {
  maxPairs: number;
  coherenceDecayRate: number; // Per second
  syncIntervalMs: number;
  enableTeleportation: boolean;
  bellStateVerification: boolean;
  decoherenceThreshold: number;
}

const DEFAULT_CONFIG: EntanglementConfig = {
  maxPairs: 50,
  coherenceDecayRate: 0.001,
  syncIntervalMs: 1000,
  enableTeleportation: true,
  bellStateVerification: true,
  decoherenceThreshold: 0.3,
};

// Bell state matrices for quantum simulation
const BELL_STATES = {
  phi_plus: [[1, 0], [0, 1]], // |00⟩ + |11⟩
  phi_minus: [[1, 0], [0, -1]], // |00⟩ - |11⟩
  psi_plus: [[0, 1], [1, 0]], // |01⟩ + |10⟩
  psi_minus: [[0, 1], [-1, 0]], // |01⟩ - |10⟩
};

export class EntanglementProtocol extends EventEmitter {
  private pairs: Map<string, EntangledPair> = new Map();
  private agentPairs: Map<string, string> = new Map(); // agentId -> pairId
  private config: EntanglementConfig;
  private isRunning = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private coherenceTimer: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    pairsCreated: 0,
    pairsDecohered: 0,
    stateTeleportations: 0,
    bellVerifications: 0,
    coherenceRestorations: 0,
  };

  constructor(config: Partial<EntanglementConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start entanglement protocol
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Periodic sync between entangled pairs
    this.syncTimer = setInterval(() => {
      this.synchronizeEntangledPairs();
    }, this.config.syncIntervalMs);

    // Coherence monitoring
    this.coherenceTimer = setInterval(() => {
      this.monitorCoherence();
    }, 5000);

    logger.info('EntanglementProtocol', {
      message: 'Entanglement protocol started',
      maxPairs: this.config.maxPairs,
      teleportation: this.config.enableTeleportation,
    });

    this.emit('started');
  }

  /**
   * Stop entanglement protocol
   */
  stop(): void {
    this.isRunning = false;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.coherenceTimer) {
      clearInterval(this.coherenceTimer);
      this.coherenceTimer = null;
    }

    // Decoherence all pairs gracefully
    for (const pair of this.pairs.values()) {
      this.decoherePair(pair.id, 'protocol_stopped');
    }

    logger.info('EntanglementProtocol', {
      message: 'Entanglement protocol stopped',
    });

    this.emit('stopped');
  }

  /**
   * Create entangled pair between two agents
   */
  entangleAgents(agentA: string, agentB: string): EntangledPair | null {
    // Verify agents not already entangled
    if (this.agentPairs.has(agentA) || this.agentPairs.has(agentB)) {
      logger.warn('EntanglementProtocol', {
        message: 'Agent already entangled',
        agentA,
        agentB,
      });
      return null;
    }

    if (this.pairs.size >= this.config.maxPairs) {
      logger.warn('EntanglementProtocol', {
        message: 'Maximum entangled pairs reached',
        max: this.config.maxPairs,
      });
      return null;
    }

    const pairId = this.generatePairId(agentA, agentB);
    const bellState = this.selectBellState(agentA, agentB);

    const pair: EntangledPair = {
      id: pairId,
      agentA,
      agentB,
      bellState,
      coherenceLevel: 1.0,
      establishedAt: Date.now(),
      lastSync: Date.now(),
      sharedState: new Map(),
      active: true,
    };

    this.pairs.set(pairId, pair);
    this.agentPairs.set(agentA, pairId);
    this.agentPairs.set(agentB, pairId);
    this.stats.pairsCreated++;

    logger.info('EntanglementProtocol', {
      message: 'Agents entangled',
      pairId,
      agentA,
      agentB,
      bellState,
    });

    this.emit('pair_created', { pairId, agentA, agentB, bellState });
    return pair;
  }

  /**
   * Break entanglement between agents
   */
  decoherePair(pairId: string, reason: string): boolean {
    const pair = this.pairs.get(pairId);
    if (!pair) return false;

    pair.active = false;
    pair.coherenceLevel = 0;

    this.agentPairs.delete(pair.agentA);
    this.agentPairs.delete(pair.agentB);
    this.pairs.delete(pairId);
    this.stats.pairsDecohered++;

    logger.info('EntanglementProtocol', {
      message: 'Pair decohered',
      pairId,
      reason,
    });

    this.emit('pair_decohered', { pairId, reason });
    return true;
  }

  /**
   * Write state to entangled pair (teleports to both agents)
   */
  writeState(pairId: string, key: string, value: any, sourceAgent: string): boolean {
    const pair = this.pairs.get(pairId);
    if (!pair || !pair.active) return false;

    // Verify source agent is part of pair
    if (pair.agentA !== sourceAgent && pair.agentB !== sourceAgent) {
      return false;
    }

    // Write to shared state
    pair.sharedState.set(key, {
      value,
      timestamp: Date.now(),
      source: sourceAgent,
    });

    // Teleport to other agent
    const targetAgent = pair.agentA === sourceAgent ? pair.agentB : pair.agentA;

    if (this.config.enableTeleportation) {
      this.teleportState(pairId, key, value, sourceAgent, targetAgent);
    }

    pair.lastSync = Date.now();
    this.emit('state_written', { pairId, key, sourceAgent, targetAgent });
    return true;
  }

  /**
   * Read state from entangled pair (collapses wavefunction)
   */
  readState(pairId: string, key: string, readingAgent: string): any | null {
    const pair = this.pairs.get(pairId);
    if (!pair || !pair.active) return null;

    // Verify reading agent is part of pair
    if (pair.agentA !== readingAgent && pair.agentB !== readingAgent) {
      return null;
    }

    const state = pair.sharedState.get(key);
    if (!state) return null;

    // Measurement collapses coherence slightly
    pair.coherenceLevel = Math.max(0, pair.coherenceLevel - 0.01);

    this.emit('state_read', { pairId, key, readingAgent });
    return state.value;
  }

  /**
   * Teleport state to entangled partner
   */
  private teleportState(
    pairId: string,
    key: string,
    value: any,
    sourceAgent: string,
    targetAgent: string
  ): void {
    this.stats.stateTeleportations++;

    // In production, this would send via HCS or direct message
    // For now, emit event for orchestrator to route
    this.emit('teleport', {
      pairId,
      key,
      value,
      sourceAgent,
      targetAgent,
      timestamp: Date.now(),
    });

    logger.debug('EntanglementProtocol', {
      message: 'State teleported',
      pairId,
      key,
      sourceAgent,
      targetAgent,
    });
  }

  /**
   * Synchronize all entangled pairs
   */
  private synchronizeEntangledPairs(): void {
    for (const pair of this.pairs.values()) {
      if (!pair.active) continue;

      // Verify Bell state
      if (this.config.bellStateVerification) {
        this.verifyBellState(pair);
      }

      // Sync any pending state
      this.emit('sync', {
        pairId: pair.id,
        agentA: pair.agentA,
        agentB: pair.agentB,
        sharedState: Object.fromEntries(pair.sharedState),
      });
    }
  }

  /**
   * Verify Bell state of entangled pair
   */
  private verifyBellState(pair: EntangledPair): boolean {
    this.stats.bellVerifications++;

    // Simulate Bell inequality check
    const correlation = this.calculateCorrelation(pair);

    if (correlation < 0.85) {
      // Bell inequality violated - coherence lost
      logger.warn('EntanglementProtocol', {
        message: 'Bell inequality violated - decoherence detected',
        pairId: pair.id,
        correlation,
      });

      this.decoherePair(pair.id, 'bell_violation');
      return false;
    }

    return true;
  }

  /**
   * Calculate quantum correlation between entangled agents
   */
  private calculateCorrelation(pair: EntangledPair): number {
    // Simplified correlation calculation
    const matrix = BELL_STATES[pair.bellState];
    const trace = matrix[0][0] + matrix[1][1];

    // Correlation decreases with coherence decay
    return Math.abs(trace / 2) * pair.coherenceLevel;
  }

  /**
   * Monitor and maintain coherence levels
   */
  private monitorCoherence(): void {
    const now = Date.now();

    for (const pair of this.pairs.values()) {
      if (!pair.active) continue;

      // Natural decoherence over time
      const elapsedSeconds = (now - pair.lastSync) / 1000;
      const decay = elapsedSeconds * this.config.coherenceDecayRate;

      pair.coherenceLevel = Math.max(0, pair.coherenceLevel - decay);

      // Check if coherence below threshold
      if (pair.coherenceLevel < this.config.decoherenceThreshold) {
        logger.warn('EntanglementProtocol', {
          message: 'Coherence below threshold',
          pairId: pair.id,
          coherence: pair.coherenceLevel,
        });

        // Attempt coherence restoration
        this.restoreCoherence(pair);
      }

      // Total decoherence
      if (pair.coherenceLevel <= 0.01) {
        this.decoherePair(pair.id, 'total_decoherence');
      }
    }
  }

  /**
   * Attempt to restore coherence through resynchronization
   */
  private restoreCoherence(pair: EntangledPair): void {
    // Simulate coherence restoration
    pair.coherenceLevel = Math.min(1.0, pair.coherenceLevel + 0.3);
    pair.lastSync = Date.now();
    this.stats.coherenceRestorations++;

    logger.info('EntanglementProtocol', {
      message: 'Coherence restored',
      pairId: pair.id,
      newLevel: pair.coherenceLevel,
    });

    this.emit('coherence_restored', { pairId: pair.id, level: pair.coherenceLevel });
  }

  /**
   * Get pair for an agent
   */
  getPairForAgent(agentId: string): EntangledPair | null {
    const pairId = this.agentPairs.get(agentId);
    if (!pairId) return null;
    return this.pairs.get(pairId) || null;
  }

  /**
   * Select appropriate Bell state for agents
   */
  private selectBellState(agentA: string, agentB: string): EntangledPair['bellState'] {
    // Deterministic selection based on agent IDs
    const hash = crypto.createHash('sha256').update(agentA + agentB).digest('hex');
    const index = parseInt(hash.substr(0, 2), 16) % 4;
    const states: EntangledPair['bellState'][] = ['phi_plus', 'phi_minus', 'psi_plus', 'psi_minus'];
    return states[index];
  }

  /**
   * Generate unique pair ID
   */
  private generatePairId(agentA: string, agentB: string): string {
    const sorted = [agentA, agentB].sort();
    return `ent-${crypto.createHash('sha256').update(sorted.join('-')).digest('hex').substr(0, 16)}`;
  }

  /**
   * Get entanglement statistics
   */
  getStats() {
    const activePairs = Array.from(this.pairs.values()).filter((p) => p.active);

    return {
      ...this.stats,
      activePairs: activePairs.length,
      totalPairs: this.pairs.size,
      averageCoherence:
        activePairs.reduce((sum, p) => sum + p.coherenceLevel, 0) / activePairs.length || 0,
      bellStates: {
        phi_plus: activePairs.filter((p) => p.bellState === 'phi_plus').length,
        phi_minus: activePairs.filter((p) => p.bellState === 'phi_minus').length,
        psi_plus: activePairs.filter((p) => p.bellState === 'psi_plus').length,
        psi_minus: activePairs.filter((p) => p.bellState === 'psi_minus').length,
      },
    };
  }

  /**
   * Get visualization data
   */
  getVisualization(): {
    pairs: Array<{
      id: string;
      agentA: string;
      agentB: string;
      coherence: number;
      bellState: string;
    }>;
    stats: ReturnType<typeof this.getStats>;
  } {
    return {
      pairs: Array.from(this.pairs.values()).map((p) => ({
        id: p.id,
        agentA: p.agentA,
        agentB: p.agentB,
        coherence: p.coherenceLevel,
        bellState: p.bellState,
      })),
      stats: this.getStats(),
    };
  }
}

export default EntanglementProtocol;
