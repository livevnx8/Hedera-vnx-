#!/usr/bin/env tsx
/**
 * SLA Monitoring Script
 * Checks compliance and reports violations
 */

import { EnterpriseServiceManager } from '../src/vera/enterprise/serviceManager.js';

console.log('📊 Checking SLA Compliance...\n');

async function checkSLA() {
  const enterprise = new EnterpriseServiceManager();
  await enterprise.initialize();

  const dashboard = enterprise.getDashboard();

  console.log('SLA Status by Tier:');
  console.log('===================\n');

  for (const tier of dashboard.sla) {
    const emoji = tier.compliance === 'compliant' ? '✅' : tier.compliance === 'at-risk' ? '⚠️' : '❌';
    console.log(`${emoji} ${tier.tier.toUpperCase()}`);
    console.log(`   Compliance: ${tier.compliance}`);
    console.log(`   Uptime: ${(tier.metrics.uptimePercent * 100).toFixed(2)}%`);
    console.log(`   Latency (avg): ${tier.metrics.avgLatencyMs.toFixed(0)}ms`);
    console.log(`   Latency (p99): ${tier.metrics.p99LatencyMs.toFixed(0)}ms`);
    console.log(`   Error Rate: ${(tier.metrics.errorRate * 100).toFixed(3)}%`);
    console.log(`   Violations (24h): ${tier.recentViolations}`);
    console.log();
  }

  // Check overall health
  const allCompliant = dashboard.sla.every(t => t.compliance === 'compliant');
  
  if (allCompliant) {
    console.log('✅ All tiers meeting SLA commitments');
    process.exit(0);
  } else {
    console.log('⚠️  SLA violations detected - review dashboard');
    process.exit(1);
  }
}

checkSLA().catch(error => {
  console.error('❌ SLA check failed:', error);
  process.exit(1);
});
