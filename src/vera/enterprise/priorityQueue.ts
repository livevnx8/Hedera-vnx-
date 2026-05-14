/**
 * Priority Queue Manager
 * P0-P3 message priority with preemptive scheduling
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

type PriorityLevel = 0 | 1 | 2 | 3; // P0 (highest) to P3 (lowest)

interface QueuedMessage {
  id: string;
  priority: PriorityLevel;
  tier: string;
  payload: any;
  timestamp: number;
  retryCount: number;
}

interface QueueStats {
  totalQueued: number;
  totalProcessed: number;
  avgWaitTimeMs: number;
  byPriority: Record<PriorityLevel, { queued: number; processed: number }>;
}

export class PriorityQueueManager extends EventEmitter {
  private queues: Map<PriorityLevel, QueuedMessage[]> = new Map();
  private processing = new Set<string>();
  private stats: QueueStats = {
    totalQueued: 0,
    totalProcessed: 0,
    avgWaitTimeMs: 0,
    byPriority: { 0: { queued: 0, processed: 0 }, 1: { queued: 0, processed: 0 }, 2: { queued: 0, processed: 0 }, 3: { queued: 0, processed: 0 } },
  };

  constructor(private maxConcurrent: number = 100) {
    super();
    // Initialize queues
    for (let i = 0; i <= 3; i++) {
      this.queues.set(i as PriorityLevel, []);
    }
  }

  /**
   * Queue a message with priority
   */
  queueMessage(
    payload: any,
    priority: PriorityLevel = 2,
    tier: string = 'basic'
  ): string {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const message: QueuedMessage = {
      id,
      priority,
      tier,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const queue = this.queues.get(priority)!;
    
    // Insert by tier priority within same level
    const insertIndex = queue.findIndex(m => this.getTierPriority(m.tier) > this.getTierPriority(tier));
    if (insertIndex === -1) {
      queue.push(message);
    } else {
      queue.splice(insertIndex, 0, message);
    }

    this.stats.totalQueued++;
    this.stats.byPriority[priority].queued++;

    logger.debug('PriorityQueue', {
      message: 'Message queued',
      id,
      priority: `P${priority}`,
      tier,
      queueDepth: queue.length,
    });

    this.emit('queued', { id, priority, tier });
    this.processNext();

    return id;
  }

  /**
   * Process next message(s)
   */
  private async processNext(): Promise<void> {
    if (this.processing.size >= this.maxConcurrent) return;

    // Find highest priority message
    let nextMessage: QueuedMessage | null = null;
    let nextPriority: PriorityLevel = 0;

    for (let p = 0; p <= 3; p++) {
      const queue = this.queues.get(p as PriorityLevel)!;
      if (queue.length > 0 && !this.processing.has(queue[0].id)) {
        nextMessage = queue[0];
        nextPriority = p as PriorityLevel;
        break;
      }
    }

    if (!nextMessage) return;

    this.processing.add(nextMessage.id);
    
    // Remove from queue
    const queue = this.queues.get(nextPriority)!;
    const index = queue.findIndex(m => m.id === nextMessage!.id);
    if (index > -1) queue.splice(index, 1);

    // Process
    const waitTime = Date.now() - nextMessage.timestamp;
    this.updateAvgWaitTime(waitTime);

    logger.debug('PriorityQueue', {
      message: 'Processing message',
      id: nextMessage.id,
      priority: `P${nextPriority}`,
      waitTimeMs: waitTime,
    });

    this.emit('processing', { id: nextMessage.id, priority: nextPriority, waitTime });

    // Simulate processing
    setTimeout(() => {
      this.processing.delete(nextMessage!.id);
      this.stats.totalProcessed++;
      this.stats.byPriority[nextPriority].processed++;
      
      this.emit('completed', { id: nextMessage!.id, priority: nextPriority });
      this.processNext(); // Process next
    }, 100);
  }

  private getTierPriority(tier: string): number {
    const priorities: Record<string, number> = {
      enterprise: 1,
      pro: 2,
      basic: 3,
    };
    return priorities[tier] || 3;
  }

  private updateAvgWaitTime(waitTime: number): void {
    const alpha = 0.1; // EMA factor
    this.stats.avgWaitTimeMs = 
      this.stats.avgWaitTimeMs * (1 - alpha) + waitTime * alpha;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats & { currentDepth: number; processing: number } {
    let currentDepth = 0;
    for (const queue of this.queues.values()) {
      currentDepth += queue.length;
    }

    return {
      ...this.stats,
      currentDepth,
      processing: this.processing.size,
    };
  }

  /**
   * Get queue depth by priority
   */
  getDepthByPriority(): Record<PriorityLevel, number> {
    return {
      0: this.queues.get(0)!.length,
      1: this.queues.get(1)!.length,
      2: this.queues.get(2)!.length,
      3: this.queues.get(3)!.length,
    };
  }

  /**
   * Apply backpressure to low priority when overloaded
   */
  applyBackpressure(): void {
    const stats = this.getStats();
    if (stats.currentDepth > this.maxConcurrent * 2) {
      // Drop P3 messages if queue is too deep
      const p3Queue = this.queues.get(3)!;
      const dropped = p3Queue.splice(0, Math.floor(p3Queue.length * 0.1));
      
      logger.warn('PriorityQueue', {
        message: 'Backpressure applied',
        dropped: dropped.length,
        remaining: p3Queue.length,
      });

      for (const msg of dropped) {
        this.emit('dropped', { id: msg.id, reason: 'backpressure' });
      }
    }
  }
}

export default PriorityQueueManager;
