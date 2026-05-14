#!/usr/bin/env node

/**
 * Vera Retraining Demo with HCS Logging
 * 
 * Retrains Vera and logs all events to HCS topics:
 * - Nerves: Training data ingestion
 * - Lungs: Training progress & metrics  
 * - Memory: Training completion & model attestation
 */

import { VeraRetrainingSystem } from './dist/retraining/retrainingSystem.js';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🧠 VERA RETRAINING - WITH HCS LOGGING');
console.log('═══════════════════════════════════════════════════════════════\n');

async function runRetrainingDemo() {
  try {
    // Initialize retraining system
    const retraining = new VeraRetrainingSystem();
    retraining.printStatus();

    // Configure retraining
    const config = {
      baseModel: 'vera-backup.gguf',
      datasetPath: './training-data/conversation-enhancement.jsonl',
      learningRate: 2e-5,
      epochs: 20,
      batchSize: 4,
      hcsLogging: true  // Enable HCS logging
    };

    console.log('📋 Retraining Configuration:');
    console.log(`   Base Model: ${config.baseModel}`);
    console.log(`   Dataset: ${config.datasetPath}`);
    console.log(`   Epochs: ${config.epochs}`);
    console.log(`   Learning Rate: ${config.learningRate}`);
    console.log(`   HCS Logging: ${config.hcsLogging ? '✅ ENABLED' : '❌ Disabled'}\n`);

    // Start retraining with HCS logging
    const result = await retraining.startRetraining(config);

    // Display results
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ RETRAINING COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`📊 Model ID: ${result.modelId}`);
    console.log(`✅ Success: ${result.success ? 'YES' : 'NO'}`);
    console.log(`\n📈 Metrics:`);
    console.log(`   Start Time: ${result.metrics.startTime}`);
    console.log(`   End Time: ${result.metrics.endTime}`);
    console.log(`   Epochs Completed: ${result.metrics.epochsCompleted}/${config.epochs}`);
    console.log(`   Tokens Processed: ${result.metrics.tokensProcessed.toLocaleString()}`);
    console.log(`   Accuracy Improvement: +${result.metrics.accuracyImprovement}%`);
    console.log(`   Final Loss: ${result.metrics.lossHistory[result.metrics.lossHistory.length - 1]?.toFixed(4) || 'N/A'}`);
    
    console.log(`\n🔗 HCS Logs:`);
    const startLogs = result.hcsLogs.filter(l => l.type === 'RETRAINING_START');
    const epochLogs = result.hcsLogs.filter(l => l.type === 'EPOCH_COMPLETE');
    const endLogs = result.hcsLogs.filter(l => l.type === 'TRAINING_COMPLETE');
    
    console.log(`   Start Events: ${startLogs.length} (Nerves topic)`);
    console.log(`   Epoch Events: ${epochLogs.length} (Lungs topic)`);
    console.log(`   Complete Events: ${endLogs.length} (Memory topic)`);
    console.log(`   Total Events: ${result.hcsLogs.length}`);

    console.log(`\n📜 Verifiable Training Record:`);
    console.log(`   Every training step is now immortalized on Hedera mainnet.`);
    console.log(`   HashScan: https://hashscan.io/mainnet/topic/0.0.10409353\n`);

    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Retraining failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Retraining interrupted');
  process.exit(0);
});

// Run the demo
runRetrainingDemo();
