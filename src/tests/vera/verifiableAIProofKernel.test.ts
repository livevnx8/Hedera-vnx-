import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowEvidenceLedger } from '../../vera/workflows/workflowEvidenceLedger.js';
import { VerifiableAIProofKernel } from '../../vera/proofKernel/proofKernel.js';
import { buildProofRunMemoryPacket, validateVeraMemoryPacket } from '../../vera/memory/veraMemoryPacket.js';
import { config } from '../../config.js';
import type { MeridianShadowScorer } from '../../vera/proofKernel/meridianShadow.js';
import type { VerifiableAITask } from '../../vera/proofKernel/types.js';

function deterministicIds() {
  let next = 0;
  return () => `id-${++next}`;
}

function deterministicNow() {
  let now = 1_770_000_000_000;
  return () => ++now;
}

describe('VerifiableAIProofKernel', () => {
  let tempDir: string;
  let ledger: WorkflowEvidenceLedger;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vera-proof-kernel-'));
    ledger = new WorkflowEvidenceLedger(path.join(tempDir, 'ledger.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs the first-party proof loop without needing external agent supply', async () => {
    const kernel = new VerifiableAIProofKernel({
      ledger,
      now: deterministicNow(),
      id: deterministicIds(),
      meridian: {
        async score() {
          return { status: 'disabled' };
        },
      },
    });

    const run = await kernel.runTask({
      description: 'Publish an HCS proof receipt for an AI result',
      serviceType: 'proof-publisher',
      payload: { transactionId: '0.0.1001-1-2', hcsTopicId: '0.0.999' },
      budgetHbar: 1,
      requiredConfidence: 0.7,
    });

    expect(run.status).toBe('proof_complete');
    expect(run.productionLabel).toBe('prototype');
    expect(run.selectedAgent.agentId).toBe('proof-publisher');
    expect(run.receipt.localProofHash).toBeTruthy();
    expect(run.memoryPacket).toMatchObject({
      schema: 'vera.memory.packet.v1',
      eventType: 'task.proof_complete',
      hcsWriteMode: 'skipped',
    });
    expect(run.memoryPacket?.eventId).toBeTruthy();
    expect(run.memoryPacket?.packetHash).toBeTruthy();
    expect(run.events.at(-1)?.metadata).toMatchObject({
      hcsWriteMode: 'skipped',
    });
    expect(run.events.map((event) => event.type)).toEqual([
      'task_created',
      'escalation_auto_resolved',
      'agent_selected',
      'execution_started',
      'result_submitted',
      'verification_passed',
      'settlement_recorded',
      'reputation_updated',
      'hcs_proof_emitted',
    ]);

    for (let i = 1; i < run.events.length; i++) {
      expect(run.events[i].previousHash).toBe(run.events[i - 1].hash);
    }

    const loops = await ledger.listLoops();
    expect(loops).toHaveLength(1);
    expect(loops[0].status).toBe('closed');
    expect(loops[0].evidence.map((evidence) => evidence.stage)).toEqual([
      'task',
      'award',
      'execution',
      'verification',
      'settlement',
      'reputation',
      'receipt',
    ]);
  });

  it('builds a valid Hedera-backed memory packet from the closed proof loop', async () => {
    const kernel = new VerifiableAIProofKernel({
      ledger,
      now: deterministicNow(),
      id: deterministicIds(),
      meridian: {
        async score() {
          return { status: 'disabled' };
        },
      },
    });

    const run = await kernel.runTask({
      description: 'Verify a settlement and reputation proof packet',
      serviceType: 'marketplace-quality',
      payload: { settlementId: 'stl-1', reputationScore: 0.91 },
      budgetHbar: 1,
    });

    const packet = buildProofRunMemoryPacket(run, {
      network: config.HEDERA_NETWORK,
      eventId: run.memoryPacket?.eventId,
      createdAtIso: new Date(run.createdAt).toISOString(),
    });

    expect(validateVeraMemoryPacket(packet)).toEqual([]);
    expect(packet._vera).toMatchObject({
      schema: 'vera.memory.packet.v1',
      eventType: 'task.proof_complete',
      taskId: run.task.taskId,
      agentId: run.selectedAgent.agentId,
      runId: run.runId,
      learnable: false,
      privacy: 'public_summary',
    });
    expect(packet._hip993).toMatchObject({
      type: 'VERA_MEMORY_PACKET',
      max_chunk_size: 4096,
    });
    expect(packet.proof.resultHash).toBe(run.execution.proofHash);
    expect(packet.proof.packetHash).toBe(run.memoryPacket?.packetHash);
    expect(packet.refs.dashboardPath).toBe(`/api/vera/verifiable-ai/runs/${run.runId}`);
    expect(packet.summary.shortText).toContain('closed with accepted verification');
  });

  it('keeps Meridian in shadow mode instead of letting it override deterministic routing', async () => {
    const meridian: MeridianShadowScorer = {
      async score(_task: VerifiableAITask, _candidateAgentIds: string[]) {
        return {
          status: 'scored',
          model: 'meridian-test',
          recommendation: 'carbon-verifier',
          proofCompleteness: 'operator_review',
        };
      },
    };
    const kernel = new VerifiableAIProofKernel({
      ledger,
      now: deterministicNow(),
      id: deterministicIds(),
      meridian,
    });

    const run = await kernel.runTask({
      description: 'Package a proof publisher receipt',
      serviceType: 'proof-publisher',
      budgetHbar: 1,
    });

    expect(run.selectedAgent.agentId).toBe('proof-publisher');
    expect(run.selection.meridian.status).toBe('scored');
    expect(run.selection.meridian.recommendation).toBe('carbon-verifier');
    expect(run.events.find((event) => event.type === 'agent_selected')?.metadata).toMatchObject({
      selectionPolicy: 'deterministic-first-party-meridian-shadow',
    });
  });

  it('exposes the built-in agents that solve marketplace cold start', () => {
    const kernel = new VerifiableAIProofKernel({ ledger: null });
    const agents = kernel.listFirstPartyAgents();

    expect(agents.length).toBeGreaterThanOrEqual(8);
    expect(agents.map((agent) => agent.agentId)).toContain('agent-builder');
    expect(agents.map((agent) => agent.agentId)).toContain('marketplace-quality-scorer');
    expect(agents.map((agent) => agent.agentId)).toContain('proof-publisher');
  });
});
