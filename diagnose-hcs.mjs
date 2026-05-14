#!/usr/bin/env node
/**
 * Diagnostic script for HCS signature issues
 */

import { Client, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;

console.log('🔍 HCS Diagnostics\n');
console.log('Account ID:', accountId);
console.log('Key length:', keyStr?.length, 'chars');
console.log('Key prefix:', keyStr?.substring(0, 10) + '...\n');

// Try different key parsing methods
const methods = [
  { name: 'fromStringECDSA', fn: () => PrivateKey.fromStringECDSA(keyStr) },
  { name: 'fromStringED25519', fn: () => PrivateKey.fromStringED25519(keyStr) },
  { name: 'fromString', fn: () => PrivateKey.fromString(keyStr) },
];

console.log('Testing key parsing methods:');
for (const method of methods) {
  try {
    const key = method.fn();
    const publicKey = key.publicKey.toString();
    console.log(`  ✅ ${method.name}: SUCCESS`);
    console.log(`     Public key: ${publicKey.substring(0, 30)}...`);
  } catch (err) {
    console.log(`  ❌ ${method.name}: ${err.message}`);
  }
}

// Check account balance
console.log('\nChecking account balance...');
try {
  const client = Client.forMainnet();
  const key = PrivateKey.fromStringECDSA(keyStr);
  client.setOperator(accountId, key);
  
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  
  console.log(`  ✅ Account balance: ${balance.hbars.toString()}`);
} catch (err) {
  console.log(`  ❌ Balance check failed: ${err.message}`);
}

console.log('\n--- Fix Recommendations ---');
console.log('If INVALID_SIGNATURE persists:');
console.log('1. Verify account exists on mainnet');
console.log('2. Check key matches account public key at https://hashscan.io');
console.log('3. Ensure account has HBAR for fees');
