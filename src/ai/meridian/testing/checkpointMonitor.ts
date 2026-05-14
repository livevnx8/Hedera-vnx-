/**
 * Checkpoint Monitor
 *
 * Watches training directory for new checkpoints and auto-triggers validation.
 * Integrates with Slack notifications for results.
 */

import { watch, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { validationHarness, type ValidationReport } from './validationHarness.js';
import { slackNotifier } from '../../../vera/notifications/slackNotifier.js';
import { config } from '../../../config.js';

export interface CheckpointEvent {
  path: string;
  epoch: number;
  timestamp: number;
  loss?: number;
  evalLoss?: number;
}

export interface MonitorConfig {
  checkpointDir: string;
  watchPattern: RegExp;
  autoValidate: boolean;
  minEpoch: number;
  notifySlack: boolean;
  saveHtmlReports: boolean;
  reportsDir: string;
  validationSampleSize?: number;
}

const DEFAULT_CONFIG: MonitorConfig = {
  checkpointDir: 'models/meridian/checkpoints/medium-compact-gpt2-v1',
  watchPattern: /epoch-(\d+)\.pt$/,
  autoValidate: true,
  minEpoch: 1,
  notifySlack: true,
  saveHtmlReports: true,
  reportsDir: 'reports/checkpoint-validations',
  validationSampleSize: 50, // Run 50 tests per checkpoint (faster)
};

export class CheckpointMonitor {
  private config: MonitorConfig;
  private watchedPaths = new Set<string>();
  private isRunning = false;
  private watcher: ReturnType<typeof watch> | null = null;
  private lastValidatedEpoch = 0;

  constructor(config: Partial<MonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure directories exist
    if (!existsSync(this.config.checkpointDir)) {
      mkdirSync(this.config.checkpointDir, { recursive: true });
    }
    if (!existsSync(this.config.reportsDir)) {
      mkdirSync(this.config.reportsDir, { recursive: true });
    }

    console.log(`👁️  Checkpoint monitor configured:`);
    console.log(`   Directory: ${this.config.checkpointDir}`);
    console.log(`   Auto-validate: ${this.config.autoValidate}`);
    console.log(`   Slack notify: ${this.config.notifySlack}`);
  }

  /**
   * Start monitoring for checkpoints
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Checkpoint monitor already running');
      return;
    }

    console.log(`👁️  Starting checkpoint monitor on ${this.config.checkpointDir}`);

    // Check for existing checkpoints first
    this.scanExistingCheckpoints();

    // Set up file watcher
    this.watcher = watch(
      this.config.checkpointDir,
      { recursive: true },
      (eventType, filename) => {
        if (filename && this.config.watchPattern.test(filename)) {
          console.log(`📁 Checkpoint detected: ${filename}`);

          const fullPath = join(this.config.checkpointDir, filename);
          const epoch = this.extractEpoch(filename);

          if (epoch >= this.config.minEpoch && epoch > this.lastValidatedEpoch) {
            const checkpointEvent: CheckpointEvent = {
              path: fullPath,
              epoch,
              timestamp: Date.now(),
            };

            this.handleCheckpoint(checkpointEvent);
          }
        }
      }
    );

    this.isRunning = true;
    console.log('✅ Checkpoint monitor active');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.isRunning = false;
    console.log('🛑 Checkpoint monitor stopped');
  }

  /**
   * Scan for existing checkpoints on startup
   */
  private scanExistingCheckpoints(): void {
    console.log('🔍 Scanning for existing checkpoints...');

    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(this.config.checkpointDir);

      const checkpoints = files
        .filter((f: string) => this.config.watchPattern.test(f))
        .map((f: string) => ({
          filename: f,
          epoch: this.extractEpoch(f),
          path: join(this.config.checkpointDir, f),
        }))
        .sort((a: {epoch: number}, b: {epoch: number}) => a.epoch - b.epoch);

      if (checkpoints.length > 0) {
        console.log(`   Found ${checkpoints.length} existing checkpoints`);
        const latest = checkpoints[checkpoints.length - 1];
        this.lastValidatedEpoch = latest.epoch;
        console.log(`   Latest: epoch-${latest.epoch}`);
      }
    } catch (error) {
      console.error('Error scanning checkpoints:', error);
    }
  }

  /**
   * Handle new checkpoint event
   */
  private async handleCheckpoint(event: CheckpointEvent): Promise<void> {
    console.log(`\n🎯 Processing checkpoint: ${basename(event.path)}`);
    console.log(`   Epoch: ${event.epoch}`);
    console.log(`   Time: ${new Date(event.timestamp).toISOString()}`);

    if (!this.config.autoValidate) {
      console.log('   Auto-validation disabled, skipping');
      return;
    }

    // Validate the checkpoint
    try {
      const report = await this.validateCheckpoint(event);
      await this.processReport(event, report);
    } catch (error) {
      console.error(`❌ Validation failed for epoch ${event.epoch}:`, error);
      await this.notifyFailure(event, error as Error);
    }
  }

  /**
   * Run validation on checkpoint
   */
  private async validateCheckpoint(event: CheckpointEvent): Promise<ValidationReport> {
    console.log('   Running validation suite...');

    const report = await validationHarness.validateCheckpoint(
      event.path,
      {
        sampleSize: this.config.validationSampleSize,
      }
    );

    this.lastValidatedEpoch = event.epoch;
    return report;
  }

  /**
   * Process validation report
   */
  private async processReport(event: CheckpointEvent, report: ValidationReport): Promise<void> {
    // Save HTML report
    if (this.config.saveHtmlReports) {
      const html = validationHarness.exportHtmlReport(report);
      const reportPath = join(
        this.config.reportsDir,
        `checkpoint-epoch-${event.epoch}-${Date.now()}.html`
      );

      const { writeFileSync } = require('fs');
      writeFileSync(reportPath, html);
      console.log(`   📄 Report saved: ${reportPath}`);
    }

    // Slack notification
    if (this.config.notifySlack && slackNotifier.isEnabled()) {
      await this.notifySlack(event, report);
    }

    // Console summary
    console.log(`\n✅ Epoch ${event.epoch} validation complete:`);
    console.log(`   Score: ${report.overallScore.toFixed(1)}%`);
    console.log(`   Status: ${report.productionReady ? '🟢 PRODUCTION READY' : '🟡 NEEDS IMPROVEMENT'}`);
    console.log(`   Passed: ${report.passedTests}/${report.totalTests}`);
  }

  /**
   * Send Slack notification
   */
  private async notifySlack(event: CheckpointEvent, report: ValidationReport): Promise<void> {
    const level = report.productionReady ? 'success' : report.overallScore >= 60 ? 'warning' : 'error';
    const emoji = report.productionReady ? '🎉' : report.overallScore >= 60 ? '⚠️' : '❌';

    await slackNotifier.send({
      level,
      title: `${emoji} Checkpoint Validation: Epoch ${event.epoch}`,
      message: report.productionReady
        ? `Model passed validation with ${report.overallScore.toFixed(1)}% score!`
        : `Model needs improvement (${report.overallScore.toFixed(1)}% score)`,
      metadata: {
        'Epoch': event.epoch.toString(),
        'Overall Score': `${report.overallScore.toFixed(1)}%`,
        'JSON Validity': `${report.categoryScores.json_validity?.toFixed(1) || 0}%`,
        'Tool Accuracy': `${report.categoryScores.tool_accuracy?.toFixed(1) || 0}%`,
        'Hedera Knowledge': `${report.categoryScores.hedera_knowledge?.toFixed(1) || 0}%`,
        'Safety': `${report.categoryScores.safety?.toFixed(1) || 0}%`,
        'Production Ready': report.productionReady ? 'YES ✓' : 'NO ✗',
        'Report Path': `${this.config.reportsDir}/checkpoint-epoch-${event.epoch}-*.html`,
      },
      timestamp: new Date().toISOString(),
      footer: 'Vera Checkpoint Monitor',
    });
  }

  /**
   * Notify about validation failure
   */
  private async notifyFailure(event: CheckpointEvent, error: Error): Promise<void> {
    if (this.config.notifySlack && slackNotifier.isEnabled()) {
      await slackNotifier.send({
        level: 'error',
        title: `❌ Checkpoint Validation Failed: Epoch ${event.epoch}`,
        message: `Validation failed with error: ${error.message}`,
        metadata: {
          'Epoch': event.epoch.toString(),
          'Error': error.message,
          'Checkpoint': event.path,
        },
        timestamp: new Date().toISOString(),
        footer: 'Vera Checkpoint Monitor',
      });
    }
  }

  /**
   * Extract epoch number from filename
   */
  private extractEpoch(filename: string): number {
    const match = filename.match(/epoch-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get monitor status
   */
  getStatus(): {
    isRunning: boolean;
    watchedPath: string;
    lastValidatedEpoch: number;
    config: MonitorConfig;
  } {
    return {
      isRunning: this.isRunning,
      watchedPath: this.config.checkpointDir,
      lastValidatedEpoch: this.lastValidatedEpoch,
      config: this.config,
    };
  }

  /**
   * Manually trigger validation for a checkpoint
   */
  async validateNow(checkpointPath: string): Promise<ValidationReport> {
    const epoch = this.extractEpoch(basename(checkpointPath));

    const event: CheckpointEvent = {
      path: checkpointPath,
      epoch,
      timestamp: Date.now(),
    };

    return this.validateCheckpoint(event);
  }
}

// Global monitor instance
export const checkpointMonitor = new CheckpointMonitor();

// Auto-start if configured
if (config.MERIDIAN_AUTO_MONITOR !== 'false') {
  checkpointMonitor.start();
}
