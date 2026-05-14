/**
 * HCS-10 OpenConvAI Agent Communication
 * 
 * Enables Vera to participate in the Hedera agent ecosystem:
 * - Register as a discoverable AI agent
 * - Accept requests from other agents via HCS topics
 * - Spawn sub-agents to handle distributed tasks
 * - Communicate results back via HCS-10 protocol
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, TopicMessageQuery, PrivateKey, AccountId } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { runSubAgent, type SubAgentRole } from '../agent/subAgent.js';
import crypto from 'crypto';

// HCS-10 Registry Topic (mainnet/testnet specific)
const HCS10_REGISTRY_TOPIC = {
  mainnet: '0.0.1234567', // Will be updated when official registry launches
  testnet: '0.0.1234567',
};

// HCS-11 Profile topic base
const HCS11_PROFILE_BASE = 'https://hol.org/profile/';

export interface HCS10AgentProfile {
  id: string;
  accountId: string;
  name: string;
  description: string;
  capabilities: string[];
  inboundTopicId: string;
  outboundTopicId: string;
  version: string;
  endpoint?: string;
}

export interface HCS10Message {
  id: string;
  type: 'REQUEST' | 'RESPONSE' | 'BROADCAST' | 'DELEGATION';
  from: string;
  to?: string;
  timestamp: number;
  payload: {
    task?: string;
    role?: SubAgentRole;
    context?: string;
    result?: unknown;
    error?: string;
    tools?: string[];
  };
  signature?: string;
}

export interface AgentRegistration {
  agentId: string;
  accountId: string;
  profileCid: string;
  inboundTopicId: string;
  capabilities: string[];
  registeredAt: number;
}

class HCS10AgentKit {
  private client: Client;
  private agentProfile: HCS10AgentProfile | null = null;
  private inboundTopicId: string | null = null;
  private outboundTopicId: string | null = null;
  private messageHandlers: Map<string, (msg: HCS10Message) => Promise<void>> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastSequenceNumber = 0;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      const privateKey = this.parsePrivateKey(config.HEDERA_OPERATOR_PRIVATE_KEY);
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
    }
  }

  private parsePrivateKey(keyStr: string): PrivateKey {
    if (keyStr.startsWith('302')) {
      return PrivateKey.fromStringDer(keyStr);
    } else if (keyStr.length === 64) {
      try { 
        return PrivateKey.fromStringECDSA(keyStr); 
      } catch { 
        return PrivateKey.fromStringED25519(keyStr); 
      }
    }
    return PrivateKey.fromString(keyStr);
  }

  /**
   * Register Vera as an HCS-10 compliant agent
   */
  async registerAgent(params: {
    name: string;
    description: string;
    capabilities: string[];
    endpoint?: string;
  }): Promise<HCS10AgentProfile> {
    logger.info('HCS10', { message: 'Registering Vera as HCS-10 agent...' });

    // Create inbound topic for receiving requests
    const inboundTx = await new TopicCreateTransaction()
      .setTopicMemo(`Vera Inbound - ${params.name}`)
      .execute(this.client);
    const inboundReceipt = await inboundTx.getReceipt(this.client);
    this.inboundTopicId = inboundReceipt.topicId?.toString() ?? '';

    // Create outbound topic for sending responses
    const outboundTx = await new TopicCreateTransaction()
      .setTopicMemo(`Vera Outbound - ${params.name}`)
      .execute(this.client);
    const outboundReceipt = await outboundTx.getReceipt(this.client);
    this.outboundTopicId = outboundReceipt.topicId?.toString() ?? '';

    // Build agent profile
    this.agentProfile = {
      id: crypto.randomUUID(),
      accountId: config.HEDERA_OPERATOR_ACCOUNT_ID ?? '',
      name: params.name,
      description: params.description,
      capabilities: params.capabilities,
      inboundTopicId: this.inboundTopicId,
      outboundTopicId: this.outboundTopicId,
      version: '1.0.0',
      endpoint: params.endpoint,
    };

    // Register with HCS-10 registry
    await this.registerWithRegistry();

    logger.info('HCS10', { inbound: this.inboundTopicId, outbound: this.outboundTopicId, message: 'Agent registered' });
    
    return this.agentProfile;
  }

  /**
   * Register with the HCS-10 agent registry
   */
  private async registerWithRegistry(): Promise<void> {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    const registryTopic = HCS10_REGISTRY_TOPIC[network];

    if (!registryTopic || registryTopic === '0.0.1234567') {
      logger.warn('HCS10', { message: 'Registry topic not configured - skipping registry registration' });
      return;
    }

    const registration: AgentRegistration = {
      agentId: this.agentProfile!.id,
      accountId: this.agentProfile!.accountId,
      profileCid: `${HCS11_PROFILE_BASE}${this.agentProfile!.id}`,
      inboundTopicId: this.inboundTopicId!,
      capabilities: this.agentProfile!.capabilities,
      registeredAt: Date.now(),
    };

    await new TopicMessageSubmitTransaction()
      .setTopicId(registryTopic)
      .setMessage(JSON.stringify({
        type: 'REGISTRATION',
        ...registration,
      }))
      .execute(this.client);

    logger.info('HCS10', { registryTopic, message: 'Registered with HCS-10 registry' });
  }

  /**
   * Send a message to another agent
   */
  async sendMessage(toAgentId: string, message: Omit<HCS10Message, 'id' | 'from' | 'timestamp'>): Promise<void> {
    if (!this.outboundTopicId) {
      throw new Error('Agent not registered - call registerAgent first');
    }

    const fullMessage: HCS10Message = {
      id: crypto.randomUUID(),
      from: this.agentProfile!.accountId,
      timestamp: Date.now(),
      ...message,
      to: toAgentId,
    };

    await new TopicMessageSubmitTransaction()
      .setTopicId(this.outboundTopicId)
      .setMessage(JSON.stringify(fullMessage))
      .execute(this.client);

    logger.info('HCS10', { to: toAgentId, type: message.type, message: 'Message sent' });
  }

  /**
   * Broadcast a message to all listening agents
   */
  async broadcast(payload: HCS10Message['payload']): Promise<void> {
    if (!this.outboundTopicId) {
      throw new Error('Agent not registered - call registerAgent first');
    }

    const message: HCS10Message = {
      id: crypto.randomUUID(),
      type: 'BROADCAST',
      from: this.agentProfile!.accountId,
      timestamp: Date.now(),
      payload,
    };

    await new TopicMessageSubmitTransaction()
      .setTopicId(this.outboundTopicId)
      .setMessage(JSON.stringify(message))
      .execute(this.client);
  }

  /**
   * Handle incoming delegation requests by spawning sub-agents
   */
  private async handleDelegationRequest(message: HCS10Message): Promise<void> {
    logger.info('HCS10', { from: message.from, task: message.payload.task, message: 'Handling delegation' });

    const { task, role = 'researcher', context } = message.payload;

    if (!task) {
      await this.sendMessage(message.from, {
        type: 'RESPONSE',
        payload: { error: 'No task specified in delegation request' },
      });
      return;
    }

    try {
      // Spawn sub-agent to handle the task
      const result = await runSubAgent({
        role: role as SubAgentRole,
        task,
        context,
      });

      // Send response back to requesting agent
      await this.sendMessage(message.from, {
        type: 'RESPONSE',
        payload: {
          result: {
            role: result.role,
            result: result.result,
            tools_called: result.tools_called,
            rounds: result.rounds,
          },
        },
      });

      logger.info('HCS10', { to: message.from, message: 'Delegation completed - sent response' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.sendMessage(message.from, {
        type: 'RESPONSE',
        payload: { error: errorMsg },
      });
      logger.error('HCS10', { error: errorMsg, message: 'Delegation failed' });
    }
  }

  /**
   * Start listening for incoming messages
   */
  async startListening(): Promise<void> {
    if (!this.inboundTopicId) {
      throw new Error('Agent not registered - call registerAgent first');
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Poll for new messages every 5 seconds
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollMessages();
      } catch (error) {
        logger.error('HCS10', { error: String(error), message: 'Polling error' });
      }
    }, 5000);

    logger.info('HCS10', { topicId: this.inboundTopicId, message: 'Started listening' });
  }

  /**
   * Poll for new messages on inbound topic
   */
  private async pollMessages(): Promise<void> {
    const query = new TopicMessageQuery()
      .setTopicId(this.inboundTopicId!)
      .setStartTime(0);

    // For now, use a simpler approach - query recent messages
    // In production, this would use mirror node REST API with pagination
    logger.debug('HCS10', { message: 'Polling for new messages...' });
  }

  /**
   * Process a received message
   */
  private async processMessage(message: HCS10Message): Promise<void> {
    logger.info('HCS10', { type: message.type, from: message.from, message: 'Processing message' });

    switch (message.type) {
      case 'REQUEST':
        // Direct request - handle synchronously
        await this.handleRequest(message);
        break;
      case 'DELEGATION':
        // Delegation - spawn sub-agent asynchronously
        await this.handleDelegationRequest(message);
        break;
      case 'BROADCAST':
        // Broadcast - process if relevant
        await this.handleBroadcast(message);
        break;
      case 'RESPONSE':
        // Response to our previous request - route to callback
        await this.handleResponse(message);
        break;
    }
  }

  private async handleRequest(message: HCS10Message): Promise<void> {
    // Handle direct requests (queries, simple operations)
    const { task } = message.payload;
    logger.info('HCS10', { request: message.payload.task, message: 'Handling request' });
  }

  private async handleBroadcast(message: HCS10Message): Promise<void> {
    // Check if broadcast is relevant to our capabilities
    const relevant = this.agentProfile?.capabilities.some(cap => 
      message.payload.task?.toLowerCase().includes(cap.toLowerCase())
    );
    
    if (relevant) {
      logger.info('HCS10', { task: message.payload.task, message: 'Relevant broadcast received' });
    }
  }

  private async handleResponse(message: HCS10Message): Promise<void> {
    // Route response to the appropriate callback
    const handler = this.messageHandlers.get(message.id);
    if (handler) {
      await handler(message);
      this.messageHandlers.delete(message.id);
    }
  }

  /**
   * Stop listening for messages
   */
  stopListening(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    logger.info('HCS10', { message: 'Stopped listening' });
  }

  /**
   * Get agent profile
   */
  getProfile(): HCS10AgentProfile | null {
    return this.agentProfile;
  }

  /**
   * Check if agent is registered
   */
  isRegistered(): boolean {
    return !!this.agentProfile && !!this.inboundTopicId;
  }
}

// Singleton instance
let hcs10Kit: HCS10AgentKit | null = null;

export function getHCS10AgentKit(): HCS10AgentKit {
  if (!hcs10Kit) {
    hcs10Kit = new HCS10AgentKit();
  }
  return hcs10Kit;
}

export function resetHCS10AgentKit(): void {
  hcs10Kit?.stopListening();
  hcs10Kit = null;
}

export { HCS10AgentKit };
