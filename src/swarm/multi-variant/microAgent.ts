/**
 * Micro Swarm Agent - Streaming Layer
 * 
 * Specialized for high-frequency, low-latency streaming operations
 * - 80% Tier-1 Executors
 * - 15% Tier-2 Analysts  
 * - 5% Tier-3 Planners
 */

import { BaseSwarmAgent, AgentConfig, Task, AgentMetrics } from './baseSwarmAgent.js';
import { logger } from '../../monitoring/logger.js';

export interface StreamEvent {
  id: string;
  timestamp: number;
  type: string;
  data: any;
  topic: string;
  priority: number;
}

export interface StreamBatch {
  events: StreamEvent[];
  batchId: string;
  createdAt: number;
  size: number;
}

export class MicroAgent extends BaseSwarmAgent {
  private eventBuffer: StreamEvent[] = [];
  private batchSize: number = 100;
  private flushIntervalMs: number = 50; // 50ms flush for low latency
  private flushTimer: NodeJS.Timeout | null = null;
  private processedEvents: number = 0;
  private droppedEvents: number = 0;

  constructor(config: AgentConfig) {
    super({
      ...config,
      swarmClass: 'micro',
      timeoutMs: 100, // 100ms timeout for micro operations
      maxConcurrentTasks: 10 // High concurrency for streaming
    });

    this.startFlushTimer();
  }

  /**
   * Process a streaming event
   */
  async processEvent(event: StreamEvent): Promise<void> {
    if (this.eventBuffer.length >= this.batchSize * 2) {
      // Buffer full, drop oldest events
      this.droppedEvents++;
      this.eventBuffer.shift();
    }

    this.eventBuffer.push(event);
    this.processedEvents++;

    // Immediate flush if buffer is full
    if (this.eventBuffer.length >= this.batchSize) {
      await this.flushBuffer();
    }
  }

  /**
   * Execute task based on role
   */
  protected async executeTask(task: Task): Promise<void> {
    const startTime = Date.now();

    try {
      switch (this.config.role) {
        case 'executor':
          await this.executeStreamingTask(task);
          break;
        case 'analyst':
          await this.executePatternAnalysis(task);
          break;
        case 'planner':
          await this.executeStreamCoordination(task);
          break;
      }

      const duration = Date.now() - startTime;
      this.handleTaskCompletion(task, { duration, success: true });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Tier-1: Execute streaming task
   */
  private async executeStreamingTask(task: Task): Promise<void> {
    const event = task.payload as StreamEvent;
    
    // Fast processing - validate and forward
    if (!event || !event.data) {
      throw new Error('Invalid stream event');
    }

    // Process based on event type
    switch (event.type) {
      case 'hcs_message':
        await this.processHCSMessage(event);
        break;
      case 'token_transfer':
        await this.processTokenTransfer(event);
        break;
      case 'price_update':
        await this.processPriceUpdate(event);
        break;
      default:
        // Generic event processing
        logger.debug('MicroAgent', { 
          agentId: this.config.id, 
          eventType: event.type,
          message: 'Processing generic event'
        });
    }
  }

  /**
   * Process HCS message event
   */
  private async processHCSMessage(event: StreamEvent): Promise<void> {
    // Validate HCS message format
    if (!event.data.topicId || !event.data.message) {
      throw new Error('Invalid HCS message format');
    }

    // Fast validation - don't block
    logger.debug('MicroAgent', {
      agentId: this.config.id,
      topicId: event.data.topicId,
      message: 'HCS message validated'
    });

    // Buffer for batch upload
    this.eventBuffer.push(event);
  }

  /**
   * Process token transfer event
   */
  private async processTokenTransfer(event: StreamEvent): Promise<void> {
    // Validate transfer data
    const { from, to, amount, tokenId } = event.data;
    
    if (!from || !to || !amount) {
      throw new Error('Invalid transfer data');
    }

    // Log for analytics
    logger.debug('MicroAgent', {
      agentId: this.config.id,
      tokenId: tokenId || 'HBAR',
      amount,
      message: 'Transfer event processed'
    });

    this.eventBuffer.push(event);
  }

  /**
   * Process price update event
   */
  private async processPriceUpdate(event: StreamEvent): Promise<void> {
    const { tokenId, price, source } = event.data;
    
    if (!tokenId || !price) {
      throw new Error('Invalid price data');
    }

    // Price updates are high priority
    logger.debug('MicroAgent', {
      agentId: this.config.id,
      tokenId,
      price,
      source,
      message: 'Price update processed'
    });

    this.eventBuffer.push(event);
  }

  /**
   * Tier-2: Execute pattern analysis
   */
  private async executePatternAnalysis(task: Task): Promise<void> {
    const events = task.payload.events as StreamEvent[];
    
    if (!events || events.length === 0) return;

    // Simple pattern detection
    const patterns = this.detectPatterns(events);
    
    logger.debug('MicroAgent', {
      agentId: this.config.id,
      patternCount: patterns.length,
      eventCount: events.length,
      message: 'Pattern analysis complete'
    });

    // Emit patterns for upstream processing
    // (In production, publish to normal topic)
  }

  /**
   * Detect patterns in event stream
   */
  private detectPatterns(events: StreamEvent[]): Array<{ type: string; confidence: number; data: any }> {
    const patterns: Array<{ type: string; confidence: number; data: any }> = [];
    
    // Volume spike detection
    if (events.length > this.batchSize * 0.8) {
      patterns.push({
        type: 'volume_spike',
        confidence: 0.9,
        data: { eventCount: events.length }
      });
    }

    // Repeated event type detection
    const typeCounts: Record<string, number> = {};
    events.forEach(e => {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    });

    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > events.length * 0.5) {
        patterns.push({
          type: 'dominant_event_type',
          confidence: count / events.length,
          data: { eventType: type, count }
        });
      }
    }

    return patterns;
  }

  /**
   * Tier-3: Execute stream coordination
   */
  private async executeStreamCoordination(task: Task): Promise<void> {
    const { action, targetAgents } = task.payload;
    
    logger.info('MicroAgent', {
      agentId: this.config.id,
      action,
      targetCount: targetAgents?.length || 0,
      message: 'Stream coordination executed'
    });

    // In production, coordinate with other micro agents
  }

  /**
   * Start flush timer for batch uploads
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventBuffer.length > 0) {
        this.flushBuffer().catch(error => {
          logger.error('MicroAgent', { 
            agentId: this.config.id, 
            error: error.message,
            message: 'Buffer flush failed'
          });
        });
      }
    }, this.flushIntervalMs);
  }

  /**
   * Flush event buffer
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const batch: StreamBatch = {
      events: [...this.eventBuffer],
      batchId: `batch-${Date.now()}-${this.config.id}`,
      createdAt: Date.now(),
      size: this.eventBuffer.length
    };

    // Clear buffer
    this.eventBuffer = [];

    // In production, upload to HCS topic
    logger.debug('MicroAgent', {
      agentId: this.config.id,
      batchId: batch.batchId,
      eventCount: batch.size,
      message: 'Buffer flushed'
    });

    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Get micro-specific metrics
   */
  getMicroMetrics(): AgentMetrics & {
    processedEvents: number;
    droppedEvents: number;
    bufferSize: number;
    batchSize: number;
    flushInterval: number;
  } {
    return {
      ...this.metrics,
      processedEvents: this.processedEvents,
      droppedEvents: this.droppedEvents,
      bufferSize: this.eventBuffer.length,
      batchSize: this.batchSize,
      flushInterval: this.flushIntervalMs
    };
  }

  /**
   * Shutdown agent
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    if (this.eventBuffer.length > 0) {
      this.flushBuffer().catch(() => {});
    }

    super.shutdown();
  }
}
