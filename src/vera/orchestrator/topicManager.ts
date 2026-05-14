import { TopicCreateTransaction } from '@hashgraph/sdk';
import fs from 'fs/promises';
import path from 'path';
import { getClient } from '../../hedera/tools/client.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

export interface PaymentTopics {
  // Foundation Layer (existing 6)
  registryTopicId?: string | null;
  taskTopicId?: string | null;
  resultTopicId?: string | null;
  auditTopicId?: string | null;
  beaconTopicId?: string | null;
  hotTopicsTopicId?: string | null;
  
  // Swarm Coordination Layer (5 new)
  swarmStateTopicId?: string | null;
  swarmConsensusTopicId?: string | null;
  swarmMeetTopicId?: string | null;
  swarmJoinTopicId?: string | null;
  swarmRoutingTopicId?: string | null;
  
  // Cross-Swarm Federation Layer (4 new)
  federationHandshakeTopicId?: string | null;
  federationConsensusTopicId?: string | null;
  federationTaskTopicId?: string | null;
  federationHeartbeatTopicId?: string | null;
  
  // Domain-Specific Layer (5 new)
  defiIntelligenceTopicId?: string | null;
  carbonVerificationTopicId?: string | null;
  complianceAuditTopicId?: string | null;
  agentLearningTopicId?: string | null;
  paymentStreamTopicId?: string | null;
}

interface StoredTopicFile extends PaymentTopics {
  createdAt: string;
  network: string;
}

const STORAGE_PATH = path.resolve(process.cwd(), 'data', 'vera-payment-topics.json');

const TOPIC_MEMOS: Record<keyof PaymentTopics, string> = {
  // Foundation
  registryTopicId: 'Vera Payment Registry',
  taskTopicId: 'Vera Task Queue',
  resultTopicId: 'Vera Task Results',
  auditTopicId: 'Vera Payment Audit Log',
  beaconTopicId: 'Vera Agent Beacon SOS',
  hotTopicsTopicId: 'Vera Hot Topics Radar',
  // Swarm Coordination
  swarmStateTopicId: 'Vera Swarm State Sync',
  swarmConsensusTopicId: 'Vera Swarm Consensus',
  swarmMeetTopicId: 'Vera Swarm Meet Ops',
  swarmJoinTopicId: 'Vera Swarm Join Ops',
  swarmRoutingTopicId: 'Vera Swarm Task Routing',
  // Cross-Swarm Federation
  federationHandshakeTopicId: 'Vera Federation Handshake',
  federationConsensusTopicId: 'Vera Federated Consensus',
  federationTaskTopicId: 'Vera Cross-Swarm Tasks',
  federationHeartbeatTopicId: 'Vera Federation Health',
  // Domain-Specific
  defiIntelligenceTopicId: 'Vera DeFi Intelligence',
  carbonVerificationTopicId: 'Vera Carbon Verification',
  complianceAuditTopicId: 'Vera Compliance Audit',
  agentLearningTopicId: 'Vera Agent Learning',
  paymentStreamTopicId: 'Vera Payment Streams',
};

const CORE_TOPIC_KEYS = [
  'registryTopicId',
  'taskTopicId',
  'resultTopicId',
  'auditTopicId',
] as const satisfies ReadonlyArray<keyof PaymentTopics>;

const ALL_TOPIC_KEYS = Object.keys(TOPIC_MEMOS) as Array<keyof PaymentTopics>;

interface PaymentTopicManagerOptions {
  requiredTopicKeys?: Array<keyof PaymentTopics>;
}

export class PaymentTopicManager {
  private cachedTopics: PaymentTopics | null = null;
  private readonly requiredTopicKeys: Array<keyof PaymentTopics>;

  constructor(options: PaymentTopicManagerOptions = {}) {
    this.requiredTopicKeys = options.requiredTopicKeys ?? [...CORE_TOPIC_KEYS];
  }

  async ensureTopics(): Promise<PaymentTopics> {
    if (this.cachedTopics) {
      return this.cachedTopics;
    }

    const topicsFromConfig = this.getTopicsFromConfig();
    const topicsFromDisk = await this.readTopicsFromDisk();

    const merged: PaymentTopics = {
      registryTopicId: topicsFromConfig.registryTopicId || topicsFromDisk.registryTopicId || null,
      taskTopicId: topicsFromConfig.taskTopicId || topicsFromDisk.taskTopicId || null,
      resultTopicId: topicsFromConfig.resultTopicId || topicsFromDisk.resultTopicId || null,
      auditTopicId: topicsFromConfig.auditTopicId || topicsFromDisk.auditTopicId || null,
      beaconTopicId: topicsFromConfig.beaconTopicId || topicsFromDisk.beaconTopicId || null,
      hotTopicsTopicId: topicsFromConfig.hotTopicsTopicId || topicsFromDisk.hotTopicsTopicId || null,
      // Swarm Coordination
      swarmStateTopicId: topicsFromConfig.swarmStateTopicId || topicsFromDisk.swarmStateTopicId || null,
      swarmConsensusTopicId: topicsFromConfig.swarmConsensusTopicId || topicsFromDisk.swarmConsensusTopicId || null,
      swarmMeetTopicId: topicsFromConfig.swarmMeetTopicId || topicsFromDisk.swarmMeetTopicId || null,
      swarmJoinTopicId: topicsFromConfig.swarmJoinTopicId || topicsFromDisk.swarmJoinTopicId || null,
      swarmRoutingTopicId: topicsFromConfig.swarmRoutingTopicId || topicsFromDisk.swarmRoutingTopicId || null,
      // Cross-Swarm Federation
      federationHandshakeTopicId: topicsFromConfig.federationHandshakeTopicId || topicsFromDisk.federationHandshakeTopicId || null,
      federationConsensusTopicId: topicsFromConfig.federationConsensusTopicId || topicsFromDisk.federationConsensusTopicId || null,
      federationTaskTopicId: topicsFromConfig.federationTaskTopicId || topicsFromDisk.federationTaskTopicId || null,
      federationHeartbeatTopicId: topicsFromConfig.federationHeartbeatTopicId || topicsFromDisk.federationHeartbeatTopicId || null,
      // Domain-Specific
      defiIntelligenceTopicId: topicsFromConfig.defiIntelligenceTopicId || topicsFromDisk.defiIntelligenceTopicId || null,
      carbonVerificationTopicId: topicsFromConfig.carbonVerificationTopicId || topicsFromDisk.carbonVerificationTopicId || null,
      complianceAuditTopicId: topicsFromConfig.complianceAuditTopicId || topicsFromDisk.complianceAuditTopicId || null,
      agentLearningTopicId: topicsFromConfig.agentLearningTopicId || topicsFromDisk.agentLearningTopicId || null,
      paymentStreamTopicId: topicsFromConfig.paymentStreamTopicId || topicsFromDisk.paymentStreamTopicId || null,
    };

    const missingKeys = this.requiredTopicKeys.filter((key) => !merged[key]);

    if (missingKeys.length > 0) {
      const client = this.tryGetClient();
      if (!client) {
        logger.warn('PaymentTopicManager', {
          message: 'Cannot create missing topics - Hedera operator credentials are not configured.',
          missingTopics: missingKeys,
        });
      } else {
        for (const key of missingKeys) {
          const createdId = await this.createTopic(client, key);
          if (createdId) {
            merged[key] = createdId;
          }
        }

        await this.persistTopics(merged);
      }
    }

    this.applyTopicsToConfig(merged);
    this.cachedTopics = merged;
    return merged;
  }

  private getTopicsFromConfig(): PaymentTopics {
    return {
      // Foundation
      registryTopicId: config.VERA_REGISTRY_TOPIC_ID || null,
      taskTopicId: config.VERA_TASK_TOPIC_ID || null,
      resultTopicId: config.VERA_RESULT_TOPIC_ID || null,
      auditTopicId: config.VERA_AUDIT_TOPIC_ID || null,
      beaconTopicId: config.VERA_BEACON_TOPIC_ID || null,
      hotTopicsTopicId: config.VERA_HOT_TOPICS_TOPIC_ID || null,
      // Swarm Coordination
      swarmStateTopicId: config.VERA_SWARM_STATE_TOPIC_ID || null,
      swarmConsensusTopicId: config.VERA_SWARM_CONSENSUS_TOPIC_ID || null,
      swarmMeetTopicId: config.VERA_SWARM_MEET_TOPIC_ID || null,
      swarmJoinTopicId: config.VERA_SWARM_JOIN_TOPIC_ID || null,
      swarmRoutingTopicId: config.VERA_SWARM_ROUTING_TOPIC_ID || null,
      // Cross-Swarm Federation
      federationHandshakeTopicId: config.VERA_FEDERATION_HANDSHAKE_TOPIC_ID || null,
      federationConsensusTopicId: config.VERA_FEDERATION_CONSENSUS_TOPIC_ID || null,
      federationTaskTopicId: config.VERA_FEDERATION_TASK_TOPIC_ID || null,
      federationHeartbeatTopicId: config.VERA_FEDERATION_HEARTBEAT_TOPIC_ID || null,
      // Domain-Specific
      defiIntelligenceTopicId: config.VERA_DEFI_INTELLIGENCE_TOPIC_ID || null,
      carbonVerificationTopicId: config.VERA_CARBON_VERIFICATION_TOPIC_ID || null,
      complianceAuditTopicId: config.VERA_COMPLIANCE_AUDIT_TOPIC_ID || null,
      agentLearningTopicId: config.VERA_AGENT_LEARNING_TOPIC_ID || null,
      paymentStreamTopicId: config.VERA_PAYMENT_STREAM_TOPIC_ID || null,
    };
  }

  private async readTopicsFromDisk(): Promise<PaymentTopics> {
    try {
      const raw = await fs.readFile(STORAGE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoredTopicFile;
      if (parsed.network !== config.HEDERA_NETWORK) {
        return {};
      }
      return {
        // Foundation
        registryTopicId: parsed.registryTopicId ?? null,
        taskTopicId: parsed.taskTopicId ?? null,
        resultTopicId: parsed.resultTopicId ?? null,
        auditTopicId: parsed.auditTopicId ?? null,
        beaconTopicId: parsed.beaconTopicId ?? null,
        hotTopicsTopicId: parsed.hotTopicsTopicId ?? null,
        // Swarm Coordination
        swarmStateTopicId: parsed.swarmStateTopicId ?? null,
        swarmConsensusTopicId: parsed.swarmConsensusTopicId ?? null,
        swarmMeetTopicId: parsed.swarmMeetTopicId ?? null,
        swarmJoinTopicId: parsed.swarmJoinTopicId ?? null,
        swarmRoutingTopicId: parsed.swarmRoutingTopicId ?? null,
        // Cross-Swarm Federation
        federationHandshakeTopicId: parsed.federationHandshakeTopicId ?? null,
        federationConsensusTopicId: parsed.federationConsensusTopicId ?? null,
        federationTaskTopicId: parsed.federationTaskTopicId ?? null,
        federationHeartbeatTopicId: parsed.federationHeartbeatTopicId ?? null,
        // Domain-Specific
        defiIntelligenceTopicId: parsed.defiIntelligenceTopicId ?? null,
        carbonVerificationTopicId: parsed.carbonVerificationTopicId ?? null,
        complianceAuditTopicId: parsed.complianceAuditTopicId ?? null,
        agentLearningTopicId: parsed.agentLearningTopicId ?? null,
        paymentStreamTopicId: parsed.paymentStreamTopicId ?? null,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('PaymentTopicManager', {
          message: 'Failed to read stored topic registry',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return {};
    }
  }

  private tryGetClient() {
    try {
      if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
        return null;
      }
      return getClient();
    } catch (error) {
      logger.error('PaymentTopicManager', {
        message: 'Failed to initialize Hedera client for topic creation',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async createTopic(client: ReturnType<typeof getClient>, key: keyof PaymentTopics): Promise<string | null> {
    const memo = TOPIC_MEMOS[key];
    try {
      const response = await new TopicCreateTransaction()
        .setTopicMemo(memo)
        .execute(client);
      const receipt = await response.getReceipt(client);
      const topicId = receipt.topicId?.toString() ?? null;
      if (topicId) {
        logger.info('PaymentTopicManager', {
          message: 'Created Hedera topic for payment orchestration',
          topicKey: key,
          topicId,
          hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/topic/${topicId}`,
        });
      }
      return topicId;
    } catch (error) {
      logger.error('PaymentTopicManager', {
        message: 'Failed to create Hedera topic',
        topicKey: key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async persistTopics(topics: PaymentTopics): Promise<void> {
    try {
      await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });
      const payload: StoredTopicFile = {
        // Foundation
        registryTopicId: topics.registryTopicId ?? null,
        taskTopicId: topics.taskTopicId ?? null,
        resultTopicId: topics.resultTopicId ?? null,
        auditTopicId: topics.auditTopicId ?? null,
        beaconTopicId: topics.beaconTopicId ?? null,
        hotTopicsTopicId: topics.hotTopicsTopicId ?? null,
        // Swarm Coordination
        swarmStateTopicId: topics.swarmStateTopicId ?? null,
        swarmConsensusTopicId: topics.swarmConsensusTopicId ?? null,
        swarmMeetTopicId: topics.swarmMeetTopicId ?? null,
        swarmJoinTopicId: topics.swarmJoinTopicId ?? null,
        swarmRoutingTopicId: topics.swarmRoutingTopicId ?? null,
        // Cross-Swarm Federation
        federationHandshakeTopicId: topics.federationHandshakeTopicId ?? null,
        federationConsensusTopicId: topics.federationConsensusTopicId ?? null,
        federationTaskTopicId: topics.federationTaskTopicId ?? null,
        federationHeartbeatTopicId: topics.federationHeartbeatTopicId ?? null,
        // Domain-Specific
        defiIntelligenceTopicId: topics.defiIntelligenceTopicId ?? null,
        carbonVerificationTopicId: topics.carbonVerificationTopicId ?? null,
        complianceAuditTopicId: topics.complianceAuditTopicId ?? null,
        agentLearningTopicId: topics.agentLearningTopicId ?? null,
        paymentStreamTopicId: topics.paymentStreamTopicId ?? null,
        createdAt: new Date().toISOString(),
        network: config.HEDERA_NETWORK,
      };
      await fs.writeFile(STORAGE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (error) {
      logger.warn('PaymentTopicManager', {
        message: 'Unable to persist Hedera topic registry to disk',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private applyTopicsToConfig(topics: PaymentTopics): void {
    // Foundation
    if (topics.registryTopicId) (config as any).VERA_REGISTRY_TOPIC_ID = topics.registryTopicId;
    if (topics.taskTopicId) (config as any).VERA_TASK_TOPIC_ID = topics.taskTopicId;
    if (topics.resultTopicId) (config as any).VERA_RESULT_TOPIC_ID = topics.resultTopicId;
    if (topics.auditTopicId) (config as any).VERA_AUDIT_TOPIC_ID = topics.auditTopicId;
    if (topics.beaconTopicId) (config as any).VERA_BEACON_TOPIC_ID = topics.beaconTopicId;
    if (topics.hotTopicsTopicId) (config as any).VERA_HOT_TOPICS_TOPIC_ID = topics.hotTopicsTopicId;
    // Swarm Coordination
    if (topics.swarmStateTopicId) (config as any).VERA_SWARM_STATE_TOPIC_ID = topics.swarmStateTopicId;
    if (topics.swarmConsensusTopicId) (config as any).VERA_SWARM_CONSENSUS_TOPIC_ID = topics.swarmConsensusTopicId;
    if (topics.swarmMeetTopicId) (config as any).VERA_SWARM_MEET_TOPIC_ID = topics.swarmMeetTopicId;
    if (topics.swarmJoinTopicId) (config as any).VERA_SWARM_JOIN_TOPIC_ID = topics.swarmJoinTopicId;
    if (topics.swarmRoutingTopicId) (config as any).VERA_SWARM_ROUTING_TOPIC_ID = topics.swarmRoutingTopicId;
    // Cross-Swarm Federation
    if (topics.federationHandshakeTopicId) (config as any).VERA_FEDERATION_HANDSHAKE_TOPIC_ID = topics.federationHandshakeTopicId;
    if (topics.federationConsensusTopicId) (config as any).VERA_FEDERATION_CONSENSUS_TOPIC_ID = topics.federationConsensusTopicId;
    if (topics.federationTaskTopicId) (config as any).VERA_FEDERATION_TASK_TOPIC_ID = topics.federationTaskTopicId;
    if (topics.federationHeartbeatTopicId) (config as any).VERA_FEDERATION_HEARTBEAT_TOPIC_ID = topics.federationHeartbeatTopicId;
    // Domain-Specific
    if (topics.defiIntelligenceTopicId) (config as any).VERA_DEFI_INTELLIGENCE_TOPIC_ID = topics.defiIntelligenceTopicId;
    if (topics.carbonVerificationTopicId) (config as any).VERA_CARBON_VERIFICATION_TOPIC_ID = topics.carbonVerificationTopicId;
    if (topics.complianceAuditTopicId) (config as any).VERA_COMPLIANCE_AUDIT_TOPIC_ID = topics.complianceAuditTopicId;
    if (topics.agentLearningTopicId) (config as any).VERA_AGENT_LEARNING_TOPIC_ID = topics.agentLearningTopicId;
    if (topics.paymentStreamTopicId) (config as any).VERA_PAYMENT_STREAM_TOPIC_ID = topics.paymentStreamTopicId;
  }
}

export const paymentTopicManager = new PaymentTopicManager({
  requiredTopicKeys: ALL_TOPIC_KEYS,
});
