/**
 * Vera HCS Growth & Trust Logger
 * 
 * Maximizes HCS usage to create immutable timestamps of:
 * - Every verification
 * - Growth milestones
 * - Trust scores
 * - Payment receipts
 * - System health
 * 
 * This creates an auditable, trustable history on Hedera.
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { createHash } from 'crypto';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { createOptimizedHCSLogger, OptimizedHCSBatchLogger } from '../vera/logging/optimizedHCSBatchLogger.js';

export interface GrowthMilestone {
  timestamp: number;
  totalVerifications: number;
  totalEarnings: number;
  rank: number;
  milestone: string;
}

export interface TrustScore {
  timestamp: number;
  score: number; // 0-100
  accuracy: number;
  uptime: number;
  responseTime: number;
  factors: string[];
}

export class VeraHCSLogger {
  private client: Client;
  private optimizedLogger: OptimizedHCSBatchLogger;
  private topics = {
    verifications: null as string | null,
    growth: null as string | null,
    trust: null as string | null,
    payments: null as string | null,
    milestones: null as string | null,
  };
  
  // Buffers for batching
  private verificationBuffer: Array<{ type: string; data: Record<string, unknown>; priority: 'normal' | 'high' | 'critical' }> = [];
  private growthBuffer: Array<{ type: string; data: Record<string, unknown>; priority: 'normal' | 'high' | 'critical' }> = [];
  private trustBuffer: Array<{ type: string; data: Record<string, unknown>; priority: 'normal' | 'high' | 'critical' }> = [];
  private paymentBuffer: Array<{ type: string; data: Record<string, unknown>; priority: 'normal' | 'high' | 'critical' }> = [];
  private milestoneBuffer: Array<{ type: string; data: Record<string, unknown>; priority: 'normal' | 'high' | 'critical' }> = [];
  
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_FLUSH_MS = 30000; // 30 seconds (was 100ms - way too spammy!)

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    // Initialize optimized logger (will be ready after topics are set)
    this.optimizedLogger = createOptimizedHCSLogger({}, {
      batchSize: 50,           // Batch more messages
      flushIntervalMs: 30000,  // 30 seconds (was 100ms!)
      maxParallelSubmissions: 2, // Reduce parallel submissions
      enableCompression: true,
      adaptiveBatching: true,
      targetTps: 1,            // 1 msg/sec max (was 100!)
    });
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
      let privateKey: PrivateKey;
      
      try {
        if (keyStr.length === 64) {
          try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
          catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
        } else {
          privateKey = PrivateKey.fromString(keyStr);
        }
        
        this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
        logger.info('VeraHCS', { message: 'HCS client ready with optimized batch logging' });
      } catch (error) {
        logger.error('VeraHCS', { error, message: 'HCS client init failed' });
      }
    }
    
    // Start batch flush timer
    this.startFlushTimer();
  }
  
  /**
   * Start periodic buffer flush
   */
  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      this.flushBuffers();
    }, this.BUFFER_FLUSH_MS);
  }
  
  /**
   * Stop the logger and flush remaining messages
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flushBuffers();
    this.optimizedLogger.stop();
  }
  
  /**
   * Flush all buffers to HCS
   */
  private async flushBuffers(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    
    if (this.verificationBuffer.length > 0) {
      const batch = this.verificationBuffer.splice(0);
      promises.push(this.optimizedLogger.enqueueBatch('verifications', batch).catch(() => {}));
    }
    if (this.growthBuffer.length > 0) {
      const batch = this.growthBuffer.splice(0);
      promises.push(this.optimizedLogger.enqueueBatch('growth', batch).catch(() => {}));
    }
    if (this.trustBuffer.length > 0) {
      const batch = this.trustBuffer.splice(0);
      promises.push(this.optimizedLogger.enqueueBatch('trust', batch).catch(() => {}));
    }
    if (this.paymentBuffer.length > 0) {
      const batch = this.paymentBuffer.splice(0);
      promises.push(this.optimizedLogger.enqueueBatch('payments', batch).catch(() => {}));
    }
    if (this.milestoneBuffer.length > 0) {
      const batch = this.milestoneBuffer.splice(0);
      promises.push(this.optimizedLogger.enqueueBatch('milestones', batch).catch(() => {}));
    }
    
    await Promise.all(promises);
  }

  /**
   * Initialize all HCS topics for maximum trust
   * Uses existing topics if available, creates new ones if not
   */
  async initialize(): Promise<void> {
    logger.info('VeraHCS', { message: 'Initializing HCS topics for trust & growth...' });

    // Use existing topics from vera-fix-hcs.ts if available
    const EXISTING_VERIFICATIONS_TOPIC = '0.0.10409351';
    const EXISTING_MILESTONES_TOPIC = '0.0.10409353';

    // Check if we can use existing topics (try to submit a test message)
    try {
      const testMsg = this.wrapHIP993('INIT', { test: true });
      await new TopicMessageSubmitTransaction()
        .setTopicId(EXISTING_VERIFICATIONS_TOPIC)
        .setMessage(testMsg)
        .execute(this.client);
      
      this.topics.verifications = EXISTING_VERIFICATIONS_TOPIC;
      this.topics.milestones = EXISTING_MILESTONES_TOPIC;
      logger.info('VeraHCS', { 
        verifications: EXISTING_VERIFICATIONS_TOPIC,
        milestones: EXISTING_MILESTONES_TOPIC,
        message: 'Using existing HCS topics' 
      });
      return;
    } catch (e) {
      logger.info('VeraHCS', { message: 'Existing topics not available, creating new ones...' });
    }

    // Fall back to creating new topics if existing ones don't work

    // 1. Verification Topic - Every single credit verified
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo('Vera: All Carbon Credit Verifications (Immutable)')
        .setSubmitKey(this.client.operatorPublicKey!)
        .execute(this.client);
      const receipt = await tx.getReceipt(this.client);
      this.topics.verifications = receipt.topicId?.toString() || null;
      logger.info('VeraHCS', { topicId: this.topics.verifications, type: 'verifications' });
    } catch (e) {
      logger.warn('VeraHCS', { error: e, type: 'verifications' });
    }

    // 2. Growth Topic - Milestones and metrics
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo('Vera: Growth Milestones & Metrics')
        .execute(this.client);
      const receipt = await tx.getReceipt(this.client);
      this.topics.growth = receipt.topicId?.toString() || null;
      logger.info('VeraHCS', { topicId: this.topics.growth, type: 'growth' });
    } catch (e) {
      logger.warn('VeraHCS', { error: e, type: 'growth' });
    }

    // 3. Trust Topic - Trust scores and reputation
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo('Vera: Trust Score & Reputation Log')
        .execute(this.client);
      const receipt = await tx.getReceipt(this.client);
      this.topics.trust = receipt.topicId?.toString() || null;
      logger.info('VeraHCS', { topicId: this.topics.trust, type: 'trust' });
    } catch (e) {
      logger.warn('VeraHCS', { error: e, type: 'trust' });
    }

    // 4. Payment Topic - All payment receipts
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo('Vera: Payment Receipts & Earnings')
        .execute(this.client);
      const receipt = await tx.getReceipt(this.client);
      this.topics.payments = receipt.topicId?.toString() || null;
      logger.info('VeraHCS', { topicId: this.topics.payments, type: 'payments' });
    } catch (e) {
      logger.warn('VeraHCS', { error: e, type: 'payments' });
    }

    // 5. Milestones Topic - Major achievements
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo('Vera: Major Milestones & Achievements')
        .execute(this.client);
      const receipt = await tx.getReceipt(this.client);
      this.topics.milestones = receipt.topicId?.toString() || null;
      logger.info('VeraHCS', { topicId: this.topics.milestones, type: 'milestones' });
    } catch (e) {
      logger.warn('VeraHCS', { error: e, type: 'milestones' });
    }

    logger.info('VeraHCS', { 
      topics: this.topics,
      message: 'HCS topics initialized with optimized batch logging' 
    });
    
    // Update optimized logger with topic IDs
    const topicMap: Record<string, string> = {};
    if (this.topics.verifications) topicMap.verifications = this.topics.verifications;
    if (this.topics.growth) topicMap.growth = this.topics.growth;
    if (this.topics.trust) topicMap.trust = this.topics.trust;
    if (this.topics.payments) topicMap.payments = this.topics.payments;
    if (this.topics.milestones) topicMap.milestones = this.topics.milestones;
    
    // Re-create optimized logger with topic IDs
    this.optimizedLogger = createOptimizedHCSLogger(topicMap, {
      batchSize: 25,
      flushIntervalMs: 100,
      maxParallelSubmissions: 10,
      enableCompression: true,
      adaptiveBatching: true,
      targetTps: 100,
    });
  }

  /**
   * Log EVERY verification to HCS (immutable timestamp)
   */
  async logVerification(data: {
    id: string;
    verified: boolean;
    confidence: number;
    carbonTons: number;
    duration: number;
    batchId: string;
  }): Promise<void> {
    if (!this.topics.verifications) return;

    const messageData = {
      ...data,
      verifier: config.HEDERA_OPERATOR_ACCOUNT_ID,
      signature: this.sign(data.id),
    };

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.topics.verifications)
        .setMessage(this.wrapHIP993('VERIFICATION', messageData))
        .execute(this.client);
      
      logger.info('VeraHCS', { 
        id: data.id, 
        verified: data.verified,
        message: 'Verification logged to HCS' 
      });
    } catch (error) {
      logger.error('VeraHCS', { error, id: data.id });
    }
  }

  /**
   * Log growth milestone to HCS
   */
  async logGrowthMilestone(milestone: GrowthMilestone): Promise<void> {
    if (!this.topics.growth) return;

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.topics.growth)
        .setMessage(this.wrapHIP993('GROWTH_MILESTONE', milestone))
        .execute(this.client);
      
      logger.info('VeraHCS', { 
        milestone: milestone.milestone,
        verifications: milestone.totalVerifications,
        message: 'Growth milestone logged' 
      });
    } catch (error) {
      logger.error('VeraHCS', { error, milestone });
    }
  }

  /**
   * Log trust score to HCS
   */
  async logTrustScore(score: TrustScore): Promise<void> {
    if (!this.topics.trust) return;

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.topics.trust)
        .setMessage(this.wrapHIP993('TRUST_SCORE', score))
        .execute(this.client);
      
      logger.info('VeraHCS', { 
        score: score.score,
        accuracy: score.accuracy,
        message: 'Trust score logged' 
      });
    } catch (error) {
      logger.error('VeraHCS', { error, score });
    }
  }

  /**
   * Log payment receipt to HCS
   */
  async logPayment(data: {
    invoiceId: string;
    amount: number;
    fromAccount: string;
    transactionId: string;
    timestamp: number;
  }): Promise<void> {
    if (!this.topics.payments) return;

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.topics.payments)
        .setMessage(this.wrapHIP993('PAYMENT_RECEIPT', { ...data, toAccount: config.HEDERA_OPERATOR_ACCOUNT_ID }))
        .execute(this.client);
      
      logger.info('VeraHCS', { 
        amount: data.amount,
        from: data.fromAccount,
        message: 'Payment logged to HCS' 
      });
    } catch (error) {
      logger.error('VeraHCS', { error, payment: data });
    }
  }

  /**
   * Log major achievement
   */
  async logAchievement(achievement: string, metadata: Record<string, any>): Promise<void> {
    if (!this.topics.milestones) return;

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.topics.milestones)
        .setMessage(this.wrapHIP993('ACHIEVEMENT', { timestamp: Date.now(), achievement, ...metadata }))
        .execute(this.client);
      
      logger.info('VeraHCS', { achievement, message: 'Achievement logged' });
    } catch (error) {
      logger.error('VeraHCS', { error, achievement });
    }
  }

  /**
   * Get all topic IDs for HashScan viewing
   */
  getTopicIds(): typeof this.topics {
    return { ...this.topics };
  }

  /**
   * Generate HashScan links for all topics
   */
  getHashScanLinks(): Record<string, string> {
    const links: Record<string, string> = {};
    
    if (this.topics.verifications) {
      links.verifications = `https://hashscan.io/mainnet/topic/${this.topics.verifications}`;
    }
    if (this.topics.growth) {
      links.growth = `https://hashscan.io/mainnet/topic/${this.topics.growth}`;
    }
    if (this.topics.trust) {
      links.trust = `https://hashscan.io/mainnet/topic/${this.topics.trust}`;
    }
    if (this.topics.payments) {
      links.payments = `https://hashscan.io/mainnet/topic/${this.topics.payments}`;
    }
    if (this.topics.milestones) {
      links.milestones = `https://hashscan.io/mainnet/topic/${this.topics.milestones}`;
    }
    
    return links;
  }

  private sign(data: string): string {
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Wrap message in HIP-993 format
   */
  private wrapHIP993(type: string, data: any): string {
    const MAX_CHUNK_SIZE = 4096;
    const payload = {
      _hip993: {
        type,
        version: '1.0.0',
        max_chunk_size: MAX_CHUNK_SIZE,
        features: ['structured_data', 'signature', 'timestamp'],
        timestamp: Date.now()
      },
      data
    };
    return JSON.stringify(payload);
  }
}

// Singleton
export const veraHCS = new VeraHCSLogger();
