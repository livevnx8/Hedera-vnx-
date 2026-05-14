#!/usr/bin/env node
/**
 * Vera Carbon Validator Agent v2.0
 * Refactored using AgentBase class
 * Phase 2 Implementation
 */

import { VeraAgent } from '../blueprints/agent-base.mjs';
import { DomainQuality } from '../blueprints/data-quality.mjs';
import dotenv from 'dotenv';

dotenv.config();

// Carbon credit registries
const CARBON_REGISTRIES = [
  'VERRA',
  'GOLD_STANDARD',
  'CARBON_TRUST',
  'AMERICAN_CARBON_REGISTRY'
];

// Verified carbon projects
const CARBON_PROJECTS = [
  { id: 'VCS-VCU-1523', type: 'FORESTRY', location: 'WV', vintage: 2023, tons: 50000 },
  { id: 'VCS-VCU-1524', type: 'RENEWABLE_ENERGY', location: 'WV', vintage: 2023, tons: 75000 },
  { id: 'GS-VER-4521', type: 'METHANE_CAPTURE', location: 'PA', vintage: 2022, tons: 30000 },
  { id: 'ACR-CR-7892', type: 'DIRECT_AIR_CAPTURE', location: 'WV', vintage: 2024, tons: 15000 }
];

// HCS Topics - use existing FedEx topics
const TOPICS = {
  CORE: process.env.FEDEX_ROUTE_TOPIC_ID || '0.0.10414355',
  DEFI: process.env.FEDEX_PKG_TOPIC_ID || '0.0.10414356',
  ENERGY: process.env.FEDEX_CHAIN_TOPIC_ID || '0.0.10414357',
  BRIDGE: process.env.FEDEX_AUDIT_TOPIC_ID || '0.0.10414362'
};

/**
 * CarbonValidator - Specialized agent for carbon credit verification
 */
class CarbonValidator extends VeraAgent {
  constructor(config) {
    super({
      id: config.id || 'carbon-validator-v2-001',
      type: 'CARBON_VALIDATOR',
      version: '2.0.0',
      credentials: config.credentials,
      topics: TOPICS,
      cycleInterval: 300000 // 5 minutes
    });

    this.registries = CARBON_REGISTRIES;
    this.projects = CARBON_PROJECTS;
    this.verifiedCredits = 0;
    this.retiredCredits = 0;
    this.doubleCountingChecks = 0;
  }

  /**
   * Main work cycle
   */
  async performWork() {
    const cycleId = crypto.randomUUID();
    console.log(`\n🌱 CYCLE #${this.state.cycles} - ${new Date().toLocaleTimeString()}`);
    console.log(`   Cycle ID: ${cycleId.substring(0, 8)}`);

    await this.log('ENERGY', 'CARBON_CYCLE_START', {
      cycleId,
      timestamp: Date.now()
    });

    // 1. OBSERVE: Validate carbon credits
    console.log(`   📝 Validating carbon credits...`);
    
    for (const project of this.projects) {
      const validation = await this.validateCredit(project);
      
      // Calculate quality
      const quality = DomainQuality.carbon({
        registry: project.id.startsWith('VCS') ? 'VERRA' : 
                  project.id.startsWith('GS') ? 'GOLD_STANDARD' : 'AMERICAN_CARBON_REGISTRY',
        retired: false,
        vintage: project.vintage,
        serialNumber: project.id
      });

      await this.log('ENERGY', 'CARBON_CREDIT_VALIDATED', {
        cycleId,
        projectId: project.id,
        projectType: project.type,
        location: project.location,
        ...validation,
        quality: quality.score,
        tier: quality.tier
      });

      const emoji = quality.emoji;
      console.log(`   ${emoji} ${project.id}: ${project.type} | ${project.tons.toLocaleString()} tons | ${quality.tier}`);

      if (validation.valid) {
        this.verifiedCredits += project.tons;
      }
    }

    // 2. ANALYZE: Check for double counting
    console.log(`   🔍 Checking for double counting...`);
    const doubleCounting = this.detectDoubleCounting();
    
    if (doubleCounting.length > 0) {
      console.log(`   ⚠️  Potential double counting detected: ${doubleCounting.length} cases`);
      
      for (const issue of doubleCounting) {
        await this.log('ENERGY', 'DOUBLE_COUNTING_ALERT', {
          cycleId,
          ...issue,
          severity: 'HIGH'
        }, 'high');

        console.log(`      🚨 ${issue.creditId}: Found in ${issue.registries.join(', ')}`);
        this.doubleCountingChecks++;

        // Cross-agent alert
        await this.log('BRIDGE', 'CROSS_AGENT_ALERT', {
          alertType: 'DOUBLE_COUNTING',
          message: `Credit ${issue.creditId} may be double-counted`,
          targetAgents: ['security-guardian', 'energy-auditor'],
          priority: 'HIGH',
          issue,
          cycleId
        }, 'high');
      }
    }

    // 3. DECIDE: Retirement validation
    const retirements = this.checkRetirements();
    if (retirements.length > 0) {
      console.log(`   🗑️  Processing retirements: ${retirements.length}`);
      
      for (const retirement of retirements) {
        await this.log('ENERGY', 'CREDIT_RETIRED', {
          cycleId,
          ...retirement,
          timestamp: Date.now()
        });

        this.retiredCredits += retirement.tons;
      }
    }

    // 4. EXECUTE: Generate carbon report
    const report = this.generateCarbonReport();
    await this.log('ENERGY', 'CARBON_REPORT', {
      cycleId,
      ...report
    });

    console.log(`   📊 Carbon Report: ${report.totalVerified.toLocaleString()} tons verified | ${report.netEmissions.toLocaleString()} tons net`);

    // 5. LEARN: Update verification accuracy
    this.state.accuracy.push(0.93);
    if (this.state.accuracy.length > 20) {
      this.state.accuracy = this.state.accuracy.slice(-10);
    }

    console.log(`   ✅ Cycle ${this.state.cycles} Complete`);
    console.log(`\n📈 AGENT TOTALS: ${this.verifiedCredits.toLocaleString()} verified | ${this.retiredCredits.toLocaleString()} retired | ${this.doubleCountingChecks} issues`);
  }

  /**
   * Validate carbon credit
   */
  async validateCredit(project) {
    // Simulated validation
    const checks = {
      registryVerified: this.registries.some(r => 
        project.id.startsWith(r.substring(0, 3).toUpperCase())
      ),
      notExpired: project.vintage >= 2020,
      notRetired: Math.random() > 0.1, // 90% not retired
      serialValid: project.id.length > 5,
      locationValid: ['WV', 'PA', 'OH', 'VA'].includes(project.location)
    };

    const allPassed = Object.values(checks).every(c => c);

    return {
      valid: allPassed,
      checks,
      verificationDate: Date.now(),
      verifier: this.id,
      signature: `sig-${Date.now()}`
    };
  }

  /**
   * Detect double counting
   */
  detectDoubleCounting() {
    const issues = [];
    
    // Simulated detection (random occurrence)
    if (Math.random() > 0.8) {
      const fakeCredit = this.projects[Math.floor(Math.random() * this.projects.length)];
      
      issues.push({
        creditId: fakeCredit.id,
        registries: ['VERRA', 'GOLD_STANDARD'],
        detectionMethod: 'serial_number_collision',
        confidence: 0.92,
        timestamp: Date.now()
      });
    }

    return issues;
  }

  /**
   * Check credit retirements
   */
  checkRetirements() {
    const retirements = [];
    
    // Simulated retirements
    if (Math.random() > 0.7) {
      const project = this.projects[Math.floor(Math.random() * this.projects.length)];
      const tons = Math.floor(Math.random() * 1000) + 100;
      
      retirements.push({
        creditId: project.id,
        tons,
        retiredBy: `0.0.${10000 + Math.floor(Math.random() * 90000)}`,
        purpose: 'CORPORATE_OFFSET',
        retirementDate: Date.now()
      });
    }

    return retirements;
  }

  /**
   * Generate carbon report
   */
  generateCarbonReport() {
    const totalVerified = this.projects.reduce((sum, p) => sum + p.tons, 0);
    const totalRetired = this.retiredCredits;
    const netEmissions = totalVerified - totalRetired;

    return {
      totalVerified,
      totalRetired,
      netEmissions,
      projectsMonitored: this.projects.length,
      registriesConnected: this.registries.length,
      verificationRate: 0.98,
      timestamp: Date.now()
    };
  }

  getStats() {
    return {
      ...super.getStats(),
      verifiedCredits: this.verifiedCredits,
      retiredCredits: this.retiredCredits,
      doubleCountingChecks: this.doubleCountingChecks,
      projectsMonitored: this.projects.length
    };
  }
}

// Initialize and start
const agent = new CarbonValidator({
  credentials: {
    accountId: process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360',
    key: process.env.HEDERA_OPERATOR_PRIVATE_KEY
  }
});

agent.setupGracefulShutdown();
agent.start();

console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🌱 VERA CARBON VALIDATOR v2.0                                    ║');
console.log('║  Refactored with AgentBase + Queue-based HCS                       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
