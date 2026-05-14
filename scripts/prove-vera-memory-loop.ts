#!/usr/bin/env tsx
/**
 * Generate a local evidence packet for Vera's Hedera-backed memory loop.
 *
 * This proves the deterministic first-party loop locally:
 * task -> agent -> result -> verification -> settlement -> reputation -> receipt -> memory packet
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { VerifiableAIProofKernel } from '../src/vera/proofKernel/proofKernel.js';
import { buildProofRunMemoryPacket, validateVeraMemoryPacket } from '../src/vera/memory/veraMemoryPacket.js';
import { VeraMemoryReplayWorker } from '../src/vera/memory/mirrorReplayWorker.js';
import { veraMemoryReplayStore } from '../src/vera/memory/veraMemoryReplayStore.js';
import { config } from '../src/config.js';

const outputDir = readArg('--output-dir') ?? 'docs/evidence';
const description = readArg('--description') ?? 'Publish a proof-backed Vera memory packet for a Hedera AI task';
const serviceType = readArg('--service-type') ?? 'proof-publisher';
const requireHcsSubmitted = process.argv.includes('--require-hcs-submitted');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const kernel = new VerifiableAIProofKernel({ ledger: null });
const run = await kernel.runTask({
  description,
  serviceType,
  payload: {
    proofGoal: 'full_loop_memory_packet',
    requestedBy: 'prove-vera-memory-loop.ts',
  },
  budgetHbar: 1,
  requiredConfidence: 0.7,
  metadata: {
    evidenceRun: true,
    generatedAt: new Date().toISOString(),
  },
});

const packet = buildProofRunMemoryPacket(run, {
  network: config.HEDERA_NETWORK,
  eventId: run.memoryPacket?.eventId,
  createdAtIso: new Date(run.createdAt).toISOString(),
});
const packetIssues = validateVeraMemoryPacket(packet);
const replay = new VeraMemoryReplayWorker();
const replayed = replay.ingestMirrorMessages([
  {
    sequence_number: run.memoryPacket?.hcsSequence ?? 1,
    consensus_timestamp: new Date().toISOString(),
    transaction_id: run.memoryPacket?.transactionId,
    message: JSON.stringify({
      _hip993: {
        chunk: 1,
        total: 1,
        messageId: `local-${run.runId}`,
        chunked: false,
      },
      data: JSON.stringify(packet),
    }),
  },
]);
const replayStats = replay.getStats();
const storedReplayRecords = await veraMemoryReplayStore.ingestRecords(replayed);
const replayStoreSummary = await veraMemoryReplayStore.getSummary();

const evidence = {
  generatedAt: new Date().toISOString(),
  status: packetIssues.length === 0
    && replayed.length === 1
    && run.status === 'proof_complete'
    && (!requireHcsSubmitted || run.memoryPacket?.hcsWriteMode === 'submitted')
    ? requireHcsSubmitted ? 'proved_on_hcs' : 'proved_locally'
    : 'needs_review',
  requirements: {
    hcsSubmittedRequired: requireHcsSubmitted,
    hcsSubmitted: run.memoryPacket?.hcsWriteMode === 'submitted',
  },
  run,
  memoryPacket: packet,
  packetIssues,
  replay: {
    indexedPackets: replayed.length,
    packetHashFound: Boolean(packet.proof.packetHash && replay.getByPacketHash(packet.proof.packetHash)),
    taskRecords: replay.getByTaskId(run.task.taskId).length,
    agentRecords: replay.getByAgentId(run.selectedAgent.agentId).length,
    stats: replayStats,
    storedRecords: storedReplayRecords.length,
    storeSummary: replayStoreSummary,
  },
};

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const jsonPath = join(outputDir, `vera-memory-loop-${stamp}.json`);
const mdPath = join(outputDir, `vera-memory-loop-${stamp}.md`);

writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
writeFileSync(mdPath, renderMarkdown(evidence));

console.log(`Vera memory loop evidence: ${resolve(mdPath)}`);
console.log(`Raw evidence JSON: ${resolve(jsonPath)}`);
console.log(`Run status: ${run.status}`);
console.log(`Memory packet hash: ${packet.proof.packetHash}`);
console.log(`Packet issues: ${packetIssues.length}`);
console.log(`Replay indexed packets: ${evidence.replay.indexedPackets}`);
console.log(`Replay stored records: ${evidence.replay.storedRecords}`);
console.log(`HCS submitted required: ${requireHcsSubmitted}`);
console.log(`Memory HCS write mode: ${run.memoryPacket?.hcsWriteMode ?? 'unknown'}`);

if (
  packetIssues.length > 0
  || run.status !== 'proof_complete'
  || evidence.replay.indexedPackets !== 1
  || (requireHcsSubmitted && run.memoryPacket?.hcsWriteMode !== 'submitted')
) {
  process.exit(1);
}

process.exit(0);

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function renderMarkdown(input: typeof evidence): string {
  const eventTypes = input.run.events.map((event) => event.type).join(' -> ');
  return `# Vera Memory Loop Evidence

## Summary

- Generated: ${input.generatedAt}
- Status: ${input.status}
- Run ID: \`${input.run.runId}\`
- Task ID: \`${input.run.task.taskId}\`
- Agent: \`${input.run.selectedAgent.agentId}\`
- Verification: ${input.run.verification.outcome} (${input.run.verification.score})
- Settlement: ${input.run.settlement.state} (${input.run.settlement.amountHbar} HBAR)
- Reputation: ${input.run.reputation.agentId} -> ${input.run.reputation.scoreAfter}
- Receipt hash: \`${input.run.receipt.localProofHash}\`
- Memory packet hash: \`${input.memoryPacket.proof.packetHash}\`
- Receipt HCS write mode: ${input.run.events.at(-1)?.metadata.hcsWriteMode ?? 'unknown'}
- Memory HCS write mode: ${input.run.memoryPacket?.hcsWriteMode ?? 'unknown'}
- HCS submitted required: ${input.requirements.hcsSubmittedRequired ? 'yes' : 'no'}

## Event Chain

\`\`\`text
${eventTypes}
\`\`\`

## Memory Packet

- Schema: \`${input.memoryPacket._vera.schema}\`
- Event type: \`${input.memoryPacket._vera.eventType}\`
- Event ID: \`${input.memoryPacket._vera.eventId}\`
- Network: \`${input.memoryPacket._vera.network}\`
- Packet hash: \`${input.memoryPacket.proof.packetHash}\`
- Result hash: \`${input.memoryPacket.proof.resultHash}\`
- Settlement hash: \`${input.memoryPacket.proof.settlementHash}\`
- Reputation hash: \`${input.memoryPacket.proof.reputationHash}\`

## Validation

${input.packetIssues.length === 0 ? '- Memory packet validation passed.' : input.packetIssues.map((issue) => `- Missing: ${issue}`).join('\n')}

## Mirror Replay

- Indexed packets: ${input.replay.indexedPackets}
- Packet hash found: ${input.replay.packetHashFound ? 'yes' : 'no'}
- Task records: ${input.replay.taskRecords}
- Agent records: ${input.replay.agentRecords}
- Pending chunk groups: ${input.replay.stats.pendingChunkGroups}
- Invalid packets: ${input.replay.stats.invalidPackets}

## Production Boundary

This proves the full loop locally. The next promotion step is a funded testnet run with submitted HCS transaction ID, topic ID, sequence number, HashScan link, and mirror-node replay.
`;
}
