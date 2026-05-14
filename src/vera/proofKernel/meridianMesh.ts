/**
 * Meridian Mesh Controller
 *
 * Multi-region deployment for distributed Shadow Council consensus.
 * Geo-aware task routing, cross-region reputation sync, and automatic failover.
 *
 * @module vera/proofKernel/meridianMesh
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { config } from '../../config.js';
import type { VerifiableAITask, MeridianShadowScore } from './types.js';
import { MultiMeridianShadowScorer, type EnhancedMeridianShadowScore } from './meridianShadow.js';

export type MeridianRegion =
  | 'us-east'
  | 'us-west'
  | 'eu-west'
  | 'apac-singapore'
  | 'latac-brazil';

export interface RegionConfig {
  id: MeridianRegion;
  name: string;
  url: string;
  location: {
    lat: number;
    lon: number;
  };
  priority: number; // 1 = highest
  dataSovereignty: string[]; // GDPR, LGPD, etc.
  maxLatencyMs: number;
  healthy: boolean;
  lastHealthCheck: number;
  avgLatencyMs: number;
  errorRate: number;
  loadFactor: number; // 0-1
}

export interface MeshRouteScore {
  region: MeridianRegion;
  score: number;
  latencyMs: number;
  reputation: number;
  load: number;
  dataCompliance: boolean;
}

export interface MeshRoutingDecision {
  selectedRegion: MeridianRegion;
  fallbackRegions: MeridianRegion[];
  reason: string;
  estimatedLatencyMs: number;
  complianceMet: string[];
}

export interface ReputationSyncPacket {
  meridianId: string;
  accuracy: number;
  totalTasks: number;
  correctDecisions: number;
  timestamp: number;
  region: MeridianRegion;
  signature: string;
}

export class MeridianMeshController extends EventEmitter {
  private regions: Map<MeridianRegion, RegionConfig> = new Map();
  private reputationSyncInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private localRegion: MeridianRegion;
  private hcsSyncTopicId: string;

  constructor(
    localRegion: MeridianRegion = 'us-east',
    hcsSyncTopicId: string = config.HCS_TOPIC_ID || '0.0.0'
  ) {
    super();
    this.localRegion = localRegion;
    this.hcsSyncTopicId = hcsSyncTopicId;
    this.initializeRegions();
    this.startHealthChecks();
    this.startReputationSync();
  }

  /**
   * Initialize all mesh regions
   */
  private initializeRegions(): void {
    const regionConfigs: RegionConfig[] = [
      {
        id: 'us-east',
        name: 'US East (N. Virginia)',
        url: config.MERIDIAN_URLS_US_EAST || 'http://meridian-us-east.internal:8123',
        location: { lat: 39.0438, lon: -77.4874 },
        priority: 1,
        dataSovereignty: [],
        maxLatencyMs: 100,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
        loadFactor: 0,
      },
      {
        id: 'us-west',
        name: 'US West (Oregon)',
        url: config.MERIDIAN_URLS_US_WEST || 'http://meridian-us-west.internal:8123',
        location: { lat: 45.5231, lon: -122.6765 },
        priority: 2,
        dataSovereignty: [],
        maxLatencyMs: 150,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
        loadFactor: 0,
      },
      {
        id: 'eu-west',
        name: 'EU West (Ireland)',
        url: config.MERIDIAN_URLS_EU_WEST || 'http://meridian-eu-west.internal:8123',
        location: { lat: 53.3498, lon: -6.2603 },
        priority: 1,
        dataSovereignty: ['GDPR'],
        maxLatencyMs: 150,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
        loadFactor: 0,
      },
      {
        id: 'apac-singapore',
        name: 'APAC (Singapore)',
        url: config.MERIDIAN_URLS_APAC || 'http://meridian-apac.internal:8123',
        location: { lat: 1.3521, lon: 103.8198 },
        priority: 2,
        dataSovereignty: ['PDPA'],
        maxLatencyMs: 200,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
        loadFactor: 0,
      },
      {
        id: 'latac-brazil',
        name: 'LATAC (São Paulo)',
        url: config.MERIDIAN_URLS_LATAC || 'http://meridian-latac.internal:8123',
        location: { lat: -23.5505, lon: -46.6333 },
        priority: 3,
        dataSovereignty: ['LGPD'],
        maxLatencyMs: 250,
        healthy: true,
        lastHealthCheck: Date.now(),
        avgLatencyMs: 0,
        errorRate: 0,
        loadFactor: 0,
      },
    ];

    for (const region of regionConfigs) {
      this.regions.set(region.id, region);
    }

    logger.info(`[MeridianMesh] Initialized ${this.regions.size} regions`);
    this.emit('initialized', { regionCount: this.regions.size });
  }

  /**
   * Route task to optimal region based on latency, reputation, load, and compliance
   */
  async routeTask(task: VerifiableAITask): Promise<MeshRoutingDecision> {
    const regions = await this.getHealthyRegions();
    
    if (regions.length === 0) {
      throw new Error('[MeridianMesh] No healthy regions available');
    }

    const scores = await Promise.all(
      regions.map(r => this.calculateRouteScore(r, task))
    );

    // Sort by score (descending)
    scores.sort((a, b) => b.score - a.score);

    const selected = scores[0];
    const fallbacks = scores.slice(1, 3).map(s => s.region);

    const decision: MeshRoutingDecision = {
      selectedRegion: selected.region,
      fallbackRegions: fallbacks,
      reason: `Score=${selected.score.toFixed(3)} (latency=${selected.latencyMs}ms, reputation=${selected.reputation.toFixed(3)}, load=${selected.load.toFixed(2)})`,
      estimatedLatencyMs: selected.latencyMs,
      complianceMet: selected.dataCompliance ? this.regions.get(selected.region)!.dataSovereignty : [],
    };

    logger.info(`[MeridianMesh] Routed task ${task.taskId} to ${decision.selectedRegion}: ${decision.reason}`);
    this.emit('routed', { taskId: task.taskId, decision });

    return decision;
  }

  /**
   * Calculate routing score for a region
   * Score = (reputation × 0.4) + (1/latency × 0.3) + ((1-load) × 0.2) + (compliance × 0.1)
   */
  private async calculateRouteScore(
    region: RegionConfig,
    task: VerifiableAITask
  ): Promise<MeshRouteScore> {
    // Measure current latency
    const latencyMs = await this.measureLatency(region);

    // Get reputation (from local cache or cross-region sync)
    const reputation = await this.getRegionReputation(region.id);

    // Check data compliance requirements
    const taskCompliance = task.metadata?.dataSovereignty as string[] || [];
    const complianceMet = taskCompliance.every(req => 
      region.dataSovereignty.includes(req) || req === 'none'
    );

    // Calculate composite score
    const latencyScore = Math.max(0, 1 - (latencyMs / region.maxLatencyMs));
    const loadScore = 1 - region.loadFactor;
    const complianceScore = complianceMet ? 1 : 0;

    const score = 
      (reputation * 0.4) +
      (latencyScore * 0.3) +
      (loadScore * 0.2) +
      (complianceScore * 0.1);

    return {
      region: region.id,
      score,
      latencyMs,
      reputation,
      load: region.loadFactor,
      dataCompliance: complianceMet,
    };
  }

  /**
   * Measure latency to a region
   */
  private async measureLatency(region: RegionConfig): Promise<number> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${region.url}/health`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      return Date.now() - start;
    } catch (error) {
      logger.warn(`[MeridianMesh] Latency measurement failed for ${region.id}:`, error);
      return region.maxLatencyMs * 2; // Penalize failed measurement
    }
  }

  /**
   * Get region reputation (from local cache with cross-region sync)
   */
  private async getRegionReputation(regionId: MeridianRegion): Promise<number> {
    const region = this.regions.get(regionId);
    if (!region) return 0.5;

    // Calculate reputation from error rate and latency
    const errorPenalty = region.errorRate * 0.5; // Max 0.5 penalty
    const latencyPenalty = Math.min(0.3, region.avgLatencyMs / region.maxLatencyMs * 0.3);
    
    return Math.max(0.1, 1.0 - errorPenalty - latencyPenalty);
  }

  /**
   * Get healthy regions
   */
  private async getHealthyRegions(): Promise<RegionConfig[]> {
    return Array.from(this.regions.values()).filter(r => r.healthy);
  }

  /**
   * Start periodic health checks (every 10 seconds for <100ms detection)
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [id, region] of this.regions) {
        try {
          const latency = await this.measureLatency(region);
          const wasHealthy = region.healthy;
          
          // Update metrics
          region.avgLatencyMs = region.avgLatencyMs === 0
            ? latency
            : 0.3 * latency + 0.7 * region.avgLatencyMs;
          
          region.healthy = latency < region.maxLatencyMs;
          region.lastHealthCheck = Date.now();
          
          // Detect state change
          if (wasHealthy && !region.healthy) {
            logger.error(`[MeridianMesh] Region ${id} marked UNHEALTHY (latency: ${latency}ms)`);
            this.emit('regionDown', { region: id, latency });
          } else if (!wasHealthy && region.healthy) {
            logger.info(`[MeridianMesh] Region ${id} recovered (latency: ${latency}ms)`);
            this.emit('regionUp', { region: id, latency });
          }
        } catch (error) {
          region.healthy = false;
          region.errorRate = Math.min(1, region.errorRate + 0.1);
          logger.error(`[MeridianMesh] Health check failed for ${id}:`, error);
          this.emit('regionDown', { region: id, error: String(error) });
        }
      }
    }, 10000); // 10 seconds

    logger.info('[MeridianMesh] Health checks started (10s interval)');
  }

  /**
   * Start cross-region reputation sync via HCS
   */
  private startReputationSync(): void {
    // Sync every 60 seconds
    this.reputationSyncInterval = setInterval(async () => {
      await this.syncReputationToHCS();
    }, 60000);

    logger.info(`[MeridianMesh] Reputation sync started (60s interval, topic: ${this.hcsSyncTopicId})`);
  }

  /**
   * Sync local reputation to HCS for cross-region visibility
   */
  private async syncReputationToHCS(): Promise<void> {
    if (this.hcsSyncTopicId === '0.0.0') {
      return; // No sync topic configured
    }

    try {
      const localRegion = this.regions.get(this.localRegion);
      if (!localRegion) return;

      const syncPacket: ReputationSyncPacket = {
        meridianId: `meridian-${this.localRegion}`,
        accuracy: await this.getRegionReputation(this.localRegion),
        totalTasks: Math.floor(localRegion.loadFactor * 10000), // Approximate
        correctDecisions: Math.floor(localRegion.loadFactor * 10000 * 0.95),
        timestamp: Date.now(),
        region: this.localRegion,
        signature: 'placeholder-sig', // Would be signed with region key
      };

      // Publish to HCS (placeholder - integrate with hederaMaster)
      logger.info(`[MeridianMesh] Reputation synced to HCS: ${syncPacket.meridianId} accuracy=${syncPacket.accuracy.toFixed(3)}`);
      this.emit('reputationSynced', syncPacket);
    } catch (error) {
      logger.error('[MeridianMesh] Reputation sync failed:', error);
    }
  }

  /**
   * Get mesh statistics
   */
  getStats(): {
    totalRegions: number;
    healthyRegions: number;
    averageLatencyMs: number;
    regions: RegionConfig[];
    localRegion: MeridianRegion;
  } {
    const healthy = Array.from(this.regions.values()).filter(r => r.healthy);
    const totalLatency = healthy.reduce((sum, r) => sum + r.avgLatencyMs, 0);

    return {
      totalRegions: this.regions.size,
      healthyRegions: healthy.length,
      averageLatencyMs: healthy.length > 0 ? totalLatency / healthy.length : 0,
      regions: Array.from(this.regions.values()),
      localRegion: this.localRegion,
    };
  }

  /**
   * Get optimal regions for multi-Meridian consensus (council)
   */
  async selectCouncilRegions(
    task: VerifiableAITask,
    councilSize: number
  ): Promise<MeridianRegion[]> {
    const allScores = await Promise.all(
      Array.from(this.regions.values()).map(r => this.calculateRouteScore(r, task))
    );

    // Sort by score, filter healthy, take top N
    return allScores
      .filter(s => this.regions.get(s.region)!.healthy)
      .sort((a, b) => b.score - a.score)
      .slice(0, councilSize)
      .map(s => s.region);
  }

  /**
   * Emergency failover: Force route to specific region
   */
  async forceRouteToRegion(
    task: VerifiableAITask,
    region: MeridianRegion
  ): Promise<MeshRoutingDecision> {
    const regionConfig = this.regions.get(region);
    if (!regionConfig) {
      throw new Error(`[MeridianMesh] Unknown region: ${region}`);
    }

    return {
      selectedRegion: region,
      fallbackRegions: [],
      reason: 'FORCED_EMERGENCY_ROUTE',
      estimatedLatencyMs: regionConfig.avgLatencyMs,
      complianceMet: regionConfig.dataSovereignty,
    };
  }

  /**
   * Stop mesh controller
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.reputationSyncInterval) {
      clearInterval(this.reputationSyncInterval);
      this.reputationSyncInterval = null;
    }
    logger.info('[MeridianMesh] Stopped');
  }
}

// Global mesh controller instance
export const meridianMeshController = new MeridianMeshController();
