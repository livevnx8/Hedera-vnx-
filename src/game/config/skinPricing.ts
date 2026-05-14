/**
 * Vera Defender Skin Pricing Configuration
 * Pricing tiers for all skin categories and rarities
 * HBAR prices with USD conversion rates
 */

import { SkinRarity } from '../nft/skinNFTContract.js';
import type { SkinCategory } from '../nft/skinRegistry.js';

export interface PriceTier {
  hbar: number;
  usd: number;
  label: string;
}

export interface CategoryPricing {
  common: PriceTier;
  rare: PriceTier;
  epic: PriceTier;
  legendary: PriceTier;
  mythic: PriceTier;
}

// Skin pricing by category and rarity
export const SKIN_PRICING: Record<SkinCategory, CategoryPricing> = {
  player_ship: {
    common: { hbar: 5, usd: 0.25, label: 'Training Gear' },
    rare: { hbar: 15, usd: 0.75, label: 'Pilot Suit' },
    epic: { hbar: 50, usd: 2.50, label: 'Ace Custom' },
    legendary: { hbar: 200, usd: 10.00, label: 'Gundam Prototype' },
    mythic: { hbar: 1000, usd: 50.00, label: 'Evangelion Unit' }
  },
  enemy: {
    common: { hbar: 3, usd: 0.15, label: 'Grunt Unit' },
    rare: { hbar: 10, usd: 0.50, label: 'Elite Squad' },
    epic: { hbar: 35, usd: 1.75, label: 'Ace Corps' },
    legendary: { hbar: 150, usd: 7.50, label: 'Royal Guard' },
    mythic: { hbar: 750, usd: 37.50, label: 'Immortal Legion' }
  },
  boss: {
    common: { hbar: 8, usd: 0.40, label: 'Lesser Beast' },
    rare: { hbar: 25, usd: 1.25, label: 'Greater Beast' },
    epic: { hbar: 80, usd: 4.00, label: 'Elder Beast' },
    legendary: { hbar: 300, usd: 15.00, label: 'Ancient One' },
    mythic: { hbar: 1500, usd: 75.00, label: 'Primordial' }
  },
  powerup: {
    common: { hbar: 2, usd: 0.10, label: 'Energy Capsule' },
    rare: { hbar: 6, usd: 0.30, label: 'Plasma Core' },
    epic: { hbar: 20, usd: 1.00, label: 'S2 Engine' },
    legendary: { hbar: 80, usd: 4.00, label: 'Angel Core' },
    mythic: { hbar: 400, usd: 20.00, label: 'Fruit of Life' }
  }
};

// Bundle pricing for sets
export interface BundleConfig {
  id: string;
  name: string;
  description: string;
  skinIds: string[];
  discountPercent: number;
  bundlePriceHbar: number;
  bundlePriceUsd: number;
}

export const SKIN_BUNDLES: BundleConfig[] = [
  {
    id: 'starter_pack',
    name: 'Pilot Starter Pack',
    description: 'Get started with a rare ship skin and powerup set at a discount',
    skinIds: ['ship_ace_interceptor', 'powerup_plasma_core'],
    discountPercent: 20,
    bundlePriceHbar: 16, // 15 + 10 = 25, -20% = 20, rounded
    bundlePriceUsd: 0.80
  },
  {
    id: 'gundam_collection',
    name: 'Gundam Collection',
    description: 'All Gundam-themed skins including legendary Wing Zero',
    skinIds: ['ship_ace_interceptor', 'ship_gundam_custom', 'ship_wing_zero'],
    discountPercent: 25,
    bundlePriceHbar: 200, // 15 + 50 + 200 = 265, -25% = 198.75
    bundlePriceUsd: 10.00
  },
  {
    id: 'complete_enemy_set',
    name: 'Enemy Overhaul',
    description: 'Transform all enemies with the epic Carbon Ace skin',
    skinIds: ['enemy_carbon_ace'],
    discountPercent: 0,
    bundlePriceHbar: 30,
    bundlePriceUsd: 1.50
  },
  {
    id: 'mythic_ultimate',
    name: 'Ultimate Collection',
    description: 'The ultimate skin collection - all mythic and legendary items',
    skinIds: ['ship_unicorn_destroy', 'boss_phoenix_immortal'],
    discountPercent: 15,
    bundlePriceHbar: 1275, // 1000 + 150 = 1150, -15% = 977.5
    bundlePriceUsd: 63.75
  }
];

// Special promotions
export interface Promotion {
  id: string;
  name: string;
  description: string;
  discountPercent: number;
  applicableCategories?: SkinCategory[];
  applicableRarities?: SkinRarity[];
  skinIds?: string[];
  startTime: number;
  endTime: number;
  maxUses?: number;
  usesRemaining?: number;
  code?: string; // Promo code required
}

export const ACTIVE_PROMOTIONS: Promotion[] = [
  {
    id: 'launch_sale',
    name: 'Launch Week Sale',
    description: '50% off all skins for launch week!',
    discountPercent: 50,
    startTime: Date.now(),
    endTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    maxUses: 1000
  },
  {
    id: 'new_player_bonus',
    name: 'New Pilot Bonus',
    description: 'First skin purchase 75% off!',
    discountPercent: 75,
    applicableRarities: [SkinRarity.COMMON, SkinRarity.RARE],
    startTime: Date.now(),
    endTime: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    maxUses: 1
  }
];

// HBAR/USD conversion rate
export let HBAR_USD_RATE = 0.05; // Default: 1 HBAR = $0.05

export function updateHbarUsdRate(newRate: number): void {
  HBAR_USD_RATE = newRate;
}

export function hbarToUsd(hbar: number): number {
  return hbar * HBAR_USD_RATE;
}

export function usdToHbar(usd: number): number {
  return usd / HBAR_USD_RATE;
}

export function getPriceForSkin(category: SkinCategory, rarity: SkinRarity): PriceTier {
  return SKIN_PRICING[category][rarity];
}

export function calculateDiscountedPrice(
  basePriceHbar: number,
  discountPercent: number
): { hbar: number; usd: number } {
  const discountedHbar = Math.ceil(basePriceHbar * (1 - discountPercent / 100));
  return {
    hbar: discountedHbar,
    usd: hbarToUsd(discountedHbar)
  };
}

export function getApplicablePromotions(
  category?: SkinCategory,
  rarity?: SkinRarity,
  skinId?: string,
  isFirstPurchase: boolean = false
): Promotion[] {
  const now = Date.now();
  
  return ACTIVE_PROMOTIONS.filter(promo => {
    // Check time validity
    if (now < promo.startTime || now > promo.endTime) return false;
    
    // Check uses remaining
    if (promo.usesRemaining !== undefined && promo.usesRemaining <= 0) return false;
    
    // Check category match
    if (promo.applicableCategories && category && !promo.applicableCategories.includes(category)) {
      return false;
    }
    
    // Check rarity match
    if (promo.applicableRarities && rarity && !promo.applicableRarities.includes(rarity)) {
      return false;
    }
    
    // Check skin ID match
    if (promo.skinIds && skinId && !promo.skinIds.includes(skinId)) {
      return false;
    }
    
    // First purchase only promotions
    if (promo.id === 'new_player_bonus' && !isFirstPurchase) {
      return false;
    }
    
    return true;
  });
}

export function getBestPromotion(
  category?: SkinCategory,
  rarity?: SkinRarity,
  skinId?: string,
  isFirstPurchase: boolean = false
): Promotion | null {
  const applicable = getApplicablePromotions(category, rarity, skinId, isFirstPurchase);
  if (applicable.length === 0) return null;
  
  // Return the one with highest discount
  return applicable.reduce((best, current) => 
    current.discountPercent > best.discountPercent ? current : best
  );
}

export function formatPrice(hbar: number, usd: number): string {
  return `${hbar} HBAR (~$${usd.toFixed(2)})`;
}
