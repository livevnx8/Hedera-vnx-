/**
 * Threat Detector Sub-Agent
 * Detects security threats and anomalies in the Hedera ecosystem
 */

import { SubAgent } from '../base.mjs';

export class ThreatDetector extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'THREAT_DETECTOR',
      interval: config.interval || 60000 // 1 minute default
    });
    
    this.threatPatterns = config.threatPatterns || [
      'flash_loan_attack',
      'reentrancy_attempt',
      'price_manipulation',
      'unusual_gas_consumption',
      'privilege_escalation',
      'suspicious_token_movement',
      'contract_self_destruct'
    ];
    this.monitoredContracts = config.monitoredContracts || [];
    this.threatsDetected = [];
    this.scanCount = 0;
    this.riskScore = 0.95;
  }

  async performTask(parentContext) {
    const detectedThreats = [];
    
    // Scan for each threat pattern
    for (const pattern of this.threatPatterns) {
      const threat = this.scanForThreat(pattern);
      if (threat && threat.confidence > 0.7) {
        detectedThreats.push(threat);
        this.threatsDetected.push(threat);
        
        // Keep only last 50 threats
        if (this.threatsDetected.length > 50) {
          this.threatsDetected.shift();
        }
      }
    }
    
    // Monitor contracts
    for (const contract of this.monitoredContracts) {
      const contractHealth = this.assessContractHealth(contract);
      if (contractHealth.riskLevel !== 'LOW') {
        detectedThreats.push({
          type: 'CONTRACT_RISK',
          contract: contract.address,
          contractName: contract.name,
          ...contractHealth
        });
      }
    }
    
    this.scanCount++;
    
    // Update overall risk score
    this.updateRiskScore(detectedThreats);
    
    return {
      scanId: `scan-${Date.now()}`,
      scanNumber: this.scanCount,
      threatsFound: detectedThreats.length,
      threats: detectedThreats,
      overallRiskScore: this.riskScore,
      riskLevel: this.getRiskLevel(this.riskScore),
      isSecure: detectedThreats.length === 0,
      timestamp: Date.now()
    };
  }

  scanForThreat(pattern) {
    // Simulate threat detection
    const detectionChance = 0.05; // 5% chance of detecting a threat
    
    if (Math.random() > detectionChance) {
      return null;
    }
    
    const confidence = 0.7 + Math.random() * 0.25;
    const severity = confidence > 0.9 ? 'CRITICAL' : confidence > 0.8 ? 'HIGH' : 'MEDIUM';
    
    return {
      pattern,
      confidence: (confidence * 100).toFixed(1) + '%',
      confidenceValue: confidence,
      severity,
      details: this.generateThreatDetails(pattern),
      affectedContracts: this.getRandomContracts(1, 3),
      recommendedAction: this.getRecommendedAction(pattern, severity),
      timestamp: Date.now()
    };
  }

  generateThreatDetails(pattern) {
    const details = {
      flash_loan_attack: 'Large uncollateralized loan detected followed by price manipulation',
      reentrancy_attempt: 'Multiple external calls detected before state update',
      price_manipulation: 'Abnormal price movement consistent with oracle manipulation',
      unusual_gas_consumption: 'Transaction gas usage exceeds normal pattern by 300%',
      privilege_escalation: 'Unauthorized ownership transfer attempt detected',
      suspicious_token_movement: 'Large token transfer to unverified contract',
      contract_self_destruct: 'Self-destruct call detected in contract bytecode'
    };
    return details[pattern] || 'Unknown threat pattern';
  }

  getRandomContracts(min, max) {
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    const contracts = [];
    
    for (let i = 0; i < count; i++) {
      contracts.push(`0.0.${Math.floor(Math.random() * 100000) + 1000}`);
    }
    
    return contracts;
  }

  getRecommendedAction(pattern, severity) {
    if (severity === 'CRITICAL') {
      return 'IMMEDIATE_PAUSE: Pause all contract interactions and alert security team';
    } else if (severity === 'HIGH') {
      return 'INCREASE_MONITORING: Double scan frequency and notify security team';
    }
    return 'LOG_AND_MONITOR: Log incident and continue monitoring';
  }

  assessContractHealth(contract) {
    const riskScore = contract.riskScore || Math.random() * 0.5;
    
    return {
      riskScore: riskScore.toFixed(2),
      riskLevel: riskScore < 0.2 ? 'LOW' : riskScore < 0.5 ? 'MEDIUM' : 'HIGH',
      lastScan: Date.now(),
      transactionVolume24h: Math.floor(Math.random() * 10000),
      anomalyCount: Math.floor(riskScore * 10)
    };
  }

  updateRiskScore(threats) {
    if (threats.length === 0) {
      this.riskScore = Math.min(1.0, this.riskScore + 0.01);
    } else {
      const threatImpact = threats.reduce((sum, t) => 
        sum + (t.confidenceValue || 0.7) * (t.severity === 'CRITICAL' ? 0.5 : t.severity === 'HIGH' ? 0.3 : 0.1), 0);
      this.riskScore = Math.max(0, this.riskScore - threatImpact);
    }
  }

  getRiskLevel(score) {
    if (score > 0.9) return 'LOW';
    if (score > 0.7) return 'MEDIUM';
    if (score > 0.5) return 'HIGH';
    return 'CRITICAL';
  }

  getStats() {
    return {
      ...super.getStats(),
      scanCount: this.scanCount,
      totalThreatsDetected: this.threatsDetected.length,
      currentRiskScore: this.riskScore,
      riskLevel: this.getRiskLevel(this.riskScore),
      recentThreats: this.threatsDetected.slice(-3)
    };
  }
}

export default ThreatDetector;
