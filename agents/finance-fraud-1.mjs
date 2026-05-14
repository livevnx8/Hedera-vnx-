#!/usr/bin/env node
/**
 * Vera Finance Fraud Detection Agent
 * Real-time transaction monitoring and anomaly detection
 */

import dotenv from 'dotenv';
dotenv.config();

import { VeraAgent } from '../blueprints/agent-base.mjs';
import { logger } from '../blueprints/logger.mjs';
import { createAgentConfig } from '../templates/agentRegistry.mjs';

class FinanceFraudAgent extends VeraAgent {
  constructor(config) {
    super(config);
    this.transactionHistory = [];
    this.riskScores = new Map();
    this.blockedAddresses = new Set();
  }

  async performWork() {
    const cycleId = crypto.randomUUID();
    logger.info('Fraud detection cycle started', { cycleId });

    // 1. Monitor incoming transactions
    await this.monitorTransactions(cycleId);

    // 2. Detect anomalies
    await this.detectAnomalies(cycleId);

    // 3. Score risk
    await this.scoreRisk(cycleId);

    // 4. Alert on suspicious activity
    await this.alertSuspicious(cycleId);

    logger.info('Fraud detection cycle complete', { cycleId });
  }

  async monitorTransactions(cycleId) {
    const transactions = this.fetchTransactions();
    
    for (const tx of transactions) {
      this.transactionHistory.push(tx);
      
      // Keep history manageable
      if (this.transactionHistory.length > 1000) {
        this.transactionHistory = this.transactionHistory.slice(-500);
      }

      await this.log('TRANSACTION_STREAM', 'TX_RECORDED', {
        cycleId,
        txId: tx.id,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        timestamp: Date.now()
      });

      logger.debug('Transaction logged', { txId: tx.id, amount: tx.amount });
    }
  }

  async detectAnomalies(cycleId) {
    const anomalies = [];
    
    // Check for velocity attacks (many transactions in short time)
    const velocityChecks = this.checkVelocity();
    anomalies.push(...velocityChecks);
    
    // Check for amount anomalies
    const amountAnomalies = this.checkAmountAnomalies();
    anomalies.push(...amountAnomalies);
    
    // Check for suspicious patterns
    const patternAnomalies = this.checkPatterns();
    anomalies.push(...patternAnomalies);

    for (const anomaly of anomalies) {
      await this.log('FRAUD_ALERTS', 'ANOMALY_DETECTED', {
        cycleId,
        ...anomaly,
        timestamp: Date.now()
      });

      logger.warn('Anomaly detected', { 
        type: anomaly.type, 
        address: anomaly.address 
      });
    }
  }

  async scoreRisk(cycleId) {
    const addresses = this.getActiveAddresses();
    
    for (const address of addresses) {
      const score = this.calculateRiskScore(address);
      this.riskScores.set(address, score);

      await this.log('RISK_SCORES', 'RISK_UPDATE', {
        cycleId,
        address,
        score: score.value,
        factors: score.factors,
        timestamp: Date.now()
      });

      if (score.value > 0.9) {
        this.blockedAddresses.add(address);
        logger.error('High-risk address blocked', { address, score: score.value });
      }
    }
  }

  async alertSuspicious(cycleId) {
    const suspicious = this.getSuspiciousActivity();
    
    for (const activity of suspicious) {
      await this.log('FRAUD_ALERTS', 'SUSPICIOUS_ACTIVITY', {
        cycleId,
        severity: activity.severity,
        description: activity.description,
        addresses: activity.addresses,
        recommendedAction: activity.action,
        timestamp: Date.now()
      });
    }
  }

  checkVelocity() {
    const anomalies = [];
    const windowMs = 60000; // 1 minute
    const threshold = 10; // More than 10 tx in 1 minute
    
    const byAddress = {};
    const now = Date.now();
    
    for (const tx of this.transactionHistory.slice(-100)) {
      if (now - tx.timestamp < windowMs) {
        byAddress[tx.from] = (byAddress[tx.from] || 0) + 1;
      }
    }
    
    for (const [address, count] of Object.entries(byAddress)) {
      if (count > threshold) {
        anomalies.push({
          type: 'velocity_attack',
          address,
          count,
          threshold,
          severity: 'critical'
        });
      }
    }
    
    return anomalies;
  }

  checkAmountAnomalies() {
    const anomalies = [];
    const amounts = this.transactionHistory.slice(-100).map(tx => tx.amount);
    
    if (amounts.length < 10) return anomalies;
    
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std = Math.sqrt(amounts.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / amounts.length);
    
    for (const tx of this.transactionHistory.slice(-10)) {
      if (Math.abs(tx.amount - avg) > 3 * std) {
        anomalies.push({
          type: 'amount_anomaly',
          address: tx.from,
          amount: tx.amount,
          expected: avg,
          severity: 'high'
        });
      }
    }
    
    return anomalies;
  }

  checkPatterns() {
    // Simplified pattern detection
    return [];
  }

  calculateRiskScore(address) {
    let score = 0.1; // Base score
    const factors = [];
    
    const addressTxs = this.transactionHistory.filter(tx => tx.from === address);
    
    // Velocity factor
    if (addressTxs.length > 20) {
      score += 0.3;
      factors.push('high_velocity');
    }
    
    // Amount factor
    const totalAmount = addressTxs.reduce((sum, tx) => sum + tx.amount, 0);
    if (totalAmount > 100000) {
      score += 0.2;
      factors.push('high_volume');
    }
    
    // New address factor
    if (addressTxs.length < 3) {
      score += 0.2;
      factors.push('new_address');
    }
    
    return {
      value: Math.min(score, 1.0),
      factors
    };
  }

  getActiveAddresses() {
    const addresses = new Set();
    for (const tx of this.transactionHistory.slice(-100)) {
      addresses.add(tx.from);
      addresses.add(tx.to);
    }
    return Array.from(addresses);
  }

  getSuspiciousActivity() {
    const suspicious = [];
    
    for (const [address, score] of this.riskScores) {
      if (score.value > 0.8) {
        suspicious.push({
          severity: score.value > 0.95 ? 'critical' : 'high',
          description: `High risk address: ${address}`,
          addresses: [address],
          action: score.value > 0.95 ? 'block_immediately' : 'review_manual'
        });
      }
    }
    
    return suspicious;
  }

  // Simulated data
  fetchTransactions() {
    return [
      { id: 'tx-001', from: '0xabc123', to: '0xdef456', amount: 1000, timestamp: Date.now() },
      { id: 'tx-002', from: '0xabc123', to: '0xghi789', amount: 2500, timestamp: Date.now() - 10000 },
      { id: 'tx-003', from: '0xnewaddr', to: '0xjkl012', amount: 50000, timestamp: Date.now() - 20000 }
    ];
  }
}

// Initialize
const config = createAgentConfig('finance-fraud-detection', {
  id: 'finance-fraud-1',
  credentials: {
    accountId: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
    privateKey: process.env.HEDERA_OPERATOR_PRIVATE_KEY
  },
  topics: {
    FRAUD_ALERTS: process.env.TOPIC_FRAUD_ALERTS,
    TRANSACTION_STREAM: process.env.TOPIC_TRANSACTION_STREAM,
    RISK_SCORES: process.env.TOPIC_RISK_SCORES
  }
});

const agent = new FinanceFraudAgent(config);
agent.start();

logger.info('Finance Fraud Detection Agent started', { id: config.id });
