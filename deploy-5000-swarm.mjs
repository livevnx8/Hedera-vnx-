#!/usr/bin/env node
/**
 * Deploy 5000 Agent Swarm
 * Master deployment script for distributed Vera Swarm
 */

import { 
  SwarmCoordinator5000, 
  AgentTemplateFactory,
  SHARD_CONFIG 
} from '../agents/vera-swarm-coordinator-5000.mjs';
import { SwarmHealthMonitor } from '../agents/vera-health-monitor-5000.mjs';
import { FalconSignature } from '../agents/vera-qvx-falcon-handshake.mjs';
import dotenv from 'dotenv';

dotenv.config();

class SwarmDeployment5000 {
  constructor() {
    this.coordinator = null;
    this.healthMonitor = null;
    this.falcon = new FalconSignature();
    this.deploymentStats = {
      startTime: null,
      endTime: null,
      agentsDeployed: 0,
      shardsInitialized: 0,
      errors: []
    };
  }

  async initialize() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🚀 VERA SWARM DEPLOYMENT - 5000 AGENTS                        ║
║  Distributed Multi-Shard Architecture                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Target: 5,000 agents across 50 shards                         ║
║  Regions: 5 (US-East, US-West, EU-West, AP-South, Global)     ║
║  Agent Types: 50 (100 instances each)                         ║
║  Security: Falcon-512 signed deployment                        ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    await this.falcon.initialize();
    
    // Initialize coordinator
    this.coordinator = new SwarmCoordinator5000();
    await this.coordinator.initialize();
    
    // Initialize health monitor
    this.healthMonitor = new SwarmHealthMonitor(this.coordinator);
    await this.healthMonitor.initialize();
    
    // Link health monitor to coordinator
    this.coordinator.on('metrics', (metrics) => {
      this.healthMonitor.emit('coordinatorMetrics', metrics);
    });
  }

  async deploy() {
    this.deploymentStats.startTime = Date.now();
    
    try {
      // Start health monitoring
      this.healthMonitor.run();
      
      // Deploy swarm
      await this.coordinator.run();
      
      this.deploymentStats.endTime = Date.now();
      this.deploymentStats.agentsDeployed = this.coordinator.metrics.totalAgents;
      this.deploymentStats.shardsInitialized = this.coordinator.shards.size;
      
      this.printDeploymentSummary();
      this.startPostDeploymentMonitoring();
      
    } catch (error) {
      this.deploymentStats.errors.push({
        phase: 'deployment',
        error: error.message,
        timestamp: Date.now()
      });
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  printDeploymentSummary() {
    const duration = ((this.deploymentStats.endTime - this.deploymentStats.startTime) / 1000).toFixed(1);
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ✅ DEPLOYMENT COMPLETE                                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Agents: ${this.deploymentStats.agentsDeployed.toString().padEnd(45)} ║
║  Shards: ${this.deploymentStats.shardsInitialized.toString().padEnd(50)} ║
║  Regions: 5                                                    ║
║  Agent Types: 50                                               ║
║  Deployment Time: ${duration}s${''.padEnd(42)} ║
╠═══════════════════════════════════════════════════════════════╣
║  Breakdown by Vertical:                                       ║
║    🏥 Healthcare: 1,000 agents (10 types)                     ║
║    💰 Finance: 1,000 agents (10 types)                        ║
║    🚛 Logistics: 1,000 agents (10 types)                      ║
║    🏛️ Government: 500 agents (5 types)                        ║
║    🏪 Retail: 500 agents (5 types)                           ║
║    🔒 Security: 500 agents (5 types)                         ║
║    ⚡ Energy: 500 agents (5 types)                           ║
╠═══════════════════════════════════════════════════════════════╣
║  Monitoring:                                                   ║
║    • Health checks every 30 seconds                           ║
║    • Auto-recovery enabled                                     ║
║    • Falcon-512 signed metrics                                 ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  startPostDeploymentMonitoring() {
    // Real-time stats every minute
    setInterval(() => {
      const metrics = this.coordinator.getSwarmMetrics();
      const health = this.healthMonitor.getHealthDashboard();
      
      console.log(`
📊 LIVE STATS: ${metrics.totalAgents} agents | ${metrics.messagesRouted} msgs | Health: ${health.current?.healthRate || 'N/A'}
      `);
    }, 60000);

    console.log('\n🔍 Post-deployment monitoring active');
    console.log('   Press Ctrl+C to stop\n');
  }

  async shutdown() {
    console.log('\n🛑 Shutting down swarm...');
    
    // Graceful shutdown
    for (const [shardId, shard] of this.coordinator.shards) {
      shard.isActive = false;
      console.log(`  Stopped shard ${shardId}`);
    }
    
    console.log('✅ Swarm shutdown complete');
  }
}

// Run deployment
const deployment = new SwarmDeployment5000();

deployment.initialize()
  .then(() => deployment.deploy())
  .catch(error => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  await deployment.shutdown();
  process.exit(0);
});

export { SwarmDeployment5000 };
