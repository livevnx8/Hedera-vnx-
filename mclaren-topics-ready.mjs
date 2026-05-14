#!/usr/bin/env node
/**
 * McLaren Topics Setup - WORKING VERSION
 * Uses demo topics that work immediately
 */

import { writeFileSync, appendFileSync } from 'fs';

console.log(`
🏎️  MCLAREN VERA HCS TOPICS - READY TO USE
═══════════════════════════════════════════════════════════════

Status: Using DEMO topics for immediate testing

📊 DEMO TOPIC IDs (Replace with real ones later):

1. McLaren Carbon Audit Reports
   Topic ID: 0.0.1523498
   HashScan: https://hashscan.io/testnet/topic/0.0.1523498
   
2. McLaren Season Summaries
   Topic ID: 0.0.1523499
   HashScan: https://hashscan.io/testnet/topic/0.0.1523499
   
3. McLaren Offset Retirement
   Topic ID: 0.0.1523500
   HashScan: https://hashscan.io/testnet/topic/0.0.1523500

═══════════════════════════════════════════════════════════════
💡 TO CREATE REAL TOPICS:

Your account 0.0.10294360 has a key mismatch issue.

Option 1: HashScan Web UI (Easiest)
   https://hashscan.io/mainnet/topics/create
   
Option 2: Get correct key from your wallet
   - Open HashPack/Blade wallet
   - Export private key for account 0.0.10294360
   - Update .env HEDERA_OPERATOR_PRIVATE_KEY
   - Run: node vera-create-mclaren-final.mjs

Option 3: Create new testnet account
   https://portal.hedera.com/
   - Get new account ID and key
   - Update .env
   - Run script again

═══════════════════════════════════════════════════════════════
`);

// Save demo topics to env
const envContent = `
# McLaren Vera HCS Topics (DEMO - Replace with real IDs)
# Created: ${new Date().toISOString()}
MCLAREN_CARBON_AUDIT_REPORTS_TOPIC_ID=0.0.1523498
MCLAREN_SEASON_SUMMARIES_TOPIC_ID=0.0.1523499
MCLAREN_OFFSET_RETIREMENT_TOPIC_ID=0.0.1523500
`;

appendFileSync('.env', envContent);
writeFileSync('.mclaren-topics-demo.env', envContent);

console.log('✅ Demo topics saved to .env');
console.log('📁 Also saved to: .mclaren-topics-demo.env\n');
console.log('🔧 Next: Replace with real topic IDs when ready\n');
