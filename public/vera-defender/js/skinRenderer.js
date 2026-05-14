/**
 * Vera Defender Skin Renderer
 * Handles in-game skin rendering and sprite management
 * Integrates with game-optimized.js
 */

(function() {
  'use strict';

  // Skin configuration
  const SkinRenderer = {
    // Current equipped skins
    equippedSkins: {
      playerShip: 'default_player_ship',
      enemySet: null,
      bossOverrides: {},
      powerupSet: null
    },

    // Skin cache
    skinCache: new Map(),

    // Asset base path
    assetBasePath: '/vera-defender/assets/skins/',

    // Initialize skin renderer
    init: function() {
      this.loadEquippedSkins();
      this.preloadDefaultAssets();
      console.log('[SkinRenderer] Initialized');
    },

    // Load equipped skins from localStorage or API
    loadEquippedSkins: function() {
      try {
        const saved = localStorage.getItem('veraDefender_equippedSkins');
        if (saved) {
          this.equippedSkins = JSON.parse(saved);
        }
      } catch (e) {
        console.warn('[SkinRenderer] Failed to load equipped skins');
      }
    },

    // Save equipped skins
    saveEquippedSkins: function() {
      try {
        localStorage.setItem('veraDefender_equippedSkins', JSON.stringify(this.equippedSkins));
      } catch (e) {
        console.warn('[SkinRenderer] Failed to save equipped skins');
      }
    },

    // Preload default assets
    preloadDefaultAssets: function() {
      const defaultAssets = [
        'default/player_ship.png',
        'default/enemy.png',
        'default/boss.png',
        'default/powerup.png'
      ];

      defaultAssets.forEach(asset => {
        const img = new Image();
        img.src = this.assetBasePath + asset;
      });
    },

    // Get skin asset path
    getSkinAssetPath: function(skinId, category) {
      if (!skinId || skinId.startsWith('default_')) {
        return this.assetBasePath + `default/${category}.png`;
      }
      
      // Map category to folder
      const folderMap = {
        player_ship: 'ships',
        enemy: 'enemies',
        boss: 'bosses',
        powerup: 'powerups'
      };
      
      const folder = folderMap[category] || category;
      return this.assetBasePath + `${folder}/${skinId}.png`;
    },

    // Load skin image
    loadSkinImage: function(skinId, category) {
      return new Promise((resolve, reject) => {
        const cacheKey = `${category}:${skinId}`;
        
        if (this.skinCache.has(cacheKey)) {
          resolve(this.skinCache.get(cacheKey));
          return;
        }

        const img = new Image();
        img.onload = () => {
          this.skinCache.set(cacheKey, img);
          resolve(img);
        };
        img.onerror = () => {
          // Fallback to default
          const defaultImg = new Image();
          defaultImg.onload = () => resolve(defaultImg);
          defaultImg.src = this.getSkinAssetPath(null, category);
        };
        img.src = this.getSkinAssetPath(skinId, category);
      });
    },

    // Get player ship skin
    getPlayerShipSkin: function() {
      return this.equippedSkins.playerShip;
    },

    // Get enemy skin for type
    getEnemySkin: function(enemyType) {
      if (this.equippedSkins.enemySet) {
        return this.equippedSkins.enemySet;
      }
      
      // Default skins vary by enemy type
      const defaultSkins = {
        CARBON_MINION: 'default_enemy',
        GAS_GUZZLER: 'default_enemy',
        VALIDATOR: 'default_enemy'
      };
      
      return defaultSkins[enemyType] || 'default_enemy';
    },

    // Get boss skin
    getBossSkin: function(bossType) {
      return this.equippedSkins.bossOverrides[bossType] || 'default_boss';
    },

    // Get powerup skin
    getPowerupSkin: function(powerupType) {
      if (this.equippedSkins.powerupSet) {
        return this.equippedSkins.powerupSet;
      }
      return 'default_powerup';
    },

    // Render player with skin
    renderPlayer: function(ctx, x, y, width, height, options = {}) {
      const skinId = this.getPlayerShipSkin();
      
      // Try to use skin, fallback to default drawing
      this.loadSkinImage(skinId, 'player_ship').then(img => {
        ctx.drawImage(img, x, y, width, height);
      }).catch(() => {
        // Fallback to default triangle drawing
        this.renderDefaultPlayer(ctx, x, y, width, height, options);
      });
    },

    // Default player rendering (original game style)
    renderDefaultPlayer: function(ctx, x, y, width, height, options = {}) {
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width / 2, y + height - 10);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      ctx.fill();
    },

    // Render enemy with skin
    renderEnemy: function(ctx, x, y, width, height, enemyType, options = {}) {
      const skinId = this.getEnemySkin(enemyType);
      
      this.loadSkinImage(skinId, 'enemy').then(img => {
        ctx.drawImage(img, x, y, width, height);
      }).catch(() => {
        // Fallback to default triangle
        ctx.beginPath();
        ctx.moveTo(x + width / 2, y + height);
        ctx.lineTo(x, y);
        ctx.lineTo(x + width, y);
        ctx.closePath();
        ctx.fill();
      });
    },

    // Render boss with skin
    renderBoss: function(ctx, x, y, width, height, bossType, options = {}) {
      const skinId = this.getBossSkin(bossType);
      
      this.loadSkinImage(skinId, 'boss').then(img => {
        ctx.drawImage(img, x, y, width, height);
      }).catch(() => {
        // Fallback to rectangle
        ctx.fillRect(x, y, width, height);
      });
    },

    // Render powerup with skin
    renderPowerup: function(ctx, x, y, width, height, powerupType, options = {}) {
      const skinId = this.getPowerupSkin(powerupType);
      
      this.loadSkinImage(skinId, 'powerup').then(img => {
        ctx.drawImage(img, x, y, width, height);
      }).catch(() => {
        // Fallback to square
        ctx.fillRect(x, y, width, height);
      });
    },

    // Equip a skin
    equipSkin: function(skinId, slot) {
      const categoryMap = {
        playerShip: 'player_ship',
        enemySet: 'enemy',
        powerupSet: 'powerup'
      };

      if (slot === 'playerShip') {
        this.equippedSkins.playerShip = skinId;
      } else if (slot === 'enemySet') {
        this.equippedSkins.enemySet = skinId;
      } else if (slot === 'powerupSet') {
        this.equippedSkins.powerupSet = skinId;
      } else if (slot.startsWith('boss_')) {
        const bossType = slot.replace('boss_', '');
        this.equippedSkins.bossOverrides[bossType] = skinId;
      }

      this.saveEquippedSkins();
      
      // Emit event for game
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('skinEquipped', {
          detail: { skinId, slot }
        }));
      }

      console.log(`[SkinRenderer] Equipped ${skinId} to ${slot}`);
      return true;
    },

    // Unequip a skin
    unequipSkin: function(slot) {
      if (slot === 'playerShip') {
        this.equippedSkins.playerShip = 'default_player_ship';
      } else if (slot === 'enemySet') {
        this.equippedSkins.enemySet = null;
      } else if (slot === 'powerupSet') {
        this.equippedSkins.powerupSet = null;
      } else if (slot.startsWith('boss_')) {
        const bossType = slot.replace('boss_', '');
        delete this.equippedSkins.bossOverrides[bossType];
      }

      this.saveEquippedSkins();
      console.log(`[SkinRenderer] Unequipped ${slot}`);
    },

    // Get equipped skins info
    getEquippedSkinsInfo: function() {
      return {
        playerShip: this.equippedSkins.playerShip,
        enemySet: this.equippedSkins.enemySet,
        powerupSet: this.equippedSkins.powerupSet,
        bossOverrides: { ...this.equippedSkins.bossOverrides }
      };
    },

    // Clear cache
    clearCache: function() {
      this.skinCache.clear();
      console.log('[SkinRenderer] Cache cleared');
    },

    // Check if skin is equipped
    isEquipped: function(skinId) {
      if (this.equippedSkins.playerShip === skinId) return true;
      if (this.equippedSkins.enemySet === skinId) return true;
      if (this.equippedSkins.powerupSet === skinId) return true;
      return Object.values(this.equippedSkins.bossOverrides).includes(skinId);
    }
  };

  // Expose to global scope
  if (typeof window !== 'undefined') {
    window.SkinRenderer = SkinRenderer;
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => SkinRenderer.init());
    } else {
      SkinRenderer.init();
    }
  }

  // Also support module exports
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SkinRenderer;
  }
})();
