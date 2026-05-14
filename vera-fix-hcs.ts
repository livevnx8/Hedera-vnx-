/**
 * 🔧 FIX HCS - Force Create Topics on HashScan
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';
import { config } from './src/config.js';

const WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔧 FIXING HCS - Creating Topics on HashScan                       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Setup client with EXACT key parsing
const client = Client.forMainnet();
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';

console.log('🔑 Checking Private Key...');
console.log(`   Length: ${keyStr.length}`);
console.log(`   First 8 chars: ${keyStr.slice(0, 8)}...`);

let privateKey;
try {
  if (keyStr.length === 64) {
    try { 
      privateKey = PrivateKey.fromStringECDSA(keyStr); 
      console.log('   ✅ Key Type: ECDSA (64 chars)');
    }
    catch { 
      privateKey = PrivateKey.fromStringED25519(keyStr); 
      console.log('   ✅ Key Type: ED25519 (64 chars)');
    }
  } else if (keyStr.startsWith('0x')) {
    privateKey = PrivateKey.fromStringECDSA(keyStr);
    console.log('   ✅ Key Type: ECDSA (hex with 0x)');
  } else if (keyStr.includes(' ')) {
    console.log('   ❌ Key has spaces - this will fail');
    process.exit(1);
  } else {
    privateKey = PrivateKey.fromString(keyStr);
    console.log('   ✅ Key Type: Auto-detected');
  }
} catch (error) {
  console.log('   ❌ Key Parse Error:', error.message);
  process.exit(1);
}

// Set operator
client.setOperator(WALLET, privateKey);
console.log(`   ✅ Operator Set: ${WALLET}\n`);

// Check HBAR balance (need ~2-3 HBAR for topic creation)
console.log('💰 Checking HBAR Balance...');
try {
  const balanceQuery = new AccountBalanceQuery().setAccountId(WALLET);
  const balance = await balanceQuery.execute(client);
  const hbars = balance.hbars.toTinybars() / 100000000;
  console.log(`   Balance: ${hbars.toFixed(4)} HBAR`);
  
  if (hbars < 2) {
    console.log('\n⚠️  WARNING: Low HBAR balance!');
    console.log('   You need ~2-3 HBAR to create HCS topics');
    console.log('   Top up at: https://portal.hedera.com');
  }
  console.log('');
} catch (error) {
  console.log('   ❌ Balance check failed:', error.message);
}

// Create HCS Topic 1: Verifications
console.log('🔨 Creating HCS Topic: Verifications...');
let verificationTopicId = null;
try {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Vera Carbon Credit Verifications - Immutable Proof')
    .setSubmitKey(client.operatorPublicKey!)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  verificationTopicId = receipt.topicId?.toString();
  console.log(`   ✅ Created: ${verificationTopicId}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${verificationTopicId}`);
} catch (error) {
  console.log('   ❌ Failed:', error.message);
}

// Create HCS Topic 2: Milestones
console.log('\n🔨 Creating HCS Topic: Milestones...');
let milestoneTopicId = null;
try {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Vera Growth Milestones & Achievements')
    .execute(client);
  const receipt = await tx.getReceipt(client);
  milestoneTopicId = receipt.topicId?.toString();
  console.log(`   ✅ Created: ${milestoneTopicId}`);
  console.log(`   🔗 https://hashscan.io/mainnet/topic/${milestoneTopicId}`);
} catch (error) {
  console.log('   ❌ Failed:', error.message);
}

// Test: Submit a message
if (verificationTopicId) {
  console.log('\n📝 Testing: Submitting verification to HCS...');
  try {
    const testMsg = {
      type: 'VERIFICATION_TEST',
      timestamp: Date.now(),
      verifier: WALLET,
      creditId: 'TEST-001',
      verified: true,
      confidence: 0.95,
    };
    
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(verificationTopicId)
      .setMessage(JSON.stringify(testMsg))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    
    console.log(`   ✅ Message submitted!`);
    console.log(`   📋 Sequence: ${receipt.topicSequenceNumber}`);
    console.log(`   🔗 View: https://hashscan.io/mainnet/topic/${verificationTopicId}/${receipt.topicSequenceNumber}`);
  } catch (error) {
    console.log('   ❌ Submit failed:', error.message);
  }
}

// Summary
console.log('\n' + '═'.repeat(70));
console.log('📊 HCS TOPIC CREATION SUMMARY');
console.log('═'.repeat(70));

if (verificationTopicId) {
  console.log('\n✅ SUCCESS! HCS Topics Created:');
  console.log(`   Verifications: ${verificationTopicId}`);
  console.log(`   Milestones: ${milestoneTopicId || 'N/A'}`);
  console.log(`\n🔗 View on HashScan:`);
  console.log(`   https://hashscan.io/mainnet/topic/${verificationTopicId}`);
  
  console.log('\n🎉 HCS IS NOW WORKING!');
  console.log('   Future verifications will appear on HashScan!');
} else {
  console.log('\n❌ HCS Topic Creation Failed');
  console.log('\n🔧 To Fix:');
  console.log('   1. Check HBAR balance (need 2+ HBAR)');
  console.log('   2. Verify private key format in .env');
  console.log('   3. Run this script again');
}

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  HCS FIX COMPLETE                                                  ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
