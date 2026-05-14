#!/usr/bin/env node
/**
 * Create HCS Topics for Vera FedEx Supply Chain Implementation
 * 
 * Creates 8 topics on Hedera mainnet:
 * - FEDEX-ROUTE: Primary routing coordination
 * - FEDEX-PKG: Package tracking events
 * - FEDEX-CHAIN: Supply chain verification
 * - FEDEX-AIR: Air transportation events
 * - FEDEX-GROUND: Ground transportation
 * - FEDEX-INTL: International shipping
 * - FEDEX-OPT: Optimization recommendations
 * - FEDEX-AUDIT: Compliance & audit logs
 */

import {
  Client,
  TopicCreateTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

// Debug logging
const debugLog = (msg) => {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}\n`;
  console.log(logLine.trim());
  try {
    fs.appendFileSync('/tmp/fedex_debug.log', logLine);
  } catch (e) {}
};

debugLog('Starting FedEx topic creation script');
debugLog(`Account ID: ${accountId}`);
debugLog(`Key length: ${privateKeyStr ? privateKeyStr.length : 'undefined'}`);
debugLog(`Key starts with 0x: ${privateKeyStr ? privateKeyStr.startsWith('0x') : 'undefined'}`);

if (!accountId || !privateKeyStr) {
  debugLog('ERROR: Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
  console.error('❌ Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
  console.error('   Please set these in your .env file');
  process.exit(1);
}

// Initialize client
const network = process.env.HEDERA_NETWORK || 'mainnet';
const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

// Parse private key (handle both ECDSA and ED25519)
let privateKey;
if (privateKeyStr.startsWith('0x')) {
  // Hex-encoded ECDSA key with 0x prefix
  privateKey = PrivateKey.fromStringECDSA(privateKeyStr.slice(2));
  console.log('🔑 Using ECDSA key (with 0x prefix)');
} else if (privateKeyStr.length === 64) {
  // Raw 64-character hex ECDSA key
  privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
  console.log('🔑 Using ECDSA key (64-char hex)');
} else if (privateKeyStr.length === 66) {
  // Hex-encoded ECDSA key with 0x prefix included in length
  privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
  console.log('🔑 Using ECDSA key');
} else if (privateKeyStr.length === 96) {
  privateKey = PrivateKey.fromStringED25519(privateKeyStr);
  console.log('🔑 Using Ed25519 key');
} else {
  try {
    privateKey = PrivateKey.fromString(privateKeyStr);
    console.log('🔑 Using auto-detected key format');
  } catch (error) {
    console.error('❌ Failed to parse private key:', error.message);
    console.error('   Key length:', privateKeyStr.length);
    console.error('   Key starts with:', privateKeyStr.substring(0, 10) + '...');
    process.exit(1);
  }
}

client.setOperator(accountId, privateKey);

console.log('\n🚚 VERA FEDEX SUPPLY CHAIN - HCS Topic Creation');
console.log('═══════════════════════════════════════════════════════');
console.log('Network:', network.toUpperCase());
console.log('Operator:', accountId);
console.log('═══════════════════════════════════════════════════════\n');

const topics = [
  { 
    name: 'FEDEX-ROUTE', 
    memo: 'Vera FedEx: Primary Routing Coordination',
    description: 'Primary routing coordination and event management',
    retention: '90d',
    priority: 'critical'
  },
  { 
    name: 'FEDEX-PKG', 
    memo: 'Vera FedEx: Package Tracking Events',
    description: 'Real-time package tracking and verification',
    retention: '180d',
    priority: 'critical'
  },
  { 
    name: 'FEDEX-CHAIN', 
    memo: 'Vera FedEx: Supply Chain Verification',
    description: 'End-to-end supply chain verification',
    retention: '7y',
    priority: 'high'
  },
  { 
    name: 'FEDEX-AIR', 
    memo: 'Vera FedEx: Air Transportation',
    description: 'Air freight routing and tracking',
    retention: '90d',
    priority: 'high'
  },
  { 
    name: 'FEDEX-GROUND', 
    memo: 'Vera FedEx: Ground Transportation',
    description: 'Ground shipping routing and tracking',
    retention: '90d',
    priority: 'high'
  },
  { 
    name: 'FEDEX-INTL', 
    memo: 'Vera FedEx: International Shipping',
    description: 'International shipping and customs events',
    retention: '180d',
    priority: 'high'
  },
  { 
    name: 'FEDEX-OPT', 
    memo: 'Vera FedEx: Route Optimization',
    description: 'AI-driven route optimization recommendations',
    retention: '30d',
    priority: 'medium'
  },
  { 
    name: 'FEDEX-AUDIT', 
    memo: 'Vera FedEx: Compliance & Audit',
    description: 'Compliance and audit trail logging',
    retention: '7y',
    priority: 'critical'
  }
];

const createdTopics = [];

async function createTopic(name, memo, description, retention, priority) {
  try {
    console.log(`📡 Creating ${name}...`);
    console.log(`   Description: ${description}`);
    console.log(`   Retention: ${retention} | Priority: ${priority}`);
    
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(privateKey.publicKey)
      .setSubmitKey(privateKey.publicKey);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId.toString();

    console.log(`   ✅ Created: ${topicId}`);
    console.log(`   🔗 HashScan: https://hashscan.io/${network}/topic/${topicId}\n`);
    
    return { name, topicId, memo, description, retention, priority };
  } catch (error) {
    console.error(`   ❌ Failed to create ${name}:`, error.message);
    return { name, topicId: null, memo, description, retention, priority, error: error.message };
  }
}

async function main() {
  console.log(`⏳ Creating ${topics.length} HCS topics for FedEx implementation...\n`);

  for (const topic of topics) {
    const result = await createTopic(
      topic.name, 
      topic.memo, 
      topic.description,
      topic.retention,
      topic.priority
    );
    createdTopics.push(result);
    
    // Small delay between creations to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 TOPIC CONFIGURATION - Save this output!');
  console.log('═══════════════════════════════════════════════════════');
  console.log();
  console.log('const FEDEX_TOPIC_CONFIG = {');
  console.log(`  network: '${network}',`);
  console.log(`  operatorId: '${accountId}',`);
  console.log(`  createdAt: '${new Date().toISOString()}',`);
  console.log('  topics: {');
  
  for (const t of createdTopics) {
    if (t.topicId) {
      console.log(`    ${t.name.toLowerCase().replace(/-/g, '_')}: {`);
      console.log(`      id: '${t.topicId}',`);
      console.log(`      memo: '${t.memo}',`);
      console.log(`      priority: '${t.priority}',`);
      console.log(`      retention: '${t.retention}',`);
      console.log(`      hashscan: 'https://hashscan.io/${network}/topic/${t.topicId}'`);
      console.log(`    },`);
    }
  }
  
  console.log('  }');
  console.log('};');
  console.log();
  console.log('═══════════════════════════════════════════════════════');

  // Save to JSON file
  const config = {
    network,
    operatorId: accountId,
    createdAt: new Date().toISOString(),
    topics: createdTopics.reduce((acc, t) => {
      if (t.topicId) {
        acc[t.name.toLowerCase().replace(/-/g, '_')] = {
          id: t.topicId,
          memo: t.memo,
          description: t.description,
          priority: t.priority,
          retention: t.retention,
          hashscan: `https://hashscan.io/${network}/topic/${t.topicId}`
        };
      }
      return acc;
    }, {})
  };

  const filename = `fedex-topic-config-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(config, null, 2));
  console.log(`💾 Configuration saved to: ${filename}`);

  // Also update the standard config location
  const standardConfig = 'fedex-topic-config.json';
  fs.writeFileSync(standardConfig, JSON.stringify(config, null, 2));
  console.log(`💾 Configuration also saved to: ${standardConfig}`);

  // Check if all topics were created successfully
  const successCount = createdTopics.filter(t => t.topicId !== null).length;
  const failCount = createdTopics.length - successCount;

  console.log();
  console.log('═══════════════════════════════════════════════════════');
  console.log('📈 RESULTS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Successfully created: ${successCount}/${topics.length} topics`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount} topics`);
    const failed = createdTopics.filter(t => t.topicId === null);
    for (const f of failed) {
      console.log(`   - ${f.name}: ${f.error}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════');
  
  if (successCount === topics.length) {
    console.log('\n🎉 All FedEx HCS topics created successfully!');
    console.log('   Next step: Update HCSMultiTopicRouter with new topic IDs');
  } else {
    console.log('\n⚠️  Some topics failed to create. Review errors above.');
  }

  client.close();
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
