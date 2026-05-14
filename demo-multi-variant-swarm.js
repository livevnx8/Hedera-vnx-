#!/usr/bin/env node

/**
 * Multi-Variant Swarm Demo
 * Tests and demonstrates the three-class swarm architecture
 */

const { MultiVariantSwarmOrchestrator } = require('./src/swarm/multi-variant/swarmOrchestrator.js');

console.log('🐝 Multi-Variant Swarm Architecture Demo\n');
console.log('========================================\n');

async function runDemo() {
  // Initialize orchestrator
  const orchestrator = new MultiVariantSwarmOrchestrator();
  
  console.log('Phase 1: Initializing infrastructure...\n');
  await orchestrator.initialize();
  
  // Show initial status
  orchestrator.printStatus();
  
  // Phase 2: Simulate micro swarm activity
  console.log('\nPhase 2: Testing Micro Swarm (Streaming Layer)\n');
  console.log('-----------------------------------------------\n');
  
  const microAgents = orchestrator.getAgentsByClass('micro');
  console.log(`Active micro agents: ${microAgents.length}`);
  
  // Simulate stream processing
  for (let i = 0; i < 5; i++) {
    const agent = microAgents[i];
    if (agent) {
      // Simulate events
      const events = [
        {
          id: `evt-${Date.now()}-${i}`,
          timestamp: Date.now(),
          type: 'hcs_message',
          data: { topicId: '0.0.12345', message: 'Test message' },
          topic: 'test',
          priority: 1
        },
        {
          id: `evt-${Date.now()}-${i}-2`,
          timestamp: Date.now(),
          type: 'price_update',
          data: { tokenId: 'HBAR', price: 0.05 },
          topic: 'prices',
          priority: 2
        }
      ];
      
      // Process through agent
      for (const event of events) {
        await agent.processEvent(event);
      }
      
      console.log(`  ✓ Micro agent ${agent.getId()} processed ${events.length} events`);
    }
  }
  
  // Phase 3: Test normal swarm
  console.log('\n\nPhase 3: Testing Normal Swarm (Processing Layer)\n');
  console.log('-------------------------------------------------\n');
  
  const normalAgents = orchestrator.getAgentsByClass('normal');
  console.log(`Active normal agents: ${normalAgents.length}`);
  
  // Create a workflow
  const workflow = {
    id: `wf-${Date.now()}`,
    steps: [
      { id: 'step1', type: 'verification', payload: { projectId: 'P123', carbonTons: 100 }, dependencies: [], status: 'pending' },
      { id: 'step2', type: 'transfer', payload: { from: '0.0.111', to: '0.0.222', amount: 50 }, dependencies: ['step1'], status: 'pending' },
      { id: 'step3', type: 'analysis', payload: { data: { result: 'success' }, analysisType: 'summary' }, dependencies: ['step2'], status: 'pending' }
    ],
    currentStep: 0,
    status: 'pending',
    createdAt: Date.now()
  };
  
  // Queue workflow to first normal agent
  if (normalAgents.length > 0) {
    const task = {
      id: `task-${Date.now()}`,
      type: 'workflow',
      payload: workflow,
      priority: 0.8,
      deadline: Date.now() + 5000
    };
    
    normalAgents[0].queueTask(task);
    console.log(`  ✓ Workflow queued to normal agent ${normalAgents[0].getId()}`);
  }
  
  // Phase 4: Test macro swarm
  console.log('\n\nPhase 4: Testing Macro Swarm (Bus Layer)\n');
  console.log('-----------------------------------------\n');
  
  const macroAgents = orchestrator.getAgentsByClass('macro');
  console.log(`Active macro agents: ${macroAgents.length}`);
  
  // Add bus message
  if (macroAgents.length > 0) {
    const busMessage = {
      id: `msg-${Date.now()}`,
      source: 'region-us-east',
      destination: 'region-eu-west',
      payload: { type: 'sync', data: { timestamp: Date.now() } },
      priority: 0.9,
      timestamp: Date.now(),
      ttl: 60,
      routing: []
    };
    
    macroAgents[0].enqueueMessage(busMessage);
    console.log(`  ✓ Bus message queued to macro agent ${macroAgents[0].getId()}`);
  }
  
  // Phase 5: Test lattice operations
  console.log('\n\nPhase 5: Testing Lattice Operations\n');
  console.log('------------------------------------\n');
  
  // Execute meet operation
  const allAgents = [
    ...microAgents.slice(0, 2),
    ...normalAgents.slice(0, 2),
    ...macroAgents.slice(0, 1)
  ];
  
  if (allAgents.length >= 2) {
    try {
      const meet = await orchestrator.executeMeet(allAgents.map(a => a.getId()));
      console.log(`  ✓ Meet operation:`);
      console.log(`    Agents: ${meet.agents.length}`);
      console.log(`    Overlap Score: ${meet.overlapScore.toFixed(3)}`);
      console.log(`    Constraints: ${meet.constraints.join(', ')}`);
    } catch (error) {
      console.log(`  ⚠ Meet operation: ${error.message}`);
    }
  }
  
  // Execute join operation
  if (allAgents.length >= 2) {
    try {
      const join = await orchestrator.executeJoin(allAgents.map(a => a.getId()));
      console.log(`\n  ✓ Join operation:`);
      console.log(`    Agents: ${join.agents.length}`);
      console.log(`    Coverage: ${join.coverage.toFixed(3)}`);
      console.log(`    Intents: ${join.aggregatedIntents.length}`);
    } catch (error) {
      console.log(`  ⚠ Join operation: ${error.message}`);
    }
  }
  
  // Show final status
  console.log('\n\nFinal Status:\n');
  console.log('--------------\n');
  
  setTimeout(() => {
    orchestrator.printStatus();
    
    // Show detailed agent metrics
    console.log('\nDetailed Metrics:\n');
    
    const micro = microAgents[0]?.getMicroMetrics?.();
    if (micro) {
      console.log('Micro Agent Sample:');
      console.log(`  Processed Events: ${micro.processedEvents}`);
      console.log(`  Dropped Events: ${micro.droppedEvents}`);
      console.log(`  Buffer Size: ${micro.bufferSize}`);
    }
    
    const normal = normalAgents[0]?.getNormalMetrics?.();
    if (normal) {
      console.log('\nNormal Agent Sample:');
      console.log(`  Workflows Completed: ${normal.workflowsCompleted}`);
      console.log(`  Workflows Failed: ${normal.workflowsFailed}`);
      console.log(`  Queue Size: ${normal.queueSize}`);
    }
    
    const macro = macroAgents[0]?.getMacroMetrics?.();
    if (macro) {
      console.log('\nMacro Agent Sample:');
      console.log(`  Messages Routed: ${macro.messagesRouted}`);
      console.log(`  Consensus Rounds: ${macro.consensusRounds}`);
      console.log(`  Regional Peers: ${macro.regionalPeers}`);
    }
    
    console.log('\n========================================');
    console.log('✅ Demo Complete!');
    console.log('\nThe multi-variant swarm architecture is operational:');
    console.log('  • Micro swarms handle high-frequency streaming');
    console.log('  • Normal swarms process workflows and aggregation');
    console.log('  • Macro swarms coordinate cross-region via bus');
    console.log('  • Lattice relay connects all layers via HCS topics');
    console.log('========================================\n');
    
    // Shutdown
    orchestrator.shutdown().then(() => {
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
