/**
 * Distributed Shadow Council
 *
 * Integrates MeridianMeshController with ShadowCouncil for geo-aware,
 * multi-region distributed consensus. Routes tasks to optimal regions
 * and coordinates cross-region council formations.
 *
 * @module vera/proofKernel/distributedCouncil
 * @version 1.0.0
 */

import { logger } from '../../monitoring/logger.js';
import {
  MeridianMeshController,
  type MeridianRegion,
  type MeshRoutingDecision,
} from './meridianMesh.js';
import {
  ShadowCouncil,
  type EnsembleScore,
  type CouncilMode,
  type ConsensusConfig,
} from './shadowCouncil.js';
import type { VerifiableAITask } from './types.js';

export interface DistributedCouncilResult {
  ensembleScore: EnsembleScore;
  routing: MeshRoutingDecision;
  crossRegional: boolean;
  participatingRegions: MeridianRegion[];
  syncLatencyMs: number;
}

export interface DistributedCouncilConfig {
  enableCrossRegional: boolean; // Allow council members from multiple regions
  maxRegionsPerCouncil: number; // Max 3 regions for latency control
  requireLocalQuorum: boolean; // Must have majority from local region
  hcsAnchorDecisions: boolean; // Publish to HCS
}

const DEFAULT_DISTRIBUTED_CONFIG: DistributedCouncilConfig = {
  enableCrossRegional: true,
  maxRegionsPerCouncil: 3,
  requireLocalQuorum: true,
  hcsAnchorDecisions: true,
};

/**
 * DistributedShadowCouncil combines geo-aware routing with multi-Meridian consensus
 */
export class DistributedShadowCouncil {
  private mesh: MeridianMeshController;
  private councils: Map<MeridianRegion, ShadowCouncil> = new Map();
  private config: DistributedCouncilConfig;

  constructor(
    mesh: MeridianMeshController = new MeridianMeshController(),
    config: Partial<DistributedCouncilConfig> = {}
  ) {
    this.mesh = mesh;
    this.config = { ...DEFAULT_DISTRIBUTED_CONFIG, ...config };
    this.initializeRegionalCouncils();
  }

  /**
   * Initialize Shadow Councils for each healthy region
   */
  private initializeRegionalCouncils(): void {
    const stats = this.mesh.getStats();

    for (const region of stats.regions) {
      if (region.healthy) {
        // Create council with governance mode enabled
        const councilConfig: Partial<ConsensusConfig> = {
          governanceMode: {
            enabled: true,
            tier5Threshold: 1000,
            tier7Threshold: 10000,
            hcsAnchorVotes: this.config.hcsAnchorDecisions,
          },
        };

        this.councils.set(region.id, new ShadowCouncil(councilConfig));
        logger.info(`[DistributedCouncil] Initialized council for ${region.id}`);
      }
    }
  }

  /**
   * Score task using distributed council approach
   *
   * 1. Route to optimal region(s)
   * 2. Form council (local or cross-regional)
   * 3. Execute consensus
   * 4. Optionally sync to HCS
   */
  async scoreTask(
    task: VerifiableAITask,
    candidateAgentIds: string[],
    options: {
      councilMode?: CouncilMode;
      requireCrossRegional?: boolean;
      minRegions?: number;
    } = {}
  ): Promise<DistributedCouncilResult> {
    const startTime = Date.now();

    // Step 1: Determine routing
    const routing = await this.mesh.routeTask(task);
    const primaryRegion = routing.selectedRegion;

    // Step 2: Determine if we need cross-regional council
    const taskStakes = task.budgetHbar || 0;
    const needsCrossRegional =
      options.requireCrossRegional ||
      taskStakes >= 10000 || // Tier-7: Emergency
      options.councilMode === 'emergency';

    let participatingRegions: MeridianRegion[];
    let council: ShadowCouncil;

    if (needsCrossRegional && this.config.enableCrossRegional) {
      // Form cross-regional council
      participatingRegions = [primaryRegion, ...routing.fallbackRegions].slice(
        0,
        this.config.maxRegionsPerCouncil
      );
      council = this.formCrossRegionalCouncil(participatingRegions);
    } else {
      // Use local regional council
      participatingRegions = [primaryRegion];
      council = this.councils.get(primaryRegion)!;

      if (!council) {
        throw new Error(`[DistributedCouncil] No council available for ${primaryRegion}`);
      }
    }

    // Step 3: Execute consensus
    const ensembleScore = await council.scoreTask(task, candidateAgentIds, {
      councilMode: options.councilMode,
    });

    const syncLatencyMs = Date.now() - startTime;

    logger.info(
      `[DistributedCouncil] Consensus reached via ${participatingRegions.join(',')} ` +
        `in ${syncLatencyMs}ms (mode: ${ensembleScore.councilMode})`
    );

    return {
      ensembleScore,
      routing,
      crossRegional: needsCrossRegional,
      participatingRegions,
      syncLatencyMs,
    };
  }

  /**
   * Form a cross-regional Shadow Council
   *
   * Creates a virtual council spanning multiple regions
   */
  private formCrossRegionalCouncil(regions: MeridianRegion[]): ShadowCouncil {
    // For now, use the primary region's council
    // In production, this would aggregate Meridians from all regions
    const primaryCouncil = this.councils.get(regions[0]);

    if (!primaryCouncil) {
      throw new Error(`[DistributedCouncil] No council for primary region ${regions[0]}`);
    }

    logger.info(`[DistributedCouncil] Forming cross-regional council: ${regions.join(', ')}`);

    // Note: Full implementation would:
    // 1. Fetch Meridians from each region
    // 2. Create unified council configuration
    // 3. Handle cross-region latency and failure modes

    return primaryCouncil;
  }

  /**
   * Select optimal council regions based on task requirements
   */
  async selectOptimalCouncilRegions(
    task: VerifiableAITask,
    targetSize: number
  ): Promise<MeridianRegion[]> {
    return this.mesh.selectCouncilRegions(task, targetSize);
  }

  /**
   * Emergency governance: Force Tier-7 council across all regions
   */
  async emergencyGovernance(
    task: VerifiableAITask,
    candidateAgentIds: string[]
  ): Promise<DistributedCouncilResult> {
    logger.warn(`[DistributedCouncil] EMERGENCY GOVERNANCE activated for task ${task.taskId}`);

    // Get all healthy regions
    const stats = this.mesh.getStats();
    const allRegions = stats.regions.filter(r => r.healthy).map(r => r.id);

    // Force cross-regional council with all available regions
    return this.scoreTask(task, candidateAgentIds, {
      councilMode: 'emergency',
      requireCrossRegional: true,
    });
  }

  /**
   * Get distributed council statistics
   */
  getStats(): {
    meshStats: ReturnType<MeridianMeshController['getStats']>;
    activeCouncils: number;
    crossRegionalEnabled: boolean;
  } {
    return {
      meshStats: this.mesh.getStats(),
      activeCouncils: this.councils.size,
      crossRegionalEnabled: this.config.enableCrossRegional,
    };
  }

  /**
   * Update council configuration dynamically
   */
  updateConfig(newConfig: Partial<DistributedCouncilConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[DistributedCouncil] Configuration updated', this.config);
  }

  /**
   * Stop all councils and mesh
   */
  stop(): void {
    this.mesh.stop();
    // Councils don't have stop methods currently, but would cleanup here
    logger.info('[DistributedCouncil] Stopped');
  }
}

// Global distributed council instance
export const distributedShadowCouncil = new DistributedShadowCouncil();
