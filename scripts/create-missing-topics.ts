#!/usr/bin/env node
/**
 * Create the 6 missing Vera HCS topics on Hedera mainnet
 */

import {
  Client,
  TopicCreateTransaction,
  PrivateKey,
} from '@hashgraph/sdk';
import { logger } from '../src/monitoring/logger.js';
import { config } from '../src/config.js';
import { writeFile, readFile } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const missingTopics = [
  { key: 'VERA_TASK_TOPIC_ID', name: 'Vera Task', memo: 'task-publish-bid-award' },
  { key: 'VERA_RESULT_TOPIC_ID', name: 'Vera Result', memo: 'result-verification-delivery' },
  { key: 'VERA_AUDIT_TOPIC_ID', name: 'Vera Audit', memo: 'immutable-audit-compliance' },
  { key: 'VERA_BEACON_TOPIC_ID', name: 'Vera Beacon', memo: 'orchestrator-heartbeat-sos' },
  { key: 'VERA_HOT_TOPICS_TOPIC_ID', name: 'Vera Hot Topics', memo: 'trend-detection-priority' },
  { key: 'VERA_FEDERATION_HANDSHAKE_TOPIC_ID', name: 'Vera Federation Handshake', memo: 'cross-swarm-auth-trust' },
];

function getClient(): Client | null {
  const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK || 'mainnet';

  if (!operatorId || !operatorKey) {
    logger.error('CreateTopics', { error: 'Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY' });
    return null;
  }

  try {
    const client = network === 'mainnet'
      ? Client.forMainnet()
      : network === 'testnet'
        ? Client.forTestnet()
        : Client.forPreviewnet();

    // Try to detect key type and parse accordingly
    let privateKey: PrivateKey;
    
    // Check if it's a hex string (starts with 0x or is 64/96 chars)
    const cleanKey = operatorKey.replace('0x', '').trim();
    
    if (cleanKey.length === 64) {
      // Likely ED25519 raw hex
      try {
        privateKey = PrivateKey.fromStringED25519(cleanKey);
        logger.info('CreateTopics', { message: 'Using ED25519 key format' });
      } catch {
        // Try ECDSA
        privateKey = PrivateKey.fromStringECDSA(cleanKey);
        logger.info('CreateTopics', { message: 'Using ECDSA key format' });
      }
    } else if (cleanKey.length === 96) {
      // Likely ECDSA raw hex
      privateKey = PrivateKey.fromStringECDSA(cleanKey);
      logger.info('CreateTopics', { message: 'Using ECDSA key format (96 char)' });
    } else if (cleanKey.startsWith('302e020100300506032b657004220420') || cleanKey.includes('302e')) {
      // DER encoded ED25519
      privateKey = PrivateKey.fromStringDer(cleanKey);
      logger.info('CreateTopics', { message: 'Using DER encoded key' });
    } else {
      // Try standard fromString (auto-detect)
      privateKey = PrivateKey.fromString(operatorKey);
      logger.info('CreateTopics', { message: 'Using auto-detected key format' });
    }

    client.setOperator(operatorId, privateKey);
    return client;
  } catch (error) {
    logger.error('CreateTopics', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function createTopic(client: Client, name: string, memo: string): Promise<string | null> {
  try {
    const tx = new TopicCreateTransaction()
      .setTopicMemo(`${name} | ${memo}`);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId!.toString();

    logger.info('CreateTopics', {
      message: 'Topic created',
      name,
      topicId,
      memo,
    });

    return topicId;
  } catch (error) {
    logger.error('CreateTopics', {
      error: error instanceof Error ? error.message : String(error),
      name,
    });
    return null;
  }
}

async function updateEnvFile(createdTopics: { key: string; topicId: string }[]) {
  const envPath = '/home/vera-live-0-1/hedera-llm-api/.env';
  let envContent = await readFile(envPath, 'utf-8');

  for (const { key, topicId } of createdTopics) {
    // Check if already exists
    if (envContent.includes(`${key}=`)) {
      // Replace existing
      envContent = envContent.replace(
        new RegExp(`${key}=.*`, 'g'),
        `${key}=${topicId}`
      );
    } else {
      // Add at end
      envContent += `\n${key}=${topicId}`;
    }
  }

  await writeFile(envPath, envContent);
  logger.info('CreateTopics', { message: 'Updated .env file', count: createdTopics.length });
}

async function main() {
  logger.info('CreateTopics', { message: 'Creating missing topics', count: missingTopics.length });

  const client = getClient();
  if (!client) {
    console.error('❌ Failed to initialize Hedera client');
    process.exit(1);
  }

  const created: { key: string; topicId: string }[] = [];

  for (const topic of missingTopics) {
    logger.info('CreateTopics', { message: `Creating ${topic.name}...` });
    const topicId = await createTopic(client, topic.name, topic.memo);
    if (topicId) {
      created.push({ key: topic.key, topicId });
    }
    // Small delay between creations
    await new Promise(r => setTimeout(r, 1000));
  }

  if (created.length > 0) {
    await updateEnvFile(created);
  }

  logger.info('CreateTopics', {
    message: 'Complete',
    created: created.length,
    failed: missingTopics.length - created.length,
  });

  // Print summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  TOPIC CREATION SUMMARY');
  console.log('══════════════════════════════════════════════════════════════\n');

  for (const { key, topicId } of created) {
    console.log(`  ✅ ${key}=${topicId}`);
    console.log(`     https://hashscan.io/mainnet/topic/${topicId}`);
  }

  const failed = missingTopics.filter(t => !created.find(c => c.key === t.key));
  for (const topic of failed) {
    console.log(`  ❌ ${topic.key} - FAILED`);
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');
  console.log('💡 Run `npm run show:topics` to see all configured topics');
  console.log('');
}

main().catch(error => {
  logger.error('CreateTopics', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
