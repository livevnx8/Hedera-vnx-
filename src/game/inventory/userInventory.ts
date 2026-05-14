/**
 * Vera Defender User Inventory Manager
 * Manages user's skin inventory, equipped skins, and preferences
 * Persists data to database
 */

import { logger } from '../../monitoring/logger.js';
import { getSkinRegistry, type SkinCategory, type MintedSkin, DEFAULT_SKINS } from '../nft/skinRegistry.js';
import { getOwnershipVerifier } from './ownershipVerifier.js';

export interface EquippedSkins {
  playerShip: string;           // Skin ID for player ship
  enemySet: string | null;      // Skin set for all enemies (null = defaults vary by type)
  bossOverrides: Record<string, string>; // bossType -> skinId
  powerupSet: string | null;    // Skin set for all powerups
}

export interface UserInventoryData {
  accountId: string;
  ownedSkinIds: string[];
  equipped: EquippedSkins;
  favorites: string[];
  totalPlayTimeWithSkins: number;
  achievements: string[];
  createdAt: number;
  updatedAt: number;
}

export interface InventoryStats {
  totalSkins: number;
  byCategory: Record<SkinCategory, number>;
  byRarity: Record<string, number>;
  totalValueHbar: number;
  favoriteSkin?: string;
  mostUsedSkin?: string;
}

export class UserInventory {
  private registry = getSkinRegistry();
  private verifier = getOwnershipVerifier();
  private inventories: Map<string, UserInventoryData> = new Map();
  private skinUsageStats: Map<string, Map<string, number>> = new Map(); // accountId -> skinId -> useCount

  /**
   * Get or create inventory for an account
   */
  async getInventory(accountId: string): Promise<UserInventoryData> {
    // Check memory cache first
    let inventory = this.inventories.get(accountId);
    
    if (!inventory) {
      // Create default inventory
      inventory = await this.createDefaultInventory(accountId);
      this.inventories.set(accountId, inventory);
    }

    // Sync with actual ownership
    await this.syncOwnership(accountId, inventory);

    return inventory;
  }

  /**
   * Create default inventory
   */
  private async createDefaultInventory(accountId: string): Promise<UserInventoryData> {
    const inventory: UserInventoryData = {
      accountId,
      ownedSkinIds: [],
      equipped: {
        playerShip: DEFAULT_SKINS.player_ship.id,
        enemySet: null,
        bossOverrides: {},
        powerupSet: null
      },
      favorites: [],
      totalPlayTimeWithSkins: 0,
      achievements: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Query for owned skins
    const ownedSkins = await this.verifier.getAllOwnedSkins(accountId);
    inventory.ownedSkinIds = ownedSkins.map(s => s.id);

    // If they own any player ships, auto-equip the best one
    const ownedShips = ownedSkins.filter(s => s.category === 'player_ship');
    if (ownedShips.length > 0) {
      // Sort by tier (rarity) and equip the highest
      const bestShip = ownedShips.sort((a, b) => b.tier - a.tier)[0];
      inventory.equipped.playerShip = bestShip.id;
    }

    logger.info('UserInventory', {
      accountId,
      ownedSkins: inventory.ownedSkinIds.length,
      message: 'Default inventory created'
    });

    return inventory;
  }

  /**
   * Sync inventory with actual NFT ownership
   */
  private async syncOwnership(
    accountId: string,
    inventory: UserInventoryData
  ): Promise<void> {
    const ownedSkins = await this.verifier.getAllOwnedSkins(accountId);
    const ownedIds = new Set(ownedSkins.map(s => s.id));

    // Add newly owned skins
    for (const skinId of ownedIds as Set<string>) {
      if (!inventory.ownedSkinIds.includes(skinId)) {
        inventory.ownedSkinIds.push(skinId);
        logger.info('UserInventory', {
          accountId,
          skinId,
          message: 'New skin added to inventory'
        });
      }
    }

    const beforeCount = inventory.ownedSkinIds.length;
    inventory.ownedSkinIds = inventory.ownedSkinIds.filter(id => {
      const stillOwned = ownedIds.has(id as string);
      if (!stillOwned) {
        logger.info('UserInventory', {
          accountId,
          skinId: id as string,
          message: 'Skin removed from inventory (no longer owned)'
        });
      }
      return stillOwned;
    });

    // If equipped skin was removed, revert to default
    if (!ownedIds.has(inventory.equipped.playerShip)) {
      inventory.equipped.playerShip = DEFAULT_SKINS.player_ship.id;
    }

    if (inventory.ownedSkinIds.length !== beforeCount) {
      inventory.updatedAt = Date.now();
    }
  }

  /**
   * Equip a skin
   */
  async equipSkin(
    accountId: string,
    skinId: string,
    slot: keyof EquippedSkins | string
  ): Promise<boolean> {
    const inventory = await this.getInventory(accountId);
    const skin = this.registry.getSkin(skinId);

    if (!skin) {
      logger.warn('UserInventory', {
        accountId,
        skinId,
        message: 'Cannot equip - skin not found'
      });
      return false;
    }

    // Verify ownership
    if (!inventory.ownedSkinIds.includes(skinId)) {
      // Check default skins
      if (skin.basePriceHbar > 0) {
        logger.warn('UserInventory', {
          accountId,
          skinId,
          message: 'Cannot equip - skin not owned'
        });
        return false;
      }
    }

    // Validate slot matches category
    if (slot === 'playerShip' && skin.category !== 'player_ship') {
      logger.warn('UserInventory', {
        accountId,
        skinId,
        slot,
        message: 'Cannot equip - wrong category for slot'
      });
      return false;
    }

    if (slot === 'enemySet' && skin.category !== 'enemy') {
      return false;
    }

    if (slot === 'powerupSet' && skin.category !== 'powerup') {
      return false;
    }

    if (skin.category === 'boss' && !slot.toString().startsWith('boss_')) {
      return false;
    }

    // Update equipped
    if (slot === 'playerShip') {
      inventory.equipped.playerShip = skinId;
    } else if (slot === 'enemySet') {
      inventory.equipped.enemySet = skinId;
    } else if (slot === 'powerupSet') {
      inventory.equipped.powerupSet = skinId;
    } else if (slot.toString().startsWith('boss_')) {
      const bossType = slot.toString().replace('boss_', '');
      inventory.equipped.bossOverrides[bossType] = skinId;
    }

    inventory.updatedAt = Date.now();

    // Track usage
    this.trackSkinUse(accountId, skinId);

    logger.info('UserInventory', {
      accountId,
      skinId,
      slot,
      message: 'Skin equipped'
    });

    return true;
  }

  /**
   * Get currently equipped skins
   */
  async getEquippedSkins(accountId: string): Promise<EquippedSkins> {
    const inventory = await this.getInventory(accountId);
    return inventory.equipped;
  }

  /**
   * Get skin for a specific boss type
   */
  async getBossSkin(accountId: string, bossType: string): Promise<string> {
    const equipped = await this.getEquippedSkins(accountId);
    return equipped.bossOverrides[bossType] || DEFAULT_SKINS.boss.id;
  }

  /**
   * Track skin usage
   */
  trackSkinUse(accountId: string, skinId: string): void {
    let accountStats = this.skinUsageStats.get(accountId);
    if (!accountStats) {
      accountStats = new Map();
      this.skinUsageStats.set(accountId, accountStats);
    }

    const current = accountStats.get(skinId) || 0;
    accountStats.set(skinId, current + 1);
  }

  /**
   * Get inventory statistics
   */
  async getStats(accountId: string): Promise<InventoryStats> {
    const inventory = await this.getInventory(accountId);
    const ownedSkins = inventory.ownedSkinIds
      .map(id => this.registry.getSkin(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    const byCategory: Record<string, number> = {
      player_ship: 0,
      enemy: 0,
      boss: 0,
      powerup: 0
    };

    const byRarity: Record<string, number> = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 0
    };

    let totalValue = 0;
    for (const skin of ownedSkins) {
      byCategory[skin.category]++;
      byRarity[skin.rarity]++;
      totalValue += skin.basePriceHbar;
    }

    // Get most used skin
    const usageStats = this.skinUsageStats.get(accountId);
    let mostUsed: string | undefined;
    let maxUses = 0;

    if (usageStats) {
      for (const [skinId, uses] of usageStats) {
        if (uses > maxUses) {
          maxUses = uses;
          mostUsed = skinId;
        }
      }
    }

    return {
      totalSkins: ownedSkins.length,
      byCategory: byCategory as Record<SkinCategory, number>,
      byRarity,
      totalValueHbar: totalValue,
      favoriteSkin: inventory.favorites[0],
      mostUsedSkin: mostUsed
    };
  }

  /**
   * Add skin to favorites
   */
  async addFavorite(accountId: string, skinId: string): Promise<boolean> {
    const inventory = await this.getInventory(accountId);
    
    if (!inventory.ownedSkinIds.includes(skinId)) {
      return false;
    }

    if (!inventory.favorites.includes(skinId)) {
      inventory.favorites.unshift(skinId);
      inventory.updatedAt = Date.now();
    }

    return true;
  }

  /**
   * Remove skin from favorites
   */
  async removeFavorite(accountId: string, skinId: string): Promise<boolean> {
    const inventory = await this.getInventory(accountId);
    
    const index = inventory.favorites.indexOf(skinId);
    if (index > -1) {
      inventory.favorites.splice(index, 1);
      inventory.updatedAt = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Unlock achievement
   */
  async unlockAchievement(accountId: string, achievementId: string): Promise<boolean> {
    const inventory = await this.getInventory(accountId);
    
    if (!inventory.achievements.includes(achievementId)) {
      inventory.achievements.push(achievementId);
      inventory.updatedAt = Date.now();
      
      logger.info('UserInventory', {
        accountId,
        achievementId,
        message: 'Achievement unlocked'
      });
      
      return true;
    }

    return false;
  }

  /**
   * Update play time
   */
  async addPlayTime(accountId: string, durationMs: number): Promise<void> {
    const inventory = await this.getInventory(accountId);
    inventory.totalPlayTimeWithSkins += durationMs;
    inventory.updatedAt = Date.now();
  }

  /**
   * Get all accounts with inventories (for admin)
   */
  getAllInventories(): UserInventoryData[] {
    return Array.from(this.inventories.values());
  }

  /**
   * Clear inventory (for testing/debugging)
   */
  clearInventory(accountId: string): void {
    this.inventories.delete(accountId);
    this.skinUsageStats.delete(accountId);
    
    logger.info('UserInventory', {
      accountId,
      message: 'Inventory cleared'
    });
  }
}

// Singleton instance
let userInventory: UserInventory | null = null;

export function getUserInventory(): UserInventory {
  if (!userInventory) {
    userInventory = new UserInventory();
  }
  return userInventory;
}
