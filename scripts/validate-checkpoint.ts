#!/usr/bin/env tsx
/**
 * Checkpoint Validation Script
 *
 * Usage:
 *   npx tsx scripts/validate-checkpoint.ts [checkpoint-path]
 *
 * If no path provided, uses latest checkpoint from training directory
 * Auto-triggers when checkpoint saves during training
 */

import { validationHarness } from '../src/ai/meridian/testing/validationHarness.js';
import { slackNotifier } from '../src/vera/notifications/slackNotifier.js';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const CHECKPOINT_DIR = 'models/meridian/checkpoints/medium-compact-gpt2-v1';
const REPORTS_DIR = 'reports/checkpoint-validations';

interface CheckpointInfo {
  path: string;
  epoch: number;
  size: number;
  modified: Date;
}

/**
 * Find the latest checkpoint
 */
function findLatestCheckpoint(): CheckpointInfo | null {
  if (!existsSync(CHECKPOINT_DIR)) {
    console.error(`❌ Checkpoint directory not found: ${CHECKPOINT_DIR}`);
    return null;
  }

  const files = readdirSync(CHECKPOINT_DIR);
  const checkpoints = files
    .filter(f => f.endsWith('.pt') || f.match(/epoch-\d+/))
    .map(f => {
      const path = join(CHECKPOINT_DIR, f);
      const stats = statSync(path);
      const epochMatch = f.match(/epoch-(\d+)/);
      return {
        path,
        epoch: epochMatch ? parseInt(epochMatch[1], 10) : 0,
        size: stats.size,
        modified: stats.mtime,
      };
    })
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());

  return checkpoints[0] || null;
}

/**
 * Validate a specific checkpoint
 */
async function validateCheckpoint(checkpointPath: string, epoch: number): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🧪 MERIDIAN CHECKPOINT VALIDATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\nCheckpoint: ${checkpointPath}`);
  console.log(`Epoch: ${epoch}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('\n⏳ Running validation suite...\n');

  const startTime = Date.now();

  try {
    // Run validation
    const report = await validationHarness.validateCheckpoint(checkpointPath, {
      sampleSize: 100, // Full validation
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Generate HTML report
    const html = validationHarness.exportHtmlReport(report);
    const reportPath = join(REPORTS_DIR, `checkpoint-epoch-${epoch}-${Date.now()}.html`);

    // Save report
    if (!existsSync(REPORTS_DIR)) {
      mkdirSync(REPORTS_DIR, { recursive: true });
    }
    writeFileSync(reportPath, html);

    // Console output
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ VALIDATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\nDuration: ${duration}s`);
    console.log(`Overall Score: ${report.overallScore.toFixed(1)}%`);
    console.log(`Status: ${report.productionReady ? '🟢 PRODUCTION READY' : '🟡 NEEDS IMPROVEMENT'}`);
    console.log(`\nPassed: ${report.passedTests}/${report.totalTests} tests`);

    console.log('\nCategory Scores:');
    Object.entries(report.categoryScores).forEach(([cat, score]) => {
      const status = score >= 75 ? '✓' : score >= 60 ? '⚠' : '✗';
      console.log(`  ${status} ${cat.replace('_', ' ').toUpperCase()}: ${score.toFixed(1)}%`);
    });

    if (report.recommendations.length > 0) {
      console.log('\nRecommendations:');
      report.recommendations.forEach(r => console.log(`  • ${r}`));
    }

    console.log(`\n📄 Report saved: ${resolve(reportPath)}`);

    // Slack notification
    if (slackNotifier.isEnabled()) {
      console.log('\n📤 Sending Slack notification...');
      await slackNotifier.send({
        level: report.productionReady ? 'success' : report.overallScore >= 60 ? 'warning' : 'error',
        title: `${report.productionReady ? '🎉' : '⚠️'} Checkpoint Validation: Epoch ${epoch}`,
        message: report.productionReady
          ? `Model passed validation with ${report.overallScore.toFixed(1)}% score! Production ready.`
          : `Model scored ${report.overallScore.toFixed(1)}%. ${report.recommendations[0] || 'Review needed.'}`,
        metadata: {
          'Epoch': epoch.toString(),
          'Duration': `${duration}s`,
          'Overall Score': `${report.overallScore.toFixed(1)}%`,
          'JSON Validity': `${report.categoryScores.json_validity?.toFixed(1) || 0}%`,
          'Tool Accuracy': `${report.categoryScores.tool_accuracy?.toFixed(1) || 0}%`,
          'Hedera Knowledge': `${report.categoryScores.hedera_knowledge?.toFixed(1) || 0}%`,
          'Safety': `${report.categoryScores.safety?.toFixed(1) || 0}%`,
          'Production Ready': report.productionReady ? 'YES ✅' : 'NO ❌',
          'Report': reportPath,
        },
        timestamp: new Date().toISOString(),
        footer: 'Vera Meridian Validation',
      });
      console.log('✅ Slack notification sent');
    } else {
      console.log('\n⚠️  Slack notifications disabled (no webhook configured)');
    }

    // Exit with appropriate code
    process.exit(report.productionReady ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Validation failed:', error);

    // Notify about failure
    if (slackNotifier.isEnabled()) {
      await slackNotifier.send({
        level: 'error',
        title: `❌ Validation Failed: Epoch ${epoch}`,
        message: `Checkpoint validation failed: ${(error as Error).message}`,
        metadata: {
          'Epoch': epoch.toString(),
          'Error': (error as Error).message,
          'Checkpoint': checkpointPath,
        },
        timestamp: new Date().toISOString(),
        footer: 'Vera Meridian Validation',
      });
    }

    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  let checkpointPath = args[0];
  let epoch = 0;

  // If no path provided, find latest checkpoint
  if (!checkpointPath) {
    console.log('🔍 No checkpoint path provided, searching for latest...');
    const latest = findLatestCheckpoint();

    if (!latest) {
      console.error('❌ No checkpoints found in:', CHECKPOINT_DIR);
      console.log('\nTraining may still be in progress.');
      console.log('Current training status:');

      // Show training process status
      const { execSync } = require('child_process');
      try {
        const status = execSync('ps aux | grep train_large_gpt2 | grep -v grep', { encoding: 'utf8' });
        console.log(status);
      } catch {
        console.log('No active training process found.');
      }

      process.exit(1);
    }

    checkpointPath = latest.path;
    epoch = latest.epoch;
    console.log(`✅ Found checkpoint: epoch-${epoch}`);
    console.log(`   Path: ${checkpointPath}`);
    console.log(`   Size: ${(latest.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`   Modified: ${latest.modified.toISOString()}\n`);
  } else {
    // Extract epoch from path
    const epochMatch = checkpointPath.match(/epoch-(\d+)/);
    epoch = epochMatch ? parseInt(epochMatch[1], 10) : 0;
  }

  // Validate the checkpoint
  await validateCheckpoint(checkpointPath, epoch);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
