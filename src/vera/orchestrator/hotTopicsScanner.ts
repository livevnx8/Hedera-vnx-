/**
 * Vera Hot Topics Scanner
 *
 * QVX-powered scanner for high-volume topic detection and workflow classification.
 * Uses QuantumParallelMirrors for parallel mirror node fetching with intelligent
 * backoff, volume tracking, and pattern-based workflow classification.
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { quantumParallelMirrors } from '../../quantum/QuantumParallelMirrors.js';
import { config } from '../../config.js';
import type {
  HotTopicsScanResult,
  HotTopicsConfig,
  HotTopicEntry,
  HotTopicsCursor,
  WorkflowType,
  ActionFlag,
  NewTopicDiscovery,
  TopicClassification,
  VolumeDelta,
  WorkflowPattern,
  VolumeSpikeEvent,
  MirrorFetchResult,
} from './hotTopicsTypes.js';
import { DEFAULT_WORKFLOW_PATTERNS } from './hotTopicsTypes.js';

interface ScannerStats {
  totalScans: number;
  totalTopicsChecked: number;
  totalMessagesProcessed: number;
  totalErrors: number;
  lastScanDuration: number;
  lastScanTime: number;
}

export class HotTopicsScanner extends EventEmitter {
  private config: HotTopicsConfig;
  private patterns: WorkflowPattern[];
  private stats: ScannerStats;
  private isScanning = false;
  private mirrorNodes: string[];
  private backoffUntil = 0;
  private currentBackoff = 30000; // 30s initial

  constructor(config: HotTopicsConfig) {
    super();
    this.config = config;
    this.patterns = [...DEFAULT_WORKFLOW_PATTERNS, ...(config.workflowPatterns || [])];
    this.mirrorNodes = config.mirrorNodeUrls || [
      config.MIRROR_NODE_BASE_URL || 'https://mainnet-public.mirrornode.hedera.com',
    ];
    this.stats = {
      totalScans: 0,
      totalTopicsChecked: 0,
      totalMessagesProcessed: 0,
      totalErrors: 0,
      lastScanDuration: 0,
      lastScanTime: 0,
    };
  }

  /**
   * Perform a full scan of all monitored topics
   */
  async scanAllTopics(cursors: Map<string, HotTopicsCursor>): Promise<HotTopicsScanResult> {
    const scanStart = Date.now();
    const topicIds = this.config.monitoredTopics;

    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    // Check backoff
    if (Date.now() < this.backoffUntil) {
      const waitMs = this.backoffUntil - Date.now();
      logger.warn('HotTopicsScanner', {
        message: 'Scanner in backoff period',
        waitMs,
      });
      return this.createEmptyResult('Scanner in backoff');
    }

    this.isScanning = true;
    const highVolume: HotTopicEntry[] = [];
    const newTopics: NewTopicDiscovery[] = [];
    let totalErrors = 0;
    let totalMessages = 0;

    try {
      // Process topics in batches to avoid overwhelming mirrors
      const batchSize = 5;
      for (let i = 0; i < topicIds.length; i += batchSize) {
        const batch = topicIds.slice(i, i + batchSize);

        // Parallel fetch across batch using Quantum Duet
        const batchResults = await Promise.allSettled(
          batch.map((topicId) => this.scanTopic(topicId, cursors.get(topicId))),
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            const scan = result.value;
            totalMessages += scan.messages.length;

            // Calculate volume and delta
            const entry = this.processTopicResult(scan, cursors);
            if (entry) {
              highVolume.push(entry);

              // Check for spike
              if (entry.msgsHour > this.config.alertThreshold) {
                this.emit('volume_spike', {
                  topicId: entry.topicId,
                  currentVolume: entry.msgsHour,
                  timestamp: Date.now(),
                  classification: entry.workflow,
                } as VolumeSpikeEvent);
              }
            }
          } else {
            totalErrors++;
            logger.warn('HotTopicsScanner', {
              message: 'Topic scan failed',
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }

        // Small delay between batches to be mirror-friendly
        if (i + batchSize < topicIds.length) {
          await this.delay(500);
        }
      }

      // Auto-discovery if enabled
      if (this.config.autoDiscovery && this.shouldRunAutoDiscovery()) {
        const discovered = await this.runAutoDiscovery();
        newTopics.push(...discovered);
      }

      const scanDuration = Date.now() - scanStart;
      this.updateStats(topicIds.length, totalMessages, totalErrors, scanDuration);

      // Generate summary
      const summary = this.generateSummary(highVolume, newTopics);

      return {
        type: 'hot-scan',
        scanTime: new Date().toISOString(),
        scanTimestamp: Date.now(),
        highVolume,
        newTopics,
        summary,
        threshold: this.config.volumeThreshold,
        alertThreshold: this.config.alertThreshold,
        totalMonitored: topicIds.length,
        metrics: {
          scanDurationMs: scanDuration,
          topicsChecked: topicIds.length,
          mirrorCalls: this.stats.totalScans,
          errors: totalErrors,
        },
      };
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan a single topic for messages
   */
  private async scanTopic(
    topicId: string,
    cursor?: HotTopicsCursor,
  ): Promise<{
    topicId: string;
    messages: Array<{ sequenceNumber: number; payload: unknown; decoded: string | null }>;
    classification?: TopicClassification;
    startSeq: number;
    endSeq: number;
  }> {
    const startSeq = cursor?.lastSequenceNumber || 0;
    const messages: Array<{ sequenceNumber: number; payload: unknown; decoded: string | null }> = [];
    let currentSeq = startSeq;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 10; // Limit pages per scan to avoid long operations

    // Try quantum parallel fetching first
    try {
      const parallelResults = await this.fetchWithQuantumParallel(topicId, startSeq);
      if (parallelResults.length > 0) {
        messages.push(...parallelResults);
        currentSeq = Math.max(...parallelResults.map((m) => m.sequenceNumber), startSeq);
      }
    } catch (error) {
      logger.debug('HotTopicsScanner', {
        message: 'Quantum parallel fetch failed, falling back to direct',
        topicId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to direct mirror fetching
      while (hasMore && pageCount < maxPages) {
        const result = await this.fetchTopicPage(topicId, currentSeq);

        if (result.messages.length === 0) {
          hasMore = false;
          break;
        }

        messages.push(...result.messages);
        currentSeq = Math.max(...result.messages.map((m) => m.sequenceNumber), currentSeq);

        hasMore = result.nextCursor !== null;
        pageCount++;

        // Classify based on sample of messages
        if (messages.length >= 10 && !hasMore) {
          break;
        }
      }
    }

    // Classify the topic
    const classification = this.classifyTopic(topicId, messages);

    return {
      topicId,
      messages,
      classification,
      startSeq,
      endSeq: currentSeq,
    };
  }

  /**
   * Fetch using Quantum Parallel Mirrors
   */
  private async fetchWithQuantumParallel(
    topicId: string,
    startSeq: number,
  ): Promise<Array<{ sequenceNumber: number; payload: unknown; decoded: string | null }>> {
    // Use quantum parallel mirrors for enhanced parallel fetching
    const results = await quantumParallelMirrors.processThroughParallelMirrors([
      { topicId, startSeq, type: 'topic_fetch' },
    ]);

    // Flatten and extract message data
    const messages: Array<{ sequenceNumber: number; payload: unknown; decoded: string | null }> = [];
    for (const result of results) {
      if (result.messages && Array.isArray(result.messages)) {
        messages.push(...result.messages);
      }
    }

    return messages;
  }

  /**
   * Fetch a single page of topic messages
   */
  private async fetchTopicPage(
    topicId: string,
    afterSeq: number,
  ): Promise<MirrorFetchResult> {
    const mirrorUrl = this.mirrorNodes[0];
    const url = `${mirrorUrl}/api/v1/topics/${topicId}/messages?order=asc&limit=100&sequencenumber=gt:${afterSeq}`;

    try {
      const { data } = await axios.get(url, { timeout: 10000 });

      const messages = (data?.messages || []).map(
        (msg: { sequence_number: number; message: string; consensus_timestamp: string }) => {
          let decoded: string | null = null;
          let payload: unknown = null;

          try {
            decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
            payload = JSON.parse(decoded);
          } catch {
            // Keep as null if decode/parse fails
          }

          return {
            sequenceNumber: msg.sequence_number,
            consensusTimestamp: msg.consensus_timestamp,
            payload,
            decoded,
          };
        },
      );

      const nextLink: string | undefined = data?.links?.next;
      const nextCursor = nextLink
        ? nextLink.startsWith('http')
          ? nextLink
          : `${mirrorUrl}${nextLink}`
        : null;

      return {
        topicId,
        messages,
        nextCursor,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        // Handle throttling
        if (status === 429 || status === 503) {
          this.applyBackoff();
          throw new Error(`Mirror node throttled (status ${status})`);
        }
      }
      throw error;
    }
  }

  /**
   * Process scan result into HotTopicEntry
   */
  private processTopicResult(
    scan: {
      topicId: string;
      messages: Array<{ sequenceNumber: number; payload: unknown }>;
      classification?: TopicClassification;
      startSeq: number;
      endSeq: number;
    },
    cursors: Map<string, HotTopicsCursor>,
  ): HotTopicEntry | null {
    const cursor = cursors.get(scan.topicId);
    const previousCount = cursor?.messageCount || 0;
    const newCount = scan.messages.length;
    const totalCount = previousCount + newCount;

    // Calculate msgs/hour based on time window
    const now = Date.now();
    const lastPoll = cursor?.lastPollTime || now - this.config.pollIntervalMs;
    const timeWindowHours = (now - lastPoll) / (1000 * 60 * 60);
    const msgsHour = Math.round(newCount / Math.max(timeWindowHours, 0.001));

    // Only include if above threshold
    if (msgsHour < this.config.volumeThreshold) {
      return null;
    }

    // Calculate delta
    const previousVolume = cursor?.volumeHistory?.[cursor.volumeHistory.length - 1]?.count || 0;
    const delta = msgsHour - previousVolume;
    const deltaFormatted = delta >= 0 ? `+${delta}` : `${delta}`;

    // Determine action
    let action: ActionFlag = 'monitor';
    if (msgsHour > this.config.alertThreshold) {
      action = 'alert';
    } else if (delta > this.config.volumeThreshold * 0.5) {
      action = 'investigate';
    }

    return {
      topicId: scan.topicId,
      msgsHour,
      delta,
      deltaFormatted,
      workflow: scan.classification?.workflow || 'unknown',
      action,
      lastSeen: new Date().toISOString(),
      metadata: {
        classificationConfidence: scan.classification?.confidence,
        matchedPatterns: scan.classification?.matchedPatterns,
        samplePayloads: scan.classification?.samplePayloads?.slice(0, 3),
      },
    };
  }

  /**
   * Classify topic based on message content
   */
  private classifyTopic(
    topicId: string,
    messages: Array<{ payload: unknown; decoded: string | null }>,
  ): TopicClassification {
    const scores = new Map<WorkflowType, { score: number; matched: string[] }>();
    const samplePayloads: unknown[] = [];

    for (const msg of messages.slice(0, 20)) {
      // Collect samples
      if (samplePayloads.length < 5 && msg.payload) {
        samplePayloads.push(msg.payload);
      }

      // Check against patterns
      const textToMatch = JSON.stringify(msg.payload).toLowerCase();

      for (const pattern of this.patterns) {
        if (pattern.pattern.test(textToMatch)) {
          const existing = scores.get(pattern.workflow) || { score: 0, matched: [] };
          existing.score += pattern.confidence;
          if (!existing.matched.includes(pattern.workflow)) {
            existing.matched.push(...pattern.keywords);
          }
          scores.set(pattern.workflow, existing);
        }
      }
    }

    // Find best match
    let bestWorkflow: WorkflowType = 'unknown';
    let bestScore = 0;
    const allMatched: string[] = [];

    for (const [workflow, data] of scores) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestWorkflow = workflow;
        allMatched.push(...data.matched);
      }
    }

    // Calculate confidence
    const confidence = Math.min(bestScore / Math.max(messages.length * 0.5, 1), 1);

    return {
      topicId,
      workflow: bestWorkflow,
      confidence,
      matchedPatterns: [...new Set(allMatched)],
      samplePayloads,
    };
  }

  /**
   * Auto-discovery: Scan for new high-volume topics
   */
  private async runAutoDiscovery(): Promise<NewTopicDiscovery[]> {
    // This would scan Hedera's public topic list for high-volume topics
    // For now, return empty - this is a future enhancement
    logger.info('HotTopicsScanner', {
      message: 'Auto-discovery scan would run here',
      note: 'Full implementation requires Hedera public topic enumeration',
    });
    return [];
  }

  private shouldRunAutoDiscovery(): boolean {
    // Run once per week (or configured interval)
    const hoursSinceLastDiscovery = 168; // Placeholder
    return hoursSinceLastDiscovery >= this.config.autoDiscoveryIntervalHours;
  }

  /**
   * Apply exponential backoff for mirror throttling
   */
  private applyBackoff(): void {
    this.backoffUntil = Date.now() + this.currentBackoff;
    this.currentBackoff = Math.min(this.currentBackoff * 2, this.config.maxBackoffMs);

    logger.warn('HotTopicsScanner', {
      message: 'Applied backoff due to mirror throttling',
      backoffMs: this.currentBackoff,
      backoffUntil: new Date(this.backoffUntil).toISOString(),
    });
  }

  /**
   * Reset backoff on successful operations
   */
  private resetBackoff(): void {
    if (this.currentBackoff > 30000) {
      this.currentBackoff = 30000;
      logger.info('HotTopicsScanner', { message: 'Reset backoff to initial value' });
    }
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(highVolume: HotTopicEntry[], newTopics: NewTopicDiscovery[]): string {
    if (highVolume.length === 0 && newTopics.length === 0) {
      return 'No high-volume activity detected';
    }

    const parts: string[] = [];

    if (highVolume.length > 0) {
      const workflows = [...new Set(highVolume.map((h) => h.workflow))];
      parts.push(`${highVolume.length} hot topics: ${workflows.join(', ')}`);
    }

    if (newTopics.length > 0) {
      parts.push(`${newTopics.length} new topics discovered`);
    }

    // Add alert indicator
    const alerts = highVolume.filter((h) => h.action === 'alert');
    if (alerts.length > 0) {
      parts.push(`⚠️ ${alerts.length} ALERT(S) - volume spikes detected`);
    }

    return parts.join('; ');
  }

  /**
   * Create empty result for error cases
   */
  private createEmptyResult(reason: string): HotTopicsScanResult {
    return {
      type: 'hot-scan',
      scanTime: new Date().toISOString(),
      scanTimestamp: Date.now(),
      highVolume: [],
      newTopics: [],
      summary: `Scan failed: ${reason}`,
      threshold: this.config.volumeThreshold,
      alertThreshold: this.config.alertThreshold,
      totalMonitored: this.config.monitoredTopics.length,
      metrics: {
        scanDurationMs: 0,
        topicsChecked: 0,
        mirrorCalls: 0,
        errors: 1,
      },
    };
  }

  /**
   * Update scanner statistics
   */
  private updateStats(
    topicsChecked: number,
    messagesProcessed: number,
    errors: number,
    duration: number,
  ): void {
    this.stats.totalScans++;
    this.stats.totalTopicsChecked += topicsChecked;
    this.stats.totalMessagesProcessed += messagesProcessed;
    this.stats.totalErrors += errors;
    this.stats.lastScanDuration = duration;
    this.stats.lastScanTime = Date.now();

    // Reset backoff on success
    if (errors === 0) {
      this.resetBackoff();
    }
  }

  /**
   * Get current statistics
   */
  getStats(): ScannerStats {
    return { ...this.stats };
  }

  /**
   * Get scanner configuration
   */
  getConfig(): HotTopicsConfig {
    return { ...this.config };
  }

  /**
   * Update scanner configuration
   */
  updateConfig(updates: Partial<HotTopicsConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.workflowPatterns) {
      this.patterns = [...DEFAULT_WORKFLOW_PATTERNS, ...updates.workflowPatterns];
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const createHotTopicsScanner = (config: HotTopicsConfig): HotTopicsScanner => {
  return new HotTopicsScanner(config);
};
