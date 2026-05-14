#!/usr/bin/env node
/**
 * Check SaucerSwap Liquidity for hbar.h
 */

import https from 'https';

const TOKEN_ID = '0.0.9356476';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function checkLiquidity() {
  console.log(`🔍 Checking SaucerSwap for token ${TOKEN_ID} (hbar.h)\n`);

  try {
    // Fetch all pools
    const pools = await fetchJson('https://api.saucerswap.finance/pools/');
    
    console.log(`📊 Total pools on SaucerSwap: ${pools.length}`);
    
    // Look for pools containing our token
    const relevantPools = pools.filter(p => 
      p.tokenA?.id === TOKEN_ID || 
      p.tokenB?.id === TOKEN_ID ||
      p.tokenA?.symbol?.toLowerCase() === 'hbar.h' ||
      p.tokenB?.symbol?.toLowerCase() === 'hbar.h'
    );

    if (relevantPools.length === 0) {
      console.log(`\n❌ NO LIQUIDITY POOL FOUND for ${TOKEN_ID}`);
      console.log(`   This token is not traded on SaucerSwap`);
      console.log(`\n   Swaps will fail because there's no pool to trade against`);
      
      // Show sample of available pools
      console.log(`\n📋 Sample of available pools:`);
      pools.slice(0, 5).forEach(p => {
        console.log(`   ${p.tokenA?.symbol || '?'}/${p.tokenB?.symbol || '?'} - TVL: $${(p.tvlUsd || 0).toFixed(0)}`);
      });
      
    } else {
      console.log(`\n✅ FOUND ${relevantPools.length} POOL(S):\n`);
      relevantPools.forEach(p => {
        console.log(`   Pool: ${p.tokenA?.symbol}/${p.tokenB?.symbol}`);
        console.log(`   TVL: $${(p.tvlUsd || 0).toFixed(2)}`);
        console.log(`   Volume 24h: $${(p.volume24hUsd || 0).toFixed(2)}`);
        console.log(`   Fee: ${(p.fee || 0) * 100}%`);
        console.log();
      });
    }

  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
  }
}

checkLiquidity();
