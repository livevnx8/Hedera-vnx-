/**
 * Jade Messaging Layer
 * 
 * HCS-based agent communication system.
 * Enables inter-agent messaging, status broadcasting, and notifications.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '../monitoring/logger.js';
import { TopicMessageSubmitTransaction, TopicCreateTransaction, Client } from '@hashgraph/sdk';
import { config } from '../config.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  type: 'status' | 'result' | 'request' | 'notification' | 'broadcast';
  payload: unknown;
  timestamp: number;
  priority: number;
}

export interface AgentChannel {
  id: string;
  name: string;
  topicId?: string;
  subscribers: Set<string>;
  messages: AgentMessage[];
}

// ─── Messaging Service ─────────────────────────────────────────────────────

class JadeMessaging {
  private channels = new Map<string, AgentChannel>();
  private hcsClient: Client | null = null;
  private messageQueue: AgentMessage[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.initHCS();
    this.startProcessing();
  }
  
  private initHCS() {
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      try {
        this.hcsClient = Client.forName(config.HEDERA_NETWORK);
        this.hcsClient.setOperator(
          config.HEDERA_OPERATOR_ACCOUNT_ID,
          config.HEDERA_OPERATOR_PRIVATE_KEY
        );
        logger.info('JadeMessaging', { message: 'HCS client initialized' });
      } catch (error) {
        logger.error('JadeMessaging', { error, message: 'Failed to init HCS client' });
      }
    }
  }
  
  private startProcessing() {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000);
  }
  
  /**
   * Create a new messaging channel
   */
  async createChannel(name: string, useHCS = false): Promise<AgentChannel> {
    const id = `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let topicId: string | undefined;
    
    if (useHCS && this.hcsClient) {
      try {
        const tx = await new TopicCreateTransaction()
          .setTopicMemo(`Jade channel: ${name}`)
          .execute(this.hcsClient);
        const receipt = await tx.getReceipt(this.hcsClient);
        topicId = receipt.topicId?.toString();
        logger.info('JadeMessaging', { channelId: id, topicId, message: 'HCS channel created' });
      } catch (error) {
        logger.error('JadeMessaging', { error, message: 'Failed to create HCS topic' });
      }
    }
    
    const channel: AgentChannel = {
      id,
      name,
      topicId,
      subscribers: new Set(),
      messages: [],
    };
    
    this.channels.set(id, channel);
    return channel;
  }
  
  /**
   * Subscribe to a channel
   */
  subscribe(channelId: string, agentId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;
    
    channel.subscribers.add(agentId);
    return true;
  }
  
  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channelId: string, agentId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;
    
    channel.subscribers.delete(agentId);
    return true;
  }
  
  /**
   * Send a message to a channel
   */
  async send(channelId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentMessage | null> {
    const channel = this.channels.get(channelId);
    if (!channel) return null;
    
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    // Add to queue for processing
    this.messageQueue.push(fullMessage);
    channel.messages.push(fullMessage);
    
    // Keep only last 100 messages per channel
    if (channel.messages.length > 100) {
      channel.messages = channel.messages.slice(-100);
    }
    
    // If HCS enabled, submit to blockchain
    if (channel.topicId && this.hcsClient) {
      try {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(channel.topicId)
          .setMessage(JSON.stringify(fullMessage))
          .execute(this.hcsClient);
        await tx.getReceipt(this.hcsClient);
      } catch (error) {
        logger.error('JadeMessaging', { error, message: 'Failed to submit HCS message' });
      }
    }
    
    return fullMessage;
  }
  
  /**
   * Broadcast a message to all subscribers
   */
  async broadcast(from: string, payload: unknown, priority = 1): Promise<void> {
    for (const channel of this.channels.values()) {
      if (channel.subscribers.has(from) || channel.subscribers.size === 0) {
        await this.send(channel.id, {
          from,
          type: 'broadcast',
          payload,
          priority,
        });
      }
    }
  }
  
  /**
   * Send status update
   */
  async sendStatus(agentId: string, status: string, details?: Record<string, unknown>): Promise<void> {
    await this.broadcast(agentId, {
      type: 'status',
      status,
      details,
      timestamp: new Date().toISOString(),
    }, 2);
  }
  
  /**
   * Send notification
   */
  async notify(to: string, title: string, message: string, priority = 1): Promise<void> {
    for (const channel of this.channels.values()) {
      if (channel.subscribers.has(to)) {
        await this.send(channel.id, {
          from: 'system',
          to,
          type: 'notification',
          payload: { title, message },
          priority,
        });
      }
    }
  }
  
  /**
   * Get channel messages
   */
  getMessages(channelId: string, since?: number): AgentMessage[] {
    const channel = this.channels.get(channelId);
    if (!channel) return [];
    
    if (since) {
      return channel.messages.filter(m => m.timestamp > since);
    }
    return [...channel.messages];
  }
  
  /**
   * Get all channels
   */
  getChannels(): Array<{ id: string; name: string; subscriberCount: number; messageCount: number }> {
    return Array.from(this.channels.values()).map(ch => ({
      id: ch.id,
      name: ch.name,
      subscriberCount: ch.subscribers.size,
      messageCount: ch.messages.length,
    }));
  }
  
  /**
   * Process message queue
   */
  private processQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (!message) continue;
      
      // Process high priority messages first
      if (message.priority >= 3) {
        logger.info('JadeMessaging', {
          messageId: message.id,
          from: message.from,
          type: message.type,
          priority: message.priority,
        });
      }
    }
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    this.channels.clear();
    this.messageQueue = [];
  }
}

// Singleton instance
export const jadeMessaging = new JadeMessaging();

// ─── Fastify Routes ────────────────────────────────────────────────────────

export async function registerMessagingRoutes(app: FastifyInstance) {
  /**
   * POST /jade/messaging/channel
   * Create a new messaging channel
   */
  app.post('/jade/messaging/channel', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      name: z.string(),
      useHCS: z.boolean().default(false),
    });
    
    try {
      const body = schema.parse(req.body);
      const channel = await jadeMessaging.createChannel(body.name, body.useHCS);
      return reply.send({
        success: true,
        channel: {
          id: channel.id,
          name: channel.name,
          topicId: channel.topicId,
        },
      });
    } catch (error) {
      logger.error('JadeMessaging', { error, message: 'Failed to create channel' });
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * POST /jade/messaging/subscribe
   * Subscribe to a channel
   */
  app.post('/jade/messaging/subscribe', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      channelId: z.string(),
      agentId: z.string(),
    });
    
    try {
      const body = schema.parse(req.body);
      const success = jadeMessaging.subscribe(body.channelId, body.agentId);
      return reply.send({ success });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * POST /jade/messaging/send
   * Send a message to a channel
   */
  app.post('/jade/messaging/send', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      channelId: z.string(),
      from: z.string(),
      to: z.string().optional(),
      type: z.enum(['status', 'result', 'request', 'notification', 'broadcast']),
      payload: z.any().default({}),
      priority: z.number().default(1),
    });
    
    try {
      const body = schema.parse(req.body);
      const message = await jadeMessaging.send(body.channelId, {
        from: body.from,
        to: body.to,
        type: body.type,
        payload: body.payload || {},
        priority: body.priority,
      });
      return reply.send({ success: !!message, message });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * GET /jade/messaging/channels
   * List all channels
   */
  app.get('/jade/messaging/channels', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      channels: jadeMessaging.getChannels(),
    });
  });
  
  /**
   * GET /jade/messaging/messages/:channelId
   * Get messages from a channel
   */
  app.get('/jade/messaging/messages/:channelId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { channelId } = req.params as { channelId: string };
    const { since } = req.query as { since?: string };
    
    const messages = jadeMessaging.getMessages(channelId, since ? parseInt(since) : undefined);
    return reply.send({ success: true, messages });
  });
  
  logger.info('JadeMessaging', { message: 'Jade messaging routes registered' });
}
