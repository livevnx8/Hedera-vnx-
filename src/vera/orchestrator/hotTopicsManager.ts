/**
 * Vera Hot Topics Manager
 *
 * Manages the creation, persistence, and publishing to Vera's sovereign
 * "hot-topics" radar topic on Hedera. Handles topic lifecycle, post-quantum
 * signing, and scan summary publication.
 */

import { TopicCreateTransaction, Client } from '@hashgraph/sdk';
import fs from 'fs/promises';
import path from 'path';
import { getClient } from '../../hedera/tools/client.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import type { HotTopicsScanResult, HotTopicsConfig, HotTopicsCursor } from './hotTopicsTypes.js';
import { DEFAULT_HOT_TOPICS_CONFIG, INITIAL_MONITORED_TOPICS } from './hotTopicsTypes.js';

const STORAGE_PATH = path.resolve(process.cwd(), 'data', 'vera-hot-topics.json');
const CURSORS_PATH = path.resolve(process.cwd(), 'data', 'vera-hot-topics-cursors.json');

interface StoredHotTopicsState {
  topicId: string | null;
  createdAt: string;
  network: string;
  initialized: boolean;
  config: Partial<HotTopicsConfig>;
}

interface StoredCursors {
  cursors: Record<string, HotTopicsCursor>;
  lastUpdated: string;
}

export class HotTopicsManager {
  private topicId: string | null = null;
  private cachedConfig: HotTopicsConfig;
  private cursors = new Map<string, HotTopicsCursor>();
  private isInitialized = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private autoDiscoveryInterval: NodeJS.Timeout | null = null;

  constructor(userConfig?: Partial<HotTopicsConfig>) {
    this.cachedConfig = {
      ...DEFAULT_HOT_TOPICS_CONFIG,
      monitoredTopics: [...INITIAL_MONITORED_TOPICS],
      workflowPatterns: [],
      ...userConfig,
    } as HotTopicsConfig;

    // Apply topic ID from config if present
    if (config.VERA_HOT_TOPICS_TOPIC_ID) {
      this.topicId = config.VERA_HOT_TOPICS_TOPIC_ID;
    }
  }

  /**
   * Initialize the hot topics manager - loads state, creates topic if needed
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    // Load persisted state
    const state = await this.loadState();
    if (state?.topicId) {
      this.topicId = state.topicId;
      this.cachedConfig = { ...this.cachedConfig, ...state.config };
      logger.info('HotTopicsManager', {
        message: 'Loaded persisted hot topics state',
        topicId: this.topicId,
        network: state.network,
      });
    }

    // Load persisted cursors
    await this.loadCursors();

    // Create topic if missing and we have credentials
    if (!this.topicId) {
      const client = this.tryGetClient();
      if (client) {
        this.topicId = await this.createTopic(client);
        if (this.topicId) {
          await this.persistState();
          // Send init message
          await this.publishInitMessage(client);
        }
      } else {
        logger.warn('HotTopicsManager', {
          message: 'Cannot create hot topics topic - Hedera credentials not configured',
        });
      }
    }

    this.isInitialized = true;

    if (this.topicId) {
      logger.info('HotTopicsManager', {
        message: 'Hot topics manager initialized',
        topicId: this.topicId,
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/topic/${this.topicId}`,
        monitoredCount: this.cachedConfig.monitoredTopics.length,
      });
    }

    return !!this.topicId;
  }

  /**
   * Start the periodic scan cycle
   */
  startScanning(scanFn: () => Promise<HotTopicsScanResult>): void {
    if (this.scanInterval) {
      return;
    }

    const intervalMs = this.cachedConfig.pollIntervalMs;

    this.scanInterval = setInterval(async () => {
      try {
        const result = await scanFn();
        await this.publishScanResult(result);
      } catch (error) {
        logger.error('HotTopicsManager', {
          message: 'Scan cycle failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    logger.info('HotTopicsManager', {
      message: 'Hot topics scanning started',
      intervalMs,
      intervalMin: intervalMs / 60000,
    });
  }

  /**
   * Stop the periodic scan cycle
   */
  stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.autoDiscoveryInterval) {
      clearInterval(this.autoDiscoveryInterval);
      this.autoDiscoveryInterval = null;
    }
    logger.info('HotTopicsManager', { message: 'Hot topics scanning stopped' });
  }

  /**
   * Publish a scan result to the hot topics topic
   */
  async publishScanResult(result: HotTopicsScanResult): Promise<boolean> {
    if (!this.topicId) {
      logger.warn('HotTopicsManager', {
        message: 'Cannot publish scan result - no hot topics topic ID',
      });
      return false;
    }

    const client = this.tryGetClient();
    if (!client) {
      logger.warn('HotTopicsManager', {
        message: 'Cannot publish scan result - Hedera client not available',
      });
      return false;
    }

    try {
      // Submit via hederaMaster with HIP-993 wrapper
      const hcsResult = await hederaMaster.submitMessage(this.topicId, result, {
        maxChunkSize: 4096
      });

      logger.info('HotTopicsManager', {
        message: 'Published hot topics scan result',
        topicId: this.topicId,
        type: result.type,
        highVolumeCount: result.highVolume.length,
        newTopicsCount: result.newTopics.length,
        sequenceNumber: hcsResult.sequenceNumber,
        chunks: hcsResult.chunks,
      });

      return true;
    } catch (error) {
      logger.error('HotTopicsManager', {
        message: 'Failed to publish scan result',
        topicId: this.topicId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Publish an immediate alert (not on scan cycle)
   */
  async publishAlert(alertResult: HotTopicsScanResult): Promise<boolean> {
    alertResult.type = 'hot-alert';
    return this.publishScanResult(alertResult);
  }

  /**
   * Get the hot topics topic ID
   */
  getTopicId(): string | null {
    return this.topicId;
  }

  /**
   * Get the current configuration
   */
  getConfig(): HotTopicsConfig {
    return { ...this.cachedConfig };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<HotTopicsConfig>): void {
    this.cachedConfig = { ...this.cachedConfig, ...updates };
    void this.persistState();
  }

  /**
   * Add a topic to the monitored list
   */
  addMonitoredTopic(topicId: string): void {
    if (!this.cachedConfig.monitoredTopics.includes(topicId)) {
      this.cachedConfig.monitoredTopics.push(topicId);
      void this.persistState();
      logger.info('HotTopicsManager', {
        message: 'Added monitored topic',
        topicId,
        totalMonitored: this.cachedConfig.monitoredTopics.length,
      });
    }
  }

  /**
   * Remove a topic from the monitored list
   */
  removeMonitoredTopic(topicId: string): void {
    const idx = this.cachedConfig.monitoredTopics.indexOf(topicId);
    if (idx !== -1) {
      this.cachedConfig.monitoredTopics.splice(idx, 1);
      this.cursors.delete(topicId);
      void this.persistState();
      void this.persistCursors();
      logger.info('HotTopicsManager', {
        message: 'Removed monitored topic',
        topicId,
        totalMonitored: this.cachedConfig.monitoredTopics.length,
      });
    }
  }

  /**
   * Get monitored topic list
   */
  getMonitoredTopics(): string[] {
    return [...this.cachedConfig.monitoredTopics];
  }

  /**
   * Get or create cursor for a topic
   */
  getCursor(topicId: string): HotTopicsCursor {
    if (!this.cursors.has(topicId)) {
      const cursor: HotTopicsCursor = {
        topicId,
        lastSequenceNumber: 0,
        lastPollTime: 0,
        messageCount: 0,
        volumeHistory: [],
      };
      this.cursors.set(topicId, cursor);
    }
    return this.cursors.get(topicId)!;
  }

  /**
   * Update cursor for a topic
   */
  updateCursor(topicId: string, updates: Partial<HotTopicsCursor>): void {
    const cursor = this.getCursor(topicId);
    Object.assign(cursor, updates);
    void this.persistCursors();
  }

  /**
   * Get all cursors
   */
  getAllCursors(): HotTopicsCursor[] {
    return Array.from(this.cursors.values());
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private async createTopic(client: Client): Promise<string | null> {
    try {
      const response = await new TopicCreateTransaction()
        .setTopicMemo('Vera Hot Topics Radar - High-volume workflow monitoring')
        .execute(client);

      const receipt = await response.getReceipt(client);
      const topicId = receipt.topicId?.toString() ?? null;

      if (topicId) {
        logger.info('HotTopicsManager', {
          message: 'Created hot topics radar topic',
          topicId,
          hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/topic/${topicId}`,
        });
      }

      return topicId;
    } catch (error) {
      logger.error('HotTopicsManager', {
        message: 'Failed to create hot topics topic',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async publishInitMessage(client: Client): Promise<void> {
    if (!this.topicId) return;

    const initMessage = {
      type: 'hot-init',
      timestamp: Date.now().toString(),
      threshold: this.cachedConfig.volumeThreshold,
      alertThreshold: this.cachedConfig.alertThreshold,
      monitored: this.cachedConfig.monitoredTopics,
      status: 'active',
      version: '1.0.0',
    };

    try {
      // Submit via hederaMaster with HIP-993 wrapper
      await hederaMaster.submitMessage(this.topicId, initMessage, {
        maxChunkSize: 4096
      });

      logger.info('HotTopicsManager', {
        message: 'Published hot-init bootstrap message',
        topicId: this.topicId,
      });
    } catch (error) {
      logger.warn('HotTopicsManager', {
        message: 'Failed to publish init message',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadState(): Promise<StoredHotTopicsState | null> {
    try {
      const raw = await fs.readFile(STORAGE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoredHotTopicsState;

      if (parsed.network !== config.HEDERA_NETWORK) {
        logger.warn('HotTopicsManager', {
          message: 'State file network mismatch - ignoring',
          fileNetwork: parsed.network,
          currentNetwork: config.HEDERA_NETWORK,
        });
        return null;
      }

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('HotTopicsManager', {
          message: 'Failed to load hot topics state',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  }

  private async persistState(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });

      const state: StoredHotTopicsState = {
        topicId: this.topicId,
        createdAt: new Date().toISOString(),
        network: config.HEDERA_NETWORK,
        initialized: this.isInitialized,
        config: {
          pollIntervalMs: this.cachedConfig.pollIntervalMs,
          volumeThreshold: this.cachedConfig.volumeThreshold,
          alertThreshold: this.cachedConfig.alertThreshold,
          maxMonitored: this.cachedConfig.maxMonitored,
          autoDiscovery: this.cachedConfig.autoDiscovery,
          monitoredTopics: this.cachedConfig.monitoredTopics,
        },
      };

      await fs.writeFile(STORAGE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      logger.warn('HotTopicsManager', {
        message: 'Failed to persist hot topics state',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadCursors(): Promise<void> {
    try {
      const raw = await fs.readFile(CURSORS_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoredCursors;

      for (const [topicId, cursor] of Object.entries(parsed.cursors)) {
        this.cursors.set(topicId, cursor);
      }

      logger.debug('HotTopicsManager', {
        message: 'Loaded cursors',
        count: this.cursors.size,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('HotTopicsManager', {
          message: 'Failed to load cursors',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async persistCursors(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(CURSORS_PATH), { recursive: true });

      const cursors: Record<string, HotTopicsCursor> = {};
      for (const [topicId, cursor] of this.cursors) {
        cursors[topicId] = cursor;
      }

      const state: StoredCursors = {
        cursors,
        lastUpdated: new Date().toISOString(),
      };

      await fs.writeFile(CURSORS_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      logger.warn('HotTopicsManager', {
        message: 'Failed to persist cursors',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private tryGetClient() {
    try {
      if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
        return null;
      }
      return getClient();
    } catch (error) {
      logger.error('HotTopicsManager', {
        message: 'Failed to initialize Hedera client',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export const hotTopicsManager = new HotTopicsManager();
