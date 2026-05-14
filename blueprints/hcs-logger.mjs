/**
 * Vera HCS Logger - Universal Logging Module
 * Blueprint for consistent HCS topic usage across all agents
 */

import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';

export class HCSLogger {
  constructor(client, topics) {
    this.client = client;
    this.topics = topics;
    this.queue = [];
    this.processing = false;
    this.stats = {
      submitted: 0,
      failed: 0,
      retried: 0
    };
  }

  /**
   * Queue a message for HCS submission
   */
  async enqueue(topicKey, type, data, priority = 'normal') {
    const message = {
      type,
      timestamp: new Date().toISOString(),
      priority,
      ...data
    };

    this.queue.push({
      topicKey,
      message,
      retries: 3,
      id: crypto.randomUUID()
    });

    if (!this.processing) {
      this.processQueue();
    }

    return message.id;
  }

  /**
   * Process queued messages with rate limiting
   */
  async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      const result = await this.submit(item);

      if (!result.success && item.retries > 0) {
        item.retries--;
        this.stats.retried++;
        this.queue.unshift(item);
        console.log(`🔄 Retrying HCS message (${item.retries} retries left)`);
        await this.delay(1000);
      } else if (!result.success) {
        console.error(`❌ HCS message failed permanently: ${result.error}`);
      }

      await this.delay(500);
    }

    this.processing = false;
  }

  /**
   * Submit single message to HCS
   */
  async submit({ topicKey, message, retries }) {
    try {
      const topicId = this.topics[topicKey];
      if (!topicId) {
        console.error(`❌ Unknown topic key: ${topicKey}`);
        return false;
      }

      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify(message))
        .execute(this.client);

      let sequence;
      try {
        const receipt = await tx.getReceipt(this.client);
        sequence = receipt.topicSequenceNumber?.toString();
      } catch (receiptError) {
        sequence = tx.transactionId.toString();
      }

      this.stats.submitted++;
      console.log(`✅ HCS message submitted to ${topicKey} (seq: ${sequence})`);
      return { success: true, sequence, transactionId: tx.transactionId.toString() };

    } catch (error) {
      this.stats.failed++;
      console.error(`⚠️ HCS submit failed: ${error.message?.substring(0, 50)}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      isProcessing: this.processing
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance creator
export function createHCSLogger(client, topics) {
  return new HCSLogger(client, topics);
}
