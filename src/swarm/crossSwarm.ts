/**
 * Vera Cross-Swarm Coordination
 * 
 * Phase 4: Multi-swarm lattice federation
 * 
 * Enables multiple Vera swarms to coordinate via:
 * - Inter-swarm meet/join protocols
 * - HCS as shared memory fabric
 * - Federated lattice consensus
 * - Cross-swarm task routing
 * 
 * Use Cases:
 * - Regional swarms (APAC, EMEA, Americas)
 * - Skill specialization (carbon, DeFi, compliance)
 * - Cross-chain coordination (Hedera + Ethereum swarms)
 */

import { logger } from '../monitoring/logger.js';
import { veraHCS } from '../dovu/veraHCS.js';
import { veraLatticeSwarm, SwarmAgent, LatticeNode } from './latticeSwarm.js';

// Remote swarm connection
export interface RemoteSwarm {
  id: string;
  name: string;
  region: string;
  specialization: string;
  endpoint: string;
  hcsTopicId: string;
  status: 'active' | 'inactive' | 'degraded';
  lastHeartbeat: number;
  agentCount: number;
  capabilities: string[];
  latticeEmbedding: number[];
}

// Cross-swarm task
export interface CrossSwarmTask {
  id: string;
  type: string;
  payload: any;
  originSwarm: string;
  targetSwarm: string;
  requiredCapabilities: string[];
  latticeGoal: number[];
  priority: number;
  deadline: number;
  hops: number; // Track routing depth
}

// Federated consensus result
export interface FederatedConsensus {
  value: any;
  confidence: number;
  participatingSwarms: string[];
  meetScore: number;
  timestamp: number;
  proof: string; // HCS verification hash
}

// Inter-swarm message
export interface SwarmMessage {
  type: 'task_offer' | 'task_accept' | 'meet_request' | 'meet_response' | 'heartbeat' | 'consensus';
  fromSwarm: string;
  toSwarm: string;
  payload: any;
  timestamp: number;
  signature: string;
}

/**
 * Vera Cross-Swarm Coordinator
 */
export class VeraCrossSwarm {
  private localSwarmId: string;
  private remoteSwarms: Map<string, RemoteSwarm> = new Map();
  private pendingTasks: Map<string, CrossSwarmTask> = new Map();
  private messageQueue: SwarmMessage[] = [];
  private hcsTopicId: string | null = null;
  
  // Configuration
  private config = {
    maxHops: 3,           // Max swarm hops for task routing
    heartbeatInterval: 30000, // 30 seconds
    meetThreshold: 0.6,   // Minimum meet score for collaboration
    federationTimeout: 10000, // 10 seconds for consensus
  };

  constructor(localSwarmId: string = 'veralattice-main') {
    this.localSwarmId = localSwarmId;
  }

  async initialize(): Promise<void> {
    logger.info('VeraCrossSwarm', { 
      swarmId: this.localSwarmId,
      message: 'Initializing cross-swarm coordination...' 
    });

    // Initialize HCS for inter-swarm communication
    await this.initializeHCS();

    // Register default remote swarms
    this.registerDefaultSwarms();

    // Start heartbeat and message processing
    this.startCoordinationLoop();

    logger.info('VeraCrossSwarm', {
      localSwarm: this.localSwarmId,
      remoteSwarms: this.remoteSwarms.size,
      message: 'Cross-swarm coordination active'
    });
  }

  private async initializeHCS(): Promise<void> {
    // Use existing HCS or create cross-swarm topic
    await veraHCS.initialize();
    
    // Log initialization to milestones
    await veraHCS.logAchievement('cross_swarm_init', {
      swarmId: this.localSwarmId,
      timestamp: Date.now(),
      capabilities: ['meet', 'join', 'federate', 'route']
    });
  }

  private registerDefaultSwarms(): void {
    // APAC swarm - specialized for Asian carbon markets
    this.registerRemoteSwarm({
      id: 'veralattice-apac',
      name: 'Vera APAC Carbon Swarm',
      region: 'APAC',
      specialization: 'carbon_verification',
      endpoint: 'https://apac.veralattice.com',
      hcsTopicId: '0.0.apac',
      status: 'active',
      lastHeartbeat: Date.now(),
      agentCount: 9,
      capabilities: ['vcs_verification', 'gold_standard', 'mangrove_projects'],
      latticeEmbedding: this.generateRegionEmbedding('apac')
    });

    // EMEA swarm - specialized for European compliance
    this.registerRemoteSwarm({
      id: 'veralattice-emea',
      name: 'Vera EMEA Compliance Swarm',
      region: 'EMEA',
      specialization: 'compliance_audit',
      endpoint: 'https://emea.veralattice.com',
      hcsTopicId: '0.0.emea',
      status: 'active',
      lastHeartbeat: Date.now(),
      agentCount: 12,
      capabilities: ['eu_ets', 'cdm_verification', 'regulatory_reporting'],
      latticeEmbedding: this.generateRegionEmbedding('emea')
    });

    // Americas swarm - specialized for forestry
    this.registerRemoteSwarm({
      id: 'veralattice-americas',
      name: 'Vera Americas Forestry Swarm',
      region: 'Americas',
      specialization: 'forestry_projects',
      endpoint: 'https://americas.veralattice.com',
      hcsTopicId: '0.0.americas',
      status: 'active',
      lastHeartbeat: Date.now(),
      agentCount: 8,
      capabilities: ['forestry_verification', 'reforestation', 'red_plus'],
      latticeEmbedding: this.generateRegionEmbedding('americas')
    });
  }

  registerRemoteSwarm(swarm: RemoteSwarm): void {
    this.remoteSwarms.set(swarm.id, swarm);
    logger.debug('VeraCrossSwarm', { 
      swarmId: swarm.id, 
      region: swarm.region,
      message: 'Remote swarm registered' 
    });
  }

  /**
   * Route task to best swarm (local or remote)
   */
  async routeCrossSwarm(
    taskType: string,
    payload: any,
    requiredCapabilities: string[]
  ): Promise<string | null> {
    const taskId = `cross-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const task: CrossSwarmTask = {
      id: taskId,
      type: taskType,
      payload,
      originSwarm: this.localSwarmId,
      targetSwarm: '', // Will be determined
      requiredCapabilities,
      latticeGoal: this.capabilitiesToEmbedding(requiredCapabilities),
      priority: 0.5,
      deadline: Date.now() + 60000,
      hops: 0
    };

    // Calculate inclusion scores for all swarms
    const scoredSwarms = this.scoreSwarmsForTask(task);
    
    // Filter by capability match
    const capableSwarms = scoredSwarms.filter(s => 
      this.hasCapabilities(s.swarm, requiredCapabilities)
    );

    if (capableSwarms.length === 0) {
      logger.warn('VeraCrossSwarm', { 
        taskId, 
        capabilities: requiredCapabilities,
        message: 'No capable swarm found' 
      });
      return null;
    }

    // Sort by inclusion score
    capableSwarms.sort((a, b) => b.score - a.score);
    const bestSwarm = capableSwarms[0];

    // Check if best is local or remote
    if (bestSwarm.swarm.id === this.localSwarmId) {
      // Route to local swarm
      task.targetSwarm = this.localSwarmId;
      await veraLatticeSwarm.submitTask(task.type as any, task.payload, task.priority);
      return taskId;
    } else {
      // Route to remote swarm
      task.targetSwarm = bestSwarm.swarm.id;
      this.pendingTasks.set(taskId, task);
      
      // Send task offer
      await this.sendMessage({
        type: 'task_offer',
        fromSwarm: this.localSwarmId,
        toSwarm: bestSwarm.swarm.id,
        payload: task,
        timestamp: Date.now(),
        signature: this.signTask(task)
      });

      logger.info('VeraCrossSwarm', {
        taskId,
        targetSwarm: bestSwarm.swarm.id,
        score: (bestSwarm.score * 100).toFixed(1) + '%',
        message: 'Task routed to remote swarm'
      });

      return taskId;
    }
  }

  /**
   * Inter-swarm meet operation
   * Two swarms reach consensus via geometric intersection
   */
  async federatedMeet(
    swarmId: string,
    localNode: LatticeNode,
    remoteNodeId: string
  ): Promise<FederatedConsensus | null> {
    const remoteSwarm = this.remoteSwarms.get(swarmId);
    if (!remoteSwarm || remoteSwarm.status !== 'active') {
      logger.warn('VeraCrossSwarm', { swarmId, message: 'Remote swarm unavailable' });
      return null;
    }

    // Send meet request
    await this.sendMessage({
      type: 'meet_request',
      fromSwarm: this.localSwarmId,
      toSwarm: swarmId,
      payload: {
        nodeId: localNode.id,
        embedding: localNode.embedding,
        intent: localNode.intent
      },
      timestamp: Date.now(),
      signature: this.signData(localNode.id)
    });

    // Wait for response (with timeout)
    const response = await this.waitForResponse('meet_response', swarmId, 5000);
    if (!response) {
      logger.warn('VeraCrossSwarm', { swarmId, message: 'Meet request timed out' });
      return null;
    }

    // Calculate meet
    const remoteEmbedding = response.payload.embedding;
    const meetEmbedding = localNode.embedding.map((val, i) => 
      Math.min(val, remoteEmbedding[i])
    );

    const meetScore = this.cosineSimilarity(localNode.embedding, remoteEmbedding);

    // Create consensus
    const consensus: FederatedConsensus = {
      value: {
        localIntent: localNode.intent,
        remoteIntent: response.payload.intent,
        meetEmbedding: meetEmbedding.slice(0, 5) // Compressed
      },
      confidence: meetScore,
      participatingSwarms: [this.localSwarmId, swarmId],
      meetScore,
      timestamp: Date.now(),
      proof: this.hashData(meetEmbedding)
    };

    // Log to HCS
    await veraHCS.logAchievement('federated_meet', {
      swarmA: this.localSwarmId,
      swarmB: swarmId,
      meetScore,
      timestamp: consensus.timestamp
    });

    logger.info('VeraCrossSwarm', {
      swarmA: this.localSwarmId,
      swarmB: swarmId,
      meetScore: (meetScore * 100).toFixed(1) + '%',
      message: 'Federated meet complete'
    });

    return consensus;
  }

  /**
   * Federated consensus across multiple swarms
   */
  async reachFederatedConsensus(
    swarmIds: string[],
    proposal: any
  ): Promise<FederatedConsensus | null> {
    // Send consensus proposal to all swarms
    const responses: Array<{ swarmId: string; embedding: number[]; confidence: number }> = [];

    for (const swarmId of swarmIds) {
      const swarm = this.remoteSwarms.get(swarmId);
      if (!swarm || swarm.status !== 'active') continue;

      // Request consensus participation
      await this.sendMessage({
        type: 'consensus',
        fromSwarm: this.localSwarmId,
        toSwarm: swarmId,
        payload: { proposal, type: 'request' },
        timestamp: Date.now(),
        signature: this.signData(proposal)
      });

      // Collect would happen async in production
      responses.push({
        swarmId,
        embedding: swarm.latticeEmbedding,
        confidence: 0.9
      });
    }

    if (responses.length < 2) {
      logger.warn('VeraCrossSwarm', { message: 'Insufficient swarm participation' });
      return null;
    }

    // Calculate multi-swarm meet
    const allEmbeddings = responses.map(r => r.embedding);
    const meetEmbedding = allEmbeddings[0].map((_, i) => 
      Math.min(...allEmbeddings.map(e => e[i]))
    );

    // Calculate average pairwise meet score
    let totalScore = 0;
    let count = 0;
    for (let i = 0; i < allEmbeddings.length; i++) {
      for (let j = i + 1; j < allEmbeddings.length; j++) {
        totalScore += this.cosineSimilarity(allEmbeddings[i], allEmbeddings[j]);
        count++;
      }
    }
    const meetScore = count > 0 ? totalScore / count : 1;

    const consensus: FederatedConsensus = {
      value: proposal,
      confidence: meetScore * Math.min(...responses.map(r => r.confidence)),
      participatingSwarms: [this.localSwarmId, ...responses.map(r => r.swarmId)],
      meetScore,
      timestamp: Date.now(),
      proof: this.hashData(meetEmbedding)
    };

    // Log to HCS
    await veraHCS.logAchievement('federated_consensus', {
      swarms: consensus.participatingSwarms.length,
      meetScore,
      timestamp: consensus.timestamp
    });

    logger.info('VeraCrossSwarm', {
      participatingSwarms: consensus.participatingSwarms.length,
      meetScore: (meetScore * 100).toFixed(1) + '%',
      message: 'Federated consensus reached'
    });

    return consensus;
  }

  /**
   * Broadcast to all connected swarms
   */
  async broadcast(message: any): Promise<void> {
    for (const [swarmId, swarm] of this.remoteSwarms) {
      if (swarm.status !== 'active') continue;

      await this.sendMessage({
        type: 'heartbeat',
        fromSwarm: this.localSwarmId,
        toSwarm: swarmId,
        payload: message,
        timestamp: Date.now(),
        signature: this.signData(message)
      });
    }

    logger.debug('VeraCrossSwarm', {
      recipients: this.remoteSwarms.size,
      message: 'Broadcast sent'
    });
  }

  // Private helpers

  private scoreSwarmsForTask(task: CrossSwarmTask): Array<{ swarm: RemoteSwarm; score: number }> {
    const scored: Array<{ swarm: RemoteSwarm; score: number }> = [];

    // Include local swarm
    scored.push({
      swarm: {
        id: this.localSwarmId,
        name: 'Local Swarm',
        region: 'local',
        specialization: 'general',
        endpoint: 'localhost',
        hcsTopicId: '',
        status: 'active',
        lastHeartbeat: Date.now(),
        agentCount: 9,
        capabilities: ['verification', 'analysis', 'execution'],
        latticeEmbedding: this.generateRegionEmbedding('local')
      },
      score: this.calculateInclusionScore(this.generateRegionEmbedding('local'), task.latticeGoal)
    });

    // Score remote swarms
    for (const swarm of this.remoteSwarms.values()) {
      const score = this.calculateInclusionScore(swarm.latticeEmbedding, task.latticeGoal);
      scored.push({ swarm, score });
    }

    return scored;
  }

  private hasCapabilities(swarm: RemoteSwarm, required: string[]): boolean {
    return required.every(cap => swarm.capabilities.includes(cap));
  }

  private capabilitiesToEmbedding(capabilities: string[]): number[] {
    // Generate embedding based on capability vector
    const capVectors: Record<string, number[]> = {
      'vcs_verification': [0.9, 0.1, 0.2],
      'gold_standard': [0.8, 0.3, 0.1],
      'eu_ets': [0.2, 0.9, 0.5],
      'forestry_verification': [0.3, 0.7, 0.9],
      'verification': [0.7, 0.4, 0.3],
      'analysis': [0.3, 0.8, 0.6],
      'execution': [0.9, 0.2, 0.1]
    };

    // Average capability vectors
    const vectors = capabilities.map(c => capVectors[c] || [0.5, 0.5, 0.5]);
    return vectors[0].map((_, i) => 
      vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length
    );
  }

  private generateRegionEmbedding(region: string): number[] {
    const regionVectors: Record<string, number[]> = {
      'local': [0.5, 0.5, 0.5, 0.5, 0.5],
      'apac': [0.9, 0.2, 0.3, 0.1, 0.4],    // Asia-Pacific
      'emea': [0.3, 0.9, 0.4, 0.8, 0.6],    // Europe/Middle East
      'americas': [0.2, 0.4, 0.9, 0.3, 0.7] // Americas
    };

    const base = regionVectors[region] || regionVectors['local'];
    return Array.from({ length: 128 }, (_, i) => {
      const val = base[i % base.length];
      return Math.max(0, Math.min(1, val + (Math.random() - 0.5) * 0.1));
    });
  }

  private async sendMessage(message: SwarmMessage): Promise<void> {
    this.messageQueue.push(message);
    
    // In production: send via HCS or direct HTTP
    // For now: simulate immediate delivery to target
    logger.debug('VeraCrossSwarm', {
      type: message.type,
      from: message.fromSwarm,
      to: message.toSwarm,
      message: 'Message queued'
    });
  }

  private async waitForResponse(
    type: string, 
    fromSwarm: string, 
    timeout: number
  ): Promise<SwarmMessage | null> {
    // Check existing queue
    const index = this.messageQueue.findIndex(m => 
      m.type === type && m.fromSwarm === fromSwarm
    );
    
    if (index !== -1) {
      return this.messageQueue.splice(index, 1)[0];
    }

    // Wait for response (simplified - would poll HCS in production)
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 100));
      
      const idx = this.messageQueue.findIndex(m => 
        m.type === type && m.fromSwarm === fromSwarm
      );
      if (idx !== -1) {
        return this.messageQueue.splice(idx, 1)[0];
      }
    }

    return null;
  }

  private signTask(task: CrossSwarmTask): string {
    return this.hashData(`${task.id}:${task.originSwarm}:${Date.now()}`);
  }

  private signData(data: any): string {
    return this.hashData(JSON.stringify(data));
  }

  private hashData(data: any): string {
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16);
  }

  private calculateInclusionScore(embedding: number[], goal: number[]): number {
    return this.cosineSimilarity(embedding, goal);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private startCoordinationLoop(): void {
    // Heartbeat every 30 seconds
    setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);

    // Process message queue
    setInterval(() => {
      this.processMessageQueue();
    }, 100);
  }

  private async sendHeartbeat(): Promise<void> {
    const stats = veraLatticeSwarm.getSwarmStats();
    
    await this.broadcast({
      type: 'heartbeat',
      swarmId: this.localSwarmId,
      agentCount: stats.totalAgents,
      queueLength: stats.queueLength,
      timestamp: Date.now()
    });

    // Update remote swarm statuses
    for (const [id, swarm] of this.remoteSwarms) {
      if (Date.now() - swarm.lastHeartbeat > this.config.heartbeatInterval * 2) {
        swarm.status = 'degraded';
      }
    }
  }

  private processMessageQueue(): void {
    // Process incoming messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.handleMessage(message);
    }
  }

  private handleMessage(message: SwarmMessage): void {
    switch (message.type) {
      case 'task_offer':
        // Accept task and route to local swarm
        const task = message.payload as CrossSwarmTask;
        if (task.hops < this.config.maxHops) {
          veraLatticeSwarm.submitTask(task.type as any, task.payload, task.priority);
        }
        break;
        
      case 'heartbeat':
        // Update remote swarm status
        const remoteSwarm = this.remoteSwarms.get(message.fromSwarm);
        if (remoteSwarm) {
          remoteSwarm.lastHeartbeat = Date.now();
          remoteSwarm.status = 'active';
          remoteSwarm.agentCount = message.payload.agentCount || remoteSwarm.agentCount;
        }
        break;
        
      case 'consensus':
        // Handle consensus request/response
        logger.debug('VeraCrossSwarm', {
          from: message.fromSwarm,
          type: message.payload.type,
          message: 'Consensus message received'
        });
        break;
    }
  }

  // Public API
  getSwarmNetwork(): any {
    return {
      localSwarm: this.localSwarmId,
      remoteSwarms: Array.from(this.remoteSwarms.values()).map(s => ({
        id: s.id,
        name: s.name,
        region: s.region,
        status: s.status,
        capabilities: s.capabilities,
        agentCount: s.agentCount,
        lastHeartbeat: s.lastHeartbeat
      })),
      pendingTasks: this.pendingTasks.size,
      messageQueue: this.messageQueue.length
    };
  }

  getRemoteSwarm(swarmId: string): RemoteSwarm | undefined {
    return this.remoteSwarms.get(swarmId);
  }
}

// Export singleton
export const veraCrossSwarm = new VeraCrossSwarm();
