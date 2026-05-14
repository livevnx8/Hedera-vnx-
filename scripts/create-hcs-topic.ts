#!/usr/bin/env node
/**
 * Create HCS Topic for Vera Proofs
 *
 * Creates a Hedera Consensus Service topic for publishing verifiable AI proofs.
 *
 * Usage:
 *   npx tsx scripts/create-hcs-topic.ts [--network testnet|mainnet] [--memo "Vera Proofs"]
 */

import { Client, TopicCreateTransaction, TopicId } from '@hashgraph/sdk';
import { config } from '../src/config.js';

async function createTopic(): Promise<void> {
  console.log('🔨 Creating HCS Topic for Vera Proofs\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const networkArg = args.find((arg) => arg.startsWith('--network'));
  const memoArg = args.find((arg) => arg.startsWith('--memo'));

  const network = (networkArg ? networkArg.split('=')[1] : config.HEDERA_NETWORK || 'testnet') as
    | 'testnet'
    | 'mainnet'
    | 'previewnet';
  const memo = memoArg ? memoArg.split('=')[1] : 'Vera AI Proofs';

  console.log(`📡 Network: ${network}`);
  console.log(`📝 Memo: ${memo}\n`);

  // Check for credentials (support both naming conventions)
  const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY || process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    console.error('❌ ERROR: Hedera credentials not configured.');
    console.error('   Set HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY env vars');
    console.error('   Or: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY');
    process.exit(1);
  }

  // Create client
  let client: Client;
  switch (network) {
    case 'mainnet':
      client = Client.forMainnet();
      break;
    case 'previewnet':
      client = Client.forPreviewnet();
      break;
    case 'testnet':
    default:
      client = Client.forTestnet();
  }

  client.setOperator(operatorId, operatorKey);

  console.log(`👤 Operator: ${operatorId}\n`);

  try {
    // Create topic
    console.log('⏳ Submitting topic creation transaction...');

    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(client.operatorPublicKey!)
      .setSubmitKey(client.operatorPublicKey!) // Only operator can submit
      .execute(client);

    const record = await tx.getRecord(client);
    const topicId = record.receipt.topicId;

    if (!topicId) {
      throw new Error('Topic ID not returned from transaction');
    }

    const topicIdString = topicId.toString();

    console.log('\n✅ Topic created successfully!\n');
    console.log('========================================');
    console.log('HCS Topic Details');
    console.log('========================================');
    console.log(`Topic ID: ${topicIdString}`);
    console.log(`Transaction ID: ${record.transactionId.toString()}`);
    console.log(`Memo: ${memo}`);
    console.log(`Network: ${network}`);
    console.log(`HashScan: https://hashscan.io/${network}/topic/${topicIdString}`);
    console.log('========================================\n');

    console.log('📝 Add to your .env file:');
    console.log(`VERA_PROOF_TOPIC_ID=${topicIdString}\n`);

    console.log('🚀 Next steps:');
    console.log('1. Add VERA_PROOF_TOPIC_ID to your .env file');
    console.log('2. Fund the operator account with HBAR for transaction fees');
    console.log('3. Run: npx tsx scripts/prove-vera-hcs-loop.ts');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR: Failed to create topic:', error);
    console.error('\nTroubleshooting:');
    console.error('- Ensure operator account has sufficient HBAR');
    console.error('- Check HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are correct');
    console.error('- Verify network connectivity');
    process.exit(1);
  }
}

createTopic().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
