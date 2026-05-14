#!/usr/bin/env node
/**
 * Vera Phase 2 - Complete Agent Swarm Deployment
 * Deploys 30 new specialized agents across 5 verticals
 */

import {
  HospitalMonitorAgent,
  MedicalSupplyTrackerAgent,
  PatientFlowOptimizerAgent,
  ClinicalTrialCoordinatorAgent,
  HealthDataAnalyticsAgent
} from './vera-healthcare-agents.mjs';

import {
  PortfolioManagerAgent,
  RiskAssessmentAgent,
  ComplianceMonitorAgent,
  FraudDetectionAgent,
  TradingAlgorithmAgent,
  CreditAnalysisAgent,
  TreasuryManagementAgent,
  InsuranceUnderwritingAgent
} from './vera-finance-agents.mjs';

import {
  FleetManagerAgent,
  WarehouseOptimizerAgent,
  SupplyChainCoordinatorAgent,
  LastMileDeliveryAgent,
  InventoryForecastingAgent,
  ColdChainMonitorAgent
} from './vera-logistics-agents.mjs';

import {
  PublicRecordsManagerAgent,
  ProcurementComplianceAgent,
  CitizenServiceMonitorAgent,
  InfrastructureMonitorAgent
} from './vera-government-agents.mjs';

import {
  StoreOperationsManagerAgent,
  InventoryReplenishmentAgent,
  CustomerExperienceAgent,
  PricingOptimizationAgent,
  EcommerceMonitorAgent,
  VisualMerchandisingAgent,
  LossPreventionAgent
} from './vera-retail-agents.mjs';

import dotenv from 'dotenv';
dotenv.config();

class Phase2SwarmDeployment {
  constructor() {
    this.agents = new Map();
    this.startTime = Date.now();
    this.stats = {
      deployed: 0,
      failed: 0,
      running: 0
    };
  }

  async deployAll() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🚀 VERA PHASE 2 - AGENT SWARM DEPLOYMENT                      ║
║  30 New Specialized Agents Across 5 Verticals                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Healthcare: 5 agents | Finance: 8 agents                    ║
║  Logistics: 6 agents | Government: 4 agents                  ║
║  Retail: 7 agents                                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    // Deploy Healthcare (5 agents)
    await this.deployVertical('Healthcare', [
      new HospitalMonitorAgent(),
      new MedicalSupplyTrackerAgent(),
      new PatientFlowOptimizerAgent(),
      new ClinicalTrialCoordinatorAgent(),
      new HealthDataAnalyticsAgent()
    ]);

    // Deploy Finance (8 agents)
    await this.deployVertical('Finance', [
      new PortfolioManagerAgent(),
      new RiskAssessmentAgent(),
      new ComplianceMonitorAgent(),
      new FraudDetectionAgent(),
      new TradingAlgorithmAgent(),
      new CreditAnalysisAgent(),
      new TreasuryManagementAgent(),
      new InsuranceUnderwritingAgent()
    ]);

    // Deploy Logistics (6 agents)
    await this.deployVertical('Logistics', [
      new FleetManagerAgent(),
      new WarehouseOptimizerAgent(),
      new SupplyChainCoordinatorAgent(),
      new LastMileDeliveryAgent(),
      new InventoryForecastingAgent(),
      new ColdChainMonitorAgent()
    ]);

    // Deploy Government (4 agents)
    await this.deployVertical('Government', [
      new PublicRecordsManagerAgent(),
      new ProcurementComplianceAgent(),
      new CitizenServiceMonitorAgent(),
      new InfrastructureMonitorAgent()
    ]);

    // Deploy Retail (7 agents)
    await this.deployVertical('Retail', [
      new StoreOperationsManagerAgent(),
      new InventoryReplenishmentAgent(),
      new CustomerExperienceAgent(),
      new PricingOptimizationAgent(),
      new EcommerceMonitorAgent(),
      new VisualMerchandisingAgent(),
      new LossPreventionAgent()
    ]);

    this.printFinalStats();
  }

  async deployVertical(verticalName, agents) {
    console.log(`\n📦 Deploying ${verticalName} (${agents.length} agents)...`);
    console.log('━'.repeat(50));

    for (const agent of agents) {
      try {
        await agent.initialize();
        await agent.run();
        
        this.agents.set(agent.id, {
          agent,
          vertical: verticalName,
          status: 'running',
          deployedAt: Date.now()
        });
        
        this.stats.deployed++;
        this.stats.running++;
        console.log(`  ✅ ${agent.id} (${agent.type})`);
      } catch (error) {
        this.stats.failed++;
        console.error(`  ❌ ${agent.id}: ${error.message}`);
      }
    }
  }

  printFinalStats() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📊 PHASE 2 DEPLOYMENT COMPLETE                               ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Agents: 30                                             ║
║  Successfully Deployed: ${this.stats.deployed.toString().padEnd(27)} ║
║  Failed: ${this.stats.failed.toString().padEnd(36)} ║
║  Currently Running: ${this.stats.running.toString().padEnd(28)} ║
║  Deployment Time: ${duration}s${''.padEnd(33)} ║
╠═══════════════════════════════════════════════════════════════╣
║  Agent Breakdown:                                             ║
║  • Healthcare: 5 agents 🏥                                    ║
║  • Finance: 8 agents 💰                                        ║
║  • Logistics: 6 agents 🚛                                      ║
║  • Government: 4 agents 🏛️                                    ║
║  • Retail: 7 agents 🏪                                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Vera Swarm Status: 9 → 39 agents (333% growth)               ║
║  Next: Phase 3 - Cross-Chain Bridge Integration               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  getAgentStatus() {
    const status = [];
    for (const [id, info] of this.agents) {
      status.push({
        id,
        vertical: info.vertical,
        type: info.agent.type,
        status: info.status,
        uptime: Date.now() - info.deployedAt
      });
    }
    return status;
  }

  async shutdown() {
    console.log('\n🛑 Shutting down Phase 2 agents...');
    for (const [id, info] of this.agents) {
      if (info.agent.stop) {
        await info.agent.stop();
      }
    }
    console.log('✅ All agents stopped');
  }
}

// Run deployment
const deployment = new Phase2SwarmDeployment();

deployment.deployAll().catch(error => {
  console.error('Deployment failed:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await deployment.shutdown();
  process.exit(0);
});

export { Phase2SwarmDeployment };
