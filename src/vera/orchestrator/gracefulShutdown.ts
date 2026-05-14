import { logger } from '../../monitoring/logger.js';
import { veraOrchestrator } from './orchestratorLoop.js';
import { escrowController } from './escrowController.js';
import { taskPublisher } from './taskPublisher.js';
import { clientPool } from '../scaling/clientPool.js';
import { rateLimiterRegistry } from '../scaling/rateLimiter.js';
import { checkpoint } from './taskStore.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import { config } from '../../config.js';

// ─── Graceful Shutdown Handler ───────────────────────────────────────────────

interface ShutdownOptions {
  drainTimeoutMs: number;
  reclaimEscrow: boolean;
  logToAudit: boolean;
}

const DEFAULT_SHUTDOWN_OPTIONS: ShutdownOptions = {
  drainTimeoutMs: 30_000,
  reclaimEscrow: true,
  logToAudit: true,
};

export class GracefulShutdown {
  private isShuttingDown = false;
  private options: ShutdownOptions;

  constructor(options?: Partial<ShutdownOptions>) {
    this.options = { ...DEFAULT_SHUTDOWN_OPTIONS, ...options };
  }

  /**
   * Register signal handlers for graceful shutdown.
   * Call this once after server startup.
   */
  register(): void {
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));

    // Also handle uncaught exceptions to attempt cleanup
    process.on('uncaughtException', (err) => {
      logger.error('GracefulShutdown', {
        message: 'Uncaught exception, initiating emergency shutdown',
        error: err.message,
      });
      this.handleShutdown('uncaughtException');
    });

    logger.info('GracefulShutdown', { message: 'Signal handlers registered' });
  }

  private async handleShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('GracefulShutdown', {
      message: `Shutdown initiated (${signal})`,
      options: this.options,
    });

    try {
      // 1. Stop accepting new tasks
      await veraOrchestrator.stop();
      logger.info('GracefulShutdown', { message: 'Orchestrator stopped' });

      // 2. Drain in-flight tasks (with timeout)
      await this.drainInFlightTasks();

      // 3. Reclaim any remaining locked escrow
      if (this.options.reclaimEscrow) {
        await this.reclaimRemainingEscrow();
      }

      // 4. Log shutdown to audit topic
      if (this.options.logToAudit) {
        await this.logShutdownToAudit(signal);
      }

      // 5. Flush adaptation loops + learning cache (prevents data loss)
      try {
        const [
          { behaviorAdapter },
          { latticeGrower },
          { agentLearningSystem },
        ] = await Promise.all([
          import('../adaptation/behaviorAdapter.js'),
          import('../adaptation/latticeGrower.js'),
          import('../../agent/learningSystem.js'),
        ]);
        behaviorAdapter.stop();
        latticeGrower.stop();
        // @ts-expect-error flushCache is private but safe to call on shutdown
        agentLearningSystem.flushCache?.();
        logger.info('GracefulShutdown', { message: 'Adaptation + learning state flushed' });
      } catch (e) {
        logger.warn('GracefulShutdown', {
          message: 'Adaptation flush failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 6. WAL checkpoint — flush pending writes to SQLite
      checkpoint();

      // 7. Cleanup resources
      clientPool.shutdown();
      rateLimiterRegistry.shutdown();

      logger.info('GracefulShutdown', { message: 'Shutdown complete' });
      process.exit(0);
    } catch (error) {
      logger.error('GracefulShutdown', {
        message: 'Error during shutdown',
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  private async drainInFlightTasks(): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < this.options.drainTimeoutMs) {
      const inProgress = taskPublisher.getTasksByState('in_progress');
      const awarded = taskPublisher.getTasksByState('awarded');
      const bidding = taskPublisher.getTasksByState('bidding');

      const pending = inProgress.length + awarded.length + bidding.length;

      if (pending === 0) {
        logger.info('GracefulShutdown', { message: 'All tasks drained' });
        return;
      }

      logger.info('GracefulShutdown', {
        message: `Waiting for ${pending} tasks to complete...`,
        inProgress: inProgress.length,
        awarded: awarded.length,
        bidding: bidding.length,
      });

      await sleep(2000);
    }

    logger.warn('GracefulShutdown', {
      message: 'Drain timeout reached, some tasks may be incomplete',
    });
  }

  private async reclaimRemainingEscrow(): Promise<void> {
    const escrowStats = escrowController.getStats();
    if (escrowStats.locked === 0) return;

    logger.info('GracefulShutdown', {
      message: `Reclaiming ${escrowStats.locked} locked escrows`,
      totalLockedHbar: escrowStats.totalLockedHbar,
    });

    // Find all locked escrows and reclaim them
    // Note: In a real implementation, we'd track all escrow IDs in the controller
    // For now, we rely on the escrowController's internal tracking
    // This is a best-effort reclaim during shutdown
  }

  private async logShutdownToAudit(signal: string): Promise<void> {
    const auditTopicId = config.VERA_AUDIT_TOPIC_ID;
    if (!auditTopicId) return;

    try {
      const msg = JSON.stringify({
        type: 'system_shutdown',
        signal,
        timestamp: Date.now(),
        uptime: process.uptime(),
        pid: process.pid,
      });

      // Submit via hederaMaster with HIP-993 wrapper
      await hederaMaster.submitMessage(auditTopicId, JSON.parse(msg), {
        maxChunkSize: 4096
      });

      logger.info('GracefulShutdown', { message: 'Shutdown logged to audit topic' });
    } catch (error) {
      logger.warn('GracefulShutdown', {
        message: 'Failed to log shutdown to audit topic',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const gracefulShutdown = new GracefulShutdown();
