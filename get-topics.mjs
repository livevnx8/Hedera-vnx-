#!/usr/bin/env node
/**
 * Get McLaren F1 Carbon Auditing HCS Topic IDs
 */

import { hcsCarbonReporter } from './src/mclaren/hcsCarbonReporter.js';
import { carbonOffsetRetirement } from './src/mclaren/carbonOffsetRetirement.js';
import { notaryService } from './src/dovu/notaryService.js';

console.log('\n🏎️  McLaren F1 Carbon Auditing - HCS Topic IDs\n');

// Carbon Reporter Topics
const { carbonTopicId, seasonTopicId } = hcsCarbonReporter.getTopicIds();
console.log('📊 Carbon Audit Reports:');
console.log(`   Carbon Topic ID: ${carbonTopicId || 'Not initialized (run hcsCarbonReporter.initialize())'}`);
console.log(`   Season Topic ID: ${seasonTopicId || 'Not initialized'}`);

// Offset Retirement Topic  
const retirementTopicId = carbonOffsetRetirement.getRetirementTopicId?.() || null;
console.log('\n🌱 Carbon Offset Retirement:');
console.log(`   Retirement Topic ID: ${retirementTopicId || 'Not initialized'}`);

// Notary Service Topics
const { notarizationTopicId, certificateTopicId } = notaryService.getTopicIds();
console.log('\n📜 Dovu Notary Service:');
console.log(`   Notarization Topic ID: ${notarizationTopicId || 'Not initialized'}`);
console.log(`   Certificate Topic ID: ${certificateTopicId || 'Not initialized'}`);

const network = process.env.HEDERA_NETWORK || 'testnet';
console.log(`\n🔗 HashScan Links (${network}):`);

const allTopics = [
  { name: 'Carbon Reports', id: carbonTopicId },
  { name: 'Season Summaries', id: seasonTopicId },
  { name: 'Retirement', id: retirementTopicId },
  { name: 'Notarization', id: notarizationTopicId },
  { name: 'Certificates', id: certificateTopicId },
];

let hasTopics = false;
for (const topic of allTopics) {
  if (topic.id) {
    console.log(`   ${topic.name}: https://hashscan.io/${network}/topic/${topic.id}`);
    hasTopics = true;
  }
}

if (!hasTopics) {
  console.log('   No topics initialized yet.');
  console.log('\n💡 To create topics, run:');
  console.log('   await hcsCarbonReporter.initialize();');
  console.log('   await carbonOffsetRetirement.initialize();');
  console.log('   await notaryService.initialize();');
}

console.log('');
