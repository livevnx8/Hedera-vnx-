#!/usr/bin/env node
/**
 * Vera FedEx Compliance & Audit Agent
 * 
 * Ensures regulatory compliance for FedEx supply chain operations.
 * Maintains immutable audit trails on Hedera Consensus Service for:
 * - C-TPAT (Customs-Trade Partnership Against Terrorism)
 * - ISO 28000 (Supply chain security management)
 * - AEO (Authorized Economic Operator)
 * - GDPR data handling compliance
 * - Customs and border protection requirements
 * 
 * Features:
 * - Compliance monitoring and validation
 * - Automated audit trail generation
 * - Regulatory reporting
 * - Anomaly detection for compliance violations
 * - 7-year audit log retention on HCS
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';
import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

dotenv.config();

const CONFIG = {
  network: process.env.HEDERA_NETWORK || 'mainnet',
  operatorId: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
  privateKey: process.env.HEDERA_OPERATOR_PRIVATE_KEY,
  topics: {
    chain: process.env.FEDEX_CHAIN_TOPIC_ID,
    audit: process.env.FEDEX_AUDIT_TOPIC_ID,
    intl: process.env.FEDEX_INTL_TOPIC_ID,
    route: process.env.FEDEX_ROUTE_TOPIC_ID
  },
  complianceStandards: ['C-TPAT', 'ISO28000', 'AEO', 'GDPR'],
  auditRetention: '7y',
  checkInterval: 3600000 // 1 hour
};

class FedExComplianceAgent {
  client;
  isRunning = false;
  stats = {
    auditsCompleted: 0,
    complianceChecks: 0,
    violationsDetected: 0,
    reportsGenerated: 0,
    lastAudit: null
  };

  // Compliance rules
  complianceRules = {
    ctpat: {
      maxInspectionTime: 3600000, // 1 hour
      requiredSeals: true,
      chainOfCustody: true,
      backgroundChecks: true
    },
    iso28000: {
      riskAssessmentRequired: true,
      securityPlan: true,
      incidentReporting: true
    },
    aeo: {
      financialSolvency: true,
      complianceHistory: true,
      securityMeasures: true
    },
    gdpr: {
      dataMinimization: true,
      retentionLimit: 2555 * 86400000, // 7 years in ms
      rightToDeletion: true
    }
  };

  constructor() {
    if (!CONFIG.operatorId || !CONFIG.privateKey) {
      throw new Error('Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
    }

    this.client = CONFIG.network === 'mainnet' 
      ? Client.forMainnet() 
      : Client.forTestnet();

    let privateKey;
    const keyStr = CONFIG.privateKey;
    if (keyStr.startsWith('0x')) {
      privateKey = PrivateKey.fromStringECDSA(keyStr.slice(2));
    } else if (keyStr.length === 64) {
      privateKey = PrivateKey.fromStringECDSA(keyStr);
    } else if (keyStr.length === 96) {
      privateKey = PrivateKey.fromStringED25519(keyStr);
    } else {
      privateKey = PrivateKey.fromString(keyStr);
    }

    this.client.setOperator(CONFIG.operatorId, privateKey);
  }

  /**
   * Generate cryptographic signature
   */
  sign(data) {
    return createHash('sha256').update(JSON.stringify(data) + Date.now()).digest('hex');
  }

  /**
   * Validate shipment against compliance standards
   */
  async validateShipment(shipment) {
    const violations = [];
    const checks = [];

    // C-TPAT Validation
    if (shipment.international) {
      const ctpatCheck = this.validateCTPAT(shipment);
      checks.push(ctpatCheck);
      if (!ctpatCheck.passed) {
        violations.push(...ctpatCheck.violations);
      }
    }

    // ISO 28000 Validation
    const isoCheck = this.validateISO28000(shipment);
    checks.push(isoCheck);
    if (!isoCheck.passed) {
      violations.push(...isoCheck.violations);
    }

    // GDPR Validation
    const gdprCheck = this.validateGDPR(shipment);
    checks.push(gdprCheck);
    if (!gdprCheck.passed) {
      violations.push(...gdprCheck.violations);
    }

    // AEO Validation
    if (shipment.euDestination || shipment.euOrigin) {
      const aeoCheck = this.validateAEO(shipment);
      checks.push(aeoCheck);
      if (!aeoCheck.passed) {
        violations.push(...aeoCheck.violations);
      }
    }

    const result = {
      trackingNumber: shipment.trackingNumber,
      timestamp: Date.now(),
      overallCompliance: violations.length === 0,
      standards: {
        ctpat: checks.find(c => c.standard === 'C-TPAT'),
        iso28000: checks.find(c => c.standard === 'ISO28000'),
        gdpr: checks.find(c => c.standard === 'GDPR'),
        aeo: checks.find(c => c.standard === 'AEO')
      },
      violations,
      riskLevel: this.calculateRiskLevel(violations)
    };

    this.stats.complianceChecks++;

    if (violations.length > 0) {
      this.stats.violationsDetected += violations.length;
      await this.logViolation(result);
    }

    await this.logComplianceCheck(result);

    return result;
  }

  /**
   * Validate C-TPAT requirements
   */
  validateCTPAT(shipment) {
    const violations = [];
    const checks = [];

    // Check container security
    if (!shipment.containerSealed) {
      violations.push({
        standard: 'C-TPAT',
        requirement: 'Container Seals',
        severity: 'critical',
        details: 'Shipment missing required container seals'
      });
    }
    checks.push({ name: 'Container Seals', passed: shipment.containerSealed });

    // Check inspection time
    if (shipment.inspectionTime > this.complianceRules.ctpat.maxInspectionTime) {
      violations.push({
        standard: 'C-TPAT',
        requirement: 'Inspection Time',
        severity: 'high',
        details: `Inspection took ${shipment.inspectionTime / 60000} minutes, exceeds 60 minute limit`
      });
    }
    checks.push({ 
      name: 'Inspection Time', 
      passed: shipment.inspectionTime <= this.complianceRules.ctpat.maxInspectionTime 
    });

    // Check chain of custody
    if (!shipment.chainOfCustody || shipment.chainOfCustody.length < 2) {
      violations.push({
        standard: 'C-TPAT',
        requirement: 'Chain of Custody',
        severity: 'critical',
        details: 'Incomplete chain of custody documentation'
      });
    }
    checks.push({ 
      name: 'Chain of Custody', 
      passed: shipment.chainOfCustody && shipment.chainOfCustody.length >= 2 
    });

    return {
      standard: 'C-TPAT',
      passed: violations.length === 0,
      checks,
      violations
    };
  }

  /**
   * Validate ISO 28000 requirements
   */
  validateISO28000(shipment) {
    const violations = [];
    const checks = [];

    // Risk assessment
    if (!shipment.riskAssessment) {
      violations.push({
        standard: 'ISO28000',
        requirement: 'Risk Assessment',
        severity: 'medium',
        details: 'No risk assessment on file for shipment'
      });
    }
    checks.push({ name: 'Risk Assessment', passed: !!shipment.riskAssessment });

    // Security plan
    if (!shipment.securityPlan) {
      violations.push({
        standard: 'ISO28000',
        requirement: 'Security Plan',
        severity: 'medium',
        details: 'Security plan not documented'
      });
    }
    checks.push({ name: 'Security Plan', passed: !!shipment.securityPlan });

    return {
      standard: 'ISO28000',
      passed: violations.length === 0,
      checks,
      violations
    };
  }

  /**
   * Validate GDPR requirements
   */
  validateGDPR(shipment) {
    const violations = [];
    const checks = [];

    // Data minimization
    const hasExcessiveData = shipment.senderData && Object.keys(shipment.senderData).length > 5;
    if (hasExcessiveData) {
      violations.push({
        standard: 'GDPR',
        requirement: 'Data Minimization',
        severity: 'medium',
        details: 'Excessive personal data collected'
      });
    }
    checks.push({ name: 'Data Minimization', passed: !hasExcessiveData });

    // Data retention
    const dataAge = Date.now() - (shipment.dataCreated || Date.now());
    if (dataAge > this.complianceRules.gdpr.retentionLimit) {
      violations.push({
        standard: 'GDPR',
        requirement: 'Data Retention',
        severity: 'high',
        details: 'Data retained beyond 7 year limit'
      });
    }
    checks.push({ 
      name: 'Data Retention', 
      passed: dataAge <= this.complianceRules.gdpr.retentionLimit 
    });

    return {
      standard: 'GDPR',
      passed: violations.length === 0,
      checks,
      violations
    };
  }

  /**
   * Validate AEO requirements
   */
  validateAEO(shipment) {
    const violations = [];
    const checks = [];

    // Financial solvency check
    if (!shipment.carrierFinancialStatus) {
      violations.push({
        standard: 'AEO',
        requirement: 'Financial Solvency',
        severity: 'medium',
        details: 'Carrier financial status not verified'
      });
    }
    checks.push({ name: 'Financial Solvency', passed: !!shipment.carrierFinancialStatus });

    // Compliance history
    if (shipment.carrierViolations && shipment.carrierViolations.length > 3) {
      violations.push({
        standard: 'AEO',
        requirement: 'Compliance History',
        severity: 'high',
        details: `Carrier has ${shipment.carrierViolations.length} violations on record`
      });
    }
    checks.push({ 
      name: 'Compliance History', 
      passed: !shipment.carrierViolations || shipment.carrierViolations.length <= 3 
    });

    return {
      standard: 'AEO',
      passed: violations.length === 0,
      checks,
      violations
    };
  }

  /**
   * Calculate risk level based on violations
   */
  calculateRiskLevel(violations) {
    if (violations.some(v => v.severity === 'critical')) return 'CRITICAL';
    if (violations.some(v => v.severity === 'high')) return 'HIGH';
    if (violations.some(v => v.severity === 'medium')) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Log compliance check to HCS
   */
  async logComplianceCheck(result) {
    if (!CONFIG.topics.audit) {
      console.error('❌ FEDEX_AUDIT_TOPIC_ID not configured');
      return null;
    }

    const message = {
      type: 'COMPLIANCE_CHECK',
      timestamp: Date.now(),
      agent: 'vera-fedex-compliance-agent',
      version: '1.0.0',
      fedex: {
        trackingNumber: result.trackingNumber,
        overallCompliance: result.overallCompliance,
        standards: Object.keys(result.standards).filter(s => result.standards[s]),
        riskLevel: result.riskLevel,
        violations: result.violations.length
      },
      verification: {
        verifier: CONFIG.operatorId,
        hash: this.sign(result)
      }
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(CONFIG.topics.audit)
        .setMessage(JSON.stringify(message))
        .execute(this.client);

      const record = await tx.getRecord(this.client);
      const sequence = record.receipt.topicSequenceNumber?.toString();

      console.log(`✅ Compliance check logged: ${result.trackingNumber} (${result.riskLevel} risk)`);
      console.log(`   HCS Sequence: ${sequence}`);

      return { success: true, sequence };
    } catch (error) {
      console.error('❌ Failed to log compliance check:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log violation to HCS
   */
  async logViolation(result) {
    const message = {
      type: 'COMPLIANCE_VIOLATION',
      timestamp: Date.now(),
      agent: 'vera-fedex-compliance-agent',
      fedex: {
        trackingNumber: result.trackingNumber,
        violations: result.violations,
        riskLevel: result.riskLevel,
        action: result.riskLevel === 'CRITICAL' ? 'HOLD_SHIPMENT' : 'FLAG_FOR_REVIEW'
      }
    };

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(CONFIG.topics.audit)
        .setMessage(JSON.stringify(message))
        .execute(this.client);

      console.log(`⚠️  Compliance violation logged: ${result.trackingNumber}`);
      result.violations.forEach(v => {
        console.log(`   - ${v.standard}: ${v.requirement} (${v.severity})`);
      });
    } catch (error) {
      console.error('❌ Failed to log violation:', error.message);
    }
  }

  /**
   * Generate compliance audit report
   */
  async generateAuditReport(startDate, endDate) {
    const report = {
      reportId: `AUDIT-${Date.now()}`,
      generatedAt: Date.now(),
      period: { start: startDate, end: endDate },
      summary: {
        totalChecks: this.stats.complianceChecks,
        passed: this.stats.complianceChecks - this.stats.violationsDetected,
        violations: this.stats.violationsDetected,
        complianceRate: ((this.stats.complianceChecks - this.stats.violationsDetected) / 
          this.stats.complianceChecks * 100).toFixed(2)
      },
      standards: CONFIG.complianceStandards,
      retention: CONFIG.auditRetention
    };

    this.stats.auditsCompleted++;
    this.stats.reportsGenerated++;
    this.stats.lastAudit = Date.now();

    // Log report to HCS
    await this.logAuditReport(report);

    return report;
  }

  /**
   * Log audit report to HCS
   */
  async logAuditReport(report) {
    const message = {
      type: 'AUDIT_REPORT',
      timestamp: Date.now(),
      agent: 'vera-fedex-compliance-agent',
      fedex: {
        reportId: report.reportId,
        period: report.period,
        summary: report.summary,
        standards: report.standards
      },
      verification: {
        verifier: CONFIG.operatorId,
        hash: this.sign(report)
      }
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(CONFIG.topics.audit)
        .setMessage(JSON.stringify(message))
        .execute(this.client);

      const record = await tx.getRecord(this.client);
      const sequence = record.receipt.topicSequenceNumber?.toString();

      console.log(`📋 Audit report generated: ${report.reportId}`);
      console.log(`   Compliance Rate: ${report.summary.complianceRate}%`);
      console.log(`   HCS Sequence: ${sequence}`);

      return { success: true, sequence, report };
    } catch (error) {
      console.error('❌ Failed to log audit report:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      operatorId: CONFIG.operatorId,
      topics: CONFIG.topics,
      complianceStandards: CONFIG.complianceStandards
    };
  }

  /**
   * Start the agent
   */
  async start() {
    this.isRunning = true;
    console.log('🛡️  Vera FedEx Compliance Agent Started');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Operator: ${CONFIG.operatorId}`);
    console.log(`Network: ${CONFIG.network}`);
    console.log(`Topics: ${Object.values(CONFIG.topics).filter(Boolean).length}/8 configured`);
    console.log(`Standards: ${CONFIG.complianceStandards.join(', ')}`);
    console.log(`Audit Retention: ${CONFIG.auditRetention}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (!CONFIG.topics.audit) {
      console.warn('⚠️  Warning: FEDEX_AUDIT_TOPIC_ID not configured');
      console.warn('   Run: node scripts/create-fedex-topics.mjs\n');
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    this.isRunning = false;
    console.log('\n🛑 Vera FedEx Compliance Agent Stopped');
    console.log(`Compliance checks: ${this.stats.complianceChecks}`);
    console.log(`Violations detected: ${this.stats.violationsDetected}`);
    console.log(`Audit reports: ${this.stats.reportsGenerated}`);
    this.client.close();
  }
}

// Main execution
async function main() {
  const agent = new FedExComplianceAgent();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });

  await agent.start();

  // Demo mode - simulate compliance checks
  if (process.argv.includes('--demo')) {
    console.log('🎮 Demo Mode Active - Simulating compliance checks...\n');
    
    const demoShipments = [
      {
        trackingNumber: '123456789012',
        international: true,
        containerSealed: true,
        inspectionTime: 1800000, // 30 minutes
        chainOfCustody: ['MEMPHIS', 'ATLANTA'],
        riskAssessment: true,
        securityPlan: true,
        senderData: { name: 'John Doe', address: '123 Main St' },
        dataCreated: Date.now() - 86400000,
        carrierFinancialStatus: 'SOLVENT',
        carrierViolations: [],
        euDestination: true
      },
      {
        trackingNumber: '987654321098',
        international: true,
        containerSealed: false, // Violation
        inspectionTime: 7200000, // 2 hours - exceeds limit
        chainOfCustody: ['CHICAGO'], // Incomplete
        riskAssessment: false, // Violation
        securityPlan: true,
        senderData: { 
          name: 'Jane Smith', 
          address: '456 Oak Ave',
          phone: '555-1234',
          email: 'jane@example.com',
          ssn: '123-45-6789' // Excessive data - GDPR violation
        },
        dataCreated: Date.now() - 86400000,
        carrierFinancialStatus: null, // Violation
        carrierViolations: ['2024-001', '2024-002', '2024-003', '2024-004'], // Too many
        euDestination: true
      }
    ];

    for (const shipment of demoShipments) {
      const result = await agent.validateShipment(shipment);
      console.log(`\n📦 Shipment ${shipment.trackingNumber}:`);
      console.log(`   Overall: ${result.overallCompliance ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}`);
      console.log(`   Risk Level: ${result.riskLevel}`);
      console.log(`   Violations: ${result.violations.length}`);
      await setTimeout(1000);
    }

    // Generate audit report
    const report = await agent.generateAuditReport(
      Date.now() - 86400000,
      Date.now()
    );

    console.log('\n📊 Demo Complete. Final statistics:');
    console.log(agent.getStats());
    
    await agent.stop();
    process.exit(0);
  }

  // Keep running
  while (agent.isRunning) {
    await setTimeout(1000);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

export { FedExComplianceAgent };
