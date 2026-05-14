/**
 * Vera Defender Skin Store
 * Backend API for skin marketplace operations
 * Catalog management, purchases, bundles, and inventory
 */

import { getSkinRegistry, type SkinDefinition, type SkinCategory, type MintedSkin, DEFAULT_SKINS } from '../nft/skinRegistry.js';
import { getSkinPaymentHandler, type PaymentMethod } from './paymentHandler.js';
import { getMintingService } from '../nft/mintingService.js';
import { SKIN_PRICING, SKIN_BUNDLES, getApplicablePromotions, calculateDiscountedPrice, hbarToUsd, type BundleConfig } from '../config/skinPricing.js';
import { SkinRarity } from '../nft/skinNFTContract.js';
import { logger } from '../../monitoring/logger.js';

export interface SkinCatalogItem extends SkinDefinition {
  priceHbar: number;
  priceUsd: number;
  discountPercent: number;
  discountedPriceHbar?: number;
  discountedPriceUsd?: number;
  isOwned: boolean;
  canPurchase: boolean;
}

export interface BundleOffer {
  bundle: BundleConfig;
  savingsHbar: number;
  savingsUsd: number;
  savingsPercent: number;
  allSkinsOwned: boolean;
}

export interface StoreCatalog {
  featured: SkinCatalogItem[];
  playerShips: SkinCatalogItem[];
  enemies: SkinCatalogItem[];
  bosses: SkinCatalogItem[];
  powerups: SkinCatalogItem[];
  bundles: BundleOffer[];
  activePromotions: {
    id: string;
    name: string;
    discountPercent: number;
    description: string;
  }[];
}

export interface PurchaseRequest {
  skinId: string;
  buyerAccountId: string;
  paymentMethod: PaymentMethod;
  promoCode?: string;
}

export interface PurchaseResult {
  success: boolean;
  skinId?: string;
  paymentId?: string;
  transactionId?: string;
  tokenId?: string;
  serialNumber?: number;
  amountPaidHbar?: number;
  amountPaidUsd?: number;
  error?: string;
}

export interface UserInventory {
  accountId: string;
  ownedSkins: MintedSkin[];
  equippedSkins: {
    playerShip: string;
    enemySet: string | null;
    bossOverrides: Record<string, string>;
    powerupSet: string | null;
  };
  totalSpentHbar: number;
  totalSkinsOwned: number;
  favoriteCategory: SkinCategory | null;
}

export class SkinStore {
  private registry = getSkinRegistry();
  private paymentHandler = getSkinPaymentHandler();
  private mintingService = getMintingService();

  /**
   * Get the full store catalog for a user
   */
  async getCatalog(
    buyerAccountId: string,
    isFirstPurchase: boolean = false
  ): Promise<StoreCatalog> {
    const allSkins = this.registry.getPremiumSkins();
    const ownedSkins = this.registry.getMintedSkinsByOwner(buyerAccountId);
    const ownedSkinIds = new Set(ownedSkins.map(s => s.id));

    // Build catalog items with pricing and ownership info
    const buildCatalogItem = (skin: SkinDefinition): SkinCatalogItem => {
      const pricing = SKIN_PRICING[skin.category][skin.rarity];
      const promotions = getApplicablePromotions(skin.category, skin.rarity, skin.id, isFirstPurchase);
      const bestDiscount = promotions.length > 0 ? Math.max(...promotions.map(p => p.discountPercent)) : 0;

      const item: SkinCatalogItem = {
        ...skin,
        priceHbar: pricing.hbar,
        priceUsd: pricing.usd,
        discountPercent: bestDiscount,
        isOwned: ownedSkinIds.has(skin.id),
        canPurchase: skin.basePriceHbar > 0 && !ownedSkinIds.has(skin.id)
      };

      if (bestDiscount > 0) {
        const discounted = calculateDiscountedPrice(pricing.hbar, bestDiscount);
        item.discountedPriceHbar = discounted.hbar;
        item.discountedPriceUsd = discounted.usd;
      }

      return item;
    };

    // Get featured items (limited time, popular, or new)
    const featured = allSkins
      .filter(s => s.rarity === SkinRarity.LEGENDARY || s.rarity === SkinRarity.MYTHIC)
      .slice(0, 4)
      .map(buildCatalogItem);

    // Categorized items
    const playerShips = allSkins
      .filter(s => s.category === 'player_ship')
      .map(buildCatalogItem);

    const enemies = allSkins
      .filter(s => s.category === 'enemy')
      .map(buildCatalogItem);

    const bosses = allSkins
      .filter(s => s.category === 'boss')
      .map(buildCatalogItem);

    const powerups = allSkins
      .filter(s => s.category === 'powerup')
      .map(buildCatalogItem);

    // Bundle offers
    const bundles: BundleOffer[] = SKIN_BUNDLES.map(bundle => {
      const bundleSkinIds = new Set(bundle.skinIds);
      const allOwned = bundle.skinIds.every(id => ownedSkinIds.has(id));
      
      // Calculate original price
      const originalPrice = bundle.skinIds.reduce((sum, id) => {
        const skin = this.registry.getSkin(id);
        return sum + (skin?.basePriceHbar || 0);
      }, 0);

      return {
        bundle,
        savingsHbar: originalPrice - bundle.bundlePriceHbar,
        savingsUsd: hbarToUsd(originalPrice - bundle.bundlePriceHbar),
        savingsPercent: bundle.discountPercent,
        allSkinsOwned: allOwned
      };
    });

    // Active promotions
    const allPromotions = getApplicablePromotions(undefined, undefined, undefined, isFirstPurchase);
    const activePromotions = allPromotions.map(p => ({
      id: p.id,
      name: p.name,
      discountPercent: p.discountPercent,
      description: p.description
    }));

    return {
      featured,
      playerShips,
      enemies,
      bosses,
      powerups,
      bundles,
      activePromotions
    };
  }

  /**
   * Purchase a skin
   */
  async purchase(request: PurchaseRequest): Promise<PurchaseResult> {
    const startTime = Date.now();

    try {
      const skin = this.registry.getSkin(request.skinId);
      if (!skin) {
        return { success: false, error: 'Skin not found' };
      }

      if (skin.basePriceHbar === 0) {
        return { success: false, error: 'Default skins cannot be purchased' };
      }

      // Check if already owned
      const ownedSkins = this.registry.getMintedSkinsByOwner(request.buyerAccountId);
      if (ownedSkins.some(s => s.id === request.skinId)) {
        return { success: false, error: 'Skin already owned' };
      }

      // Create payment intent
      const isFirstPurchase = ownedSkins.length === 0;
      const { intentId, amountHbar, amountUsd } = await this.paymentHandler.createPaymentIntent(
        request.skinId,
        request.buyerAccountId,
        request.paymentMethod,
        isFirstPurchase
      );

      // Process payment (immediate for now, could be async for x402)
      const paymentResult = await this.paymentHandler.processPayment(intentId);

      if (!paymentResult.success) {
        return {
          success: false,
          error: paymentResult.error || 'Payment failed'
        };
      }

      const result: PurchaseResult = {
        success: true,
        skinId: request.skinId,
        paymentId: paymentResult.paymentId,
        transactionId: paymentResult.transactionId,
        amountPaidHbar: amountHbar,
        amountPaidUsd: amountUsd
      };

      // Add minting info if successful
      if (paymentResult.mintResult?.success) {
        result.tokenId = paymentResult.mintResult.tokenId;
        result.serialNumber = paymentResult.mintResult.serialNumber;
      }

      logger.info('SkinStore', {
        skinId: request.skinId,
        buyer: request.buyerAccountId,
        amountHbar,
        paymentMethod: request.paymentMethod,
        processingTime: Date.now() - startTime,
        message: 'Skin purchase completed'
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('SkinStore', {
        skinId: request.skinId,
        buyer: request.buyerAccountId,
        error: errorMessage,
        message: 'Skin purchase failed'
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Purchase a bundle
   */
  async purchaseBundle(
    bundleId: string,
    buyerAccountId: string,
    paymentMethod: PaymentMethod
  ): Promise<PurchaseResult[]> {
    const bundle = SKIN_BUNDLES.find(b => b.id === bundleId);
    if (!bundle) {
      return [{ success: false, error: 'Bundle not found' }];
    }

    const results: PurchaseResult[] = [];

    for (const skinId of bundle.skinIds) {
      const result = await this.purchase({
        skinId,
        buyerAccountId,
        paymentMethod
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Get user inventory
   */
  async getUserInventory(accountId: string): Promise<UserInventory> {
    const ownedSkins = this.registry.getMintedSkinsByOwner(accountId);
    
    // Calculate favorite category
    const categoryCounts: Record<string, number> = {};
    for (const skin of ownedSkins) {
      categoryCounts[skin.category] = (categoryCounts[skin.category] || 0) + 1;
    }
    
    let favoriteCategory: SkinCategory | null = null;
    let maxCount = 0;
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > maxCount) {
        maxCount = count;
        favoriteCategory = cat as SkinCategory;
      }
    }

    // Calculate total spent
    const totalSpentHbar = ownedSkins.reduce((sum, skin) => sum + skin.basePriceHbar, 0);

    return {
      accountId,
      ownedSkins,
      equippedSkins: {
        playerShip: ownedSkins.find(s => s.category === 'player_ship')?.id || DEFAULT_SKINS.player_ship.id,
        enemySet: null,
        bossOverrides: {},
        powerupSet: null
      },
      totalSpentHbar,
      totalSkinsOwned: ownedSkins.length,
      favoriteCategory
    };
  }

  /**
   * Equip a skin
   */
  async equipSkin(
    accountId: string,
    skinId: string,
    slot: 'playerShip' | 'enemySet' | 'powerupSet' | string
  ): Promise<boolean> {
    const skin = this.registry.getSkin(skinId);
    if (!skin) return false;

    // Verify ownership
    const ownedSkins = this.registry.getMintedSkinsByOwner(accountId);
    if (!ownedSkins.some(s => s.id === skinId)) {
      return false;
    }

    // Validate category matches slot
    if (slot === 'playerShip' && skin.category !== 'player_ship') return false;
    if (slot === 'enemySet' && skin.category !== 'enemy') return false;
    if (slot === 'powerupSet' && skin.category !== 'powerup') return false;
    if (skin.category === 'boss' && !slot.startsWith('boss_')) return false;

    // In a real implementation, this would update a database
    // For now, we just log the equip action
    logger.info('SkinStore', {
      accountId,
      skinId,
      slot,
      message: 'Skin equipped'
    });

    return true;
  }

  /**
   * Get skin preview data
   */
  async getSkinPreview(skinId: string): Promise<{
    skin: SkinDefinition;
    previewUrl: string;
    animationUrl?: string;
    stats: {
      totalMinted: number;
      owners: number;
      rarity: string;
    };
  } | null> {
    const skin = this.registry.getSkin(skinId);
    if (!skin) return null;

    const mintCount = this.mintingService.getMintCount(skinId);
    const mintedSkins = this.registry.getMintedSkinsByOwner(''); // This would need a real query

    return {
      skin,
      previewUrl: skin.assets.previewImage,
      animationUrl: skin.assets.animationPreview,
      stats: {
        totalMinted: mintCount,
        owners: mintedSkins.filter(s => s.id === skinId).length,
        rarity: skin.rarity
      }
    };
  }

  /**
   * Apply promo code
   */
  async applyPromoCode(
    promoCode: string,
    skinId: string,
    buyerAccountId: string
  ): Promise<{ valid: boolean; discountPercent: number; message: string }> {
    // In a real implementation, this would validate promo codes
    // For now, return generic response
    return {
      valid: false,
      discountPercent: 0,
      message: 'Promo code system coming soon'
    };
  }
}

// Singleton instance
let skinStore: SkinStore | null = null;

export function getSkinStore(): SkinStore {
  if (!skinStore) {
    skinStore = new SkinStore();
  }
  return skinStore;
}
