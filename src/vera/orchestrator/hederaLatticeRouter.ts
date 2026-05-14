/**
 * Hedera Lattice Router
 * 
 * Routes Hedera operations through the Flower of Life sacred geometry.
 * Each tool type maps to specific lattice nodes for optimal execution.
 * 
 * Features:
 * - HTS operations → Layer 1 nodes (token tasks)
 * - HCS operations → Layer 2 nodes (carbon/compliance)
 * - EVM operations → Layer 3 nodes (agent comms)
 * - Account ops → Center-0 (consciousness verification)
 * - φ-weighted routing costs
 * - Automatic path reinforcement on success
 */

import { EventEmitter } from 'events';
import { flowerOfLifeOS } from './flowerOfLifeOS.js';
import { hederaMicropayment, MicropaymentRequest } from './hederaMicropayment.js';
import { runAgentKitTool } from '../../hedera/agentKitWrapper.js';
import { logger } from '../../monitoring/logger.js';

// ─── Tool Category to Lattice Layer Mapping ──────────────────────────────────

const TOOL_LAYER_MAP: Record<string, number> = {
  // HTS - Layer 1 (token operations)
  'hts_create_token': 1,
  'hts_mint_token': 1,
  'hts_airdrop': 1,
  'hts_create_nft': 1,
  'hts_transfer_nft': 1,
  'hts_dissociate_token': 1,
  'hts_update_token': 1,
  'hts_mint_nft': 1,
  'hts_approve_nft_allowance': 1,
  'hts_delete_nft_allowance': 1,
  
  // HCS - Layer 2 (consensus/compliance)
  'hcs_create_topic': 2,
  'hcs_submit_message': 2,
  'hcs_update_topic': 2,
  'hcs_delete_topic': 2,
  
  // EVM - Layer 3 (smart contracts/agent comms)
  'evm_create_erc20': 3,
  'evm_create_erc721': 3,
  'evm_transfer_erc20': 3,
  'evm_mint_erc721': 3,
  'evm_transfer_erc721': 3,
  
  // Account - Layer 0 (center consciousness)
  'kit_create_account': 0,
  'kit_update_account': 0,
  'kit_delete_account': 0,
  'kit_approve_hbar_allowance': 0,
  'kit_delete_hbar_allowance': 0,
  'kit_approve_token_allowance': 0,
  'kit_delete_token_allowance': 0,
  'kit_sign_schedule': 0,
  'kit_delete_schedule': 0,
  
  // Queries - Any layer (read-only)
  'kit_get_account': -1,
  'kit_get_token_balances': -1,
  'kit_get_pending_airdrops': -1,
  'kit_get_topic_info': -1,
  'kit_get_contract_info': -1,
  'kit_get_transaction_record': -1,
  'kit_get_exchange_rate': -1,
};

// ─── Sacred Constants ────────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;
const DEG60 = Math.PI / 3;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HederaOperation {
  operationId: string;
  toolName: string;
  params: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  requireSettlement?: boolean;
  settlementAmount?: number;
  settlementCurrency?: 'HBAR' | 'USDC' | 'DOVU' | 'XSGD';
}

export interface RoutedOperation {
  operation: HederaOperation;
  path: string[];
  targetNodeId: string;
  estimatedEnergy: number;
  requiresSettlement: boolean;
  status: 'routing' | 'executing' | 'settling' | 'complete' | 'failed';
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
}

export interface LatticeRoutingStats {
  totalOperations: number;
  completed: number;
  failed: number;
  averagePathLength: number;
  averageEnergyCost: number;
  byLayer: {
    layer0: number;
    layer1: number;
    layer2: number;
    layer3: number;
  };
}

// ─── Hedera Lattice Router ───────────────────────────────────────────────────

export class HederaLatticeRouter extends EventEmitter {
  private activeOperations = new Map<string, RoutedOperation>();
  private operationHistory: RoutedOperation[] = [];
  private maxHistory = 1000;

  constructor() {
    super();
  }

  /**
   * Route a Hedera operation through the Flower of Life lattice
   */
  async route(operation: HederaOperation): Promise<RoutedOperation> {
    const routed: RoutedOperation = {
      operation,
      path: [],
      targetNodeId: '',
      estimatedEnergy: 0,
      requiresSettlement: operation.requireSettlement || false,
      status: 'routing',
      startTime: Date.now(),
    };

    this.activeOperations.set(operation.operationId, routed);

    try {
      // Step 1: Determine target layer based on tool type
      const targetLayer = this.getToolLayer(operation.toolName);
      
      // Step 2: Find optimal node in that layer
      const targetNode = this.selectNodeInLayer(targetLayer);
      routed.targetNodeId = targetNode;

      // Step 3: Calculate φ-harmonic path
      routed.path = this.calculatePath('center-0', targetNode);
      routed.estimatedEnergy = this.calculatePathEnergy(routed.path);

      logger.info('HederaLatticeRouter', {
        message: 'Operation routed through lattice',
        operationId: operation.operationId,
        toolName: operation.toolName,
        targetLayer,
        targetNode,
        pathLength: routed.path.length,
        energy: routed.estimatedEnergy.toFixed(3),
      });

      this.emit('operation_routed', routed);

      // Step 4: Execute if this is a query (read-only, no settlement needed)
      if (targetLayer === -1) {
        return await this.executeQuery(routed);
      }

      // Step 5: Handle settlement if required
      if (operation.requireSettlement && operation.settlementAmount) {
        routed.status = 'settling';
        await this.executeSettlement(routed);
      }

      // Step 6: Execute the Hedera operation
      routed.status = 'executing';
      return await this.executeOperation(routed);

    } catch (error) {
      routed.status = 'failed';
      routed.error = error instanceof Error ? error.message : String(error);
      routed.endTime = Date.now();

      logger.error('HederaLatticeRouter', {
        message: 'Operation failed',
        operationId: operation.operationId,
        error: routed.error,
      });

      this.emit('operation_failed', routed);
      this.archiveOperation(routed);
      this.activeOperations.delete(operation.operationId);

      throw error;
    }
  }

  /**
   * Get the appropriate layer for a tool
   */
  private getToolLayer(toolName: string): number {
    return TOOL_LAYER_MAP[toolName] ?? 1; // Default to layer 1
  }

  /**
   * Select the optimal node in a given layer
   */
  private selectNodeInLayer(layer: number): string {
    // Queries don't need specific nodes
    if (layer === -1) return 'center-0';
    
    // Center node for layer 0
    if (layer === 0) return 'center-0';

    // For other layers, select based on current load/energy
    // In a full implementation, this would check node health
    const nodeCount = layer === 1 ? 6 : layer === 2 ? 12 : 18;
    const nodeIndex = Math.floor(Math.random() * nodeCount);
    return `layer${layer}-${nodeIndex}`;
  }

  /**
   * Calculate optimal path through lattice
   */
  private calculatePath(from: string, to: string): string[] {
    // Use FlowerOfLifeOS if available
    if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).findPath === 'function') {
      const path = (flowerOfLifeOS as any).findPath(from, to);
      if (path && path.length > 0) return path;
    }

    // Fallback: direct path through center
    if (from === to) return [from];
    return [from, 'center-0', to];
  }

  /**
   * Calculate φ-weighted energy for path
   */
  private calculatePathEnergy(path: string[]): number {
    let energy = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const layer = this.getNodeLayer(path[i]);
      const layerCost = layer === 0 ? 0 : layer === 1 ? 1 : layer === 2 ? PHI : PHI * PHI;
      energy += layerCost * PHI; // φ-weighted edge cost
    }
    return energy;
  }

  /**
   * Extract layer from node ID
   */
  private getNodeLayer(nodeId: string): number {
    if (nodeId === 'center-0') return 0;
    const match = nodeId.match(/layer(\d)/);
    return match ? parseInt(match[1]) : 1;
  }

  /**
   * Execute read-only query (no settlement needed)
   */
  private async executeQuery(routed: RoutedOperation): Promise<RoutedOperation> {
    try {
      // Map Vera tool name to Agent Kit method
      const method = this.mapToolToAgentKitMethod(routed.operation.toolName);
      
      const result = await runAgentKitTool(method, routed.operation.params);

      routed.status = 'complete';
      routed.endTime = Date.now();
      routed.result = result;

      this.emit('operation_complete', routed);
      this.archiveOperation(routed);
      this.activeOperations.delete(routed.operation.operationId);

      return routed;

    } catch (error) {
      routed.status = 'failed';
      routed.error = error instanceof Error ? error.message : String(error);
      routed.endTime = Date.now();
      
      this.emit('operation_failed', routed);
      this.archiveOperation(routed);
      this.activeOperations.delete(routed.operation.operationId);

      throw error;
    }
  }

  /**
   * Execute settlement before write operation
   */
  private async executeSettlement(routed: RoutedOperation): Promise<void> {
    const op = routed.operation;
    
    const paymentRequest: MicropaymentRequest = {
      taskId: op.operationId,
      agentId: 'lattice-router',
      recipientAccountId: op.params.accountId || op.params.recipientId || '',
      amount: op.settlementAmount || 0,
      currency: op.settlementCurrency || 'HBAR',
      sourceNodeId: 'center-0',
      targetNodeId: routed.targetNodeId,
      priority: op.priority,
      metadata: {
        toolName: op.toolName,
        operationType: 'hedera_write',
      },
    };

    await hederaMicropayment.routePayment(paymentRequest);
  }

  /**
   * Execute the actual Hedera operation
   */
  private async executeOperation(routed: RoutedOperation): Promise<RoutedOperation> {
    try {
      // Map Vera tool name to Agent Kit method
      const method = this.mapToolToAgentKitMethod(routed.operation.toolName);
      
      // Trigger center pulse for write operations
      if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).triggerCenterPulse === 'function') {
        (flowerOfLifeOS as any).triggerCenterPulse({
          type: 'hedera_operation',
          operationId: routed.operation.operationId,
          toolName: routed.operation.toolName,
          targetNode: routed.targetNodeId,
        });
      }

      const result = await runAgentKitTool(method, routed.operation.params);

      if (result.success) {
        routed.status = 'complete';
        routed.result = result;
        routed.endTime = Date.now();

        // Reinforce lattice edges
        this.reinforcePath(routed.path);

        logger.info('HederaLatticeRouter', {
          message: 'Operation completed successfully',
          operationId: routed.operation.operationId,
          toolName: routed.operation.toolName,
          duration: routed.endTime - routed.startTime,
        });

        this.emit('operation_complete', routed);
      } else {
        routed.status = 'failed';
        routed.error = result.error || 'Unknown error';
        routed.endTime = Date.now();

        this.emit('operation_failed', routed);
      }

      this.archiveOperation(routed);
      this.activeOperations.delete(routed.operation.operationId);

      return routed;

    } catch (error) {
      routed.status = 'failed';
      routed.error = error instanceof Error ? error.message : String(error);
      routed.endTime = Date.now();

      this.emit('operation_failed', routed);
      this.archiveOperation(routed);
      this.activeOperations.delete(routed.operation.operationId);

      throw error;
    }
  }

  /**
   * Map Vera tool names to Agent Kit method names
   */
  private mapToolToAgentKitMethod(toolName: string): string {
    const METHOD_MAP: Record<string, string> = {
      // HTS
      'hts_create_token': 'create_fungible_token_tool',
      'hts_mint_token': 'mint_fungible_token_tool',
      'hts_airdrop': 'airdrop_fungible_token_tool',
      'hts_create_nft': 'create_non_fungible_token_tool',
      'hts_dissociate_token': 'dissociate_token_tool',
      'hts_update_token': 'update_token_tool',
      'hts_mint_nft': 'mint_non_fungible_token_tool',
      'hts_transfer_nft': 'transfer_non_fungible_token_tool',
      'hts_approve_nft_allowance': 'approve_nft_allowance_tool',
      'hts_delete_nft_allowance': 'delete_non_fungible_token_allowance_tool',
      
      // Account
      'kit_create_account': 'create_account_tool',
      'kit_update_account': 'update_account_tool',
      'kit_delete_account': 'delete_account_tool',
      'kit_approve_hbar_allowance': 'approve_hbar_allowance_tool',
      'kit_delete_hbar_allowance': 'delete_hbar_allowance_tool',
      'kit_approve_token_allowance': 'approve_token_allowance_tool',
      'kit_delete_token_allowance': 'delete_token_allowance_tool',
      'kit_sign_schedule': 'sign_schedule_transaction_tool',
      'kit_delete_schedule': 'schedule_delete_tool',
      
      // HCS
      'hcs_create_topic': 'create_topic_tool',
      'hcs_submit_message': 'submit_topic_message_tool',
      'hcs_update_topic': 'update_topic_tool',
      'hcs_delete_topic': 'delete_topic_tool',
      
      // EVM
      'evm_create_erc20': 'create_erc20_tool',
      'evm_create_erc721': 'create_erc721_tool',
      'evm_transfer_erc20': 'transfer_erc20_tool',
      'evm_mint_erc721': 'mint_erc721_tool',
      'evm_transfer_erc721': 'transfer_erc721_tool',
      
      // Queries
      'kit_get_account': 'get_account_query_tool',
      'kit_get_token_balances': 'get_account_token_balances_query_tool',
      'kit_get_pending_airdrops': 'get_pending_airdrop_tool',
      'kit_get_topic_info': 'get_topic_info_query_tool',
      'kit_get_contract_info': 'get_contract_info_query_tool',
      'kit_get_transaction_record': 'get_transaction_record_query_tool',
      'kit_get_exchange_rate': 'get_exchange_rate_tool',
    };

    return METHOD_MAP[toolName] || toolName;
  }

  /**
   * Reinforce lattice edges after successful operation
   */
  private reinforcePath(path: string[]): void {
    if (flowerOfLifeOS && typeof (flowerOfLifeOS as any).reinforceEdges === 'function') {
      for (let i = 0; i < path.length - 1; i++) {
        (flowerOfLifeOS as any).reinforceEdges(path[i], path[i + 1], 0.05);
      }
    }
  }

  /**
   * Archive completed operation
   */
  private archiveOperation(operation: RoutedOperation): void {
    this.operationHistory.push(operation);
    if (this.operationHistory.length > this.maxHistory) {
      this.operationHistory.shift();
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): LatticeRoutingStats {
    const all = [...this.operationHistory, ...Array.from(this.activeOperations.values())];
    const completed = all.filter(o => o.status === 'complete');

    return {
      totalOperations: all.length,
      completed: completed.length,
      failed: all.filter(o => o.status === 'failed').length,
      averagePathLength: completed.length > 0 
        ? completed.reduce((sum, o) => sum + o.path.length, 0) / completed.length 
        : 0,
      averageEnergyCost: completed.length > 0
        ? completed.reduce((sum, o) => sum + o.estimatedEnergy, 0) / completed.length
        : 0,
      byLayer: {
        layer0: all.filter(o => this.getToolLayer(o.operation.toolName) === 0).length,
        layer1: all.filter(o => this.getToolLayer(o.operation.toolName) === 1).length,
        layer2: all.filter(o => this.getToolLayer(o.operation.toolName) === 2).length,
        layer3: all.filter(o => this.getToolLayer(o.operation.toolName) === 3).length,
      },
    };
  }

  /**
   * Get active operations
   */
  getActiveOperations(): RoutedOperation[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Batch execute multiple operations
   */
  async batchRoute(operations: HederaOperation[]): Promise<RoutedOperation[]> {
    // Sort by layer to group similar operations
    const sorted = [...operations].sort((a, b) => {
      return this.getToolLayer(a.toolName) - this.getToolLayer(b.toolName);
    });

    // Execute with concurrency limit
    const results: RoutedOperation[] = [];
    const concurrency = 3;

    for (let i = 0; i < sorted.length; i += concurrency) {
      const batch = sorted.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(op => this.route(op).catch(err => {
          logger.error('HederaLatticeRouter', {
            message: 'Batch operation failed',
            operationId: op.operationId,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }))
      );
      results.push(...batchResults.filter((r): r is RoutedOperation => r !== null));
    }

    return results;
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const hederaLatticeRouter = new HederaLatticeRouter();
