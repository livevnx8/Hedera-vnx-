#!/usr/bin/env node
/**
 * Force Flush Pending Falcon Handshakes to HCS
 */

import { QVXFalconHandshake } from './agents/vera-qvx-falcon-handshake.mjs';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 Force flushing pending HCS messages...\n');

const handshake = new QVXFalconHandshake();

await handshake.initialize();

// Check pending
console.log(`Pending messages: ${handshake.messageBatch.length}`);
console.log(`Batched so far: ${handshake.batchedMessages}`);

// Force flush
if (handshake.messageBatch.length > 0) {
  await handshake.flushBatch();
  console.log('\n✅ Flushed to HCS!');
  console.log(`Topic: ${handshake.topicId}`);
  console.log(`Total batched: ${handshake.batchedMessages}`);
  console.log(`HBAR saved: ~${handshake.batchSavings.toFixed(4)}`);
} else {
  console.log('\nℹ️ No pending messages in batch queue');
}

handshake.close();
