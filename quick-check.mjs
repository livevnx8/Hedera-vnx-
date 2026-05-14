#!/usr/bin/env node
/**
 * Quick check - does account hold token 0.0.9356476?
 */

import { Client, AccountBalanceQuery, PrivateKey } from '@hashgraph/sdk';

const TOKEN_ID = '0.0.9356476';
const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.10294360';
const operatorKey = process.env.HEDERA_OPERATOR_KEY || '9cfa3e5df71a208161cde815aa4fe918bc1a3ed0d98c1317b9181b6fc07b5f6b';

async function check() {
  console.log(`🔍 Checking account ${operatorId} for token ${TOKEN_ID}...\n`);
  
  const client = Client.forMainnet();
  
  let privateKey;
  if (operatorKey.length === 64) {
    try {
      privateKey = PrivateKey.fromStringECDSA(operatorKey);
    } catch {
      privateKey = PrivateKey.fromStringED25519(operatorKey);
    }
  } else {
    privateKey = PrivateKey.fromString(operatorKey);
  }
  
  client.setOperator(operatorId, privateKey);
  
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(operatorId)
      .execute(client);
    
    console.log('✅ Account balance retrieved');
    console.log(`   HBAR: ${balance.hbars.toString()}`);
    
    const tokens = balance.tokens?._map || new Map();
    console.log(`\n   Tokens associated: ${tokens.size}`);
    
    if (tokens.size > 0) {
      console.log('\n   Token Balances:');
      tokens.forEach((v, k) => {
        const marker = k === TOKEN_ID ? ' ⭐ TARGET' : '';
        console.log(`     ${k}: ${v}${marker}`);
      });
    }
    
    if (tokens.has(TOKEN_ID)) {
      console.log(`\n🎯 SUCCESS! Token ${TOKEN_ID} is associated!`);
      console.log(`   Balance: ${tokens.get(TOKEN_ID)}`);
    } else {
      console.log(`\n❌ Token ${TOKEN_ID} NOT found in this account`);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  client.close();
}

check();
