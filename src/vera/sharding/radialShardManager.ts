/**
 * Radial Shard Manager
 *
 * Implements sacred geometry-inspired dynamic shard spawning. New shards
 * emerge from the intersection (vesica piscis) of two existing shards,
 * following the "flower of life" growth pattern.
 *
 * Features:
 * - Geometric shard spawning at intersection points
 * - Automatic load-based scaling
 * - Graceful rebalancing without message loss
 * - Shard retirement when load decreases
 * - Radial distribution following flower of life pattern
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface Shard {
  id: number;
  parentA: number; // First parent shard
  parentB: number; // Second parent shard (vesica piscis intersection)
  level: number; // Generation level (0 = seed, 1 = first ring, etc.)
  capacity: number;
  agentCount: number;
  loadFactor: number; // 0-1 scale
  status: 'active' | 'draining' | 'retired';
  createdAt: number;
  topicId: string;
  geometricAngle: number; // Position in flower of life pattern
  geometricRadius: number; // Distance from center
}

export interface RadialConfig {
  seedShards: number; // Initial shards (7 for seed of life)
  maxShards: number; // Maximum (50 for full flower of life)
  shardCapacity: number;
  spawnThreshold: number; // Load factor to trigger spawn (0.8)
  retireThreshold: number; // Load factor to trigger retirement (0.2)
  rebalanceIntervalMs: number;
  enableRetirement: boolean;
  minShardLifetimeMs: number; // Minimum time before retirement
}

const DEFAULT_CONFIG: RadialConfig = {
  seedShards: 7,
  maxShards: 50,
  shardCapacity: 100,
  spawnThreshold: 0.8,
  retireThreshold: 0.2,
  rebalanceIntervalMs: 60000,
  enableRetirement: true,
  minShardLifetimeMs: 5 * 60 * 1000, // 5 minutes
};

export class RadialShardManager extends EventEmitter {
  private shards: Map<number, Shard> = new Map();
  private config: RadialConfig;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private nextShardId = 0;

  // Statistics
  private stats = {
    shardsSpawned: 0,
    shardsRetired: 0,
    migrationsCompleted: 0,
    failedSpawns: 0,
  };

  constructor(config: Partial<RadialConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeSeedShards();
  }

  /**
   * Initialize the seed of life (7 central shards)
   */
  private initializeSeedShards(): void {
    // Create central shard (0)
    this.createShard(0, -1, -1, 0, 0, 0);

    // Create 6 surrounding shards forming the seed of life pattern
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60) * (Math.PI / 180);
      const radius = 200;
      this.createShard(
        i + 1,
        0, // All connected to center
        i === 0 ? 6 : i, // Each connected to previous
        1,
        angle,
        radius
      );
    }

    this.nextShardId = 7;

    logger.info('RadialShardManager', {
      message: 'Seed of life initialized',
      seedShards: this.config.seedShards,
      shards: this.shards.size,
    });
  }

  /**
   * Create a new shard with geometric positioning
   */
  private createShard(
    id: number,
    parentA: number,
    parentB: number,
    level: number,
    angle: number,
    radius: number
  ): Shard {
    const shard: Shard = {
      id,
      parentA,
      parentB,
      level,
      capacity: this.config.shardCapacity,
      agentCount: 0,
      loadFactor: 0,
      status: 'active',
      createdAt: Date.now(),
      topicId: `0.0.${10415000 + id}`,
      geometricAngle: angle,
      geometricRadius: radius,
    };

    this.shards.set(id, shard);
    return shard;
  }

  /**
   * Start the radial shard manager
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Periodic load check and scaling decisions
    this.checkTimer = setInterval(() => {
      this.evaluateAndScale();
    }, this.config.rebalanceIntervalMs);

    logger.info('RadialShardManager', {
      message: 'Radial shard manager started',
      activeShards: this.shards.size,
      maxShards: this.config.maxShards,
    });

    this.emit('started', { shardCount: this.shards.size });
  }

  /**
   * Stop the radial shard manager
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    logger.info('RadialShardManager', { message: 'Radial shard manager stopped' });
    this.emit('stopped');
  }

  /**
   * Evaluate load and spawn/retire shards as needed
   */
  private evaluateAndScale(): void {
    const activeShards = Array.from(this.shards.values()).filter(
      (s) => s.status === 'active'
    );

    // Check for shards needing spawn (high load)
    const overloadedShards = activeShards.filter(
      (s) => s.loadFactor >= this.config.spawnThreshold
    );

    for (const shard of overloadedShards) {
      if (this.shards.size >= this.config.maxShards) {
        logger.warn('RadialShardManager', {
          message: 'Maximum shards reached, cannot spawn',
          current: this.shards.size,
          max: this.config.maxShards,
        });
        break;
      }

      this.spawnShardAtIntersection(shard.id);
    }

    // Check for shards to retire (low load)
    if (this.config.enableRetirement) {
      const underloadedShards = activeShards.filter(
        (s) =>
          s.loadFactor <= this.config.retireThreshold &&
          s.agentCount === 0 &&
          Date.now() - s.createdAt > this.config.minShardLifetimeMs
      );

      for (const shard of underloadedShards.slice(0, 2)) {
        // Retire max 2 at a time
        this.retireShard(shard.id);
      }
    }
  }

  /**
   * Spawn a new shard at the intersection of two parent shards
   * (vesica piscis geometry)
   */
  private spawnShardAtIntersection(parentId: number): Shard | null {
    const parent = this.shards.get(parentId);
    if (!parent) return null;

    // Find the best neighbor to intersect with
    let bestNeighbor: Shard | null = null;
    let bestLoad = 0;

    // Check all active shards as potential neighbors
    for (const [id, shard] of this.shards) {
      if (
        id !== parentId &&
        shard.status === 'active' &&
        shard.loadFactor >= this.config.spawnThreshold
      ) {
        if (shard.loadFactor > bestLoad) {
          bestLoad = shard.loadFactor;
          bestNeighbor = shard;
        }
      }
    }

    // If no overloaded neighbor, use geometric proximity
    if (!bestNeighbor) {
      bestNeighbor = this.findGeometricNeighbor(parent);
    }

    if (!bestNeighbor) {
      this.stats.failedSpawns++;
      return null;
    }

    // Calculate intersection position (midpoint + offset for vesica piscis)
    const intersection = this.calculateVesicaIntersection(parent, bestNeighbor);

    // Create the new shard
    const newShardId = this.nextShardId++;
    const newShard = this.createShard(
      newShardId,
      parent.id,
      bestNeighbor.id,
      Math.max(parent.level, bestNeighbor.level) + 1,
      intersection.angle,
      intersection.radius
    );

    this.stats.shardsSpawned++;

    logger.info('RadialShardManager', {
      message: 'New shard spawned at vesica piscis intersection',
      shardId: newShardId,
      parentA: parent.id,
      parentB: bestNeighbor.id,
      level: newShard.level,
      angle: (intersection.angle * 180) / Math.PI,
      radius: intersection.radius,
    });

    this.emit('shard_spawned', {
      shardId: newShardId,
      parentA: parent.id,
      parentB: bestNeighbor.id,
      position: intersection,
      totalShards: this.shards.size,
    });

    return newShard;
  }

  /**
   * Calculate vesica piscis intersection point between two shards
   */
  private calculateVesicaIntersection(
    shardA: Shard,
    shardB: Shard
  ): { angle: number; radius: number } {
    // Convert to cartesian
    const x1 = Math.cos(shardA.geometricAngle) * shardA.geometricRadius;
    const y1 = Math.sin(shardA.geometricAngle) * shardA.geometricRadius;
    const x2 = Math.cos(shardB.geometricAngle) * shardB.geometricRadius;
    const y2 = Math.sin(shardB.geometricAngle) * shardB.geometricRadius;

    // Midpoint
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // Convert back to polar
    const angle = Math.atan2(midY, midX);
    const radius = Math.sqrt(midX * midX + midY * midY);

    return { angle, radius };
  }

  /**
   * Find geometrically closest neighbor
   */
  private findGeometricNeighbor(shard: Shard): Shard | null {
    let closest: Shard | null = null;
    let minDistance = Infinity;

    for (const [id, other] of this.shards) {
      if (id === shard.id || other.status !== 'active') continue;

      const distance = this.geometricDistance(shard, other);
      if (distance < minDistance) {
        minDistance = distance;
        closest = other;
      }
    }

    return closest;
  }

  /**
   * Calculate geometric distance between shards
   */
  private geometricDistance(a: Shard, b: Shard): number {
    const x1 = Math.cos(a.geometricAngle) * a.geometricRadius;
    const y1 = Math.sin(a.geometricAngle) * a.geometricRadius;
    const x2 = Math.cos(b.geometricAngle) * b.geometricRadius;
    const y2 = Math.sin(b.geometricAngle) * b.geometricRadius;

    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Retire a shard gracefully
   */
  private retireShard(shardId: number): void {
    const shard = this.shards.get(shardId);
    if (!shard || shard.status !== 'active') return;

    // Mark as draining
    shard.status = 'draining';

    logger.info('RadialShardManager', {
      message: 'Shard retiring',
      shardId,
      age: Date.now() - shard.createdAt,
    });

    this.emit('shard_draining', { shardId });

    // In production: migrate agents to other shards
    // For now, just mark as retired when empty
    if (shard.agentCount === 0) {
      shard.status = 'retired';
      this.stats.shardsRetired++;

      this.emit('shard_retired', { shardId });
    }
  }

  /**
   * Register an agent with appropriate shard
   */
  assignAgentToShard(agentId: string, capabilities: string[]): number {
    // Find shard with lowest load that has matching capabilities
    let bestShard: Shard | null = null;
    let bestLoad = Infinity;

    for (const shard of this.shards.values()) {
      if (shard.status !== 'active') continue;
      if (shard.agentCount >= shard.capacity) continue;

      if (shard.loadFactor < bestLoad) {
        bestLoad = shard.loadFactor;
        bestShard = shard;
      }
    }

    if (!bestShard) {
      // All shards full - try to spawn new one
      const mostLoaded = Array.from(this.shards.values())
        .filter((s) => s.status === 'active')
        .sort((a, b) => b.loadFactor - a.loadFactor)[0];

      if (mostLoaded && this.shards.size < this.config.maxShards) {
        const newShard = this.spawnShardAtIntersection(mostLoaded.id);
        if (newShard) {
          bestShard = newShard;
        }
      }
    }

    if (!bestShard) {
      throw new Error('No available shards for agent assignment');
    }

    bestShard.agentCount++;
    bestShard.loadFactor = bestShard.agentCount / bestShard.capacity;

    return bestShard.id;
  }

  /**
   * Remove an agent from its shard
   */
  removeAgentFromShard(agentId: string, shardId: number): void {
    const shard = this.shards.get(shardId);
    if (!shard) return;

    shard.agentCount = Math.max(0, shard.agentCount - 1);
    shard.loadFactor = shard.agentCount / shard.capacity;

    // Check if draining shard can be retired
    if (shard.status === 'draining' && shard.agentCount === 0) {
      shard.status = 'retired';
      this.stats.shardsRetired++;
      this.emit('shard_retired', { shardId });
    }
  }

  /**
   * Get all active shards
   */
  getActiveShards(): Shard[] {
    return Array.from(this.shards.values()).filter((s) => s.status === 'active');
  }

  /**
   * Get shard by ID
   */
  getShard(shardId: number): Shard | undefined {
    return this.shards.get(shardId);
  }

  /**
   * Get flower of life visualization data
   */
  getFlowerOfLifeVisualization() {
    const shards = Array.from(this.shards.values());

    return {
      rings: this.groupByRing(shards),
      totalShards: shards.length,
      activeShards: shards.filter((s) => s.status === 'active').length,
      seedShards: shards.filter((s) => s.level === 0).length,
      outerRingShards: shards.filter((s) => s.level > 0).length,
      averageLoad:
        shards.reduce((sum, s) => sum + s.loadFactor, 0) / shards.length || 0,
      nodes: shards.map((s) => ({
        id: s.id,
        x: Math.cos(s.geometricAngle) * s.geometricRadius,
        y: Math.sin(s.geometricAngle) * s.geometricRadius,
        level: s.level,
        status: s.status,
        load: s.loadFactor,
        parentA: s.parentA >= 0 ? s.parentA : null,
        parentB: s.parentB >= 0 ? s.parentB : null,
      })),
    };
  }

  /**
   * Group shards by ring level
   */
  private groupByRing(shards: Shard[]): Array<{ level: number; count: number }> {
    const byLevel = new Map<number, number>();

    for (const shard of shards) {
      byLevel.set(shard.level, (byLevel.get(shard.level) || 0) + 1);
    }

    return Array.from(byLevel.entries())
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => a.level - b.level);
  }

  /**
   * Get manager statistics
   */
  getStats() {
    const shards = Array.from(this.shards.values());

    return {
      ...this.stats,
      totalShards: shards.length,
      activeShards: shards.filter((s) => s.status === 'active').length,
      drainingShards: shards.filter((s) => s.status === 'draining').length,
      retiredShards: shards.filter((s) => s.status === 'retired').length,
      totalAgents: shards.reduce((sum, s) => sum + s.agentCount, 0),
      averageLoad:
        shards.reduce((sum, s) => sum + s.loadFactor, 0) / shards.length || 0,
      maxShards: this.config.maxShards,
    };
  }

  /**
   * Manually trigger shard spawn (admin operation)
   */
  manualSpawnShard(parentId: number): Shard | null {
    if (this.shards.size >= this.config.maxShards) {
      logger.warn('RadialShardManager', {
        message: 'Cannot manually spawn - max shards reached',
        current: this.shards.size,
        max: this.config.maxShards,
      });
      return null;
    }

    return this.spawnShardAtIntersection(parentId);
  }

  /**
   * Force retire a shard (admin operation)
   */
  forceRetireShard(shardId: number): boolean {
    const shard = this.shards.get(shardId);
    if (!shard || shard.status !== 'active') return false;

    if (shard.agentCount > 0) {
      logger.warn('RadialShardManager', {
        message: 'Cannot retire shard with active agents',
        shardId,
        agentCount: shard.agentCount,
      });
      return false;
    }

    this.retireShard(shardId);
    return true;
  }
}

export default RadialShardManager;
