#!/usr/bin/env node
/**
 * AdaptiveScheduler - Dynamic interval management
 * Adjusts agent cycle frequency based on data volatility
 * Phase 3 Implementation
 */

export class AdaptiveScheduler {
  constructor(config = {}) {
    this.baseInterval = config.baseInterval || 300000; // 5 min default
    this.minInterval = config.minInterval || 60000;      // 1 min minimum
    this.maxInterval = config.maxInterval || 900000;     // 15 min maximum
    
    // Volatility thresholds
    this.volatilityThresholds = {
      low: 0.05,      // 5% change
      medium: 0.15,   // 15% change
      high: 0.30      // 30% change
    };
    
    this.history = [];
    this.maxHistory = 10;
    this.currentInterval = this.baseInterval;
  }
  
  /**
   * Calculate data volatility
   * @param {Array<number>} dataPoints - Recent data values
   * @returns {number} Volatility score (0-1)
   */
  calculateVolatility(dataPoints) {
    if (dataPoints.length < 2) return 0;
    
    // Calculate coefficient of variation
    const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const variance = dataPoints.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / dataPoints.length;
    const stdDev = Math.sqrt(variance);
    
    return mean > 0 ? stdDev / mean : 0;
  }
  
  /**
   * Determine next optimal interval based on recent activity
   * @param {Object} metrics - Recent agent metrics
   * @returns {number} Recommended interval in ms
   */
  getNextInterval(metrics) {
    const { volatility, errorRate, anomalyCount } = metrics;
    
    // Base adjustment on volatility
    let interval = this.baseInterval;
    
    if (volatility > this.volatilityThresholds.high || errorRate > 0.1) {
      // High volatility - increase monitoring
      interval = this.minInterval;
    } else if (volatility > this.volatilityThresholds.medium || anomalyCount > 0) {
      // Medium volatility - moderate increase
      interval = Math.max(this.minInterval, this.baseInterval * 0.5);
    } else if (volatility < this.volatilityThresholds.low && errorRate === 0) {
      // Low volatility, no errors - can relax
      interval = Math.min(this.maxInterval, this.baseInterval * 1.5);
    }
    
    this.currentInterval = interval;
    this._addToHistory({ timestamp: Date.now(), interval, metrics });
    
    return interval;
  }
  
  /**
   * Get current schedule recommendation
   */
  getSchedule() {
    return {
      currentInterval: this.currentInterval,
      nextRun: Date.now() + this.currentInterval,
      history: this.history.slice(-5),
      isAdaptive: true
    };
  }
  
  _addToHistory(entry) {
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
  
  /**
   * Get statistics about scheduling decisions
   */
  getStats() {
    const intervals = this.history.map(h => h.interval);
    return {
      avgInterval: intervals.reduce((a, b) => a + b, 0) / intervals.length,
      minIntervalUsed: Math.min(...intervals),
      maxIntervalUsed: Math.max(...intervals),
      totalAdjustments: this.history.length,
      currentMode: this._getMode()
    };
  }
  
  _getMode() {
    if (this.currentInterval <= this.minInterval * 1.1) return 'HIGH_ALERT';
    if (this.currentInterval >= this.maxInterval * 0.9) return 'ECONOMY';
    return 'BALANCED';
  }
}

/**
 * PriorityQueue - Task scheduling with priorities
 */
export class PriorityQueue {
  constructor() {
    this.tasks = [];
    this.processing = false;
  }
  
  /**
   * Add task to queue
   * @param {Object} task - Task to queue
   * @param {number} priority - Priority (1 = highest, 10 = lowest)
   */
  enqueue(task, priority = 5) {
    const item = {
      task,
      priority,
      enqueuedAt: Date.now(),
      id: Math.random().toString(36).substring(7)
    };
    
    // Insert by priority
    const index = this.tasks.findIndex(t => t.priority > priority);
    if (index === -1) {
      this.tasks.push(item);
    } else {
      this.tasks.splice(index, 0, item);
    }
    
    return item.id;
  }
  
  dequeue() {
    return this.tasks.shift();
  }
  
  peek() {
    return this.tasks[0];
  }
  
  get length() {
    return this.tasks.length;
  }
  
  /**
   * Process all tasks with a handler
   * @param {Function} handler - Async function to process tasks
   */
  async processAll(handler) {
    if (this.processing) return;
    this.processing = true;
    
    while (this.tasks.length > 0) {
      const item = this.dequeue();
      try {
        await handler(item.task, item);
      } catch (error) {
        console.error(`Task ${item.id} failed:`, error.message);
      }
    }
    
    this.processing = false;
  }
}

/**
 * CircuitBreaker - Prevents cascade failures
 */
export class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = 0;
  }
  
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }
  
  _onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  _onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
  
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.failureThreshold,
      canExecute: this.state !== 'OPEN' || Date.now() >= this.nextAttempt
    };
  }
}

// Domain-specific schedulers
export const DomainSchedulers = {
  energy: new AdaptiveScheduler({
    baseInterval: 180000,  // 3 min
    minInterval: 60000,    // 1 min
    maxInterval: 300000    // 5 min
  }),
  
  defi: new AdaptiveScheduler({
    baseInterval: 300000,  // 5 min
    minInterval: 60000,    // 1 min
    maxInterval: 600000   // 10 min
  }),
  
  security: new AdaptiveScheduler({
    baseInterval: 120000,  // 2 min
    minInterval: 30000,    // 30 sec
    maxInterval: 300000   // 5 min
  }),
  
  carbon: new AdaptiveScheduler({
    baseInterval: 300000,  // 5 min
    minInterval: 120000,   // 2 min
    maxInterval: 600000   // 10 min
  })
};

export default {
  AdaptiveScheduler,
  PriorityQueue,
  CircuitBreaker,
  DomainSchedulers
};
