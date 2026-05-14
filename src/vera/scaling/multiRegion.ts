/**
 * Multi-Region Deployment Manager
 * Geo-DNS routing and cross-region state replication
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface RegionConfig {
  name: string;
  endpoint: string;
  priority: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  lastSync: number;
  latencyMs: number;
}

export interface GeoRoutingConfig {
  primaryRegion: string;
  backupRegions: string[];
  healthCheckIntervalMs: number;
  syncIntervalMs: number;
  autoFailover: boolean;
}

export class MultiRegionManager extends EventEmitter {
  private regions = new Map<string, RegionConfig>();
  private currentRegion: string;
  private isPrimary: boolean;
  private syncTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(
    private config: GeoRoutingConfig,
    regionName: string
  ) {
    super();
    this.currentRegion = regionName;
    this.isPrimary = regionName === config.primaryRegion;
  }

  /**
   * Register a region
   */
  registerRegion(config: RegionConfig): void {
    this.regions.set(config.name, config);

    logger.info('MultiRegionManager', {
      message: 'Region registered',
      name: config.name,
      endpoint: config.endpoint,
      priority: config.priority,
    });
  }

  /**
   * Start multi-region coordination
   */
  start(): void {
    // Start health monitoring
    this.healthTimer = setInterval(() => {
      this.checkRegionHealth();
    }, this.config.healthCheckIntervalMs);

    // Start state sync (only primary syncs to backups)
    if (this.isPrimary) {
      this.syncTimer = setInterval(() => {
        this.syncToBackups();
      }, this.config.syncIntervalMs);
    }

    logger.info('MultiRegionManager', {
      message: 'Multi-region coordination started',
      currentRegion: this.currentRegion,
      isPrimary: this.isPrimary,
    });
  }

  /**
   * Stop coordination
   */
  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Check health of all regions
   */
  private async checkRegionHealth(): Promise<void> {
    for (const [name, region] of this.regions.entries()) {
      if (name === this.currentRegion) continue;

      try {
        // Check endpoint health
        const start = Date.now();
        const response = await fetch(`${region.endpoint}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        const latency = Date.now() - start;
        region.latencyMs = latency;

        if (response.ok) {
          const prevStatus = region.healthStatus;
          region.healthStatus = 'HEALTHY';

          if (prevStatus !== 'HEALTHY') {
            logger.info('MultiRegionManager', {
              message: 'Region recovered',
              name,
              latency: `${latency}ms`,
            });
            this.emit('region_recovered', { name, latency });
          }
        } else {
          region.healthStatus = 'DEGRADED';
        }
      } catch (error) {
        region.healthStatus = 'UNAVAILABLE';
        
        logger.warn('MultiRegionManager', {
          message: 'Region unavailable',
          name,
          error: error instanceof Error ? error.message : String(error),
        });

        this.emit('region_unavailable', { name });

        // Trigger failover if primary is down
        if (name === this.config.primaryRegion && this.config.autoFailover) {
          this.promoteToPrimary();
        }
      }
    }
  }

  /**
   * Sync state to backup regions
   */
  private async syncToBackups(): Promise<void> {
    if (!this.isPrimary) return;

    const healthyBackups = Array.from(this.regions.values()).filter(
      r => this.config.backupRegions.includes(r.name) && r.healthStatus === 'HEALTHY'
    );

    for (const backup of healthyBackups) {
      try {
        // Send state sync
        await fetch(`${backup.endpoint}/api/v1/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: Date.now(),
            source: this.currentRegion,
          }),
        });

        backup.lastSync = Date.now();

      } catch (error) {
        logger.warn('MultiRegionManager', {
          message: 'State sync failed',
          target: backup.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Promote this region to primary
   */
  private promoteToPrimary(): void {
    if (this.isPrimary) return;

    this.isPrimary = true;
    this.config.primaryRegion = this.currentRegion;

    logger.info('MultiRegionManager', {
      message: 'PROMOTED TO PRIMARY',
      region: this.currentRegion,
    });

    this.emit('promoted_to_primary', { region: this.currentRegion });

    // Start sync to backups
    this.syncTimer = setInterval(() => {
      this.syncToBackups();
    }, this.config.syncIntervalMs);
  }

  /**
   * Get current region status
   */
  getRegionStatus(): {
    current: string;
    isPrimary: boolean;
    regions: RegionConfig[];
  } {
    return {
      current: this.currentRegion,
      isPrimary: this.isPrimary,
      regions: Array.from(this.regions.values()),
    };
  }

  /**
   * Get best region for routing (for Geo-DNS)
   */
  getBestRegion(userLocation?: string): string {
    // Simple latency-based routing
    const healthy = Array.from(this.regions.values())
      .filter(r => r.healthStatus === 'HEALTHY')
      .sort((a, b) => a.latencyMs - b.latencyMs);

    if (healthy.length === 0) {
      return this.currentRegion; // Fallback to current
    }

    return healthy[0].name;
  }

  /**
   * Handle incoming sync from primary
   */
  handleIncomingSync(data: { timestamp: number; source: string }): void {
    const source = this.regions.get(data.source);
    if (source) {
      source.lastSync = data.timestamp;
    }

    logger.debug('MultiRegionManager', {
      message: 'State sync received',
      source: data.source,
      timestamp: data.timestamp,
    });

    this.emit('state_sync_received', data);
  }
}

export default MultiRegionManager;
