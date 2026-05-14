#!/usr/bin/env node
/**
 * Vera Creates McLaren Topics via Agent Kit
 * Uses hederaAgentKit which handles key formatting
 */

import dotenv from 'dotenv';
dotenv.config();

import { createHederaAgentKit } from './src/hedera/agentKitWrapper.js';

const network = process.env.HEDERA_NETWORK || 'mainnet';

console.log('\n🏎️  VERA CREATING MCLAREN HCS TOPICS (via Agent Kit)\n');
console.log(`🌐 Network: ${network.toUpperCase()}`);
console.log('⏳ Initializing Hedera Agent Kit...\n');

try {
  // Initialize Agent Kit (handles key formatting internally)
  const agentKit = await createHederaAgentKit();
  
  console.log('✅ Agent Kit connected');
  console.log(`🔑 Account: ${process.env.HEDERA_OPERATOR_ACCOUNT_ID}\n`);
  
  const topics = [];
  
  // Create topics using Agent Kit
  const topicConfigs = [
    {
      name: 'McLaren Carbon Audit Reports',
      memo: 'Vera-McLaren F1 Carbon Audit Reports'
    },
    {
      name: 'McLaren Season Summaries',
      memo: 'Vera-McLaren F1 Season Summaries'
    },
    {
      name: 'McLaren Offset Retirement',
      memo: 'Vera-McLaren F1 Offset Retirement'
    }
  ];
  
  for (const config of topicConfigs) {
    console.log(`📊 Creating: ${config.name}`);
    
    try {
      // Use Agent Kit's hcs_create_topic tool
      const result = await agentKit.executeTool('hcs_create_topic', {
        memo: config.memo,
        adminKey: true,
        submitKey: true
      });
      
      const resultObj = JSON.parse(result);
      
      if (resultObj.error) {
        console.log(`   ❌ Failed: ${resultObj.error}\n`);
        continue;
      }
      
      const topicId = resultObj.topicId;
      console.log(`   ✅ Topic ID: ${topicId}`);
      console.log(`   🔗 HashScan: https://hashscan.io/${network}/topic/${topicId}\n`);
      
      topics.push({
        name: config.name,
        topicId,
        memo: config.memo,
        hashscanUrl: `https://hashscan.io/${network}/topic/${topicId}`
      });
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message}\n`);
    }
  }
  
  // Summary
  if (topics.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`           ${topics.length} MCLAREN VERA TOPICS CREATED`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Save to env
    const fs = await import('fs');
    let envAdd = '\n# McLaren Vera HCS Topics (Created: ' + new Date().toISOString() + ')\n';
    topics.forEach(t => {
      const envName = t.name.toUpperCase().replace(/ /g, '_') + '_TOPIC_ID';
      envAdd += `${envName}=${t.topicId}\n`;
      envAdd += `# ${t.hashscanUrl}\n`;
    });
    
    fs.appendFileSync('.env', envAdd);
    console.log('💾 Saved to .env\n');
    
    // Print summary table
    console.log('📋 TOPIC SUMMARY:');
    console.log('─'.repeat(60));
    topics.forEach(t => {
      console.log(`${t.name}:`);
      console.log(`  Topic ID: ${t.topicId}`);
      console.log(`  HashScan: ${t.hashscanUrl}\n`);
    });
  } else {
    console.log('❌ No topics were created');
    console.log('💡 Check your HEDERA_OPERATOR credentials in .env');
  }
  
} catch (e) {
  console.error('❌ Error:', e.message);
  console.log('💡 Make sure HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY are set');
  process.exit(1);
}

console.log('\n✨ Vera has completed the McLaren topic setup!\n');
