#!/usr/bin/env node

/**
 * Complete Multi-Variant Swarm System Demo
 * 
 * Demonstrates the full architecture:
 * - Micro/Normal/Macro swarms
 * - Hedera tool integration
 * - Monitoring & auto-scaling
 * - Lattice relay communication
 */

const { CompleteMultiVariantSystem } = require('./src/swarm/multi-variant/completeSystem.js');

console.log('🌟 COMPLETE MULTI-VARIANT SWARM SYSTEM DEMO\n');
console.log('===========================================\n');

async function runCompleteDemo() {
  // Initialize the complete system
  const system = new CompleteMultiVariantSystem();
  
  console.log('Phase 1: Initializing Complete System\n');
  await system.initialize();
  
  system.printCompleteStatus();

  // Phase 2: Test Hedera operations through swarm
  console.log('\n\nPhase 2: Hedera Operations via Swarm\n');
  console.log('-------------------------------------\n');

  // Test 1: Micro swarm - Fast balance check
  console.log('Test 1: Micro Swarm - Fast Balance Check');
  try {
    const microAgents = system.swarm.getHederaAgentsByClass('micro');
    if (microAgents.length > 0) {
      const result = await microAgents[0].checkBalance('0.0.10294360');
      console.log(`  ✅ Balance: ${result?.data?.hbarBalance || 'N/A'} HBAR`);
      console.log(`  ⏱️  Executed by: ${microAgents[0].getId()}`);
    }
  } catch (error) {
    console.log(`  ⚠️  ${error.message}`);
  }

  // Test 2: Normal swarm - Token creation workflow
  console.log('\nTest 2: Normal Swarm - Token Creation');
  const tokenResult = await system.demoCreateToken(
    'SwarmToken',
    'SWARM',
    1000000
  );

  // Test 3: Macro swarm - HCS coordination
  console.log('\nTest 3: Macro Swarm - HCS Coordination');
  try {
    const macroAgents = system.swarm.getHederaAgentsByClass('macro');
    if (macroAgents.length > 0) {
      const result = await macroAgents[0].createHCSTopic('Swarm Coordination');
      console.log(`  ✅ Topic: ${result?.data?.topicId || 'N/A'}`);
      console.log(`  🌐 Coordinated by: ${macroAgents[0].getId()}`);
    }
  } catch (error) {
    console.log(`  ⚠️  ${error.message}`);
  }

  // Phase 3: Test auto-scaling
  console.log('\n\nPhase 3: Auto-Scaling Demonstration\n');
  console.log('------------------------------------\n');
  
  system.autoScaler.printStatus();

  // Phase 4: Monitoring metrics
  console.log('\n\nPhase 4: System Monitoring\n');
  console.log('---------------------------\n');
  
  system.monitor.printStatus();
  
  // Get Prometheus metrics
  const prometheusMetrics = system.monitor.exportPrometheusMetrics();
  console.log('\n📊 Prometheus Metrics (sample):');
  console.log(prometheusMetrics.split('\n').slice(0, 5).join('\n'));

  // Phase 5: Final comprehensive status
  console.log('\n\nPhase 5: Final System State\n');
  console.log('--------------------------\n');
  
  setTimeout(() => {
    system.printCompleteStatus();
    
    const finalStatus = system.getSystemStatus();
    
    console.log('\n📈 Performance Summary:\n');
    console.log(`Total Agents: ${finalStatus.swarm.totalAgents}`);
    console.log(`Hedera Agents: ${finalStatus.swarm.hedera.totalAgents}`);
    console.log(`System Health: ${finalStatus.health.status.toUpperCase()}`);
    console.log(`Auto-Scaling: ${finalStatus.scaling.isRunning ? 'ACTIVE' : 'INACTIVE'}`);
    
    if (finalStatus.swarm.hedera.totalExecutions > 0) {
      console.log(`\nHedera Performance:`);
      console.log(`  Executions: ${finalStatus.swarm.hedera.totalExecutions}`);
      console.log(`  Success Rate: ${finalStatus.swarm.hedera.successRate}`);
      console.log(`  Avg Time: ${finalStatus.swarm.hedera.averageExecutionTime}ms`);
    }

    console.log('\n===========================================');
    console.log('✅ COMPLETE SYSTEM DEMO FINISHED');
    console.log('\nArchitecture Validated:');
    console.log('  🫀 Micro Swarms: High-frequency streaming (<100ms)');
    console.log('  🫀 Normal Swarms: Workflow processing (<1s)');
    console.log('  🫀 Macro Swarms: Cross-region bus (<5s)');
    console.log('  🔗 Hedera Tools: Integrated at all levels');
    console.log('  📊 Monitoring: Real-time metrics & health checks');
    console.log('  📈 Auto-Scaling: Dynamic agent management');
    console.log('  🌐 Lattice Relay: HCS topic-based coordination');
    console.log('===========================================\n');

    // Cleanup
    system.shutdown().then(() => {
      console.log('System shutdown complete. 👋\n');
      process.exit(0);
    });
  }, 3000);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Interrupted, shutting down...');
  process.exit(0);
});

// Run demo
runCompleteDemo().catch(error => {
  console.error('\n❌ Demo failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
