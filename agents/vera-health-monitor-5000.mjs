#!/usr/bin/env node
/**
 * Vera Swarm Health Monitor - 5000 Agent Scale
 * Distributed health monitoring, auto-recovery, and alerting
 */

import { EventEmitter } from 'events';
import { Client, TopicMessageSubmitTransaction, TopicMessageQuery } from '@hashgraph/sdk';
import { FalconSignature } from '../agents/vera-qvx-falcon-handshake.mjs';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// HEALTH MONITOR FOR 5000 AGENTS
// ============================================
class SwarmHealthMonitor extends EventEmitter {
  constructor(coordinator) {
    super();
    this.coordinator = coordinator;
    this.healthData = new Map(); // agentId -> health status
    this.shardHealth = new Map(); // shardId -> health
    this.alertThresholds = {
      maxResponseTime: 5000,    // 5 seconds
      minHeartbeatRate: 0.9,    // 90% of agents must heartbeat
      maxErrorRate: 0.05,       // 5% error rate threshold
      cpuThreshold: 80,         // 80% CPU
      memoryThreshold: 85       // 85% memory
    };
    this.alerts = [];
    this.recoveryQueue = [];
    this.falcon = new FalconSignature();
  }

  async initialize() {
    await this.falcon.initialize();
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🏥 SWARM HEALTH MONITOR - 5000 AGENTS                        ║
║  Distributed Health Tracking & Auto-Recovery                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Monitoring: All 50 shards, 5000 agents                       ║
║  Check Interval: 30 seconds                                   ║
║  Auto-Recovery: Enabled                                       ║
║  Falcon Signing: Enabled                                      ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  startMonitoring() {
    // Health check every 30 seconds
    setInterval(() => this.runHealthCheck(), 30000);
    
    // Recovery check every minute
    setInterval(() => this.processRecoveryQueue(), 60000);
    
    // Alert aggregation every 5 minutes
    setInterval(() => this.reportAlertSummary(), 300000);
    
    console.log('🔍 Health monitoring started');
  }

  async runHealthCheck() {
    const startTime = Date.now();
    const metrics = this.coordinator.getSwarmMetrics();
    
    let healthyAgents = 0;
    let degradedAgents = 0;
    let failedAgents = 0;
    let totalResponseTime = 0;
    
    // Check each shard
    for (const [shardId, shard] of this.coordinator.shards) {
      const shardHealth = await this.checkShardHealth(shard);
      this.shardHealth.set(shardId, shardHealth);
      
      healthyAgents += shardHealth.healthy;
      degradedAgents += shardHealth.degraded;
      failedAgents += shardHealth.failed;
      totalResponseTime += shardHealth.avgResponseTime;
    }
    
    const totalChecked = healthyAgents + degradedAgents + failedAgents;
    const healthRate = totalChecked > 0 ? (healthyAgents / totalChecked) : 0;
    const avgResponseTime = totalChecked > 0 ? (totalResponseTime / this.coordinator.shards.size) : 0;
    
    // Store health snapshot
    const healthSnapshot = {
      timestamp: Date.now(),
      checkDuration: Date.now() - startTime,
      totalAgents: totalChecked,
      healthy: healthyAgents,
      degraded: degradedAgents,
      failed: failedAgents,
      healthRate: (healthRate * 100).toFixed(2) + '%',
      avgResponseTime: avgResponseTime.toFixed(0) + 'ms',
      alerts: []
    };

    // Check thresholds and generate alerts
    if (healthRate < this.alertThresholds.minHeartbeatRate) {
      const alert = {
        severity: 'critical',
        type: 'LOW_HEALTH_RATE',
        message: `Only ${(healthRate * 100).toFixed(1)}% of agents are healthy (threshold: ${this.alertThresholds.minHeartbeatRate * 100}%)`,
        timestamp: Date.now(),
        affectedAgents: degradedAgents + failedAgents
      };
      this.alerts.push(alert);
      healthSnapshot.alerts.push(alert);
      this.emit('critical', alert);
    }

    if (avgResponseTime > this.alertThresholds.maxResponseTime) {
      const alert = {
        severity: 'warning',
        type: 'HIGH_LATENCY',
        message: `Average response time ${avgResponseTime.toFixed(0)}ms exceeds threshold ${this.alertThresholds.maxResponseTime}ms`,
        timestamp: Date.now()
      };
      this.alerts.push(alert);
      healthSnapshot.alerts.push(alert);
    }

    // Store and emit
    this.healthData.set(Date.now(), healthSnapshot);
    this.emit('healthCheck', healthSnapshot);

    // Report to HCS (every 5th check = 2.5 minutes)
    if (Object.keys(this.healthData).length % 5 === 0) {
      await this.reportToHCS(healthSnapshot);
    }

    // Trigger recovery for failed agents
    if (failedAgents > 0) {
      this.queueRecovery(failedAgents);
    }

    return healthSnapshot;
  }

  async checkShardHealth(shard) {
    const startTime = Date.now();
    let healthy = 0;
    let degraded = 0;
    let failed = 0;
    let totalResponseTime = 0;

    // Sample check 10% of agents in shard
    const agents = Array.from(shard.agents.values());
    const sampleSize = Math.max(1, Math.floor(agents.length * 0.1));
    const sample = agents.slice(0, sampleSize);

    for (const agent of sample) {
      const checkStart = Date.now();
      const status = await this.checkAgentHealth(agent);
      const responseTime = Date.now() - checkStart;
      totalResponseTime += responseTime;

      // Update agent status
      agent.lastHealthCheck = Date.now();
      agent.responseTime = responseTime;

      if (status === 'healthy') {
        healthy++;
        agent.healthStatus = 'healthy';
      } else if (status === 'degraded') {
        degraded++;
        agent.healthStatus = 'degraded';
        
        // Check if agent needs restart
        if (agent.consecutiveFailures > 3) {
          this.recoveryQueue.push({
            agentId: agent.id,
            shardId: shard.shardId,
            action: 'restart',
            priority: 'high'
          });
        }
      } else {
        failed++;
        agent.healthStatus = 'failed';
        agent.consecutiveFailures = (agent.consecutiveFailures || 0) + 1;
      }
    }

    // Scale up to full shard
    const scaleFactor = agents.length / sampleSize;
    
    return {
      shardId: shard.shardId,
      healthy: Math.floor(healthy * scaleFactor),
      degraded: Math.floor(degraded * scaleFactor),
      failed: Math.floor(failed * scaleFactor),
      avgResponseTime: totalResponseTime / sampleSize,
      checkDuration: Date.now() - startTime,
      timestamp: Date.now()
    };
  }

  async checkAgentHealth(agent) {
    // Simulate health check
    const now = Date.now();
    const lastHeartbeat = agent.lastHeartbeat || agent.spawnTime;
    const heartbeatAge = now - lastHeartbeat;
    
    // Check heartbeat freshness (should be < 2 minutes)
    if (heartbeatAge > 120000) {
      return 'failed';
    }
    
    // Check if agent has been processing messages
    if (agent.messageCount === 0 && (now - agent.spawnTime) > 300000) {
      return 'degraded';
    }
    
    // Simulate random issues (1% failure rate)
    if (Math.random() < 0.01) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  queueRecovery(failedCount) {
    for (let i = 0; i < Math.min(failedCount, 10); i++) {
      this.recoveryQueue.push({
        action: 'spawn_replacement',
        priority: 'medium',
        timestamp: Date.now()
      });
    }
    
    console.log(`⚠️ Queued ${failedCount} agents for recovery`);
  }

  async processRecoveryQueue() {
    if (this.recoveryQueue.length === 0) return;
    
    const toProcess = this.recoveryQueue.splice(0, 5); // Process 5 at a time
    console.log(`🔄 Processing ${toProcess.length} recovery tasks...`);
    
    for (const task of toProcess) {
      try {
        // In production, this would actually respawn agents
        await this.recoverAgent(task);
      } catch (error) {
        console.error(`❌ Recovery failed for ${task.agentId || 'new agent'}:`, error.message);
      }
    }
  }

  async recoverAgent(task) {
    // Simulate recovery
    await new Promise(r => setTimeout(r, 100));
    
    this.emit('recovery', {
      task,
      success: true,
      timestamp: Date.now()
    });
  }

  async reportToHCS(healthSnapshot) {
    try {
      // Sign health report with Falcon
      const falconKey = await this.falcon.generateKeypair('health-monitor');
      const signature = await this.falcon.sign(healthSnapshot, falconKey.privateKey);
      
      const report = {
        type: 'SWARM_HEALTH_REPORT',
        ...healthSnapshot,
        _falcon: {
          signature: signature.signature,
          publicKey: falconKey.publicKey,
          algorithm: 'Falcon-512'
        }
      };

      console.log('📊 Health report signed and ready for HCS');
      this.emit('hcsReport', report);
    } catch (error) {
      console.error('❌ Failed to sign health report:', error.message);
    }
  }

  reportAlertSummary() {
    const recentAlerts = this.alerts.filter(
      a => Date.now() - a.timestamp < 300000
    );
    
    if (recentAlerts.length === 0) {
      console.log('✅ No alerts in last 5 minutes');
      return;
    }
    
    const critical = recentAlerts.filter(a => a.severity === 'critical').length;
    const warnings = recentAlerts.filter(a => a.severity === 'warning').length;
    
    console.log(`\n⚠️ Alert Summary (last 5min): ${critical} critical, ${warnings} warnings`);
    
    // Clear old alerts
    this.alerts = this.alerts.filter(
      a => Date.now() - a.timestamp < 3600000 // Keep 1 hour
    );
  }

  getHealthDashboard() {
    const latest = Array.from(this.healthData.values()).pop();
    
    return {
      current: latest,
      history: Array.from(this.healthData.values()).slice(-20),
      shards: Array.from(this.shardHealth.values()),
      alerts: this.alerts.slice(-10),
      pendingRecoveries: this.recoveryQueue.length
    };
  }

  async run() {
    await this.initialize();
    this.startMonitoring();
    
    console.log('🏥 Health Monitor running');
  }
}

// Export
export { SwarmHealthMonitor };

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  // This would normally receive the coordinator instance
  console.log('Usage: Import SwarmHealthMonitor and pass coordinator instance');
}
