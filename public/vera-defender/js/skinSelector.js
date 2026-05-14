/**
 * Vera Defender Skin Selector
 * Pre-game skin selection interface
 * Allows players to choose equipped skins before starting
 */

(function() {
  'use strict';

  const SkinSelector = {
    // State
    currentCategory: 'player_ship',
    ownedSkins: [],
    equippedSkins: {},
    isOpen: false,

    // Initialize
    init: function() {
      this.loadOwnedSkins();
      this.loadEquippedSkins();
      this.injectStyles();
      console.log('[SkinSelector] Initialized');
    },

    // Load owned skins from storage/API
    loadOwnedSkins: function() {
      try {
        const saved = localStorage.getItem('veraDefender_ownedSkins');
        if (saved) {
          this.ownedSkins = JSON.parse(saved);
        }
      } catch (e) {
        this.ownedSkins = [];
      }

      // Always include default skins
      const defaultSkins = [
        { id: 'default_player_ship', name: 'Vera Standard', category: 'player_ship', rarity: 'common', basePriceHbar: 0 },
        { id: 'default_enemy', name: 'Carbon Bug', category: 'enemy', rarity: 'common', basePriceHbar: 0 },
        { id: 'default_boss', name: 'Consensus Dragon', category: 'boss', rarity: 'rare', basePriceHbar: 0 },
        { id: 'default_powerup', name: 'Energy Capsule', category: 'powerup', rarity: 'common', basePriceHbar: 0 }
      ];

      // Merge defaults with owned
      defaultSkins.forEach(defaultSkin => {
        if (!this.ownedSkins.find(s => s.id === defaultSkin.id)) {
          this.ownedSkins.unshift(defaultSkin);
        }
      });
    },

    // Load equipped skins
    loadEquippedSkins: function() {
      try {
        const saved = localStorage.getItem('veraDefender_equippedSkins');
        if (saved) {
          this.equippedSkins = JSON.parse(saved);
        } else {
          this.equippedSkins = {
            playerShip: 'default_player_ship',
            enemySet: null,
            powerupSet: null,
            bossOverrides: {}
          };
        }
      } catch (e) {
        this.equippedSkins = {
          playerShip: 'default_player_ship',
          enemySet: null,
          powerupSet: null,
          bossOverrides: {}
        };
      }
    },

    // Save equipped skins
    saveEquippedSkins: function() {
      try {
        localStorage.setItem('veraDefender_equippedSkins', JSON.stringify(this.equippedSkins));
      } catch (e) {
        console.warn('[SkinSelector] Failed to save equipped skins');
      }
    },

    // Inject CSS styles
    injectStyles: function() {
      if (document.getElementById('skin-selector-styles')) return;

      const styles = `
        .skin-selector-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.95);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        
        .skin-selector-overlay.active {
          display: flex;
        }
        
        .skin-selector {
          background: #001100;
          border: 2px solid #0f0;
          width: 90%;
          max-width: 900px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        }
        
        .skin-selector-header {
          padding: 20px;
          border-bottom: 1px solid #0f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .skin-selector-title {
          font-size: 24px;
          font-weight: bold;
          color: #0f0;
          text-shadow: 0 0 10px #0f0;
        }
        
        .skin-selector-close {
          background: none;
          border: none;
          color: #0f0;
          font-size: 28px;
          cursor: pointer;
        }
        
        .skin-selector-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        
        .skin-categories {
          width: 150px;
          border-right: 1px solid #0f0;
          padding: 10px;
        }
        
        .category-btn {
          width: 100%;
          padding: 12px;
          margin-bottom: 5px;
          background: transparent;
          border: 1px solid #0f0;
          color: #0f0;
          cursor: pointer;
          font-family: 'Courier New', monospace;
          text-transform: uppercase;
          transition: all 0.3s;
        }
        
        .category-btn:hover,
        .category-btn.active {
          background: #0f0;
          color: #000;
        }
        
        .skin-list {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 15px;
        }
        
        .skin-item {
          background: #000;
          border: 1px solid #0f0;
          padding: 10px;
          cursor: pointer;
          transition: all 0.3s;
          text-align: center;
        }
        
        .skin-item:hover {
          border-color: #0f0;
          box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
        }
        
        .skin-item.selected {
          border-color: #ff0;
          box-shadow: 0 0 15px rgba(255, 255, 0, 0.5);
        }
        
        .skin-item.owned {
          border-color: #0f0;
        }
        
        .skin-item.not-owned {
          opacity: 0.5;
          border-color: #555;
        }
        
        .skin-thumb {
          width: 100%;
          height: 80px;
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 10px;
          background: #001100;
        }
        
        .skin-thumb img {
          max-width: 90%;
          max-height: 90%;
          image-rendering: pixelated;
        }
        
        .skin-name {
          font-size: 12px;
          color: #0f0;
          margin-bottom: 5px;
        }
        
        .skin-rarity {
          font-size: 10px;
          text-transform: uppercase;
        }
        
        .skin-rarity.common { color: #888; }
        .skin-rarity.rare { color: #0088ff; }
        .skin-rarity.epic { color: #8800ff; }
        .skin-rarity.legendary { color: #ff8800; }
        .skin-rarity.mythic { color: #ff0088; }
        
        .equipped-badge {
          display: none;
          font-size: 10px;
          color: #ff0;
          margin-top: 5px;
        }
        
        .skin-item.selected .equipped-badge {
          display: block;
        }
        
        .skin-preview-panel {
          width: 250px;
          border-left: 1px solid #0f0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .preview-title {
          font-size: 14px;
          color: #0f0;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .preview-image {
          width: 200px;
          height: 200px;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #000;
          border: 1px solid #0f0;
          margin-bottom: 20px;
        }
        
        .preview-image img {
          max-width: 90%;
          max-height: 90%;
          image-rendering: pixelated;
        }
        
        .preview-info {
          text-align: center;
          font-size: 12px;
          color: #0f0;
          margin-bottom: 20px;
        }
        
        .equip-btn {
          width: 100%;
          padding: 12px;
          background: #0f0;
          color: #000;
          border: none;
          cursor: pointer;
          font-family: 'Courier New', monospace;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .equip-btn:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
        }
        
        .equip-btn:hover:not(:disabled) {
          box-shadow: 0 0 15px #0f0;
        }
        
        .market-link {
          margin-top: 10px;
          font-size: 12px;
          color: #0f0;
          text-decoration: underline;
          cursor: pointer;
        }
        
        .skin-selector-footer {
          padding: 15px 20px;
          border-top: 1px solid #0f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .selected-skins-summary {
          font-size: 12px;
          color: #0f0;
        }
        
        .start-game-btn {
          padding: 15px 40px;
          background: #0f0;
          color: #000;
          border: none;
          cursor: pointer;
          font-family: 'Courier New', monospace;
          font-size: 18px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .start-game-btn:hover {
          box-shadow: 0 0 20px #0f0;
        }
      `;

      const styleEl = document.createElement('style');
      styleEl.id = 'skin-selector-styles';
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    },

    // Create selector HTML
    createSelectorHTML: function() {
      const overlay = document.createElement('div');
      overlay.id = 'skinSelectorOverlay';
      overlay.className = 'skin-selector-overlay';
      
      overlay.innerHTML = `
        <div class="skin-selector">
          <div class="skin-selector-header">
            <div class="skin-selector-title">Choose Your Skins</div>
            <button class="skin-selector-close" onclick="SkinSelector.close()">&times;</button>
          </div>
          <div class="skin-selector-body">
            <div class="skin-categories">
              <button class="category-btn active" data-category="player_ship" onclick="SkinSelector.selectCategory('player_ship')">Ships</button>
              <button class="category-btn" data-category="enemy" onclick="SkinSelector.selectCategory('enemy')">Enemies</button>
              <button class="category-btn" data-category="boss" onclick="SkinSelector.selectCategory('boss')">Bosses</button>
              <button class="category-btn" data-category="powerup" onclick="SkinSelector.selectCategory('powerup')">Powerups</button>
            </div>
            <div class="skin-list" id="skinList">
              <!-- Dynamic -->
            </div>
            <div class="skin-preview-panel">
              <div class="preview-title">Preview</div>
              <div class="preview-image" id="previewImage">
                <img src="/vera-defender/assets/skins/default/player_ship.png" alt="Preview">
              </div>
              <div class="preview-info" id="previewInfo">
                Select a skin to preview
              </div>
              <button class="equip-btn" id="equipBtn" onclick="SkinSelector.equipSelected()">Equip</button>
              <div class="market-link" onclick="window.open('/vera-defender/marketplace.html', '_blank')">
                Visit Marketplace →
              </div>
            </div>
          </div>
          <div class="skin-selector-footer">
            <div class="selected-skins-summary" id="skinsSummary">
              Ship: Vera Standard
            </div>
            <button class="start-game-btn" onclick="SkinSelector.startGame()">Start Game</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
    },

    // Open selector
    open: function() {
      if (!document.getElementById('skinSelectorOverlay')) {
        this.createSelectorHTML();
      }
      
      this.isOpen = true;
      document.getElementById('skinSelectorOverlay').classList.add('active');
      this.renderSkinList();
      this.updateSummary();
    },

    // Close selector
    close: function() {
      this.isOpen = false;
      document.getElementById('skinSelectorOverlay').classList.remove('active');
    },

    // Select category
    selectCategory: function(category) {
      this.currentCategory = category;
      
      document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
      });
      
      this.renderSkinList();
    },

    // Render skin list for current category
    renderSkinList: function() {
      const list = document.getElementById('skinList');
      if (!list) return;

      const skins = this.ownedSkins.filter(s => s.category === this.currentCategory);
      
      list.innerHTML = skins.map(skin => {
        const isSelected = this.isEquipped(skin.id, this.currentCategory);
        const rarityClass = skin.rarity || 'common';
        
        return `
          <div class="skin-item ${isSelected ? 'selected' : ''} ${skin.basePriceHbar === 0 ? '' : 'owned'}" 
               data-skin-id="${skin.id}"
               onclick="SkinSelector.selectSkin('${skin.id}')">
            <div class="skin-thumb">
              <img src="/vera-defender/assets/skins/${this.getCategoryFolder(skin.category)}/${skin.id}.png" 
                   alt="${skin.name}"
                   onerror="this.src='/vera-defender/assets/skins/default/${skin.category}.png'">
            </div>
            <div class="skin-name">${skin.name}</div>
            <div class="skin-rarity ${rarityClass}">${skin.rarity}</div>
            <div class="equipped-badge">✓ EQUIPPED</div>
          </div>
        `;
      }).join('');
    },

    // Get category folder
    getCategoryFolder: function(category) {
      const map = {
        player_ship: 'ships',
        enemy: 'enemies',
        boss: 'bosses',
        powerup: 'powerups'
      };
      return map[category] || category;
    },

    // Check if skin is equipped
    isEquipped: function(skinId, category) {
      if (category === 'player_ship') {
        return this.equippedSkins.playerShip === skinId;
      }
      if (category === 'enemy') {
        return this.equippedSkins.enemySet === skinId;
      }
      if (category === 'powerup') {
        return this.equippedSkins.powerupSet === skinId;
      }
      if (category === 'boss') {
        return Object.values(this.equippedSkins.bossOverrides || {}).includes(skinId);
      }
      return false;
    },

    // Select a skin
    selectSkin: function(skinId) {
      // Update selection UI
      document.querySelectorAll('.skin-item').forEach(item => {
        item.classList.remove('selected');
      });
      
      const selected = document.querySelector(`.skin-item[data-skin-id="${skinId}"]`);
      if (selected) {
        selected.classList.add('selected');
      }

      // Update preview
      const skin = this.ownedSkins.find(s => s.id === skinId);
      if (skin) {
        const previewImg = document.querySelector('#previewImage img');
        previewImg.src = `/vera-defender/assets/skins/${this.getCategoryFolder(skin.category)}/${skin.id}.png`;
        previewImg.onerror = () => {
          previewImg.src = `/vera-defender/assets/skins/default/${skin.category}.png`;
        };
        
        document.getElementById('previewInfo').innerHTML = `
          <strong>${skin.name}</strong><br>
          ${skin.animeTheme || 'Classic'} Theme<br>
          ${skin.rarity?.toUpperCase() || 'COMMON'} Rarity
        `;
      }

      this.selectedSkinId = skinId;
    },

    // Equip selected skin
    equipSelected: function() {
      if (!this.selectedSkinId) return;

      const slotMap = {
        player_ship: 'playerShip',
        enemy: 'enemySet',
        powerup: 'powerupSet',
        boss: 'bossOverrides'
      };

      const slot = slotMap[this.currentCategory];
      if (slot) {
        this.equippedSkins[slot] = this.selectedSkinId;
        this.saveEquippedSkins();
        
        // Update UI
        this.renderSkinList();
        this.updateSummary();
        
        // Sync with renderer if available
        if (window.SkinRenderer) {
          window.SkinRenderer.equipSkin(this.selectedSkinId, slot);
        }
        
        console.log(`[SkinSelector] Equipped ${this.selectedSkinId} to ${slot}`);
      }
    },

    // Update summary
    updateSummary: function() {
      const skin = this.ownedSkins.find(s => s.id === this.equippedSkins.playerShip);
      const shipName = skin ? skin.name : 'Vera Standard';
      
      document.getElementById('skinsSummary').textContent = `Ship: ${shipName}`;
    },

    // Start game
    startGame: function() {
      this.close();
      
      // Dispatch event for game
      window.dispatchEvent(new CustomEvent('skinSelectionComplete', {
        detail: { equippedSkins: this.equippedSkins }
      }));
      
      // Trigger game start if function exists
      if (typeof startGame === 'function') {
        startGame();
      }
    }
  };

  // Expose to global scope
  if (typeof window !== 'undefined') {
    window.SkinSelector = SkinSelector;
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => SkinSelector.init());
    } else {
      SkinSelector.init();
    }
  }
})();
