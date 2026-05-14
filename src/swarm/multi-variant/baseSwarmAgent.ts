/**
 * Base Swarm Agent Classes for Multi-Variant Architecture
 * 
 * Abstract base class with tier-based capabilities
 * - Tier 1: Executors (task execution)
 * - Tier 2: Analysts (aggregation/analysis)
 * - Tier 3: Planners (orchestration/coordination)
 */

export type AgentTier = 1 | 2 | 3;
export type AgentRole = 'executor' | 'analyst' | 'planner';
export type SwarmClass = 'micro' | 'normal' | 'macro';
export type AgentStatus = 'idle' | 'working' | 'completed' | 'failed' | 'standby';

export interface AgentConfig {
  id: string;
  tier: AgentTier;
  role: AgentRole;
  swarmClass: SwarmClass;
  capabilities: string[];
  maxConcurrentTasks: number;
  timeoutMs: number;
}

export interface Task {
  id: string;
  type: string;
  payload: any;
  priority: number; // 0.0-1.0
  deadline: number;
  assignedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalWorkTime: number;
  averageTaskDuration: number;
  currentLoad: number; // 0.0-1.0
  lastHeartbeat: number;
  hbarEarned: number;
}

export abstract class BaseSwarmAgent {
  protected config: AgentConfig;
  protected status: AgentStatus = 'standby';
  protected currentTasks: Map<string, Task> = new Map();
  protected metrics: AgentMetrics;
  protected embedding: number[] = [];
  protected extent: number[] = [];
  protected intent: string = '';
  protected confidence: number = 0.0;
  protected parentId?: string;
  protected children: string[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.metrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalWorkTime: 0,
      averageTaskDuration: 0,
      currentLoad: 0,
      lastHeartbeat: Date.now(),
      hbarEarned: 0
    };
    
    this.initializeEmbedding();
  }

  /**
   * Initialize agent's lattice embedding
   */
  private initializeEmbedding(): void {
    const dim = 128; // Standard embedding dimension
    this.embedding = Array(dim).fill(0).map(() => (Math.random() - 0.5) * 2);
    this.extent = Array(dim).fill(0).map(() => Math.random() * 0.5);
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get agent tier
   */
  getTier(): AgentTier {
    return this.config.tier;
  }

  /**
   * Get agent role
   */
  getRole(): AgentRole {
    return this.config.role;
  }

  /**
   * Get swarm class
   */
  getSwarmClass(): SwarmClass {
    return this.config.swarmClass;
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Get lattice embedding
   */
  getEmbedding(): number[] {
    return [...this.embedding];
  }

  /**
   * Get current intent
   */
  getIntent(): string {
    return this.intent;
  }

  /**
   * Set agent intent
   */
  setIntent(intent: string, confidence: number): void {
    this.intent = intent;
    this.confidence = Math.max(0, Math.min(1, confidence));
  }

  /**
   * Check if agent can accept more tasks
   */
  canAcceptTask(): boolean {
    return this.currentTasks.size < this.config.maxConcurrentTasks && 
           this.status !== 'failed';
  }

  /**
   * Get current load (0.0-1.0)
   */
  getCurrentLoad(): number {
    return this.currentTasks.size / this.config.maxConcurrentTasks;
  }

  /**
   * Assign a task to this agent
   */
  async assignTask(task: Task): Promise<boolean> {
    if (!this.canAcceptTask()) {
      return false;
    }

    this.currentTasks.set(task.id, {
      ...task,
      assignedAt: Date.now()
    });

    this.status = 'working';
    this.metrics.currentLoad = this.getCurrentLoad();

    // Execute task based on role
    try {
      await this.executeTask(task);
      return true;
    } catch (error) {
      this.handleTaskFailure(task, error as Error);
      return false;
    }
  }

  /**
   * Execute task - implemented by subclasses
   */
  protected abstract executeTask(task: Task): Promise<void>;

  /**
   * Handle task completion
   */
  protected handleTaskCompletion(task: Task, result: any): void {
    const completedTask = this.currentTasks.get(task.id);
    if (!completedTask) return;

    const duration = Date.now() - (completedTask.assignedAt || Date.now());
    
    completedTask.completedAt = Date.now();
    completedTask.result = result;
    
    this.currentTasks.delete(task.id);
    
    // Update metrics
    this.metrics.tasksCompleted++;
    this.metrics.totalWorkTime += duration;
    this.metrics.averageTaskDuration = 
      this.metrics.totalWorkTime / this.metrics.tasksCompleted;
    this.metrics.currentLoad = this.getCurrentLoad();

    // Update status
    if (this.currentTasks.size === 0) {
      this.status = 'completed';
      setTimeout(() => {
        if (this.currentTasks.size === 0) {
          this.status = 'idle';
        }
      }, 100);
    }
  }

  /**
   * Handle task failure
   */
  protected handleTaskFailure(task: Task, error: Error): void {
    const failedTask = this.currentTasks.get(task.id);
    if (!failedTask) return;

    failedTask.error = error.message;
    this.currentTasks.delete(task.id);

    this.metrics.tasksFailed++;
    this.metrics.currentLoad = this.getCurrentLoad();
    this.status = 'failed';

    // Auto-recover after delay
    setTimeout(() => {
      this.status = 'idle';
    }, 1000);
  }

  /**
   * Send heartbeat
   */
  heartbeat(): void {
    this.metrics.lastHeartbeat = Date.now();
  }

  /**
   * Check if agent is healthy
   */
  isHealthy(): boolean {
    const timeSinceHeartbeat = Date.now() - this.metrics.lastHeartbeat;
    const maxHeartbeatInterval = 30000; // 30 seconds
    
    return timeSinceHeartbeat < maxHeartbeatInterval && 
           this.status !== 'failed';
  }

  /**
   * Get agent state for serialization
   */
  getState(): object {
    return {
      id: this.config.id,
      tier: this.config.tier,
      role: this.config.role,
      swarmClass: this.config.swarmClass,
      status: this.status,
      metrics: this.metrics,
      embedding: this.embedding,
      intent: this.intent,
      confidence: this.confidence,
      currentTasks: Array.from(this.currentTasks.values()),
      parentId: this.parentId,
      children: this.children
    };
  }

  /**
   * Set parent agent (for hierarchical relationships)
   */
  setParent(parentId: string): void {
    this.parentId = parentId;
  }

  /**
   * Add child agent
   */
  addChild(childId: string): void {
    if (!this.children.includes(childId)) {
      this.children.push(childId);
    }
  }

  /**
   * Remove child agent
   */
  removeChild(childId: string): void {
    this.children = this.children.filter(id => id !== childId);
  }

  /**
   * Calculate lattice meet (intersection) with another agent
   */
  calculateMeet(other: BaseSwarmAgent): { overlapScore: number; constraints: string[] } {
    const otherEmbedding = other.getEmbedding();
    
    // Calculate dot product for overlap
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < this.embedding.length; i++) {
      dotProduct += this.embedding[i] * otherEmbedding[i];
      magnitudeA += this.embedding[i] * this.embedding[i];
      magnitudeB += otherEmbedding[i] * otherEmbedding[i];
    }
    
    const overlapScore = dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
    
    // Determine shared constraints based on overlap
    const constraints: string[] = [];
    if (overlapScore > 0.8) {
      constraints.push('high_alignment');
    }
    if (this.intent === other.getIntent()) {
      constraints.push('shared_intent');
    }
    if (this.config.swarmClass === other.getSwarmClass()) {
      constraints.push('same_class');
    }

    return { overlapScore, constraints };
  }

  /**
   * Calculate lattice join (union) with another agent
   */
  calculateJoin(other: BaseSwarmAgent): { coverage: number; aggregatedIntents: string[] } {
    const meet = this.calculateMeet(other);
    
    // Coverage is inverse of how much we overlap (more different = more coverage)
    const coverage = 1 - Math.abs(meet.overlapScore);
    
    // Aggregate intents
    const aggregatedIntents = [this.intent, other.getIntent()].filter(Boolean);
    
    return { coverage, aggregatedIntents };
  }

  /**
   * Shutdown agent
   */
  shutdown(): void {
    this.status = 'standby';
    this.currentTasks.clear();
    this.intent = '';
    this.confidence = 0;
  }
}
