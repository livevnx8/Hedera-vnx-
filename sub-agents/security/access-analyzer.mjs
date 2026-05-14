/**
 * Access Analyzer Sub-Agent
 * Analyzes permission structures and access patterns for security risks
 */

import { SubAgent } from '../base.mjs';

export class AccessAnalyzer extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'ACCESS_ANALYZER',
      interval: config.interval || 300000 // 5 minutes default
    });
    
    this.monitoredAccounts = config.monitoredAccounts || [];
    this.permissionHistory = [];
    this.accessViolations = [];
  }

  async performTask(parentContext) {
    const analysis = {
      accountsAnalyzed: 0,
      permissionIssues: [],
      recommendations: [],
      riskScore: 0
    };
    
    for (const account of this.monitoredAccounts) {
      const permissions = this.analyzePermissions(account);
      analysis.accountsAnalyzed++;
      
      if (permissions.issues.length > 0) {
        analysis.permissionIssues.push({
          account: account.id,
          ...permissions
        });
        
        // Generate recommendations
        permissions.issues.forEach(issue => {
          analysis.recommendations.push({
            account: account.id,
            issue: issue.type,
            severity: issue.severity,
            action: issue.recommendation
          });
        });
      }
      
      // Check for access violations
      const violations = this.detectAccessViolations(account, permissions);
      if (violations.length > 0) {
        this.accessViolations.push(...violations);
        
        // Keep only last 30 violations
        if (this.accessViolations.length > 30) {
          this.accessViolations = this.accessViolations.slice(-30);
        }
      }
    }
    
    // Calculate overall risk score
    analysis.riskScore = this.calculateRiskScore(analysis);
    
    // Store history
    this.permissionHistory.push({
      timestamp: Date.now(),
      accountsAnalyzed: analysis.accountsAnalyzed,
      issuesFound: analysis.permissionIssues.length,
      riskScore: analysis.riskScore
    });
    
    // Keep only last 50 history entries
    if (this.permissionHistory.length > 50) {
      this.permissionHistory.shift();
    }
    
    return {
      ...analysis,
      totalViolations: this.accessViolations.length,
      recentViolations: this.accessViolations.slice(-3),
      riskTrend: this.calculateRiskTrend(),
      timestamp: Date.now()
    };
  }

  analyzePermissions(account) {
    const issues = [];
    
    // Check for excessive permissions
    if (account.permissions?.includes('ADMIN') && account.permissions?.includes('EXECUTE')) {
      issues.push({
        type: 'EXCESSIVE_PERMISSIONS',
        severity: 'MEDIUM',
        details: 'Account has both ADMIN and EXECUTE permissions',
        recommendation: 'Split permissions across multiple accounts'
      });
    }
    
    // Check for unused permissions
    if (account.permissions?.length > 5 && account.lastActivity > Date.now() - 30 * 24 * 60 * 60 * 1000) {
      issues.push({
        type: 'UNUSED_PERMISSIONS',
        severity: 'LOW',
        details: `Account has ${account.permissions.length} permissions but low activity`,
        recommendation: 'Review and revoke unused permissions'
      });
    }
    
    // Check for shared accounts
    if (account.shared === true) {
      issues.push({
        type: 'SHARED_ACCOUNT',
        severity: 'HIGH',
        details: 'Account is marked as shared between multiple users',
        recommendation: 'Create individual accounts for each user'
      });
    }
    
    // Check for weak keys
    if (account.keyType === 'ECDSA' && account.keyLength < 256) {
      issues.push({
        type: 'WEAK_KEY',
        severity: 'CRITICAL',
        details: 'Account uses weak cryptographic key',
        recommendation: 'Upgrade to ED25519 with 256-bit key immediately'
      });
    }
    
    return {
      permissions: account.permissions || [],
      issues,
      score: Math.max(0, 1 - issues.reduce((sum, i) => 
        sum + (i.severity === 'CRITICAL' ? 0.5 : i.severity === 'HIGH' ? 0.3 : 0.1), 0))
    };
  }

  detectAccessViolations(account, permissions) {
    const violations = [];
    
    // Simulate access pattern analysis
    const unusualAccess = Math.random() > 0.95; // 5% chance of unusual access
    
    if (unusualAccess) {
      violations.push({
        account: account.id,
        type: 'UNUSUAL_ACCESS_PATTERN',
        details: 'Access from unusual location/time',
        timestamp: Date.now(),
        severity: 'MEDIUM'
      });
    }
    
    // Check for privilege escalation attempts
    const escalationAttempt = Math.random() > 0.98; // 2% chance
    
    if (escalationAttempt) {
      violations.push({
        account: account.id,
        type: 'PRIVILEGE_ESCALATION_ATTEMPT',
        details: 'Attempt to access resources beyond permission scope',
        timestamp: Date.now(),
        severity: 'HIGH'
      });
    }
    
    return violations;
  }

  calculateRiskScore(analysis) {
    let score = 1.0;
    
    // Deduct for permission issues
    score -= analysis.permissionIssues.length * 0.1;
    
    // Deduct for recent violations
    score -= this.accessViolations.filter(v => 
      Date.now() - v.timestamp < 24 * 60 * 60 * 1000).length * 0.15;
    
    return Math.max(0, score);
  }

  calculateRiskTrend() {
    if (this.permissionHistory.length < 3) {
      return 'INSUFFICIENT_DATA';
    }
    
    const recent = this.permissionHistory.slice(-3);
    const avgRecent = recent.reduce((sum, h) => sum + h.riskScore, 0) / recent.length;
    const older = this.permissionHistory.slice(-6, -3);
    const avgOlder = older.length > 0 ? 
      older.reduce((sum, h) => sum + h.riskScore, 0) / older.length : avgRecent;
    
    const change = avgRecent - avgOlder;
    
    if (change > 0.1) return 'IMPROVING';
    if (change < -0.1) return 'DEGRADING';
    return 'STABLE';
  }

  getStats() {
    return {
      ...super.getStats(),
      accountsMonitored: this.monitoredAccounts.length,
      totalViolations: this.accessViolations.length,
      recentViolations: this.accessViolations.slice(-5),
      riskTrend: this.calculateRiskTrend(),
      currentRiskScore: this.permissionHistory.length > 0 ? 
        this.permissionHistory[this.permissionHistory.length - 1].riskScore : 1.0
    };
  }
}

export default AccessAnalyzer;
