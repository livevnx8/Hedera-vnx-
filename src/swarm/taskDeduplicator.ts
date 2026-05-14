/**
 * Task Deduplicator & Coalescing
 *
 * Reduces redundant computation by:
 * - Detecting duplicate tasks across swarm within 5s window
 * - Coalescing similar tasks (same type, similar parameters) into batches
 * - Caching recent task results for idempotent operations
 * - Expected 20-40% computation reduction
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';

export interface TaskFingerprint {
  hash: string;
  taskType: string;
  params: Record<string, unknown>;
  timestamp: number;
  agentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: unknown;
  subscribers: Set<string>; // agentIds waiting for result
}

export interface CoalescedBatch {
  batchId: string;
  taskType: string;
  tasks: string[]; // original taskIds
  params: Record<string, unknown>;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed';
  result?: unknown;
}

export interface CacheEntry {
  key: string;
  result: unknown;
  timestamp: number;
  accessCount: number;
  ttl: number;
}

export interface DeduplicatorConfig {
  duplicateWindowMs: number;
  similarityThreshold: number;
  cacheTtlMs: number;
  maxCacheSize: number;
  enableCoalescing: boolean;
  enableFingerprinting: boolean;
  enableResultCache: boolean;
  coalesceWindowMs: number;
  maxBatchSize: number;
}

const DEFAULT_CONFIG: DeduplicatorConfig = {
  duplicateWindowMs: 5000,      // 5 second dedup window
  similarityThreshold: 0.85,    // 85% similarity for coalescing
  cacheTtlMs: 60000,            // 1 minute cache TTL
  maxCacheSize: 1000,           // Max 1000 cached results
  enableCoalescing: true,
  enableFingerprinting: true,
  enableResultCache: true,
  coalesceWindowMs: 2000,       // 2 second coalescing window
  maxBatchSize: 50,             // Max 50 tasks per batch
};

export class TaskDeduplicator extends EventEmitter {
  private fingerprints = new Map<string, TaskFingerprint>();
  private pendingBatches = new Map<string, CoalescedBatch>();
  private resultCache = new Map<string, CacheEntry>();
  private config: DeduplicatorConfig;
  private isRunning = false;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Statistics
  private stats = {
    duplicatesDetected: 0,
    duplicatesEliminated: 0,
    tasksCoalesced: 0,
    batchesCreated: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
    computationSaved: 0, // Estimated milliseconds
  };

  constructor(config: Partial<DeduplicatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the deduplicator
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, 10000); // Cleanup every 10s

    logger.info('TaskDeduplicator', {
      message: 'Task deduplicator started',
      duplicateWindow: this.config.duplicateWindowMs,
      coalesceWindow: this.config.coalesceWindowMs,
      cacheTtl: this.config.cacheTtlMs,
    });

    this.emit('started');
  }

  /**
   * Stop the deduplicator
   */
  stop(): void {
    this.isRunning = false;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    logger.info('TaskDeduplicator', { message: 'Task deduplicator stopped' });
    this.emit('stopped');
  }

  /**
   * Submit a task for deduplication check
   */
  submitTask(
    taskId: string,
    taskType: string,
    params: Record<string, unknown>,
    agentId: string,
    options: { idempotent?: boolean; cacheable?: boolean } = {}
  ): {
    action: 'process' | 'wait' | 'cached';
    originalTaskId?: string;
    batchId?: string;
    cachedResult?: unknown;
    reason: string;
  } {
    // Check result cache first (for idempotent operations)
    if (options.idempotent && this.config.enableResultCache) {
      const cacheKey = this.generateCacheKey(taskType, params);
      const cached = this.resultCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        cached.accessCount++;
        this.stats.cacheHits++;
        this.stats.computationSaved += 100; // Estimate 100ms saved

        logger.debug('TaskDeduplicator', {
          message: 'Cache hit',
          taskId,
          taskType,
          cacheKey,
        });

        this.emit('cache_hit', { taskId, taskType, cacheKey });

        return {
          action: 'cached',
          cachedResult: cached.result,
          reason: 'result_cached',
        };
      }
      this.stats.cacheMisses++;
    }

    // Generate fingerprint
    const fingerprint = this.generateFingerprint(taskType, params);

    // Check for duplicates
    const existing = this.findDuplicate(fingerprint, taskType, params);
    
    if (existing && existing.status !== 'completed' && existing.status !== 'failed') {
      // Add as subscriber to existing task
      existing.subscribers.add(agentId);
      this.stats.duplicatesDetected++;

      logger.debug('TaskDeduplicator', {
        message: 'Duplicate task detected',
        taskId,
        originalTaskId: existing.hash,
        taskType,
        subscribers: existing.subscribers.size,
      });

      this.emit('duplicate_detected', {
        taskId,
        originalTaskId: existing.hash,
        taskType,
      });

      return {
        action: 'wait',
        originalTaskId: existing.hash,
        reason: 'duplicate_in_progress',
      };
    }

    // Check for coalescing opportunity
    if (this.config.enableCoalescing) {
      const batch = this.findCoalescingBatch(taskType, params);
      
      if (batch && batch.tasks.length < this.config.maxBatchSize) {
        batch.tasks.push(taskId);
        this.stats.tasksCoalesced++;

        logger.debug('TaskDeduplicator', {
          message: 'Task coalesced',
          taskId,
          batchId: batch.batchId,
          taskType,
          batchSize: batch.tasks.length,
        });

        this.emit('task_coalesced', {
          taskId,
          batchId: batch.batchId,
          taskType,
          batchSize: batch.tasks.length,
        });

        return {
          action: 'wait',
          batchId: batch.batchId,
          reason: 'coalesced_into_batch',
        };
      }
    }

    // Create new fingerprint record
    const newFingerprint: TaskFingerprint = {
      hash: fingerprint,
      taskType,
      params,
      timestamp: Date.now(),
      agentId,
      status: 'pending',
      subscribers: new Set(),
    };

    this.fingerprints.set(taskId, newFingerprint);

    // Create batch if coalescing is enabled
    let batchId: string | undefined;
    if (this.config.enableCoalescing) {
      const batch = this.createBatch(taskId, taskType, params);
      batchId = batch.batchId;
      this.stats.batchesCreated++;
    }

    logger.debug('TaskDeduplicator', {
      message: 'Task accepted for processing',
      taskId,
      taskType,
      batchId,
    });

    this.emit('task_accepted', { taskId, taskType, fingerprint });

    return {
      action: 'process',
      batchId,
      reason: batchId ? 'batch_created' : 'new_task',
    };
  }

  /**
   * Mark task as processing
   */
  markProcessing(taskId: string): void {
    const fp = this.fingerprints.get(taskId);
    if (fp) {
      fp.status = 'processing';
    }

    // Update batch status
    for (const batch of this.pendingBatches.values()) {
      if (batch.tasks.includes(taskId)) {
        batch.status = 'processing';
        break;
      }
    }
  }

  /**
   * Complete a task and notify subscribers
   */
  completeTask(
    taskId: string,
    result: unknown,
    options: { cacheable?: boolean; ttl?: number } = {}
  ): {
    notifiedSubscribers: number;
    cached: boolean;
  } {
    const fp = this.fingerprints.get(taskId);
    const notifiedSubscribers = fp?.subscribers.size || 0;

    if (fp) {
      fp.status = 'completed';
      fp.result = result;
      this.stats.duplicatesEliminated += notifiedSubscribers;
      this.stats.computationSaved += notifiedSubscribers * 100;

      // Cache result if applicable
      if (options.cacheable && this.config.enableResultCache) {
        const cacheKey = this.generateCacheKey(fp.taskType, fp.params);
        this.cacheResult(cacheKey, result, options.ttl);
      }

      // Notify subscribers
      this.emit('task_completed', {
        taskId,
        originalTaskId: taskId,
        result,
        subscriberCount: notifiedSubscribers,
      });
    }

    // Complete batch if this was part of one
    for (const [batchId, batch] of this.pendingBatches) {
      if (batch.tasks.includes(taskId)) {
        batch.status = 'completed';
        batch.result = result;

        this.emit('batch_completed', {
          batchId,
          taskIds: batch.tasks,
          result,
        });

        // Clean up batch after a delay
        setTimeout(() => {
          this.pendingBatches.delete(batchId);
        }, 5000);

        break;
      }
    }

    logger.debug('TaskDeduplicator', {
      message: 'Task completed',
      taskId,
      notifiedSubscribers,
      cached: options.cacheable || false,
    });

    return {
      notifiedSubscribers,
      cached: options.cacheable || false,
    };
  }

  /**
   * Mark task as failed
   */
  markFailed(taskId: string, error: Error): void {
    const fp = this.fingerprints.get(taskId);
    
    if (fp) {
      fp.status = 'failed';

      // Notify subscribers of failure
      this.emit('task_failed', {
        taskId,
        originalTaskId: taskId,
        error: error.message,
        subscriberCount: fp.subscribers.size,
      });
    }

    // Fail batch if this was part of one
    for (const [batchId, batch] of this.pendingBatches) {
      if (batch.tasks.includes(taskId)) {
        this.emit('batch_failed', {
          batchId,
          taskIds: batch.tasks,
          error: error.message,
        });
        break;
      }
    }
  }

  /**
   * Generate task fingerprint
   */
  private generateFingerprint(taskType: string, params: Record<string, unknown>): string {
    if (!this.config.enableFingerprinting) {
      return `${taskType}-${Date.now()}-${Math.random()}`;
    }

    // Normalize params for consistent hashing
    const normalized = this.normalizeParams(params);
    const content = `${taskType}:${JSON.stringify(normalized)}`;
    
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Normalize params for consistent fingerprinting
   */
  private normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(params)) {
      // Skip volatile fields
      if (['timestamp', 'requestId', 'correlationId', 'nonce'].includes(key)) {
        continue;
      }
      
      // Normalize numbers to 4 decimal places
      if (typeof value === 'number') {
        normalized[key] = Math.round(value * 10000) / 10000;
      } else if (typeof value === 'object' && value !== null) {
        normalized[key] = this.normalizeParams(value as Record<string, unknown>);
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Find duplicate task within window
   */
  private findDuplicate(
    fingerprint: string,
    taskType: string,
    params: Record<string, unknown>
  ): TaskFingerprint | null {
    const cutoff = Date.now() - this.config.duplicateWindowMs;

    for (const [taskId, fp] of this.fingerprints) {
      // Skip old entries
      if (fp.timestamp < cutoff) continue;

      // Check exact fingerprint match
      if (fp.hash === fingerprint) {
        return fp;
      }

      // Check high similarity
      if (fp.taskType === taskType) {
        const similarity = this.calculateSimilarity(params, fp.params);
        if (similarity >= this.config.similarityThreshold) {
          return fp;
        }
      }
    }

    return null;
  }

  /**
   * Calculate parameter similarity (0-1)
   */
  private calculateSimilarity(
    params1: Record<string, unknown>,
    params2: Record<string, unknown>
  ): number {
    const keys1 = Object.keys(params1);
    const keys2 = Object.keys(params2);
    
    if (keys1.length === 0 && keys2.length === 0) return 1;
    if (keys1.length === 0 || keys2.length === 0) return 0;

    const allKeys = new Set([...keys1, ...keys2]);
    let matches = 0;

    for (const key of allKeys) {
      const val1 = params1[key];
      const val2 = params2[key];

      if (typeof val1 === typeof val2) {
        if (typeof val1 === 'number') {
          // Numeric similarity within 1%
          if (Math.abs((val1 as number) - (val2 as number)) / (val1 as number) < 0.01) {
            matches++;
          }
        } else if (JSON.stringify(val1) === JSON.stringify(val2)) {
          matches++;
        }
      }
    }

    return matches / allKeys.size;
  }

  /**
   * Find existing batch for coalescing
   */
  private findCoalescingBatch(
    taskType: string,
    params: Record<string, unknown>
  ): CoalescedBatch | null {
    const cutoff = Date.now() - this.config.coalesceWindowMs;

    for (const batch of this.pendingBatches.values()) {
      if (batch.taskType !== taskType) continue;
      if (batch.createdAt < cutoff) continue;
      if (batch.status !== 'pending') continue;
      if (batch.tasks.length >= this.config.maxBatchSize) continue;

      const similarity = this.calculateSimilarity(params, batch.params);
      if (similarity >= this.config.similarityThreshold) {
        return batch;
      }
    }

    return null;
  }

  /**
   * Create new coalescing batch
   */
  private createBatch(
    taskId: string,
    taskType: string,
    params: Record<string, unknown>
  ): CoalescedBatch {
    const batch: CoalescedBatch = {
      batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskType,
      tasks: [taskId],
      params,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.pendingBatches.set(batch.batchId, batch);

    // Auto-process batch after window expires
    setTimeout(() => {
      if (batch.status === 'pending' && batch.tasks.length > 0) {
        this.emit('batch_ready', {
          batchId: batch.batchId,
          taskIds: batch.tasks,
          taskType,
          params,
        });
      }
    }, this.config.coalesceWindowMs);

    return batch;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(taskType: string, params: Record<string, unknown>): string {
    const normalized = this.normalizeParams(params);
    return `${taskType}:${JSON.stringify(normalized)}`;
  }

  /**
   * Cache a result
   */
  private cacheResult(key: string, result: unknown, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.resultCache.size >= this.config.maxCacheSize) {
      const oldest = Array.from(this.resultCache.entries())
        .sort((a, b) => a[1].accessCount - b[1].accessCount)[0];
      if (oldest) {
        this.resultCache.delete(oldest[0]);
        this.stats.cacheEvictions++;
      }
    }

    this.resultCache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      accessCount: 0,
      ttl: ttl || this.config.cacheTtlMs,
    });
  }

  /**
   * Run cleanup of expired entries
   */
  private runCleanup(): void {
    const now = Date.now();
    const fingerprintCutoff = now - this.config.duplicateWindowMs;
    const cacheCutoff = now - this.config.cacheTtlMs;

    // Clean old fingerprints
    for (const [taskId, fp] of this.fingerprints) {
      if (fp.timestamp < fingerprintCutoff && fp.status === 'completed') {
        this.fingerprints.delete(taskId);
      }
    }

    // Clean expired cache entries
    for (const [key, entry] of this.resultCache) {
      if (now - entry.timestamp > entry.ttl) {
        this.resultCache.delete(key);
      }
    }

    // Clean old batches
    const batchCutoff = now - this.config.coalesceWindowMs * 2;
    for (const [batchId, batch] of this.pendingBatches) {
      if (batch.createdAt < batchCutoff) {
        this.pendingBatches.delete(batchId);
      }
    }

    logger.debug('TaskDeduplicator', {
      message: 'Cleanup completed',
      fingerprints: this.fingerprints.size,
      cacheEntries: this.resultCache.size,
      pendingBatches: this.pendingBatches.size,
    });
  }

  /**
   * Get statistics
   */
  getStats(): {
    duplicatesDetected: number;
    duplicatesEliminated: number;
    tasksCoalesced: number;
    batchesCreated: number;
    cacheHits: number;
    cacheMisses: number;
    cacheEvictions: number;
    computationSaved: number;
    currentFingerprints: number;
    currentBatches: number;
    currentCacheEntries: number;
  } {
    return {
      duplicatesDetected: this.stats.duplicatesDetected,
      duplicatesEliminated: this.stats.duplicatesEliminated,
      tasksCoalesced: this.stats.tasksCoalesced,
      batchesCreated: this.stats.batchesCreated,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheEvictions: this.stats.cacheEvictions,
      computationSaved: this.stats.computationSaved,
      currentFingerprints: this.fingerprints.size,
      currentBatches: this.pendingBatches.size,
      currentCacheEntries: this.resultCache.size,
    };
  }

  /**
   * Get deduplication report
   */
  getReport(): {
    efficiency: number; // 0-1
    estimatedSavings: string;
    topDuplicatedTasks: Array<{ taskType: string; count: number }>;
    cacheHitRate: number;
  } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheHitRate = total > 0 ? this.stats.cacheHits / total : 0;
    
    // Calculate efficiency
    const potentialDuplicates = this.stats.duplicatesDetected + this.stats.tasksCoalesced;
    const efficiency = potentialDuplicates > 0 
      ? (this.stats.duplicatesEliminated + this.stats.tasksCoalesced) / potentialDuplicates 
      : 0;

    // Top duplicated task types
    const taskTypeCounts = new Map<string, number>();
    for (const fp of this.fingerprints.values()) {
      const count = taskTypeCounts.get(fp.taskType) || 0;
      taskTypeCounts.set(fp.taskType, count + 1);
    }

    const topDuplicatedTasks = Array.from(taskTypeCounts.entries())
      .map(([taskType, count]) => ({ taskType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      efficiency,
      estimatedSavings: `${(this.stats.computationSaved / 1000).toFixed(1)}s`,
      topDuplicatedTasks,
      cacheHitRate,
    };
  }

  /**
   * Force immediate batch processing
   */
  forceBatchProcess(batchId: string): boolean {
    const batch = this.pendingBatches.get(batchId);
    if (!batch || batch.status !== 'pending') return false;

    this.emit('batch_ready', {
      batchId: batch.batchId,
      taskIds: batch.tasks,
      taskType: batch.taskType,
      params: batch.params,
      forced: true,
    });

    return true;
  }

  /**
   * Clear all caches and reset state
   */
  clear(): void {
    this.fingerprints.clear();
    this.pendingBatches.clear();
    this.resultCache.clear();
    
    logger.info('TaskDeduplicator', { message: 'All caches cleared' });
    this.emit('cleared');
  }
}

// Singleton export
let deduplicatorInstance: TaskDeduplicator | null = null;

export function getTaskDeduplicator(config?: Partial<DeduplicatorConfig>): TaskDeduplicator {
  if (!deduplicatorInstance) {
    deduplicatorInstance = new TaskDeduplicator(config);
  }
  return deduplicatorInstance;
}

export function resetTaskDeduplicator(): void {
  deduplicatorInstance = null;
}
