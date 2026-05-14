#!/usr/bin/env node
/**
 * Quick report of what the lattice findings logger has discovered
 */

import { latticeFindingsLogger } from './dist/agent/index.js';

console.log('📊 LATTICE FINDINGS REPORT\n');

// Get current status
const status = latticeFindingsLogger.getStatus();
console.log('Status:');
console.log(`  Pending Findings: ${status.pendingFindings}`);
console.log(`  Total Findings: ${status.totalFindings}`);
console.log(`  Total References: ${status.totalReferences}`);
console.log(`  Submission Active: ${status.periodicSubmissionActive}`);
console.log();

// Query all findings
const allFindings = latticeFindingsLogger.queryFindings({});
console.log(`All Findings (${allFindings.length}):`);
allFindings.slice(0, 10).forEach(f => {
  console.log(`  [${f.type.toUpperCase()}] ${f.summary.substring(0, 60)}... (importance: ${f.importance})`);
});
console.log();

// Query by category
const categories = ['tool_test', 'optimization', 'system', 'workflow', 'health'];
categories.forEach(cat => {
  const catFindings = latticeFindingsLogger.queryFindings({ category: cat });
  if (catFindings.length > 0) {
    console.log(`${cat.toUpperCase()} Findings (${catFindings.length}):`);
    catFindings.slice(0, 3).forEach(f => {
      console.log(`  - ${f.summary.substring(0, 50)}...`);
    });
    console.log();
  }
});

// Tool performance metrics
console.log('Tool Performance Metrics:');
for (const [tool, metrics] of latticeFindingsLogger.toolPerformanceMetrics || []) {
  const rate = metrics.totalCalls > 0 ? (metrics.successfulCalls / metrics.totalCalls * 100).toFixed(1) : 0;
  console.log(`  ${tool}: ${rate}% success (${metrics.successfulCalls}/${metrics.totalCalls}), avg ${Math.round(metrics.avgDuration)}ms`);
}
console.log();

// Optimization insights
const insights = latticeFindingsLogger.getToolOptimizationInsights ? latticeFindingsLogger.getToolOptimizationInsights() : [];
if (insights.length > 0) {
  console.log('🚨 Optimization Opportunities:');
  insights.forEach(i => {
    console.log(`  - ${i.toolName}: ${i.issue} (${i.severity})`);
    console.log(`    Recommendation: ${i.recommendation}`);
  });
} else {
  console.log('✅ No optimization issues detected');
}

// Latest reference
const latestRef = latticeFindingsLogger.getLatestReference();
if (latestRef) {
  console.log();
  console.log('Latest HCS Reference:');
  console.log(`  Sequence: ${latestRef.hcsSequenceNumber}`);
  console.log(`  URL: https://hashscan.io/mainnet/topic/${latestRef.hcsTopicId}/${latestRef.hcsSequenceNumber}`);
}
