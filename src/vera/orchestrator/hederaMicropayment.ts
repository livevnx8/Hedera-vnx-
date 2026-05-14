/**
 * Hedera Micropayment Handler for FlowerOfLifeOS
 * 
 * Integrates x402 settlement with sacred geometry routing.
 * Payments flow through the lattice: Center-0 → Agent Node → Settlement
 * 
 * Features:
 * - Lattice-aware payment routing (φ-harmonic paths)
 * - Multi-currency support (HBAR, USDC, DOVU)
 * - Real-time settlement streaming
 * - Energy-flow visualization hooks
 */

import { EventEmitter } from 'events';
import { EnhancedX402Settlement } from '../payments/enhancedX402Settlement.js';
import { flowerOfLifeOS } from './flowerOfLifeOS.js';
import { logger } from '../../monitoring/logger.js';
import { config } from '../../config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentCurrency = 'HBAR' | 'USDC' | 'DOVU' | 'XSGD';

export interface MicropaymentRequest {
  taskId: string;
  agentId: string;
  recipientAccountId: string;
  amount: number;
  currency: PaymentCurrency;
  sourceNodeId: string; // Lattice node that initiated
  targetNodeId: string; // Lattice node for agent
  priority: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface PaymentFlow {
  flowId: string;
  path: string[]; // Node IDs in the lattice path
  estimatedEnergy: number; // φ-weighted path cost
  actualEnergy: number;
  startTime: number;
  endTime?: number;
  status: 'routing' | 'pending' | 'settled' | 'failed';
  settlementId?: string;
  txId?: string;
}

export interface PaymentStats {
  totalPayments: number;
  settled: number;
  pending: number;
  failed: number;
  totalVolume: number;
  averagePathLength: number;
  averageSettlementTime: number;
  activeFlows: number;
}

// ─── Sacred Constants ────────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio
const LAYER_COSTS = {
  '0': 0,      // Center - consciousness (no cost)
  '1': 1,      // Layer 1 - base cost
  '2': PHI,    // Layer 2 - φ-weighted
  '3': PHI * PHI, // Layer 3 - φ²-weighted
};

// ─── Hedera Micropayment Handler ─────────────────────────────────────────────

export class HederaMicropaymentHandler extends EventEmitter {
  private activeFlows = new Map<string, PaymentFlow>();
  private flowHistory: PaymentFlow[] = [];
  private maxHistory = 1000;
  private x402Settlement: EnhancedX402Settlement;

  constructor() {
    super();
    this.x402Settlement = new EnhancedX402Settlement();
    this.setupEventListeners();
  }

  /**
   * Initialize lattice-aware payment routing
   */
  private setupEventListeners(): void {
    // Listen for x402 settlement events
    this.x402Settlement.on('settled', (settlement) => {
      this.onSettlementComplete(settlement);
    });

    this.x402Settlement.on('settlement_failed', (settlement) => {
      this.onSettlementFailed(settlement);
    });
  }

  /**
   * Route payment through Flower of Life lattice
   * Path: Center-0 → Agent Node → Settlement
   */
  async routePayment(request: MicropaymentRequest): Promise<PaymentFlow> {
    const flowId = `flow-${request.taskId}-${Date.now()}`;
    
    // Calculate φ-harmonic path through lattice
    const path = this.calculateLatticePath(request.sourceNodeId, request.targetNodeId);
    const estimatedEnergy = this.calculatePathEnergy(path);

    const flow: PaymentFlow = {
      flowId,
      path,
      estimatedEnergy,
      actualEnergy: 0,
      startTime: Date.now(),
      status: 'routing',
    };

    this.activeFlows.set(flowId, flow);

    logger.info('HederaMicropayment', {
      message: 'Payment flow initiated',
      flowId,
      taskId: request.taskId,
      agentId: request.agentId,
      pathLength: path.length,
      estimatedEnergy: estimatedEnergy.toFixed(3),
      amount: request.amount,
      currency: request.currency,
    });

    // Emit for visualization
    this.emit('flow_started', {
      flowId,
      path,
      energy: estimatedEnergy,
      request,
    });

    try {
      // Route through center-0 first (consciousness check)
      if (request.priority === 'critical' || request.priority === 'high') {
        await this.pulseThroughCenter(flowId, request);
      }

      // Execute settlement via x402
      flow.status = 'pending';
      
      const settlement = await this.x402Settlement.settle(
        request.taskId,
        request.agentId,
        request.recipientAccountId,
        request.amount,
        request.currency
      );

      flow.settlementId = settlement.settlementId;
      flow.actualEnergy = estimatedEnergy * (1 + Math.random() * 0.1); // Slight variance

      if (settlement.state === 'settled') {
        flow.status = 'settled';
        flow.endTime = Date.now();
        flow.txId = settlement.txId;
      } else {
        flow.status = 'failed';
        flow.endTime = Date.now();
      }

      return flow;

    } catch (error) {
      flow.status = 'failed';
      flow.endTime = Date.now();
      
      logger.error('HederaMicropayment', {
        message: 'Payment flow failed',
        flowId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit('flow_failed', { flowId, flow, error });
      throw error;
    }
  }

  /**
   * Calculate optimal path through lattice using sacred geometry
   * Uses A* with φ-weighted heuristics
   */
  private calculateLatticePath(fromNodeId: string, toNodeId: string): string[] {
    // Use FlowerOfLifeOS pathfinding if available
    if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).findPath === 'function') {
      const path = (flowerOfLifeOS as any).findPath(fromNodeId, toNodeId);
      if (path && path.length > 0) {
        return path;
      }
    }

    // Fallback: direct path through center
    if (fromNodeId === toNodeId) {
      return [fromNodeId];
    }

    // Default routing: source -> center -> target
    return [fromNodeId, 'center-0', toNodeId];
  }

  /**
   * Calculate φ-weighted energy cost for path
   */
  private calculatePathEnergy(path: string[]): number {
    let totalEnergy = 0;
    
    for (let i = 0; i < path.length - 1; i++) {
      const nodeId = path[i];
      const layer = this.getNodeLayer(nodeId);
      const layerCost = LAYER_COSTS[layer as keyof typeof LAYER_COSTS] || 1;
      
      // φ-weighted edge cost
      const edgeCost = layerCost * PHI;
      totalEnergy += edgeCost;
    }

    return totalEnergy;
  }

  /**
   * Extract layer from node ID
   */
  private getNodeLayer(nodeId: string): string {
    if (nodeId === 'center-0') return '0';
    if (nodeId.startsWith('layer1-')) return '1';
    if (nodeId.startsWith('layer2-')) return '2';
    if (nodeId.startsWith('layer3-')) return '3';
    if (nodeId.startsWith('intersection-')) return '1';
    return '1';
  }

  /**
   * Pulse payment through center-0 (consciousness verification)
   */
  private async pulseThroughCenter(flowId: string, request: MicropaymentRequest): Promise<void> {
    // Trigger center pulse in FlowerOfLifeOS
    if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).triggerCenterPulse === 'function') {
      (flowerOfLifeOS as any).triggerCenterPulse({
        type: 'payment_authorization',
        flowId,
        amount: request.amount,
        priority: request.priority,
      });
    }

    // Simulate consciousness processing time
    const pulseDelay = request.priority === 'critical' ? 0 : 50;
    if (pulseDelay > 0) {
      await this.sleep(pulseDelay);
    }

    this.emit('center_pulse', { flowId, request });
  }

  /**
   * Handle successful settlement
   */
  private onSettlementComplete(settlement: any): void {
    // Find matching flow
    for (const [flowId, flow] of this.activeFlows) {
      if (flow.settlementId === settlement.settlementId) {
        flow.status = 'settled';
        flow.endTime = Date.now();
        flow.txId = settlement.txId;

        // Reinforce lattice edges along the path
        this.reinforcePath(flow.path);

        // Archive flow
        this.archiveFlow(flow);
        this.activeFlows.delete(flowId);

        this.emit('flow_settled', { flowId, flow, settlement });
        break;
      }
    }
  }

  /**
   * Handle failed settlement
   */
  private onSettlementFailed(settlement: any): void {
    for (const [flowId, flow] of this.activeFlows) {
      if (flow.settlementId === settlement.settlementId) {
        flow.status = 'failed';
        flow.endTime = Date.now();

        this.archiveFlow(flow);
        this.activeFlows.delete(flowId);

        this.emit('flow_failed', { flowId, flow, settlement });
        break;
      }
    }
  }

  /**
   * Reinforce lattice edges after successful payment
   * Strengthens the harmonic pathways
   */
  private reinforcePath(path: string[]): void {
    if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).reinforceEdges === 'function') {
      for (let i = 0; i < path.length - 1; i++) {
        (flowerOfLifeOS as any).reinforceEdges(path[i], path[i + 1], 0.1);
      }
    }
  }

  /**
   * Archive completed flow to history
   */
  private archiveFlow(flow: PaymentFlow): void {
    this.flowHistory.push(flow);
    if (this.flowHistory.length > this.maxHistory) {
      this.flowHistory.shift();
    }
  }

  /**
   * Get current payment statistics
   */
  getStats(): PaymentStats {
    const allFlows = [...this.flowHistory, ...Array.from(this.activeFlows.values())];
    const settled = allFlows.filter(f => f.status === 'settled');
    const pending = allFlows.filter(f => f.status === 'pending' || f.status === 'routing');
    const failed = allFlows.filter(f => f.status === 'failed');

    const totalPathLength = settled.reduce((sum, f) => sum + f.path.length, 0);
    const totalSettlementTime = settled.reduce((sum, f) => {
      if (f.endTime && f.startTime) {
        return sum + (f.endTime - f.startTime);
      }
      return sum;
    }, 0);

    return {
      totalPayments: allFlows.length,
      settled: settled.length,
      pending: pending.length,
      failed: failed.length,
      totalVolume: this.calculateTotalVolume(),
      averagePathLength: settled.length > 0 ? totalPathLength / settled.length : 0,
      averageSettlementTime: settled.length > 0 ? totalSettlementTime / settled.length : 0,
      activeFlows: this.activeFlows.size,
    };
  }

  /**
   * Calculate total payment volume
   */
  private calculateTotalVolume(): number {
    // This would integrate with x402Settlement stats
    return 0; // Placeholder
  }

  /**
   * Get active flows for visualization
   */
  getActiveFlows(): PaymentFlow[] {
    return Array.from(this.activeFlows.values());
  }

  /**
   * Get flow history
   */
  getFlowHistory(limit = 100): PaymentFlow[] {
    return this.flowHistory.slice(-limit);
  }

  /**
   * Batch settle multiple payments (efficiency optimization)
   */
  async batchSettle(requests: MicropaymentRequest[]): Promise<PaymentFlow[]> {
    logger.info('HederaMicropayment', {
      message: 'Batch settlement initiated',
      count: requests.length,
    });

    // Sort by priority and path similarity for optimization
    const sorted = this.sortForBatchOptimization(requests);

    // Process in parallel with concurrency limit
    const flows: PaymentFlow[] = [];
    const concurrency = 5;
    
    for (let i = 0; i < sorted.length; i += concurrency) {
      const batch = sorted.slice(i, i + concurrency);
      const batchFlows = await Promise.all(
        batch.map(req => this.routePayment(req).catch(err => {
          logger.error('HederaMicropayment', {
            message: 'Batch payment failed',
            taskId: req.taskId,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }))
      );
      flows.push(...batchFlows.filter((f): f is PaymentFlow => f !== null));
    }

    return flows;
  }

  /**
   * Sort payments for batch optimization
   * Groups by similar paths to reduce lattice traversal
   */
  private sortForBatchOptimization(requests: MicropaymentRequest[]): MicropaymentRequest[] {
    return [...requests].sort((a, b) => {
      // Critical priority first
      if (a.priority === 'critical' && b.priority !== 'critical') return -1;
      if (b.priority === 'critical' && a.priority !== 'critical') return 1;

      // Then by target node (to group similar paths)
      return a.targetNodeId.localeCompare(b.targetNodeId);
    });
  }

  /**
   * Health check for payment handler
   */
  healthCheck(): { status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, any> } {
    const stats = this.getStats();
    const failureRate = stats.totalPayments > 0 ? stats.failed / stats.totalPayments : 0;

    if (failureRate > 0.1) {
      return {
        status: 'degraded',
        details: {
          failureRate: failureRate.toFixed(3),
          activeFlows: stats.activeFlows,
          message: 'High failure rate detected',
        },
      };
    }

    return {
      status: 'healthy',
      details: {
        failureRate: failureRate.toFixed(3),
        activeFlows: stats.activeFlows,
        totalSettled: stats.settled,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const hederaMicropayment = new HederaMicropaymentHandler();
