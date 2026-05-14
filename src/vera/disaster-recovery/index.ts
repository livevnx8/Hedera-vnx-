/**
 * Vera Disaster Recovery System
 * Automated state backup, recovery, and failover orchestration
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { SettlementRequest, PaymentTopics, AgentRegistration } from '../types/index.js';
import { logger } from '../../monitoring/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupMetadata {
  version: string;
  timestamp: number;
  type: 'full' | 'incremental';
  checksum: string;
  sequenceNumber: number;
  region: string;
}

export interface SystemState {
  metadata: BackupMetadata;
  settlements: SettlementRequest[];
  agents: AgentRegistration[];
  topics: PaymentTopics;
  latticeState?: Record<string, unknown>;
  lastHcsSequence: number;
}

export interface RecoveryPoint {
  id: string;
  timestamp: number;
  type: 'full' | 'incremental';
  size: number;
  checksum: string;
  region: string;
}

export interface FailoverConfig {
  primaryRegion: string;
  secondaryRegions: string[];
  healthCheckIntervalMs: number;
  failoverThreshold: number;
  autoFailover: boolean;
  dataReplicationLagMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Backup Manager
// ─────────────────────────────────────────────────────────────────────────────

export class StateBackupManager extends EventEmitter {
  private backupDir: string;
  private backupInterval: NodeJS.Timeout | null = null;
  private sequenceNumber = 0;
  private lastBackupTime = 0;

  constructor(
    private config: {
      backupDir: string;
      intervalMs: number;
      maxBackups: number;
      region: string;
    }
  ) {
    super();
    this.backupDir = config.backupDir;
    this.ensureBackupDir();
  }

  async start(): Promise<void> {
    await this.ensureBackupDir();
    
    // Initial backup
    await this.createBackup('full');
    
    // Schedule incremental backups
    this.backupInterval = setInterval(
      () => this.createBackup('incremental'),
      this.config.intervalMs
    );
    
    logger.info('StateBackupManager', {
      message: 'Backup manager started',
      intervalMs: this.config.intervalMs,
      region: this.config.region,
    });
  }

  stop(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }

  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      logger.error('StateBackupManager', {
        message: 'Failed to create backup directory',
        error: (error as Error).message,
      });
    }
  }

  /**
   * Create a backup of current system state
   */
  async createBackup(type: 'full' | 'incremental'): Promise<string> {
    const timestamp = Date.now();
    this.sequenceNumber++;
    
    const state = await this.captureSystemState();
    const backupId = `backup-${this.config.region}-${timestamp}-${type}`;
    const filepath = join(this.backupDir, `${backupId}.json`);
    
    const metadata: BackupMetadata = {
      version: '1.0.0',
      timestamp,
      type,
      checksum: this.calculateChecksum(state),
      sequenceNumber: this.sequenceNumber,
      region: this.config.region,
    };
    
    const backup: SystemState = {
      metadata,
      ...state,
    };
    
    await fs.writeFile(filepath, JSON.stringify(backup, null, 2));
    this.lastBackupTime = timestamp;
    
    // Cleanup old backups
    await this.cleanupOldBackups();
    
    logger.info('StateBackupManager', {
      message: 'Backup created',
      backupId,
      type,
      region: this.config.region,
      size: JSON.stringify(backup).length,
    });
    
    this.emit('backup_created', { backupId, filepath, metadata });
    return filepath;
  }

  /**
   * Capture current system state
   */
  private async captureSystemState(): Promise<Omit<SystemState, 'metadata'>> {
    // These would be populated from actual system components
    return {
      settlements: [], // Would come from settlement store
      agents: [], // Would come from registry
      topics: {
        registryTopicId: '',
        taskTopicId: '',
        resultTopicId: '',
        auditTopicId: '',
      },
      lastHcsSequence: 0,
    };
  }

  /**
   * List available recovery points
   */
  async listRecoveryPoints(): Promise<RecoveryPoint[]> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups: RecoveryPoint[] = [];
      
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const content = await fs.readFile(join(this.backupDir, file), 'utf-8');
          const backup: SystemState = JSON.parse(content);
          
          backups.push({
            id: file.replace('.json', ''),
            timestamp: backup.metadata.timestamp,
            type: backup.metadata.type,
            size: content.length,
            checksum: backup.metadata.checksum,
            region: backup.metadata.region,
          });
        } catch (error) {
          logger.warn('StateBackupManager', {
            message: 'Failed to parse backup file',
            file,
            error: (error as Error).message,
          });
        }
      }
      
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('StateBackupManager', {
        message: 'Failed to list recovery points',
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Restore from a backup
   */
  async restoreFromBackup(backupId: string): Promise<SystemState | null> {
    try {
      const filepath = join(this.backupDir, `${backupId}.json`);
      const content = await fs.readFile(filepath, 'utf-8');
      const backup: SystemState = JSON.parse(content);
      
      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(backup);
      if (calculatedChecksum !== backup.metadata.checksum) {
        throw new Error('Backup checksum mismatch - possible corruption');
      }
      
      logger.info('StateBackupManager', {
        message: 'Backup restored successfully',
        backupId,
        timestamp: backup.metadata.timestamp,
      });
      
      this.emit('backup_restored', { backupId, state: backup });
      return backup;
    } catch (error) {
      logger.error('StateBackupManager', {
        message: 'Failed to restore backup',
        backupId,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Cleanup old backups, keeping only the most recent N
   */
  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listRecoveryPoints();
    
    if (backups.length <= this.config.maxBackups) return;
    
    // Keep only the most recent maxBackups
    const toDelete = backups.slice(this.config.maxBackups);
    
    for (const backup of toDelete) {
      try {
        await fs.unlink(join(this.backupDir, `${backup.id}.json`));
        logger.debug('StateBackupManager', {
          message: 'Deleted old backup',
          backupId: backup.id,
        });
      } catch (error) {
        logger.warn('StateBackupManager', {
          message: 'Failed to delete old backup',
          backupId: backup.id,
          error: (error as Error).message,
        });
      }
    }
  }

  private calculateChecksum(state: Omit<SystemState, 'metadata'> | SystemState): string {
    // Simple checksum for verification
    const str = JSON.stringify(state);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  getStats() {
    return {
      backupDir: this.backupDir,
      sequenceNumber: this.sequenceNumber,
      lastBackupTime: this.lastBackupTime,
      region: this.config.region,
      intervalMs: this.config.intervalMs,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Failover Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export class FailoverOrchestrator extends EventEmitter {
  private healthChecks = new Map<string, number>(); // region -> last healthy timestamp
  private currentRegion: string;
  private isFailoverActive = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(private config: FailoverConfig) {
    super();
    this.currentRegion = config.primaryRegion;
  }

  start(): void {
    // Initialize health status for all regions
    const allRegions = [this.config.primaryRegion, ...this.config.secondaryRegions];
    for (const region of allRegions) {
      this.healthChecks.set(region, Date.now());
    }

    // Start health check polling
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckIntervalMs
    );

    logger.info('FailoverOrchestrator', {
      message: 'Failover orchestrator started',
      primaryRegion: this.config.primaryRegion,
      secondaryRegions: this.config.secondaryRegions,
    });
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform health checks on all regions
   */
  private async performHealthChecks(): Promise<void> {
    for (const region of [this.config.primaryRegion, ...this.config.secondaryRegions]) {
      const isHealthy = await this.checkRegionHealth(region);
      
      if (isHealthy) {
        this.healthChecks.set(region, Date.now());
      }
    }

    // Check if failover is needed
    if (this.config.autoFailover && !this.isFailoverActive) {
      await this.evaluateFailover();
    }
  }

  /**
   * Check health of a specific region
   */
  private async checkRegionHealth(region: string): Promise<boolean> {
    // This would check actual health endpoints
    // For now, simulate based on last known state
    const lastHealthy = this.healthChecks.get(region);
    if (!lastHealthy) return false;
    
    // Consider healthy if checked within 2x interval
    return Date.now() - lastHealthy < this.config.healthCheckIntervalMs * 2;
  }

  /**
   * Evaluate if failover should be triggered
   */
  private async evaluateFailover(): Promise<void> {
    const primaryHealth = this.healthChecks.get(this.config.primaryRegion);
    if (!primaryHealth) return;

    const timeSinceHealthy = Date.now() - primaryHealth;
    
    if (timeSinceHealthy > this.config.failoverThreshold) {
      logger.warn('FailoverOrchestrator', {
        message: 'Primary region unhealthy, initiating failover',
        primaryRegion: this.config.primaryRegion,
        timeSinceHealthy,
      });

      await this.initiateFailover();
    }
  }

  /**
   * Initiate failover to a secondary region
   */
  async initiateFailover(targetRegion?: string): Promise<boolean> {
    if (this.isFailoverActive) {
      logger.warn('FailoverOrchestrator', {
        message: 'Failover already in progress',
      });
      return false;
    }

    this.isFailoverActive = true;
    
    // Select best target region
    const target = targetRegion || this.selectFailoverTarget();
    if (!target) {
      logger.error('FailoverOrchestrator', {
        message: 'No healthy secondary region available for failover',
      });
      this.isFailoverActive = false;
      return false;
    }

    try {
      logger.info('FailoverOrchestrator', {
        message: 'Starting failover',
        fromRegion: this.currentRegion,
        toRegion: target,
      });

      // Phase 1: Stop writes to primary
      this.emit('failover_starting', { from: this.currentRegion, to: target });

      // Phase 2: Sync any remaining data (would be actual sync in production)
      await this.syncRemainingData();

      // Phase 3: Switch to secondary
      this.currentRegion = target;
      this.isFailoverActive = false;

      logger.info('FailoverOrchestrator', {
        message: 'Failover completed',
        newPrimaryRegion: target,
      });

      this.emit('failover_completed', { newPrimary: target });
      return true;

    } catch (error) {
      this.isFailoverActive = false;
      logger.error('FailoverOrchestrator', {
        message: 'Failover failed',
        error: (error as Error).message,
      });
      this.emit('failover_failed', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Select the best secondary region for failover
   */
  private selectFailoverTarget(): string | null {
    const candidates = this.config.secondaryRegions
      .map(region => ({
        region,
        lastHealthy: this.healthChecks.get(region) || 0,
      }))
      .filter(c => Date.now() - c.lastHealthy < this.config.healthCheckIntervalMs * 2)
      .sort((a, b) => b.lastHealthy - a.lastHealthy);

    return candidates[0]?.region || null;
  }

  /**
   * Sync any remaining data during failover
   */
  private async syncRemainingData(): Promise<void> {
    // In production, this would:
    // 1. Get last HCS sequence from secondary
    // 2. Replay any messages from primary that haven't been synced
    // 3. Verify data consistency
    
    logger.info('FailoverOrchestrator', {
      message: 'Syncing remaining data',
      estimatedLag: this.config.dataReplicationLagMs,
    });

    await this.sleep(1000); // Simulate sync time
  }

  /**
   * Report health status for this region (called by the region itself)
   */
  reportHealth(region: string): void {
    this.healthChecks.set(region, Date.now());
  }

  /**
   * Get current failover status
   */
  getStatus() {
    return {
      currentRegion: this.currentRegion,
      isFailoverActive: this.isFailoverActive,
      primaryRegion: this.config.primaryRegion,
      secondaryRegions: this.config.secondaryRegions,
      healthStatus: Object.fromEntries(this.healthChecks.entries()),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery Manager (High-level interface)
// ─────────────────────────────────────────────────────────────────────────────

export class DisasterRecoveryManager extends EventEmitter {
  private backupManager: StateBackupManager;
  private failoverOrchestrator: FailoverOrchestrator;

  constructor(config: {
    backup: ConstructorParameters<typeof StateBackupManager>[0];
    failover: FailoverConfig;
  }) {
    super();
    this.backupManager = new StateBackupManager(config.backup);
    this.failoverOrchestrator = new FailoverOrchestrator(config.failover);
  }

  async start(): Promise<void> {
    await this.backupManager.start();
    this.failoverOrchestrator.start();
    
    logger.info('DisasterRecoveryManager', {
      message: 'Disaster recovery manager started',
    });
  }

  stop(): void {
    this.backupManager.stop();
    this.failoverOrchestrator.stop();
  }

  /**
   * Initiate manual failover
   */
  async initiateFailover(targetRegion?: string): Promise<boolean> {
    return this.failoverOrchestrator.initiateFailover(targetRegion);
  }

  /**
   * Create manual backup
   */
  async createBackup(type: 'full' | 'incremental'): Promise<string> {
    return this.backupManager.createBackup(type);
  }

  /**
   * Restore from backup
   */
  async restore(backupId: string): Promise<SystemState | null> {
    return this.backupManager.restoreFromBackup(backupId);
  }

  /**
   * Get full system status
   */
  getStatus() {
    return {
      backup: this.backupManager.getStats(),
      failover: this.failoverOrchestrator.getStatus(),
      recoveryPoints: this.backupManager.listRecoveryPoints(),
    };
  }
}

// Singleton exports
export const disasterRecovery = new DisasterRecoveryManager({
  backup: {
    backupDir: './backups',
    intervalMs: 5 * 60 * 1000, // 5 minutes
    maxBackups: 20,
    region: process.env.VERA_REGION || 'us-east',
  },
  failover: {
    primaryRegion: process.env.VERA_PRIMARY_REGION || 'us-east',
    secondaryRegions: (process.env.VERA_SECONDARY_REGIONS || 'eu-west,ap-south').split(','),
    healthCheckIntervalMs: 30_000,
    failoverThreshold: 120_000, // 2 minutes of unhealthy checks
    autoFailover: process.env.VERA_AUTO_FAILOVER === 'true',
    dataReplicationLagMs: 5_000,
  },
});
