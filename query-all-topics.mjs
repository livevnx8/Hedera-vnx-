#!/usr/bin/env node
/**
 * Query all HCS topics for message counts
 */

import dotenv from 'dotenv';
dotenv.config();

// Lattice Topics (core 5)
const latticeTopics = {
  'core': '0.0.10409351',
  'defi': '0.0.10409352',
  'carbon': '0.0.10409353',
  'bridge': '0.0.10409354',
  'ecosystem': '0.0.10409355'
};

// FedEx Topics
const fedexTopics = {
  'fedex-compliance': process.env.FEDEX_COMPLIANCE_TOPIC_ID,
  'fedex-route': process.env.FEDEX_ROUTE_TOPIC_ID,
  'fedex-supply': process.env.FEDEX_SUPPLY_TOPIC_ID
};

// McLaren Topics
const mclarenTopics = {
  'mclaren-carbon': process.env.MCLAREN_CARBON_AUDIT_REPORTS_TOPIC_ID,
  'mclaren-season': process.env.MCLAREN_SEASON_SUMMARIES_TOPIC_ID,
  'mclaren-retirement': process.env.MCLAREN_OFFSET_RETIREMENT_TOPIC_ID
};

const network = process.env.HEDERA_NETWORK || 'mainnet';
const mirrorNode = network === 'mainnet' 
  ? 'https://mainnet.mirrornode.hedera.com' 
  : 'https://testnet.mirrornode.hedera.com';

async function getTopicMessageCount(topicId) {
  if (!topicId) return null;
  try {
    const response = await fetch(`${mirrorNode}/api/v1/topics/${topicId}/messages?limit=1`);
    if (!response.ok) return null;
    const data = await response.json();
    // The sequence number of the last message is the total count
    return data.messages?.[0]?.sequence_number || 0;
  } catch (e) {
    return null;
  }
}

async function queryAllTopics() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           VERA HCS TOPIC MESSAGE COUNT QUERY               ║
╚════════════════════════════════════════════════════════════╝
Network: ${network.toUpperCase()}
Mirror Node: ${mirrorNode}
`);

  let totalMessages = 0;
  const results = [];

  // Query Lattice topics
  console.log('\n📊 LATTICE TOPICS:');
  console.log('─'.repeat(50));
  for (const [name, id] of Object.entries(latticeTopics)) {
    const count = await getTopicMessageCount(id);
    console.log(`  ${name.padEnd(12)} ${id} → ${count !== null ? count.toLocaleString() : 'N/A'} messages`);
    if (count) totalMessages += count;
    results.push({ category: 'Lattice', name, id, count });
  }

  // Query FedEx topics
  console.log('\n📦 FEDEX TOPICS:');
  console.log('─'.repeat(50));
  let fedexConfigured = 0;
  for (const [name, id] of Object.entries(fedexTopics)) {
    if (id) fedexConfigured++;
    const count = await getTopicMessageCount(id);
    console.log(`  ${name.padEnd(12)} ${id || 'NOT SET'} → ${count !== null ? count.toLocaleString() : 'N/A'} messages`);
    if (count) totalMessages += count;
    results.push({ category: 'FedEx', name, id: id || 'NOT SET', count });
  }

  // Query McLaren topics
  console.log('\n🏎️  MCLAREN TOPICS:');
  console.log('─'.repeat(50));
  let mclarenConfigured = 0;
  for (const [name, id] of Object.entries(mclarenTopics)) {
    if (id) mclarenConfigured++;
    const count = await getTopicMessageCount(id);
    console.log(`  ${name.padEnd(12)} ${id || 'NOT SET'} → ${count !== null ? count.toLocaleString() : 'N/A'} messages`);
    if (count) totalMessages += count;
    results.push({ category: 'McLaren', name, id: id || 'NOT SET', count });
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log(`📈 TOTAL MESSAGES ACROSS ALL TOPICS: ${totalMessages.toLocaleString()}`);
  console.log(`✅ Topics Configured: ${5 + fedexConfigured + mclarenConfigured}/11`);
  console.log('═'.repeat(50));

  return { totalMessages, results };
}

queryAllTopics();
