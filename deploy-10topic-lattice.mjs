#!/usr/bin/env node
/**
 * VERA 10-TOPIC LATTICE DEPLOYMENT - WEEK 1
 * Creates 10 actual HCS topics on Hedera mainnet for 100 TPS capability
 * 
 * Topic Architecture:
 * - Topics 0-2: Data Layer (DeFi, Carbon, AI)
 * - Topics 3-5: Memory Layer (Index, Audit, Knowledge)
 * - Topics 6-8: System Layer (Metrics, Security, Health)
 * - Topic 9: Coordination Layer (Cross-topic coherence)
 */

import { Client, TopicCreateTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const PRIVATE_KEY_STR = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

const LATTICE_TOPOLOGY = [
  { id: 0, name: 'Vera_DeFi_Data', shard: 'alpha', layer: 'data', emoji: '🔷', description: 'DeFi protocol research and market data' },
  { id: 1, name: 'Vera_Carbon_Credits', shard: 'beta', layer: 'data', emoji: '🔶', description: 'Carbon credit verification and DOVU integration' },
  { id: 2, name: 'Vera_AI_Agents', shard: 'gamma', layer: 'data', emoji: '🤖', description: 'AI agent coordination and model tracking' },
  { id: 3, name: 'Vera_Cross_Reference', shard: 'delta', layer: 'memory', emoji: '💎', description: 'Cross-topic message indexing and references' },
  { id: 4, name: 'Vera_Audit_Trail', shard: 'epsilon', layer: 'memory', emoji: '🔍', description: 'Immutable audit logs and compliance' },
  { id: 5, name: 'Vera_Knowledge_Graph', shard: 'zeta', layer: 'memory', emoji: '📚', description: 'Accumulated research knowledge base' },
  { id: 6, name: 'Vera_Metrics', shard: 'eta', layer: 'system', emoji: '📊', description: 'Performance metrics and throughput tracking' },
  { id: 7, name: 'Vera_Security', shard: 'theta', layer: 'system', emoji: '🔒', description: 'Security events and access logs' },
  { id: 8, name: 'Vera_System_Health', shard: 'iota', layer: 'system', emoji: '❤️', description: 'System health and uptime monitoring' },
  { id: 9, name: 'Vera_Coordination', shard: 'kappa', layer: 'coordination', emoji: '🌐', description: 'Cross-topic coordination and routing' }
];

class Vera10TopicDeployer {
  constructor(client) {
    this.client = client;
    this.topics = [];
    this.createdTopics = [];
  }

  async createTopics() {
    console.log('\n🔧 CREATING 10-TOPIC LATTICE INFRASTRUCTURE\n');
    console.log('═'.repeat(70));
    console.log(`Account: ${OPERATOR_ID}`);
    console.log(`Network: Hedera Mainnet`);
    console.log(`Target: 10 topics × 10 TPS = 100 TPS capacity\n`);

    for (const config of LATTICE_TOPOLOGY) {
      try {
        console.log(`${config.emoji} [${config.id + 1}/10] Creating ${config.name}...`);
        console.log(`   Layer: ${config.layer} | Shard: ${config.shard}`);
        console.log(`   Purpose: ${config.description}`);

        const tx = await new TopicCreateTransaction()
          .setTopicMemo(`Vera Lattice v3.0: ${config.name} [${config.shard}] | ${config.description}`)
          .execute(this.client);

        const receipt = await tx.getReceipt(this.client);
        const topicId = receipt.topicId.toString();

        this.topics.push({
          ...config,
          topicId,
          hashscanUrl: `https://hashscan.io/mainnet/topic/${topicId}`
        });

        this.createdTopics.push({
          index: config.id,
          name: config.name,
          topicId,
          layer: config.layer,
          shard: config.shard
        });

        console.log(`   ✅ Created: ${topicId}`);
        console.log(`   🔗 ${this.topics[this.topics.length - 1].hashscanUrl}\n`);

        // Delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));

      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}\n`);
        // Continue with next topic
      }
    }

    this.saveTopology();
  }

  saveTopology() {
    const topology = {
      deploymentId: `lattice-v3-${Date.now()}`,
      timestamp: new Date().toISOString(),
      network: 'mainnet',
      accountId: OPERATOR_ID,
      totalTopics: this.topics.length,
      theoreticalTps: this.topics.length * 10,
      topics: this.topics,
      layerSummary: {
        data: this.topics.filter(t => t.layer === 'data').length,
        memory: this.topics.filter(t => t.layer === 'memory').length,
        system: this.topics.filter(t => t.layer === 'system').length,
        coordination: this.topics.filter(t => t.layer === 'coordination').length
      }
    };

    fs.writeFileSync('./vera-10topic-topology.json', JSON.stringify(topology, null, 2));
    console.log('💾 Topology saved: ./vera-10topic-topology.json\n');
  }

  printSummary() {
    console.log('═'.repeat(70));
    console.log('🏆 10-TOPIC LATTICE DEPLOYMENT COMPLETE');
    console.log('═'.repeat(70));
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Topics Created: ${this.topics.length}/10`);
    console.log(`   Theoretical TPS: ${this.topics.length * 10} TPS`);
    console.log(`   Network: Hedera Mainnet`);
    console.log(`   Account: ${OPERATOR_ID}\n`);

    console.log('🔗 LAYER BREAKDOWN:');
    console.log(`   🔷 Data Layer: ${this.topics.filter(t => t.layer === 'data').length} topics`);
    console.log(`      ${this.topics.filter(t => t.layer === 'data').map(t => t.name).join(', ')}`);
    console.log(`   💎 Memory Layer: ${this.topics.filter(t => t.layer === 'memory').length} topics`);
    console.log(`      ${this.topics.filter(t => t.layer === 'memory').map(t => t.name).join(', ')}`);
    console.log(`   ⚡ System Layer: ${this.topics.filter(t => t.layer === 'system').length} topics`);
    console.log(`      ${this.topics.filter(t => t.layer === 'system').map(t => t.name).join(', ')}`);
    console.log(`   🌐 Coordination: ${this.topics.filter(t => t.layer === 'coordination').length} topic`);
    console.log(`      ${this.topics.filter(t => t.layer === 'coordination').map(t => t.name).join(', ')}\n`);

    console.log('🌐 ALL HASHSCAN LINKS:');
    console.log('─'.repeat(70));
    this.topics.forEach((topic, i) => {
      console.log(`${i + 1}. ${topic.emoji} ${topic.name}`);
      console.log(`   Topic ID: ${topic.topicId}`);
      console.log(`   ${topic.hashscanUrl}`);
    });
    console.log('');

    console.log('✅ WEEK 1 COMPLETE: 10-Topic Infrastructure Deployed!');
    console.log('   Ready for Week 2: Lattice Coordination Layer\n');
  }
}

async function main() {
  if (!OPERATOR_ID || !PRIVATE_KEY_STR) {
    console.log('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
    process.exit(1);
  }

  const client = Client.forMainnet();
  let privateKey;

  try {
    if (PRIVATE_KEY_STR.length === 64) {
      try { privateKey = PrivateKey.fromStringECDSA(PRIVATE_KEY_STR); }
      catch { privateKey = PrivateKey.fromStringED25519(PRIVATE_KEY_STR); }
    } else {
      privateKey = PrivateKey.fromString(PRIVATE_KEY_STR);
    }
    client.setOperator(OPERATOR_ID, privateKey);
  } catch (e) {
    console.log('❌ Client initialization failed:', e.message);
    process.exit(1);
  }

  const deployer = new Vera10TopicDeployer(client);
  await deployer.createTopics();
  deployer.printSummary();

  client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
