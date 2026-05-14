import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimiterConfig {
  maxPerSecond: number;     // Hedera limit is 100 msg/s/topic
  burstAllowance: number;   // extra messages allowed in burst
  backpressureMs: number;   // delay when over limit
}

export interface RateLimiterStats {
  topicId: string;
  windowMessages: number;
  totalAllowed: number;
  totalThrottled: number;
  queueDepth: number;
}

interface QueuedMessage {
  resolve: () => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
}

// ─── Per-Topic Rate Limiter ──────────────────────────────────────────────────

class TopicRateLimiter {
  private readonly topicId: string;
  private readonly maxPerSecond: number;
  private readonly burstAllowance: number;
  private readonly backpressureMs: number;

  private windowStart = Date.now();
  private windowCount = 0;
  private totalAllowed = 0;
  private totalThrottled = 0;
  private queue: QueuedMessage[] = [];
  private drainTimer: NodeJS.Timeout | null = null;

  constructor(topicId: string, config: RateLimiterConfig) {
    this.topicId = topicId;
    this.maxPerSecond = config.maxPerSecond;
    this.burstAllowance = config.burstAllowance;
    this.backpressureMs = config.backpressureMs;
  }

  /**
   * Wait until a message can be sent. Resolves immediately if under limit,
   * otherwise queues and resolves when a slot opens.
   */
  async acquire(): Promise<void> {
    this.refreshWindow();

    const limit = this.maxPerSecond + this.burstAllowance;
    if (this.windowCount < limit) {
      this.windowCount++;
      this.totalAllowed++;
      return;
    }

    // Over limit — queue with backpressure
    this.totalThrottled++;
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject, enqueuedAt: Date.now() });
      this.ensureDrain();
    });
  }

  private refreshWindow(): void {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
  }

  private ensureDrain(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => {
      this.refreshWindow();

      const limit = this.maxPerSecond + this.burstAllowance;
      while (this.queue.length > 0 && this.windowCount < limit) {
        const item = this.queue.shift()!;
        this.windowCount++;
        this.totalAllowed++;
        item.resolve();
      }

      // Expire old queued items (> 30s)
      const now = Date.now();
      while (this.queue.length > 0 && now - this.queue[0].enqueuedAt > 30_000) {
        const item = this.queue.shift()!;
        item.reject(new Error('Rate limiter queue timeout'));
      }

      if (this.queue.length === 0 && this.drainTimer) {
        clearInterval(this.drainTimer);
        this.drainTimer = null;
      }
    }, this.backpressureMs);
  }

  getStats(): RateLimiterStats {
    return {
      topicId: this.topicId,
      windowMessages: this.windowCount,
      totalAllowed: this.totalAllowed,
      totalThrottled: this.totalThrottled,
      queueDepth: this.queue.length,
    };
  }

  shutdown(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    // Reject remaining
    for (const item of this.queue) {
      item.reject(new Error('Rate limiter shutdown'));
    }
    this.queue = [];
  }
}

// ─── Global Rate Limiter Registry ────────────────────────────────────────────

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxPerSecond: 80,      // stay under Hedera's 100/s with margin
  burstAllowance: 15,
  backpressureMs: 100,
};

export class RateLimiterRegistry {
  private limiters = new Map<string, TopicRateLimiter>();
  private config: RateLimiterConfig;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Acquire a send slot for a topic. Creates limiter on first use.
   */
  async acquire(topicId: string): Promise<void> {
    let limiter = this.limiters.get(topicId);
    if (!limiter) {
      limiter = new TopicRateLimiter(topicId, this.config);
      this.limiters.set(topicId, limiter);
    }
    return limiter.acquire();
  }

  getStats(): RateLimiterStats[] {
    return Array.from(this.limiters.values()).map((l) => l.getStats());
  }

  shutdown(): void {
    for (const limiter of this.limiters.values()) {
      limiter.shutdown();
    }
    this.limiters.clear();
    logger.info('RateLimiterRegistry', { message: 'All rate limiters shutdown' });
  }
}

export const rateLimiterRegistry = new RateLimiterRegistry();
