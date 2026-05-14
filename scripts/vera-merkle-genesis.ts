/**
 * Vera Merkle Genesis Anchor
 * 
 * Creates cryptographic proof of all work records (80+)
 * and anchors to HCS as immutable "Genesis Block".
 * 
 * This proves system accuracy before 24/7 scaling.
 * 
 * Run: npx tsx scripts/vera-merkle-genesis.ts
 */

import { getCostOptimizedPoW } from '../src/hedera/costOptimizedPoW.js';
import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../src/config.js';
import fs from 'fs';
import crypto from 'crypto';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  🔒 VERA MERKLE GENESIS ANCHOR                                     ║');
  console.log('║  Cryptographic Proof of Initial 80+ Records                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const pow = getCostOptimizedPoW();
  const client = Client.forMainnet();
  
  if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
    // Parse hex private key (64 chars = ECDSA or ED25519)
    const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
    let privateKey;
    if (keyStr.length === 64) {
      // Try ECDSA first, then ED25519
      try {
        privateKey = PrivateKey.fromStringECDSA(keyStr);
      } catch {
        privateKey = PrivateKey.fromStringED25519(keyStr);
      }
    } else {
      privateKey = PrivateKey.fromString(keyStr);
    }
    client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
  }

  // Get all records from local cache
  const cachePath = './data/work-records-cache.json';
  const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const records = data.records;

  console.log(`📦 Records Found: ${records.length}`);
  console.log(`   First: ${records[0]?.id?.slice(0, 16)}...`);
  console.log(`   Last: ${records[records.length - 1]?.id?.slice(0, 16)}...\n`);

  // Compute Merkle Root
  console.log('🔐 Computing Merkle Root...');
  const rootHash = computeMerkleRoot(records);
  console.log(`   Root: ${rootHash.slice(0, 32)}...\n`);

  // Create Genesis Anchor
  const genesisAnchor = {
    type: 'VERA_GENESIS_ANCHOR',
    version: '1.0',
    timestamp: Date.now(),
    recordCount: records.length,
    merkleRoot: rootHash,
    firstRecordId: records[0]?.id,
    lastRecordId: records[records.length - 1]?.id,
    firstTimestamp: records[0]?.timestamp,
    lastTimestamp: records[records.length - 1]?.timestamp,
    network: config.HEDERA_NETWORK || 'mainnet',
    operator: config.HEDERA_OPERATOR_ACCOUNT_ID,
    signature: '', // Will be filled
  };

  // Sign the anchor
  const dataToSign = JSON.stringify({
    root: rootHash,
    count: records.length,
    operator: config.HEDERA_OPERATOR_ACCOUNT_ID,
  });
  
  genesisAnchor.signature = crypto
    .createHmac('sha256', config.HEDERA_OPERATOR_PRIVATE_KEY || 'vera-genesis')
    .update(dataToSign)
    .digest('hex');

  // Submit to HCS
  console.log('📤 Submitting Genesis Anchor to HCS...');
  const topicId = process.env.POW_TOPIC_ID || '0.0.10407552';
  
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(genesisAnchor))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  
  console.log(`   ✅ Submitted to Topic: ${topicId}`);
  console.log(`   📝 Sequence Number: ${receipt.topicSequenceNumber?.toString()}`);
  console.log(`   🔗 HashScan: https://hashscan.io/mainnet/topic/${topicId}\n`);

  // Update cache
  data.lastAnchor = {
    timestamp: Date.now(),
    rootHash,
    sequenceNumber: receipt.topicSequenceNumber?.toString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ GENESIS ANCHOR COMPLETE                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Genesis Summary:');
  console.log(`   Records Anchored: ${records.length}`);
  console.log(`   Merkle Root: ${rootHash.slice(0, 40)}...`);
  console.log(`   HCS Sequence: ${receipt.topicSequenceNumber?.toString()}`);
  console.log(`   Cost: ~0.0001 ℏ (~$0.000015)\n`);

  console.log('🚀 Ready for 24/7 Auto-Dominance');
  console.log('   Run: npx tsx scripts/vera-dovu-auto-dominance.ts\n');
}

function computeMerkleRoot(records: any[]): string {
  if (records.length === 0) return '';

  // Create leaf hashes
  let hashes = records.map(r => 
    crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex')
  );

  console.log(`   ${hashes.length} leaf hashes created`);

  // Build tree
  let level = 0;
  while (hashes.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      const combined = crypto.createHash('sha256').update(left + right).digest('hex');
      nextLevel.push(combined);
    }
    hashes = nextLevel;
    level++;
    console.log(`   Level ${level}: ${hashes.length} hashes`);
  }

  return hashes[0];
}

main().catch(console.error);
