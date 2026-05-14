import { randomUUID } from 'crypto';
import { canonicalJson, sha256Base64 } from '../../crypto.js';
import { ResultVerifier } from '../orchestrator/resultVerifier.js';
import { WorkflowEvidenceLedger, workflowEvidenceLedger } from '../workflows/workflowEvidenceLedger.js';
import {
  executeFirstPartyAgent,
  FIRST_PARTY_VERA_AGENTS,
  getFirstPartyAgent,
  scoreFirstPartyAgents,
} from './firstPartyAgents.js';
import { meridianShadowScorer, type MeridianShadowScorer, type EnhancedMeridianShadowScore } from './meridianShadow.js';
import { emitProofReceiptToHcs } from './proofReceiptEmitter.js';
import { quantumProofProcessor, QuantumProofProcessor } from './quantumIntegration.js';
import {
  latticeProofIntegrator,
  LatticeProofIntegrator,
} from './latticeProofIntegration.js';
import {
  slackNotifier,
  SlackNotifier,
} from '../notifications/slackNotifier.js';
import { buildProofRunMemoryPacket } from '../memory/veraMemoryPacket.js';
import { emitVeraMemoryPacketToHcs } from '../memory/veraMemoryEmitter.js';
import { config } from '../../config.js';
import {
  shadowCouncil,
  ShadowCouncil,
  type EnsembleScore,
} from './shadowCouncil.js';
import {
  evaluateEscalation,
  createEscalationEvent,
  attemptAutoResolution,
  type EscalationEvent,
} from './humanEscalation.js';
import type {
  MeridianShadowScore,
  VerifiableAITask,
  VerifiableAITaskInput,
  AgentExecutionResult,
  ProofKernelVerification,
  ProofKernelSettlement,
  ProofKernelReputation,
  FirstPartyAgentProfile,
  ProofEvent,
  ProofEventType,
  VerifiableAIProofRun,
} from './types.js';

export interface ProofKernelOptions {
  meridian?: MeridianShadowScorer;
  ledger?: WorkflowEvidenceLedger | null;
  now?: () => number;
  id?: () => string;
  useEnsemble?: boolean; // Use Shadow Council multi-Meridian ensemble
  ensembleMinConsensus?: number; // Minimum models required for consensus
}

function normalizeServiceType(input?: string, description = ''): string {
  if (input?.trim()) return input.trim();
  const lowered = description.toLowerCase();
  if (lowered.includes('carbon') || lowered.includes('dovu')) return 'carbon-verification';
  if (lowered.includes('compliance') || lowered.includes('policy')) return 'compliance-audit';
  if (lowered.includes('hcs') || lowered.includes('proof') || lowered.includes('receipt')) return 'proof-publisher';
  if (lowered.includes('agent')) return 'agent-builder';
  if (lowered.includes('quality') || lowered.includes('reputation')) return 'marketplace-quality';
  if (lowered.includes('rig') || lowered.includes('harmony')) return 'operator-harmony';
  return 'proof-publisher';
}

function hashPayload(payload: unknown): string {
  return sha256Base64(canonicalJson(payload));
}

export class VerifiableAIProofKernel {
  private readonly runs = new Map<string, VerifiableAIProofRun>();
  private readonly verifier = new ResultVerifier(0.7);
  private readonly meridian: MeridianShadowScorer;
  private readonly ledger: WorkflowEvidenceLedger | null;
  private readonly now: () => number;
  private readonly id: () => string;
  private readonly useEnsemble: boolean;
  private readonly ensembleMinConsensus: number;

  constructor(options: ProofKernelOptions = {}) {
    this.meridian = options.meridian ?? meridianShadowScorer;
    this.ledger = options.ledger === undefined ? workflowEvidenceLedger : options.ledger;
    this.now = options.now ?? (() => Date.now());
    this.id = options.id ?? (() => randomUUID().slice(0, 10));
    this.useEnsemble = options.useEnsemble ?? false;
    this.ensembleMinConsensus = options.ensembleMinConsensus ?? 2;
  }

  listFirstPartyAgents(): FirstPartyAgentProfile[] {
    return FIRST_PARTY_VERA_AGENTS;
  }

  listRuns(): VerifiableAIProofRun[] {
    return Array.from(this.runs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getRun(runId: string): VerifiableAIProofRun | undefined {
    return this.runs.get(runId);
  }

  async runTask(input: VerifiableAITaskInput): Promise<VerifiableAIProofRun> {
    const createdAt = this.now();
    const task: VerifiableAITask = {
      taskId: `vera-ai-task-${createdAt}-${this.id()}`,
      description: input.description,
      serviceType: normalizeServiceType(input.serviceType, input.description),
      payload: input.payload ?? {},
      budgetHbar: input.budgetHbar ?? 0,
      requiredConfidence: input.requiredConfidence ?? 0.7,
      priority: input.priority ?? 'normal',
      createdAt,
      metadata: input.metadata ?? {},
    };

    const events: ProofEvent[] = [];
    const pushEvent = (
      type: ProofEventType,
      summary: string,
      metadata: Record<string, unknown> = {},
      agentId?: string,
      hcs?: Pick<ProofEvent, 'hcsTopicId' | 'hcsSequence' | 'transactionId'>,
    ): ProofEvent => {
      const previousHash = events.at(-1)?.hash;
      const timestamp = this.now();
      const event: ProofEvent = {
        eventId: `proof-event-${timestamp}-${this.id()}`,
        taskId: task.taskId,
        type,
        summary,
        timestamp,
        previousHash,
        agentId,
        hcsTopicId: hcs?.hcsTopicId,
        hcsSequence: hcs?.hcsSequence,
        transactionId: hcs?.transactionId,
        metadata,
        hash: '',
      };
      event.hash = hashPayload({ ...event, hash: undefined });
      events.push(event);
      return event;
    };

    pushEvent('task_created', `Verifiable AI task created for ${task.serviceType}`, {
      description: task.description,
      budgetHbar: task.budgetHbar,
      requiredConfidence: task.requiredConfidence,
    });

    const scores = scoreFirstPartyAgents(task);
    const agentIds = scores.map((score) => score.agentId);

    // 🎭 Shadow Council Ensemble: Multi-Meridian consensus scoring (if enabled)
    let meridian: EnhancedMeridianShadowScore;
    let ensembleResult: EnsembleScore | undefined;

    if (this.useEnsemble && shadowCouncil.getStats().healthyInstances >= this.ensembleMinConsensus) {
      console.log('[ProofKernel] Using Shadow Council ensemble scoring');
      try {
        ensembleResult = await shadowCouncil.scoreTask(task, agentIds, {
          minConsensus: this.ensembleMinConsensus,
          maxLatencyMs: 1000, // Default max latency
        });

        meridian = {
          status: ensembleResult.consensus === 'none' ? 'needs_review' : 'scored',
          recommendation: ensembleResult.recommendation,
          confidence: ensembleResult.confidence,
          scores: ensembleResult.individualScores.map(s => ({
            agentId: s.meridianId,
            score: s.confidence,
          })),
          ensemble: {
            usedTiers: ensembleResult.usedTiers,
            consensusLevel: ensembleResult.consensus,
            outlierDetected: ensembleResult.outlierDetected,
            latencyMs: ensembleResult.ensembleLatencyMs,
          },
        } as EnhancedMeridianShadowScore;

        pushEvent('ensemble_scored', `Shadow Council consensus: ${ensembleResult.consensus} with ${ensembleResult.individualScores.length} Meridians`, {
          consensus: ensembleResult.consensus,
          tiers: ensembleResult.usedTiers,
          confidence: ensembleResult.confidence,
          outlierDetected: ensembleResult.outlierDetected,
          latencyMs: ensembleResult.ensembleLatencyMs,
        });
      } catch (error) {
        console.error('[ProofKernel] Ensemble scoring failed, falling back to single:', error);
        meridian = await this.meridian.score(task, agentIds) as EnhancedMeridianShadowScore;
      }
    } else {
      // Single Meridian scoring
      meridian = await this.meridian.score(task, agentIds) as EnhancedMeridianShadowScore;
    }

    // 🔮 Quantum Parallel Enhancement: Process through QVX mirrors and echo nodes
    let enhancedMeridian = meridian;
    if (meridian.status === 'scored') {
      try {
        const quantumResult = await quantumProofProcessor.processProof(task, meridian);
        enhancedMeridian = quantumResult.score as EnhancedMeridianShadowScore;
        
        pushEvent('quantum_enhanced', `Quantum processing complete: ${quantumResult.quantumMetrics.mirrorCoherence.toFixed(3)} coherence, ${quantumResult.quantumMetrics.echoAmplification.toFixed(2)}x amplification`, {
          mirrorCoherence: quantumResult.quantumMetrics.mirrorCoherence,
          echoAmplification: quantumResult.quantumMetrics.echoAmplification,
          parallelStreams: quantumResult.quantumMetrics.parallelStreams,
          processingTimeMs: quantumResult.quantumMetrics.processingTimeMs,
          resonanceFrequency: quantumResult.quantumMetrics.resonanceFrequency,
          distributed: quantumResult.distributed,
          mirrored: quantumResult.mirrored,
          amplified: quantumResult.amplified,
        });
      } catch (error) {
        console.error('[ProofKernel] Quantum enhancement failed:', error);
        // Continue with base meridian score
      }
    }

    // 🌸 Flower of Life Lattice Enhancement: Route through sacred geometry
    if (enhancedMeridian.status === 'scored') {
      try {
        const latticeResult = await latticeProofIntegrator.enhanceProofWithLattice(
          task,
          enhancedMeridian,
          scores.map(s => s.agentId)
        );
        
        if (latticeResult.latticeEnhanced && latticeResult.latticeMetrics) {
          enhancedMeridian = latticeResult;
          
          const metrics = latticeResult.latticeMetrics as Record<string, unknown>;
          pushEvent('lattice_enhanced', `Flower of Life routing complete: φ${(metrics.phiBoost as number).toFixed(3)} boost, center energy ${(metrics.centerEnergy as number).toFixed(3)}`, {
            centerEnergy: metrics.centerEnergy,
            phiBoost: metrics.phiBoost,
            energyCost: metrics.energyCost,
            pathLength: metrics.pathLength,
            routedThroughCenter: metrics.routedThroughCenter,
            pulseId: metrics.pulseId,
          });
        }
      } catch (error) {
        console.error('[ProofKernel] Lattice enhancement failed:', error);
        // Continue with quantum-enhanced score
      }
    }

    // Human-in-the-Loop: Evaluate if escalation needed
    const escalationCheck = evaluateEscalation(enhancedMeridian, task);
    let escalationEvent: EscalationEvent | undefined;

    if (escalationCheck.shouldEscalate) {
      escalationEvent = createEscalationEvent(task, meridian, escalationCheck.triggeredRules);

      if (!escalationCheck.autoResolvable) {
        // Requires human intervention
        pushEvent('escalation_human_required', `Human escalation required: ${escalationCheck.triggeredRules.map(r => r.name).join(', ')}`, {
          escalationId: escalationEvent.id,
          triggeredRules: escalationCheck.triggeredRules.map(r => r.id),
          confidence: meridian.confidence,
          councilSize: meridian.councilSizing?.size,
        });

        // 🔔 Send Slack notification for human escalation
        slackNotifier.notifyEscalation({
          escalationId: escalationEvent.id,
          taskId: task.taskId,
          serviceType: task.serviceType,
          description: task.description,
          triggeredRules: escalationCheck.triggeredRules.map(r => r.name),
          meridianConfidence: meridian.confidence,
          meridianRecommendation: meridian.recommendation,
          timestamp: new Date().toISOString(),
        }).catch(err => console.error('[Slack] Failed to send escalation alert:', err));
        // Return early with escalation status
        const escalationRun: VerifiableAIProofRun = {
          runId: `proof-run-${createdAt}-${this.id()}`,
          taskId: task.taskId ?? 'unknown',
          status: 'escalated',
          productionLabel: 'prototype',
          escalation: {
            id: escalationEvent.id,
            status: 'pending_human_review',
            triggeredRules: escalationCheck.triggeredRules.map(r => r.id),
          },
          task,
          selectedAgent: null as unknown as FirstPartyAgentProfile, // Will be set after escalation
          selection: { scores, meridian },
          execution: null as unknown as AgentExecutionResult, // No execution yet
          verification: null as unknown as ProofKernelVerification,
          settlement: null as unknown as ProofKernelSettlement,
          reputation: null as unknown as ProofKernelReputation,
          events,
          receipt: {
            localProofHash: `escalation-${escalationEvent.id}`,
            hcsTopicId: undefined,
            hcsSequence: undefined,
            transactionId: undefined,
            hashscanUrl: undefined,
          },
          createdAt,
          updatedAt: this.now(),
        };
        this.runs.set(escalationRun.runId, escalationRun);
        return escalationRun;
      } else {
        // Auto-resolvable escalation
        const autoResolve = attemptAutoResolution(task, meridian, escalationCheck.triggeredRules);
        pushEvent('escalation_auto_resolved', `Auto-resolved escalation via ${autoResolve.strategy}`, {
          escalationId: escalationEvent.id,
          strategy: autoResolve.strategy,
          confidence: meridian.confidence,
        });
        // Continue with potentially modified score
      }
    }

    const selectedAgent = getFirstPartyAgent(scores[0]?.agentId) ?? FIRST_PARTY_VERA_AGENTS[0];

    pushEvent('agent_selected', `Selected first-party Vera agent ${selectedAgent.agentId}`, {
      scores,
      meridian,
      selectionPolicy: 'deterministic-first-party-meridian-shadow',
    }, selectedAgent.agentId);

    pushEvent('execution_started', `${selectedAgent.agentId} started execution`, {
      capabilities: selectedAgent.capabilities,
      proofRequirements: selectedAgent.proofRequirements,
    }, selectedAgent.agentId);

    const execution = executeFirstPartyAgent(task, selectedAgent);
    pushEvent('result_submitted', `${selectedAgent.agentId} submitted a proof-hashed result`, {
      resultHash: execution.proofHash,
      confidence: execution.confidence,
      durationMs: execution.durationMs,
    }, selectedAgent.agentId);

    const report = this.verifier.verify({
      taskId: task.taskId,
      agentId: selectedAgent.agentId,
      result: execution.result,
      confidence: execution.confidence,
      proofHash: execution.proofHash,
      durationMs: execution.durationMs,
      timestamp: this.now(),
    }, {
      requiredConfidence: task.requiredConfidence,
      serviceType: task.serviceType,
    });

    const verificationType = report.outcome === 'accepted' ? 'verification_passed' : 'verification_failed';
    pushEvent(verificationType, `Verification ${report.outcome} with score ${report.score}`, {
      score: report.score,
      details: report.details,
      schemaValid: report.schemaValid,
      proofValid: report.proofValid,
      serviceValid: report.serviceValid,
    }, selectedAgent.agentId);

    const settlement = {
      state: 'simulated' as const,
      amountHbar: Math.min(task.budgetHbar, selectedAgent.defaultFeeHbar),
      reason: 'First-party dry-run settlement record; no funds moved',
    };
    pushEvent('settlement_recorded', `Settlement ${settlement.state} for ${selectedAgent.agentId}`, settlement, selectedAgent.agentId);

    const reputation = {
      agentId: selectedAgent.agentId,
      delta: report.outcome === 'accepted' ? 0.01 : -0.02,
      scoreAfter: Number(Math.max(0, Math.min(1, selectedAgent.reputationSeed + (report.outcome === 'accepted' ? 0.01 : -0.02))).toFixed(4)),
      basis: `Verification outcome: ${report.outcome}`,
    };
    pushEvent('reputation_updated', `Reputation updated for ${selectedAgent.agentId}`, reputation, selectedAgent.agentId);

    const receiptHash = hashPayload({
      task,
      selectedAgent: selectedAgent.agentId,
      executionProofHash: execution.proofHash,
      verification: report,
      eventHashes: events.map((event) => event.hash),
    });
    const hcsEmission = await emitProofReceiptToHcs({
      type: 'verifiable_ai_proof_receipt',
      runSchema: 'vera.verifiable_ai.proof_run.v1',
      taskId: task.taskId,
      serviceType: task.serviceType,
      agentId: selectedAgent.agentId,
      localProofHash: receiptHash,
      executionProofHash: execution.proofHash,
      verification: {
        outcome: report.outcome,
        score: report.score,
      },
      settlement,
      reputation,
      eventHashes: events.map((event) => event.hash),
      meridian: meridian.status === 'disabled'
        ? { status: meridian.status }
        : {
            status: meridian.status,
            model: meridian.model,
            backend: meridian.backend,
            recommendation: meridian.recommendation,
            proofCompleteness: meridian.proofCompleteness,
            quorum: meridian.quorum,
          },
      emittedAt: this.now(),
    });
    const receiptEvent = pushEvent('hcs_proof_emitted', 'Local HCS-ready proof receipt emitted', {
      localProofHash: receiptHash,
      hcsWriteMode: hcsEmission.mode,
      hcsWriteReason: hcsEmission.mode === 'submitted' ? undefined : hcsEmission.reason,
      productionBoundary: 'prototype until live HCS receipt, settlement record, and rollback story are attached',
    }, selectedAgent.agentId, hcsEmission.mode === 'submitted'
      ? {
          hcsTopicId: hcsEmission.topicId,
          hcsSequence: hcsEmission.sequenceNumber,
          transactionId: hcsEmission.transactionId,
        }
      : undefined);

    const status = report.outcome === 'accepted' ? 'proof_complete' : report.outcome === 'needs_review' ? 'needs_review' : 'failed';
    const runId = `proof-run-${createdAt}-${this.id()}`;
    const run: VerifiableAIProofRun = {
      runId,
      taskId: task.taskId,
      status,
      productionLabel: 'prototype',
      task,
      selectedAgent,
      selection: { scores, meridian },
      execution,
      verification: {
        outcome: report.outcome,
        score: report.score,
        details: report.details,
      },
      settlement,
      reputation,
      events,
      receipt: {
        localProofHash: receiptHash,
        hcsTopicId: receiptEvent.hcsTopicId,
        hcsSequence: receiptEvent.hcsSequence,
        transactionId: receiptEvent.transactionId,
        hashscanUrl: hcsEmission.mode === 'submitted' ? hcsEmission.hashscanUrl : undefined,
      },
      createdAt,
      updatedAt: this.now(),
    };

    const memoryPacket = buildProofRunMemoryPacket(run, {
      network: config.HEDERA_NETWORK,
      eventId: `evt-${runId}`,
      createdAtIso: new Date(createdAt).toISOString(),
    });
    const memoryEmission = await emitVeraMemoryPacketToHcs(memoryPacket);
    run.memoryPacket = {
      eventId: memoryPacket._vera.eventId,
      eventType: memoryPacket._vera.eventType,
      packetHash: memoryPacket.proof.packetHash ?? '',
      schema: memoryPacket._vera.schema,
      hcsWriteMode: memoryEmission.mode,
      hcsWriteReason: memoryEmission.mode === 'submitted' ? undefined : memoryEmission.reason,
      hcsTopicId: memoryEmission.mode === 'submitted' ? memoryEmission.topicId : memoryEmission.topicId ?? run.receipt.hcsTopicId,
      hcsSequence: memoryEmission.mode === 'submitted' ? memoryEmission.sequenceNumber : undefined,
      transactionId: memoryEmission.mode === 'submitted' ? memoryEmission.transactionId : undefined,
      hashscanUrl: memoryEmission.mode === 'submitted' ? memoryEmission.hashscanUrl : undefined,
      chunks: memoryEmission.mode === 'submitted' ? memoryEmission.chunks : undefined,
    };

    this.runs.set(run.runId, run);
    await this.recordWorkflowEvidence(run);
    return run;
  }

  private async recordWorkflowEvidence(run: VerifiableAIProofRun): Promise<void> {
    if (!this.ledger) return;

    const loop = await this.ledger.openLoop(
      `Verifiable Hedera AI task ${run.task.taskId}: ${run.task.serviceType}`,
      'task',
      ['Opened by the verifiable AI proof kernel.'],
    );

    await this.ledger.recordEvidence(loop.id, {
      source: 'dashboard_metric',
      stage: 'task',
      summary: `Task created: ${run.task.serviceType}`,
      hash: run.events.find((event) => event.type === 'task_created')?.hash,
      metadata: { taskId: run.task.taskId, runId: run.runId },
    });
    await this.ledger.recordEvidence(loop.id, {
      source: 'dashboard_metric',
      stage: 'award',
      summary: `First-party agent selected: ${run.selectedAgent.agentId}`,
      metadata: { taskId: run.task.taskId, runId: run.runId, meridian: run.selection.meridian },
    });
    await this.ledger.recordEvidence(loop.id, {
      source: 'dashboard_metric',
      stage: 'execution',
      summary: `Result submitted by ${run.selectedAgent.agentId}`,
      hash: run.execution.proofHash,
      metadata: { taskId: run.task.taskId, runId: run.runId },
    });
    await this.ledger.recordEvidence(loop.id, {
      source: 'test',
      stage: 'verification',
      summary: `Verification ${run.verification.outcome} (${run.verification.score})`,
      metadata: { taskId: run.task.taskId, runId: run.runId, details: run.verification.details },
    });
    await this.ledger.recordEvidence(loop.id, {
      source: 'settlement',
      stage: 'settlement',
      summary: `Settlement ${run.settlement.state}`,
      metadata: { taskId: run.task.taskId, runId: run.runId, ...run.settlement },
    });
    await this.ledger.recordEvidence(loop.id, {
      source: 'reputation',
      stage: 'reputation',
      summary: `Reputation updated for ${run.reputation.agentId}`,
      metadata: { taskId: run.task.taskId, runId: run.runId, ...run.reputation },
    });
    await this.ledger.recordEvidence(loop.id, {
      source: 'dashboard_metric',
      stage: 'receipt',
      summary: 'Local HCS-ready receipt emitted',
      hash: run.receipt.localProofHash,
      metadata: {
        taskId: run.task.taskId,
        runId: run.runId,
        productionLabel: run.productionLabel,
      },
    });
  }
}

export const verifiableAIProofKernel = new VerifiableAIProofKernel();
