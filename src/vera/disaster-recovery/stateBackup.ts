/**
 * State Backup Manager
 * Automated SQLite + state snapshots for disaster recovery
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../monitoring/logger.js';

export interface BackupConfig {
  intervalMs: number;
  retentionCount: number;
  backupPath: string;
  compressBackups: boolean;
}

export interface BackupSnapshot {
  id: string;
  timestamp: number;
  type: 'automatic' | 'manual' | 'pre_migration';
  size: number;
  checksum: string;
  metadata: {
    nodeVersion: string;
    network: string;
    agentCount: number;
    topicCount: number;
  };
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  intervalMs: 5 * 60 * 1000, // 5 minutes
  retentionCount: 12, // Keep last 12 backups (1 hour)
  backupPath: './backups',
  compressBackups: true,
};

export class StateBackupManager extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private snapshots: BackupSnapshot[] = [];

  constructor(private config: BackupConfig = DEFAULT_BACKUP_CONFIG) {
    super();
  }

  /**
   * Start automatic backup schedule
   */
  async start(): Promise<void> {
    if (this.timer) return;

    this.isRunning = true;
    
    // Ensure backup directory exists
    await fs.mkdir(this.config.backupPath, { recursive: true });

    // Run initial backup
    await this.createBackup('automatic');

    // Schedule regular backups
    this.timer = setInterval(() => {
      this.createBackup('automatic');
    }, this.config.intervalMs);

    logger.info('StateBackupManager', {
      message: 'Automatic backup started',
      interval: `${this.config.intervalMs}ms`,
      retention: this.config.retentionCount,
    });
  }

  /**
   * Stop automatic backup
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('StateBackupManager', { message: 'Automatic backup stopped' });
  }

  /**
   * Create backup snapshot
   */
  async createBackup(type: 'automatic' | 'manual' | 'pre_migration' = 'manual'): Promise<BackupSnapshot> {
    const startTime = Date.now();
    const id = `backup-${Date.now()}`;
    const timestamp = Date.now();

    try {
      // Collect state data
      const stateData = await this.collectState();

      // Write backup file
      const filename = `${id}.json`;
      const filepath = path.join(this.config.backupPath, filename);
      const data = JSON.stringify(stateData, null, 2);
      const checksum = this.calculateChecksum(data);
      await fs.writeFile(filepath, data, 'utf-8');

      // Get file size
      const stats = await fs.stat(filepath);

      const snapshot: BackupSnapshot = {
        id,
        timestamp,
        type,
        size: stats.size,
        checksum,
        metadata: {
          nodeVersion: process.version,
          network: process.env.HEDERA_NETWORK || 'unknown',
          agentCount: stateData.agents?.length || 0,
          topicCount: stateData.topics?.length || 0,
        },
      };

      this.snapshots.push(snapshot);
      
      // Cleanup old backups
      await this.cleanupOldBackups();

      logger.info('StateBackupManager', {
        message: 'Backup created',
        id,
        type,
        size: `${(stats.size / 1024).toFixed(1)}KB`,
        duration: `${Date.now() - startTime}ms`,
      });

      this.emit('backup_created', snapshot);
      return snapshot;

    } catch (error) {
      logger.error('StateBackupManager', {
        message: 'Backup failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Collect current system state
   */
  private async collectState(): Promise<{
    timestamp: number;
    agents: object[];
    topics: object[];
    settlements: object[];
    streams: object[];
    config: object;
  }> {
    // In production, this would query from database/services
    return {
      timestamp: Date.now(),
      agents: [],
      topics: [],
      settlements: [],
      streams: [],
      config: {},
    };
  }

  /**
   * Restore from backup
   */
  async restore(backupId: string): Promise<boolean> {
    try {
      const filepath = path.join(this.config.backupPath, `${backupId}.json`);
      const data = await fs.readFile(filepath, 'utf-8');
      const state = JSON.parse(data);

      // Validate checksum
      const snapshot = this.snapshots.find(s => s.id === backupId);
      if (snapshot) {
        const checksum = this.calculateChecksum(data);
        if (checksum !== snapshot.checksum) {
          logger.error('StateBackupManager', {
            message: 'Backup checksum mismatch',
            backupId,
          });
          return false;
        }
      }

      // In production, restore to database/services
      logger.info('StateBackupManager', {
        message: 'State restored from backup',
        backupId,
        timestamp: state.timestamp,
      });

      this.emit('state_restored', { backupId, state });
      return true;

    } catch (error) {
      logger.error('StateBackupManager', {
        message: 'Restore failed',
        backupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * List available backups
   */
  listBackups(): BackupSnapshot[] {
    return [...this.snapshots].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get latest backup
   */
  getLatestBackup(): BackupSnapshot | null {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Cleanup old backups beyond retention count
   */
  private async cleanupOldBackups(): Promise<void> {
    if (this.snapshots.length <= this.config.retentionCount) return;

    const toDelete = this.snapshots
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, this.snapshots.length - this.config.retentionCount);

    for (const snapshot of toDelete) {
      try {
        const filepath = path.join(this.config.backupPath, `${snapshot.id}.json`);
        await fs.unlink(filepath);
        
        const index = this.snapshots.findIndex(s => s.id === snapshot.id);
        if (index !== -1) {
          this.snapshots.splice(index, 1);
        }
      } catch (error) {
        logger.warn('StateBackupManager', {
          message: 'Failed to cleanup old backup',
          backupId: snapshot.id,
        });
      }
    }
  }

  /**
   * Calculate simple checksum
   */
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Force immediate backup
   */
  async forceBackup(type: 'manual' | 'pre_migration' = 'manual'): Promise<BackupSnapshot> {
    return this.createBackup(type);
  }
}

export default StateBackupManager;
