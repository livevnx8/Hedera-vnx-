#!/usr/bin/env node
/**
 * Test Hedera Connection - Minimal Test
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
let privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

console.log('\n🔍 Testing Hedera Connection\n');
console.log(`Account: ${accountId}`);

if (!accountId || !privateKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

privateKey = privateKey.replace(/^0x/, '').trim();

// Try to parse key
let key;
try {
  key = PrivateKey.fromStringED25519(privateKey);
  console.log('Key type: ED25519');
} catch {
  try {
    key = PrivateKey.fromStringECDSA(privateKey);
    console.log('Key type: ECDSA');
  } catch {
    console.error('❌ Cannot parse key');
    process.exit(1);
  }
}

// Test balance query (no signature needed)
console.log('\n📊 Checking account balance...');

const client = Client.forMainnet();

try {
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  
  console.log(`✅ Connected!`);
  console.log(`💰 Balance: ${balance.hbars.toString()}`);
  console.log(`\n🔑 Key matches account - can create topics`);
  
} catch (e) {
  console.error(`❌ Failed: ${e.message}`);
  
  if (e.message.includes('INVALID_ACCOUNT_ID')) {
    console.log('\n💡 Account does not exist on mainnet');
    console.log('   Try testnet instead');
  }
}

client.close();
