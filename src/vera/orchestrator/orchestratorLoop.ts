import { EventEmitter } from 'events';
import axios from 'axios';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { paymentTopicManager, type PaymentTopics } from './topicManager.js';
import { PaymentRegistryWatcher } from './registryWatcher.js';
import { taskPublisher, type TaskIntent, type TaskRecord, type TaskBid } from './taskPublisher.js';
import { escrowController } from './escrowController.js';
import { resultVerifier, type VerificationReport } from './resultVerifier.js';
import { enhancedSettlement as x402Settlement } from '../payments/enhancedX402Settlement.js';
import { saveTask, saveEscrow, saveSettlement, loadAllTasks, loadAllEscrows, loadAllSettlements, getMaxHcsSequence } from './taskStore.js';
import { reputationEngine } from '../marketplace/reputation.js';
import { dynamicPricing } from '../marketplace/pricing.js';
import { orchestratorEventStream } from './eventStream.js';
import { AgentHCSBeacon, type AgentDiscoveryInfo } from './agentHCSBeacon.js';
import { createBeaconListener, AgentHCSBeaconListener } from './agentHCSBeaconListener.js';
import { latticeOrchestrator } from './latticeIntegration.js';
import { ConsensusEngine } from './consensusEngine.js';
import { featureFlags } from './featureFlags.js';
import { PredictiveAgentScaler } from '../scaling/predictiveScaler.js';
import { AgentWarmPool } from '../scaling/agentWarmPool.js';
import { disasterRecovery } from '../disaster-recovery/index.js';
import { SLAManager, SLA_POLICIES } from '../enterprise/slaManager.js';
import { streamManager } from '../payments/streaming.js';
import { batchSettlementEngine } from '../payments/asyncBatchSettlement.js';
import { MultiCurrencyHandler } from '../payments/multiCurrency.js';
import { hcsShardingManager } from './hcsTopicSharding.js';
import { hierarchicalCoordinator } from './hierarchicalCoordinator.js';
import { taskChainEngine } from './taskChainEngine.js';
import { negotiationProtocol } from './negotiationProtocol.js';
import { hmacVerifier } from '../security/hmacVerifier.js';
import { sybilProtection } from '../security/sybilProtection.js';
import { securityManager } from '../security/compliance.js';
import { correlationIds } from '../observability/correlationId.js';
import { premiumHCSLogger } from '../logging/premiumHCSLogger.js';
import { flowerOfLifeOS } from './flowerOfLifeOS.js';
import { qvxSelfTrainer } from '../../ai/fineTuning/qvxSelfTrainer.js';
import { scheduledExecution } from '../../hedera/scheduledExecution.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  mirrorNodeUrl: string;
  registryPollMs: number;
  resultPollMs: number;
  bidWindowMs: number;       // how long to wait for bids before selecting winner
  expiryCheckMs: number;     // how often to check for expired tasks
  taskExpiryMs: number;      // default task TTL
}

export interface OrchestratorStats {
  uptime: number;
  topics: PaymentTopics;
  tasks: ReturnType<typeof taskPublisher.getStats>;
  escrow: ReturnType<typeof escrowController.getStats>;
  verification: ReturnType<typeof resultVerifier.getStats>;
  settlement: ReturnType<typeof x402Settlement.getStats>;
  registry: { activeAgents: number; staleAgents: number };
  reputation: ReturnType<typeof reputationEngine.getStats>;
  pricing: ReturnType<typeof dynamicPricing.getStats>;
  eventStream: ReturnType<typeof orchestratorEventStream.getStats>;
  beacon: {
    discoveredAgents: number;
    healthyAgents: number;
    sosActive: boolean;
  };
  lattice: ReturnType<typeof latticeOrchestrator.getStats>;
  consensus: ReturnType<ConsensusEngine['getStats']>;
  circuitBreaker: ReturnType<typeof x402Settlement.getCircuitBreakerStats>;
  sharding: ReturnType<typeof hcsShardingManager.getStats>;
  hierarchy: ReturnType<typeof hierarchicalCoordinator.getClusterSummary>;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: OrchestratorConfig = {
  mirrorNodeUrl: 'https://mainnet-public.mirrornode.hedera.com',
  registryPollMs: 30_000,
  resultPollMs: 15_000,
  bidWindowMs: 60_000,
  expiryCheckMs: 30_000,
  taskExpiryMs: 5 * 60_000,
};

export class VeraOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private topics: PaymentTopics | null = null;
  private registryWatcher: PaymentRegistryWatcher | null = null;
  private resultPollTimer: NodeJS.Timeout | null = null;
  private bidCheckTimer: NodeJS.Timeout | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private lastResultSequence = 0;
  private running = false;
  private startedAt = 0;
  
  // HCS Beacon system
  private beacon: AgentHCSBeacon | null = null;
  private beaconListener: AgentHCSBeaconListener | null = null;

  // Lattice & consensus
  private consensusEngine = new ConsensusEngine();

  // Scaling subsystems
  private predictiveScaler = new PredictiveAgentScaler();
  private warmPool = new AgentWarmPool();

  // Payments
  private multiCurrencyHandler = new MultiCurrencyHandler();

  // Enterprise
  private slaManager = new SLAManager();

  constructor(overrides?: Partial<OrchestratorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...overrides };
    this.config.mirrorNodeUrl = config.MIRROR_NODE_BASE_URL || this.config.mirrorNodeUrl;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;

    logger.info('VeraOrchestrator', { message: 'Starting orchestrator...' });

    // 1. Ensure HCS topics
    this.topics = await paymentTopicManager.ensureTopics();
    logger.info('VeraOrchestrator', {
      message: 'Topics ready',
      registry: this.topics.registryTopicId,
      task: this.topics.taskTopicId,
      result: this.topics.resultTopicId,
      audit: this.topics.auditTopicId,
      beacon: this.topics.beaconTopicId,
    });

    // 2. Rehydrate in-memory state from SQLite
    try {
      const taskRows = loadAllTasks();
      const taskCount = taskPublisher.rehydrate(taskRows);

      const escrowRows = loadAllEscrows();
      const escrowCount = escrowController.rehydrate(escrowRows);

      const settlementRows = loadAllSettlements();
      const settlementCount = x402Settlement.rehydrate(settlementRows);

      this.lastResultSequence = getMaxHcsSequence();

      logger.info('VeraOrchestrator', {
        message: 'State recovered from SQLite',
        tasks: taskCount,
        escrows: escrowCount,
        settlements: settlementCount,
        lastResultSequence: this.lastResultSequence,
      });
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'State recovery failed (starting fresh)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Start registry watcher
    this.registryWatcher = new PaymentRegistryWatcher({
      topicId: this.topics.registryTopicId,
      mirrorNodeUrl: this.config.mirrorNodeUrl,
      pollIntervalMs: this.config.registryPollMs,
    });
    this.registryWatcher.start();

    // 4. Initialize HCS beacon for orchestrator
    await this.initializeBeacon();

    // 5. Wire internal events + marketplace + event stream
    this.wireEvents();
    orchestratorEventStream.wireEvents();

    // 6. Start polling loops
    this.startResultPoller();
    this.startBidChecker();
    this.startExpiryChecker();

    // 7. Initialize disaster recovery (state backups)
    try {
      if (featureFlags.get('enableAutomaticFailover')) {
        await disasterRecovery.start();
        logger.info('VeraOrchestrator', { message: 'Disaster recovery system started' });
      }
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'Disaster recovery init failed (non-fatal)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 8. Initialize predictive scaler and warm pool
    try {
      if (featureFlags.get('enableAdaptiveScheduling')) {
        this.predictiveScaler.start();
        this.warmPool.start();
        logger.info('VeraOrchestrator', { message: 'Predictive scaler and warm pool started' });
      }
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'Scaling subsystem init failed (non-fatal)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 9. Start batch settlement engine
    batchSettlementEngine.start();
    logger.info('VeraOrchestrator', { message: 'Batch settlement engine started' });

    // 10. Start HCS topic sharding and hierarchical coordinator for scale
    try {
      if (featureFlags.get('enableParallelPoller')) {
        hcsShardingManager.start();
        hierarchicalCoordinator.start();
        logger.info('VeraOrchestrator', {
          message: 'HCS sharding and hierarchical coordinator started',
          shardStats: hcsShardingManager.getStats(),
        });
      }
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'Sharding/hierarchy init failed (non-fatal)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 11. Start task chain engine with publishTask callback
    taskChainEngine.start(async (intent) => {
      await taskPublisher.publishTask({
        taskId: intent.taskId,
        description: intent.description,
        serviceType: intent.serviceType,
        budget: intent.budget,
        requiredConfidence: 0.7,
        deadlineMs: Date.now() + 5 * 60 * 1000, // 5 min default
        metadata: intent.metadata,
      });
    });
    logger.info('VeraOrchestrator', { message: 'Task chain engine started' });

    // 12. Start negotiation protocol and wire direct-award event
    negotiationProtocol.start();
    negotiationProtocol.on('direct_award', ({ taskId, agentId, terms }) => {
      // Negotiation succeeded — award task directly to the negotiated agent
      logger.info('VeraOrchestrator', {
        message: 'Direct award via negotiation',
        taskId,
        agentId,
        agreedFee: terms.fee,
      });
      const task = taskPublisher.getTask(taskId);
      if (task && task.state === 'posted') {
        taskPublisher.advanceState(taskId, 'awarded');
        taskPublisher.emit('task_awarded', {
          taskId,
          winner: {
            taskId,
            agentId,
            fee: terms.fee,
            confidence: terms.confidence ?? 0.8,
            estimatedDurationMs: terms.deadline ?? 60_000,
            timestamp: Date.now(),
          },
        });
      }
    });
    negotiationProtocol.on('fallback_to_bid', ({ taskId }) => {
      // Negotiation failed — ensure task enters standard bid flow
      const task = taskPublisher.getTask(taskId);
      if (task && task.state === 'posted') {
        taskPublisher.advanceState(taskId, 'bidding');
        logger.info('VeraOrchestrator', {
          message: 'Negotiation failed, falling back to open bidding',
          taskId,
        });
      }
    });
    logger.info('VeraOrchestrator', { message: 'Negotiation protocol started' });

    // 13. Start security modules
    hmacVerifier.start();
    sybilProtection.start();
    // 14. Start correlation ID tracker
    correlationIds.start();

    logger.info('VeraOrchestrator', {
      message: 'Security & observability modules started',
      hmac: hmacVerifier.getStats().enabled,
      sybil: sybilProtection.getStats().enabled,
    });

    // 15. Start Optimized HCS Logger — batched, cost-effective logging
    try {
      await premiumHCSLogger.start(this.topics as Record<string, string | null | undefined>);
      logger.info('VeraOrchestrator', {
        message: 'Premium HCS Logger started — highest quality enterprise logging',
        stats: premiumHCSLogger.getStats(),
      });
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'HCS Domain Logger init failed (non-fatal)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 16. Start QVX self-training pipeline — continuous LoRA fine-tuning
    try {
      qvxSelfTrainer.start();
      logger.info('VeraOrchestrator', {
        message: 'QVX self-training pipeline started',
        status: qvxSelfTrainer.getStatus(),
      });
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'QVX self-training pipeline init failed (non-fatal)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 17. Initialize hinTS council scheduled execution (HIP-1215)
    try {
      await scheduledExecution.initialize();
      logger.info('VeraOrchestrator', {
        message: 'hinTS scheduled execution initialized',
        network: config.HEDERA_NETWORK,
      });
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'Scheduled execution init failed (non-fatal)',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.running = true;
    this.startedAt = Date.now();
    this.emit('started');

    logger.info('VeraOrchestrator', {
      message: 'Orchestrator running (enhanced)',
      features: {
        enhancedSettlement: true,
        batchSettlement: true,
        streamingPayments: true,
        multiCurrency: true,
        latticeReasoning: featureFlags.get('enableLatticeReasoning'),
        circuitBreaker: featureFlags.get('enableCircuitBreaker'),
        adaptiveScheduling: featureFlags.get('enableAdaptiveScheduling'),
        automaticFailover: featureFlags.get('enableAutomaticFailover'),
        hcsSharding: featureFlags.get('enableParallelPoller'),
        hierarchicalCoordination: featureFlags.get('enableParallelPoller'),
        selfTraining: true,
        hinTS: true,
        blockStream: config.USE_BLOCK_STREAM === 'true',
      },
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.registryWatcher?.stop();

    // Stop beacon system
    if (this.beacon) {
      await this.beacon.stop();
      this.beacon = null;
    }
    if (this.beaconListener) {
      await this.beaconListener.stop();
      this.beaconListener = null;
    }

    if (this.resultPollTimer) clearInterval(this.resultPollTimer);
    if (this.bidCheckTimer) clearInterval(this.bidCheckTimer);
    if (this.expiryTimer) clearInterval(this.expiryTimer);

    this.resultPollTimer = null;
    this.bidCheckTimer = null;
    this.expiryTimer = null;

    // Stop premium HCS logger
    premiumHCSLogger.stop();

    // Stop batch settlement engine (flushes pending)
    batchSettlementEngine.stop();

    // Stop scaling subsystems
    this.predictiveScaler.stop();
    this.warmPool.stop();

    // Stop sharding and hierarchy
    hcsShardingManager.stop();
    hierarchicalCoordinator.stop();

    // Stop task chain engine and negotiation protocol
    taskChainEngine.stop();
    negotiationProtocol.stop();

    // Stop security & observability modules
    hmacVerifier.stop();
    sybilProtection.stop();
    correlationIds.stop();

    // Stop QVX self-training pipeline
    qvxSelfTrainer.stop();

    logger.info('VeraOrchestrator', { message: 'Orchestrator stopped' });
    this.emit('stopped');
  }

  // ─── Event wiring ────────────────────────────────────────────────────────

  private wireEvents(): void {
    taskPublisher.on('task_posted', (record: TaskRecord) => {
      saveTask(record);
    });

    taskPublisher.on('bid_received', ({ taskId }: { taskId: string }) => {
      const task = taskPublisher.getTask(taskId);
      if (task) saveTask(task);
    });

    taskPublisher.on('state_changed', ({ taskId }: { taskId: string }) => {
      const task = taskPublisher.getTask(taskId);
      if (task) saveTask(task);
    });

    // When a task is awarded → lock escrow
    taskPublisher.on('task_awarded', async ({ taskId, winner }: { taskId: string; winner: TaskBid }) => {
      const task = taskPublisher.getTask(taskId);
      if (!task) return;

      // Create correlation ID for this task lifecycle
      const cid = correlationIds.forTask(taskId);
      correlationIds.tag(cid, 'phase', 'awarded');
      correlationIds.tag(cid, 'agentId', winner.agentId);
      logger.info('VeraOrchestrator', { ...correlationIds.context(cid), message: 'Locking escrow for awarded task', taskId, agent: winner.agentId });

      // Look up agent account from registry
      const agentRecord = this.registryWatcher?.getAgentById(winner.agentId);
      const recipientAccount = (agentRecord?.profile.metadata?.accountId as string) || config.HEDERA_OPERATOR_ACCOUNT_ID || '';

      const escrow = await escrowController.lockEscrow(taskId, recipientAccount, winner.fee);
      saveEscrow(escrow);

      if (escrow.state === 'locked') {
        taskPublisher.advanceState(taskId, 'in_progress');
        saveTask(task);
        await taskPublisher.publishStateTransition(taskId, 'in_progress', { escrowId: escrow.escrowId });
      } else {
        taskPublisher.advanceState(taskId, 'cancelled');
        saveTask(task);
        await taskPublisher.publishStateTransition(taskId, 'cancelled', { reason: 'escrow_lock_failed' });
      }
    });

    // When verification completes → settle or reject + update reputation
    resultVerifier.on('verification_complete', async (report: VerificationReport) => {
      const task = taskPublisher.getTask(report.taskId);
      if (!task) return;

      const responseMs = Date.now() - task.createdAt;
      const escrow = escrowController.getEscrowByTask(report.taskId);

      if (report.outcome === 'accepted') {
        correlationIds.tag(correlationIds.forTask(report.taskId), 'phase', 'accepted');
        taskPublisher.advanceState(report.taskId, 'accepted');
        await taskPublisher.publishStateTransition(report.taskId, 'accepted', { score: report.score });

        // Record accepted outcome in reputation engine
        reputationEngine.recordOutcome(
          report.agentId, report.taskId, 'accepted',
          responseMs, report.score, escrow?.amountHbar ?? 0,
        );

        // Release escrow & settle payment
        if (escrow) {
          await escrowController.releaseEscrow(escrow.escrowId);
          saveEscrow(escrow);

          // Determine payment routing
          const currency = (task.intent.metadata?.currency as string) || 'HBAR';
          const paymentMethod = task.intent.metadata?.paymentMethod as string | undefined;
          const BATCH_THRESHOLD = 1; // HBAR — below this, batch for efficiency

          if (paymentMethod === 'stream') {
            // Streaming payment — start a micro-payment stream
            const ratePerSecond = (task.intent.metadata?.rateHbarPerSecond as number) || 0.001;
            await streamManager.startStream({
              taskId: report.taskId,
              agentId: report.agentId,
              rateHbarPerSecond: ratePerSecond,
              maxTotalHbar: escrow.amountHbar,
              currency: currency as any,
            });
            logger.info('VeraOrchestrator', {
              message: 'Started streaming payment',
              taskId: report.taskId,
              maxHbar: escrow.amountHbar,
            });
          } else if (escrow.amountHbar < BATCH_THRESHOLD && escrow.amountHbar > 0) {
            // Small payment — route through batch engine for efficiency
            void batchSettlementEngine.submitSettlement(
              report.taskId,
              report.agentId,
              escrow.recipientAccountId,
              escrow.amountHbar,
              currency as any,
            ).catch(err => logger.warn('VeraOrchestrator', {
              message: 'Batch settlement submission failed, falling back to direct',
              error: err instanceof Error ? err.message : String(err),
            }));
          } else {
            // Standard settlement via enhanced x402 (circuit breaker, retries, idempotency)
            const settlement = await x402Settlement.settle(
              report.taskId,
              report.agentId,
              escrow.recipientAccountId,
              escrow.amountHbar,
              currency as any,
            );
            saveSettlement(settlement);

            // Post-settlement lattice coherence tracking
            if (featureFlags.get('enableLatticeReasoning')) {
              void x402Settlement.postSettlementCoherenceCheck(settlement.settlementId)
                .catch(err => logger.warn('VeraOrchestrator', {
                  message: 'Post-settlement coherence check failed (non-fatal)',
                  error: err instanceof Error ? err.message : String(err),
                }));
            }
          }
        }
        // Notify chain engine if this task belongs to a chain
        void taskChainEngine.onTaskCompleted(report.taskId, report.agentId, report.details)
          .catch(err => logger.warn('VeraOrchestrator', {
            message: 'Chain engine notification failed (non-fatal)',
            error: err instanceof Error ? err.message : String(err),
          }));

      } else if (report.outcome === 'rejected') {
        taskPublisher.advanceState(report.taskId, 'rejected');
        await taskPublisher.publishStateTransition(report.taskId, 'rejected', {
          reason: report.details.join('; '),
        });

        // Record rejected outcome in reputation engine
        reputationEngine.recordOutcome(
          report.agentId, report.taskId, 'rejected',
          responseMs, report.score, 0,
        );

        // Reclaim escrow
        if (escrow) {
          await escrowController.reclaimEscrow(escrow.escrowId);
          saveEscrow(escrow);
        }

        // Notify chain engine of failure so it can retry or rollback
        void taskChainEngine.onTaskFailed(report.taskId, report.details.join('; '))
          .catch(err => logger.warn('VeraOrchestrator', {
            message: 'Chain engine failure notification failed (non-fatal)',
            error: err instanceof Error ? err.message : String(err),
          }));
      }
      // 'needs_review' stays in delivered state for manual intervention
    });
  }

  // ─── Polling: result topic ───────────────────────────────────────────────

  private startResultPoller(): void {
    this.resultPollTimer = setInterval(() => {
      void this.pollResults();
    }, this.config.resultPollMs);
    void this.pollResults(); // immediate first poll
  }

  private async pollResults(): Promise<void> {
    const topicId = this.topics?.resultTopicId;
    if (!topicId) return;

    try {
      const url = `${this.config.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?order=asc&limit=100&sequencenumber=gt:${this.lastResultSequence}`;
      const { data } = await axios.get(url, { timeout: 10_000 });
      const messages: Array<{ sequence_number: number; message: string }> = data?.messages ?? [];

      for (const msg of messages) {
        this.lastResultSequence = Math.max(this.lastResultSequence, msg.sequence_number);

        let payload: Record<string, unknown> | null;
        try {
          const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
          payload = hmacVerifier.verifyHCSMessage(decoded);
        } catch {
          continue;
        }
        if (!payload) {
          logger.warn('VeraOrchestrator', {
            message: 'Rejected unsigned or invalid agent HCS submission',
            topicId,
            sequence: msg.sequence_number,
          });
          continue;
        }

        const type = payload.type;

        // Handle bids
        if (type === 'bid') {
          const bid: TaskBid = {
            taskId: String(payload.taskId ?? ''),
            agentId: String(payload.agentId ?? ''),
            fee: Number(payload.fee ?? 0),
            confidence: Number(payload.confidence ?? 0),
            estimatedDurationMs: Number(payload.estimatedDurationMs ?? 0),
            timestamp: Number(payload.timestamp ?? Date.now()),
          };
          taskPublisher.receiveBid(bid);
        }

        // Handle result submissions
        if (type === 'result') {
          const task = taskPublisher.getTask(String(payload.taskId ?? ''));
          if (task && task.state === 'in_progress') {
            if (payload.agentId !== task.winnerId) {
              logger.warn('VeraOrchestrator', {
                message: 'Rejected result from non-winning agent',
                taskId: task.intent.taskId,
                winnerId: task.winnerId,
                submittedAgentId: payload.agentId,
              });
              await taskPublisher.publishStateTransition(task.intent.taskId, task.state, {
                rejectedResultAgentId: payload.agentId,
                reason: 'non_winning_agent_result',
              });
              continue;
            }

            taskPublisher.advanceState(task.intent.taskId, 'delivered');

            const report = resultVerifier.verify(payload, {
              requiredConfidence: task.intent.requiredConfidence,
              serviceType: task.intent.serviceType,
            });
            await resultVerifier.publishReport(report);
          }
        }
      }
    } catch (error) {
      logger.warn('VeraOrchestrator', {
        message: 'Result topic poll failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── Bid window checker ──────────────────────────────────────────────────

  private startBidChecker(): void {
    this.bidCheckTimer = setInterval(() => {
      this.checkBidWindows();
    }, 5_000);
  }

  private checkBidWindows(): void {
    const now = Date.now();
    const biddingTasks = taskPublisher.getTasksByState('bidding');

    for (const task of biddingTasks) {
      const elapsed = now - task.createdAt;

      // SLA-aware bid window: enterprise/pro-tier tasks get shorter windows
      const slaTier = (task.intent.metadata?.slaTier as string) || 'basic';
      const slaPriority = this.slaManager.getPriority(slaTier as any);
      const adjustedBidWindow = slaPriority === 1
        ? this.config.bidWindowMs * 0.5  // Enterprise: 50% shorter
        : slaPriority === 2
          ? this.config.bidWindowMs * 0.75 // Pro: 25% shorter
          : this.config.bidWindowMs;       // Basic: standard

      if (elapsed >= adjustedBidWindow && task.bids.length > 0) {
        // ─── Center-Routed Bid Selection ────────────────────────────────────
        // Route bid selection through center-0 with lattice scoring
        const candidateScores = task.bids.map(bid => {
          const score = reputationEngine.scoreBid(
            bid.agentId,
            bid.fee,
            bid.confidence,
            task.intent.budget
          );
          return { id: bid.agentId, score };
        });

        // Route through center — Pillar 1 enforcement
        const centerRoutedDecision = flowerOfLifeOS.centerRoute({
          type: 'bid_select',
          sourceNodeId: 'center-0',
          candidates: candidateScores,
          data: {
            taskId: task.intent.taskId,
            bidCount: task.bids.length,
            slaTier,
          },
        });

        const rankedAgentIds = centerRoutedDecision.scoredCandidates.map((candidate) => candidate.id);

        // Log lattice-enhanced selection
        const winner = centerRoutedDecision.winner;
        if (winner) {
          logger.info('VeraOrchestrator', {
            message: 'Bid selection center-routed',
            taskId: task.intent.taskId,
            winnerAgent: winner.id,
            originalScore: winner.originalScore.toFixed(3),
            latticeBoost: winner.latticeBoost.toFixed(4),
            finalScore: winner.finalScore.toFixed(3),
            centerEnergy: centerRoutedDecision.centerEnergy.toFixed(4),
            hops: centerRoutedDecision.hops,
          });
        }

        // Bid window closed — select winner using reputation/lattice-ranked order.
        taskPublisher.selectWinner(task.intent.taskId, { rankedAgentIds });
      }
    }

    // Also check posted tasks that have gotten their first bid
    const postedTasks = taskPublisher.getTasksByState('posted');
    for (const task of postedTasks) {
      const elapsed = now - task.createdAt;
      if (elapsed >= this.config.bidWindowMs) {
        // No bids received in time — expire
        taskPublisher.advanceState(task.intent.taskId, 'expired');
        void taskPublisher.publishStateTransition(task.intent.taskId, 'expired', { reason: 'no_bids' });
      }
    }
  }

  // ─── Expiry checker ──────────────────────────────────────────────────────

  private startExpiryChecker(): void {
    this.expiryTimer = setInterval(() => {
      this.checkExpired();
    }, this.config.expiryCheckMs);
  }

  private checkExpired(): void {
    const now = Date.now();
    const inProgress = taskPublisher.getTasksByState('in_progress');

    for (const task of inProgress) {
      if (now > task.intent.deadlineMs) {
        taskPublisher.advanceState(task.intent.taskId, 'expired');
        void taskPublisher.publishStateTransition(task.intent.taskId, 'expired', { reason: 'deadline_passed' });

        // Reclaim escrow
        const escrow = escrowController.getEscrowByTask(task.intent.taskId);
        if (escrow) {
          void escrowController.reclaimEscrow(escrow.escrowId);
        }
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Submit a new task for orchestration.
   */
  async submitTask(
    description: string,
    serviceType: string,
    budget: number,
    options?: { requiredConfidence?: number; deadlineMs?: number; metadata?: Record<string, unknown> },
  ): Promise<TaskRecord> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Use dynamic pricing to suggest budget if not specified or as a floor
    const suggestedBudget = dynamicPricing.getBudget(serviceType);
    const effectiveBudget = budget > 0 ? budget : suggestedBudget;

    const intent: TaskIntent = {
      taskId,
      description,
      serviceType,
      budget: effectiveBudget,
      requiredConfidence: options?.requiredConfidence ?? 0.7,
      deadlineMs: options?.deadlineMs ?? Date.now() + this.config.taskExpiryMs,
      metadata: options?.metadata,
    };

    // Record demand for this service type
    dynamicPricing.recordDemand(serviceType);

    return taskPublisher.publishTask(intent);
  }

  getStats(): OrchestratorStats {
    const watcherStats = this.registryWatcher?.getStats();
    return {
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      topics: this.topics ?? {},
      tasks: taskPublisher.getStats(),
      escrow: escrowController.getStats(),
      verification: resultVerifier.getStats(),
      settlement: x402Settlement.getStats(),
      registry: {
        activeAgents: watcherStats?.activeAgents ?? 0,
        staleAgents: watcherStats?.staleAgents ?? 0,
      },
      reputation: reputationEngine.getStats(),
      pricing: dynamicPricing.getStats(),
      eventStream: orchestratorEventStream.getStats(),
      beacon: {
        discoveredAgents: this.beaconListener?.getDiscoveredAgents().length ?? 0,
        healthyAgents: this.beaconListener?.getHealthyAgents().length ?? 0,
        sosActive: this.beacon?.['isSOSMode'] ?? false,
      },
      lattice: latticeOrchestrator.getStats(),
      consensus: this.consensusEngine.getStats(),
      circuitBreaker: x402Settlement.getCircuitBreakerStats(),
      sharding: hcsShardingManager.getStats(),
      hierarchy: hierarchicalCoordinator.getClusterSummary(),
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getRegistryWatcher(): PaymentRegistryWatcher | null {
    return this.registryWatcher;
  }

  // ─── HCS Beacon API ───────────────────────────────────────────────────────

  /**
   * Initialize HCS beacon for orchestrator discovery and monitoring
   */
  private async initializeBeacon(): Promise<void> {
    if (!this.topics?.beaconTopicId) {
      logger.warn('VeraOrchestrator', {
        message: 'Beacon topic not available, skipping beacon initialization'
      });
      return;
    }

    // Create beacon for this orchestrator
    this.beacon = new AgentHCSBeacon('veralattice-orchestrator', 'orchestrator', {
      topicId: this.topics.beaconTopicId,
      intervalMs: 30000, // 30s heartbeat
      sosIntervalMs: 5000, // 5s SOS mode
    });

    // Set up dynamic status
    this.beacon.onStatus(() => ({
      healthy: this.running,
      load: taskPublisher.getTasksByState('in_progress').length / 100,
      queueDepth: taskPublisher.getTasksByState('posted').length + taskPublisher.getTasksByState('bidding').length,
    }));

    // Set up capabilities
    this.beacon.onCapabilities(() => [
      'task-orchestration',
      'escrow-management',
      'payment-settlement',
      'agent-registry',
      'reputation-tracking',
      'dynamic-pricing',
    ]);

    // Set up metadata
    this.beacon.onMetadata(() => ({
      version: '2.0.0',
      network: config.HEDERA_NETWORK,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      stats: this.getStats(),
    }));

    // Create listener for discovering other agents
    this.beaconListener = createBeaconListener(
      {
        topicId: this.topics.beaconTopicId,
        agentTimeoutMs: 120000,
      },
      {
        onAgentDiscovered: (agent) => {
          logger.info('VeraOrchestrator', {
            message: 'Agent discovered via beacon',
            agentId: agent.agentId,
            agentType: agent.agentType,
            capabilities: agent.capabilities,
          });
          this.emit('agent_discovered', agent);
        },
        onSOS: (message) => {
          logger.warn('VeraOrchestrator', {
            message: 'Received SOS from agent',
            agentId: message.agentId,
            level: message.sos?.level,
            sosMessage: message.sos?.message,
          });
          this.emit('agent_sos', message);

          // Self-healing: auto-reclaim tasks from critical agents
          if (message.sos?.level === 'critical') {
            this.handleAgentFailure(message.agentId);
          }
        },
      }
    );

    // Start listener and beacon
    await this.beaconListener.start();
    await this.beacon.start();

    logger.info('VeraOrchestrator', {
      message: 'HCS beacon initialized',
      beaconTopic: this.topics.beaconTopicId,
    });
  }

  /**
   * Trigger SOS mode for orchestrator
   */
  async triggerSOS(level: 'info' | 'warning' | 'critical', message: string, code?: string): Promise<void> {
    if (!this.beacon) {
      throw new Error('Beacon not initialized');
    }
    await this.beacon.triggerSOS(level, message, code);
  }

  /**
   * Cancel SOS mode
   */
  async cancelSOS(): Promise<void> {
    if (!this.beacon) {
      throw new Error('Beacon not initialized');
    }
    await this.beacon.cancelSOS();
  }

  /**
   * Get agents discovered via beacon
   */
  getDiscoveredAgents(): AgentDiscoveryInfo[] {
    return this.beaconListener?.getDiscoveredAgents() ?? [];
  }

  /**
   * Get healthy agents
   */
  getHealthyAgents(): AgentDiscoveryInfo[] {
    return this.beaconListener?.getHealthyAgents() ?? [];
  }

  /**
   * Get agent by ID
   */
  getAgentById(agentId: string): AgentDiscoveryInfo | undefined {
    return this.beaconListener?.getAgent(agentId);
  }

  /**
   * Find best agent for a task
   */
  findBestAgent(requiredCapabilities: string[]): AgentDiscoveryInfo | null {
    return this.beaconListener?.findBestAgent(requiredCapabilities) ?? null;
  }

  // ─── Self-Healing ──────────────────────────────────────────────────────────

  /**
   * Handle agent failure: reclaim in-progress tasks and re-post them.
   * Triggered when an agent sends SOS critical via beacon.
   */
  private handleAgentFailure(agentId: string): void {
    const inProgress = taskPublisher.getTasksByState('in_progress');
    let reclaimed = 0;

    for (const task of inProgress) {
      if (task.winnerId !== agentId) continue;

      logger.warn('VeraOrchestrator', {
        message: 'Reclaiming task from failed agent',
        taskId: task.intent.taskId,
        agentId,
      });

      // Reclaim escrow
      const escrow = escrowController.getEscrowByTask(task.intent.taskId);
      if (escrow) {
        void escrowController.reclaimEscrow(escrow.escrowId).then(() => saveEscrow(escrow));
      }

      // Mark current task as cancelled
      taskPublisher.advanceState(task.intent.taskId, 'cancelled');
      saveTask(task);
      void taskPublisher.publishStateTransition(task.intent.taskId, 'cancelled', {
        reason: 'agent_sos_critical',
        failedAgent: agentId,
      });

      // Re-post as a new high-priority task
      void this.submitTask(
        task.intent.description,
        task.intent.serviceType,
        task.intent.budget,
        {
          requiredConfidence: task.intent.requiredConfidence,
          deadlineMs: task.intent.deadlineMs,
          metadata: { ...task.intent.metadata, repostedFrom: task.intent.taskId, urgency: 'HIGH' },
        },
      );

      // Penalize agent reputation
      reputationEngine.recordOutcome(agentId, task.intent.taskId, 'expired', 0, 0, 0);

      reclaimed++;
    }

    if (reclaimed > 0) {
      logger.info('VeraOrchestrator', {
        message: 'Self-healing: tasks reclaimed and re-posted',
        agentId,
        reclaimedCount: reclaimed,
      });
      this.emit('agent_failure_handled', { agentId, reclaimedCount: reclaimed });
    }
  }

  // ─── Consensus Engine API ──────────────────────────────────────────────────

  /**
   * Access consensus engine for cross-agent voting on high-value decisions
   */
  getConsensusEngine(): ConsensusEngine {
    return this.consensusEngine;
  }
}

export const veraOrchestrator = new VeraOrchestrator();
