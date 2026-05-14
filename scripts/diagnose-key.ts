#!/usr/bin/env node
/**
 * Diagnose Hedera key format issues
 */

import dotenv from 'dotenv';
dotenv.config();

const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  HEDERA KEY DIAGNOSTIC');
console.log('══════════════════════════════════════════════════════════════\n');

if (!operatorId) {
  console.log('❌ HEDERA_OPERATOR_ACCOUNT_ID: NOT SET');
} else {
  console.log(`✅ HEDERA_OPERATOR_ACCOUNT_ID: ${operatorId}`);
}

if (!operatorKey) {
  console.log('❌ HEDERA_OPERATOR_PRIVATE_KEY: NOT SET');
  process.exit(1);
}

const keyLength = operatorKey.length;
const cleanKey = operatorKey.replace('0x', '').trim();
const cleanLength = cleanKey.length;

console.log(`\n📊 Key Analysis:`);
console.log(`   Raw length: ${keyLength}`);
console.log(`   Clean length (no 0x): ${cleanLength}`);
console.log(`   Starts with 0x: ${operatorKey.startsWith('0x')}`);
console.log(`   Contains DER prefix: ${cleanKey.includes('302e')}`);
console.log(`   First 20 chars: ${cleanKey.substring(0, 20)}...`);

// Determine likely type
let detectedType = 'Unknown';
if (cleanLength === 64) {
  detectedType = 'ED25519 or ECDSA (64 char hex)';
} else if (cleanLength === 96) {
  detectedType = 'ECDSA (96 char hex)';
} else if (cleanKey.startsWith('302e020100300506032b657004220420')) {
  detectedType = 'DER-encoded ED25519';
} else if (cleanKey.includes('302e')) {
  detectedType = 'DER-encoded (various)';
} else if (cleanLength === 128) {
  detectedType = 'ECDSA with 0x prefix (128 char)';
}

console.log(`\n🔍 Detected type: ${detectedType}`);

// Recommendations
console.log(`\n💡 Recommendations:`);
if (cleanLength === 64) {
  console.log(`   This looks like a raw 64-char hex key.`);
  console.log(`   The script should try ED25519 first, then ECDSA.`);
} else if (cleanLength === 96) {
  console.log(`   This looks like a 96-char ECDSA key.`);
  console.log(`   Use: PrivateKey.fromStringECDSA('${cleanKey}')`);
} else if (cleanKey.startsWith('302e')) {
  console.log(`   This looks like a DER-encoded key.`);
  console.log(`   Use: PrivateKey.fromStringDer('${cleanKey}')`);
}

// Show what to put in .env
console.log(`\n📝 For .env file, the key should be one of:`);
console.log(`   1. ED25519 raw hex (64 chars): ${cleanKey.substring(0, 20)}...`);
console.log(`   2. ECDSA raw hex (96 chars):  ${cleanKey.substring(0, 20)}...`);
console.log(`   3. DER encoded:                 ${cleanKey.substring(0, 40)}...`);
console.log(`   4. With 0x prefix:              0x${cleanKey.substring(0, 20)}...`);

console.log('\n══════════════════════════════════════════════════════════════\n');
