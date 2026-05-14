/**
 * Health Check System
 * 
 * Provides health endpoints for monitoring agent and system status
 */

import { getLogRotator } from '../utils/logRotation.mjs';

class HealthCheck {
  constructor() {
    this.checks = new Map();
    this.startTime = Date.now();
  }

  /**
   * Register a health check
   */
  register(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * Run all health checks
   */
  async runChecks() {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {}
    };

    let hasFailure = false;

    for (const [name, checkFn] of this.checks) {
      try {
        const result = await checkFn();
        results.checks[name] = {
          status: result.healthy ? 'pass' : 'fail',
          ...result
        };
        
        if (!result.healthy) {
          hasFailure = true;
        }
      } catch (error) {
        results.checks[name] = {
          status: 'error',
          error: error.message
        };
        hasFailure = true;
      }
    }

    results.status = hasFailure ? 'degraded' : 'healthy';
    
    return results;
  }

  /**
   * Get simple health status
   */
  async getStatus() {
    const checks = await this.runChecks();
    return {
      status: checks.status,
      uptime: checks.uptime
    };
  }
}

// Create singleton
const healthCheck = new HealthCheck();

// Register default checks
healthCheck.register('system', async () => ({
  healthy: true,
  memory: process.memoryUsage(),
  pid: process.pid
}));

healthCheck.register('logs', async () => {
  const rotator = getLogRotator('./logs');
  const stats = await rotator.getStats();
  
  // Alert if any log file > 50MB
  const largeFiles = stats.files.filter(f => parseFloat(f.sizeMB) > 50);
  
  return {
    healthy: largeFiles.length === 0,
    totalFiles: stats.totalFiles,
    totalSizeMB: stats.totalSizeMB,
    largeFiles: largeFiles.length
  };
});

export { HealthCheck, healthCheck };
export default healthCheck;
