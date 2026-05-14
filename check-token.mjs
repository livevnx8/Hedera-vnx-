#!/usr/bin/env node
/**
 * Check if HTS token exists
 */

import { Client, TokenInfoQuery } from '@hashgraph/sdk';
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

  const client = Client.forMainnet();
  console.log(`🔍 Checking token ${TOKEN_ID} on mainnet...\n`);

  try {
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(TOKEN_ID)
      .execute(client);

    console.log('✅ TOKEN FOUND!');
    console.log(`   Name: ${tokenInfo.name}`);
    console.log(`   Symbol: ${tokenInfo.symbol}`);
    console.log(`   Type: ${tokenInfo.tokenType?.toString() || 'Unknown'}`);
    console.log(`   Decimals: ${tokenInfo.decimals}`);
    console.log(`   Supply: ${tokenInfo.totalSupply?.toString() || 'N/A'}`);
    console.log(`   Treasury: ${tokenInfo.treasuryAccountId?.toString() || 'N/A'}`);

  } catch (e) {
    console.error(`❌ Token ${TOKEN_ID} NOT FOUND on mainnet`);
    console.log(`   Error: ${e.message}\n`);
    console.log('Possible reasons:');
    console.log('   - Token is on TESTNET (not mainnet)');
    console.log('   - Token ID is incorrect');
    console.log('   - Token has been deleted');
  }

  client.close();
}

checkToken();
