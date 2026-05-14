/**
 * Example 02: Create HCS Topic
 * 
 * Demonstrates creating and interacting with Hedera Consensus Service topics
 * 
 * Run: node examples/sandbox/02-create-topic.mjs
 */

import { 
  Client, 
  TopicCreateTransaction, 
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  PrivateKey 
} from '@hashgraph/sdk';

// Configuration
const NETWORK = process.env.HEDERA_NETWORK || 'testnet';
const OPERATOR_ID = process.env.HEDERA_TESTNET_ACCOUNT_ID;
const OPERATOR_KEY = process.env.HEDERA_TESTNET_PRIVATE_KEY;

console.log('🧪 Vera Sandbox - Create HCS Topic Example\n');

async function createTopicExample() {
  // Check for credentials
  if (!OPERATOR_ID || !OPERATOR_KEY) {
    console.log('⚠️  No Hedera credentials found in environment');
    console.log('   Expected: HEDERA_TESTNET_ACCOUNT_ID and HEDERA_TESTNET_PRIVATE_KEY');
    console.log('   Running in MOCK MODE with simulated results\n');
    
    await mockTopicExample();
    return;
  }

  try {
    // Initialize client
    console.log(`1️⃣  Initializing Hedera client (${NETWORK})...`);
    const client = NETWORK === 'testnet' 
      ? Client.forTestnet() 
      : Client.forMainnet();
    
    const privateKey = PrivateKey.fromStringED25519(OPERATOR_KEY);
    client.setOperator(OPERATOR_ID, privateKey);
    console.log('   ✅ Client initialized');
    console.log(`   Account: ${OPERATOR_ID}\n`);

    // Create topic
    console.log('2️⃣  Creating HCS topic...');
    const createTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera Sandbox Test Topic')
      .setAdminKey(privateKey.publicKey)
      .execute(client);

    const createReceipt = await createTx.getReceipt(client);
    const topicId = createReceipt.topicId.toString();
    
    console.log('   ✅ Topic created!');
    console.log(`   Topic ID: ${topicId}`);
    console.log(`   Hashscan: https://hashscan.io/${NETWORK}/topic/${topicId}\n`);

    // Submit message
    console.log('3️⃣  Submitting message...');
    const message = JSON.stringify({
      type: 'TEST_MESSAGE',
      timestamp: Date.now(),
      data: { hello: 'from Vera Sandbox' }
    });

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    const submitReceipt = await submitTx.getReceipt(client);
    console.log('   ✅ Message submitted!');
    console.log(`   Sequence Number: ${submitReceipt.topicSequenceNumber.toString()}\n`);

    // Query messages
    console.log('4️⃣  Querying topic messages...');
    await new Promise(r => setTimeout(r, 3000)); // Wait for mirror node
    
    const messages = await new TopicMessageQuery()
      .setTopicId(topicId)
      .setLimit(10)
      .execute(client);

    console.log(`   ✅ Found ${messages.length} message(s)`);
    messages.forEach((msg, i) => {
      console.log(`   [${i + 1}] Seq ${msg.sequenceNumber}: ${msg.contents.toString().substring(0, 50)}...`);
    });
    console.log();

    // Summary
    console.log('🎉 Topic Example Complete!');
    console.log(`\nTopic Details:`);
    console.log(`  ID: ${topicId}`);
    console.log(`  Network: ${NETWORK}`);
    console.log(`  Explorer: https://hashscan.io/${NETWORK}/topic/${topicId}`);
    console.log(`\nNext steps:`);
    console.log('  → Try example 03: node examples/sandbox/03-deploy-agent.mjs');
    console.log('  → Deploy your own agent using this topic');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.status) {
      console.error('   Status:', error.status);
    }
    console.log('\nTroubleshooting:');
    console.log('  1. Check credentials in .env.sandbox.local');
    console.log('  2. Ensure testnet account has HBAR');
    console.log('  3. Try mock mode: MOCK_MODE=true node examples/sandbox/02-create-topic.mjs');
  }
}

async function mockTopicExample() {
  // Simulate topic operations without actual Hedera network
  const mockTopicId = `0.0.${Math.floor(Math.random() * 1000000)}`;
  
  console.log('1️⃣  Initializing MOCK client...');
  console.log('   ✅ Mock client initialized (no real network)\n');

  console.log('2️⃣  Creating MOCK topic...');
  await new Promise(r => setTimeout(r, 500));
  console.log('   ✅ Mock topic created!');
  console.log(`   Topic ID: ${mockTopicId}`);
  console.log(`   Hashscan: https://hashscan.io/testnet/topic/${mockTopicId}\n`);

  console.log('3️⃣  Submitting MOCK message...');
  const message = {
    type: 'MOCK_MESSAGE',
    timestamp: Date.now(),
    data: { hello: 'from Vera Sandbox (MOCK)' }
  };
  await new Promise(r => setTimeout(r, 300));
  console.log('   ✅ Mock message submitted!');
  console.log(`   Sequence Number: 1\n`);

  console.log('4️⃣  Querying MOCK messages...');
  await new Promise(r => setTimeout(r, 200));
  console.log('   ✅ Found 1 mock message');
  console.log(`   [1] Seq 1: ${JSON.stringify(message).substring(0, 50)}...\n`);

  console.log('🎉 Mock Topic Example Complete!');
  console.log('\nTo use real Hedera:');
  console.log('  1. Run: node scripts/setup-testnet.mjs');
  console.log('  2. Set credentials: source .env.sandbox.local');
  console.log('  3. Re-run this example');
}

createTopicExample();
