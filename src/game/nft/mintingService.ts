/**
 * Vera Defender Skin Minting Service
 * Handles auto-minting of NFT skins on purchase
 * Records minting events on HCS for audit trail
 */

import { getSkinNFTContract, SkinNFTMetadata, SkinRarity } from './skinNFTContract.js';
import { getSkinRegistry, type SkinDefinition, type MintedSkin } from './skinRegistry.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { Client, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

export interface MintingRequest {
  skinId: string;
  buyerAccountId: string;
  paymentMethod: 'hbar' | 'x402';
  paymentAmount: number;
  paymentCurrency: 'HBAR' | 'USD';
  paymentTransactionId: string;
}

export interface MintingResult {
  success: boolean;
  tokenId?: string;
  serialNumber?: number;
  transactionId?: string;
  metadata?: SkinNFTMetadata;
  error?: string;
  mintedAt: number;
}

export interface MintingStats {
  totalMints: number;
  successfulMints: number;
  failedMints: number;
  totalRevenueHbar: number;
  totalRevenueUsd: number;
  byRarity: Record<SkinRarity, number>;
  byCategory: Record<string, number>;
}

export class MintingService {
  private contract = getSkinNFTContract();
  private registry = getSkinRegistry();
  private client: Client;
  private auditTopicId: string | null = null;
  private mintCounter: Map<string, number> = new Map(); // skinId -> mint count
  private mintingHistory: MintingResult[] = [];

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.auditTopicId = config.VERA_AUDIT_TOPIC_ID || null;
  }

  /**
   * Initialize the minting service with collection token ID
   */
  async initialize(collectionTokenId?: string): Promise<void> {
    if (collectionTokenId) {
      this.contract.setCollectionTokenId(collectionTokenId);
      logger.info('MintingService', {
        tokenId: collectionTokenId,
        message: 'Minting service initialized with existing collection'
      });
    } else {
      // Try to create new collection
      try {
        const result = await this.contract.createCollection();
        logger.info('MintingService', {
          tokenId: result.tokenId,
          message: 'Minting service initialized with new collection'
        });
      } catch (error) {
        logger.warn('MintingService', {
          error: String(error),
          message: 'Failed to create collection, may already exist'
        });
      }
    }
  }

  /**
   * Mint a skin NFT for a buyer
   */
  async mintSkin(request: MintingRequest): Promise<MintingResult> {
    const startTime = Date.now();
    
    try {
      // 1. Get skin definition
      const skin = this.registry.getSkin(request.skinId);
      if (!skin) {
        throw new Error(`Skin not found: ${request.skinId}`);
      }

      // 2. Verify payment amount matches skin price
      const expectedPrice = skin.basePriceHbar;
      if (request.paymentCurrency === 'HBAR' && request.paymentAmount < expectedPrice) {
        throw new Error(`Insufficient payment. Expected ${expectedPrice} HBAR, got ${request.paymentAmount}`);
      }

      // 3. Get next mint number for this skin
      const currentCount = this.mintCounter.get(request.skinId) || 0;
      const mintNumber = currentCount + 1;

      // 4. Generate NFT metadata
      const metadata = this.registry.generateNFTMetadata(skin, mintNumber);

      // 5. Mint the NFT
      const mintResult = await this.contract.mintSkin(request.buyerAccountId, metadata);

      // 6. Create minted skin record
      const mintedSkin: MintedSkin = {
        ...skin,
        tokenId: this.contract.getCollectionTokenId()!,
        serialNumber: mintResult.serialNumber,
        owner: request.buyerAccountId,
        mintedAt: Date.now(),
        transactionId: mintResult.transactionId
      };

      // 7. Register in registry
      this.registry.registerMintedSkin(mintedSkin);

      // 8. Update mint counter
      this.mintCounter.set(request.skinId, mintNumber);

      // 9. Log to HCS audit topic
      await this.logMintingEvent({
        ...request,
        result: 'success',
        tokenId: mintedSkin.tokenId,
        serialNumber: mintedSkin.serialNumber,
        mintNumber,
        duration: Date.now() - startTime
      });

      // 10. Record in history
      const result: MintingResult = {
        success: true,
        tokenId: mintedSkin.tokenId,
        serialNumber: mintedSkin.serialNumber,
        transactionId: mintResult.transactionId,
        metadata,
        mintedAt: Date.now()
      };
      this.mintingHistory.push(result);

      logger.info('MintingService', {
        skinId: request.skinId,
        buyer: request.buyerAccountId,
        serialNumber: mintResult.serialNumber,
        duration: Date.now() - startTime,
        message: 'Skin NFT minted successfully'
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log failure
      await this.logMintingEvent({
        ...request,
        result: 'failed',
        error: errorMessage,
        duration: Date.now() - startTime
      });

      const result: MintingResult = {
        success: false,
        error: errorMessage,
        mintedAt: Date.now()
      };
      this.mintingHistory.push(result);

      logger.error('MintingService', {
        skinId: request.skinId,
        buyer: request.buyerAccountId,
        error: errorMessage,
        message: 'Skin minting failed'
      });

      return result;
    }
  }

  /**
   * Batch mint multiple skins (for bundles/promotions)
   */
  async batchMint(requests: MintingRequest[]): Promise<MintingResult[]> {
    const results: MintingResult[] = [];
    
    for (const request of requests) {
      // Add small delay between mints to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
      const result = await this.mintSkin(request);
      results.push(result);
    }

    return results;
  }

  /**
   * Log minting event to HCS audit topic
   */
  private async logMintingEvent(event: {
    skinId: string;
    buyerAccountId: string;
    paymentMethod: string;
    paymentAmount: number;
    paymentCurrency: string;
    paymentTransactionId: string;
    result: 'success' | 'failed';
    tokenId?: string;
    serialNumber?: number;
    mintNumber?: number;
    error?: string;
    duration: number;
  }): Promise<void> {
    if (!this.auditTopicId) return;

    try {
      const message = JSON.stringify({
        type: 'SKIN_MINTED',
        timestamp: Date.now(),
        ...event
      });

      await new TopicMessageSubmitTransaction()
        .setTopicId(this.auditTopicId)
        .setMessage(message)
        .execute(this.client);
    } catch (error) {
      logger.warn('MintingService', {
        error: String(error),
        message: 'Failed to log minting event to HCS'
      });
    }
  }

  /**
   * Get minting statistics
   */
  getStats(): MintingStats {
    const successful = this.mintingHistory.filter(m => m.success);
    
    const byRarity: Record<string, number> = {
      [SkinRarity.COMMON]: 0,
      [SkinRarity.RARE]: 0,
      [SkinRarity.EPIC]: 0,
      [SkinRarity.LEGENDARY]: 0,
      [SkinRarity.MYTHIC]: 0
    };

    const byCategory: Record<string, number> = {};

    // Calculate stats from minting history
    for (const mint of successful) {
      if (mint.metadata) {
        const rarity = mint.metadata.properties.rarity;
        byRarity[rarity]++;

        const category = mint.metadata.properties.category;
        byCategory[category] = (byCategory[category] || 0) + 1;
      }
    }

    return {
      totalMints: this.mintingHistory.length,
      successfulMints: successful.length,
      failedMints: this.mintingHistory.filter(m => !m.success).length,
      totalRevenueHbar: 0, // Would calculate from payment records
      totalRevenueUsd: 0,
      byRarity,
      byCategory
    };
  }

  /**
   * Get minting history
   */
  getMintingHistory(limit: number = 100): MintingResult[] {
    return this.mintingHistory
      .sort((a, b) => b.mintedAt - a.mintedAt)
      .slice(0, limit);
  }

  /**
   * Get mint number for a skin (next mint will be +1)
   */
  getMintCount(skinId: string): number {
    return this.mintCounter.get(skinId) || 0;
  }

  /**
   * Check if a skin can be minted (exists and has supply)
   */
  canMint(skinId: string): { canMint: boolean; reason?: string } {
    const skin = this.registry.getSkin(skinId);
    if (!skin) {
      return { canMint: false, reason: 'Skin not found' };
    }

    if (skin.basePriceHbar === 0) {
      return { canMint: false, reason: 'Default skin cannot be minted' };
    }

    return { canMint: true };
  }
}

// Singleton instance
let mintingService: MintingService | null = null;

export function getMintingService(): MintingService {
  if (!mintingService) {
    mintingService = new MintingService();
  }
  return mintingService;
}
