#!/usr/bin/env node
/**
 * Check Vera's wallet for token 0.0.9356476
 * Uses Hedera mirror node REST API
 */

const https = require('https');

const ACCOUNT_ID = '0.0.10294360';
const TOKEN_ID = '0.0.9356476';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function checkToken() {
  console.log(`🔍 Checking account ${ACCOUNT_ID} for token ${TOKEN_ID}\n`);
  
  // Check mainnet
  console.log('📡 Checking Hedera Mainnet...');
  try {
    const result = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${ACCOUNT_ID}/tokens?limit=100`);
    
    if (result.status === 200 && result.data.tokens) {
      const tokens = result.data.tokens;
      console.log(`   Found ${tokens.length} tokens\n`);
      
      const targetToken = tokens.find(t => t.token_id === TOKEN_ID);
      
      if (targetToken) {
        console.log('✅ TOKEN FOUND IN WALLET!');
        console.log(`   Token ID: ${targetToken.token_id}`);
        console.log(`   Balance: ${targetToken.balance}`);
        console.log(`   Decimals: ${targetToken.decimals || 'N/A'}`);
        console.log(`   Freeze Status: ${targetToken.freeze_status || 'N/A'}`);
        console.log(`   KYC Status: ${targetToken.kyc_status || 'N/A'}`);
        
        // Now check token info
        console.log('\n📡 Fetching token details...');
        const tokenInfo = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/${TOKEN_ID}`);
        
        if (tokenInfo.status === 200 && tokenInfo.data) {
          const info = tokenInfo.data;
          console.log(`   Name: ${info.name || 'N/A'}`);
          console.log(`   Symbol: ${info.symbol || 'N/A'}`);
          console.log(`   Type: ${info.type || 'N/A'}`);
          console.log(`   Decimals: ${info.decimals || 'N/A'}`);
          console.log(`   Total Supply: ${info.total_supply || 'N/A'}`);
          console.log(`   Treasury: ${info.treasury_account_id || 'N/A'}`);
          console.log(`   Deleted: ${info.deleted || 'false'}`);
        } else {
          console.log(`   ⚠️  Could not fetch token details: ${tokenInfo.status}`);
        }
        
      } else {
        console.log(`❌ Token ${TOKEN_ID} NOT found in wallet`);
        console.log('\nTokens in wallet:');
        tokens.forEach(t => {
          console.log(`   ${t.token_id}: ${t.balance}`);
        });
      }
    } else {
      console.log(`   ⚠️  Could not fetch tokens: ${result.status}`);
      if (result.data && result.data._status) {
        console.log(`   Error: ${result.data._status.messages[0].message}`);
      }
    }
  } catch (e) {
    console.error('   Error:', e.message);
  }
}

checkToken().catch(console.error);
