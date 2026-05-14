#!/usr/bin/env tsx
/**
 * Vera Hot Topics Radar - Demo Script
 *
 * Run with: npx tsx demo-hot-topics.ts
 */

import { hotTopicsManager, createHotTopicsScanner, INITIAL_MONITORED_TOPICS } from './src/vera/orchestrator/index.js';
import { topicPoller } from './src/vera/orchestrator/topicPoller.js';
import { config } from './src/config.js';
import { logger } from './src/monitoring/logger.js';

const args = process.argv.slice(2);
const scanOnly = args.includes('--scan-only');
const addTopicArg = args.find((arg) => arg.startsWith('--add-topic='));
const verbose = args.includes('--verbose') || args.includes('-v');

async function main() {
  console.log('🔥 Vera Hot Topics Radar Demo\n');
  console.log(`Network: ${config.HEDERA_NETWORK}`);
  console.log(`Mirror Node: ${config.MIRROR_NODE_BASE_URL}`);
  console.log('');

  // Initialize hot topics manager
  console.log('📡 Initializing Hot Topics Manager...');
  const initialized = await hotTopicsManager.initialize();

  if (!initialized) {
    console.log('⚠️  Hot topics manager initialized without topic (credentials may be missing)');
  } else {
    const topicId = hotTopicsManager.getTopicId();
    console.log(`✅ Hot topics topic: ${topicId}`);
    console.log(`   Hashscan: https://hashscan.io/${config.HEDERA_NETWORK}/topic/${topicId}`);
  }

  // Show current monitored topics
  console.log('\n📋 Monitored Topics:');
  const monitored = hotTopicsManager.getMonitoredTopics();
  if (monitored.length === 0) {
    console.log('   (none - using defaults)');
    // Add initial topics
    for (const topicId of INITIAL_MONITORED_TOPICS) {
      hotTopicsManager.addMonitoredTopic(topicId);
      console.log(`   ➕ Added: ${topicId}`);
    }
  } else {
    for (const topicId of monitored) {
      console.log(`   • ${topicId}`);
    }
  }

  // Add custom topic if requested
  if (addTopicArg) {
    const topicId = addTopicArg.split('=')[1];
    if (topicId) {
      hotTopicsManager.addMonitoredTopic(topicId);
      console.log(`\n➕ Added custom topic: ${topicId}`);
    }
  }

  // Set up volume tracking via topicPoller
  console.log('\n📊 Setting up volume tracking...');
  const allTopics = hotTopicsManager.getMonitoredTopics();
  for (const topicId of allTopics) {
    topicPoller.registerTopic(topicId);
  }

  // Listen for volume events
  topicPoller.on('volume_threshold', (event) => {
    console.log(`\n🔔 Volume Threshold Event:`);
    console.log(`   Topic: ${event.topicId}`);
    console.log(`   Messages this window: ${event.messagesThisWindow}`);
    console.log(`   Classifications: ${event.classifications.join(', ') || 'none'}`);
  });

  topicPoller.on('message', (msg) => {
    if (verbose) {
      console.log(`   📨 ${msg.topicId} #${msg.sequenceNumber}`);
    }
  });

  // Start polling for volume data
  topicPoller.start();
  console.log('✅ Volume tracking active\n');

  // Create scanner and run a scan
  console.log('🔍 Running hot topics scan...');
  const scannerConfig = hotTopicsManager.getConfig();
  const scanner = createHotTopicsScanner(scannerConfig);

  // Get cursors from manager
  const cursors = new Map();
  for (const cursor of hotTopicsManager.getAllCursors()) {
    cursors.set(cursor.topicId, cursor);
  }

  // Run scan
  const scanStart = Date.now();
  const result = await scanner.scanAllTopics(cursors);
  const scanDuration = Date.now() - scanStart;

  // Display results
  console.log('\n' + '='.repeat(60));
  console.log('📊 SCAN RESULTS');
  console.log('='.repeat(60));
  console.log(`Type: ${result.type}`);
  console.log(`Time: ${result.scanTime}`);
  console.log(`Duration: ${scanDuration}ms`);
  console.log(`Summary: ${result.summary}`);
  console.log(`Threshold: ${result.threshold} msgs/hour`);
  console.log(`Alert Threshold: ${result.alertThreshold} msgs/hour`);
  console.log(`Total Monitored: ${result.totalMonitored}`);

  if (result.metrics) {
    console.log(`\nMetrics:`);
    console.log(`  Topics checked: ${result.metrics.topicsChecked}`);
    console.log(`  Mirror calls: ${result.metrics.mirrorCalls}`);
    console.log(`  Errors: ${result.metrics.errors}`);
  }

  if (result.highVolume.length > 0) {
    console.log('\n🔥 HIGH VOLUME TOPICS:');
    for (const entry of result.highVolume) {
      const actionEmoji = entry.action === 'alert' ? '🚨' : entry.action === 'investigate' ? '🔍' : '📊';
      console.log(`\n  ${actionEmoji} ${entry.topicId}`);
      console.log(`     Workflow: ${entry.workflow}`);
      console.log(`     Rate: ${entry.msgsHour} msgs/hour (${entry.deltaFormatted})`);
      console.log(`     Action: ${entry.action}`);
      if (entry.metadata?.classificationConfidence) {
        const confidence = Number(entry.metadata.classificationConfidence);
        console.log(`     Confidence: ${(confidence * 100).toFixed(1)}%`);
      }
    }
  } else {
    console.log('\n✨ No high-volume topics detected (all below threshold)');
  }

  if (result.newTopics.length > 0) {
    console.log('\n✨ NEWLY DISCOVERED TOPICS:');
    for (const topic of result.newTopics) {
      console.log(`  • ${topic.topicId} (${topic.classification}) - ${topic.initialVolume} msgs/hr`);
    }
  }

  // Publish results if not in scan-only mode
  if (!scanOnly && hotTopicsManager.getTopicId()) {
    console.log('\n📤 Publishing scan results to hot topics topic...');
    const published = await hotTopicsManager.publishScanResult(result);
    if (published) {
      console.log('✅ Results published successfully');
    } else {
      console.log('❌ Failed to publish results');
    }
  } else if (scanOnly) {
    console.log('\n📄 Scan-only mode - not publishing results');
  }

  // Show volume stats from poller
  console.log('\n📈 Volume Stats from Poller:');
  const volumeStats = topicPoller.getVolumeStats();
  if (volumeStats.length > 0) {
    for (const stat of volumeStats.slice(0, 5)) {
      console.log(`  ${stat.topicId}:`);
      console.log(`    Total: ${stat.totalMessages} messages`);
      console.log(`    Current window: ${stat.messagesInCurrentWindow} msgs`);
      console.log(`    Est. hourly rate: ${stat.estimatedHourlyRate} msgs/hr`);
      if (stat.classifications.length > 0) {
        console.log(`    Classifications: ${stat.classifications.join(', ')}`);
      }
    }
  } else {
    console.log('  (no volume data yet - polling in progress)');
  }

  // Clean up
  console.log('\n🛑 Cleaning up...');
  topicPoller.stop();
  hotTopicsManager.stopScanning();

  console.log('\n✅ Demo complete!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Demo failed:', error);
  logger.error('demo-hot-topics', { error: error.message, stack: error.stack });
  process.exit(1);
});
