#!/usr/bin/env node
/**
 * Check if token is associated with account
 * This verifies token exists and is accessible
 */

import { Client, AccountBalanceQuery, TokenInfoQuery, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';

async function checkToken() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    console.error('❌ Missing credentials');
    process.exit(1);
  }

  // Parse key
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

  const client = Client.forMainnet();
  client.setOperator(operatorId, privateKey);

  console.log(`🔍 Checking token ${TOKEN_ID}...\n`);
  console.log(`Account: ${operatorId}\n`);

  // Check account balance (shows all tokens)
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(operatorId)
      .execute(client);
    
    console.log('✅ Account balance retrieved');
    console.log(`   HBAR: ${balance.hbars.toString()}`);
    
    const tokens = balance.tokens?._map || new Map();
    console.log(`   Tokens: ${tokens.size} associated\n`);
    
    if (tokens.has(TOKEN_ID)) {
      console.log(`🎯 TOKEN ${TOKEN_ID} IS ASSOCIATED!`);
      console.log(`   Balance: ${tokens.get(TOKEN_ID)}\n`);
    } else {
      console.log(`⚠️  Token ${TOKEN_ID} NOT associated with this account\n`);
    }
  } catch (e) {
    console.log(`⚠️  Could not get balance: ${e.message}\n`);
  }

  // Check token info
  try {
    const info = await new TokenInfoQuery()
      .setTokenId(TOKEN_ID)
      .execute(client);
    
    console.log('✅ TOKEN EXISTS ON MAINNET!');
    console.log(`   Name: ${info.name}`);
    console.log(`   Symbol: ${info.symbol}`);
    console.log(`   Decimals: ${info.decimals}`);
    console.log(`   Supply: ${info.totalSupply?.toString() || 'N/A'}`);
    console.log(`   Treasury: ${info.treasuryAccountId?.toString() || 'N/A'}`);
    console.log(`   Type: ${info.tokenType?.toString() || 'Unknown'}\n`);
    
  } catch (e) {
    console.error(`❌ Token ${TOKEN_ID} NOT found on mainnet`);
    console.log(`   Error: ${e.message}\n`);
    console.log('🔍 RECOMMENDATIONS:');
    console.log('   1. Check if token is on TESTNET (use testnet explorer)');
    console.log('   2. Verify the token ID is correct');
    console.log('   3. Check SaucerSwap directly at https://www.saucerswap.finance/');
    console.log('   4. The token may need to be created first\n');
  }

  client.close();
}

checkToken().catch(console.error);
