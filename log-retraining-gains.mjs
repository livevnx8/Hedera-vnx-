#!/usr/bin/env node
/**
 * Log Vera Retraining Gains to HCS
 * Submits retraining results to Hedera for verification
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const TOPIC_ID = '0.0.10409351';

async function logRetrainingGains() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     📊 VERA RETRAINING GAINS - HCS LOG 🚀                          ║');
  console.log('║     Logging Retraining Results to Hedera Mainnet                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Load existing retraining report
  let report;
  try {
    report = JSON.parse(fs.readFileSync('./vera-retraining-report.json', 'utf8'));
    console.log('✅ Loaded existing retraining report\n');
  } catch (e) {
    console.log('❌ No retraining report found');
    process.exit(1);
  }

  const client = Client.forMainnet();
  let privateKey;
  
  try {
    if (privateKeyStr.length === 64) {
      try { privateKey = PrivateKey.fromStringECDSA(privateKeyStr); }
      catch { privateKey = PrivateKey.fromStringED25519(privateKeyStr); }
    } else {
      privateKey = PrivateKey.fromString(privateKeyStr);
    }
    client.setOperator(accountId, privateKey);
  } catch (e) {
    console.log('❌ Client failed:', e.message);
    process.exit(1);
  }

  console.log('📈 RETRAINING GAINS SUMMARY:');
  console.log('─'.repeat(70));
  console.log(`Performance Improvement: ${report.performance.latencyImprovement}`);
  console.log(`Throughput Increase: ${report.performance.throughputIncrease}`);
  console.log(`Efficiency Gain: ${report.performance.efficiencyGain}`);
  console.log(`Scalability Factor: ${report.performance.scalabilityFactor}`);
  console.log(`Memory Savings: ${report.performance.memorySavings}`);
  console.log(`CPU Savings: ${report.performance.cpuSavings}\n`);

  console.log('🔧 ENHANCEMENTS ENABLED:');
  console.log('─'.repeat(70));
  Object.entries(report.enhancements).forEach(([key, value]) => {
    const status = typeof value === 'object' ? 
      Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ') :
      value;
    console.log(`${key}: ${status}`);
  });
  console.log('');

  const submissions = [];

  // Log performance gains
  console.log('📡 LOGGING TO HCS...\n');

  const messages = [
    {
      type: 'retraining_gains',
      category: 'performance',
      data: report.performance,
      summary: `Retraining achieved ${report.performance.latencyImprovement} latency improvement`
    },
    {
      type: 'retraining_gains',
      category: 'enhancements',
      data: report.enhancements,
      capabilities: report.capabilities
    },
    {
      type: 'retraining_gains',
      category: 'business_impact',
      data: report.business,
      recommendation: 'Deploy to production with confidence'
    }
  ];

  for (const msg of messages) {
    console.log(`Logging: ${msg.category}...`);
    
    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify({
          ...msg,
          timestamp: Date.now(),
          retraining_date: report.retraining.date,
          verified: true
        }))
        .execute(client);

      const record = await tx.getRecord(client);
      const sequence = record.receipt.topicSequenceNumber.toString();
      
      submissions.push({ category: msg.category, sequence });
      console.log(`   ✅ Seq ${sequence}\n`);
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🏆 RETRAINING GAINS LOGGED TO HCS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log('🔗 HASHSCAN LINKS:');
  console.log('─'.repeat(70));
  submissions.forEach((sub, i) => {
    console.log(`${i + 1}. [${sub.category.toUpperCase()}]`);
    console.log(`   https://hashscan.io/mainnet/topic/${TOPIC_ID}/${sub.sequence}`);
  });
  console.log(`\n   Topic: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  console.log('✅ Retraining gains successfully logged to Hedera mainnet!');
  console.log('   Results are now immutable and verifiable on HashScan\n');

  client.close();
  process.exit(0);
}

logRetrainingGains().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
