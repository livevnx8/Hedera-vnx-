/**
 * Fraud Prevention
 * 
 * Real-time transaction risk scoring and fraud prevention
 * using ML models to detect and prevent malicious activity.
 */

import { logger } from '../monitoring/logger.js';
import type { RiskScore, FraudPattern } from './types.js';

interface FraudConfig {
  riskThreshold: number;
  autoBlockThreshold: number;
  mlModelVersion: string;
  featureWeights: Record<string, number>;
}

interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  tokenId?: string;
  timestamp: number;
  gasPrice: number;
  gasLimit: number;
  metadata?: Record<string, unknown>;
}

export class FraudPrevention {
  private config: FraudConfig;
  private transactionHistory: Map<string, Transaction[]> = new Map();
  private blockedAccounts: Set<string> = new Set();
  private riskCache: Map<string, RiskScore> = new Map();
  private fraudPatterns: FraudPattern[] = [];

  constructor(config: Partial<FraudConfig> = {}) {
    this.config = {
      riskThreshold: 70, // 0-100
      autoBlockThreshold: 90,
      mlModelVersion: '1.0.0',
      featureWeights: {
        amountAnomaly: 0.25,
        velocity: 0.20,
        accountAge: 0.15,
        patternMatch: 0.25,
        networkReputation: 0.15
      },
      ...config
    };
  }

  /**
   * Analyze transaction and calculate risk score
   */
  async analyzeTransaction(tx: Transaction): Promise<RiskScore> {
    // Check cache
    const cacheKey = `${tx.from}-${tx.to}-${tx.amount}-${tx.timestamp}`;
    const cached = this.riskCache.get(cacheKey);
    if (cached && Date.now() - tx.timestamp < 60000) {
      return cached;
    }

    const factors: string[] = [];
    let totalScore = 0;
    const weights = this.config.featureWeights;

    // 1. Amount anomaly check
    const amountRisk = this.calculateAmountRisk(tx);
    totalScore += amountRisk * weights.amountAnomaly;
    if (amountRisk > 0.7) factors.push('unusual_amount');

    // 2. Velocity check (rapid transactions)
    const velocityRisk = this.calculateVelocityRisk(tx);
    totalScore += velocityRisk * weights.velocity;
    if (velocityRisk > 0.7) factors.push('high_velocity');

    // 3. Account age/reputation
    const reputationRisk = this.calculateReputationRisk(tx);
    totalScore += reputationRisk * weights.accountAge;
    if (reputationRisk > 0.7) factors.push('new_account');

    // 4. Pattern matching
    const patternRisk = this.calculatePatternRisk(tx);
    totalScore += patternRisk * weights.patternMatch;
    if (patternRisk > 0.7) factors.push('matches_fraud_pattern');

    // 5. Network reputation
    const networkRisk = this.calculateNetworkRisk(tx);
    totalScore += networkRisk * weights.networkReputation;
    if (networkRisk > 0.7) factors.push('low_network_reputation');

    // Normalize to 0-100
    const finalScore = Math.min(Math.round(totalScore * 100), 100);

    // Determine recommended action
    let recommendedAction: 'allow' | 'review' | 'block';
    if (finalScore >= this.config.autoBlockThreshold) {
      recommendedAction = 'block';
    } else if (finalScore >= this.config.riskThreshold) {
      recommendedAction = 'review';
    } else {
      recommendedAction = 'allow';
    }

    const riskScore: RiskScore = {
      transactionId: tx.id,
      score: finalScore,
      factors,
      recommendedAction,
      confidence: this.calculateConfidence(factors.length)
    };

    // Cache result
    this.riskCache.set(cacheKey, riskScore);

    // Store transaction for future analysis
    this.storeTransaction(tx);

    // Log high-risk transactions
    if (finalScore >= this.config.riskThreshold) {
      logger.warn('FraudPrevention', {
        message: 'High risk transaction detected',
        txId: tx.id,
        score: finalScore,
        factors,
        action: recommendedAction
      });
    }

    return riskScore;
  }

  /**
   * Block an account
   */
  async blockAccount(accountId: string, reason: string): Promise<void> {
    this.blockedAccounts.add(accountId);
    logger.warn('FraudPrevention', {
      message: 'Account blocked',
      accountId,
      reason
    });
  }

  /**
   * Unblock an account
   */
  async unblockAccount(accountId: string): Promise<void> {
    this.blockedAccounts.delete(accountId);
    logger.info('FraudPrevention', {
      message: 'Account unblocked',
      accountId
    });
  }

  /**
   * Check if account is blocked
   */
  isBlocked(accountId: string): boolean {
    return this.blockedAccounts.has(accountId);
  }

  /**
   * Report fraud pattern
   */
  async reportPattern(pattern: Omit<FraudPattern, 'patternId' | 'firstDetected'>): Promise<string> {
    const patternId = `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const fullPattern: FraudPattern = {
      patternId,
      firstDetected: Date.now(),
      status: 'active',
      ...pattern
    };

    this.fraudPatterns.push(fullPattern);

    logger.warn('FraudPrevention', {
      message: 'Fraud pattern reported',
      patternId,
      type: pattern.type,
      affectedCount: pattern.affectedAccounts.length
    });

    return patternId;
  }

  /**
   * Get fraud statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      blockedAccounts: this.blockedAccounts.size,
      detectedPatterns: this.fraudPatterns.length,
      activePatterns: this.fraudPatterns.filter(p => p.status === 'active').length,
      transactionsAnalyzed: Array.from(this.transactionHistory.values())
        .reduce((sum, txs) => sum + txs.length, 0),
      riskThreshold: this.config.riskThreshold,
      autoBlockThreshold: this.config.autoBlockThreshold,
      mlModelVersion: this.config.mlModelVersion
    };
  }

  /**
   * Get blocked accounts list
   */
  getBlockedAccounts(): string[] {
    return Array.from(this.blockedAccounts);
  }

  /**
   * Get fraud patterns
   */
  getPatterns(): FraudPattern[] {
    return this.fraudPatterns;
  }

  // Private helper methods
  private calculateAmountRisk(tx: Transaction): number {
    const history = this.transactionHistory.get(tx.from) || [];
    if (history.length < 5) return 0.3; // New account, moderate risk

    const amounts = history.map(t => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const max = Math.max(...amounts);

    if (tx.amount > max * 2) return 0.95; // Much larger than ever before
    if (tx.amount > avg * 5) return 0.8; // 5x average
    if (tx.amount > avg * 3) return 0.6; // 3x average
    return 0.1;
  }

  private calculateVelocityRisk(tx: Transaction): number {
    const history = this.transactionHistory.get(tx.from) || [];
    const recentTxs = history.filter(t => t.timestamp > tx.timestamp - 60000); // Last minute
    
    if (recentTxs.length > 10) return 0.95; // Extremely high velocity
    if (recentTxs.length > 5) return 0.75; // High velocity
    if (recentTxs.length > 3) return 0.5; // Moderate velocity
    return 0.1;
  }

  private calculateReputationRisk(tx: Transaction): number {
    const history = this.transactionHistory.get(tx.from) || [];
    
    // New accounts (less than 10 transactions) have higher risk
    if (history.length < 3) return 0.8;
    if (history.length < 10) return 0.5;
    if (history.length < 50) return 0.3;
    return 0.1;
  }

  private calculatePatternRisk(tx: Transaction): number {
    // Check against known fraud patterns
    for (const pattern of this.fraudPatterns) {
      if (pattern.status !== 'active') continue;
      
      if (pattern.affectedAccounts.includes(tx.from) || 
          pattern.affectedAccounts.includes(tx.to)) {
        return pattern.confidence;
      }
    }
    return 0.1;
  }

  private calculateNetworkRisk(tx: Transaction): number {
    // Check if sender or receiver has been involved in flagged transactions
    const senderHistory = this.transactionHistory.get(tx.from) || [];
    const receiverHistory = this.transactionHistory.get(tx.to) || [];
    
    // Calculate what percentage of transactions were flagged
    const senderFlagged = senderHistory.filter(t => {
      const score = this.riskCache.get(`${t.from}-${t.to}-${t.amount}-${t.timestamp}`);
      return score && score.score > this.config.riskThreshold;
    }).length;

    const receiverFlagged = receiverHistory.filter(t => {
      const score = this.riskCache.get(`${t.from}-${t.to}-${t.amount}-${t.timestamp}`);
      return score && score.score > this.config.riskThreshold;
    }).length;

    const senderRisk = senderHistory.length > 0 ? senderFlagged / senderHistory.length : 0;
    const receiverRisk = receiverHistory.length > 0 ? receiverFlagged / receiverHistory.length : 0;

    return Math.max(senderRisk, receiverRisk);
  }

  private calculateConfidence(factorCount: number): number {
    // More factors detected = higher confidence
    return Math.min(0.5 + (factorCount * 0.1), 0.95);
  }

  private storeTransaction(tx: Transaction): void {
    if (!this.transactionHistory.has(tx.from)) {
      this.transactionHistory.set(tx.from, []);
    }
    
    const history = this.transactionHistory.get(tx.from)!;
    history.push(tx);

    // Keep only last 1000 transactions per account
    if (history.length > 1000) {
      history.shift();
    }
  }
}

// Singleton
let fraudInstance: FraudPrevention | null = null;

export function getFraudPrevention(config?: Partial<FraudConfig>): FraudPrevention {
  if (!fraudInstance) {
    fraudInstance = new FraudPrevention(config);
  }
  return fraudInstance;
}
