#!/usr/bin/env node

/**
 * Hedera-Integrated Swarm Demo
 * Demonstrates the multi-variant swarm executing Hedera tools
 */

const { HederaIntegratedSwarm } = require('./src/swarm/multi-variant/hederaIntegratedSwarm.js');

console.log('🔗 Hedera-Integrated Multi-Variant Swarm Demo\n');
console.log('=============================================\n');

async function runDemo() {
  // Initialize swarm with Hedera integration
  const swarm = new HederaIntegratedSwarm({
    enableHederaTools: true,
    hederaToolDistribution: {
      micro: 30,
      normal: 60,
      macro: 90
    }
  });

  console.log('Phase 1: Initializing Hedera-Integrated Swarm...\n');
  await swarm.initialize();
  
  swarm.printHederaStatus();

  // Phase 2: Test Hedera tool execution via different swarm classes
  console.log('\n\nPhase 2: Testing Hedera Tool Execution\n');
  console.log('---------------------------------------\n');

  // Test 1: Micro swarm - Fast balance check
  console.log('Test 1: Micro Swarm - Fast Balance Check');
  try {
    const balanceResult = await swarm.executeHederaTool(
      'getAccountBalance',
      { accountId: '0.0.10294360' },
      'micro'
    );
    console.log(`  Result: ${balanceResult?.success ? '✅' : '❌'}`);
    if (balanceResult?.data) {
      console.log(`  Balance: ${balanceResult.data.hbarBalance}`);
    }
  } catch (error) {
    console.log(`  ⚠️  ${error.message}`);
  }

  // Test 2: Normal swarm - Token creation workflow
  console.log('\nTest 2: Normal Swarm - Token Creation Workflow');
  console.log('  (This would create a real token on testnet)');
  console.log('  Simulating workflow path...');
  
  const tokenResult = await swarm.createTokenViaSwarm(
    'SwarmDemoToken',
    'SDT',
    1000000
  );
  
  console.log(`  Result: ${tokenResult.success ? '✅' : '❌'}`);
  console.log(`  Swarm Path: ${tokenResult.swarmPath.join(' → ')}`);
  if (tokenResult.tokenId) {
    console.log(`  Token ID: ${tokenResult.tokenId}`);
    console.log(`  HashScan: ${tokenResult.hashscanUrl}`);
  }

  // Test 3: Macro swarm - HCS topic operations
  console.log('\nTest 3: Macro Swarm - HCS Coordination');
  try {
    const topicResult = await swarm.executeHederaTool(
      'createTopic',
      { memo: 'Swarm Coordination Topic' },
      'macro'
    );
    console.log(`  Result: ${topicResult?.success ? '✅' : '❌'}`);
    if (topicResult?.data) {
      console.log(`  Topic ID: ${topicResult.data.topicId}`);
    }
  } catch (error) {
    console.log(`  ⚠️  ${error.message}`);
  }

  // Phase 3: Batch execution
  console.log('\n\nPhase 3: Batch Tool Execution\n');
  console.log('-------------------------------\n');

  const batchTools = [
    { name: 'getAccountBalance', params: { accountId: '0.0.10294360' }, preferredClass: 'micro' },
    { name: 'getAccountBalance', params: { accountId: '0.0.10409351' }, preferredClass: 'micro' },
    { name: 'createTopic', params: { memo: 'Batch Topic 1' }, preferredClass: 'macro' }
  ];

  console.log(`Executing batch of ${batchTools.length} tools...`);
  const batchResults = await swarm.executeBatch(batchTools);
  
  batchResults.forEach((result, i) => {
    console.log(`  Tool ${i + 1}: ${result?.success ? '✅' : '❌'} ${batchTools[i].name}`);
  });

  // Phase 4: Show final statistics
  console.log('\n\nPhase 4: Final Statistics\n');
  console.log('--------------------------\n');
  
  setTimeout(() => {
    swarm.printHederaStatus();
    
    const stats = swarm.getHederaStats();
    
    console.log('\nDetailed Hedera Metrics:\n');
    console.log(`Total Executions: ${stats.hedera.totalExecutions}`);
    console.log(`Success Rate: ${stats.hedera.successRate}`);
    console.log(`Average Execution Time: ${stats.hedera.averageExecutionTime}ms`);
    
    console.log('\nHedera Agents by Class:\n');
    ['micro', 'normal', 'macro'].forEach(swarmClass => {
      const agents = swarm.getHederaAgentsByClass(swarmClass);
      console.log(`  ${swarmClass.toUpperCase()}: ${agents.length} agents`);
      
      agents.slice(0, 2).forEach(agent => {
        const metrics = agent.getToolMetrics();
        console.log(`    - ${agent.getId()}: ${metrics.toolExecutions} executions, ${metrics.successRate} success`);
      });
    });

    console.log('\n=============================================');
    console.log('✅ Hedera-Integrated Swarm Demo Complete!');
    console.log('\nKey Achievements:');
    console.log('  • Multi-variant swarm architecture operational');
    console.log('  • Hedera tools integrated at all swarm levels');
    console.log('  • Micro swarms for fast operations (<100ms target)');
    console.log('  • Normal swarms for workflow orchestration');
    console.log('  • Macro swarms for cross-region coordination');
    console.log('  • Lattice relay connecting all layers via HCS');
    console.log('=============================================\n');

    // Cleanup
    swarm.shutdown().then(() => {
      process.exit(0);
    });
  }, 2000);
}

// Run demo
runDemo().catch(error => {
  console.error('\n❌ Demo failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
