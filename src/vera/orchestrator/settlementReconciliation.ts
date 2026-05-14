/**
 * Settlement Reconciliation Job
 * Periodically reconciles settlement states and processes failed payments
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import type { X402SettlementHandler } from './x402Settlement.js';
import type { SettlementRequest } from './x402Settlement.js';

export interface ReconciliationConfig {
  intervalMs: number;
  maxRetries: number;
  autoRetry: boolean;
  notifyOnDiscrepancy: boolean;
}

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  intervalMs: 5 * 60 * 1000, // 5 minutes
  maxRetries: 3,
  autoRetry: true,
  notifyOnDiscrepancy: true,
};

export interface ReconciliationReport {
  timestamp: number;
  totalChecked: number;
  discrepancies: number;
  autoFixed: number;
  requiresManual: number;
  details: Array<{
    settlementId: string;
    issue: string;
    action: string;
    success: boolean;
  }>;
}

export class SettlementReconciliation extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastReport: ReconciliationReport | null = null;

  constructor(
    private settlementHandler: X402SettlementHandler,
    private config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG
  ) {
    super();
  }

  /**
   * Start periodic reconciliation
   */
  start(): void {
    if (this.timer) return;

    this.isRunning = true;
    
    // Run immediately, then on interval
    this.runReconciliation();
    
    this.timer = setInterval(() => {
      this.runReconciliation();
    }, this.config.intervalMs);

    logger.info('SettlementReconciliation', {
      message: 'Reconciliation job started',
      intervalMs: this.config.intervalMs,
    });
  }

  /**
   * Stop reconciliation
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('SettlementReconciliation', { message: 'Reconciliation job stopped' });
  }

  /**
   * Run single reconciliation pass
   */
  async runReconciliation(): Promise<ReconciliationReport> {
    const startTime = Date.now();
    const report: ReconciliationReport = {
      timestamp: startTime,
      totalChecked: 0,
      discrepancies: 0,
      autoFixed: 0,
      requiresManual: 0,
      details: [],
    };

    try {
      // Get all settlements from handler
      const stats = this.settlementHandler.getStats();
      const pending = this.getPendingSettlements();
      const failed = this.getFailedSettlements();

      report.totalChecked = stats.total;

      // Check pending settlements (may be stuck)
      for (const settlement of pending) {
        const age = Date.now() - settlement.createdAt;
        
        // If pending for > 5 minutes, may be stuck
        if (age > 5 * 60 * 1000) {
          report.discrepancies++;
          
          if (this.config.autoRetry && (settlement.retryCount || 0) < this.config.maxRetries) {
            const result = await this.settlementHandler.retrySettlement(settlement.settlementId);
            
            if (result?.state === 'settled') {
              report.autoFixed++;
              report.details.push({
                settlementId: settlement.settlementId,
                issue: 'STUCK_PENDING',
                action: 'AUTO_RETRY',
                success: true,
              });
            } else {
              report.requiresManual++;
              report.details.push({
                settlementId: settlement.settlementId,
                issue: 'STUCK_PENDING',
                action: 'RETRY_FAILED',
                success: false,
              });
            }
          } else {
            report.requiresManual++;
            report.details.push({
              settlementId: settlement.settlementId,
              issue: 'STUCK_PENDING_MAX_RETRIES',
              action: 'MANUAL_REVIEW_REQUIRED',
              success: false,
            });
          }
        }
      }

      // Check failed settlements for retry
      for (const settlement of failed) {
        report.discrepancies++;
        
        if (this.config.autoRetry && (settlement.retryCount || 0) < this.config.maxRetries) {
          const result = await this.settlementHandler.retrySettlement(settlement.settlementId);
          
          if (result?.state === 'settled') {
            report.autoFixed++;
            report.details.push({
              settlementId: settlement.settlementId,
              issue: 'FAILED',
              action: 'AUTO_RETRY',
              success: true,
            });
          } else {
            report.details.push({
              settlementId: settlement.settlementId,
              issue: 'FAILED_RETRY',
              action: 'WILL_RETRY_LATER',
              success: false,
            });
          }
        } else {
          report.requiresManual++;
          report.details.push({
            settlementId: settlement.settlementId,
            issue: 'FAILED_MAX_RETRIES',
            action: 'MANUAL_REVIEW_REQUIRED',
            success: false,
          });
        }
      }

      // Check circuit breaker status
      const cbStatus = this.settlementHandler.getCircuitBreakerStatus() as { state: string };
      if (cbStatus.state === 'OPEN') {
        report.details.push({
          settlementId: 'circuit-breaker',
          issue: 'CIRCUIT_BREAKER_OPEN',
          action: 'WAITING_FOR_TIMEOUT',
          success: false,
        });
      }

      this.lastReport = report;

      logger.info('SettlementReconciliation', {
        message: 'Reconciliation complete',
        duration: `${Date.now() - startTime}ms`,
        checked: report.totalChecked,
        discrepancies: report.discrepancies,
        autoFixed: report.autoFixed,
        requiresManual: report.requiresManual,
      });

      if (report.discrepancies > 0 && this.config.notifyOnDiscrepancy) {
        this.emit('discrepancy_found', report);
      }

      this.emit('reconciliation_complete', report);

    } catch (error) {
      logger.error('SettlementReconciliation', {
        message: 'Reconciliation failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit('reconciliation_error', { error, timestamp: Date.now() });
    }

    return report;
  }

  /**
   * Get pending settlements (not settled or failed)
   */
  private getPendingSettlements(): SettlementRequest[] {
    const pending: SettlementRequest[] = [];
    const allSettlements = this.getAllSettlements();
    
    for (const s of allSettlements) {
      if (s.state === 'pending' || s.state === 'processing') {
        pending.push(s);
      }
    }
    
    return pending;
  }

  /**
   * Get failed settlements
   */
  private getFailedSettlements(): SettlementRequest[] {
    const failed: SettlementRequest[] = [];
    const allSettlements = this.getAllSettlements();
    
    for (const s of allSettlements) {
      if (s.state === 'failed') {
        failed.push(s);
      }
    }
    
    return failed;
  }

  /**
   * Get all settlements (using internal access or public methods)
   */
  private getAllSettlements(): SettlementRequest[] {
    // In production, this would query from database
    // For now, return empty array - actual implementation would access settlement store
    return [];
  }

  /**
   * Get last reconciliation report
   */
  getLastReport(): ReconciliationReport | null {
    return this.lastReport;
  }

  /**
   * Check if reconciliation is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Force immediate reconciliation
   */
  async forceReconciliation(): Promise<ReconciliationReport> {
    return this.runReconciliation();
  }
}

export default SettlementReconciliation;
