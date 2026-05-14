/**
 * Vera Hierarchical Coordinator
 * Multi-level coordination architecture for 5000-agent scale
 * 
 * Architecture:
 * - Global Coordinator: Top-level orchestration
 * - Shard Coordinators: Per-100-agent coordination (50 shards)
 * - Gossip Protocol: Decentralized state synchronization
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { consistentHashRouter } from './shardedTopicManager.js';
import { VesicaPiscisGossip, GossipMessage } from '../gossip/vesicaPiscisGossip.js';
import { TriangularRouter } from '../routing/triangularRouter.js';
import { RadialShardManager } from '../sharding/radialShardManager.js';
import { NestedConsensusRings } from '../consensus/nestedConsensusRings.js';
import { IntersectionConsensusPoints } from '../consensus/intersectionConsensusPoints.js';
import { HarmonicLoadBalancer } from '../balancing/harmonicLoadBalancer.js';
import { MetatronGridRouter } from '../routing/metatronGridRouter.js';
import { EntanglementProtocol } from '../quantum/entanglementProtocol.js';
import { FlowerOfLifeOS, flowerOfLifeOS } from './flowerOfLifeOS.js';

type InferenceTier = 'instant' | 'fast' | 'standard' | 'deep';

interface AgentState {
  id: string;
  status: 'active' | 'busy' | 'offline' | 'recovering';
  shardId: number;
  lastHeartbeat: number;
  capabilities: string[];
  load: number; // 0-1 scale
  inferenceTier?: InferenceTier;
}

interface TaskAssignment {
  taskId: string;
  agentId: string;
  shardId: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  deadline?: number;
}

export class HierarchicalCoordinator extends EventEmitter {
  private globalState: Map<string, AgentState> = new Map();
  private shardCoordinators: Map<number, ShardCoordinator> = new Map();
  private gossipProtocol: VesicaPiscisGossip;
  private triangularRouter: TriangularRouter;
  private radialShardManager: RadialShardManager;
  private nestedConsensusRings: NestedConsensusRings;
  private intersectionConsensus: IntersectionConsensusPoints;
  private harmonicLoadBalancer: HarmonicLoadBalancer;
  private metatronGridRouter: MetatronGridRouter;
  private entanglementProtocol: EntanglementProtocol;
  private gossipInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  // Configuration
  private shardSize: number = 100;
  private totalShards: number = 50;
  private gossipPeriodMs: number = 5000;

  constructor(options?: { shardSize?: number; totalShards?: number }) {
    super();
    this.shardSize = options?.shardSize || 100;
    this.totalShards = options?.totalShards || 50;
    
    // Initialize geometric coordination components
    this.gossipProtocol = new VesicaPiscisGossip(-1, this.totalShards);
    this.triangularRouter = new TriangularRouter({ maxNodes: this.totalShards * this.shardSize });
    this.radialShardManager = new RadialShardManager({ maxShards: this.totalShards });
    
    // Initialize Phase 5 consensus components
    this.nestedConsensusRings = new NestedConsensusRings();
    this.intersectionConsensus = new IntersectionConsensusPoints(this.nestedConsensusRings);
    this.harmonicLoadBalancer = new HarmonicLoadBalancer();
    
    // Initialize Phase 6 quantum routing
    this.metatronGridRouter = new MetatronGridRouter();
    this.entanglementProtocol = new EntanglementProtocol();
    
    // Initialize shard coordinators
    for (let i = 0; i < this.totalShards; i++) {
      this.shardCoordinators.set(i, new ShardCoordinator(i, this.shardSize));
    }
  }

  /**
   * Start hierarchical coordination with sacred geometry components
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start Vesica Piscis gossip protocol
    this.gossipProtocol.start();
    
    // Start triangular routing mesh
    this.triangularRouter.start();
    
    // Start radial shard manager (flower of life pattern)
    this.radialShardManager.start();
    
    // Start Phase 5 consensus components
    this.nestedConsensusRings.start();
    this.intersectionConsensus.start();
    this.harmonicLoadBalancer.start();
    
    // Start Phase 6 quantum routing
    this.metatronGridRouter.start();
    this.entanglementProtocol.start();
    
    // Start Flower of Life OS — the living lattice
    flowerOfLifeOS.start();
    
    // Handle gossip protocol events
    this.gossipProtocol.on('sync_complete', (data) => {
      this.emit('gossip_sync', data);
    });
    
    this.gossipProtocol.on('state_fork', (data) => {
      logger.warn('HierarchicalCoordinator', {
        message: 'State fork detected between shards',
        ...data,
      });
      this.emit('state_fork', data);
    });
    
    // Handle radial shard events
    this.radialShardManager.on('shard_spawned', (data) => {
      logger.info('HierarchicalCoordinator', {
        message: 'New radial shard spawned',
        ...data,
      });
      this.emit('shard_spawned', data);
    });
    
    // Start shard coordinators
    for (const [shardId, coordinator] of this.shardCoordinators) {
      coordinator.start();
    }
    
    logger.info('HierarchicalCoordinator', {
      message: 'Started with sacred geometry coordination',
      shards: this.totalShards,
      shardSize: this.shardSize,
      components: [
        'vesica_piscis_gossip',
        'triangular_routing',
        'radial_sharding',
        'nested_consensus_rings',
        'intersection_consensus',
        'harmonic_load_balancing',
        'metatron_grid',
        'quantum_entanglement',
      ],
    });
    
    this.emit('started');
  }

  /**
   * Stop coordination
   */
  stop(): void {
    this.isRunning = false;
    
    // Stop geometric coordination components
    this.gossipProtocol.stop();
    this.triangularRouter.stop();
    this.radialShardManager.stop();
    
    // Stop Phase 5 consensus components
    this.nestedConsensusRings.stop();
    this.intersectionConsensus.stop();
    this.harmonicLoadBalancer.stop();
    
    // Stop Phase 6 quantum routing
    this.metatronGridRouter.stop();
    this.entanglementProtocol.stop();
    
    // Stop Flower of Life OS
    flowerOfLifeOS.stop();
    
    for (const coordinator of this.shardCoordinators.values()) {
      coordinator.stop();
    }
    
    logger.info('HierarchicalCoordinator', { message: 'Stopped' });
    this.emit('stopped');
  }

  /**
   * Register agent with hierarchical routing and geometric positioning
   */
  registerAgent(agentId: string, capabilities: string[], inferenceTier?: InferenceTier): void {
    // Use radial shard manager to assign shard
    const shardId = this.radialShardManager.assignAgentToShard(agentId, capabilities);

    const state: AgentState = {
      id: agentId,
      status: 'active',
      shardId,
      lastHeartbeat: Date.now(),
      capabilities,
      load: 0,
      inferenceTier,
    };
    
    this.globalState.set(agentId, state);
    
    // Add to triangular mesh for geometric routing
    this.triangularRouter.addNode(agentId, shardId, capabilities);
    
    // Register with harmonic load balancer
    this.harmonicLoadBalancer.registerNode(agentId, capabilities, 'outer');
    
    // Add to Metatron's Grid for multi-dimensional routing
    this.metatronGridRouter.addNode(agentId, capabilities);
    
    // Assign to consensus ring based on reputation
    this.nestedConsensusRings.assignAgent(agentId, 1.0, 1.0);
    
    // Register at intersection points if applicable
    this.intersectionConsensus.registerAgentAtIntersection('inner-middle', agentId);
    
    // Add to consistent hash ring
    consistentHashRouter.addAgent(agentId);
    
    // Register with shard coordinator
    const shardCoord = this.shardCoordinators.get(shardId);
    if (shardCoord) {
      shardCoord.registerAgent(state);
    }
    
    // Update gossip protocol with new agent state
    this.gossipProtocol.updateAgentState(agentId, {
      agentId,
      status: 'active',
      load: 0,
      capabilities,
      lastHeartbeat: Date.now(),
    });
    
    // Assign agent to Flower of Life lattice node
    const latticeNode = flowerOfLifeOS.assignAgent(agentId, capabilities, inferenceTier);
    
    logger.debug('HierarchicalCoordinator', {
      message: 'Agent registered with geometric positioning',
      agentId,
      shardId,
      meshPosition: 'triangular',
      consensusRing: 'assigned',
      metatronGrid: true,
      latticeNode: latticeNode?.id ?? 'none',
      latticeLayer: latticeNode?.layer ?? -1,
    });
    
    this.emit('agent_registered', { agentId, shardId });
  }

  /**
   * Assign task using hierarchical routing with Flower of Life OS center routing
   */
  async assignTask(task: Omit<TaskAssignment, 'agentId' | 'shardId'>): Promise<TaskAssignment | null> {
    const taskHash = `${task.taskId}-${Date.now()}`;
    
    // Use consistent hashing to find candidate agents
    const candidates = consistentHashRouter.getAgentCandidates(taskHash, 5);
    
    if (candidates.length === 0) {
      logger.warn('HierarchicalCoordinator', {
        message: 'No agents available for task',
        taskId: task.taskId,
      });
      return null;
    }
    
    // ─── Center-Routed Decision Making ────────────────────────────────────────
    // Route all candidate scoring through center-0 in Flower of Life OS
    const candidateScores = candidates.map(agentId => {
      const state = this.globalState.get(agentId);
      // Base score: active agents with low load
      let score = 0.5;
      if (state) {
        if (state.status === 'active') score += 0.3;
        if (state.status === 'busy') score -= 0.2;
        score += (1 - state.load) * 0.2; // Prefer low-load agents
      }
      return { id: agentId, score, nodeId: state?.shardId !== undefined ? undefined : undefined };
    });
    
    // Route through center — this is the core enforcement of Pillar 1
    const centerRoutedDecision = flowerOfLifeOS.centerRoute({
      type: 'task_assign',
      sourceNodeId: 'center-0',
      candidates: candidateScores,
      data: {
        taskId: task.taskId,
        priority: task.priority,
        candidateCount: candidates.length,
        taskHash,
      },
    });
    
    // Use lattice-scored winner
    const winner = centerRoutedDecision.winner;
    if (!winner) {
      logger.warn('HierarchicalCoordinator', {
        message: 'Center routing produced no winner',
        taskId: task.taskId,
      });
      return null;
    }
    
    const agentId = winner.id;
    const state = this.globalState.get(agentId);
    
    if (!state || state.status !== 'active' || state.load >= 0.8) {
      // Winner not viable — check remaining candidates
      const remaining = centerRoutedDecision.scoredCandidates.slice(1).filter(c => {
        const s = this.globalState.get(c.id);
        return s && s.status === 'active' && s.load < 0.8;
      });
      
      if (remaining.length === 0) {
        logger.warn('HierarchicalCoordinator', {
          message: 'All candidates busy after center routing',
          taskId: task.taskId,
        });
        this.emit('task_queued', task);
        return null;
      }
      
      // Use best remaining candidate
      const fallback = remaining[0];
      const fallbackState = this.globalState.get(fallback.id);
      if (!fallbackState) return null;
      
      return this.finalizeAssignment(task, fallback.id, fallbackState, centerRoutedDecision);
    }
    
    return this.finalizeAssignment(task, agentId, state, centerRoutedDecision);
  }
  
  /**
   * Finalize task assignment after center routing
   */
  private finalizeAssignment(
    task: Omit<TaskAssignment, 'agentId' | 'shardId'>,
    agentId: string,
    state: AgentState,
    centerRoutedDecision: { path: string[]; hops: number; energyCost: number; centerEnergy: number; scoredCandidates: Array<{ id: string; finalScore: number; latticeBoost: number }> }
  ): TaskAssignment {
    // Update agent load
    state.load = Math.min(1, state.load + 0.2);
    state.status = 'busy';
    
    const assignment: TaskAssignment = {
      ...task,
      agentId,
      shardId: state.shardId,
    };
    
    // Notify shard coordinator
    const shardCoord = this.shardCoordinators.get(state.shardId);
    shardCoord?.assignTask(assignment);
    
    // Reinforce the lattice path used (living geometry)
    if (centerRoutedDecision.path.length > 0) {
      flowerOfLifeOS.reinforcePath(centerRoutedDecision.path);
    }
    
    logger.debug('HierarchicalCoordinator', {
      message: 'Task assigned via center routing',
      taskId: task.taskId,
      agentId,
      shardId: state.shardId,
      centerEnergy: centerRoutedDecision.centerEnergy.toFixed(4),
      latticeBoost: centerRoutedDecision.scoredCandidates.find(c => c.id === agentId)?.latticeBoost.toFixed(4),
      hops: centerRoutedDecision.hops,
      pathLength: centerRoutedDecision.path.length,
    });
    
    this.emit('task_assigned', assignment);
    return assignment;
  }

  /**
   * Process heartbeat from agent
   */
  processHeartbeat(agentId: string, metrics: { load: number; status: string }): void {
    const state = this.globalState.get(agentId);
    
    if (!state) {
      logger.warn('HierarchicalCoordinator', {
        message: 'Heartbeat from unknown agent',
        agentId,
      });
      return;
    }
    
    state.lastHeartbeat = Date.now();
    state.load = metrics.load;
    state.status = metrics.status as AgentState['status'];
    
    // Update triangular mesh
    this.triangularRouter.updateNode(agentId, {
      load: metrics.load,
      status: metrics.status as 'active' | 'busy' | 'offline',
      lastHeartbeat: Date.now(),
    });
    
    // Update gossip protocol
    this.gossipProtocol.updateAgentState(agentId, {
      agentId,
      status: metrics.status as 'active' | 'busy' | 'offline' | 'recovering',
      load: metrics.load,
      capabilities: state.capabilities,
      lastHeartbeat: Date.now(),
    });
    
    // Forward to shard coordinator
    const shardCoord = this.shardCoordinators.get(state.shardId);
    shardCoord?.processHeartbeat(agentId, metrics);
  }

  /**
   * Get gossip protocol stats
   */
  getGossipStats() {
    return this.gossipProtocol.getStats();
  }

  /**
   * Get triangular mesh visualization
   */
  getMeshVisualization() {
    return this.triangularRouter.getMeshVisualization();
  }

  /**
   * Get triangular mesh stats
   */
  getMeshStats() {
    return this.triangularRouter.getStats();
  }

  /**
   * Get radial shard manager stats
   */
  getRadialStats() {
    return this.radialShardManager.getStats();
  }

  /**
   * Get flower of life visualization data
   */
  getFlowerOfLifeVisualization() {
    return this.radialShardManager.getFlowerOfLifeVisualization();
  }

  /**
   * Get geometric routing candidates for a task
   */
  getTaskCandidates(taskId: string, serviceType: string) {
    return this.triangularRouter.getCandidates(taskId, serviceType, 3);
  }

  /**
   * Get cluster summary
   */
  getClusterSummary() {
    const agents = Array.from(this.globalState.values());
    const activeAgents = agents.filter(a => a.status === 'active').length;
    const busyAgents = agents.filter(a => a.status === 'busy').length;
    const offlineAgents = agents.filter(a => a.status === 'offline').length;
    
    return {
      totalAgents: agents.length,
      activeAgents,
      busyAgents,
      offlineAgents,
      averageLoad: agents.reduce((sum, a) => sum + a.load, 0) / agents.length || 0,
      shardStatus: Array.from(this.shardCoordinators.entries()).map(([id, coord]) => ({
        shardId: id,
        ...coord.getStateSummary(),
      })),
    };
  }

  /**
   * Get consensus ring stats
   */
  getConsensusStats() {
    return this.nestedConsensusRings.getStats();
  }

  /**
   * Get intersection consensus stats
   */
  getIntersectionStats() {
    return this.intersectionConsensus.getStats();
  }

  /**
   * Get harmonic load balancer stats
   */
  getHarmonicStats() {
    return this.harmonicLoadBalancer.getStats();
  }

  /**
   * Create consensus proposal
   */
  createConsensusProposal(type: 'critical' | 'standard' | 'advisory', data: any, proposer: string) {
    return this.nestedConsensusRings.createProposal(type, data, proposer);
  }

  /**
   * Get standing wave visualization
   */
  getStandingWaveVisualization() {
    return this.harmonicLoadBalancer.getStandingWaveVisualization();
  }

  /**
   * Get ring composition visualization
   */
  getRingVisualization() {
    return this.nestedConsensusRings.getVisualization();
  }

  /**
   * Get intersection visualization
   */
  getIntersectionVisualization() {
    return this.intersectionConsensus.getIntersectionVisualization();
  }

  /**
   * Get Metatron's Grid visualization
   */
  getMetatronVisualization() {
    return this.metatronGridRouter.getMetatronVisualization();
  }

  /**
   * Get Metatron Grid stats
   */
  getMetatronStats() {
    return this.metatronGridRouter.getStats();
  }

  /**
   * Calculate route through Metatron's Grid
   */
  calculateMetatronRoute(sourceId: string, targetId: string) {
    return this.metatronGridRouter.calculateRoute(sourceId, targetId);
  }

  /**
   * Create entangled pair between agents
   */
  entangleAgents(agentA: string, agentB: string) {
    return this.entanglementProtocol.entangleAgents(agentA, agentB);
  }

  /**
   * Get entanglement stats
   */
  getEntanglementStats() {
    return this.entanglementProtocol.getStats();
  }

  /**
   * Get entanglement visualization
   */
  getEntanglementVisualization() {
    return this.entanglementProtocol.getVisualization();
  }

  /**
   * Get sacred geometry visualization with shard overlay
   * Maps actual shards to Flower of Life positions
   */
  getSacredGeometryWithShards(petals: number = 3) {
    const { flowerOfLifeGenerator } = require('../visualization/flowerOfLife.js');
    const geometry = flowerOfLifeGenerator.generate({ petals });
    
    // Map shards to circle positions
    const shardPositions = geometry.circles.map((circle: any, index: number) => {
      const shardId = index % this.totalShards;
      const shard = this.shardCoordinators.get(shardId);
      return {
        circleIndex: index,
        ring: circle.ring,
        position: { x: circle.cx, y: circle.cy },
        shardId,
        shardActive: !!shard,
        agentCount: shard ? shard.getStateSummary().agentCount : 0,
      };
    });

    return {
      geometry,
      shardPositions,
      totalActiveShards: Array.from(this.shardCoordinators.values()).filter(s => s.getStateSummary().agentCount > 0).length,
    };
  }

  /**
   * Get gossip flow visualization along vesica intersections
   */
  getGossipFlowVisualization() {
    const { flowerOfLifeGenerator } = require('../visualization/flowerOfLife.js');
    const geometry = flowerOfLifeGenerator.generate({ petals: 2 });
    
    // Map gossip flows to intersection points
    const gossipFlows = geometry.intersections.map((intersection: any) => {
      const [circle1, circle2] = intersection.circles;
      const shard1 = parseInt(circle1.split('-').pop() || '0') % this.totalShards;
      const shard2 = parseInt(circle2.split('-').pop() || '1') % this.totalShards;
      
      return {
        position: { x: intersection.x, y: intersection.y },
        shardPair: [shard1, shard2],
        vesicaPiscis: true,
        gossipActive: this.shardCoordinators.has(shard1) && this.shardCoordinators.has(shard2) && 
          this.shardCoordinators.get(shard1)!.getStateSummary().agentCount > 0 &&
          this.shardCoordinators.get(shard2)!.getStateSummary().agentCount > 0,
      };
    });

    return {
      intersections: geometry.intersections,
      gossipFlows,
      totalFlows: gossipFlows.length,
    };
  }

  /**
   * Navigate agent through sacred geometry lattice
   */
  navigateAgentThroughLattice(
    agentId: string,
    source: { x: number; y: number },
    target: { x: number; y: number }
  ) {
    const { swarmNavigator } = require('../visualization/swarmNavigator.js');
    
    // Initialize if needed
    if (swarmNavigator.getStats().totalNodes === 0) {
      swarmNavigator.initialize();
    }
    
    const route = swarmNavigator.findRoute(source, target);
    
    // Assign agent to first hub on route
    if (route.nodes.length > 0) {
      swarmNavigator.assignAgentToHub(agentId, route.nodes[0]);
    }
    
    logger.info('HierarchicalCoordinator', {
      message: 'Agent navigation through lattice',
      agentId,
      hops: route.hops,
      efficiency: route.efficiency.toFixed(2),
      geometry: route.geometry,
    });
    
    return route;
  }

  /**
   * Find optimal rendezvous for agent swarm
   */
  findSwarmRendezvous(agentPositions: Array<{ x: number; y: number }>) {
    const { swarmNavigator } = require('../visualization/swarmNavigator.js');
    
    if (swarmNavigator.getStats().totalNodes === 0) {
      swarmNavigator.initialize();
    }
    
    return swarmNavigator.findRendezvousPoint(agentPositions);
  }

  /**
   * Get swarm navigation network
   */
  getSwarmNavigationNetwork() {
    const { swarmNavigator } = require('../visualization/swarmNavigator.js');
    
    if (swarmNavigator.getStats().totalNodes === 0) {
      swarmNavigator.initialize();
    }
    
    return {
      network: swarmNavigator.getNavigationNetwork(),
      stats: swarmNavigator.getStats(),
    };
  }

  // ─── Flower of Life OS API ─────────────────────────────────────────────

  /**
   * Get living lattice state
   */
  getLatticeState() {
    return flowerOfLifeOS.getLatticeState();
  }

  /**
   * Get lattice stats
   */
  getLatticeStats() {
    return flowerOfLifeOS.getStats();
  }

  /**
   * Pulse from center
   */
  latticePulse(type: 'heartbeat' | 'audit' | 'decision' | 'alert' = 'heartbeat', data?: Record<string, unknown>) {
    flowerOfLifeOS.pulse(type, data);
  }

  /**
   * Route decision through center (Pillar 1)
   */
  routeLatticeDecision(type: string, data: Record<string, unknown>, sourceLayer: 0 | 1 | 2 | 3) {
    return flowerOfLifeOS.routeDecision(type, data, sourceLayer);
  }

  /**
   * Find harmonic path between two nodes (Pillar 5)
   */
  findLatticePath(sourceId: string, targetId: string) {
    return flowerOfLifeOS.findHarmonicPath(sourceId, targetId);
  }

  /**
   * Route a message through the living lattice
   */
  routeLatticeMessage(fromNodeId: string, toNodeId: string, message: Record<string, unknown>) {
    return flowerOfLifeOS.routeMessage(fromNodeId, toNodeId, message);
  }

  /**
   * Get energy flow state (Pillar 6)
   */
  getLatticeEnergyFlow() {
    return flowerOfLifeOS.getEnergyFlow();
  }

  /**
   * Calculate shard for agent
   */
  private getShardForAgent(agentId: string): number {
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = ((hash << 5) - hash) + agentId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) % this.totalShards;
  }
}

/**
 * Shard-local coordinator
 */
class ShardCoordinator extends EventEmitter {
  private shardId: number;
  private maxAgents: number;
  private agents: Map<string, AgentState> = new Map();
  private tasks: Map<string, TaskAssignment> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  // Gossip state from neighbors
  private neighborStates: Map<number, any> = new Map();

  constructor(shardId: number, maxAgents: number) {
    super();
    this.shardId = shardId;
    this.maxAgents = maxAgents;
  }

  start(): void {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  registerAgent(state: AgentState): void {
    this.agents.set(state.id, state);
  }

  assignTask(assignment: TaskAssignment): void {
    this.tasks.set(assignment.taskId, assignment);
  }

  processHeartbeat(agentId: string, metrics: { load: number; status: string }): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      agent.load = metrics.load;
      agent.status = metrics.status as AgentState['status'];
    }
  }

  receiveGossip(shardId: number, state: any): void {
    this.neighborStates.set(shardId, state);
  }

  getStateSummary() {
    const agents = Array.from(this.agents.values());
    return {
      shardId: this.shardId,
      agentCount: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      busyAgents: agents.filter(a => a.status === 'busy').length,
      pendingTasks: this.tasks.size,
      neighborStates: this.neighborStates.size,
    };
  }

  private performHealthCheck(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds
    
    for (const [agentId, state] of this.agents) {
      if (now - state.lastHeartbeat > timeout) {
        state.status = 'offline';
        logger.warn('ShardCoordinator', {
          message: 'Agent marked offline',
          agentId,
          shardId: this.shardId,
          lastHeartbeat: state.lastHeartbeat,
        });
        
        this.emit('agent_offline', { agentId, shardId: this.shardId });
      }
    }
  }
}

// Export singleton
export const hierarchicalCoordinator = new HierarchicalCoordinator();
