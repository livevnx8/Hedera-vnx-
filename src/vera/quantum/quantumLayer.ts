/**
 * Vera Quantum Entanglement Layer
 * 
 * Simulates quantum phenomena for the Flower of Life lattice:
 * - Quantum entanglement between nodes
 * - Superposition states
 * - Quantum tunneling
 * - Wave function collapse (measurement)
 * 
 * @module vera/quantum/quantumLayer
 */

import { EventEmitter } from 'events';

export interface QuantumState {
  amplitude: number;      // 0-1 probability amplitude
  phase: number;          // 0-2π phase angle
  superposition: boolean; // Is in superposition?
  entangledWith: string[]; // Node IDs this is entangled with
  coherence: number;      // Quantum coherence (0-1)
  lastMeasurement?: number;
}

export interface EntanglementPair {
  nodeA: string;
  nodeB: string;
  strength: number;       // 0-1 entanglement strength
  createdAt: number;
  coherence: number;
}

export interface QuantumTunnel {
  id: string;
  fromNode: string;
  toNode: string;
  probability: number;    // Tunneling probability
  distance: number;       // Effective distance
  lastUsed?: number;
}

export class QuantumLayer extends EventEmitter {
  private states = new Map<string, QuantumState>();
  private entanglements = new Map<string, EntanglementPair>();
  private tunnels = new Map<string, QuantumTunnel>();
  private coherenceDecay = 0.99; // Coherence decay per tick
  private initialized = false;

  constructor() {
    super();
    this.startCoherenceLoop();
  }

  /**
   * Initialize quantum layer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[Quantum] Initializing entanglement layer...');
    
    // Create initial superposition states for all lattice nodes
    const nodeIds = ['core', 'l1-0', 'l1-1', 'l1-2', 'l1-3', 'l1-4', 'l1-5',
                     'l2-0', 'l2-1', 'l2-2', 'l2-3', 'l2-4', 'l2-5',
                     'l3-0', 'l3-1', 'l3-2', 'l3-3', 'l3-4', 'l3-5'];
    
    for (const id of nodeIds) {
      this.states.set(id, {
        amplitude: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        superposition: true,
        entangledWith: [],
        coherence: 1.0,
      });
    }

    this.initialized = true;
    this.emit('initialized');
    console.log('[Quantum] Layer initialized with', nodeIds.length, 'nodes');
  }

  /**
   * Start coherence decay loop
   */
  private startCoherenceLoop(): void {
    setInterval(() => {
      for (const [id, state] of this.states) {
        if (state.entangledWith.length === 0) {
          // Decay coherence for unentangled states
          state.coherence *= this.coherenceDecay;
        } else {
          // Entangled states maintain higher coherence
          state.coherence = Math.min(1.0, state.coherence * 1.01);
        }

        // Remove from superposition if coherence too low
        if (state.coherence < 0.1 && state.superposition) {
          state.superposition = false;
          this.emit('decoherence', { nodeId: id });
        }
      }
    }, 1000);
  }

  /**
   * Get quantum state for a node
   */
  getState(nodeId: string): QuantumState | undefined {
    return this.states.get(nodeId);
  }

  /**
   * Set superposition for a node
   */
  setSuperposition(nodeId: string, states: number[]): void {
    const state = this.states.get(nodeId);
    if (!state) return;

    // Normalize amplitudes
    const total = Math.sqrt(states.reduce((sum, amp) => sum + amp * amp, 0));
    const normalized = states.map(amp => amp / total);

    state.amplitude = normalized[0] || 0.5;
    state.superposition = normalized.length > 1;
    state.coherence = 1.0;

    this.emit('superposition_set', { nodeId, amplitudes: normalized });
  }

  /**
   * Entangle two nodes
   */
  entangle(nodeA: string, nodeB: string, strength: number = 0.8): { success: boolean; pairId: string; strength: number } {
    const stateA = this.states.get(nodeA);
    const stateB = this.states.get(nodeB);

    if (!stateA || !stateB) {
      return { success: false, pairId: '', strength: 0 };
    }

    const pairId = `${nodeA}-${nodeB}`;
    
    this.entanglements.set(pairId, {
      nodeA,
      nodeB,
      strength: Math.min(1.0, strength),
      createdAt: Date.now(),
      coherence: 1.0,
    });

    // Update entangled lists
    if (!stateA.entangledWith.includes(nodeB)) {
      stateA.entangledWith.push(nodeB);
    }
    if (!stateB.entangledWith.includes(nodeA)) {
      stateB.entangledWith.push(nodeA);
    }

    this.emit('entangled', { nodeA, nodeB, strength });
    return { success: true, pairId, strength };
  }

  /**
   * Initialize a single node if it doesn't exist
   */
  private initializeNode(nodeId: string): void {
    if (!this.states.has(nodeId)) {
      this.states.set(nodeId, {
        amplitude: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        superposition: true,
        entangledWith: [],
        coherence: 1.0,
      });
    }
  }

  /**
   * Disentangle nodes
   */
  disentangle(nodeA: string, nodeB: string): boolean {
    const pairId = `${nodeA}-${nodeB}`;
    const reverseId = `${nodeB}-${nodeA}`;

    const pair = this.entanglements.get(pairId) || this.entanglements.get(reverseId);
    if (!pair) return false;

    this.entanglements.delete(pairId);
    this.entanglements.delete(reverseId);

    // Update state entangled lists
    const stateA = this.states.get(nodeA);
    const stateB = this.states.get(nodeB);
    
    if (stateA) {
      stateA.entangledWith = stateA.entangledWith.filter(id => id !== nodeB);
    }
    if (stateB) {
      stateB.entangledWith = stateB.entangledWith.filter(id => id !== nodeA);
    }

    this.emit('disentangled', { nodeA, nodeB });
    return true;
  }

  /**
   * Measure (collapse) a quantum state
   */
  collapse(nodeId: string): { value: number; state: '0' | '1' | 'superposition' } {
    const state = this.states.get(nodeId);
    if (!state) {
      return { value: 0, state: 'superposition' };
    }

    // Simulate measurement
    const probability = state.amplitude * state.amplitude;
    const measured = Math.random() < probability ? 1 : 0;

    // Collapse wave function
    state.amplitude = measured === 1 ? 1 : 0;
    state.superposition = false;
    state.lastMeasurement = Date.now();
    state.coherence = 0; // Collapsed states lose coherence

    // If entangled, collapse partner too
    if (state.entangledWith.length > 0) {
      const partnerId = state.entangledWith[0];
      const partner = this.states.get(partnerId);
      if (partner) {
        partner.amplitude = measured === 1 ? 1 : 0;
        partner.superposition = false;
        partner.coherence = 0;
        partner.lastMeasurement = Date.now();
      }
    }

    this.emit('collapsed', { nodeId, measured });
    return { value: measured, state: measured === 1 ? '1' : '0' };
  }

  /**
   * Create quantum tunnel between nodes
   */
  createTunnel(fromNode: string, toNode: string): QuantumTunnel {
    const id = `tunnel-${fromNode}-${toNode}`;
    
    const tunnel: QuantumTunnel = {
      id,
      fromNode,
      toNode,
      probability: 0.5 + Math.random() * 0.5,
      distance: Math.random() * 10,
    };

    this.tunnels.set(id, tunnel);
    return tunnel;
  }

  /**
   * Attempt quantum tunneling
   */
  attemptTunnel(fromNode: string, toNode: string, payload: any): { success: boolean; tunnelId?: string } {
    const tunnelId = `tunnel-${fromNode}-${toNode}`;
    const tunnel = this.tunnels.get(tunnelId);

    if (!tunnel) {
      // Create tunnel on first use
      const newTunnel = this.createTunnel(fromNode, toNode);
      
      // Attempt tunneling
      if (Math.random() < newTunnel.probability) {
        newTunnel.lastUsed = Date.now();
        this.emit('tunnel_success', { fromNode, toNode, payload });
        return { success: true, tunnelId: newTunnel.id };
      }
      
      return { success: false };
    }

    // Existing tunnel
    if (Math.random() < tunnel.probability) {
      tunnel.lastUsed = Date.now();
      this.emit('tunnel_success', { fromNode, toNode, payload });
      return { success: true, tunnelId: tunnel.id };
    }

    return { success: false };
  }

  /**
   * Teleport state between nodes
   */
  teleport(fromNode: string, toNode: string, state: any): { success: boolean; fidelity: number } {
    const from = this.states.get(fromNode);
    const to = this.states.get(toNode);

    if (!from || !to) {
      return { success: false, fidelity: 0 };
    }

    // Check if entangled (required for teleportation)
    const isEntangled = from.entangledWith.includes(toNode);
    
    if (!isEntangled) {
      // Attempt to entangle first
      this.entangle(fromNode, toNode, 0.9);
    }

    // Simulate teleportation
    const fidelity = isEntangled ? 0.95 + Math.random() * 0.05 : 0.7 + Math.random() * 0.2;
    
    // Copy quantum state
    to.amplitude = from.amplitude;
    to.phase = from.phase;
    to.superposition = from.superposition;
    to.coherence = from.coherence * 0.9; // Some loss in teleportation

    // Destroy original state (no-cloning theorem simulation)
    from.coherence = 0;
    from.superposition = false;

    this.emit('teleported', { fromNode, toNode, fidelity, state });
    return { success: fidelity > 0.8, fidelity };
  }

  /**
   * Get entanglement state for the entire lattice
   */
  getEntanglementState(): {
    totalNodes: number;
    entangledPairs: number;
    averageCoherence: number;
    superpositionCount: number;
    tunnels: number;
  } {
    let totalCoherence = 0;
    let superpositionCount = 0;

    for (const state of this.states.values()) {
      totalCoherence += state.coherence;
      if (state.superposition) superpositionCount++;
    }

    return {
      totalNodes: this.states.size,
      entangledPairs: this.entanglements.size,
      averageCoherence: this.states.size > 0 ? totalCoherence / this.states.size : 0,
      superpositionCount,
      tunnels: this.tunnels.size,
    };
  }

  /**
   * Get all tunnels
   */
  getTunnels(): QuantumTunnel[] {
    return Array.from(this.tunnels.values());
  }

  /**
   * Get all entanglements for a node
   */
  getEntanglements(nodeId: string): EntanglementPair[] {
    return Array.from(this.entanglements.values())
      .filter(e => e.nodeA === nodeId || e.nodeB === nodeId);
  }

  /**
   * Reset all quantum states
   */
  reset(): void {
    this.states.clear();
    this.entanglements.clear();
    this.tunnels.clear();
    this.emit('reset');
  }

  /**
   * Perform a quantum handshake between two nodes and log to HCS
   * This establishes quantum entanglement and logs the handshake consensus
   */
  performQuantumHandshake(
    nodeA: string,
    nodeB: string,
    topicId?: string,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): {
    success: boolean;
    handshakeId: string;
    fidelity: number;
    hashscanUrl?: string;
  } {
    const handshakeId = `qh-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Step 1: Initialize quantum states for both nodes if not present
    this.initializeNode(nodeA);
    this.initializeNode(nodeB);
    
    // Step 2: Establish entanglement
    const entangleResult = this.entangle(nodeA, nodeB, 0.95);
    
    // Step 3: Calculate handshake fidelity
    const stateA = this.states.get(nodeA);
    const stateB = this.states.get(nodeB);
    const fidelity = Math.min(stateA?.coherence ?? 0, stateB?.coherence ?? 0) * entangleResult.strength;
    
    // Step 4: Prepare HCS log entry
    const handshakeLog = {
      type: 'quantum-handshake',
      handshakeId,
      nodeA,
      nodeB,
      timestamp: Date.now(),
      fidelity,
      entanglementStrength: entangleResult.strength,
      coherenceA: stateA?.coherence ?? 0,
      coherenceB: stateB?.coherence ?? 0,
      protocol: 'BB84-variant',
      verificationHash: this.generateHandshakeHash(nodeA, nodeB, handshakeId)
    };
    
    // Step 5: Emit handshake data for external logging (HCS, console, etc.)
    this.emit('handshakeData', {
      handshakeId,
      nodeA,
      nodeB,
      fidelity,
      entanglementStrength: entangleResult.strength,
      coherenceA: stateA?.coherence ?? 0,
      coherenceB: stateB?.coherence ?? 0,
      protocol: 'BB84-variant',
      verificationHash: this.generateHandshakeHash(nodeA, nodeB, handshakeId),
      timestamp: Date.now(),
      topicId // Pass through for external logger to use
    });
    
    this.emit('handshakeComplete', {
      handshakeId,
      nodeA,
      nodeB,
      fidelity,
      topicId
    });
    
    // Generate HashScan URL if topicId provided
    const hashscanUrl = topicId 
      ? `https://hashscan.io/${network}/topic/${topicId}`
      : undefined;
    
    return {
      success: fidelity > 0.8,
      handshakeId,
      fidelity,
      hashscanUrl
    };
  }

  /**
   * Generate verification hash for handshake integrity
   */
  private generateHandshakeHash(nodeA: string, nodeB: string, handshakeId: string): string {
    const data = `${nodeA}:${nodeB}:${handshakeId}:${Date.now()}`;
    // Simple hash for verification (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}

// Singleton instance
export const quantumLayer = new QuantumLayer();
