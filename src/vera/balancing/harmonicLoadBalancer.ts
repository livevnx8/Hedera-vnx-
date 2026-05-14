/**
 * Harmonic Load Balancing
 *
 * Distributes tasks across the lattice using wave-interference patterns
 * inspired by sacred geometry. Instead of random or round-robin distribution,
 * tasks flow like energy through the flower of life pattern.
 *
 * Key concepts:
 * - Standing waves: Tasks accumulate at nodes (agents) where waves intersect
 * - Harmonic resonance: Agents with matching capabilities resonate with tasks
 * - Interference patterns: Load naturally balances through constructive/destructive interference
 * - Node density: Higher density regions (inner rings) handle critical tasks
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface HarmonicNode {
  agentId: string;
  amplitude: number; // Current load (0-1)
  frequency: number; // Capability match frequency
  phase: number; // Current phase in wave cycle (0-2π)
  position: { x: number; y: number }; // Geometric position
  capabilities: string[];
  ring: 'inner' | 'middle' | 'outer';
}

export interface WavePacket {
  id: string;
  taskId: string;
  amplitude: number; // Task complexity/difficulty
  frequency: number; // Required capability frequency
  phase: number;
  origin: string; // Source agent/shard
  targetCapabilities: string[];
  timestamp: number;
}

export interface ResonancePattern {
  nodeId: string;
  taskId: string;
  resonanceScore: number; // 0-1, higher = better match
  phaseAlignment: number; // How well phases align
  amplitudeMatch: number; // How well amplitudes balance
  geometricDistance: number;
}

export interface HarmonicConfig {
  wavelength: number;
  dampingFactor: number;
  resonanceThreshold: number;
  interferenceMode: 'constructive' | 'destructive' | 'adaptive';
  rebalanceIntervalMs: number;
}

const DEFAULT_CONFIG: HarmonicConfig = {
  wavelength: 100,
  dampingFactor: 0.7,
  resonanceThreshold: 0.6,
  interferenceMode: 'adaptive',
  rebalanceIntervalMs: 30000,
};

export class HarmonicLoadBalancer extends EventEmitter {
  private nodes: Map<string, HarmonicNode> = new Map();
  private waves: Map<string, WavePacket> = new Map();
  private config: HarmonicConfig;
  private isRunning = false;
  private rebalanceTimer: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    wavesGenerated: 0,
    resonancesDetected: 0,
    tasksBalanced: 0,
    interferenceOptimizations: 0,
  };

  constructor(config: Partial<HarmonicConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start harmonic load balancer
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Periodic rebalancing through interference patterns
    this.rebalanceTimer = setInterval(() => {
      this.rebalanceThroughInterference();
    }, this.config.rebalanceIntervalMs);

    logger.info('HarmonicLoadBalancer', {
      message: 'Harmonic load balancer started',
      wavelength: this.config.wavelength,
      mode: this.config.interferenceMode,
    });

    this.emit('started');
  }

  /**
   * Stop harmonic load balancer
   */
  stop(): void {
    this.isRunning = false;
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }

    logger.info('HarmonicLoadBalancer', { message: 'Harmonic load balancer stopped' });
    this.emit('stopped');
  }

  /**
   * Register a node in the harmonic lattice
   */
  registerNode(
    agentId: string,
    capabilities: string[],
    ring: 'inner' | 'middle' | 'outer',
    position?: { x: number; y: number }
  ): HarmonicNode {
    // Assign position in flower of life pattern if not provided
    const nodePosition = position || this.calculateNodePosition(ring, this.nodes.size);

    const node: HarmonicNode = {
      agentId,
      amplitude: 0,
      frequency: this.calculateFrequency(capabilities),
      phase: Math.random() * 2 * Math.PI,
      position: nodePosition,
      capabilities,
      ring,
    };

    this.nodes.set(agentId, node);

    logger.debug('HarmonicLoadBalancer', {
      message: 'Node registered',
      agentId,
      ring,
      position: nodePosition,
    });

    this.emit('node_registered', node);
    return node;
  }

  /**
   * Calculate node position in flower of life pattern
   */
  private calculateNodePosition(
    ring: 'inner' | 'middle' | 'outer',
    index: number
  ): { x: number; y: number } {
    const ringRadius = {
      inner: 50,
      middle: 100,
      outer: 150,
    }[ring];

    // Flower of life positioning
    const ringCount = {
      inner: 7,
      middle: 13,
      outer: 19,
    }[ring];

    const angle = (index / ringCount) * 2 * Math.PI;

    return {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
    };
  }

  /**
   * Calculate frequency from capabilities
   */
  private calculateFrequency(capabilities: string[]): number {
    // Hash capabilities to frequency
    const hash = capabilities.join(',').split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);

    return 0.1 + (hash % 100) / 100; // 0.1 - 1.1 range
  }

  /**
   * Create a wave packet for a task
   */
  createWave(
    taskId: string,
    taskComplexity: number,
    requiredCapabilities: string[],
    origin: string
  ): WavePacket {
    const wave: WavePacket = {
      id: `wave-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      amplitude: taskComplexity, // 0-1
      frequency: this.calculateFrequency(requiredCapabilities),
      phase: Math.random() * 2 * Math.PI,
      origin,
      targetCapabilities: requiredCapabilities,
      timestamp: Date.now(),
    };

    this.waves.set(wave.id, wave);
    this.stats.wavesGenerated++;

    logger.debug('HarmonicLoadBalancer', {
      message: 'Wave created',
      waveId: wave.id,
      taskId,
      amplitude: wave.amplitude,
      frequency: wave.frequency,
    });

    this.emit('wave_created', wave);
    return wave;
  }

  /**
   * Find resonant nodes for a wave
   */
  findResonantNodes(wave: WavePacket, limit: number = 3): ResonancePattern[] {
    const resonances: ResonancePattern[] = [];

    for (const node of this.nodes.values()) {
      // Calculate resonance score
      const capabilityMatch = this.calculateCapabilityMatch(
        wave.targetCapabilities,
        node.capabilities
      );

      const phaseAlignment = Math.cos(wave.phase - node.phase);
      const amplitudeMatch = 1 - Math.abs(wave.amplitude - node.amplitude);

      const geometricDistance = Math.sqrt(
        Math.pow(node.position.x, 2) + Math.pow(node.position.y, 2)
      );

      // Resonance formula: high capability match + phase alignment + balanced amplitudes
      const resonanceScore =
        capabilityMatch * 0.5 +
        (phaseAlignment + 1) / 2 * 0.3 +
        amplitudeMatch * 0.2;

      if (resonanceScore >= this.config.resonanceThreshold) {
        resonances.push({
          nodeId: node.agentId,
          taskId: wave.taskId,
          resonanceScore,
          phaseAlignment,
          amplitudeMatch,
          geometricDistance,
        });
      }
    }

    // Sort by resonance score
    resonances.sort((a, b) => b.resonanceScore - a.resonanceScore);

    this.stats.resonancesDetected += resonances.length;

    return resonances.slice(0, limit);
  }

  /**
   * Calculate capability match between wave and node
   */
  private calculateCapabilityMatch(required: string[], available: string[]): number {
    if (required.length === 0) return 1;

    const matches = required.filter((cap) => available.includes(cap)).length;
    return matches / required.length;
  }

  /**
   * Route task using harmonic resonance
   */
  routeTask(taskId: string, requiredCapabilities: string[], complexity: number = 0.5): {
    candidates: ResonancePattern[];
    recommended: string | null;
  } {
    // Create wave for this task
    const wave = this.createWave(taskId, complexity, requiredCapabilities, 'orchestrator');

    // Find resonant nodes
    const resonances = this.findResonantNodes(wave, 3);

    if (resonances.length === 0) {
      return { candidates: [], recommended: null };
    }

    // Top resonance is recommended
    const recommended = resonances[0].nodeId;

    logger.debug('HarmonicLoadBalancer', {
      message: 'Task routed via harmonic resonance',
      taskId,
      recommended,
      resonanceScore: resonances[0].resonanceScore,
      alternatives: resonances.slice(1).map((r) => r.nodeId),
    });

    this.emit('task_routed', { taskId, recommended, resonances });

    return { candidates: resonances, recommended };
  }

  /**
   * Update node amplitude (load)
   */
  updateNodeLoad(agentId: string, load: number): void {
    const node = this.nodes.get(agentId);
    if (!node) return;

    node.amplitude = Math.max(0, Math.min(1, load));
    node.phase = (node.phase + Math.PI / 4) % (2 * Math.PI); // Phase shift on load change

    this.emit('node_updated', node);
  }

  /**
   * Rebalance through wave interference
   */
  private rebalanceThroughInterference(): void {
    if (this.nodes.size < 2) return;

    const nodes = Array.from(this.nodes.values());

    // Find nodes with high amplitude (overloaded)
    const overloaded = nodes.filter((n) => n.amplitude > 0.8);
    const underloaded = nodes.filter((n) => n.amplitude < 0.3);

    if (overloaded.length === 0 || underloaded.length === 0) return;

    // Redistribute load using interference pattern
    for (const high of overloaded) {
      // Find nearest underloaded node with similar capabilities
      const candidates = underloaded.filter((low) =>
        this.calculateCapabilityMatch(high.capabilities, low.capabilities) > 0.5
      );

      if (candidates.length > 0) {
        // Apply interference - transfer some amplitude
        const transfer = (high.amplitude - 0.5) * this.config.dampingFactor;
        high.amplitude -= transfer;
        candidates[0].amplitude += transfer;

        this.stats.tasksBalanced++;
        this.stats.interferenceOptimizations++;

        logger.debug('HarmonicLoadBalancer', {
          message: 'Load rebalanced through interference',
          from: high.agentId,
          to: candidates[0].agentId,
          transfer,
        });

        this.emit('load_rebalanced', {
          from: high.agentId,
          to: candidates[0].agentId,
          transfer,
        });
      }
    }
  }

  /**
   * Get standing wave visualization
   */
  getStandingWaveVisualization(): {
    nodes: HarmonicNode[];
    waves: WavePacket[];
    interferencePattern: Array<{ x: number; y: number; intensity: number }>;
  } {
    // Calculate interference pattern on grid
    const grid: Array<{ x: number; y: number; intensity: number }> = [];
    const gridSize = 20;
    const maxRadius = 200;

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = (i / gridSize) * 2 * maxRadius - maxRadius;
        const y = (j / gridSize) * 2 * maxRadius - maxRadius;

        let intensity = 0;
        for (const node of this.nodes.values()) {
          const distance = Math.sqrt(
            Math.pow(x - node.position.x, 2) + Math.pow(y - node.position.y, 2)
          );
          const wave = node.amplitude * Math.sin((2 * Math.PI * distance) / this.config.wavelength + node.phase);
          intensity += wave;
        }

        grid.push({ x, y, intensity: intensity / this.nodes.size });
      }
    }

    return {
      nodes: Array.from(this.nodes.values()),
      waves: Array.from(this.waves.values()),
      interferencePattern: grid,
    };
  }

  /**
   * Get harmonic statistics
   */
  getStats() {
    return {
      ...this.stats,
      nodeCount: this.nodes.size,
      activeWaves: this.waves.size,
      averageLoad:
        Array.from(this.nodes.values()).reduce((sum, n) => sum + n.amplitude, 0) /
          this.nodes.size || 0,
      wavelength: this.config.wavelength,
      interferenceMode: this.config.interferenceMode,
    };
  }

  /**
   * Remove a node
   */
  removeNode(agentId: string): boolean {
    const removed = this.nodes.delete(agentId);
    if (removed) {
      this.emit('node_removed', { agentId });
    }
    return removed;
  }

  /**
   * Clear expired waves
   */
  clearExpiredWaves(maxAgeMs: number = 60000): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, wave] of this.waves) {
      if (now - wave.timestamp > maxAgeMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.waves.delete(id);
    }
  }
}

export default HarmonicLoadBalancer;
