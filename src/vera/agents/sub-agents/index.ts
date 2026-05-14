/**
 * Vera SubAgent Base Class
 * Lightweight specialized agent for focused tasks
 * Part of Phase 3: Sub-Agent Architecture
 */

import { EventEmitter } from 'events';
import type { SubAgentConfig, SubAgentHealth, SubAgentStats, SubAgentStatus, SubAgentType } from '../types/index.js';
import { logger } from '../../monitoring/logger.js';

export interface TaskDefinition {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeoutMs: number;
}

export interface TaskResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  duration: number;
}

export abstract class SubAgent extends EventEmitter {
  id: string;
  parentId: string;
  type: SubAgentType;
  specialty: string;
  status: SubAgentStatus = 'IDLE';
  
  private stats: SubAgentStats = {
    tasksCompleted: 0,
    tasksFailed: 0,
    avgResponseTime: 0,
    successRate: 1.0,
  };
  
  private currentTask: TaskDefinition | null = null;
  private taskStartTime: number = 0;
  private taskTimeout: number;

  constructor(config: SubAgentConfig) {
    super();
    this.id = config.id;
    this.parentId = config.parentId;
    this.type = config.type;
    this.specialty = config.specialty;
    this.taskTimeout = config.taskTimeout || 30000;
  }

  /**
   * Execute a task with timeout and error handling
   */
  async execute(task: TaskDefinition): Promise<TaskResult> {
    const startTime = Date.now();
    this.taskStartTime = startTime;
    this.currentTask = task;
    this.status = 'BUSY';

    logger.debug('SubAgent', {
      message: 'Starting task execution',
      subAgentId: this.id,
      taskId: task.id,
      taskType: task.type,
    });

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task timeout after ${task.timeoutMs || this.taskTimeout}ms`));
        }, task.timeoutMs || this.taskTimeout);
      });

      // Race between task execution and timeout
      const result = await Promise.race([
        this.processTask(task),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;
      this.updateStats(duration, true);
      this.status = 'IDLE';
      this.currentTask = null;

      logger.debug('SubAgent', {
        message: 'Task completed successfully',
        subAgentId: this.id,
        taskId: task.id,
        duration,
      });

      this.emit('task_completed', { taskId: task.id, duration, result });

      return {
        success: true,
        data: result,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateStats(duration, false);
      this.status = 'ERROR';
      this.currentTask = null;

      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('SubAgent', {
        message: 'Task execution failed',
        subAgentId: this.id,
        taskId: task.id,
        error: errorMessage,
        duration,
      });

      this.emit('task_failed', { taskId: task.id, error: errorMessage, duration });

      return {
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  abstract processTask(task: TaskDefinition): Promise<Record<string, unknown>>;

  /**
   * Update statistics after task completion
   */
  private updateStats(duration: number, success: boolean): void {
    if (success) {
      this.stats.tasksCompleted++;
    } else {
      this.stats.tasksFailed++;
    }

    // Calculate rolling average
    const total = this.stats.tasksCompleted + this.stats.tasksFailed;
    this.stats.avgResponseTime = 
      (this.stats.avgResponseTime * (total - 1) + duration) / total;

    // Calculate success rate
    this.stats.successRate = this.stats.tasksCompleted / total;
  }

  /**
   * Get current health status
   */
  getHealth(): SubAgentHealth {
    const total = this.stats.tasksCompleted + this.stats.tasksFailed;
    
    return {
      id: this.id,
      status: this.status,
      successRate: Math.round(this.stats.successRate * 100),
      avgResponseTime: Math.round(this.stats.avgResponseTime),
      tasksCompleted: this.stats.tasksCompleted,
      lastTaskAt: this.status === 'IDLE' && total > 0 ? Date.now() : undefined,
    };
  }

  /**
   * Get full statistics
   */
  getStats(): SubAgentStats {
    return { ...this.stats };
  }

  /**
   * Get current task info
   */
  getCurrentTask(): { taskId: string; elapsedMs: number } | null {
    if (!this.currentTask) return null;
    return {
      taskId: this.currentTask.id,
      elapsedMs: Date.now() - this.taskStartTime,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      avgResponseTime: 0,
      successRate: 1.0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete SubAgent Implementations
// ─────────────────────────────────────────────────────────────────────────────

export class LoadPredictionSubAgent extends SubAgent {
  constructor(parentId: string) {
    super({
      id: `load-predictor-${Date.now()}`,
      parentId,
      type: 'LOAD_PREDICTOR',
      specialty: 'energy_demand_forecasting',
      taskTimeout: 5000,
    });
  }

  async processTask(task: TaskDefinition): Promise<Record<string, unknown>> {
    const { historicalData, weatherData, timeHorizon = '1h' } = task.payload;
    
    // Simple prediction model
    const baseLoad = 5000; // MW baseline
    const temp = (weatherData as any)?.temperature || 70;
    const weatherFactor = temp > 85 ? 1.2 : temp < 40 ? 1.15 : 1.0;
    
    // Time-based patterns
    const hour = new Date().getHours();
    const isPeak = [7, 8, 9, 17, 18, 19, 20].includes(hour);
    const peakFactor = isPeak ? 1.3 : 0.9;

    return {
      timestamp: new Date().toISOString(),
      predictedLoad: Math.round(baseLoad * weatherFactor * peakFactor),
      confidence: 0.85,
      factors: { weatherFactor, peakFactor, isPeak },
      horizon: timeHorizon,
    };
  }
}

export class AnomalyDetectionSubAgent extends SubAgent {
  constructor(parentId: string) {
    super({
      id: `anomaly-detector-${Date.now()}`,
      parentId,
      type: 'ANOMALY_DETECTOR',
      specialty: 'pattern_anomaly_detection',
      taskTimeout: 10000,
    });
  }

  async processTask(task: TaskDefinition): Promise<Record<string, unknown>> {
    const { data, baseline, threshold = 2 } = task.payload as { data: number[]; baseline?: number; threshold?: number };
    
    const mean = baseline || data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length);
    
    const anomalies = data.map((value, idx) => {
      const zScore = Math.abs((value - mean) / (std || 1));
      return {
        index: idx,
        value,
        zScore: Math.round(zScore * 100) / 100,
        isAnomaly: zScore > threshold,
      };
    }).filter(a => a.isAnomaly);
    
    return {
      totalAnalyzed: data.length,
      anomaliesFound: anomalies.length,
      anomalyRate: Math.round((anomalies.length / data.length) * 1000) / 10,
      anomalies: anomalies.slice(0, 5),
      mean,
      std: Math.round(std * 100) / 100,
    };
  }
}

export class WhaleTrackingSubAgent extends SubAgent {
  constructor(parentId: string) {
    super({
      id: `whale-tracker-${Date.now()}`,
      parentId,
      type: 'WHALE_TRACKER',
      specialty: 'large_transaction_monitoring',
      taskTimeout: 5000,
    });
  }

  async processTask(task: TaskDefinition): Promise<Record<string, unknown>> {
    const { transactions, threshold = 10000 } = task.payload as { 
      transactions: Array<{ amount: number; from: string; to: string; txId: string }>;
      threshold?: number;
    };
    
    const whaleTxs = transactions
      .filter(tx => tx.amount >= threshold)
      .map(tx => ({
        ...tx,
        impact: tx.amount > threshold * 10 ? 'HIGH' : 'MEDIUM',
      }));
    
    // Group by wallet
    const walletVolumes = new Map<string, number>();
    whaleTxs.forEach(tx => {
      walletVolumes.set(tx.from, (walletVolumes.get(tx.from) || 0) + tx.amount);
    });

    const topWallets = Array.from(walletVolumes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([wallet, volume]) => ({ wallet, volume }));
    
    return {
      totalTxs: transactions.length,
      whaleTxs: whaleTxs.length,
      whaleVolume: whaleTxs.reduce((sum, tx) => sum + tx.amount, 0),
      topWallets,
      averageWhaleSize: whaleTxs.length > 0 
        ? Math.round(whaleTxs.reduce((sum, tx) => sum + tx.amount, 0) / whaleTxs.length)
        : 0,
    };
  }
}

export class ThreatAnalysisSubAgent extends SubAgent {
  constructor(parentId: string) {
    super({
      id: `threat-analyzer-${Date.now()}`,
      parentId,
      type: 'THREAT_ANALYZER',
      specialty: 'security_threat_assessment',
      taskTimeout: 15000,
    });
  }

  async processTask(task: TaskDefinition): Promise<Record<string, unknown>> {
    const { events } = task.payload as { events: Array<{ id: string; description: string; severity?: string }> };
    
    // Threat scoring patterns
    const threatPatterns = [
      { pattern: /unusual.*activity/i, score: 3, category: 'anomaly' },
      { pattern: /failed.*(login|auth)/i, score: 2, category: 'auth' },
      { pattern: /large.*transfer/i, score: 4, category: 'transaction' },
      { pattern: /reentrancy/i, score: 10, category: 'contract' },
      { pattern: /overflow|underflow/i, score: 8, category: 'contract' },
      { pattern: /access.*control/i, score: 5, category: 'permission' },
      { pattern: /phishing/i, score: 6, category: 'social' },
    ];
    
    let totalScore = 0;
    const threats: Array<{ event: string; pattern: string; score: number; category: string }> = [];
    const categoryScores: Record<string, number> = {};
    
    events.forEach(event => {
      const desc = event.description || '';
      threatPatterns.forEach(indicator => {
        if (indicator.pattern.test(desc)) {
          totalScore += indicator.score;
          threats.push({
            event: event.id,
            pattern: indicator.pattern.toString(),
            score: indicator.score,
            category: indicator.category,
          });
          categoryScores[indicator.category] = (categoryScores[indicator.category] || 0) + indicator.score;
        }
      });
    });
    
    const severity = totalScore > 20 ? 'CRITICAL' : totalScore > 10 ? 'HIGH' : totalScore > 5 ? 'MEDIUM' : 'LOW';
    
    return {
      threatScore: Math.min(totalScore, 100),
      severity,
      threats: threats.slice(0, 10),
      categoryBreakdown: categoryScores,
      recommendation: totalScore > 15 
        ? 'Immediate action required - review critical threats'
        : totalScore > 5 
          ? 'Monitor closely - potential security concerns'
          : 'Standard monitoring - low threat level',
      eventsAnalyzed: events.length,
    };
  }
}

// Factory function to create sub-agents
export function createSubAgent(
  type: SubAgentType,
  parentId: string
): SubAgent {
  switch (type) {
    case 'LOAD_PREDICTOR':
      return new LoadPredictionSubAgent(parentId);
    case 'ANOMALY_DETECTOR':
      return new AnomalyDetectionSubAgent(parentId);
    case 'WHALE_TRACKER':
      return new WhaleTrackingSubAgent(parentId);
    case 'THREAT_ANALYZER':
      return new ThreatAnalysisSubAgent(parentId);
    default:
      throw new Error(`Unknown sub-agent type: ${type}`);
  }
}
