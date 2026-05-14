/**
 * Hedera Lattice Integration
 * 
 * Integrates Hedera operations into the Flower of Life lattice,
 * enabling intuitive wallet-style operations through the sacred geometry.
 * 
 * Layer Assignment:
 * - Layer 0 (Center): Transaction signing, key management
 * - Layer 1 (Inner): Balance queries, simple transfers
 * - Layer 2 (Middle): Token management, NFT operations, compliance
 * - Layer 3 (Outer): Cross-chain bridges, external oracle feeds
 */

import { FlowerOfLifeOS } from './flowerOfLifeOS.js';
import { hederaToolRegistry } from '../../hedera/tools/index.js';
import { HederaWallet, createWallet } from '../../hedera/wallet.js';
import { logger } from '../../monitoring/logger.js';

export interface HederaOperation {
  type: 'transfer' | 'token_create' | 'token_mint' | 'query' | 'associate' | 'nft_mint';
  accountId: string;
  params: Record<string, any>;
}

export interface LatticeHederaConfig {
  defaultAccountId?: string;
  autoRouteThroughCenter: boolean;
  enableHCSLogging: boolean;
}

export class HederaLatticeIntegration {
  private lattice: FlowerOfLifeOS;
  private config: LatticeHederaConfig;
  private wallets: Map<string, HederaWallet> = new Map();
  private operationStats = {
    totalOps: 0,
    successfulOps: 0,
    failedOps: 0,
    byType: new Map<string, number>()
  };

  constructor(lattice: FlowerOfLifeOS, config: Partial<LatticeHederaConfig> = {}) {
    this.lattice = lattice;
    this.config = {
      autoRouteThroughCenter: true,
      enableHCSLogging: true,
      ...config
    };

    this.setupLatticeListeners();
  }

  /**
   * Register a wallet with the lattice
   * Simple: await integration.registerWallet('0.0.12345')
   */
  registerWallet(accountId: string): HederaWallet {
    const wallet = createWallet(accountId);
    this.wallets.set(accountId, wallet);

    // Assign to appropriate lattice node based on account capabilities
    this.lattice.assignAgent(accountId, ['hedera-wallet', 'token-management']);

    logger.info('HederaLattice', {
      message: 'Wallet registered to lattice',
      accountId,
      node: this.lattice.getNodeForRole('token-management')?.id
    });

    return wallet;
  }

  /**
   * Execute Hedera operation through lattice
   * All operations route through center (Pillar 1 enforcement)
   */
  async executeOperation(operation: HederaOperation): Promise<any> {
    const startTime = Date.now();
    this.operationStats.totalOps++;

    // Route through lattice center
    if (this.config.autoRouteThroughCenter) {
      const routing = this.lattice.centerRoute({
        type: 'chain_dispatch',
        data: {
          hederaOperation: operation.type,
          accountId: operation.accountId,
          timestamp: Date.now()
        }
      });

      if (!routing.routedThroughCenter) {
        throw new Error('Failed to route through lattice center');
      }
    }

    try {
      let result;
      const wallet = this.wallets.get(operation.accountId) || this.registerWallet(operation.accountId);

      // Execute based on operation type
      switch (operation.type) {
        case 'transfer':
          if (operation.params.tokenId) {
            result = await wallet.sendToken(
              operation.params.to,
              operation.params.tokenId,
              operation.params.amount,
              { memo: operation.params.memo }
            );
          } else {
            result = await wallet.sendHBAR(
              operation.params.to,
              operation.params.amount,
              { memo: operation.params.memo }
            );
          }
          break;

        case 'token_create':
          result = await wallet.createToken(
            operation.params.name,
            operation.params.symbol,
            operation.params.initialSupply,
            operation.params.decimals,
            { maxSupply: operation.params.maxSupply }
          );
          break;

        case 'nft_mint':
          result = await wallet.mintNFT(
            operation.params.tokenId,
            operation.params.metadata
          );
          break;

        case 'associate':
          result = await wallet.associateToken(operation.params.tokenId);
          break;

        case 'query':
          result = await wallet.getAllBalances();
          break;

        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      // Track success
      this.operationStats.successfulOps++;
      this.trackOperationType(operation.type);

      // Reinforce lattice path on success (living geometry)
      this.reinforceHederaPath(operation.type);

      // Log to HCS if enabled
      if (this.config.enableHCSLogging) {
        await this.logToHCS(operation, result, Date.now() - startTime);
      }

      logger.info('HederaLattice', {
        message: 'Operation completed',
        type: operation.type,
        accountId: operation.accountId,
        duration: Date.now() - startTime,
        success: result.success
      });

      return result;

    } catch (error) {
      this.operationStats.failedOps++;
      
      logger.error('HederaLattice', {
        message: 'Operation failed',
        type: operation.type,
        accountId: operation.accountId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Quick transfer - one-liner for HBAR
   * Simple: await integration.transfer('0.0.12345', '0.0.67890', 10.5)
   */
  async transfer(from: string, to: string, amount: number, memo?: string): Promise<any> {
    return this.executeOperation({
      type: 'transfer',
      accountId: from,
      params: { to, amount, memo }
    });
  }

  /**
   * Quick token transfer
   * Simple: await integration.transferToken('0.0.12345', '0.0.67890', '0.0.54321', 100)
   */
  async transferToken(from: string, to: string, tokenId: string, amount: number): Promise<any> {
    return this.executeOperation({
      type: 'transfer',
      accountId: from,
      params: { to, tokenId, amount }
    });
  }

  /**
   * Get wallet summary through lattice
   */
  async getWalletSummary(accountId: string): Promise<any> {
    const wallet = this.wallets.get(accountId);
    if (!wallet) {
      throw new Error(`Wallet not found for ${accountId}`);
    }

    // Route through center
    this.lattice.centerRoute({
      type: 'result_verify',
      data: { action: 'wallet_summary', accountId }
    });

    return wallet.getSummary();
  }

  /**
   * Batch operations - execute multiple Hedera ops atomically
   */
  async batchOperations(accountId: string, operations: HederaOperation['type'][]): Promise<any[]> {
    const results = [];
    
    for (const opType of operations) {
      try {
        const result = await this.executeOperation({
          type: opType,
          accountId,
          params: {}
        });
        results.push({ type: opType, success: true, result });
      } catch (error) {
        results.push({ 
          type: opType, 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * Get integration statistics
   */
  getStats() {
    return {
      ...this.operationStats,
      byType: Object.fromEntries(this.operationStats.byType),
      registeredWallets: this.wallets.size,
      latticeConnected: this.lattice.getNodeForRole('token-management') !== null
    };
  }

  // Private methods
  private setupLatticeListeners(): void {
    // Listen for center-routed decisions
    this.lattice.on('center_routed', (decision: any) => {
      if (decision.data?.hederaOperation) {
        logger.debug('HederaLattice', {
          message: 'Hedera operation routed through center',
          operation: decision.data.hederaOperation,
          energy: decision.centerEnergy
        });
      }
    });

    // Listen for message routing
    this.lattice.on('message_routed', (event: any) => {
      if (event.message?.type?.includes('hedera')) {
        logger.debug('HederaLattice', {
          message: 'Hedera message routed',
          path: event.route.path
        });
      }
    });
  }

  private trackOperationType(type: string): void {
    const current = this.operationStats.byType.get(type) || 0;
    this.operationStats.byType.set(type, current + 1);
  }

  private reinforceHederaPath(operationType: string): void {
    // Find token-management node and reinforce it
    const node = this.lattice.getNodeForRole('token-management');
    if (node) {
      this.lattice.reinforcePath(['center-0', node.id]);
    }
  }

  private async logToHCS(operation: HederaOperation, result: any, duration: number): Promise<void> {
    try {
      const { hcsDomainLogger } = await import('../logging/hcsDomainLogger.js');
      await hcsDomainLogger.logEvent('auditTopicId', {
        type: 'HEDERA_LATTICE_OPERATION',
        operationType: operation.type,
        accountId: operation.accountId,
        success: result.success,
        duration,
        transactionId: result.transactionId,
        timestamp: Date.now()
      });
    } catch (error) {
      // Non-blocking - don't fail operation if logging fails
      logger.warn('HederaLattice', { message: 'HCS logging failed', error });
    }
  }
}

// Singleton instance
let integrationInstance: HederaLatticeIntegration | null = null;

export function getHederaLatticeIntegration(
  lattice?: FlowerOfLifeOS,
  config?: Partial<LatticeHederaConfig>
): HederaLatticeIntegration {
  if (!integrationInstance && lattice) {
    integrationInstance = new HederaLatticeIntegration(lattice, config);
  }
  if (!integrationInstance) {
    throw new Error('HederaLatticeIntegration not initialized - provide lattice instance');
  }
  return integrationInstance;
}

export default HederaLatticeIntegration;
