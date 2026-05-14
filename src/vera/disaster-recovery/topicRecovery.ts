/**
 * Topic Recovery Manager
 * Handles HCS topic failover and recovery
 */

import { EventEmitter } from 'events';
import { Client, TopicId, TopicCreateTransaction, TopicMessageSubmitTransaction, TopicInfoQuery } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';
import { getClient } from '../../hedera/tools/client.js';

export interface TopicMapping {
  logicalName: string;
  primaryTopicId: string;
  failoverTopicId?: string;
  backupTopicIds: string[];
  lastUsed: number;
}

export interface TopicRecoveryConfig {
  enableAutoFailover: boolean;
  failoverThreshold: number; // Failed messages before failover
  healthCheckIntervalMs: number;
  autoCreateFailover: boolean;
}

export class TopicRecoveryManager extends EventEmitter {
  private topics = new Map<string, TopicMapping>();
  private healthStatus = new Map<string, { healthy: boolean; lastCheck: number; failures: number }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private config: TopicRecoveryConfig) {
    super();
  }

  /**
   * Register a topic for failover management
   */
  registerTopic(
    logicalName: string,
    primaryTopicId: string,
    backupTopicIds: string[] = []
  ): void {
    this.topics.set(logicalName, {
      logicalName,
      primaryTopicId,
      backupTopicIds,
      lastUsed: Date.now(),
    });

    this.healthStatus.set(logicalName, {
      healthy: true,
      lastCheck: Date.now(),
      failures: 0,
    });

    logger.info('TopicRecoveryManager', {
      message: 'Topic registered',
      logicalName,
      primary: primaryTopicId,
      backups: backupTopicIds.length,
    });
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.checkTopicHealth();
    }, this.config.healthCheckIntervalMs);

    logger.info('TopicRecoveryManager', {
      message: 'Health monitoring started',
      interval: `${this.config.healthCheckIntervalMs}ms`,
    });
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check health of all registered topics
   */
  private async checkTopicHealth(): Promise<void> {
    const client = getClient();

    for (const [logicalName, mapping] of this.topics.entries()) {
      try {
        // Try to query topic info as health check
        const topicId = TopicId.fromString(
          mapping.failoverTopicId || mapping.primaryTopicId
        );
        
        await new TopicInfoQuery()
          .setTopicId(topicId)
          .execute(client);

        // Mark healthy
        const status = this.healthStatus.get(logicalName);
        if (status) {
          status.healthy = true;
          status.lastCheck = Date.now();
          status.failures = 0;
        }

      } catch (error) {
        // Mark unhealthy
        const status = this.healthStatus.get(logicalName);
        if (status) {
          status.healthy = false;
          status.lastCheck = Date.now();
          status.failures++;

          logger.warn('TopicRecoveryManager', {
            message: 'Topic health check failed',
            logicalName,
            failures: status.failures,
            error: error instanceof Error ? error.message : String(error),
          });

          // Trigger failover if threshold reached
          if (status.failures >= this.config.failoverThreshold && this.config.enableAutoFailover) {
            await this.failoverTopic(logicalName);
          }
        }
      }
    }
  }

  /**
   * Failover to backup topic
   */
  private async failoverTopic(logicalName: string): Promise<boolean> {
    const mapping = this.topics.get(logicalName);
    if (!mapping) return false;

    if (mapping.backupTopicIds.length === 0 && this.config.autoCreateFailover) {
      // Create new failover topic
      const newTopicId = await this.createFailoverTopic(logicalName);
      if (newTopicId) {
        mapping.failoverTopicId = newTopicId;
        mapping.backupTopicIds.push(newTopicId);
      }
    } else if (mapping.backupTopicIds.length > 0) {
      // Use next available backup
      const nextBackup = mapping.backupTopicIds.find(
        id => id !== mapping.failoverTopicId && id !== mapping.primaryTopicId
      );
      if (nextBackup) {
        mapping.failoverTopicId = nextBackup;
      }
    }

    if (mapping.failoverTopicId) {
      logger.info('TopicRecoveryManager', {
        message: 'Topic failover activated',
        logicalName,
        oldTopic: mapping.primaryTopicId,
        newTopic: mapping.failoverTopicId,
      });

      this.emit('topic_failover', {
        logicalName,
        primary: mapping.primaryTopicId,
        failover: mapping.failoverTopicId,
      });

      return true;
    }

    return false;
  }

  /**
   * Create new failover topic
   */
  private async createFailoverTopic(logicalName: string): Promise<string | null> {
    try {
      const client = getClient();
      
      const response = await new TopicCreateTransaction()
        .setTopicMemo(`Failover topic for ${logicalName}`)
        .execute(client);

      const receipt = await response.getReceipt(client);
      const topicId = receipt.topicId?.toString();

      if (topicId) {
        logger.info('TopicRecoveryManager', {
          message: 'Failover topic created',
          logicalName,
          topicId,
        });
        return topicId;
      }

    } catch (error) {
      logger.error('TopicRecoveryManager', {
        message: 'Failed to create failover topic',
        logicalName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Get active topic ID for logical name
   */
  getActiveTopicId(logicalName: string): string | null {
    const mapping = this.topics.get(logicalName);
    if (!mapping) return null;

    return mapping.failoverTopicId || mapping.primaryTopicId;
  }

  /**
   * Publish message to topic (with failover)
   */
  async publishMessage(
    logicalName: string,
    message: string | Uint8Array,
    options: { allowFailover?: boolean } = {}
  ): Promise<{ success: boolean; topicId?: string; error?: string }> {
    const mapping = this.topics.get(logicalName);
    if (!mapping) {
      return { success: false, error: `Topic ${logicalName} not registered` };
    }

    const topicId = this.getActiveTopicId(logicalName);
    if (!topicId) {
      return { success: false, error: 'No active topic available' };
    }

    try {
      const client = getClient();
      
      await new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topicId))
        .setMessage(message)
        .execute(client);

      mapping.lastUsed = Date.now();

      return { success: true, topicId };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Try failover if enabled
      if (options.allowFailover !== false && this.config.enableAutoFailover) {
        const status = this.healthStatus.get(logicalName);
        if (status) {
          status.failures++;
          
          if (status.failures >= this.config.failoverThreshold) {
            const failoverSuccess = await this.failoverTopic(logicalName);
            if (failoverSuccess) {
              // Retry with new topic
              return this.publishMessage(logicalName, message, { allowFailover: false });
            }
          }
        }
      }

      return { success: false, topicId, error: errorMsg };
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): Array<{
    logicalName: string;
    healthy: boolean;
    activeTopic: string;
    failures: number;
  }> {
    return Array.from(this.topics.entries()).map(([logicalName, mapping]) => {
      const status = this.healthStatus.get(logicalName);
      return {
        logicalName,
        healthy: status?.healthy ?? false,
        activeTopic: this.getActiveTopicId(logicalName) || 'none',
        failures: status?.failures ?? 0,
      };
    });
  }

  /**
   * Force failover for testing
   */
  async forceFailover(logicalName: string): Promise<boolean> {
    return this.failoverTopic(logicalName);
  }
}

export default TopicRecoveryManager;
