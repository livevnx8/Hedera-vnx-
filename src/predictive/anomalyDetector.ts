/**
 * Anomaly Detector
 * 
 * ML-powered anomaly detection for transactions, agents, and network patterns.
 * Detects rogue agents, attack patterns, and system anomalies in real-time.
 */

import { logger } from '../monitoring/logger.js';
import type { AnomalyAlert, FraudPattern } from './types.js';

interface DetectionConfig {
  sensitivity: 'low' | 'medium' | 'high';
  minConfidence: number;
  alertThreshold: number;
  maxHistorySize: number;
}

interface TransactionData {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  gasUsed: number;
  tokenId?: string;
}

interface AgentActivity {
  agentId: string;
  actions: Array<{
    type: string;
    timestamp: number;
    success: boolean;
    metadata: Record<string, unknown>;
  }>;
}

export class AnomalyDetector {
  private config: DetectionConfig;
  private transactionHistory: TransactionData[] = [];
  private agentActivities: Map<string, AgentActivity> = new Map();
  private detectedPatterns: Map<string, FraudPattern> = new Map();
  private alerts: AnomalyAlert[] = [];
  private listeners: Set<(alert: AnomalyAlert) => void> = new Set();

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = {
      sensitivity: 'medium',
      minConfidence: 0.75,
      alertThreshold: 0.8,
      maxHistorySize: 10000,
      ...config
    };
  }

  /**
   * Analyze a transaction for anomalies
   */
  async analyzeTransaction(tx: TransactionData): Promise<{
    isAnomaly: boolean;
    score: number;
    factors: string[];
  }> {
    const factors: string[] = [];
    let anomalyScore = 0;

    // Check for unusual amount
    const avgAmount = this.calculateAverageAmount();
    if (tx.amount > avgAmount * 10) {
      anomalyScore += 0.3;
      factors.push('unusual_amount');
    }

    // Check for rapid transactions (same sender within short window)
    const recentFromSame = this.transactionHistory.filter(
      t => t.from === tx.from && t.timestamp > tx.timestamp - 60000
    ).length;
    if (recentFromSame > 5) {
      anomalyScore += 0.4;
      factors.push('rapid_transactions');
    }

    // Check for gas anomalies
    const avgGas = this.calculateAverageGas();
    if (tx.gasUsed > avgGas * 3) {
      anomalyScore += 0.2;
      factors.push('high_gas_usage');
    }

    // Check for circular patterns (A -> B -> A)
    const circularPattern = this.detectCircularPattern(tx);
    if (circularPattern) {
      anomalyScore += 0.5;
      factors.push('circular_transfer_pattern');
    }

    // Store for future analysis
    this.addTransaction(tx);

    // Determine if it's an anomaly based on sensitivity
    const threshold = this.getThreshold();
    const isAnomaly = anomalyScore >= threshold;

    if (isAnomaly) {
      this.createAlert({
        type: 'transaction',
        severity: this.scoreToSeverity(anomalyScore),
        description: `Anomalous transaction detected: ${factors.join(', ')}`,
        detectedAt: Date.now(),
        relatedEntities: [tx.from, tx.to],
        confidence: anomalyScore,
        recommendedAction: anomalyScore > 0.9 ? 'block' : 'review'
      });
    }

    return {
      isAnomaly,
      score: anomalyScore,
      factors
    };
  }

  /**
   * Detect Sybil attack patterns
   */
  async detectSybilAttack(pattern: AgentActivity[]): Promise<boolean> {
    if (pattern.length < 3) return false;

    // Check for coordinated behavior
    const coordinatedAgents = this.findCoordinatedAgents(pattern);
    
    if (coordinatedAgents.length >= 3) {
      const patternId = `sybil-${Date.now()}`;
      
      this.detectedPatterns.set(patternId, {
        patternId,
        type: 'sybil',
        indicators: ['coordinated_timing', 'similar_behavior', 'shared_resources'],
        affectedAccounts: coordinatedAgents.map(a => a.agentId),
        confidence: 0.85,
        firstDetected: Date.now(),
        status: 'active'
      });

      this.createAlert({
        type: 'security',
        severity: 'critical',
        description: `Potential Sybil attack detected: ${coordinatedAgents.length} coordinated agents`,
        detectedAt: Date.now(),
        relatedEntities: coordinatedAgents.map(a => a.agentId),
        confidence: 0.85,
        recommendedAction: 'block'
      });

      return true;
    }

    return false;
  }

  /**
   * Detect wash trading patterns
   */
  async detectWashTrading(transactions: TransactionData[]): Promise<boolean> {
    // Look for A <-> B patterns with similar amounts
    const pairs = new Map<string, { count: number; volume: number }>();
    
    for (const tx of transactions) {
      const pair = [tx.from, tx.to].sort().join('-');
      const existing = pairs.get(pair) || { count: 0, volume: 0 };
      existing.count++;
      existing.volume += tx.amount;
      pairs.set(pair, existing);
    }

    // Find pairs with high reciprocal activity
    for (const [pair, data] of pairs) {
      if (data.count >= 10 && data.volume > 10000) {
        const patternId = `wash-${Date.now()}`;
        const [a, b] = pair.split('-');
        
        this.detectedPatterns.set(patternId, {
          patternId,
          type: 'wash_trading',
          indicators: ['reciprocal_transfers', 'volume_manipulation'],
          affectedAccounts: [a, b],
          confidence: 0.8,
          firstDetected: Date.now(),
          status: 'investigating'
        });

        this.createAlert({
          type: 'security',
          severity: 'high',
          description: `Potential wash trading detected between ${a} and ${b}`,
          detectedAt: Date.now(),
          relatedEntities: [a, b],
          confidence: 0.8,
          recommendedAction: 'review'
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Subscribe to anomaly alerts
   */
  onAlert(callback: (alert: AnomalyAlert) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get recent alerts
   */
  getAlerts(severity?: 'low' | 'medium' | 'high' | 'critical'): AnomalyAlert[] {
    if (!severity) return this.alerts;
    return this.alerts.filter(a => a.severity === severity);
  }

  /**
   * Get detected fraud patterns
   */
  getPatterns(): FraudPattern[] {
    return Array.from(this.detectedPatterns.values());
  }

  /**
   * Get detector statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      transactionsAnalyzed: this.transactionHistory.length,
      agentsMonitored: this.agentActivities.size,
      patternsDetected: this.detectedPatterns.size,
      alertsGenerated: this.alerts.length,
      config: this.config
    };
  }

  /**
   * Clear old data
   */
  cleanup(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.alerts = this.alerts.filter(a => a.detectedAt > cutoff);
    this.transactionHistory = this.transactionHistory.filter(t => t.timestamp > cutoff);
  }

  // Private helper methods
  private addTransaction(tx: TransactionData): void {
    this.transactionHistory.push(tx);
    if (this.transactionHistory.length > this.config.maxHistorySize) {
      this.transactionHistory.shift();
    }
  }

  private calculateAverageAmount(): number {
    if (this.transactionHistory.length === 0) return 0;
    const sum = this.transactionHistory.reduce((acc, t) => acc + t.amount, 0);
    return sum / this.transactionHistory.length;
  }

  private calculateAverageGas(): number {
    if (this.transactionHistory.length === 0) return 0;
    const sum = this.transactionHistory.reduce((acc, t) => acc + t.gasUsed, 0);
    return sum / this.transactionHistory.length;
  }

  private detectCircularPattern(tx: TransactionData): boolean {
    // Check if this completes a circle: A -> B -> C -> A
    const chain = this.findTransactionChain(tx.from, tx.to, 3);
    return chain.length >= 3 && chain[chain.length - 1] === tx.from;
  }

  private findTransactionChain(from: string, to: string, maxDepth: number): string[] {
    if (maxDepth === 0) return [];
    
    const chain = [from, to];
    const next = this.transactionHistory.find(t => t.from === to);
    
    if (next) {
      const rest = this.findTransactionChain(to, next.to, maxDepth - 1);
      chain.push(...rest.slice(1));
    }
    
    return chain;
  }

  private findCoordinatedAgents(patterns: AgentActivity[]): AgentActivity[] {
    // Find agents with similar timing patterns
    const timeWindows = patterns.map(p => ({
      agent: p,
      times: p.actions.map(a => Math.floor(a.timestamp / 60000)) // 1-minute buckets
    }));

    const coordinated: AgentActivity[] = [];
    
    for (let i = 0; i < timeWindows.length; i++) {
      for (let j = i + 1; j < timeWindows.length; j++) {
        const overlap = timeWindows[i].times.filter(t => 
          timeWindows[j].times.includes(t)
        ).length;
        
        if (overlap >= 3) {
          coordinated.push(timeWindows[i].agent);
          coordinated.push(timeWindows[j].agent);
        }
      }
    }

    // Remove duplicates
    return coordinated.filter((v, i, a) => a.indexOf(v) === i);
  }

  private getThreshold(): number {
    switch (this.config.sensitivity) {
      case 'low': return 0.9;
      case 'high': return 0.6;
      case 'medium':
      default: return 0.75;
    }
  }

  private scoreToSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.9) return 'critical';
    if (score >= 0.8) return 'high';
    if (score >= 0.7) return 'medium';
    return 'low';
  }

  private createAlert(alert: Omit<AnomalyAlert, 'id'>): void {
    const fullAlert: AnomalyAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...alert
    };
    
    this.alerts.push(fullAlert);
    
    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(fullAlert);
      } catch (error) {
        logger.error('AnomalyDetector', {
          message: 'Alert listener failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.warn('AnomalyDetector', {
      message: 'Anomaly detected',
      alertId: fullAlert.id,
      type: fullAlert.type,
      severity: fullAlert.severity,
      confidence: fullAlert.confidence
    });
  }
}

// Singleton
let detectorInstance: AnomalyDetector | null = null;

export function getAnomalyDetector(config?: Partial<DetectionConfig>): AnomalyDetector {
  if (!detectorInstance) {
    detectorInstance = new AnomalyDetector(config);
  }
  return detectorInstance;
}
