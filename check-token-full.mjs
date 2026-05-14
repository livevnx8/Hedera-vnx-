#!/usr/bin/env node
/**
 * Comprehensive Token Checker
 * Checks token on mainnet, testnet, and SaucerSwap
 */

import { Client, TokenInfoQuery, AccountBalanceQuery } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_ID = '0.0.9356476';

async function checkOnNetwork(network, client) {
  try {
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(TOKEN_ID)
      .execute(client);
    
    return {
      found: true,
      network,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      decimals: tokenInfo.decimals,
      totalSupply: tokenInfo.totalSupply?.toString(),
      treasury: tokenInfo.treasuryAccountId?.toString()
    };
  } catch (e) {
    return { found: false, network, error: e.message };
  }
}

async function checkToken() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  console.log(`🔍 Searching for token ${TOKEN_ID}...\n`);

  // Check mainnet
  console.log('📡 Checking MAINNET...');
  const mainnetClient = Client.forMainnet();
  if (operatorId && operatorKey) {
    const { PrivateKey } = await import('@hashgraph/sdk');
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
    mainnetClient.setOperator(operatorId, privateKey);
  }
  
  const mainnetResult = await checkOnNetwork('mainnet', mainnetClient);
  if (mainnetResult.found) {
    console.log('✅ FOUND ON MAINNET!');
    console.log(`   Name: ${mainnetResult.name}`);
    console.log(`   Symbol: ${mainnetResult.symbol}`);
    console.log(`   Decimals: ${mainnetResult.decimals}`);
    console.log(`   Supply: ${mainnetResult.totalSupply}`);
    mainnetClient.close();
    return;
  } else {
    console.log(`   ❌ Not found: ${mainnetResult.error}\n`);
  }
  mainnetClient.close();

  // Check testnet
  console.log('📡 Checking TESTNET...');
  const testnetClient = Client.forTestnet();
  if (operatorId && operatorKey) {
    const { PrivateKey } = await import('@hashgraph/sdk');
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
    testnetClient.setOperator(operatorId, privateKey);
  }
  
  const testnetResult = await checkOnNetwork('testnet', testnetClient);
  if (testnetResult.found) {
    console.log('✅ FOUND ON TESTNET!');
    console.log(`   Name: ${testnetResult.name}`);
    console.log(`   Symbol: ${testnetResult.symbol}`);
    console.log(`   Decimals: ${testnetResult.decimals}`);
    console.log(`   Supply: ${testnetResult.totalSupply}`);
    testnetClient.close();
    return;
  } else {
    console.log(`   ❌ Not found: ${testnetResult.error}\n`);
  }
  testnetClient.close();

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🔍 TOKEN NOT FOUND ON HEDERA MAINNET OR TESTNET');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('If this is a SaucerSwap token:');
  console.log('   - SaucerSwap tokens are HTS tokens on Hedera');
  console.log('   - They should be visible on mainnet');
  console.log('   - Check https://www.saucerswap.finance/\n');
  console.log('Possible issues:');
  console.log('   - Token ID might be incorrect');
  console.log('   - Token may have been deleted');
  console.log('   - Network mismatch\n');
}

checkToken().catch(console.error);
