/**
 * Test script for Vera notification system
 *
 * Usage: npx tsx scripts/test-notifications.ts [test|escalation|training|health]
 */

import { slackNotifier } from '../src/vera/notifications/slackNotifier.js';

async function main() {
  const testType = process.argv[2] || 'test';

  console.log('🔔 Vera Notification Test');
  console.log('==========================');
  console.log('Enabled:', slackNotifier.isEnabled());
  console.log('Test type:', testType);
  console.log('');

  switch (testType) {
    case 'test':
      // Basic connectivity test
      await slackNotifier.sendTest();
      break;

    case 'escalation':
      // Test escalation notification
      await slackNotifier.notifyEscalation({
        escalationId: 'esc-test-001',
        taskId: 'task-test-001',
        serviceType: 'carbon-verification',
        description: 'High-value carbon credit verification requires human review due to low confidence',
        triggeredRules: ['low_confidence', 'high_value_threshold'],
        meridianConfidence: 0.42,
        meridianRecommendation: 'carbon-agent-001',
        timestamp: new Date().toISOString(),
      });
      break;

    case 'training':
      // Test training notification
      await slackNotifier.notifyTraining({
        modelName: 'meridian-medium-compact',
        epoch: 3,
        totalEpochs: 5,
        loss: 2.8472,
        evalLoss: 2.9123,
        checkpointPath: 'models/meridian/checkpoints/medium-compact-gpt2-v1/epoch-3.pt',
        status: 'in_progress',
        durationHours: 34.2,
      });
      break;

    case 'health':
      // Test health alert
      await slackNotifier.notifySystemHealth({
        component: 'quantum',
        status: 'degraded',
        message: 'Quantum mirror coherence below threshold (0.75 < 0.85)',
        metrics: {
          mirrorCoherence: 0.75,
          activeStreams: 14,
          expectedStreams: 18,
        },
      });
      break;

    default:
      console.log('Unknown test type. Use: test|escalation|training|health');
  }

  console.log('\n✅ Test complete');
}

main().catch(console.error);
