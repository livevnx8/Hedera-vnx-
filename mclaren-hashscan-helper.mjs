#!/usr/bin/env node
/**
 * McLaren Topics - HashScan Helper
 * Generates the exact steps to create topics via HashScan
 */

console.log(`
🏎️  MCLAREN VERA HCS TOPICS - HASHSCAN SETUP
═══════════════════════════════════════════════════════════════

Your account: 0.0.10294360 (Mainnet)

⚠️  The private key in .env doesn't match this account.
   
✅ WORKING SOLUTION - Create Topics via HashScan:

Step 1: Open HashScan Topics
   https://hashscan.io/mainnet/topics

Step 2: Connect your wallet (HashPack/Blade)
   Use the wallet that owns account 0.0.10294360

Step 3: Create these 3 topics:

   Topic 1: Carbon Audit Reports
   ─────────────────────────────────────
   Memo: Vera-McLaren F1 Carbon Audit Reports
   Submit Key: Optional
   Admin Key: Your account key
   
   Topic 2: Season Summaries  
   ─────────────────────────────────────
   Memo: Vera-McLaren F1 Season Summaries
   Submit Key: Optional
   Admin Key: Your account key
   
   Topic 3: Offset Retirement
   ─────────────────────────────────────
   Memo: Vera-McLaren F1 Offset Retirement
   Submit Key: Optional
   Admin Key: Your account key

Step 4: Copy the Topic IDs (0.0.xxxxx format)

Step 5: Add to .env:
   MCLAREN_CARBON_TOPIC_ID=0.0.[YOUR_TOPIC_ID]
   MCLAREN_SEASON_TOPIC_ID=0.0.[YOUR_TOPIC_ID]
   MCLAREN_RETIREMENT_TOPIC_ID=0.0.[YOUR_TOPIC_ID]

═══════════════════════════════════════════════════════════════

🔗 Quick Links:
   HashScan Topics: https://hashscan.io/mainnet/topics
   Your Account:    https://hashscan.io/mainnet/account/0.0.10294360

📊 Once created, your topics will be visible at:
   https://hashscan.io/mainnet/topic/[TOPIC_ID]

═══════════════════════════════════════════════════════════════
`);

// Save template
const fs = await import('fs');
const template = `
# McLaren Vera HCS Topics - Add real IDs after creating on HashScan
# Created: ${new Date().toISOString()}

# Step 1: Go to https://hashscan.io/mainnet/topics
# Step 2: Connect wallet with account 0.0.10294360
# Step 3: Create 3 topics with memos above
# Step 4: Copy Topic IDs here:

MCLAREN_CARBON_TOPIC_ID=0.0.REPLACE_ME
MCLAREN_SEASON_TOPIC_ID=0.0.REPLACE_ME  
MCLAREN_RETIREMENT_TOPIC_ID=0.0.REPLACE_ME
`;

fs.writeFileSync('.mclaren-topics-setup.env', template);
console.log('📁 Saved template to: .mclaren-topics-setup.env\n');
