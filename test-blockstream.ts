/**
 * Local test for HIP-1056 Block Stream mock node + consumer
 *
 * Run: npx tsx test-blockstream.ts
 */

import { startMockBlockNode, stopMockBlockNode } from './src/blocknode/mockBlockNode.js';
import { BlockStreamConsumer } from './src/blocknode/blockStreamService.js';

async function main() {
  console.log('=== Vera HIP-1056 Block Stream Test ===\n');

  // 1. Start mock block node
  await startMockBlockNode({ port: 8085, blockIntervalMs: 2000 });
  console.log(`Mock node running on localhost:8085`);

  // 2. Start consumer
  const consumer = new BlockStreamConsumer({
    endpoint: 'localhost:8085',
    filterTopics: ['0.0.1774506'],
  });

  // Event handlers
  consumer.on('block_header', (item) => {
    console.log(`[BLOCK] #${item.blockNumber} ${new Date().toISOString()}`);
  });

  consumer.on('round_header', (item) => {
    console.log(`[ROUND] #${item.roundNumber}`);
  });

  consumer.on('hcs_message', (msg) => {
    console.log(`[HCS]   topic=${msg.topicId} seq=${msg.sequenceNumber} tx=${msg.transactionHash.slice(0, 16)}...`);
  });

  consumer.on('block_proof', (proof) => {
    console.log(`[PROOF] block=${proof.blockNumber} signers=${(proof.payload as any).signers?.length ?? 0}`);
  });

  consumer.start();
  console.log('Consumer connected\n');

  // 3. Run for 10 seconds, then show stats
  await new Promise(r => setTimeout(r, 10000));

  const stats = consumer.getStats();
  console.log('\n=== Consumer Stats ===');
  console.log(`  Connected:          ${stats.connected}`);
  console.log(`  Items received:     ${stats.itemsReceived}`);
  console.log(`  HCS extracted:      ${stats.hcsMessagesExtracted}`);
  console.log(`  Last block:         ${stats.lastBlockNumber}`);
  console.log(`  Last round:         ${stats.lastRoundNumber}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Stream latency:     ${stats.streamLatencyMs}ms`);

  // 4. Cleanup
  consumer.stop();
  await stopMockBlockNode();
  console.log('\nTest complete. Block stream pipeline is functional.');
}

main().catch(console.error);
