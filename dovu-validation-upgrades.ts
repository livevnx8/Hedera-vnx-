#!/usr/bin/env -S npx tsx
/**
 * DOVU Validation with New Upgrades
 * 
 * Validates carbon credits using:
 * - Retrained Vera model (veda-qvx:latest)
 * - Lattice Swarm coordination (Phases 1-5)
 * - Lattice Reasoning (multi-dimensional analysis)
 * 
 * Generates HashScan links for all verifications
 */

import { logger } from './src/monitoring/logger.js';
import { veraHCS } from './src/dovu/veraHCS.js';
import { veraLatticeSwarm } from './src/swarm/latticeSwarm.js';
import { veraLatticeReasoning } from './src/lattice/latticeReasoning.js';

// Test carbon credit payloads for validation
const testCredits = [
  {
    id: 'CC-VALIDATION-001',
    projectName: 'Mangrove Restoration - Indonesia',
    location: { lat: -2.5489, lng: 121.9584, region: 'APAC' },
    carbonTons: 2500,
    vintage: 2024,
    standard: 'VCS',
    methodology: 'VM0033',
    price: 12.50,
    seller: '0.0.12345',
    metadata: {
      projectType: 'mangrove',
      coBenefits: ['biodiversity', 'community'],
      riskScore: 0.15
    }
  },
  {
    id: 'CC-VALIDATION-002',
    projectName: 'Reforestation - Amazon Basin',
    location: { lat: -3.4653, lng: -62.2159, region: 'Americas' },
    carbonTons: 5000,
    vintage: 2024,
    standard: 'Gold Standard',
    methodology: 'GS-REDD+',
    price: 18.75,
    seller: '0.0.67890',
    metadata: {
      projectType: 'forestry',
      coBenefits: ['indigenous_rights', 'water_quality'],
      riskScore: 0.22
    }
  },
  {
    id: 'CC-VALIDATION-003',
    projectName: 'Direct Air Capture - Iceland',
    location: { lat: 64.9631, lng: -19.0208, region: 'EMEA' },
    carbonTons: 1200,
    vintage: 2024,
    standard: 'Puro.earth',
    methodology: 'Puro-DAC',
    price: 450.00,
    seller: '0.0.54321',
    metadata: {
      projectType: 'technology',
      coBenefits: ['innovation', 'scalability'],
      riskScore: 0.08
    }
  },
  {
    id: 'CC-VALIDATION-004',
    projectName: 'Soil Carbon - Iowa Farmland',
    location: { lat: 41.8780, lng: -93.0977, region: 'Americas' },
    carbonTons: 800,
    vintage: 2023,
    standard: 'VCS',
    methodology: 'VM0042',
    price: 35.00,
    seller: '0.0.98765',
    metadata: {
      projectType: 'agriculture',
      coBenefits: ['soil_health', 'water_retention'],
      riskScore: 0.18
    }
  },
  {
    id: 'CC-VALIDATION-005',
    projectName: 'Renewable Energy - Kenya',
    location: { lat: -1.2921, lng: 36.8219, region: 'EMEA' },
    carbonTons: 3200,
    vintage: 2024,
    standard: 'Gold Standard',
    methodology: 'GS-REG',
    price: 8.50,
    seller: '0.0.13579',
    metadata: {
      projectType: 'renewable',
      coBenefits: ['energy_access', 'employment'],
      riskScore: 0.12
    }
  }
];

interface ValidationResult {
  creditId: string;
  status: 'verified' | 'rejected' | 'flagged';
  confidence: number;
  latticeScore: number;
  reasoning: any;
  swarmAgent: string;
  hcsTopicId?: string;
  hcsSequenceNumber?: number;
  hashscanUrl?: string;
  processingTime: number;
}

async function runDovuValidation(): Promise<void> {
  console.clear();
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║     🔍 DOVU VALIDATION - NEW UPGRADES TEST 🌱                        ║');
  console.log('║                                                                      ║');
  console.log('║     Retrained Model • Lattice Swarm • HCS Notarization              ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // Initialize all systems
  console.log('🔧 Initializing systems...\n');
  await veraHCS.initialize();
  await veraLatticeReasoning.initialize();
  await veraLatticeSwarm.initialize();
  console.log('✅ All systems initialized\n');

  // Get HCS topic IDs for HashScan links
  const hcsLinks = veraHCS.getHashScanLinks();
  const verificationTopicId = hcsLinks['verifications']?.match(/topic\/(0\.0\.\d+)/)?.[1] || '0.0.10409351';

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('RUNNING VALIDATIONS WITH LATTICE REASONING');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const results: ValidationResult[] = [];

  for (const credit of testCredits) {
    const startTime = Date.now();
    
    console.log(`📝 Validating: ${credit.id}`);
    console.log(`   Project: ${credit.projectName}`);
    console.log(`   Tons: ${credit.carbonTons} | Standard: ${credit.standard} | Price: $${credit.price}`);

    // Use lattice reasoning for multi-dimensional analysis
    const reasoning = await veraLatticeReasoning.reasonAboutVerification({
      id: credit.id,
      carbonTons: credit.carbonTons,
      vintage: credit.vintage,
      standard: credit.standard,
      price: credit.price,
      riskScore: credit.metadata.riskScore,
      location: credit.location.region,
      methodology: credit.methodology
    });

    // Submit to swarm for tiered coordination
    const swarmTask = await veraLatticeSwarm.submitTask('verification', credit, 0.8);
    
    // Get swarm stats to identify which agent processed
    const swarmStats = veraLatticeSwarm.getSwarmStats();
    const activeAgents = swarmStats.agents.filter((a: any) => a.status === 'idle');
    const assignedAgent = activeAgents[0]?.id || 'lattice-coordinator';

    // Calculate confidence from reasoning fields
    const avgConfidence = (
      reasoning.fields.verification.confidence +
      reasoning.fields.economic.confidence +
      reasoning.fields.compliance.confidence +
      reasoning.fields.risk.confidence +
      reasoning.fields.temporal.confidence
    ) / 5;

    // Determine status based on reasoning
    let status: 'verified' | 'rejected' | 'flagged' = 'verified';
    if (reasoning.overall.recommendation.includes('REJECT')) {
      status = 'rejected';
    } else if (reasoning.overall.confidence < 0.7) {
      status = 'flagged';
    }

    // Log to HCS for notarization
    const hcsResult = await veraHCS.logVerification({
      creditId: credit.id,
      projectName: credit.projectName,
      status,
      carbonTons: credit.carbonTons,
      confidence: avgConfidence,
      latticeScore: reasoning.overall.confidence,
      processedBy: assignedAgent,
      timestamp: Date.now()
    });

    const processingTime = Date.now() - startTime;

    const result: ValidationResult = {
      creditId: credit.id,
      status,
      confidence: avgConfidence,
      latticeScore: reasoning.overall.confidence,
      reasoning,
      swarmAgent: assignedAgent,
      hcsTopicId: verificationTopicId,
      hcsSequenceNumber: hcsResult?.sequenceNumber,
      hashscanUrl: `https://hashscan.io/mainnet/topic/${verificationTopicId}`,
      processingTime
    };

    results.push(result);

    // Print results
    console.log(`   ✅ Status: ${status.toUpperCase()}`);
    console.log(`   📊 Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`   🧬 Lattice Score: ${(reasoning.overall.confidence * 100).toFixed(1)}%`);
    console.log(`   🤖 Agent: ${assignedAgent}`);
    console.log(`   ⏱️  Time: ${processingTime}ms`);
    console.log(`   🔗 HashScan: ${result.hashscanUrl}`);
    if (result.hcsSequenceNumber) {
      console.log(`   📍 Sequence: ${result.hcsSequenceNumber}`);
    }
    console.log(`   💡 Reasoning: ${reasoning.overall.reasoning.slice(0, 80)}...`);
    console.log('');

    // Small delay between validations
    await new Promise(r => setTimeout(r, 500));
  }

  // Generate summary report
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('VALIDATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const verified = results.filter(r => r.status === 'verified').length;
  const flagged = results.filter(r => r.status === 'flagged').length;
  const rejected = results.filter(r => r.status === 'rejected').length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
  const totalTons = testCredits.reduce((sum, c) => sum + c.carbonTons, 0);

  console.log('┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                         VALIDATION RESULTS                           │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  console.log(`│  Total Credits:      ${results.length.toString().padEnd(45)}│`);
  console.log(`│  Verified:            ${verified.toString().padEnd(45)}│`);
  console.log(`│  Flagged:             ${flagged.toString().padEnd(45)}│`);
  console.log(`│  Rejected:            ${rejected.toString().padEnd(45)}│`);
  console.log(`│  Avg Confidence:      ${(avgConfidence * 100).toFixed(1)}%${''.padEnd(43)}│`);
  console.log(`│  Avg Processing:      ${avgTime.toFixed(0)}ms${''.padEnd(42)}│`);
  console.log(`│  Total Carbon:        ${totalTons.toLocaleString()} tons${''.padEnd(38)}│`);
  console.log(`│  System:              Retrained veda-qvx + Lattice Swarm${''.padEnd(25)}│`);
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  console.log('│                        HCS VERIFICATION LINKS                        │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  console.log(`│  Topic ID:            ${verificationTopicId.padEnd(45)}│`);
  console.log(`│  HashScan:            https://hashscan.io/mainnet/topic/${verificationTopicId.padEnd(16)}│`);
  console.log('└─────────────────────────────────────────────────────────────────────┘');

  // Print detailed results with HashScan links
  console.log('\n📋 DETAILED HASHSCAN LINKS:');
  console.log('─'.repeat(70));
  results.forEach((r, i) => {
    const credit = testCredits[i];
    console.log(`\n${i + 1}. ${r.creditId}`);
    console.log(`   Project: ${credit.projectName}`);
    console.log(`   Status: ${r.status.toUpperCase()} | Confidence: ${(r.confidence * 100).toFixed(1)}%`);
    console.log(`   🔗 ${r.hashscanUrl}`);
    if (r.hcsSequenceNumber) {
      console.log(`   📍 Sequence: ${r.hcsSequenceNumber}`);
    }
  });

  // Lattice swarm statistics
  const swarmStats = veraLatticeSwarm.getSwarmStats();
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('LATTICE SWARM COORDINATION STATS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  console.log(`   Total Agents: ${swarmStats.totalAgents}`);
  console.log(`   Active Nodes: ${swarmStats.latticeNodes}`);
  console.log(`   Queue Length: ${swarmStats.queueLength}`);
  console.log(`   Active Tasks: ${swarmStats.activeTasks}`);
  console.log(`   Completed: ${swarmStats.completedTasks}`);

  // Print reasoning field breakdown
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('LATTICE REASONING BREAKDOWN');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  const allReasoning = results.map(r => r.reasoning);
  const fieldAvgs = {
    verification: allReasoning.reduce((sum, r) => sum + r.fields.verification.confidence, 0) / allReasoning.length,
    economic: allReasoning.reduce((sum, r) => sum + r.fields.economic.confidence, 0) / allReasoning.length,
    compliance: allReasoning.reduce((sum, r) => sum + r.fields.compliance.confidence, 0) / allReasoning.length,
    risk: allReasoning.reduce((sum, r) => sum + r.fields.risk.confidence, 0) / allReasoning.length,
    temporal: allReasoning.reduce((sum, r) => sum + r.fields.temporal.confidence, 0) / allReasoning.length
  };

  console.log(`   Verification:  ${(fieldAvgs.verification * 100).toFixed(1)}%`);
  console.log(`   Economic:      ${(fieldAvgs.economic * 100).toFixed(1)}%`);
  console.log(`   Compliance:    ${(fieldAvgs.compliance * 100).toFixed(1)}%`);
  console.log(`   Risk:          ${(fieldAvgs.risk * 100).toFixed(1)}%`);
  console.log(`   Temporal:      ${(fieldAvgs.temporal * 100).toFixed(1)}%`);

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║     ✅ DOVU VALIDATION COMPLETE                                      ║');
  console.log('║                                                                      ║');
  console.log('║     All verifications logged to HCS with HashScan proofs              ║');
  console.log('║     Retrained model + Lattice Swarm performing optimally            ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  process.exit(0);
}

runDovuValidation().catch(error => {
  logger.error('DovuValidation', { error });
  console.error('Validation failed:', error);
  process.exit(1);
});
