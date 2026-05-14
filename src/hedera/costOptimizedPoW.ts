/**
 * Vera Cost-Optimized Architecture
 * 
 * Current Cost Analysis:
 * - Topic Creation: ~$0.01-0.02 (0.05-0.1 ℏ) each
 * - Message Submit: ~$0.00002 (0.0001 ℏ) each
 * - 12 topic pairs created: ~$0.24-0.48
 * - 110+ messages: ~$0.002
 * - Total depleted: ~$0.50-0.50
 * 
 * Cost Optimization Strategies:
 * 1. Single consolidated topic instead of multiple pairs
 * 2. Batch work records into single messages
 * 3. Lazy initialization - only create topics when needed
 * 4. Off-chain SQLite storage with periodic HCS anchors
 * 5. Shared HCS-10 topics for multi-agent setups
 * 6. Use mirror node REST API for reads (FREE)
 * 7. Compressed message payloads
 * 8. Scheduled batch transactions
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Cost tracking interface
export interface CostMetrics {
  topicCreations: number;
  messagesSubmitted: number;
  totalCostHbar: number;
  estimatedUsd: number;
}

// Optimized work record with batching support
export interface BatchedWorkRecord {
  batchId: string;
  timestamp: number;
  records: Array<{
    id: string;
    taskType: string;
    description: string;
    success: boolean;
    durationMs: number;
  }>;
  batchSignature: string;
}

/**
 * Cost-Optimized Proof of Work System
 * 
 * Key optimizations:
 * - Single topic for all work records (not multiple pairs)
 * - Batching: groups 10-50 records per HCS message
 * - SQLite local storage with periodic HCS anchors
 * - Lazy initialization
 * - Compressed payloads
 */
class CostOptimizedPoW {
  private client: Client;
  private topicId: string | null = null;
  private pendingBatch: any[] = [];
  private readonly BATCH_SIZE = 10; // Submit every 10 records
  private readonly BATCH_TIMEOUT_MS = 60000; // Or every 60 seconds
  private lastBatchTime: number = Date.now();
  private costMetrics: CostMetrics = {
    topicCreations: 0,
    messagesSubmitted: 0,
    totalCostHbar: 0,
    estimatedUsd: 0,
  };
  private dbPath: string;
  private batchTimer: NodeJS.Timeout | null = null;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      const privateKey = this.parsePrivateKey(config.HEDERA_OPERATOR_PRIVATE_KEY);
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
    }

    // Use existing topic from env if available
    if (process.env.POW_TOPIC_ID) {
      this.topicId = process.env.POW_TOPIC_ID;
    }

    // Local SQLite-like JSON storage for caching
    this.dbPath = path.join(process.cwd(), 'data', 'work-records-cache.json');
    this.ensureDbExists();

    // Start batch timer
    this.startBatchTimer();
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

  private ensureDbExists(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({ records: [], lastAnchor: 0 }));
    }
  }

  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      if (this.pendingBatch.length > 0 && 
          Date.now() - this.lastBatchTime > this.BATCH_TIMEOUT_MS) {
        this.flushBatch().catch(console.error);
      }
    }, this.BATCH_TIMEOUT_MS);
  }

  /**
   * LAZY initialization - only creates topic when first needed
   * This saves $0.02 if the agent never actually records work
   */
  async initialize(): Promise<{ topicId: string }> {
    if (this.topicId) {
      return { topicId: this.topicId };
    }

    // Check if we can reuse an existing topic from env
    if (process.env.POW_TOPIC_ID) {
      this.topicId = process.env.POW_TOPIC_ID;
      logger.info('CostOptimizedPoW', { topicId: this.topicId, message: 'Using existing topic from env' });
      return { topicId: this.topicId };
    }

    logger.info('CostOptimizedPoW', { message: 'Creating consolidated topic (lazy init)...' });
    
    const tx = await new TopicCreateTransaction()
      .setTopicMemo('Vera Cost-Optimized Work Records')
      .execute(this.client);
    
    const receipt = await tx.getReceipt(this.client);
    this.topicId = receipt.topicId?.toString() ?? '';
    
    this.costMetrics.topicCreations++;
    this.costMetrics.totalCostHbar += 0.05; // Approx cost
    
    logger.info('CostOptimizedPoW', { 
      topicId: this.topicId, 
      message: 'Consolidated topic created (single topic for all work!)' 
    });

    return { topicId: this.topicId };
  }

  /**
   * Record work - uses batching to reduce HCS costs by 10x
   * Instead of 1 message per record, we batch 10 records per message
   */
  async recordWork(workRecord: any): Promise<{ id: string; batchId?: string }> {
    // Ensure initialized
    if (!this.topicId) {
      await this.initialize();
    }

    const recordId = crypto.randomUUID();
    const enrichedRecord = {
      ...workRecord,
      id: recordId,
      timestamp: Date.now(),
    };

    // Always save locally first (FREE)
    this.saveLocal(enrichedRecord);

    // Add to batch
    this.pendingBatch.push(enrichedRecord);

    // Flush if batch is full
    if (this.pendingBatch.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    }

    return { id: recordId };
  }

  /**
   * Flush pending batch to HCS
   * Cost: 1 message submit for 10 records = 10x cheaper!
   */
  private async flushBatch(): Promise<void> {
    if (this.pendingBatch.length === 0 || !this.topicId) return;

    const batchId = crypto.randomUUID();
    const batch: BatchedWorkRecord = {
      batchId,
      timestamp: Date.now(),
      records: this.pendingBatch.map(r => ({
        id: r.id,
        taskType: r.taskType,
        description: r.description,
        success: r.success,
        durationMs: r.durationMs,
      })),
      batchSignature: this.signBatch(this.pendingBatch),
    };

    try {
      // Compress batch to reduce message size
      const compressed = this.compressPayload(batch);
      
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.topicId)
        .setMessage(compressed)
        .execute(this.client);

      this.costMetrics.messagesSubmitted++;
      this.costMetrics.totalCostHbar += 0.0001;
      this.lastBatchTime = Date.now();

      logger.info('CostOptimizedPoW', { 
        batchId,
        recordCount: this.pendingBatch.length,
        message: `Batch submitted: ${this.pendingBatch.length} records in 1 message`
      });

      this.pendingBatch = [];
    } catch (error) {
      logger.error('CostOptimizedPoW', { error: String(error), message: 'Batch submission failed' });
      // Keep records in batch for retry
    }
  }

  private signBatch(records: any[]): string {
    const data = JSON.stringify(records);
    return crypto
      .createHmac('sha256', config.HEDERA_OPERATOR_PRIVATE_KEY || 'vera-secret')
      .update(data)
      .digest('hex');
  }

  private compressPayload(data: any): string {
    // Simple compression - in production use proper compression lib
    return JSON.stringify(data);
  }

  private saveLocal(record: any): void {
    try {
      const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      data.records.push(record);
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (e) {
      logger.error('CostOptimizedPoW', { error: String(e), message: 'Local save failed' });
    }
  }

  /**
   * Get work history from local cache (FREE) instead of HCS queries (PAID)
   */
  async getWorkHistory(limit: number = 100): Promise<any[]> {
    try {
      const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      return data.records.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Force immediate batch flush - useful before shutdown
   */
  async forceFlush(): Promise<void> {
    await this.flushBatch();
  }

  /**
   * Periodic anchor to HCS - for verification purposes
   * Only anchors a merkle root, not all records
   */
  async anchorToHCS(): Promise<{ anchorId: string; rootHash: string }> {
    if (!this.topicId) {
      await this.initialize();
    }

    const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    const records = data.records;
    
    // Create merkle root of all records
    const rootHash = this.computeMerkleRoot(records);
    
    const anchor = {
      type: 'MERKLE_ANCHOR',
      timestamp: Date.now(),
      recordCount: records.length,
      rootHash,
      firstRecordId: records[0]?.id,
      lastRecordId: records[records.length - 1]?.id,
    };

    await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId!)
      .setMessage(JSON.stringify(anchor))
      .execute(this.client);

    data.lastAnchor = Date.now();
    fs.writeFileSync(this.dbPath, JSON.stringify(data));

    this.costMetrics.messagesSubmitted++;
    this.costMetrics.totalCostHbar += 0.0001;

    logger.info('CostOptimizedPoW', { 
      rootHash,
      recordCount: records.length,
      message: 'Merkle anchor submitted'
    });

    return { anchorId: crypto.randomUUID(), rootHash };
  }

  private computeMerkleRoot(records: any[]): string {
    if (records.length === 0) return '';
    
    const hashes = records.map(r => 
      crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex')
    );

    // Simple merkle tree computation
    while (hashes.length > 1) {
      const level: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || left;
        const combined = crypto.createHash('sha256').update(left + right).digest('hex');
        level.push(combined);
      }
      hashes.length = 0;
      hashes.push(...level);
    }

    return hashes[0];
  }

  getCostMetrics(): CostMetrics {
    return {
      ...this.costMetrics,
      estimatedUsd: this.costMetrics.totalCostHbar * 0.15, // Approx ℏ to USD
    };
  }

  getTopicId(): string | null {
    return this.topicId;
  }

  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
  }
}

// Singleton
let costOptimizedPoW: CostOptimizedPoW | null = null;

export function getCostOptimizedPoW(): CostOptimizedPoW {
  if (!costOptimizedPoW) {
    costOptimizedPoW = new CostOptimizedPoW();
  }
  return costOptimizedPoW;
}

export { CostOptimizedPoW };
