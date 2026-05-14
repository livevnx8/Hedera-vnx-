/**
 * Complete Multi-Variant Swarm System
 * 
 * Integrates all components:
 * - Multi-variant swarm orchestrator (Micro, Normal, Macro)
 * - Hedera tool integration
 * - Monitoring & metrics
 * - Auto-scaling
 * - Lattice relay
 */

import { HederaIntegratedSwarm } from './hederaIntegratedSwarm.js';
import { SwarmMonitor } from './swarmMonitor.js';
import { SwarmAutoScaler } from './swarmAutoScaler.js';
import { BaseSwarmAgent } from './baseSwarmAgent.js';
import { HederaToolAgent } from './hederaToolAgent.js';
import { logger } from '../../monitoring/logger.js';

export class CompleteMultiVariantSystem {
  public swarm: HederaIntegratedSwarm;
  public monitor: SwarmMonitor;
  public autoScaler: SwarmAutoScaler;
  private isRunning: boolean = false;

  constructor() {
    this.swarm = new HederaIntegratedSwarm({
      enableHederaTools: true,
      hederaToolDistribution: {
        micro: 30,
        normal: 60,
        macro: 90
      }
    });
    
    this.monitor = new SwarmMonitor();
    this.autoScaler = new SwarmAutoScaler(this.monitor);

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for integration
   */
  private setupEventHandlers(): void {
    // Handle auto-scaling events
    this.autoScaler.on('scaleUp', ({ swarmClass, count, reason }) => {
      logger.info('CompleteMultiVariantSystem', {
        swarmClass,
        count,
        reason,
        message: 'Auto-scaling up'
      });

      // Execute scaling
      this.executeScaleUp(swarmClass, count);
    });

    this.autoScaler.on('scaleDown', ({ swarmClass, count, reason }) => {
      logger.info('CompleteMultiVariantSystem', {
        swarmClass,
        count,
        reason,
        message: 'Auto-scaling down'
      });

      // Execute scaling
      this.executeScaleDown(swarmClass, count);
    });

    // Handle monitoring alerts
    this.monitor.on('alert', (alert) => {
      logger.warn('CompleteMultiVariantSystem', {
        severity: alert.severity,
        message: alert.message,
        swarmClass: alert.swarmClass
      });

      // Auto-scale on critical alerts
      if (alert.severity === 'critical') {
        this.autoScaler.forceScaleUp(alert.swarmClass, 10);
      }
    });
  }

  /**
   * Initialize the complete system
   */
  async initialize(): Promise<void> {
    logger.info('CompleteMultiVariantSystem', { message: 'Initializing...' });

    // Initialize swarm
    await this.swarm.initialize();

    // Start monitoring - use public methods to get agents
    const allAgents = new Map<string, BaseSwarmAgent>([
      ...Array.from(this.swarm.getAgentsByClass('micro')).map(a => [a.getId(), a] as [string, BaseSwarmAgent]),
      ...Array.from(this.swarm.getAgentsByClass('normal')).map(a => [a.getId(), a] as [string, BaseSwarmAgent]),
      ...Array.from(this.swarm.getAgentsByClass('macro')).map(a => [a.getId(), a] as [string, BaseSwarmAgent])
    ]);
    const hederaAgents = (this.swarm as any).getAllHederaAgents?.() || new Map<string, HederaToolAgent>();
    this.monitor.start(allAgents, hederaAgents);

    // Start auto-scaling
    this.autoScaler.start();

    this.isRunning = true;

    logger.info('CompleteMultiVariantSystem', {
      swarmAgents: allAgents.size,
      hederaAgents: hederaAgents.size,
      message: 'System initialized'
    });
  }

  /**
   * Execute scale up
   */
  private async executeScaleUp(swarmClass: string, count: number): Promise<void> {
    switch (swarmClass) {
      case 'micro':
        await this.swarm.spawnMicroSwarm(count);
        break;
      case 'normal':
        await this.swarm.spawnNormalSwarm(count);
        break;
      case 'macro':
        await this.swarm.spawnMacroSwarm(count);
        break;
    }

    // Update monitor with new agents
    const updatedAgents = new Map<string, BaseSwarmAgent>([
      ...Array.from(this.swarm.getAgentsByClass('micro')).map(a => [a.getId(), a] as [string, BaseSwarmAgent]),
      ...Array.from(this.swarm.getAgentsByClass('normal')).map(a => [a.getId(), a] as [string, BaseSwarmAgent]),
      ...Array.from(this.swarm.getAgentsByClass('macro')).map(a => [a.getId(), a] as [string, BaseSwarmAgent])
    ]);
    const updatedHederaAgents = (this.swarm as any).getAllHederaAgents?.() || new Map<string, HederaToolAgent>();
    this.monitor.start(updatedAgents, updatedHederaAgents);
  }

  /**
   * Execute scale down
   */
  private executeScaleDown(swarmClass: string, count: number): void {
    // Get agents of the specified class
    const agents = this.swarm.getAgentsByClass(swarmClass as any);
    
    // Remove idle agents first
    const idleAgents = agents
      .filter((a: any) => a.getStatus() === 'idle')
      .slice(0, count);

    for (const agent of idleAgents) {
      (agent as any).shutdown();
      (this.swarm as any).agents?.delete(agent.getId());
    }

    logger.info('CompleteMultiVariantSystem', {
      swarmClass,
      removed: idleAgents.length,
      message: 'Scaled down'
    });
  }

  /**
   * Get complete system status
   */
  getSystemStatus(): {
    isRunning: boolean;
    swarm: ReturnType<HederaIntegratedSwarm['getHederaStats']>;
    health: ReturnType<SwarmMonitor['getSystemHealth']>;
    scaling: ReturnType<SwarmAutoScaler['getStats']>;
  } {
    return {
      isRunning: this.isRunning,
      swarm: this.swarm.getHederaStats(),
      health: this.monitor.getSystemHealth(),
      scaling: this.autoScaler.getStats()
    };
  }

  /**
   * Print comprehensive status
   */
  printCompleteStatus(): void {
    console.log('\n🌟 COMPLETE MULTI-VARIANT SWARM SYSTEM');
    console.log('=======================================\n');
    
    const status = this.getSystemStatus();
    
    // System overview
    console.log(`Status: ${status.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
    console.log(`Total Agents: ${status.swarm.totalAgents}`);
    console.log(`Hedera Agents: ${status.swarm.hedera.totalAgents}`);
    
    // Health
    const health = status.health;
    const healthEmoji = health.status === 'healthy' ? '💚' : 
                        health.status === 'degraded' ? '💛' : '❤️';
    console.log(`\n${healthEmoji} System Health: ${health.status.toUpperCase()}`);
    console.log(`   Agents: ${health.healthyAgents}/${health.totalAgents} healthy`);
    
    if (health.issues.length > 0) {
      console.log('   Issues:');
      health.issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
    }

    // Swarm breakdown
    console.log('\n📊 Swarm Classes:');
    const byClass = status.swarm.byClass as Record<string, { count: number; healthy: number }>;
    for (const [swarmClass, metrics] of Object.entries(byClass)) {
      const classHealth = metrics.healthy > 0 ? '✅' : '❌';
      console.log(`   ${classHealth} ${swarmClass.toUpperCase()}: ${metrics.count} agents (${metrics.healthy} healthy)`);
    }

    // Hedera stats
    console.log('\n🔗 Hedera Integration:');
    console.log(`   Executions: ${status.swarm.hedera.totalExecutions}`);
    console.log(`   Success Rate: ${status.swarm.hedera.successRate}`);
    console.log(`   Avg Time: ${status.swarm.hedera.averageExecutionTime}ms`);

    // Auto-scaling
    console.log('\n📈 Auto-Scaling:');
    console.log(`   Running: ${status.scaling.isRunning ? '✅' : '❌'}`);
    for (const [swarmClass, policy] of Object.entries(status.scaling.policies)) {
      console.log(`   ${swarmClass.toUpperCase()}: ${policy.minAgents}-${policy.maxAgents} agents`);
    }

    console.log('\n=======================================\n');
  }

  /**
   * Shutdown complete system
   */
  async shutdown(): Promise<void> {
    logger.info('CompleteMultiVariantSystem', { message: 'Shutting down...' });

    this.isRunning = false;

    // Stop auto-scaling
    this.autoScaler.stop();

    // Stop monitoring
    this.monitor.stop();

    // Shutdown swarm
    await this.swarm.shutdown();

    logger.info('CompleteMultiVariantSystem', { message: 'Shutdown complete' });
  }

  /**
   * Demo workflow: Create token via complete system
   */
  async demoCreateToken(name: string, symbol: string, supply: number): Promise<any> {
    console.log(`\n🎯 Demo: Creating token ${name} (${symbol})`);
    console.log('   via Multi-Variant Swarm System\n');

    const startTime = Date.now();

    // Step 1: Micro swarm validation (fast)
    console.log('Step 1: Micro Swarm Validation');
    const microAgents = this.swarm.getHederaAgentsByClass('micro');
    if (microAgents.length > 0) {
      console.log(`  ✅ ${microAgents.length} micro agents available for fast validation`);
    }

    // Step 2: Normal swarm execution
    console.log('\nStep 2: Normal Swarm Execution');
    const result = await this.swarm.createTokenViaSwarm(name, symbol, supply);
    
    if (result.success) {
      console.log(`  ✅ Token created: ${result.tokenId}`);
      console.log(`  📊 Swarm path: ${result.swarmPath.join(' → ')}`);
    } else {
      console.log(`  ❌ Token creation failed`);
    }

    // Step 3: Monitoring
    console.log('\nStep 3: System Monitoring');
    const metrics = this.monitor.getLatestMetrics();
    if (metrics) {
      console.log(`  📊 Total agents: ${metrics.totalAgents}`);
      console.log(`  📊 Relay messages: ${metrics.relayStats.messagesUp}↑ ${metrics.relayStats.messagesDown}↓`);
    }

    const duration = Date.now() - startTime;
    console.log(`\n⏱️  Total time: ${duration}ms`);

    return result;
  }
}
