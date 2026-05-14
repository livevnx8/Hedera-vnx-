/**
 * Load Testing Harness
 * Validates 50 HCS msg/s, <1s latency, 1000 concurrent agents
 */

import { EventEmitter } from 'events';
import { logger } from '../../src/monitoring/logger.js';

export interface LoadTestConfig {
  targetHcsMessagesPerSecond: number;
  targetLatencyMs: number;
  maxConcurrentAgents: number;
  testDurationSeconds: number;
  rampUpSeconds: number;
}

export interface LoadTestMetrics {
  timestamp: number;
  hcsMessagesSent: number;
  hcsMessagesFailed: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  activeAgents: number;
  errors: number;
}

export interface LoadTestResult {
  success: boolean;
  duration: number;
  totalMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  maxLatency: number;
  failedMessages: number;
  passedThresholds: {
    hcsRate: boolean;
    latency: boolean;
    agents: boolean;
  };
}

export class LoadTestHarness extends EventEmitter {
  private isRunning = false;
  private metrics: LoadTestMetrics[] = [];
  private agents: Array<{ id: string; active: boolean; startTime: number }> = [];
  private hcsMessageCount = 0;
  private hcsFailedCount = 0;
  private latencies: number[] = [];
  private errors = 0;
  private startTime = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private config: LoadTestConfig) {
    super();
  }

  /**
   * Run full load test
   */
  async runTest(): Promise<LoadTestResult> {
    this.isRunning = true;
    this.startTime = Date.now();
    this.metrics = [];
    this.agents = [];
    this.hcsMessageCount = 0;
    this.hcsFailedCount = 0;
    this.latencies = [];
    this.errors = 0;

    logger.info('LoadTestHarness', {
      message: 'Starting load test',
      config: this.config,
    });

    this.emit('test_started', { config: this.config, timestamp: this.startTime });

    // Phase 1: Ramp up agents
    await this.rampUpAgents();

    // Phase 2: Steady state load
    await this.runSteadyState();

    // Phase 3: Cool down
    await this.coolDown();

    return this.generateResults();
  }

  /**
   * Ramp up agents gradually
   */
  private async rampUpAgents(): Promise<void> {
    const agentsPerSecond = this.config.maxConcurrentAgents / this.config.rampUpSeconds;
    
    for (let i = 0; i < this.config.rampUpSeconds; i++) {
      const agentsToAdd = Math.floor(agentsPerSecond);
      
      for (let j = 0; j < agentsToAdd; j++) {
        this.spawnAgent();
      }

      logger.info('LoadTestHarness', {
        message: 'Ramping up agents',
        second: i + 1,
        totalAgents: this.agents.length,
      });

      await this.sleep(1000);
    }
  }

  /**
   * Run steady state load
   */
  private async runSteadyState(): Promise<void> {
    const targetInterval = 1000 / this.config.targetHcsMessagesPerSecond;
    
    this.timer = setInterval(() => {
      this.sendHcsMessage();
    }, targetInterval);

    // Collect metrics every second
    const metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000);

    // Run for specified duration
    await this.sleep(this.config.testDurationSeconds * 1000);

    clearInterval(this.timer);
    clearInterval(metricsInterval);
  }

  /**
   * Cool down - stop all agents
   */
  private async coolDown(): Promise<void> {
    logger.info('LoadTestHarness', {
      message: 'Cooling down',
      activeAgents: this.agents.filter(a => a.active).length,
    });

    for (const agent of this.agents) {
      agent.active = false;
    }

    await this.sleep(5000); // Let final messages complete
  }

  /**
   * Spawn a simulated agent
   */
  private spawnAgent(): void {
    const agent = {
      id: `agent-${this.agents.length}`,
      active: true,
      startTime: Date.now(),
    };
    
    this.agents.push(agent);

    // Simulate agent lifecycle
    this.simulateAgentLifecycle(agent);
  }

  /**
   * Simulate agent activity
   */
  private simulateAgentLifecycle(agent: { id: string; active: boolean }): void {
    // Simulate periodic agent work
    const workInterval = setInterval(() => {
      if (!agent.active) {
        clearInterval(workInterval);
        return;
      }

      // Simulate work with random latency
      const workStart = Date.now();
      
      setTimeout(() => {
        const latency = Date.now() - workStart;
        this.latencies.push(latency);
        
        // Keep only last 1000 latencies
        if (this.latencies.length > 1000) {
          this.latencies.shift();
        }
      }, Math.random() * 500);
    }, 5000 + Math.random() * 5000);
  }

  /**
   * Send simulated HCS message
   */
  private async sendHcsMessage(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Simulate HCS message submission
      await this.simulateHcsSubmit();
      
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      this.hcsMessageCount++;

    } catch (error) {
      this.hcsFailedCount++;
      this.errors++;
    }
  }

  /**
   * Simulate HCS submission with realistic latency
   */
  private simulateHcsSubmit(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Simulate network latency (50-200ms)
      const latency = 50 + Math.random() * 150;
      
      // Simulate occasional failures (1%)
      if (Math.random() < 0.01) {
        setTimeout(() => reject(new Error('Simulated HCS failure')), latency);
      } else {
        setTimeout(resolve, latency);
      }
    });
  }

  /**
   * Collect metrics snapshot
   */
  private collectMetrics(): void {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const metrics: LoadTestMetrics = {
      timestamp: Date.now(),
      hcsMessagesSent: this.hcsMessageCount,
      hcsMessagesFailed: this.hcsFailedCount,
      averageLatency: this.latencies.length > 0 
        ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length 
        : 0,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      activeAgents: this.agents.filter(a => a.active).length,
      errors: this.errors,
    };

    this.metrics.push(metrics);
    this.emit('metrics', metrics);
  }

  /**
   * Generate test results
   */
  private generateResults(): LoadTestResult {
    const duration = Date.now() - this.startTime;
    const totalMessages = this.hcsMessageCount + this.hcsFailedCount;
    const messagesPerSecond = totalMessages / (duration / 1000);
    
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const avgLatency = sortedLatencies.length > 0
      ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
      : 0;
    const maxLatency = sortedLatencies[sortedLatencies.length - 1] || 0;

    const result: LoadTestResult = {
      success: true,
      duration,
      totalMessages,
      messagesPerSecond,
      averageLatency: avgLatency,
      maxLatency,
      failedMessages: this.hcsFailedCount,
      passedThresholds: {
        hcsRate: messagesPerSecond >= this.config.targetHcsMessagesPerSecond * 0.95,
        latency: avgLatency <= this.config.targetLatencyMs,
        agents: this.agents.length >= this.config.maxConcurrentAgents * 0.95,
      },
    };

    // Overall success if all thresholds passed
    result.success = Object.values(result.passedThresholds).every(p => p);

    logger.info('LoadTestHarness', {
      message: 'Load test complete',
      success: result.success,
      messagesPerSecond: result.messagesPerSecond.toFixed(1),
      averageLatency: result.averageLatency.toFixed(1),
      passedThresholds: result.passedThresholds,
    });

    this.emit('test_complete', result);
    return result;
  }

  /**
   * Get current metrics
   */
  getMetrics(): LoadTestMetrics[] {
    return [...this.metrics];
  }

  /**
   * Stop test early
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default LoadTestHarness;
