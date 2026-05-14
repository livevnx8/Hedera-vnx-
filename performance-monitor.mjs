/**
 * Vera Performance Monitor
 * Real-time metrics collection and alerting
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      hcsMessages: 0,
      startTime: Date.now()
    };
    this.thresholds = {
      responseTime: 500, // ms
      errorRate: 0.05,   // 5%
      memoryUsage: 0.8   // 80%
    };
    this.alerts = [];
  }

  recordRequest(duration, error = false) {
    this.metrics.requests++;
    this.metrics.responseTimes.push(duration);

    // Keep last 1000 response times
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }

    if (error) {
      this.metrics.errors++;
    }

    // Check thresholds
    if (duration > this.thresholds.responseTime) {
      this.alert(`Slow response: ${duration}ms`);
    }

    const errorRate = this.metrics.errors / this.metrics.requests;
    if (errorRate > this.thresholds.errorRate) {
      this.alert(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
    }
  }

  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  recordHCSMessage() {
    this.metrics.hcsMessages++;
  }

  alert(message) {
    const alert = {
      timestamp: Date.now(),
      message,
      severity: 'warning'
    };
    this.alerts.push(alert);
    console.warn(`⚠️ ALERT: ${message}`);

    // Keep last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  getStats() {
    const responseTimes = this.metrics.responseTimes;
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = cacheTotal > 0
      ? (this.metrics.cacheHits / cacheTotal * 100).toFixed(2)
      : 0;

    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: this.metrics.requests > 0
        ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) + '%'
        : '0%',
      avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
      cacheHitRate: cacheHitRate + '%',
      hcsMessages: this.metrics.hcsMessages,
      uptime: ((Date.now() - this.metrics.startTime) / 1000).toFixed(0) + 's',
      alerts: this.alerts.slice(-5)
    };
  }

  async saveReport() {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };

    const logFile = `/mnt/vera-mirror-shards/vera-lattice/logs/performance-${Date.now()}.json`;
    await fs.writeFile(logFile, JSON.stringify(report, null, 2));
  }
}

const monitor = new PerformanceMonitor();

// Periodic reporting
setInterval(() => {
  const stats = monitor.getStats();
  console.log('📊 Performance:', JSON.stringify(stats, null, 2));
}, 60000); // Every minute

export { monitor, PerformanceMonitor };
