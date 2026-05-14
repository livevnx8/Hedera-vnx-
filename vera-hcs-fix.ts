/**
 * Vera HCS Test - Fix and verify HCS notarization works on HashScan
 */

import { notaryService } from './src/dovu/notaryService.js';
import { Client, AccountBalanceQuery, PrivateKey } from '@hashgraph/sdk';
import { config } from './src/config.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔧 VERA HCS NOTARIZATION FIX & TEST                               ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

// Check if we can connect properly
console.log('📡 Testing Hedera Connection...');
console.log(`   Account: ${WALLET}`);

// Setup client with proper key parsing
const client = Client.forMainnet();
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';

console.log(`   Key Length: ${keyStr.length} chars`);

let privateKey;
try {
  if (keyStr.length === 64) {
    try {
      privateKey = PrivateKey.fromStringECDSA(keyStr);
      console.log('   ✅ Key Type: ECDSA');
    } catch {
      privateKey = PrivateKey.fromStringED25519(keyStr);
      console.log('   ✅ Key Type: ED25519');
    }
  } else {
    privateKey = PrivateKey.fromString(keyStr);
    console.log('   ✅ Key Parsed Successfully');
  }
  
  client.setOperator(WALLET, privateKey);
  console.log('   ✅ Client initialized\n');
} catch (error) {
  console.log('   ❌ Key Error:', error.message);
  process.exit(1);
}

// Test balance query (proves connection works)
console.log('💰 Testing Account Balance Query...');
try {
  const query = new AccountBalanceQuery().setAccountId(WALLET);
  const balance = await query.execute(client);
  console.log(`   ✅ Balance: ${(balance.hbars.toTinybars() / 100000000).toFixed(4)} HBAR`);
  console.log(`   ✅ Connection to Hedera Mainnet: WORKING\n`);
} catch (error) {
  console.log('   ❌ Balance Query Failed:', error.message);
  console.log('   This means HCS will not work\n');
}

// Initialize notary service
console.log('🔧 Initializing Notary Service with Fixed Key Handling...');
await notaryService.initialize();

const topicIds = notaryService.getTopicIds();
console.log(`   Notarization Topic: ${topicIds.notarizationTopicId || 'CREATING...'}`);
console.log(`   Certificate Topic: ${topicIds.certificateTopicId || 'CREATING...'}`);

if (topicIds.notarizationTopicId && topicIds.notarizationTopicId !== 'local-only') {
  console.log('\n✅ HCS TOPICS CREATED SUCCESSFULLY!');
  console.log(`   View on HashScan: https://hashscan.io/mainnet/topic/${topicIds.notarizationTopicId}`);
  
  // Test notarization
  console.log('\n📝 Testing Notarization...');
  const mockPayload = {
    id: `TEST-${Date.now()}`,
    type: 'carbon_credit',
    accountId: WALLET,
    data: { tons: 100, project: 'Test Project' },
    signature: 'test-signature',
    timestamp: Date.now(),
  };
  
  const mockResult = {
    verified: true,
    confidence: 0.95,
    verificationHash: 'abc123',
    checks: { signature: true, account: true, data: true },
    timestamp: Date.now(),
  };
  
  const record = await notaryService.notarize(mockPayload, mockResult);
  
  if (record && record.hcsSequenceNumber && record.hcsSequenceNumber !== 'local-only') {
    console.log(`   ✅ Notarization submitted to HCS!`);
    console.log(`   📋 Record ID: ${record.id}`);
    console.log(`   🔗 Sequence: ${record.hcsSequenceNumber}`);
    console.log(`   🔍 View: https://hashscan.io/mainnet/topic/${topicIds.notarizationTopicId}/${record.hcsSequenceNumber}`);
    
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ HCS NOTARIZATION IS WORKING ON HASHSCAN!                        ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
  } else {
    console.log('   ⚠️  Notarization stored locally (HCS may still be initializing)');
  }
} else {
  console.log('\n⚠️  HCS Topics not created - running in local-only mode');
  console.log('   This means verifications will NOT appear on HashScan');
  console.log('\n🔧 To fix:');
  console.log('   1. Check HBAR balance (need ~1 HBAR for topic creation)');
  console.log('   2. Verify private key format in .env');
  console.log('   3. Run this test again');
}

console.log('\n📊 Summary:');
console.log(`   Wallet: ${WALLET}`);
console.log(`   HCS Topic: ${topicIds.notarizationTopicId || 'N/A'}`);
console.log(`   HashScan: https://hashscan.io/mainnet/account/${WALLET}`);
