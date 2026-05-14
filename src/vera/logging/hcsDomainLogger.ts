/**
 * HCS Domain Logger
 *
 * Actively logs structured messages to ALL Vera HCS topics.
 * Ensures every topic on HashScan shows well-formatted, auditable data.
 *
 * Message Schema (consistent across all topics):
 * {
 *   v: 1,                          // Schema version
 *   type: "HEARTBEAT" | "STATUS" | "EVENT" | "METRIC" | "ALERT",
 *   domain: "registry" | "task" | "defi" | "carbon" | ...,
 *   ts: 1712524800000,             // Unix timestamp ms
 *   src: "vera-orchestrator",      // Source identity
 *   seq: 42,                       // Sequence number per topic
 *   data: { ... },                 // Domain-specific payload
 *   lattice: { layer: 0, node: "center-0", energy: 1.0 },
 *   hash: "sha256-hex"             // Integrity hash of data
 * }
 */

import { createHash } from 'crypto';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { flowerOfLifeOS } from '../orchestrator/flowerOfLifeOS.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import {
  enterpriseHeartbeat,
  EnterpriseHeartbeatManager,
  CapabilityRegistry,
} from '../heartbeat/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HCSDomainMessage {
  v: number;
  type: 'HEARTBEAT' | 'STATUS' | 'EVENT' | 'METRIC' | 'ALERT' | 'INIT';
  domain: string;
  ts: number;
  src: string;
  seq: number;
  data: Record<string, unknown>;
  lattice?: {
    layer: number;
    node: string;
    energy: number;
  };
  hash: string;
}

interface TopicConfig {
  name: string;
  topicId: string;
  domain: string;
  latticeLayer: number;
  latticeNode: string;
  heartbeatIntervalMs: number;
  sequenceNumber: number;
}

export interface DomainLoggerConfig {
  heartbeatEnabled?: boolean;
  heartbeatBaseIntervalMs?: number;
  logOnStartup?: boolean;
}

// ─── Topic-to-Domain Mapping ─────────────────────────────────────────────────

const TOPIC_DOMAINS: Record<string, { domain: string; layer: number; node: string; intervalMs: number }> = {
  // Minimal heartbeats - only critical topics, every 10 minutes (was 30-120s)
  // Foundation Layer (Layer 1 in lattice)
  registryTopicId:           { domain: 'registry',            layer: 1, node: 'inner-0', intervalMs: 600_000 }, // 10 min
  taskTopicId:               { domain: 'task',                layer: 1, node: 'inner-1', intervalMs: 600_000 },
  resultTopicId:             { domain: 'result',              layer: 1, node: 'inner-2', intervalMs: 600_000 },
  auditTopicId:              { domain: 'audit',               layer: 1, node: 'inner-3', intervalMs: 600_000 },
  beaconTopicId:             { domain: 'beacon',              layer: 1, node: 'inner-4', intervalMs: 300_000 }, // 5 min
  hotTopicsTopicId:          { domain: 'hot-topics',          layer: 1, node: 'inner-5', intervalMs: 600_000 },

  // Swarm Coordination Layer (Layer 2) - less frequent
  swarmStateTopicId:         { domain: 'swarm-state',         layer: 2, node: 'middle-0', intervalMs: 600_000 },
  swarmConsensusTopicId:     { domain: 'swarm-consensus',     layer: 2, node: 'middle-1', intervalMs: 600_000 },
  swarmMeetTopicId:          { domain: 'swarm-meet',          layer: 2, node: 'middle-2', intervalMs: 600_000 },
  swarmJoinTopicId:          { domain: 'swarm-join',          layer: 2, node: 'middle-3', intervalMs: 600_000 },
  swarmRoutingTopicId:       { domain: 'swarm-routing',       layer: 2, node: 'middle-4', intervalMs: 600_000 },

  // Federation Layer (Layer 2)
  federationHandshakeTopicId:{ domain: 'federation-handshake',layer: 2, node: 'middle-5', intervalMs: 600_000 },
  federationConsensusTopicId:{ domain: 'federation-consensus',layer: 2, node: 'middle-6', intervalMs: 600_000 },
  federationTaskTopicId:     { domain: 'federation-task',     layer: 2, node: 'middle-7', intervalMs: 600_000 },
  federationHeartbeatTopicId:{ domain: 'federation-heartbeat',layer: 2, node: 'middle-8', intervalMs: 300_000 },

  // Domain-Specific Layer (Layer 3)
  defiIntelligenceTopicId:   { domain: 'defi-intelligence',   layer: 3, node: 'outer-0', intervalMs: 600_000 },
  carbonVerificationTopicId: { domain: 'carbon-verification', layer: 3, node: 'outer-1', intervalMs: 600_000 },
  complianceAuditTopicId:    { domain: 'compliance-audit',    layer: 3, node: 'outer-2', intervalMs: 600_000 },
  agentLearningTopicId:      { domain: 'agent-learning',      layer: 3, node: 'outer-3', intervalMs: 600_000 },
  paymentStreamTopicId:      { domain: 'payment-stream',      layer: 3, node: 'outer-4', intervalMs: 300_000 },
};

// ─── Domain-specific heartbeat data generators ───────────────────────────────

function getHeartbeatData(domain: string): Record<string, unknown> {
  // Minimal heartbeat - just status, no verbose data
  // Full data should only be logged when there's actual activity
  return { 
    status: 'active', 
    ts: Date.now(),
    v: 2 // Version 2 = optimized format
  };
}

// ─── HCS Domain Logger ──────────────────────────────────────────────────────

export class HCSDomainLogger {
  private topics: Map<string, TopicConfig> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private config: Required<DomainLoggerConfig>;
  private totalSubmitted = 0;
  private totalFailed = 0;
  private enterpriseHeartbeat?: EnterpriseHeartbeatManager;
  private capabilityRegistry: CapabilityRegistry;

  constructor(domainConfig: DomainLoggerConfig = {}) {
    this.config = {
      heartbeatEnabled: domainConfig.heartbeatEnabled ?? true,
      heartbeatBaseIntervalMs: domainConfig.heartbeatBaseIntervalMs ?? 60_000,
      logOnStartup: domainConfig.logOnStartup ?? true,
    };
    // hederaMaster handles client initialization
    this.capabilityRegistry = new CapabilityRegistry();
  }

  /**
   * Start the domain logger — register all topics and begin heartbeats
   */
  async start(topicIds: Record<string, string | null | undefined>): Promise<void> {
    if (this.isRunning) return;

    // Register all topics with their domain config
    for (const [key, topicId] of Object.entries(topicIds)) {
      if (!topicId) continue;
      const domainCfg = TOPIC_DOMAINS[key];
      if (!domainCfg) continue;

      this.topics.set(key, {
        name: key,
        topicId,
        domain: domainCfg.domain,
        latticeLayer: domainCfg.layer,
        latticeNode: domainCfg.node,
        heartbeatIntervalMs: domainCfg.intervalMs,
        sequenceNumber: 0,
      });
    }

    this.isRunning = true;

    // Initialize enterprise heartbeat with smart delta
    if (this.config.heartbeatEnabled && this.topics.size > 0) {
      // Get the beacon topic for enterprise heartbeats, or use first topic
      const beaconTopic = this.topics.get('beaconTopicId') ||
                         Array.from(this.topics.values())[0];

      if (beaconTopic) {
        this.enterpriseHeartbeat = new EnterpriseHeartbeatManager({
          nodeId: `vera-domain-logger-${config.HEDERA_OPERATOR_ACCOUNT_ID || 'default'}`,
          topicId: beaconTopic.topicId,
          nodeType: 'hybrid',
          minimalIntervalMs: 600_000, // 10 minutes
          fullIntervalMs: 3_600_000, // 60 minutes
          enableCostTracking: true,
        });

        // Set capabilities based on registered domains
        this.updateDomainCapabilities();

        this.enterpriseHeartbeat.start();

        logger.info('HCSDomainLogger', {
          message: 'Enterprise heartbeat started',
          nodeId: this.enterpriseHeartbeat['config'].nodeId,
          topicId: beaconTopic.topicId,
          capabilities: this.capabilityRegistry.getCapabilityHash(),
        });
      }
    }

    logger.info('HCSDomainLogger', {
      message: 'Domain logger started',
      topics: this.topics.size,
      heartbeatEnabled: this.config.heartbeatEnabled,
    });

    // Send INIT message to all topics on startup
    if (this.config.logOnStartup) {
      await this.sendInitMessages();
    }

    // Start legacy heartbeat timers for backward compatibility
    if (this.config.heartbeatEnabled) {
      this.startHeartbeats();
    }
  }

  /**
   * Stop all heartbeats
   */
  stop(): void {
    this.isRunning = false;
    for (const [key, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    // Stop enterprise heartbeat
    if (this.enterpriseHeartbeat) {
      this.enterpriseHeartbeat.stop();
      logger.info('HCSDomainLogger', {
        message: 'Domain logger stopped',
        costStats: this.enterpriseHeartbeat.getCostStats(),
      });
    } else {
      logger.info('HCSDomainLogger', { message: 'Domain logger stopped' });
    }
  }

  /**
   * Send INIT message to all registered topics
   */
  private async sendInitMessages(): Promise<void> {
    const latticeStats = flowerOfLifeOS.getStats();

    const promises = Array.from(this.topics.values()).map(topic =>
      this.submitMessage(topic, 'INIT', {
        message: `Vera ${topic.domain} domain online`,
        version: '2.0.0',
        network: config.HEDERA_NETWORK ?? 'mainnet',
        operatorId: config.HEDERA_OPERATOR_ACCOUNT_ID ?? 'unknown',
        lattice: {
          totalNodes: latticeStats.totalNodes,
          totalEdges: latticeStats.totalEdges,
          flowDirection: latticeStats.flowDirection,
          phi: latticeStats.phi,
        },
        capabilities: getDomainCapabilities(topic.domain),
      })
    );

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('HCSDomainLogger', {
      message: `INIT messages sent to ${succeeded}/${this.topics.size} topics`,
      failed,
    });
  }

  /**
   * Start heartbeat timers for all topics
   */
  private startHeartbeats(): void {
    for (const [key, topic] of this.topics) {
      // Stagger start times to avoid burst
      const staggerMs = Math.random() * 5000;

      const timer = setTimeout(() => {
        // Send first heartbeat, then set interval
        this.sendHeartbeat(topic);

        const interval = setInterval(() => {
          this.sendHeartbeat(topic);
        }, topic.heartbeatIntervalMs);

        this.heartbeatTimers.set(key, interval);
      }, staggerMs);

      // Store the initial timeout (will be replaced by interval)
      this.heartbeatTimers.set(key, timer as unknown as NodeJS.Timeout);
    }
  }

  /**
   * Send a heartbeat to a specific topic
   */
  private async sendHeartbeat(topic: TopicConfig): Promise<void> {
    if (!this.isRunning) return;

    const data = getHeartbeatData(topic.domain);
    await this.submitMessage(topic, 'HEARTBEAT', data);
  }

  /**
   * Submit a structured message to an HCS topic
   */
  async submitMessage(
    topic: TopicConfig,
    type: HCSDomainMessage['type'],
    data: Record<string, unknown>,
  ): Promise<boolean> {
    topic.sequenceNumber++;

    const latticeNode = flowerOfLifeOS.getNode(topic.latticeNode);

    const message: HCSDomainMessage = {
      v: 1,
      type,
      domain: topic.domain,
      ts: Date.now(),
      src: 'vera-orchestrator',
      seq: topic.sequenceNumber,
      data,
      lattice: latticeNode ? {
        layer: latticeNode.layer,
        node: latticeNode.id,
        energy: parseFloat(latticeNode.energy.toFixed(4)),
      } : undefined,
      hash: '', // Set below
    };

    // Compute integrity hash
    message.hash = createHash('sha256')
      .update(JSON.stringify({ ...message, hash: undefined }))
      .digest('hex')
      .substring(0, 16); // Short hash for HCS size limits

    // Wrap in HIP-993 format
    const MAX_CHUNK_SIZE = 4096;
    const hip993Payload = {
      _hip993: {
        type: 'DOMAIN_LOG',
        version: '1.0.0',
        max_chunk_size: MAX_CHUNK_SIZE,
        features: ['domain_specific', 'integrity_hash', 'semantic_versioning'],
        timestamp: Date.now(),
        domain: topic.domain
      },
      data: message
    };

    try {
      let payload = JSON.stringify(hip993Payload);

      // HCS HIP-993 max message size is 4096 bytes; truncate data if needed
      if (payload.length > MAX_CHUNK_SIZE) {
        hip993Payload.data.data = { summary: `${topic.domain} ${type.toLowerCase()}`, truncated: true };
        hip993Payload.data.hash = createHash('sha256')
          .update(JSON.stringify({ ...hip993Payload.data, hash: undefined }))
          .digest('hex')
          .substring(0, 16);
        payload = JSON.stringify(hip993Payload);
      }

      // Use hederaMaster for proper HIP-993 chunking and retry logic
      await hederaMaster.submitMessage(topic.topicId, hip993Payload, {
        maxChunkSize: 4096 // HIP-993 max
      });

      this.totalSubmitted++;

      logger.debug('HCSDomainLogger', {
        message: `${type} → ${topic.domain}`,
        topicId: topic.topicId,
        seq: topic.sequenceNumber,
      });

      return true;
    } catch (error) {
      this.totalFailed++;
      logger.warn('HCSDomainLogger', {
        message: `Failed to submit to ${topic.domain}`,
        topicId: topic.topicId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Manually log a domain event (called by other modules)
   */
  async logEvent(topicKey: string, data: Record<string, unknown>): Promise<boolean> {
    const topic = this.topics.get(topicKey);
    if (!topic) return false;
    return this.submitMessage(topic, 'EVENT', data);
  }

  /**
   * Log a metric to a domain topic
   */
  async logMetric(topicKey: string, data: Record<string, unknown>): Promise<boolean> {
    const topic = this.topics.get(topicKey);
    if (!topic) return false;
    return this.submitMessage(topic, 'METRIC', data);
  }

  /**
   * Log an alert to a domain topic
   */
  async logAlert(topicKey: string, data: Record<string, unknown>): Promise<boolean> {
    const topic = this.topics.get(topicKey);
    if (!topic) return false;
    return this.submitMessage(topic, 'ALERT', data);
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      running: this.isRunning,
      registeredTopics: this.topics.size,
      totalSubmitted: this.totalSubmitted,
      totalFailed: this.totalFailed,
      topics: Array.from(this.topics.values()).map(t => ({
        domain: t.domain,
        topicId: t.topicId,
        layer: t.latticeLayer,
        node: t.latticeNode,
        seq: t.sequenceNumber,
        intervalMs: t.heartbeatIntervalMs,
      })),
    };
  }

  /**
   * Update capabilities based on registered domain topics
   */
  private updateDomainCapabilities(): void {
    // Determine which domains are active
    const domains = Array.from(this.topics.values()).map(t => t.domain);

    const domainCapabilities = {
      defi: domains.includes('defi-intelligence'),
      carbon: domains.includes('carbon-verification'),
      compliance: domains.includes('compliance-audit'),
      payment_streams: domains.includes('payment-stream'),
      staking: domains.includes('staking') || domains.includes('defi-intelligence'),
      nft: false,
      dao: false,
      identity: domains.includes('registry') || domains.includes('compliance-audit'),
      supply_chain: domains.includes('carbon-verification'),
    };

    const hederaServices = ['hts', 'hcs', 'hscs', 'hip993'];
    if (domains.includes('compliance-audit') || domains.includes('audit')) {
      hederaServices.push('schedule', 'file');
    }

    this.capabilityRegistry.updateCapabilities({
      node_id: config.HEDERA_OPERATOR_ACCOUNT_ID || 'vera-node',
      domains: domainCapabilities,
      hedera: {
        services: hederaServices as ('hts' | 'hcs' | 'hscs' | 'hip993' | 'file' | 'schedule')[],
        networks: [config.HEDERA_NETWORK || 'testnet'],
        max_tps: 10,
        shard_aware: true,
        evm_compatible: true,
      },
    });

    // Sync with enterprise heartbeat if running
    if (this.enterpriseHeartbeat) {
      this.enterpriseHeartbeat.updateCapabilities(this.capabilityRegistry.getCapabilities());
    }
  }
}

// ─── Domain Capabilities ─────────────────────────────────────────────────────

function getDomainCapabilities(domain: string): string[] {
  switch (domain) {
    case 'registry': return ['agent-registration', 'capability-index', 'discovery'];
    case 'task': return ['task-publish', 'bid-collection', 'task-award'];
    case 'result': return ['result-verification', 'quality-scoring', 'delivery-confirm'];
    case 'audit': return ['immutable-audit-trail', 'compliance-log', 'payment-receipt'];
    case 'beacon': return ['orchestrator-heartbeat', 'sos-signal', 'health-check'];
    case 'hot-topics': return ['trend-detection', 'topic-radar', 'priority-boost'];
    case 'swarm-state': return ['state-sync', 'lattice-snapshot', 'node-health'];
    case 'swarm-consensus': return ['voting', 'agreement-protocol', 'quorum-check'];
    case 'swarm-meet': return ['rendezvous', 'multi-agent-coordination', 'meeting-schedule'];
    case 'swarm-join': return ['membership', 'join-request', 'approval-workflow'];
    case 'swarm-routing': return ['message-routing', 'lattice-path', 'load-balance'];
    case 'federation-handshake': return ['cross-swarm-auth', 'trust-exchange', 'capability-share'];
    case 'federation-consensus': return ['cross-swarm-vote', 'federated-agreement'];
    case 'federation-task': return ['task-delegation', 'cross-swarm-dispatch'];
    case 'federation-heartbeat': return ['peer-health', 'federation-status'];
    case 'defi-intelligence': return ['pool-monitoring', 'price-feed', 'anomaly-detection', 'yield-analysis'];
    case 'carbon-verification': return ['credit-verification', 'offset-validation', 'carbon-audit'];
    case 'compliance-audit': return ['regulatory-check', 'kyc-aml', 'risk-scoring'];
    case 'agent-learning': return ['interaction-log', 'model-update', 'accuracy-tracking'];
    case 'payment-stream': return ['streaming-payment', 'micro-settlement', 'hbar-flow'];
    default: return ['general'];
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const hcsDomainLogger = new HCSDomainLogger();
export default hcsDomainLogger;
