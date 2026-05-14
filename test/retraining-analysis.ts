/**
 * Retraining Analysis - Identify models with highest ROI for retraining
 */

import { getRetrainingOrchestrator } from '../src/ai/retrainingOrchestrator.js';
import { getFederatedLearning } from '../src/edge/index.js';

async function main() {
  console.log('\n🔬 Retraining ROI Analysis\n');
  console.log('=' .repeat(60));

  // 1. Analyze current FL state
  const fl = getFederatedLearning();
  const flStats = fl.getStats();
  
  console.log('\n📊 Current FL Status:');
  console.log(`  Registered models: ${flStats.registeredModels}`);
  console.log(`  Total rounds: ${flStats.totalRounds}`);
  console.log(`  Active rounds: ${flStats.activeRounds}`);
  console.log(`  Avg devices/round: ${flStats.avgDevicesPerRound.toFixed(1)}`);

  // 2. Get retraining recommendations
  const orchestrator = getRetrainingOrchestrator();
  const recommendations = await orchestrator.getRecommendations();
  
  console.log('\n🎯 Retraining Recommendations:\n');

  if (recommendations.urgent.length > 0) {
    console.log('⚠️  URGENT (needs immediate attention):');
    for (const model of recommendations.urgent) {
      console.log(`   • ${model.name}`);
      console.log(`     Accuracy: ${(model.accuracy * 100).toFixed(1)}% | Drift: ${(model.driftScore * 100).toFixed(0)}%`);
      console.log(`     Est. gain: +${(model.estimatedGain * 100).toFixed(1)}% | ROI: ${model.roi.toFixed(2)}x`);
    }
  }

  if (recommendations.recommended.length > 0) {
    console.log('\n✅ RECOMMENDED (high ROI):');
    for (const model of recommendations.recommended) {
      console.log(`   • ${model.name}`);
      console.log(`     ROI: ${model.roi.toFixed(2)}x | Gain: +${(model.estimatedGain * 100).toFixed(1)}%`);
      console.log(`     Cost: ${model.retrainingCost.toFixed(1)} units`);
    }
  }

  if (recommendations.healthy.length > 0) {
    console.log('\n💚 HEALTHY (no action needed):');
    for (const model of recommendations.healthy) {
      console.log(`   • ${model.name} (${(model.accuracy * 100).toFixed(0)}% accuracy)`);
    }
  }

  // 3. Priority list
  console.log('\n📋 Priority Order (by ROI):\n');
  const allModels = await orchestrator.analyzeAndPrioritize();
  
  for (let i = 0; i < allModels.length; i++) {
    const m = allModels[i];
    const priority = i < 3 ? '🟢' : i < 5 ? '🟡' : '⚪';
    console.log(`   ${priority} ${i + 1}. ${m.name}`);
    console.log(`      Gain: +${(m.estimatedGain * 100).toFixed(1)}% | ROI: ${m.roi.toFixed(2)}x | Cost: ${m.retrainingCost.toFixed(1)}`);
  }

  // 4. Execute retraining for top ROI models
  console.log('\n🚀 Executing retraining for top models...\n');
  const jobs = await orchestrator.executeRetraining();
  
  for (const job of jobs) {
    console.log(`   ✓ ${job.jobId}`);
    console.log(`     Status: ${job.status}`);
    console.log(`     Accuracy: ${(job.accuracyBefore! * 100).toFixed(1)}% → ${(job.accuracyAfter! * 100).toFixed(1)}%`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\nCompleted ${jobs.length} retraining jobs\n`);
}

main().catch(console.error);
