/**
 * Vera Defender Skin Ownership Verifier
 * Queries mirror node to verify NFT ownership
 * Caches results for performance
 */

import { logger } from '../../monitoring/logger.js';
import { config } from '../../config.js';
import { getSkinRegistry, type MintedSkin } from '../nft/skinRegistry.js';

export interface OwnershipCacheEntry {
  accountId: string;
  skinId: string;
  owned: boolean;
  tokenId?: string;
  serialNumber?: number;
  cachedAt: number;
  expiresAt: number;
}

export interface OwnershipVerificationResult {
  owned: boolean;
  skinId: string;
  tokenId?: string;
  serialNumber?: number;
  mintedAt?: number;
  source: 'cache' | 'mirror_node' | 'registry';
}

export interface MirrorNodeNFT {
  token_id: string;
  serial_number: number;
  account_id: string;
  metadata: string;
  creation_timestamp: string;
}

export class OwnershipVerifier {
  private registry = getSkinRegistry();
  private cache: Map<string, OwnershipCacheEntry> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes
  private mirrorNodeBaseUrl: string;

  constructor() {
    this.mirrorNodeBaseUrl = config.MIRROR_NODE_BASE_URL || 
      (config.HEDERA_NETWORK === 'mainnet' 
        ? 'https://mainnet.mirrornode.hedera.com'
        : 'https://testnet.mirrornode.hedera.com');
  }

  /**
   * Verify if an account owns a specific skin
   */
  async verifyOwnership(
    accountId: string,
    skinId: string,
    useCache: boolean = true
  ): Promise<OwnershipVerificationResult> {
    const cacheKey = `${accountId}:${skinId}`;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return {
          owned: cached.owned,
          skinId,
          tokenId: cached.tokenId,
          serialNumber: cached.serialNumber,
          source: 'cache'
        };
      }
    }

    // Get skin definition
    const skin = this.registry.getSkin(skinId);
    if (!skin) {
      return { owned: false, skinId, source: 'registry' };
    }

    // Default skins are always "owned"
    if (skin.basePriceHbar === 0) {
      return { owned: true, skinId, source: 'registry' };
    }

    // Check registry for minted instances
    const mintedSkins = this.registry.getMintedSkinsByOwner(accountId);
    const ownedSkin = mintedSkins.find(s => s.id === skinId);

    if (ownedSkin) {
      // Update cache
      this.cache.set(cacheKey, {
        accountId,
        skinId,
        owned: true,
        tokenId: ownedSkin.tokenId,
        serialNumber: ownedSkin.serialNumber,
        cachedAt: Date.now(),
        expiresAt: Date.now() + this.cacheTTL
      });

      return {
        owned: true,
        skinId,
        tokenId: ownedSkin.tokenId,
        serialNumber: ownedSkin.serialNumber,
        mintedAt: ownedSkin.mintedAt,
        source: 'registry'
      };
    }

    // Query mirror node for NFTs
    try {
      const nfts = await this.queryMirrorNodeForNFTs(accountId);
      
      // Check if any NFT matches this skin
      for (const nft of nfts) {
        // Parse metadata to check if it's our skin
        const metadata = JSON.parse(atob(nft.metadata));
        if (metadata.properties?.sprite_sheet_url?.includes(skinId)) {
          // Update cache
          this.cache.set(cacheKey, {
            accountId,
            skinId,
            owned: true,
            tokenId: nft.token_id,
            serialNumber: nft.serial_number,
            cachedAt: Date.now(),
            expiresAt: Date.now() + this.cacheTTL
          });

          return {
            owned: true,
            skinId,
            tokenId: nft.token_id,
            serialNumber: nft.serial_number,
            mintedAt: parseInt(nft.creation_timestamp) * 1000,
            source: 'mirror_node'
          };
        }
      }
    } catch (error) {
      logger.warn('OwnershipVerifier', {
        error: String(error),
        accountId,
        skinId,
        message: 'Mirror node query failed'
      });
    }

    // Not owned - cache negative result too
    this.cache.set(cacheKey, {
      accountId,
      skinId,
      owned: false,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.cacheTTL
    });

    return {
      owned: false,
      skinId,
      source: 'mirror_node'
    };
  }

  /**
   * Batch verify ownership for multiple skins
   */
  async verifyMultipleOwnership(
    accountId: string,
    skinIds: string[]
  ): Promise<Map<string, OwnershipVerificationResult>> {
    const results = new Map<string, OwnershipVerificationResult>();

    for (const skinId of skinIds) {
      const result = await this.verifyOwnership(accountId, skinId);
      results.set(skinId, result);
    }

    return results;
  }

  /**
   * Get all owned skins for an account
   */
  async getAllOwnedSkins(accountId: string): Promise<MintedSkin[]> {
    const ownedSkins: MintedSkin[] = [];

    // Get from registry first
    const registrySkins = this.registry.getMintedSkinsByOwner(accountId);
    ownedSkins.push(...registrySkins);

    // Query mirror node for any additional NFTs
    try {
      const nfts = await this.queryMirrorNodeForNFTs(accountId);
      
      for (const nft of nfts) {
        // Check if we already have this from registry
        const exists = ownedSkins.some(s => 
          s.tokenId === nft.token_id && s.serialNumber === nft.serial_number
        );

        if (!exists) {
          // Try to parse and identify the skin
          try {
            const metadata = JSON.parse(atob(nft.metadata));
            const skinId = this.extractSkinIdFromMetadata(metadata);
            
            if (skinId) {
              const skin = this.registry.getSkin(skinId);
              if (skin) {
                ownedSkins.push({
                  ...skin,
                  tokenId: nft.token_id,
                  serialNumber: nft.serial_number,
                  owner: accountId,
                  mintedAt: parseInt(nft.creation_timestamp) * 1000,
                  transactionId: 'unknown'
                });
              }
            }
          } catch (e) {
            // Invalid metadata, skip
          }
        }
      }
    } catch (error) {
      logger.warn('OwnershipVerifier', {
        error: String(error),
        accountId,
        message: 'Failed to query mirror node for all NFTs'
      });
    }

    return ownedSkins;
  }

  /**
   * Query mirror node for account NFTs
   */
  private async queryMirrorNodeForNFTs(accountId: string): Promise<MirrorNodeNFT[]> {
    try {
      const response = await fetch(
        `${this.mirrorNodeBaseUrl}/api/v1/accounts/${accountId}/nfts?limit=100`
      );

      if (!response.ok) {
        throw new Error(`Mirror node returned ${response.status}`);
      }

      const data = await response.json();
      return data.nfts || [];
    } catch (error) {
      throw new Error(`Mirror node query failed: ${error}`);
    }
  }

  /**
   * Extract skin ID from NFT metadata
   */
  private extractSkinIdFromMetadata(metadata: any): string | null {
    // Try to find skin ID in various metadata fields
    if (metadata.properties?.sprite_sheet_url) {
      const match = metadata.properties.sprite_sheet_url.match(/\/([^/]+)\.png$/);
      if (match) return match[1];
    }

    if (metadata.external_url) {
      const match = metadata.external_url.match(/\/skin\/([^/]+)$/);
      if (match) return match[1];
    }

    // Check attributes
    if (metadata.attributes) {
      const skinIdAttr = metadata.attributes.find(
        (a: any) => a.trait_type === 'Skin ID'
      );
      if (skinIdAttr) return skinIdAttr.value;
    }

    return null;
  }

  /**
   * Invalidate cache for an account
   */
  invalidateCache(accountId: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.accountId === accountId) {
        this.cache.delete(key);
      }
    }

    logger.info('OwnershipVerifier', {
      accountId,
      message: 'Cache invalidated'
    });
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('OwnershipVerifier', { message: 'All cache cleared' });
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    totalEntries: number;
    ownedEntries: number;
    expiredEntries: number;
    hitRate: number;
  } {
    const now = Date.now();
    let owned = 0;
    let expired = 0;

    for (const entry of this.cache.values()) {
      if (entry.owned) owned++;
      if (entry.expiresAt < now) expired++;
    }

    return {
      totalEntries: this.cache.size,
      ownedEntries: owned,
      expiredEntries: expired,
      hitRate: 0 // Would track actual hit rate in production
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Singleton instance
let ownershipVerifier: OwnershipVerifier | null = null;

export function getOwnershipVerifier(): OwnershipVerifier {
  if (!ownershipVerifier) {
    ownershipVerifier = new OwnershipVerifier();
  }
  return ownershipVerifier;
}
