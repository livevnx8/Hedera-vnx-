import axios from 'axios';
import { EventEmitter } from 'events';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import type { HcsExtractedMessage } from '../../blocknode/blockStreamService.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TopicMessage {
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  payload: unknown;
  rawBase64: string;
}

export interface PollerConfig {
  mirrorNodeUrl: string;
  pollIntervalMs: number;
  maxPageSize: number;
  timeoutMs: number;
}

interface TopicCursor {
  topicId: string;
  lastSequenceNumber: number;
  totalMessages: number;
  errors: number;
}

// ─── Parallel Topic Poller ───────────────────────────────────────────────────

const DEFAULT_POLLER_CONFIG: PollerConfig = {
  mirrorNodeUrl: 'https://mainnet-public.mirrornode.hedera.com',
  pollIntervalMs: 15_000,
  maxPageSize: 100,
  timeoutMs: 10_000,
};

export class ParallelTopicPoller extends EventEmitter {
  private config: PollerConfig;
  private cursors = new Map<string, TopicCursor>();
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  // HIP-1056 Block Stream integration
  private useBlockStream = false;
  private blockStreamConsumer: any = null;

  // Volume tracking for hot topics detection
  private volumeTracking = new Map<string, {
    count: number;
    lastWindow: number;
    messagesThisWindow: number;
    classifications: string[];
  }>();

  constructor(overrides?: Partial<PollerConfig>) {
    super();
    this.config = {
      ...DEFAULT_POLLER_CONFIG,
      ...overrides,
    };
    this.config.mirrorNodeUrl = config.MIRROR_NODE_BASE_URL || this.config.mirrorNodeUrl;

    // Feature flag: use HIP-1056 block stream for HCS ingestion
    this.useBlockStream = config.USE_BLOCK_STREAM === 'true';
  }

  /**
   * Register a topic to be polled. Can be called before or after start().
   */
  registerTopic(topicId: string, startAfterSequence = 0): void {
    if (!topicId) return;
    if (this.cursors.has(topicId)) return;

    this.cursors.set(topicId, {
      topicId,
      lastSequenceNumber: startAfterSequence,
      totalMessages: 0,
      errors: 0,
    });

    logger.debug('ParallelTopicPoller', { message: 'Topic registered', topicId, startAfterSequence });
  }

  start(): void {
    if (this.useBlockStream) {
      void this.startBlockStream();
      // Keep REST poller as fallback at reduced frequency
      if (this.pollTimer) return;
      this.pollTimer = setInterval(() => {
        void this.pollAll();
      }, this.config.pollIntervalMs * 4); // 4x slower REST fallback
      logger.info('ParallelTopicPoller', {
        message: 'Block stream mode active (REST fallback at reduced frequency)',
        topics: this.cursors.size,
        intervalMs: this.config.pollIntervalMs * 4,
      });
      return;
    }

    if (this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      void this.pollAll();
    }, this.config.pollIntervalMs);

    void this.pollAll(); // immediate first poll

    logger.info('ParallelTopicPoller', {
      message: 'REST poller started',
      topics: this.cursors.size,
      intervalMs: this.config.pollIntervalMs,
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.blockStreamConsumer) {
      try { this.blockStreamConsumer.stop(); } catch { /* ignore */ }
      this.blockStreamConsumer = null;
    }
    logger.info('ParallelTopicPoller', { message: 'Poller stopped' });
  }

  /**
   * Start HIP-1056 block stream consumer for near-real-time HCS ingestion.
   */
  private async startBlockStream(): Promise<void> {
    try {
      const { blockStreamConsumer } = await import('../../blocknode/blockStreamService.js');
      this.blockStreamConsumer = blockStreamConsumer;
      this.blockStreamConsumer.configure({
        endpoint: config.BLOCK_STREAM_ENDPOINT,
        filterTopics: Array.from(this.cursors.keys()),
      });

      this.blockStreamConsumer.on('hcs_message', (msg: HcsExtractedMessage) => {
        const topicId = msg.topicId;
        const cursor = this.cursors.get(topicId);
        if (!cursor) return; // Not a topic we're tracking

        // Update cursor
        cursor.lastSequenceNumber = Math.max(cursor.lastSequenceNumber, msg.sequenceNumber);
        cursor.totalMessages++;

        const topicMessage: TopicMessage = {
          topicId: msg.topicId,
          sequenceNumber: msg.sequenceNumber,
          consensusTimestamp: msg.consensusTimestamp,
          payload: (() => {
            try { return JSON.parse(msg.message); } catch { return null; }
          })(),
          rawBase64: Buffer.from(msg.message).toString('base64'),
        };

        this.emit('message', topicMessage);
        this.trackMessageVolume(topicId, topicMessage);
      });

      this.blockStreamConsumer.on('block_header', (item: any) => {
        this.emit('block_header', item);
      });

      this.blockStreamConsumer.on('block_proof', (item: any) => {
        this.emit('block_proof', item);
      });

      this.blockStreamConsumer.start();

      logger.info('ParallelTopicPoller', {
        message: 'Block stream consumer started',
        endpoint: config.BLOCK_STREAM_ENDPOINT,
        topics: Array.from(this.cursors.keys()),
      });
    } catch (err) {
      logger.error('ParallelTopicPoller', {
        message: 'Failed to start block stream consumer, falling back to REST',
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback to REST
      this.useBlockStream = false;
      this.start();
    }
  }

  /**
   * Poll all registered topics in parallel.
   */
  private async pollAll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    const topicIds = Array.from(this.cursors.keys());
    if (topicIds.length === 0) {
      this.isPolling = false;
      return;
    }

    try {
      const results = await Promise.allSettled(
        topicIds.map((id) => this.pollTopic(id)),
      );

      let totalNew = 0;
      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalNew += result.value;
        }
      }

      if (totalNew > 0) {
        this.emit('poll_complete', { totalNewMessages: totalNew, topics: topicIds.length });
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Poll a single topic with cursor-based pagination.
   * Follows `links.next` until no more pages.
   */
  private async pollTopic(topicId: string): Promise<number> {
    const cursor = this.cursors.get(topicId);
    if (!cursor) return 0;

    let totalNew = 0;
    let nextUrl: string | null =
      `${this.config.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?order=asc&limit=${this.config.maxPageSize}&sequencenumber=gt:${cursor.lastSequenceNumber}`;

    try {
      while (nextUrl) {
        const { data } = await axios.get(nextUrl, { timeout: this.config.timeoutMs });

        const messages: Array<{
          sequence_number: number;
          consensus_timestamp: string;
          message: string;
        }> = data?.messages ?? [];

        for (const msg of messages) {
          cursor.lastSequenceNumber = Math.max(cursor.lastSequenceNumber, msg.sequence_number);
          cursor.totalMessages++;
          totalNew++;

          let payload: unknown;
          try {
            const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
            payload = JSON.parse(decoded);
          } catch {
            payload = null;
          }

          const topicMessage: TopicMessage = {
            topicId,
            sequenceNumber: msg.sequence_number,
            consensusTimestamp: msg.consensus_timestamp,
            payload,
            rawBase64: msg.message,
          };

          this.emit('message', topicMessage);

          // Volume tracking for hot topics detection
          this.trackMessageVolume(topicId, topicMessage);
        }

        // Follow pagination link if present
        const nextLink: string | undefined = data?.links?.next;
        if (nextLink && messages.length === this.config.maxPageSize) {
          // The mirror node returns a relative path like /api/v1/topics/...
          nextUrl = nextLink.startsWith('http')
            ? nextLink
            : `${this.config.mirrorNodeUrl}${nextLink}`;
        } else {
          nextUrl = null;
        }
      }
    } catch (error) {
      cursor.errors++;
      logger.warn('ParallelTopicPoller', {
        message: 'Topic poll failed',
        topicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return totalNew;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getCursor(topicId: string): TopicCursor | undefined {
    return this.cursors.get(topicId);
  }

  getStats() {
    const cursors = Array.from(this.cursors.values());
    return {
      topics: cursors.length,
      totalMessages: cursors.reduce((s, c) => s + c.totalMessages, 0),
      totalErrors: cursors.reduce((s, c) => s + c.errors, 0),
      cursors: cursors.map((c) => ({
        topicId: c.topicId,
        lastSequence: c.lastSequenceNumber,
        messages: c.totalMessages,
        errors: c.errors,
      })),
    };
  }

  /**
   * Track message volume for hot topics detection
   */
  private trackMessageVolume(topicId: string, message: TopicMessage): void {
    const now = Date.now();
    const windowStart = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000); // 5-min window

    let tracking = this.volumeTracking.get(topicId);
    if (!tracking) {
      tracking = {
        count: 0,
        lastWindow: windowStart,
        messagesThisWindow: 0,
        classifications: [],
      };
      this.volumeTracking.set(topicId, tracking);
    }

    // Reset if new window
    if (tracking.lastWindow !== windowStart) {
      tracking.lastWindow = windowStart;
      tracking.messagesThisWindow = 0;
      tracking.classifications = [];
    }

    tracking.count++;
    tracking.messagesThisWindow++;

    // Try to classify from payload
    if (message.payload && typeof message.payload === 'object') {
      const payload = JSON.stringify(message.payload).toLowerCase();
      const patterns = [
        { match: /carbon|emission/, class: 'carbon' },
        { match: /fedex|route/, class: 'fedex' },
        { match: /defi|swap/, class: 'defi' },
        { match: /nft|mint/, class: 'nft' },
      ];
      for (const p of patterns) {
        if (p.match.test(payload) && !tracking.classifications.includes(p.class)) {
          tracking.classifications.push(p.class);
        }
      }
    }

    // Emit volume event for significant activity
    if (tracking.messagesThisWindow === 50 || tracking.messagesThisWindow === 100) {
      this.emit('volume_threshold', {
        topicId,
        messagesThisWindow: tracking.messagesThisWindow,
        totalCount: tracking.count,
        windowStart: tracking.lastWindow,
        classifications: [...tracking.classifications],
      });
    }
  }

  /**
   * Get volume tracking stats for all topics
   */
  getVolumeStats(): Array<{
    topicId: string;
    totalMessages: number;
    messagesInCurrentWindow: number;
    windowStart: number;
    classifications: string[];
    estimatedHourlyRate: number;
  }> {
    const now = Date.now();
    const windowStart = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);

    return Array.from(this.volumeTracking.entries()).map(([topicId, tracking]) => {
      const isCurrentWindow = tracking.lastWindow === windowStart;
      const windowAgeHours = isCurrentWindow
        ? (now - tracking.lastWindow) / (1000 * 60 * 60)
        : 5 / 60; // 5 min in hours

      const hourlyRate = isCurrentWindow && windowAgeHours > 0
        ? Math.round(tracking.messagesThisWindow / windowAgeHours)
        : 0;

      return {
        topicId,
        totalMessages: tracking.count,
        messagesInCurrentWindow: isCurrentWindow ? tracking.messagesThisWindow : 0,
        windowStart: tracking.lastWindow,
        classifications: [...tracking.classifications],
        estimatedHourlyRate: hourlyRate,
      };
    });
  }

  /**
   * Get volume stats for a specific topic
   */
  getTopicVolume(topicId: string): {
    totalMessages: number;
    messagesInCurrentWindow: number;
    windowStart: number;
    classifications: string[];
    estimatedHourlyRate: number;
  } | null {
    const tracking = this.volumeTracking.get(topicId);
    if (!tracking) return null;

    const now = Date.now();
    const windowStart = Math.floor(now / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const isCurrentWindow = tracking.lastWindow === windowStart;
    const windowAgeHours = isCurrentWindow
      ? Math.max((now - tracking.lastWindow) / (1000 * 60 * 60), 0.001)
      : 0.083; // 5 min in hours

    const hourlyRate = isCurrentWindow
      ? Math.round(tracking.messagesThisWindow / windowAgeHours)
      : 0;

    return {
      totalMessages: tracking.count,
      messagesInCurrentWindow: isCurrentWindow ? tracking.messagesThisWindow : 0,
      windowStart: tracking.lastWindow,
      classifications: [...tracking.classifications],
      estimatedHourlyRate: hourlyRate,
    };
  }

  /**
   * Reset volume tracking for all or specific topic
   */
  resetVolumeTracking(topicId?: string): void {
    if (topicId) {
      this.volumeTracking.delete(topicId);
      logger.info('ParallelTopicPoller', { message: 'Reset volume tracking', topicId });
    } else {
      this.volumeTracking.clear();
      logger.info('ParallelTopicPoller', { message: 'Reset all volume tracking' });
    }
  }
}

export const topicPoller = new ParallelTopicPoller();
