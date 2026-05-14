#!/usr/bin/env node
/**
 * Log HBAR Agent Retraining to HCS
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const TOPIC_ID = '0.0.10409351';

async function main() {
  console.log('\n🚀 Logging HBAR Agent Retraining to HCS\n');

  if (!accountId || !privateKeyStr) {
    console.log('❌ Missing credentials');
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
    console.log('❌ Client init failed:', e.message);
    process.exit(1);
  }

  // Load report
  const report = JSON.parse(fs.readFileSync('./vera-hbar-retraining-report.json', 'utf8'));

  const phases = [
    { name: 'tools_validation', data: { tools: report.results.tools, total: report.gains.totalTools } },
    { name: 'agents_validation', data: { agents: report.results.agents } },
    { name: 'workflows_validation', data: { workflows: report.results.workflows } },
    { name: 'system_validation', data: report.results.learning },
    { name: 'retraining_complete', data: { gains: report.gains, status: 'complete' } }
  ];

  const sequences = [];

  for (const phase of phases) {
    try {
      const message = {
        type: 'vera_hbar_retraining',
        phase: phase.name,
        timestamp: Date.now(),
        data: phase.data,
        retraining_id: report.retrainingId,
        network: 'mainnet'
      };

      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(TOPIC_ID)
        .setMessage(JSON.stringify(message))
        .execute(client);

      const record = await tx.getRecord(client);
      const sequence = record.receipt.topicSequenceNumber.toString();
      sequences.push({ phase: phase.name, sequence });
      
      console.log(`✅ ${phase.name}: Seq ${sequence}`);
    } catch (error) {
      console.log(`❌ ${phase.name}: ${error.message}`);
    }
  }

  // Update report with sequences
  report.hcsSequences = sequences;
  fs.writeFileSync('./vera-hbar-retraining-report.json', JSON.stringify(report, null, 2));

  console.log('\n════════════════════════════════════════════════════════');
  console.log('🏆 HBAR AGENT RETRAINING LOGGED TO HCS');
  console.log('════════════════════════════════════════════════════════\n');
  
  console.log('📊 RESULTS:');
  console.log(`   New Tools: ${report.gains.toolsAdded}`);
  console.log(`   Total Tools: ${report.gains.totalTools}`);
  console.log(`   Domain Agents: ${report.gains.agentsCreated}`);
  console.log(`   Workflows: ${report.gains.workflowsCreated}`);
  console.log(`   HCS Logs: ${sequences.length}\n`);

  console.log('🔗 HASHSCAN:');
  sequences.forEach((log, i) => {
    console.log(`   ${i + 1}. ${log.phase}`);
    console.log(`      https://hashscan.io/mainnet/topic/${TOPIC_ID}/${log.sequence}`);
  });
  console.log(`\n   Topic: https://hashscan.io/mainnet/topic/${TOPIC_ID}\n`);

  console.log('✅ Report updated: vera-hbar-retraining-report.json\n');

  client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
