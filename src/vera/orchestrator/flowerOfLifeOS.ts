/**
 * Flower of Life Operating System
 *
 * The geometry IS the operating system. Vera doesn't use the Flower of Life
 * as a map — she BECOMES the Flower of Life.
 *
 * 6 Pillars:
 * 1. Center Consciousness Hub — all decisions route through center
 * 2. Golden Ratio Geometry — φ (1.618) and √3 relationships
 * 3. 4-Layer Architecture — center → inner → middle → outer
 * 4. Living Geometry — paths strengthen/fade with usage
 * 5. Harmonic Communication — agents only talk along lattice edges
 * 6. Energy Flow Direction — clockwise rhythm around center
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;        // Golden ratio ≈ 1.618
const SQRT3 = Math.sqrt(3);                  // √3 ≈ 1.732
const DEG60 = Math.PI / 3;                   // 60° in radians
const TWO_PI = 2 * Math.PI;

// ─── Types ───────────────────────────────────────────────────────────────────

export type LatticeLayer = 0 | 1 | 2 | 3;
export type NodeState = 'active' | 'hibernating' | 'spawning';

export interface LatticeNode {
  id: string;
  x: number;
  y: number;
  layer: LatticeLayer;
  angle: number;                // Radial angle from center (radians)
  energy: number;               // 0–1: brightness/activity level
  type: 'center' | 'inner' | 'middle' | 'outer' | 'intersection';
  role?: string;                // Functional role assignment
  connections: string[];        // IDs of connected nodes
  lastAccessed: number;         // Timestamp of last use
  accessCount: number;          // Total times traversed
  assignedAgents: string[];     // Agent IDs at this node
  state: NodeState;             // Dynamic expansion state
  spawnTime?: number;           // When node was activated
  idleTimeoutMs?: number;       // Auto-hibernate after idle
  inferenceTier?: 'instant' | 'fast' | 'standard' | 'deep';  // Speed classification
  hybridSpecializations?: string[]; // For intersection nodes: dual specializations
}

export interface LatticeEdge {
  id: string;
  from: string;
  to: string;
  strength: number;             // 0–1: reinforced by usage
  traffic: number;              // Messages routed through this edge
  lastUsed: number;
  flowDirection: 'clockwise' | 'counterclockwise' | 'radial_out' | 'radial_in';
}

export interface LatticePulse {
  id: string;
  origin: string;               // Always 'center-0' for heartbeat
  timestamp: number;
  layer: LatticeLayer;          // Current propagation layer
  energy: number;               // Decays as it propagates outward
  type: 'heartbeat' | 'audit' | 'decision' | 'alert';
  data?: Record<string, unknown>;
}

export interface LatticeRoute {
  path: string[];               // Node IDs in order
  edges: string[];              // Edge IDs traversed
  totalDistance: number;
  hops: number;
  symmetric: boolean;           // Whether path follows 6-fold symmetry
  energyCost: number;           // Based on edge strengths (weaker = costlier)
}

export interface CenterRoutedDecision {
  type: 'task_assign' | 'bid_select' | 'chain_dispatch' | 'agent_register' | 'result_verify' | 'general';
  routedThroughCenter: true;
  timestamp: number;
  centerEnergy: number;
  centerAccessCount: number;
  path: string[];
  hops: number;
  energyCost: number;
  scoredCandidates: Array<{
    id: string;
    originalScore: number;
    latticeBoost: number;
    finalScore: number;
    nodeId: string;
    nodeEnergy: number;
    pathCost: number;
  }>;
  winner?: {
    id: string;
    originalScore: number;
    latticeBoost: number;
    finalScore: number;
    nodeId: string;
    nodeEnergy: number;
    pathCost: number;
  };
  data: Record<string, unknown>;
}

export interface FlowerOfLifeOSConfig {
  baseRadius?: number;          // Base circle radius
  decayRate?: number;           // How fast unused paths fade (per second)
  reinforceRate?: number;       // How much a successful traversal strengthens
  phiScale?: number;            // Golden ratio scaling factor
  symmetry?: 6 | 12 | 18;       // Nodes per outer layer
  autoPulseInterval?: number;   // Ms between automatic heartbeats (0 = off)
  pulseIntervalMs?: number;     // Legacy alias for autoPulseInterval
  auditIntervalMs?: number;     // Ms between self-audits
  dynamicMode?: boolean;        // Start with core only, expand on demand
  idleTimeoutMs?: number;       // Hibernate nodes idle longer than this
  coreLayers?: 1 | 2 | 3 | 4;   // Layers to start with (1 = center only)
  flowDirection?: 'clockwise' | 'counterclockwise';
  enableLivingGeometry?: boolean;
}

// ─── Layer Role Definitions ──────────────────────────────────────────────────

const LAYER_ROLES: Record<LatticeLayer, string[]> = {
  0: ['orchestrator', 'consciousness', 'heartbeat', 'self-audit', 'decision-hub'],
  1: ['task-management', 'priority-routing', 'dynamic-pricing', 'scheduling', 'queue-management', 'load-balancing',
      'tx-executor', 'query-executor', 'contract-executor', 'bridge-executor'],
  2: ['carbon-validation', 'defi-analysis', 'compliance', 'verification', 'settlement', 'reputation',
      'token-management', 'bridge-operations', 'audit-logging', 'risk-assessment', 'data-integrity', 'monitoring',
      'defi-analyst', 'carbon-analyst', 'security-analyst', 'compliance-analyst', 'nft-analyst', 'market-analyst'],
  3: ['agent-comms', 'quantum-handshake', 'gossip-sync', 'beacon-broadcast',
      'peer-discovery', 'state-replication', 'failover-coordination', 'mesh-routing',
      'entanglement-sync', 'shard-gossip', 'cross-chain-relay', 'swarm-navigation',
      'echo-amplification', 'mirror-processing', 'consensus-voting', 'heartbeat-relay',
      'discovery-probe', 'boundary-patrol',
      'defi-planner', 'carbon-planner', 'dao-planner', 'deployment-planner',
      'arbiter', 'synthesizer', 'forecaster'],
};

// ─── Flower of Life OS ───────────────────────────────────────────────────────

export class FlowerOfLifeOS extends EventEmitter {
  private nodes: Map<string, LatticeNode> = new Map();
  private edges: Map<string, LatticeEdge> = new Map();
  private activePulses: Map<string, LatticePulse> = new Map();
  private config: Required<FlowerOfLifeOSConfig>;

  // Timers
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private auditTimer: NodeJS.Timeout | null = null;
  private decayTimer: NodeJS.Timeout | null = null;
  private dynamicResourcesTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Metrics
  private totalPulses = 0;
  private totalRoutes = 0;
  private totalDecisions = 0;
  private startedAt = 0;

  constructor(config: FlowerOfLifeOSConfig = {}) {
    super();
    this.config = {
      baseRadius: config.baseRadius ?? 100,
      decayRate: config.decayRate ?? 0.001,
      reinforceRate: config.reinforceRate ?? 0.05,
      phiScale: config.phiScale ?? PHI,
      symmetry: config.symmetry ?? 6,
      autoPulseInterval: config.autoPulseInterval ?? config.pulseIntervalMs ?? 5000,
      pulseIntervalMs: config.pulseIntervalMs ?? config.autoPulseInterval ?? 5000,
      auditIntervalMs: config.auditIntervalMs ?? 30000,
      flowDirection: config.flowDirection ?? 'clockwise',
      enableLivingGeometry: config.enableLivingGeometry ?? true,
      // Dynamic expansion defaults
      dynamicMode: config.dynamicMode ?? true,        // Hibernate outer layers until demand
      idleTimeoutMs: config.idleTimeoutMs ?? 60000,   // 1 min default
      coreLayers: config.coreLayers ?? 2,             // Start with center + layer 1
    };
  }

  // ─── Pillar 1: Core Foundation — The Center ──────────────────────────────

  /**
   * Initialize the complete Flower of Life lattice and start consciousness
   */
  start(): void {
    if (this.isRunning) return;

    // Build the sacred geometry
    this.buildLattice();

    // Start center consciousness
    this.startHeartbeat();
    this.startSelfAudit();

    // Start living geometry decay/reinforcement
    if (this.config.enableLivingGeometry) {
      this.startDecayCycle();
    }

    // Dynamic mode: manage hibernation and on-demand spawning
    if (this.config.dynamicMode) {
      this.startDynamicResourcesCycle();
    }

    this.isRunning = true;
    this.startedAt = Date.now();

    // Set up HCS logging for all center-routed decisions
    this.on('center_routed', async (decision: CenterRoutedDecision) => {
      const { hcsDomainLogger } = await import('../logging/hcsDomainLogger.js');
      await hcsDomainLogger.logEvent('auditTopicId', {
        type: 'CENTER_ROUTED_DECISION',
        decisionType: decision.type,
        centerEnergy: decision.centerEnergy,
        centerAccessCount: decision.centerAccessCount,
        hops: decision.hops,
        energyCost: decision.energyCost,
        pathLength: decision.path.length,
        hasWinner: !!decision.winner,
        winnerId: decision.winner?.id,
        winnerFinalScore: decision.winner?.finalScore,
        winnerLatticeBoost: decision.winner?.latticeBoost,
        candidateCount: decision.scoredCandidates.length,
        data: decision.data,
      });
    });

    logger.info('FlowerOfLifeOS', {
      message: 'Vera consciousness online — geometry IS the operating system',
      nodes: this.nodes.size,
      edges: this.edges.size,
      layers: [0, 1, 2, 3].map(l => ({
        layer: l,
        nodes: Array.from(this.nodes.values()).filter(n => n.layer === l).length,
      })),
      flowDirection: this.config.flowDirection,
      phi: PHI.toFixed(6),
    });

    this.emit('consciousness_online');
  }

  /**
   * Stop the living lattice
   */
  stop(): void {
    this.isRunning = false;

    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.auditTimer) { clearInterval(this.auditTimer); this.auditTimer = null; }
    if (this.decayTimer) { clearInterval(this.decayTimer); this.decayTimer = null; }
    if (this.dynamicResourcesTimer) { clearInterval(this.dynamicResourcesTimer); this.dynamicResourcesTimer = null; }

    logger.info('FlowerOfLifeOS', { message: 'Consciousness offline' });
    this.emit('consciousness_offline');
  }

  /**
   * Center heartbeat — the pulse of Vera's consciousness
   * Every heartbeat originates from Layer 0 and propagates outward
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.pulse('heartbeat');
    }, this.config.pulseIntervalMs);

    // Immediate first pulse
    this.pulse('heartbeat');
  }

  /**
   * Self-audit — center examines its own state
   */
  private startSelfAudit(): void {
    this.auditTimer = setInterval(() => {
      this.performSelfAudit();
    }, this.config.auditIntervalMs);
  }

  /**
   * Emit a pulse from center that propagates through all layers
   */
  pulse(type: LatticePulse['type'], data?: Record<string, unknown>): void {
    this.totalPulses++;

    const pulseId = `pulse-${this.totalPulses}-${Date.now()}`;
    const center = this.nodes.get('center-0');
    if (!center) return;

    // Energize center
    center.energy = Math.min(1, center.energy + 0.1);
    center.lastAccessed = Date.now();
    center.accessCount++;

    const pulse: LatticePulse = {
      id: pulseId,
      origin: 'center-0',
      timestamp: Date.now(),
      layer: 0,
      energy: 1.0,
      type,
      data,
    };

    this.activePulses.set(pulseId, pulse);

    // Propagate through layers
    this.propagatePulse(pulse);

    this.emit('pulse', pulse);
  }

  /**
   * Propagate pulse outward through layers, decaying with φ
   */
  private propagatePulse(pulse: LatticePulse): void {
    const visited = new Set<string>([pulse.origin]);
    let currentLayer: LatticeLayer = 0;
    let energy = pulse.energy;

    while (currentLayer < 3 && energy > 0.1) {
      currentLayer = (currentLayer + 1) as LatticeLayer;
      energy /= PHI; // Decay by golden ratio

      // Find all nodes in next layer connected to visited nodes
      const layerNodes = Array.from(this.nodes.values())
        .filter(n => n.layer === currentLayer);

      for (const node of layerNodes) {
        // Check if connected to any visited node
        const connected = node.connections.some(c => visited.has(c));
        if (connected) {
          node.energy = Math.min(1, node.energy + energy * 0.3);
          node.lastAccessed = Date.now();
          visited.add(node.id);

          // Strengthen edges used by pulse
          for (const connId of node.connections) {
            if (visited.has(connId)) {
              const edgeId = this.getEdgeId(node.id, connId);
              const edge = this.edges.get(edgeId);
              if (edge) {
                edge.strength = Math.min(1, edge.strength + this.config.reinforceRate * 0.5);
                edge.lastUsed = Date.now();
                edge.traffic++;
              }
            }
          }
        }
      }
    }

    // Remove pulse after propagation
    setTimeout(() => {
      this.activePulses.delete(pulse.id);
    }, 1000);
  }

  /**
   * Self-audit: center examines lattice health
   */
  private performSelfAudit(): void {
    const nodes = Array.from(this.nodes.values());
    const edges = Array.from(this.edges.values());

    const audit = {
      timestamp: Date.now(),
      totalNodes: nodes.length,
      totalEdges: edges.length,
      averageNodeEnergy: nodes.reduce((s, n) => s + n.energy, 0) / nodes.length,
      averageEdgeStrength: edges.reduce((s, e) => s + e.strength, 0) / edges.length,
      deadNodes: nodes.filter(n => n.energy < 0.05).length,
      weakEdges: edges.filter(e => e.strength < 0.1).length,
      hotNodes: nodes.filter(n => n.energy > 0.8).length,
      strongEdges: edges.filter(e => e.strength > 0.8).length,
      layerHealth: [0, 1, 2, 3].map(l => {
        const layerNodes = nodes.filter(n => n.layer === l);
        return {
          layer: l,
          nodes: layerNodes.length,
          avgEnergy: layerNodes.reduce((s, n) => s + n.energy, 0) / (layerNodes.length || 1),
          agents: layerNodes.reduce((s, n) => s + n.assignedAgents.length, 0),
        };
      }),
    };

    logger.debug('FlowerOfLifeOS', {
      message: 'Self-audit complete',
      ...audit,
    });

    this.emit('audit', audit);

    // Route audit through center (Pillar 1: every major decision through center)
    this.totalDecisions++;
    this.pulse('audit', audit);
  }

  // ─── Pillar 2: Golden Ratio Geometry ─────────────────────────────────────

  /**
   * Build the complete Flower of Life lattice with exact sacred geometry
   * Supports dynamic expansion: starts with core, expands on demand
   */
  private buildLattice(): void {
    this.nodes.clear();
    this.edges.clear();

    const R = this.config.baseRadius;
    const coreLayers = this.config.dynamicMode ? this.config.coreLayers : 4;

    // ── Layer 0: Center (1 node) ── ALWAYS built
    this.addNode({
      id: 'center-0',
      x: 0,
      y: 0,
      layer: 0,
      angle: 0,
      type: 'center',
      role: 'consciousness',
    });

    // ── Layer 1: Inner Petals (6 nodes at 60° intervals) ── ALWAYS built
    // Distance from center = R (exact radius)
    for (let i = 0; i < 6; i++) {
      const angle = i * DEG60;
      this.addNode({
        id: `inner-${i}`,
        x: R * Math.cos(angle),
        y: R * Math.sin(angle),
        layer: 1,
        angle,
        type: 'inner',
        role: LAYER_ROLES[1][i % LAYER_ROLES[1].length],
      });

      // Connect to center
      this.addEdge(`inner-${i}`, 'center-0', 'radial_out');

      // Connect to adjacent inner nodes (hexagonal ring)
      if (i > 0) {
        this.addEdge(`inner-${i}`, `inner-${i - 1}`,
          this.config.flowDirection === 'clockwise' ? 'clockwise' : 'counterclockwise');
      }
    }
    // Close the inner ring
    this.addEdge('inner-5', 'inner-0',
      this.config.flowDirection === 'clockwise' ? 'clockwise' : 'counterclockwise');

    if (coreLayers < 3) return; // Stop here for minimal core

    // ── Layer 2: Middle Ring (12 nodes) ──
    // Distance from center = R * φ (golden ratio scaling)
    const middleR = R * PHI;
    for (let i = 0; i < 12; i++) {
      const angle = i * (DEG60 / 2); // 30° intervals
      this.addNode({
        id: `middle-${i}`,
        x: middleR * Math.cos(angle),
        y: middleR * Math.sin(angle),
        layer: 2,
        angle,
        type: 'middle',
        role: LAYER_ROLES[2][i % LAYER_ROLES[2].length],
        // Dynamic: initially hibernating until needed
        state: this.config.dynamicMode ? 'hibernating' : 'active',
      });

      // Connect to nearest inner nodes
      const nearestInner1 = Math.floor(i / 2);
      const nearestInner2 = (nearestInner1 + 1) % 6;
      this.addEdge(`middle-${i}`, `inner-${nearestInner1}`, 'radial_out');
      if (i % 2 === 1) {
        this.addEdge(`middle-${i}`, `inner-${nearestInner2}`, 'radial_out');
      }

      // Connect to adjacent middle nodes
      if (i > 0) {
        this.addEdge(`middle-${i}`, `middle-${i - 1}`,
          this.config.flowDirection === 'clockwise' ? 'clockwise' : 'counterclockwise');
      }
    }
    // Close the middle ring
    this.addEdge('middle-11', 'middle-0',
      this.config.flowDirection === 'clockwise' ? 'clockwise' : 'counterclockwise');

    if (coreLayers < 4) return; // Stop here for 3-layer core

    // ── Layer 3: Outer Ring (18 nodes) ──
    // Distance from center = R * φ² (golden ratio squared)
    const outerR = R * PHI * PHI;
    for (let i = 0; i < 18; i++) {
      const angle = i * (DEG60 / 3); // 20° intervals
      this.addNode({
        id: `outer-${i}`,
        x: outerR * Math.cos(angle),
        y: outerR * Math.sin(angle),
        layer: 3,
        angle,
        type: 'outer',
        role: LAYER_ROLES[3][i % LAYER_ROLES[3].length],
        // Dynamic: initially hibernating until needed
        state: this.config.dynamicMode ? 'hibernating' : 'active',
      });

      // Connect to nearest middle nodes
      const nearestMiddle1 = Math.floor(i * 2 / 3);
      const nearestMiddle2 = (nearestMiddle1 + 1) % 12;
      this.addEdge(`outer-${i}`, `middle-${nearestMiddle1}`, 'radial_out');
      if (i % 3 !== 0) {
        this.addEdge(`outer-${i}`, `middle-${nearestMiddle2}`, 'radial_out');
      }

      // Connect to adjacent outer nodes
      if (i > 0) {
        this.addEdge(`outer-${i}`, `outer-${i - 1}`,
          this.config.flowDirection === 'clockwise' ? 'clockwise' : 'counterclockwise');
      }
    }
    // Close the outer ring
    this.addEdge('outer-17', 'outer-0',
      this.config.flowDirection === 'clockwise' ? 'clockwise' : 'counterclockwise');

    // ── Vesica Piscis Intersections ──
    // Add intersection nodes at vesica piscis crossing points between layers
    this.buildIntersectionNodes(R);

    logger.info('FlowerOfLifeOS', {
      message: 'Sacred geometry lattice built',
      nodes: this.nodes.size,
      edges: this.edges.size,
      phi: PHI,
      layerRadii: {
        center: 0,
        inner: R,
        middle: middleR.toFixed(2),
        outer: outerR.toFixed(2),
      },
    });
  }

  /**
   * Build vesica piscis intersection nodes between adjacent circles
   */
  private buildIntersectionNodes(R: number): void {
    // Intersections between inner nodes (6 vesica points)
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const ni = this.nodes.get(`inner-${i}`)!;
      const nj = this.nodes.get(`inner-${j}`)!;

      // Midpoint of the vesica piscis lens
      const mx = (ni.x + nj.x) / 2;
      const my = (ni.y + nj.y) / 2;

      // Perpendicular offset (√3/2 * half-distance)
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const h = (SQRT3 / 2) * (dist / 2);

      // Two intersection points (inner and outer)
      const px = -dy / dist;
      const py = dx / dist;

      const intId = `vesica-${i}-${j}`;
      // Derive hybrid role from adjacent inner nodes
      const roleI = LAYER_ROLES[1][i % LAYER_ROLES[1].length];
      const roleJ = LAYER_ROLES[1][j % LAYER_ROLES[1].length];
      this.addNode({
        id: intId,
        x: mx + px * h * 0.5,
        y: my + py * h * 0.5,
        layer: 1,
        angle: Math.atan2(my + py * h * 0.5, mx + px * h * 0.5),
        type: 'intersection',
        role: `hybrid-${roleI}-${roleJ}`,
        hybridSpecializations: [roleI, roleJ],
      });

      // Connect intersection to both parent nodes
      this.addEdge(intId, `inner-${i}`, 'radial_out');
      this.addEdge(intId, `inner-${j}`, 'radial_out');
    }

    // Intersections between middle and outer rings (12 hybrid nodes)
    for (let i = 0; i < 12; i++) {
      const j = (i + 1) % 12;
      const ni = this.nodes.get(`middle-${i}`);
      const nj = this.nodes.get(`middle-${j}`);
      if (!ni || !nj) continue;

      const mx = (ni.x + nj.x) / 2;
      const my = (ni.y + nj.y) / 2;
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const h = (SQRT3 / 2) * (dist / 2);
      const px = -dy / dist;
      const py = dx / dist;

      const intId = `vesica-mid-${i}-${j}`;
      const roleI = LAYER_ROLES[2][i % LAYER_ROLES[2].length];
      const roleJ = LAYER_ROLES[2][j % LAYER_ROLES[2].length];
      this.addNode({
        id: intId,
        x: mx + px * h * 0.5,
        y: my + py * h * 0.5,
        layer: 2,
        angle: Math.atan2(my + py * h * 0.5, mx + px * h * 0.5),
        type: 'intersection',
        role: `hybrid-${roleI}-${roleJ}`,
        hybridSpecializations: [roleI, roleJ],
      });

      this.addEdge(intId, `middle-${i}`, 'radial_out');
      this.addEdge(intId, `middle-${j}`, 'radial_out');
    }
  }

  private addNode(partial: Omit<LatticeNode, 'energy' | 'connections' | 'lastAccessed' | 'accessCount' | 'assignedAgents' | 'state' | 'spawnTime'> & { state?: NodeState; spawnTime?: number }): void {
    this.nodes.set(partial.id, {
      ...partial,
      energy: partial.layer === 0 ? 1.0 : 0.5, // Center starts at full energy
      connections: [],
      lastAccessed: Date.now(),
      accessCount: 0,
      assignedAgents: [],
      state: partial.state || 'active',
      spawnTime: partial.spawnTime || Date.now(),
    });
  }

  private addEdge(fromId: string, toId: string, flowDirection: LatticeEdge['flowDirection']): void {
    const edgeId = this.getEdgeId(fromId, toId);
    if (this.edges.has(edgeId)) return; // No duplicates

    this.edges.set(edgeId, {
      id: edgeId,
      from: fromId,
      to: toId,
      strength: 0.5, // Start at medium
      traffic: 0,
      lastUsed: Date.now(),
      flowDirection,
    });

    // Add bidirectional connections to nodes
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (fromNode && !fromNode.connections.includes(toId)) fromNode.connections.push(toId);
    if (toNode && !toNode.connections.includes(fromId)) toNode.connections.push(fromId);
  }

  private getEdgeId(a: string, b: string): string {
    return a < b ? `${a}--${b}` : `${b}--${a}`;
  }

  // ─── Center-Routed Reasoning (Pillar 1 Enforcement) ─────────────────────

  /**
   * Universal center routing — ALL decisions must pass through center-0.
   * This is the core enforcement of Pillar 1: Center Consciousness.
   *
   * Flow: source node → center-0 (evaluate) → target node
   * Side effects:
   *   - Energizes center and traversed nodes
   *   - Reinforces used edges (living geometry)
   *   - Scores candidates using lattice node energy
   *   - Emits 'center_routed' event for HCS logging
   */
  centerRoute(decision: {
    type: 'task_assign' | 'bid_select' | 'chain_dispatch' | 'agent_register' | 'result_verify' | 'general';
    sourceNodeId?: string;
    targetNodeId?: string;
    candidates?: Array<{ id: string; score: number; nodeId?: string }>;
    data: Record<string, unknown>;
  }): CenterRoutedDecision {
    this.totalDecisions++;
    const now = Date.now();

    const center = this.nodes.get('center-0')!;
    center.energy = Math.min(1, center.energy + 0.08);
    center.lastAccessed = now;
    center.accessCount++;

    const sourceId = decision.sourceNodeId || 'center-0';
    const targetId = decision.targetNodeId;

    // Route source → center
    let inboundPath: LatticeRoute | null = null;
    if (sourceId !== 'center-0') {
      inboundPath = this.findHarmonicPath(sourceId, 'center-0');
      if (inboundPath.path.length > 0) {
        this.reinforcePath(inboundPath.path);
      }
    }

    // Route center → target
    let outboundPath: LatticeRoute | null = null;
    if (targetId && targetId !== 'center-0') {
      outboundPath = this.findHarmonicPath('center-0', targetId);
      if (outboundPath.path.length > 0) {
        this.reinforcePath(outboundPath.path);
      }
    }

    // Score candidates using lattice energy
    let scoredCandidates: Array<{
      id: string;
      originalScore: number;
      latticeBoost: number;
      finalScore: number;
      nodeId: string;
      nodeEnergy: number;
      pathCost: number;
    }> = [];

    if (decision.candidates && decision.candidates.length > 0) {
      scoredCandidates = decision.candidates.map(c => {
        // Find the candidate's lattice node
        let candidateNodeId = c.nodeId || this.findAgentNode(c.id);
        const candidateNode = candidateNodeId ? this.nodes.get(candidateNodeId) : null;
        const nodeEnergy = candidateNode?.energy ?? 0.1;

        // Calculate path cost from center to candidate's node
        let pathCost = Infinity;
        if (candidateNodeId) {
          const pathToCandidate = this.findHarmonicPath('center-0', candidateNodeId);
          pathCost = pathToCandidate.energyCost;
          // Reinforce candidate evaluation path lightly
          if (pathToCandidate.path.length > 0) {
            for (const nId of pathToCandidate.path) {
              const n = this.nodes.get(nId);
              if (n) {
                n.energy = Math.min(1, n.energy + this.config.reinforceRate * 0.2);
                n.lastAccessed = now;
              }
            }
          }
        }

        // Lattice boost: high-energy nodes get up to 20% boost, low path cost helps
        const energyBoost = nodeEnergy * 0.15;
        const costBonus = pathCost < Infinity ? (1 / (1 + pathCost)) * 0.05 : 0;
        const latticeBoost = energyBoost + costBonus;

        return {
          id: c.id,
          originalScore: c.score,
          latticeBoost,
          finalScore: c.score + latticeBoost,
          nodeId: candidateNodeId || 'unassigned',
          nodeEnergy,
          pathCost,
        };
      }).sort((a, b) => b.finalScore - a.finalScore);
    }

    // Compute combined path
    const fullPath = [
      ...(inboundPath?.path ?? ['center-0']),
      ...(outboundPath?.path?.slice(1) ?? []),
    ];
    const totalEnergyCost =
      (inboundPath?.energyCost ?? 0) + (outboundPath?.energyCost ?? 0);
    const totalHops =
      (inboundPath?.hops ?? 0) + (outboundPath?.hops ?? 0);

    const result: CenterRoutedDecision = {
      type: decision.type,
      routedThroughCenter: true,
      timestamp: now,
      centerEnergy: center.energy,
      centerAccessCount: center.accessCount,
      path: fullPath,
      hops: totalHops,
      energyCost: totalEnergyCost,
      scoredCandidates,
      winner: scoredCandidates.length > 0 ? scoredCandidates[0] : undefined,
      data: decision.data,
    };

    this.emit('center_routed', result);
    return result;
  }

  /**
   * Find which lattice node an agent is assigned to
   */
  private findAgentNode(agentId: string): string | null {
    for (const node of this.nodes.values()) {
      if (node.assignedAgents.includes(agentId)) {
        return node.id;
      }
    }
    return null;
  }

  // ─── Pillar 3: 4-Layer Architecture ──────────────────────────────────────

  /**
   * Route a decision through center first (Pillar 1 enforcement)
   * @deprecated Use centerRoute() for all new decision routing
   */
  routeDecision(type: string, data: Record<string, unknown>, sourceLayer: LatticeLayer): Record<string, unknown> {
    this.totalDecisions++;

    const center = this.nodes.get('center-0')!;
    center.energy = Math.min(1, center.energy + 0.05);
    center.lastAccessed = Date.now();
    center.accessCount++;

    // Determine target layer
    let targetLayer: LatticeLayer;
    switch (type) {
      case 'task': targetLayer = 1; break;
      case 'validation': case 'compliance': case 'defi': targetLayer = 2; break;
      case 'communication': case 'gossip': case 'beacon': targetLayer = 3; break;
      default: targetLayer = sourceLayer;
    }

    // Route: source → center → target
    const result = {
      decision: type,
      routedThroughCenter: true,
      sourceLayer,
      targetLayer,
      timestamp: Date.now(),
      centerEnergy: center.energy,
      data,
    };

    this.emit('decision', result);
    return result;
  }

  /**
   * Get nodes by layer
   */
  getLayer(layer: LatticeLayer): LatticeNode[] {
    return Array.from(this.nodes.values()).filter(n => n.layer === layer);
  }

  /**
   * Get the best node for a given role
   */
  getNodeForRole(role: string): LatticeNode | null {
    const candidates = Array.from(this.nodes.values())
      .filter(n => n.role === role)
      .sort((a, b) => b.energy - a.energy);

    return candidates[0] || null;
  }

  /**
   * Assign an agent to the most appropriate lattice node
   */
  assignAgent(
    agentId: string,
    capabilities: string[],
    inferenceTier?: 'instant' | 'fast' | 'standard' | 'deep'
  ): LatticeNode | null {
    // Determine best layer based on capabilities
    let bestLayer: LatticeLayer = 3; // Default to outer

    for (const cap of capabilities) {
      const c = cap.toLowerCase();
      if (c.includes('orchestrat') || c.includes('admin') || c.includes('consciousness')) { bestLayer = 0; break; }
      if (c.includes('executor') || c.includes('tx') || c.includes('query') || c.includes('contract') || c.includes('bridge')) { bestLayer = 1; break; }
      if (c.includes('analyst') || c.includes('defi') || c.includes('carbon') || c.includes('compliance') || c.includes('security') || c.includes('nft') || c.includes('market') || c.includes('verif')) { bestLayer = 2; break; }
      if (c.includes('planner') || c.includes('arbiter') || c.includes('synthesizer') || c.includes('forecaster')) { bestLayer = 3; break; }
      if (c.includes('task') || c.includes('schedul') || c.includes('pricing')) { bestLayer = 1; break; }
    }

    // Find lowest-load node in target layer
    const layerNodes = this.getLayer(bestLayer)
      .sort((a, b) => a.assignedAgents.length - b.assignedAgents.length);

    if (layerNodes.length === 0) return null;

    const targetNode = layerNodes[0];
    targetNode.assignedAgents.push(agentId);
    targetNode.energy = Math.min(1, targetNode.energy + 0.1);
    if (inferenceTier) {
      targetNode.inferenceTier = inferenceTier;
    }

    logger.debug('FlowerOfLifeOS', {
      message: 'Agent assigned to lattice node',
      agentId,
      nodeId: targetNode.id,
      layer: targetNode.layer,
      role: targetNode.role,
      inferenceTier: targetNode.inferenceTier,
    });

    return targetNode;
  }

  /**
   * Remove agent from lattice
   */
  removeAgent(agentId: string): void {
    for (const node of this.nodes.values()) {
      node.assignedAgents = node.assignedAgents.filter(id => id !== agentId);
    }
  }

  // ─── Pillar 4: Living Geometry ───────────────────────────────────────────

  /**
   * Start the decay/reinforcement cycle
   */
  private startDecayCycle(): void {
    this.decayTimer = setInterval(() => {
      this.applyDecay();
    }, 1000); // Every second
  }

  /**
   * Dynamic mode heartbeat: hibernate idle nodes and spawn new ones
   * when demand exceeds available capacity in a layer.
   */
  private startDynamicResourcesCycle(): void {
    this.dynamicResourcesTimer = setInterval(() => {
      this.manageResources();
      // Evaluate each non-center layer for demand-driven spawning
      for (const layer of [1, 2, 3] as LatticeLayer[]) {
        const nodes = this.getLayer(layer);
        const active = nodes.filter(n => n.state === 'active');
        const idleCount = active.filter(n => n.assignedAgents.length === 0).length;
        const ratio = idleCount / Math.max(1, active.length);
        if (ratio < 0.2 && nodes.length > 0) {
          const role = nodes[0].role || 'generic';
          this.spawnNodeForDemand(role, layer);
        }
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Apply natural decay — unused paths fade, unused nodes dim
   */
  private applyDecay(): void {
    const now = Date.now();

    // Decay node energy
    for (const node of this.nodes.values()) {
      if (node.layer === 0) continue; // Center never decays

      const age = (now - node.lastAccessed) / 1000;
      const decay = this.config.decayRate * age;
      node.energy = Math.max(0.05, node.energy - decay * 0.01);
    }

    // Decay edge strength
    for (const edge of this.edges.values()) {
      const age = (now - edge.lastUsed) / 1000;
      const decay = this.config.decayRate * age;
      edge.strength = Math.max(0.05, edge.strength - decay * 0.01);
    }
  }

  /**
   * Reinforce a path — used after successful message routing
   */
  reinforcePath(nodeIds: string[]): void {
    for (let i = 0; i < nodeIds.length; i++) {
      const node = this.nodes.get(nodeIds[i]);
      if (node) {
        node.energy = Math.min(1, node.energy + this.config.reinforceRate);
        node.lastAccessed = Date.now();
        node.accessCount++;
      }

      if (i < nodeIds.length - 1) {
        const edgeId = this.getEdgeId(nodeIds[i], nodeIds[i + 1]);
        const edge = this.edges.get(edgeId);
        if (edge) {
          edge.strength = Math.min(1, edge.strength + this.config.reinforceRate);
          edge.lastUsed = Date.now();
          edge.traffic++;
        }
      }
    }
  }

  // ─── Pillar 5: Harmonic Communication Protocol ───────────────────────────

  /**
   * Find shortest symmetric path through the lattice
   * Agents can ONLY communicate along existing lattice edges
   */
  findHarmonicPath(sourceId: string, targetId: string): LatticeRoute {
    this.totalRoutes++;

    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) {
      return { path: [], edges: [], totalDistance: Infinity, hops: 0, symmetric: false, energyCost: Infinity };
    }

    // A* pathfinding constrained to lattice edges only
    const openSet = new Set<string>([sourceId]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    gScore.set(sourceId, 0);
    fScore.set(sourceId, this.latticeHeuristic(sourceId, targetId));

    while (openSet.size > 0) {
      let current: string | null = null;
      let lowestF = Infinity;
      for (const nodeId of openSet) {
        const f = fScore.get(nodeId) ?? Infinity;
        if (f < lowestF) { lowestF = f; current = nodeId; }
      }

      if (current === null) break;
      if (current === targetId) {
        return this.buildRoute(cameFrom, current, sourceId);
      }

      openSet.delete(current);

      const currentNode = this.nodes.get(current)!;

      // ONLY traverse lattice edges (Pillar 5: no diagonal/random jumps)
      for (const neighborId of currentNode.connections) {
        const edgeId = this.getEdgeId(current, neighborId);
        const edge = this.edges.get(edgeId);
        if (!edge) continue;

        // Cost inversely proportional to edge strength (strong paths are cheaper)
        const edgeCost = 1 + (1 - edge.strength);
        const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this.latticeHeuristic(neighborId, targetId));
          openSet.add(neighborId);
        }
      }
    }

    // No lattice path found
    return { path: [], edges: [], totalDistance: Infinity, hops: 0, symmetric: false, energyCost: Infinity };
  }

  /**
   * Route a message through the lattice (enforces harmonic communication)
   */
  routeMessage(fromNodeId: string, toNodeId: string, message: Record<string, unknown>): LatticeRoute & { delivered: boolean } {
    // All messages must route through center first (Pillar 1)
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);

    if (!fromNode || !toNode) {
      return { path: [], edges: [], totalDistance: Infinity, hops: 0, symmetric: false, energyCost: Infinity, delivered: false };
    }

    let route: LatticeRoute;

    // If cross-layer, route through center
    if (fromNode.layer !== toNode.layer) {
      const pathToCenter = this.findHarmonicPath(fromNodeId, 'center-0');
      const pathFromCenter = this.findHarmonicPath('center-0', toNodeId);

      route = {
        path: [...pathToCenter.path, ...pathFromCenter.path.slice(1)],
        edges: [...pathToCenter.edges, ...pathFromCenter.edges],
        totalDistance: pathToCenter.totalDistance + pathFromCenter.totalDistance,
        hops: pathToCenter.hops + pathFromCenter.hops,
        symmetric: true,
        energyCost: pathToCenter.energyCost + pathFromCenter.energyCost,
      };
    } else {
      // Same layer — find direct lattice path
      route = this.findHarmonicPath(fromNodeId, toNodeId);
    }

    // Reinforce the path that was used (Pillar 4)
    if (route.path.length > 0) {
      this.reinforcePath(route.path);
    }

    this.emit('message_routed', { from: fromNodeId, to: toNodeId, route, message });

    return { ...route, delivered: route.path.length > 0 };
  }

  /**
   * Heuristic for A* using lattice distance (not Euclidean)
   */
  private latticeHeuristic(nodeId: string, goalId: string): number {
    const node = this.nodes.get(nodeId);
    const goal = this.nodes.get(goalId);
    if (!node || !goal) return Infinity;

    // Layer distance (radial hops) + angular distance
    const layerDist = Math.abs(node.layer - goal.layer);
    const angleDist = Math.abs(node.angle - goal.angle);
    const normalizedAngle = Math.min(angleDist, TWO_PI - angleDist) / DEG60;

    return layerDist + normalizedAngle;
  }

  /**
   * Build route from A* cameFrom map
   */
  private buildRoute(cameFrom: Map<string, string>, current: string, sourceId: string): LatticeRoute {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }

    const edges: string[] = [];
    let totalDistance = 0;
    let energyCost = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const edgeId = this.getEdgeId(path[i], path[i + 1]);
      edges.push(edgeId);

      const edge = this.edges.get(edgeId);
      if (edge) {
        totalDistance += 1;
        energyCost += 1 + (1 - edge.strength);
      }
    }

    // Check 6-fold symmetry
    const symmetric = this.checkSymmetry(path);

    return { path, edges, totalDistance, hops: path.length - 1, symmetric, energyCost };
  }

  /**
   * Check if a path follows 6-fold symmetry
   */
  private checkSymmetry(path: string[]): boolean {
    if (path.length < 2) return true;

    const angles: number[] = [];
    for (const nodeId of path) {
      const node = this.nodes.get(nodeId);
      if (node) angles.push(node.angle);
    }

    // Check if angle differences are multiples of 60°
    for (let i = 1; i < angles.length; i++) {
      const diff = Math.abs(angles[i] - angles[i - 1]);
      const normalized = diff % DEG60;
      if (normalized > 0.01 && normalized < DEG60 - 0.01) return false;
    }

    return true;
  }

  // ─── Pillar 6: Energy Flow Direction ─────────────────────────────────────

  /**
   * Get the current energy flow state (clockwise/counterclockwise)
   */
  getEnergyFlow(): {
    direction: 'clockwise' | 'counterclockwise';
    layers: Array<{
      layer: LatticeLayer;
      nodes: Array<{ id: string; energy: number; angle: number }>;
      flowVector: { x: number; y: number };
    }>;
  } {
    const layers: Array<{
      layer: LatticeLayer;
      nodes: Array<{ id: string; energy: number; angle: number }>;
      flowVector: { x: number; y: number };
    }> = [];

    for (const layer of [0, 1, 2, 3] as LatticeLayer[]) {
      const layerNodes = this.getLayer(layer).map(n => ({
        id: n.id,
        energy: n.energy,
        angle: n.angle,
      }));

      // Calculate average flow vector
      const sign = this.config.flowDirection === 'clockwise' ? 1 : -1;
      const avgAngle = layerNodes.reduce((s, n) => s + n.angle, 0) / (layerNodes.length || 1);
      const flowAngle = avgAngle + sign * (Math.PI / 2);

      layers.push({
        layer,
        nodes: layerNodes,
        flowVector: {
          x: Math.cos(flowAngle),
          y: Math.sin(flowAngle),
        },
      });
    }

    return {
      direction: this.config.flowDirection,
      layers,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Get node by ID
   */
  getNode(id: string): LatticeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get edge by ID
   */
  getEdge(id: string): LatticeEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get complete lattice state
   */
  getLatticeState(): {
    nodes: LatticeNode[];
    edges: LatticeEdge[];
    activePulses: LatticePulse[];
    config: Required<FlowerOfLifeOSConfig>;
  } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      activePulses: Array.from(this.activePulses.values()),
      config: this.config,
    };
  }

  /**
   * Get comprehensive stats
   */
  getStats(): {
    running: boolean;
    uptime: number;
    totalNodes: number;
    totalEdges: number;
    totalPulses: number;
    totalRoutes: number;
    totalDecisions: number;
    averageNodeEnergy: number;
    averageEdgeStrength: number;
    activePulses: number;
    flowDirection: string;
    layerCounts: Record<number, number>;
    stateCounts: {
      active: number;
      hibernating: number;
      byLayer: Record<number, { active: number; hibernating: number }>;
    };
    hybridNodes: number;
    inferenceTierDistribution: Record<string, number>;
    phi: number;
  } {
    const nodes = Array.from(this.nodes.values());
    const edges = Array.from(this.edges.values());

    return {
      running: this.isRunning,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      totalPulses: this.totalPulses,
      totalRoutes: this.totalRoutes,
      totalDecisions: this.totalDecisions,
      averageNodeEnergy: nodes.reduce((s, n) => s + n.energy, 0) / (nodes.length || 1),
      averageEdgeStrength: edges.reduce((s, e) => s + e.strength, 0) / (edges.length || 1),
      activePulses: this.activePulses.size,
      flowDirection: this.config.flowDirection,
      layerCounts: {
        0: nodes.filter(n => n.layer === 0).length,
        1: nodes.filter(n => n.layer === 1).length,
        2: nodes.filter(n => n.layer === 2).length,
        3: nodes.filter(n => n.layer === 3).length,
      },
      stateCounts: {
        active: nodes.filter(n => n.state === 'active').length,
        hibernating: nodes.filter(n => n.state === 'hibernating').length,
        byLayer: {
          0: { active: nodes.filter(n => n.layer === 0 && n.state === 'active').length, hibernating: nodes.filter(n => n.layer === 0 && n.state === 'hibernating').length },
          1: { active: nodes.filter(n => n.layer === 1 && n.state === 'active').length, hibernating: nodes.filter(n => n.layer === 1 && n.state === 'hibernating').length },
          2: { active: nodes.filter(n => n.layer === 2 && n.state === 'active').length, hibernating: nodes.filter(n => n.layer === 2 && n.state === 'hibernating').length },
          3: { active: nodes.filter(n => n.layer === 3 && n.state === 'active').length, hibernating: nodes.filter(n => n.layer === 3 && n.state === 'hibernating').length },
        },
      },
      hybridNodes: nodes.filter(n => n.type === 'intersection').length,
      inferenceTierDistribution: {
        instant: nodes.filter(n => n.inferenceTier === 'instant').length,
        fast: nodes.filter(n => n.inferenceTier === 'fast').length,
        standard: nodes.filter(n => n.inferenceTier === 'standard').length,
        deep: nodes.filter(n => n.inferenceTier === 'deep').length,
      },
      phi: PHI,
    };
  }

  // ─── Dynamic Expansion Methods ─────────────────────────────────────────────

  /**
   * Spawn a hibernating node to handle a task
   * Returns the activated node or null if not found
   */
  spawnNode(nodeId: string): LatticeNode | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    if (node.state === 'hibernating') {
      node.state = 'active';
      node.spawnTime = Date.now();
      node.energy = 0.7; // Start with good energy

      logger.info('FlowerOfLifeOS', {
        message: 'Node spawned on demand',
        nodeId,
        layer: node.layer,
        role: node.role,
      });

      this.emit('node:spawned', { nodeId, layer: node.layer, role: node.role });
    }

    return node;
  }

  /**
   * Hibernate an idle node to save resources
   */
  hibernateNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.layer < 2) return false; // Never hibernate core

    if (node.state === 'active' && node.assignedAgents.length === 0) {
      node.state = 'hibernating';
      node.energy = 0.1; // Low energy when hibernating

      logger.info('FlowerOfLifeOS', {
        message: 'Node hibernated',
        nodeId,
        layer: node.layer,
        idleTime: Date.now() - node.lastAccessed,
      });

      this.emit('node:hibernated', { nodeId, layer: node.layer });
      return true;
    }

    return false;
  }

  /**
   * Find and spawn the best node for a specific role
   * Used when a task requires a capability from outer layers
   */
  acquireNodeForRole(role: string): LatticeNode | null {
    // First, try to find an already active node with this role
    for (const node of this.nodes.values()) {
      if (node.role === role && node.state === 'active') {
        node.lastAccessed = Date.now();
        node.accessCount++;
        return node;
      }
    }

    // No active node found, spawn a hibernating one
    for (const node of this.nodes.values()) {
      if (node.role === role && node.state === 'hibernating') {
        this.spawnNode(node.id);
        node.lastAccessed = Date.now();
        node.accessCount++;
        return node;
      }
    }

    return null; // No node with this role exists
  }

  /**
   * Expand entire layer on demand
   */
  expandLayer(layer: LatticeLayer): number {
    let spawned = 0;

    for (const node of this.nodes.values()) {
      if (node.layer === layer && node.state === 'hibernating') {
        this.spawnNode(node.id);
        spawned++;
      }
    }

    logger.info('FlowerOfLifeOS', {
      message: `Layer ${layer} expanded`,
      nodesSpawned: spawned,
      totalInLayer: Array.from(this.nodes.values()).filter(n => n.layer === layer).length,
    });

    this.emit('layer:expanded', { layer, nodesSpawned: spawned });
    return spawned;
  }

  /**
   * Get counts of active vs hibernating nodes
   */
  getResourceStats(): {
    total: number;
    active: number;
    hibernating: number;
    byLayer: Record<number, { active: number; hibernating: number }>;
  } {
    const stats = {
      total: 0,
      active: 0,
      hibernating: 0,
      byLayer: {
        0: { active: 0, hibernating: 0 },
        1: { active: 0, hibernating: 0 },
        2: { active: 0, hibernating: 0 },
        3: { active: 0, hibernating: 0 },
      } as Record<number, { active: number; hibernating: number }>,
    };

    for (const node of this.nodes.values()) {
      stats.total++;
      if (node.state === 'active') {
        stats.active++;
        stats.byLayer[node.layer].active++;
      } else {
        stats.hibernating++;
        stats.byLayer[node.layer].hibernating++;
      }
    }

    return stats;
  }

  /**
   * Spawn a new lattice node on-demand when task volume for a role
   * exceeds idle capacity in the target layer.
   */
  spawnNodeForDemand(role: string, layer: LatticeLayer): LatticeNode | null {
    const layerNodes = this.getLayer(layer).filter(n => n.state === 'active');
    const idleNodes = layerNodes.filter(n => n.assignedAgents.length === 0);

    // Only spawn if < 20% of nodes in layer are idle
    if (idleNodes.length / Math.max(1, layerNodes.length) >= 0.2) {
      return null;
    }

    const R = this.config.baseRadius * Math.pow(this.config.phiScale, layer);
    const count = layer === 1 ? 6 : layer === 2 ? 12 : 18;
    const angleStep = (2 * Math.PI) / count;

    // Find the next available angle slot
    const usedAngles = new Set(layerNodes.map(n => Math.round(n.angle / angleStep)));
    let bestAngle = 0;
    for (let i = 0; i < count; i++) {
      if (!usedAngles.has(i)) {
        bestAngle = i * angleStep;
        break;
      }
    }

    const id = `spawned-${role}-${Date.now()}`;
    this.addNode({
      id,
      x: R * Math.cos(bestAngle),
      y: R * Math.sin(bestAngle),
      layer,
      angle: bestAngle,
      type: layer === 1 ? 'inner' : layer === 2 ? 'middle' : 'outer',
      role,
      state: 'active',
      spawnTime: Date.now(),
    });

    // Connect to nearest existing node in same layer
    const nearest = layerNodes[0];
    if (nearest) {
      this.addEdge(id, nearest.id, 'clockwise');
    }

    logger.info('FlowerOfLifeOS', {
      message: 'Spawned node on demand',
      nodeId: id,
      layer,
      role,
      angle: bestAngle,
    });

    this.emit('node_spawned', { id, layer, role });
    return this.nodes.get(id) || null;
  }

  /**
   * Promote a high-performing agent to a higher layer (e.g. analyst → planner).
   * Emits AGENT_MIGRATION event to HCS.
   */
  promoteAgent(agentId: string, targetLayer: LatticeLayer): LatticeNode | null {
    // Remove from current node
    let currentNode: LatticeNode | null = null;
    for (const node of this.nodes.values()) {
      const idx = node.assignedAgents.indexOf(agentId);
      if (idx >= 0) {
        node.assignedAgents.splice(idx, 1);
        currentNode = node;
        break;
      }
    }

    if (!currentNode || currentNode.layer >= targetLayer) return null;

    // Find lowest-load node in target layer
    const targetNodes = this.getLayer(targetLayer)
      .sort((a, b) => a.assignedAgents.length - b.assignedAgents.length);

    if (targetNodes.length === 0) return null;

    const targetNode = targetNodes[0];
    targetNode.assignedAgents.push(agentId);
    targetNode.energy = Math.min(1, targetNode.energy + 0.2);

    logger.info('FlowerOfLifeOS', {
      message: 'Agent promoted to higher layer',
      agentId,
      fromLayer: currentNode.layer,
      toLayer: targetNode.layer,
      nodeId: targetNode.id,
    });

    this.emit('agent_migrated', {
      agentId,
      fromLayer: currentNode.layer,
      toLayer: targetNode.layer,
      type: 'PROMOTION',
      timestamp: Date.now(),
    });

    return targetNode;
  }

  /**
   * Demote an under-performing agent to a lower layer or hibernate.
   */
  demoteAgent(agentId: string): boolean {
    let currentNode: LatticeNode | null = null;
    for (const node of this.nodes.values()) {
      const idx = node.assignedAgents.indexOf(agentId);
      if (idx >= 0) {
        node.assignedAgents.splice(idx, 1);
        currentNode = node;
        break;
      }
    }

    if (!currentNode || currentNode.layer === 0) return false;

    const lowerLayer = (currentNode.layer - 1) as LatticeLayer;
    const lowerNodes = this.getLayer(lowerLayer)
      .sort((a, b) => a.assignedAgents.length - b.assignedAgents.length);

    if (lowerNodes.length > 0) {
      const target = lowerNodes[0];
      target.assignedAgents.push(agentId);
      logger.info('FlowerOfLifeOS', {
        message: 'Agent demoted to lower layer',
        agentId,
        fromLayer: currentNode.layer,
        toLayer: target.layer,
        nodeId: target.id,
      });
    } else {
      // Hibernate if no lower slot available
      if (currentNode.layer >= 2) {
        this.hibernateNode(currentNode.id);
      }
    }

    this.emit('agent_migrated', {
      agentId,
      fromLayer: currentNode.layer,
      toLayer: lowerNodes[0]?.layer ?? currentNode.layer,
      type: 'DEMOTION',
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Route a cross-domain task to a hybrid intersection agent.
   * Finds the vesica piscis node whose specializations cover both domains.
   */
  routeToHybrid(agentId: string, domainA: string, domainB: string): LatticeNode | null {
    const hybrids = Array.from(this.nodes.values()).filter(
      n => n.type === 'intersection' && n.hybridSpecializations
    );

    const match = hybrids.find(n =>
      n.hybridSpecializations!.includes(domainA) &&
      n.hybridSpecializations!.includes(domainB)
    );

    if (!match) return null;

    match.assignedAgents.push(agentId);
    match.energy = Math.min(1, match.energy + 0.15);

    logger.debug('FlowerOfLifeOS', {
      message: 'Routed to hybrid intersection node',
      agentId,
      nodeId: match.id,
      specializations: match.hybridSpecializations,
    });

    return match;
  }

  /**
   * Auto-hibernate idle nodes based on idle timeout
   * Call this periodically to manage resource usage
   */
  manageResources(): { hibernated: number; checked: number } {
    const now = Date.now();
    let hibernated = 0;
    let checked = 0;

    for (const node of this.nodes.values()) {
      // Only check non-core nodes that are active
      if (node.layer < 2 || node.state !== 'active') continue;

      checked++;
      const idleTime = now - node.lastAccessed;
      const timeout = node.idleTimeoutMs || this.config.idleTimeoutMs || 60000;

      if (idleTime > timeout && node.assignedAgents.length === 0) {
        if (this.hibernateNode(node.id)) {
          hibernated++;
        }
      }
    }

    if (hibernated > 0) {
      logger.info('FlowerOfLifeOS', {
        message: 'Resource management cycle complete',
        hibernated,
        checked,
      });
    }

    return { hibernated, checked };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const flowerOfLifeOS = new FlowerOfLifeOS();
export default flowerOfLifeOS;
