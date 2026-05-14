#!/usr/bin/env node
/**
 * SubAgent - Micro-agent base class for specialized tasks
 * Phase 3 Implementation
 */

import { Client, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SubAgent - Lightweight specialized agent
 * Extends capabilities of parent agents with focused tasks
 */
export class SubAgent {
  constructor(config) {
    this.id = config.id;
    this.parentId = config.parentId;
    this.type = config.type;
    this.specialty = config.specialty;
    this.taskTimeout = config.taskTimeout || 30000;
    this.status = 'IDLE';
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      avgResponseTime: 0
    };
    
    // Initialize Hedera client (lightweight)
    this.client = null;
    this._initClient();
  }
  
  _initClient() {
    try {
      const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
      const keyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
      
      if (!operatorId || !keyStr) return;
      
      this.client = Client.forMainnet();
      let privateKey;
      if (keyStr.length === 64) {
        try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
        catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
      } else {
        privateKey = PrivateKey.fromString(keyStr);
      }
      this.client.setOperator(operatorId, privateKey);
    } catch (error) {
      console.error(`[${this.id}] Client init failed: ${error.message}`);
    }
  }
  
  /**
   * Execute a specialized task
   * @param {Object} task - Task definition
   * @returns {Promise<Object>} Task result
   */
  async execute(task) {
    const startTime = Date.now();
    this.status = 'BUSY';
    
    try {
      const result = await this._processTask(task);
      
      const duration = Date.now() - startTime;
      this._updateStats(duration, true);
      this.status = 'IDLE';
      
      return {
        success: true,
        subAgentId: this.id,
        duration,
        result
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this._updateStats(duration, false);
      this.status = 'ERROR';
      
      return {
        success: false,
        subAgentId: this.id,
        duration,
        error: error.message
      };
    }
  }
  
  _processTask(task) {
    // Override in subclasses
    throw new Error('SubAgent must implement _processTask()');
  }
  
  _updateStats(duration, success) {
    if (success) {
      this.stats.tasksCompleted++;
    } else {
      this.stats.tasksFailed++;
    }
    
    // Rolling average
    const total = this.stats.tasksCompleted + this.stats.tasksFailed;
    this.stats.avgResponseTime = 
      (this.stats.avgResponseTime * (total - 1) + duration) / total;
  }
  
  getHealth() {
    const total = this.stats.tasksCompleted + this.stats.tasksFailed;
    const successRate = total > 0 ? (this.stats.tasksCompleted / total) : 1;
    
    return {
      id: this.id,
      status: this.status,
      successRate: Math.round(successRate * 100),
      avgResponseTime: Math.round(this.stats.avgResponseTime),
      tasksCompleted: this.stats.tasksCompleted
    };
  }
}

/**
 * LoadPredictionSubAgent - Predicts energy demand patterns
 */
export class LoadPredictionSubAgent extends SubAgent {
  constructor(parentId) {
    super({
      id: `load-predictor-${Date.now()}`,
      parentId,
      type: 'LOAD_PREDICTOR',
      specialty: 'energy_demand_forecasting'
    });
  }
  
  async _processTask(task) {
    const { historicalData, weatherData, timeHorizon } = task;
    
    // Simple prediction model
    const baseLoad = 5000; // MW baseline
    const weatherFactor = weatherData?.temperature > 85 ? 1.2 : 
                         weatherData?.temperature < 40 ? 1.15 : 1.0;
    
    // Time-based patterns
    const hour = new Date().getHours();
    const isPeak = [7,8,9,17,18,19,20].includes(hour);
    const peakFactor = isPeak ? 1.3 : 0.9;
    
    const prediction = {
      timestamp: new Date().toISOString(),
      predictedLoad: Math.round(baseLoad * weatherFactor * peakFactor),
      confidence: 0.85,
      factors: { weatherFactor, peakFactor },
      horizon: timeHorizon || '1h'
    };
    
    return prediction;
  }
}

/**
 * AnomalyDetectionSubAgent - Detects data anomalies
 */
export class AnomalyDetectionSubAgent extends SubAgent {
  constructor(parentId) {
    super({
      id: `anomaly-detector-${Date.now()}`,
      parentId,
      type: 'ANOMALY_DETECTOR',
      specialty: 'pattern_anomaly_detection'
    });
  }
  
  async _processTask(task) {
    const { data, baseline, threshold = 2 } = task;
    
    // Z-score anomaly detection
    const mean = baseline || data.reduce((a,b) => a+b, 0) / data.length;
    const std = Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length);
    
    const anomalies = data.map((value, idx) => {
      const zScore = Math.abs((value - mean) / std);
      return {
        index: idx,
        value,
        zScore: Math.round(zScore * 100) / 100,
        isAnomaly: zScore > threshold
      };
    }).filter(a => a.isAnomaly);
    
    return {
      totalAnalyzed: data.length,
      anomaliesFound: anomalies.length,
      anomalyRate: Math.round((anomalies.length / data.length) * 1000) / 10,
      anomalies: anomalies.slice(0, 5) // Top 5
    };
  }
}

/**
 * WhaleTrackingSubAgent - Monitors large transactions
 */
export class WhaleTrackingSubAgent extends SubAgent {
  constructor(parentId) {
    super({
      id: `whale-tracker-${Date.now()}`,
      parentId,
      type: 'WHALE_TRACKER',
      specialty: 'large_transaction_monitoring'
    });
  }
  
  async _processTask(task) {
    const { transactions, threshold = 10000 } = task;
    
    const whaleTxs = transactions
      .filter(tx => tx.amount >= threshold)
      .map(tx => ({
        ...tx,
        impact: tx.amount > threshold * 10 ? 'HIGH' : 'MEDIUM'
      }));
    
    return {
      totalTxs: transactions.length,
      whaleTxs: whaleTxs.length,
      whaleVolume: whaleTxs.reduce((sum, tx) => sum + tx.amount, 0),
      topWallets: [...new Set(whaleTxs.map(tx => tx.from))].slice(0, 3)
    };
  }
}

/**
 * ThreatAnalysisSubAgent - Analyzes security threats
 */
export class ThreatAnalysisSubAgent extends SubAgent {
  constructor(parentId) {
    super({
      id: `threat-analyzer-${Date.now()}`,
      parentId,
      type: 'THREAT_ANALYZER',
      specialty: 'security_threat_assessment'
    });
  }
  
  async _processTask(task) {
    const { events, patterns } = task;
    
    // Threat scoring
    const threatIndicators = [
      { pattern: /unusual.*activity/i, score: 3 },
      { pattern: /failed.*login/i, score: 2 },
      { pattern: /large.*transfer/i, score: 4 },
      { pattern: /reentrancy/i, score: 10 }
    ];
    
    let totalScore = 0;
    const threats = [];
    
    events.forEach(event => {
      threatIndicators.forEach(indicator => {
        if (indicator.pattern.test(event.description || '')) {
          totalScore += indicator.score;
          threats.push({
            event: event.id,
            pattern: indicator.pattern.toString(),
            score: indicator.score
          });
        }
      });
    });
    
    return {
      threatScore: Math.min(totalScore, 100),
      severity: totalScore > 20 ? 'CRITICAL' : totalScore > 10 ? 'HIGH' : 'MEDIUM',
      threats: threats.slice(0, 5),
      recommendation: totalScore > 15 ? 'Immediate action required' : 'Monitor closely'
    };
  }
}

// Export all sub-agent types
export default {
  SubAgent,
  LoadPredictionSubAgent,
  AnomalyDetectionSubAgent,
  WhaleTrackingSubAgent,
  ThreatAnalysisSubAgent
};
