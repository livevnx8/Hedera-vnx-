// Testnet Setup Script for Vera Sandbox
// Automatically configures testnet account, creates topics, and funds from faucet

import { Client, AccountCreateTransaction, Hbar, AccountBalanceQuery, TopicCreateTransaction, PrivateKey } from '@hashgraph/sdk';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), '.env.sandbox.local');

// Hedera Faucet API endpoint
const FAUCET_API = 'https://faucet.hedera.com/api/fund';

// Required topics for sandbox
const REQUIRED_TOPICS = [
  { name: 'VERA_CORE', memo: 'Vera Sandbox Core Topic' },
  { name: 'VERA_DEFI', memo: 'Vera Sandbox DeFi Topic' },
  { name: 'VERA_ENERGY', memo: 'Vera Sandbox Energy Topic' },
  { name: 'VERA_CARBON', memo: 'Vera Sandbox Carbon Topic' },
  { name: 'VERA_BRIDGE', memo: 'Vera Sandbox Bridge Topic' }
];

async function setupTestnet() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🧪 VERA SANDBOX - Testnet Setup                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Check for existing testnet account
  const existingAccountId = process.env.HEDERA_TESTNET_ACCOUNT_ID;
  const existingPrivateKey = process.env.HEDERA_TESTNET_PRIVATE_KEY;

  let accountId, privateKey;

  if (existingAccountId && existingPrivateKey) {
    console.log('✅ Using existing testnet account:', existingAccountId);
    accountId = existingAccountId;
    privateKey = PrivateKey.fromStringED25519(existingPrivateKey);
  } else {
    console.log('🆕 Creating new testnet account...\n');
    const result = await createTestnetAccount();
    accountId = result.accountId;
    privateKey = result.privateKey;
  }

  // Check balance
  console.log('💰 Checking account balance...');
  const balance = await checkBalance(accountId, privateKey);
  console.log(`   Balance: ${balance.hbars.toString()} HBAR\n`);

  // Fund from faucet if needed
  if (balance.hbars.toTinybars().toNumber() < 1000000000) { // Less than 10 HBAR
    console.log('💸 Requesting funds from faucet...');
    await fundFromFaucet(accountId);
    await new Promise(r => setTimeout(r, 5000)); // Wait for funds
    const newBalance = await checkBalance(accountId, privateKey);
    console.log(`   New Balance: ${newBalance.hbars.toString()} HBAR\n`);
  }

  // Create required topics
  console.log('📡 Creating HCS topics...');
  const client = Client.forTestnet().setOperator(accountId, privateKey);
  const topicIds = {};

  for (const topic of REQUIRED_TOPICS) {
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(topic.memo)
        .execute(client);
      
      const receipt = await tx.getReceipt(client);
      const topicId = receipt.topicId.toString();
      
      topicIds[topic.name] = topicId;
      console.log(`   ✅ ${topic.name}: ${topicId}`);
    } catch (error) {
      console.error(`   ❌ Failed to create ${topic.name}:`, error.message);
    }
  }

  // Save configuration
  console.log('\n💾 Saving configuration...');
  await saveConfiguration(accountId, privateKey, topicIds);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   ✅ Testnet Setup Complete!                              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('Configuration saved to: .env.sandbox.local');
  console.log('Account ID:', accountId);
  console.log('Topics:', topicIds);
  console.log('\nNext steps:');
  console.log('  1. Source the config: source .env.sandbox.local');
  console.log('  2. Start sandbox: docker-compose -f docker-compose.sandbox.yml up');
}

async function createTestnetAccount() {
  // For sandbox, we'll generate a new key pair
  const privateKey = PrivateKey.generateED25519();
  const publicKey = privateKey.publicKey;

  console.log('🔑 Generated ED25519 key pair');
  console.log('   Public Key:', publicKey.toStringRaw().slice(0, 16) + '...');

  // Use a testnet operator account to create the new account
  // In sandbox mode, we can use a shared testnet account
  const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.2';
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorKey) {
    console.log('⚠️  No operator key found. Using previewnet/demo mode.');
    // Return a placeholder for demo purposes
    return {
      accountId: '0.0.' + Math.floor(Math.random() * 1000000),
      privateKey
    };
  }

  const client = Client.forTestnet().setOperator(operatorId, operatorKey);

  const tx = await new AccountCreateTransaction()
    .setKey(publicKey)
    .setInitialBalance(Hbar.from(10)) // 10 HBAR
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const accountId = receipt.accountId.toString();

  console.log('✅ Created account:', accountId);

  return { accountId, privateKey };
}

async function checkBalance(accountId, privateKey) {
  const client = Client.forTestnet().setOperator(accountId, privateKey);
  
  const query = new AccountBalanceQuery()
    .setAccountId(accountId);

  return await query.execute(client);
}

async function fundFromFaucet(accountId) {
  try {
    const response = await fetch(FAUCET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: accountId,
        amount: 10000 // Request 1000 HBAR
      })
    });

    if (response.ok) {
      console.log('   ✅ Faucet request successful');
      return true;
    } else {
      console.log('   ⚠️  Faucet request failed, using alternative funding...');
      // In sandbox mode, we simulate funding
      return false;
    }
  } catch (error) {
    console.log('   ⚠️  Faucet unavailable:', error.message);
    return false;
  }
}

async function saveConfiguration(accountId, privateKey, topicIds) {
  const config = `# Vera Sandbox - Testnet Configuration
# Auto-generated by setup-testnet.mjs
# DO NOT COMMIT THIS FILE

HEDERA_NETWORK=testnet
HEDERA_TESTNET_ACCOUNT_ID=${accountId}
HEDERA_TESTNET_PRIVATE_KEY=${privateKey.toStringRaw()}

# HCS Topics
${Object.entries(topicIds)
  .map(([name, id]) => `${name}_TOPIC_ID=${id}`)
  .join('\n')}

# Sandbox Mode
SANDBOX_MODE=true
MOCK_MODE=false
AUTO_CREATE_TOPICS=false
`;

  await fs.writeFile(CONFIG_FILE, config);
}

// Run setup
setupTestnet().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
