/**
 * Contract Monitor Sub-Agent
 * Monitors smart contracts for security, performance, and health
 */

import { SubAgent } from '../base.mjs';

export class ContractMonitor extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'CONTRACT_MONITOR',
      interval: config.interval || 120000 // 2 minutes default
    });
    
    this.contracts = config.contracts || [];
    this.healthHistory = new Map();
    this.alerts = [];
  }

  async performTask(parentContext) {
    const results = [];
    
    for (const contract of this.contracts) {
      const health = await this.assessContract(contract);
      
      // Store history
      if (!this.healthHistory.has(contract.address)) {
        this.healthHistory.set(contract.address, []);
      }
      this.healthHistory.get(contract.address).push(health);
      
      // Keep only last 20 assessments
      const history = this.healthHistory.get(contract.address);
      if (history.length > 20) {
        history.shift();
      }
      
      results.push({
        address: contract.address,
        name: contract.name,
        ...health
      });
      
      // Check for alerts
      if (health.status !== 'HEALTHY') {
        this.alerts.push({
          contract: contract.address,
          name: contract.name,
          issue: health.status,
          severity: health.severity,
          timestamp: Date.now()
        });
        
        // Keep only last 20 alerts
        if (this.alerts.length > 20) {
          this.alerts.shift();
        }
      }
    }
    
    return {
      contractsChecked: results.length,
      healthy: results.filter(r => r.status === 'HEALTHY').length,
      warning: results.filter(r => r.status === 'WARNING').length,
      critical: results.filter(r => r.status === 'CRITICAL').length,
      results,
      newAlerts: this.alerts.slice(-3),
      timestamp: Date.now()
    };
  }

  async assessContract(contract) {
    // Simulate contract health assessment
    const gasUsage = this.assessGasUsage(contract);
    const callVolume = this.assessCallVolume(contract);
    const balance = this.assessBalance(contract);
    const codeIntegrity = this.assessCodeIntegrity(contract);
    
    // Calculate overall health score
    const score = (gasUsage.score + callVolume.score + balance.score + codeIntegrity.score) / 4;
    
    let status = 'HEALTHY';
    let severity = 'NONE';
    
    if (score < 0.3) {
      status = 'CRITICAL';
      severity = 'CRITICAL';
    } else if (score < 0.6) {
      status = 'WARNING';
      severity = 'HIGH';
    } else if (score < 0.8) {
      status = 'ATTENTION';
      severity = 'MEDIUM';
    }
    
    return {
      score: score.toFixed(2),
      status,
      severity,
      gasUsage,
      callVolume,
      balance,
      codeIntegrity,
      lastTransaction: Date.now() - Math.floor(Math.random() * 300000),
      uptimePercent: (90 + Math.random() * 10).toFixed(1) + '%'
    };
  }

  assessGasUsage(contract) {
    const baselineGas = contract.baselineGas || 50000;
    const currentGas = baselineGas * (0.8 + Math.random() * 0.6);
    const deviation = Math.abs(currentGas - baselineGas) / baselineGas;
    
    return {
      current: Math.round(currentGas),
      baseline: baselineGas,
      deviation: (deviation * 100).toFixed(1) + '%',
      score: Math.max(0, 1 - deviation)
    };
  }

  assessCallVolume(contract) {
    const baselineVolume = contract.baselineVolume || 100;
    const currentVolume = Math.floor(baselineVolume * (0.5 + Math.random() * 1.5));
    const deviation = Math.abs(currentVolume - baselineVolume) / baselineVolume;
    
    return {
      current: currentVolume,
      baseline: baselineVolume,
      deviation: (deviation * 100).toFixed(1) + '%',
      score: Math.max(0, 1 - deviation * 0.5) // Less sensitive to volume changes
    };
  }

  assessBalance(contract) {
    const minBalance = contract.minBalance || 100;
    const currentBalance = minBalance * (0.5 + Math.random() * 2);
    
    return {
      current: Math.round(currentBalance),
      minRequired: minBalance,
      status: currentBalance > minBalance ? 'SUFFICIENT' : 'LOW',
      score: Math.min(1, currentBalance / minBalance)
    };
  }

  assessCodeIntegrity(contract) {
    // Simulate code hash verification
    const hashMatch = Math.random() > 0.1; // 90% chance of matching
    const verified = contract.verified !== false;
    
    return {
      hashMatch,
      verified,
      auditStatus: contract.audited ? 'AUDITED' : 'UNAUDITED',
      score: (hashMatch && verified) ? 1.0 : hashMatch ? 0.7 : 0.3
    };
  }

  getStats() {
    return {
      ...super.getStats(),
      contractsMonitored: this.contracts.length,
      totalAlerts: this.alerts.length,
      recentAlerts: this.alerts.slice(-5),
      healthyContracts: Array.from(this.healthHistory.values()).filter(
        h => h[h.length - 1]?.status === 'HEALTHY'
      ).length
    };
  }
}

export default ContractMonitor;
