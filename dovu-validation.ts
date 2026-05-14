#!/usr/bin/env -S npx tsx
/**
 * DOVU Validation with New Upgrades - WORKING VERSION
 */

import { veraHCS } from './src/dovu/veraHCS.js';
import { veraLatticeReasoning } from './src/lattice/latticeReasoning.js';

const testCredits = [
  { id: 'CC-001', project: 'Mangrove Indonesia', tons: 2500, price: 12.50, standard: 'VCS', risk: 0.15 },
  { id: 'CC-002', project: 'Amazon Reforestation', tons: 5000, price: 18.75, standard: 'Gold Standard', risk: 0.22 },
  { id: 'CC-003', project: 'DAC Iceland', tons: 1200, price: 450.00, standard: 'Puro', risk: 0.08 },
  { id: 'CC-004', project: 'Soil Carbon Iowa', tons: 800, price: 35.00, standard: 'VCS', risk: 0.18 },
  { id: 'CC-005', project: 'Solar Kenya', tons: 3200, price: 8.50, standard: 'Gold Standard', risk: 0.12 }
];

async function runValidation() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🔍 DOVU VALIDATION - NEW UPGRADES                              ║');
  console.log('║     Retrained Model • Lattice Reasoning • HCS Notarization        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  await veraHCS.initialize();
  await veraLatticeReasoning.initialize();

  const hcsLinks = veraHCS.getHashScanLinks();
  const topicId = '0.0.10409351';

  console.log('Running validations...\n');

  const results = [];

  for (const credit of testCredits) {
    const start = Date.now();

    // Use lattice reasoning
    const reasoning = await veraLatticeReasoning.reasonAboutVerification({
      id: credit.id,
      carbonTons: credit.tons,
      price: credit.price,
      standard: credit.standard,
      riskScore: credit.risk,
      evidence: ['project_documentation', 'third_party_verification']
    });

    const status = reasoning.decision ? 'VERIFIED' : 'REJECTED';
    const confidence = reasoning.confidence;

    // Log to HCS
    await veraHCS.logVerification({
      id: credit.id,
      verified: reasoning.decision,
      confidence: confidence,
      carbonTons: credit.tons,
      duration: Date.now() - start,
      batchId: 'validation-batch-001'
    });

    const processingTime = Date.now() - start;

    results.push({
      credit,
      status,
      confidence,
      processingTime,
      reasoning: reasoning.reasoning.slice(0, 2)
    });

    console.log(`✅ ${credit.id}: ${status}`);
    console.log(`   Project: ${credit.project}`);
    console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
    console.log(`   Tons: ${credit.tons} | Price: $${credit.price}`);
    console.log(`   Time: ${processingTime}ms`);
    console.log(`   Reasoning: ${reasoning.reasoning[0]?.slice(0, 50)}...`);
    console.log('');
  }

  // Summary
  const verified = results.filter(r => r.status === 'VERIFIED').length;
  const avgConfidence = results.reduce((s, r) => s + r.confidence, 0) / results.length;
  const avgTime = results.reduce((s, r) => s + r.processingTime, 0) / results.length;
  const totalTons = testCredits.reduce((s, c) => s + c.tons, 0);

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('VALIDATION SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.log(`Total Credits: ${results.length}`);
  console.log(`Verified: ${verified} | Rejected: ${results.length - verified}`);
  console.log(`Avg Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(`Avg Processing: ${avgTime.toFixed(0)}ms`);
  console.log(`Total Carbon: ${totalTons.toLocaleString()} tons`);
  console.log(`\nHCS Topic: ${topicId}`);
  console.log(`HashScan: https://hashscan.io/mainnet/topic/${topicId}\n`);

  // Print detailed HashScan links
  console.log('📋 DETAILED LINKS:');
  console.log('─'.repeat(70));
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.credit.id} - ${r.status}`);
    console.log(`   🔗 https://hashscan.io/mainnet/topic/${topicId}`);
    console.log(`   Project: ${r.credit.project}`);
    console.log(`   Tons: ${r.credit.tons} | Confidence: ${(r.confidence * 100).toFixed(1)}%`);
    console.log('');
  });

  // Lattice stats
  const latticeStats = veraLatticeReasoning.getFieldStats();
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('LATTICE REASONING STATS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  Object.entries(latticeStats).forEach(([field, stats]) => {
    console.log(`${field}:`);
    console.log(`  Nodes: ${stats.totalNodes} | Collapsed: ${stats.collapsed} | Coherence: ${(stats.coherence * 100).toFixed(1)}%`);
  });

  console.log('\n✅ Validation complete - all results logged to HCS\n');
  process.exit(0);
}

runValidation().catch(console.error);
