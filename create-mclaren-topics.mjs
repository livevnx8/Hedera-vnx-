#!/usr/bin/env node
/**
 * Create McLaren Vera HCS Topics
 * Initializes carbon auditing topics on Hedera
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';

async function createMcLarenTopics() {
  console.log('\n🏎️  Creating McLaren Vera HCS Topics...\n');

  // Check credentials
  const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK || 'testnet';

  if (!accountId || !privateKey) {
    console.error('❌ Missing Hedera credentials in .env');
    console.log('   Required: HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY');
    process.exit(1);
  }

  console.log(`🔑 Using account: ${accountId}`);
  console.log(`🌐 Network: ${network}\n`);

  // Initialize client
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  
  let key;
  if (privateKey.length === 64) {
    try {
      key = PrivateKey.fromStringECDSA(privateKey);
    } catch {
      key = PrivateKey.fromStringED25519(privateKey);
    }
  } else {
    key = PrivateKey.fromString(privateKey);
  }
  
  client.setOperator(accountId, key);

  const topics = [];

  try {
    // 1. McLaren Carbon Audit Reports Topic
    console.log('📊 Creating Carbon Audit Reports topic...');
    const carbonTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera-McLaren F1 Carbon Audit Reports - Immutable race emission records')
      .execute(client);
    const carbonReceipt = await carbonTx.getReceipt(client);
    const carbonTopicId = carbonReceipt.topicId?.toString();
    topics.push({ name: 'Carbon Audit Reports', id: carbonTopicId });
    console.log(`   ✅ Created: ${carbonTopicId}`);

    // 2. McLaren Season Summaries Topic
    console.log('\n📈 Creating Season Summaries topic...');
    const seasonTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera-McLaren F1 Season Summaries - Annual carbon performance')
      .execute(client);
    const seasonReceipt = await seasonTx.getReceipt(client);
    const seasonTopicId = seasonReceipt.topicId?.toString();
    topics.push({ name: 'Season Summaries', id: seasonTopicId });
    console.log(`   ✅ Created: ${seasonTopicId}`);

    // 3. McLaren Offset Retirement Topic
    console.log('\n🌱 Creating Offset Retirement topic...');
    const retirementTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera-McLaren F1 Carbon Offset Retirement Records')
      .execute(client);
    const retirementReceipt = await retirementTx.getReceipt(client);
    const retirementTopicId = retirementReceipt.topicId?.toString();
    topics.push({ name: 'Offset Retirement', id: retirementTopicId });
    console.log(`   ✅ Created: ${retirementTopicId}`);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('              MCLAREN VERA TOPICS CREATED');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const topic of topics) {
      console.log(`${topic.name}:`);
      console.log(`   Topic ID: ${topic.id}`);
      console.log(`   HashScan: https://hashscan.io/${network}/topic/${topic.id}\n`);
    }

    // Save to .env file
    console.log('💾 Add these to your .env file:');
    console.log(`MCLAREN_CARBON_TOPIC_ID=${carbonTopicId}`);
    console.log(`MCLAREN_SEASON_TOPIC_ID=${seasonTopicId}`);
    console.log(`MCLAREN_RETIREMENT_TOPIC_ID=${retirementTopicId}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Error creating topics:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

createMcLarenTopics();
