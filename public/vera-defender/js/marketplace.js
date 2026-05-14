/**
 * Vera Defender Marketplace JavaScript
 * Handles UI interactions, API calls, and purchase flow
 */

// API Base URL
const API_BASE = window.location.origin.includes('localhost') 
  ? 'http://localhost:8080' 
  : 'https://veralattice.com';

// State
let currentWallet = null;
let currentTab = 'featured';
let selectedSkin = null;
let selectedPaymentMethod = null;
let skinsCache = [];
let ownedSkinsCache = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFilters();
  initWallet();
  initModal();
  loadSkins();
  loadPromotions();
});

// Navigation
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      currentTab = tabName;
      
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(tabName).classList.add('active');
      
      if (tabName === 'inventory') {
        loadInventory();
      }
    });
  });
}

// Filters
function initFilters() {
  // Rarity filters
  document.querySelectorAll('.rarity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      filterSkins();
    });
  });
  
  // Sort
  document.getElementById('sortSelect').addEventListener('change', () => {
    sortSkins();
  });
  
  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterSkins(e.target.value);
  });
}

// Wallet
function initWallet() {
  const connectBtn = document.getElementById('connectWalletBtn');
  connectBtn.addEventListener('click', connectWallet);
}

async function connectWallet() {
  try {
    // In real implementation, this would use HashConnect or Blade Wallet SDK
    // For demo, simulate connection
    currentWallet = {
      accountId: `0.0.${Math.floor(100000 + Math.random() * 900000)}`,
      balance: 100.5
    };
    
    updateWalletUI();
    loadSkins(); // Reload with ownership info
    
    showToast('Wallet connected successfully!');
  } catch (error) {
    console.error('Wallet connection failed:', error);
    showToast('Failed to connect wallet', 'error');
  }
}

function updateWalletUI() {
  if (currentWallet) {
    document.getElementById('walletInfo').classList.add('connected');
    document.getElementById('walletAddress').textContent = 
      `${currentWallet.accountId.slice(0, 6)}...${currentWallet.accountId.slice(-4)}`;
    document.getElementById('walletBalance').textContent = 
      `${currentWallet.balance.toFixed(2)} HBAR`;
    document.getElementById('connectWalletBtn').style.display = 'none';
  }
}

// Modal
function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('skinModal').addEventListener('click', (e) => {
    if (e.target.id === 'skinModal') closeModal();
  });
  
  // Payment options
  document.querySelectorAll('.payment-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedPaymentMethod = option.dataset.method;
    });
  });
  
  // Buy button
  document.getElementById('buyBtn').addEventListener('click', handlePurchase);
  
  // Equip button
  document.getElementById('equipBtn').addEventListener('click', () => {
    if (selectedSkin) {
      equipSkin(selectedSkin.id);
    }
  });
  
  // Success actions
  document.getElementById('equipNowBtn').addEventListener('click', () => {
    document.getElementById('successOverlay').classList.remove('active');
    if (selectedSkin) {
      equipSkin(selectedSkin.id);
    }
  });
  
  document.getElementById('keepShoppingBtn').addEventListener('click', () => {
    document.getElementById('successOverlay').classList.remove('active');
  });
}

function openModal(skin) {
  selectedSkin = skin;
  selectedPaymentMethod = null;
  
  document.getElementById('modalSkinName').textContent = skin.name;
  document.getElementById('modalSkinImage').src = skin.previewImage || '/vera-defender/assets/skins/default/placeholder.png';
  
  // Build attributes
  const attrsContainer = document.getElementById('modalAttributes');
  attrsContainer.innerHTML = `
    <div class="attribute"><span class="attribute-label">Category</span><span>${skin.category}</span></div>
    <div class="attribute"><span class="attribute-label">Rarity</span><span>${skin.rarity}</span></div>
    <div class="attribute"><span class="attribute-label">Theme</span><span>${skin.animeTheme}</span></div>
    <div class="attribute"><span class="attribute-label">Frame Count</span><span>${skin.frameCount}</span></div>
  `;
  
  // Check if owned
  const isOwned = ownedSkinsCache.some(s => s.id === skin.id) || skin.basePriceHbar === 0;
  
  if (isOwned) {
    document.getElementById('paymentSection').style.display = 'none';
    document.getElementById('ownedSection').style.display = 'block';
    document.getElementById('buyBtn').style.display = 'none';
    document.getElementById('equipBtn').style.display = 'block';
    document.getElementById('modalPrice').style.display = 'none';
    
    const owned = ownedSkinsCache.find(s => s.id === skin.id);
    if (owned) {
      document.getElementById('ownedTokenId').textContent = owned.tokenId || 'N/A';
      document.getElementById('ownedMintedAt').textContent = owned.mintedAt 
        ? new Date(owned.mintedAt).toLocaleDateString() 
        : 'N/A';
    }
  } else {
    document.getElementById('paymentSection').style.display = 'block';
    document.getElementById('ownedSection').style.display = 'none';
    document.getElementById('buyBtn').style.display = 'block';
    document.getElementById('equipBtn').style.display = 'none';
    document.getElementById('modalPrice').style.display = 'block';
    
    // Prices
    const hasDiscount = skin.discountedPriceHbar !== undefined;
    const priceHbar = hasDiscount ? skin.discountedPriceHbar : skin.priceHbar;
    const priceUsd = hasDiscount ? skin.discountedPriceUsd : skin.priceUsd;
    
    document.getElementById('hbarPrice').textContent = priceHbar;
    document.getElementById('usdPrice').textContent = `$${priceUsd.toFixed(2)}`;
    document.getElementById('modalPrice').textContent = `${priceHbar} HBAR`;
    
    if (hasDiscount) {
      document.getElementById('modalPrice').innerHTML = 
        `<span style="text-decoration: line-through; opacity: 0.5;">${skin.priceHbar} HBAR</span> ${priceHbar} HBAR`;
    }
  }
  
  document.getElementById('skinModal').classList.add('active');
}

function closeModal() {
  document.getElementById('skinModal').classList.remove('active');
  selectedSkin = null;
  selectedPaymentMethod = null;
}

// Load skins
async function loadSkins() {
  try {
    // In real implementation, fetch from API
    // const response = await fetch(`${API_BASE}/api/skins/catalog?accountId=${currentWallet?.accountId || ''}`);
    // const data = await response.json();
    
    // Demo data
    const demoSkins = getDemoSkins();
    skinsCache = demoSkins;
    
    renderSkins(demoSkins);
    renderBundles();
  } catch (error) {
    console.error('Failed to load skins:', error);
    showToast('Failed to load skins', 'error');
  }
}

function getDemoSkins() {
  return [
    {
      id: 'ship_ace_interceptor',
      name: 'Ace Interceptor',
      description: 'Customized interceptor flown by aces.',
      category: 'player_ship',
      rarity: 'rare',
      animeTheme: 'Gundam',
      priceHbar: 15,
      priceUsd: 0.75,
      basePriceHbar: 15,
      previewImage: '/vera-defender/assets/skins/ships/ace_interceptor_preview.png',
      frameCount: 4,
      effects: { hasGlow: true, hasTrail: true }
    },
    {
      id: 'ship_gundam_custom',
      name: 'Gundam Custom',
      description: 'A prototype mobile suit with white armor.',
      category: 'player_ship',
      rarity: 'epic',
      animeTheme: 'Gundam',
      priceHbar: 50,
      priceUsd: 2.50,
      basePriceHbar: 50,
      previewImage: '/vera-defender/assets/skins/ships/gundam_custom_preview.png',
      frameCount: 6,
      effects: { hasGlow: true, hasTrail: true, hasParticles: true }
    },
    {
      id: 'ship_wing_zero',
      name: 'Wing Zero Custom',
      description: 'The ultimate mobile suit with twin buster rifles.',
      category: 'player_ship',
      rarity: 'legendary',
      animeTheme: 'Gundam Wing',
      priceHbar: 200,
      priceUsd: 10.00,
      basePriceHbar: 200,
      previewImage: '/vera-defender/assets/skins/ships/wing_zero_preview.png',
      frameCount: 8,
      effects: { hasGlow: true, hasTrail: true, hasParticles: true }
    },
    {
      id: 'ship_unicorn_destroy',
      name: 'Unicorn Destroy Mode',
      description: 'The legendary Unicorn Gundam in its awakened state.',
      category: 'player_ship',
      rarity: 'mythic',
      animeTheme: 'Gundam Unicorn',
      priceHbar: 1000,
      priceUsd: 50.00,
      basePriceHbar: 1000,
      previewImage: '/vera-defender/assets/skins/ships/unicorn_destroy_preview.png',
      frameCount: 12,
      effects: { hasGlow: true, hasTrail: true, hasParticles: true }
    },
    {
      id: 'enemy_carbon_ace',
      name: 'Carbon Ace',
      description: 'Elite Carbon Bug with custom paint.',
      category: 'enemy',
      rarity: 'epic',
      animeTheme: 'Zaku',
      priceHbar: 30,
      priceUsd: 1.50,
      basePriceHbar: 30,
      previewImage: '/vera-defender/assets/skins/enemies/carbon_ace_preview.png',
      frameCount: 4,
      effects: { hasGlow: true, hasParticles: true }
    },
    {
      id: 'boss_phoenix_immortal',
      name: 'Immortal Phoenix',
      description: 'A phoenix that rises from the ashes.',
      category: 'boss',
      rarity: 'legendary',
      animeTheme: 'Phoenix',
      priceHbar: 150,
      priceUsd: 7.50,
      basePriceHbar: 150,
      previewImage: '/vera-defender/assets/skins/bosses/phoenix_immortal_preview.png',
      frameCount: 8,
      effects: { hasGlow: true, hasTrail: true, hasParticles: true }
    },
    {
      id: 'powerup_plasma_core',
      name: 'Plasma Core',
      description: 'A compressed plasma core.',
      category: 'powerup',
      rarity: 'rare',
      animeTheme: 'Core Energy',
      priceHbar: 6,
      priceUsd: 0.30,
      basePriceHbar: 6,
      previewImage: '/vera-defender/assets/skins/powerups/plasma_core_preview.png',
      frameCount: 6,
      effects: { hasGlow: true, hasParticles: true }
    }
  ];
}

function renderSkins(skins) {
  // Clear grids
  ['featuredGrid', 'shipsGrid', 'enemiesGrid', 'bossesGrid', 'powerupsGrid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  
  skins.forEach(skin => {
    const card = createSkinCard(skin);
    
    // Add to appropriate grids
    if (skin.rarity === 'legendary' || skin.rarity === 'mythic') {
      document.getElementById('featuredGrid')?.appendChild(card.cloneNode(true));
    }
    
    const categoryMap = {
      player_ship: 'shipsGrid',
      enemy: 'enemiesGrid',
      boss: 'bossesGrid',
      powerup: 'powerupsGrid'
    };
    
    const gridId = categoryMap[skin.category];
    if (gridId) {
      document.getElementById(gridId)?.appendChild(card);
    }
  });
  
  // Check ownership
  if (currentWallet) {
    markOwnedSkins();
  }
}

function createSkinCard(skin) {
  const card = document.createElement('div');
  card.className = 'skin-card';
  card.dataset.skinId = skin.id;
  
  const isOwned = ownedSkinsCache.some(s => s.id === skin.id) || skin.basePriceHbar === 0;
  if (isOwned) card.classList.add('owned');
  
  const hasDiscount = skin.discountedPriceHbar !== undefined && skin.discountedPriceHbar < skin.priceHbar;
  
  card.innerHTML = `
    <div class="skin-preview">
      <img src="${skin.previewImage}" alt="${skin.name}" onerror="this.src='/vera-defender/assets/skins/default/placeholder.png'">
      <div class="rarity-badge ${skin.rarity}">${skin.rarity}</div>
    </div>
    <div class="skin-info">
      <div class="skin-name">${skin.name}</div>
      <div class="skin-theme">${skin.animeTheme}</div>
      <div class="skin-price">
        <div>
          <div class="price-hbar">${hasDiscount ? skin.discountedPriceHbar : skin.priceHbar} HBAR</div>
          <div class="price-usd">$${hasDiscount ? skin.discountedPriceUsd.toFixed(2) : skin.priceUsd.toFixed(2)}</div>
        </div>
        <button class="buy-btn" ${isOwned ? 'disabled' : ''}>
          ${isOwned ? 'Owned' : 'Buy'}
        </button>
      </div>
    </div>
  `;
  
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('buy-btn')) {
      openModal(skin);
    }
  });
  
  const buyBtn = card.querySelector('.buy-btn');
  if (!isOwned) {
    buyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(skin);
    });
  }
  
  return card;
}

function renderBundles() {
  const bundlesGrid = document.getElementById('bundlesGrid');
  if (!bundlesGrid) return;
  
  const bundles = [
    {
      id: 'starter_pack',
      name: 'Pilot Starter Pack',
      description: 'Get started with a rare ship skin and powerup set.',
      skinIds: ['ship_ace_interceptor', 'powerup_plasma_core'],
      bundlePriceHbar: 16,
      bundlePriceUsd: 0.80,
      savingsHbar: 5,
      discountPercent: 20
    },
    {
      id: 'gundam_collection',
      name: 'Gundam Collection',
      description: 'All Gundam-themed skins including legendary Wing Zero.',
      skinIds: ['ship_ace_interceptor', 'ship_gundam_custom', 'ship_wing_zero'],
      bundlePriceHbar: 200,
      bundlePriceUsd: 10.00,
      savingsHbar: 65,
      discountPercent: 25
    }
  ];
  
  bundlesGrid.innerHTML = bundles.map(bundle => `
    <div class="bundle-card">
      <div class="bundle-header">
        <div class="bundle-name">${bundle.name}</div>
        <div class="bundle-discount">-${bundle.discountPercent}%</div>
      </div>
      <p style="margin-bottom: 15px; opacity: 0.8;">${bundle.description}</p>
      <div class="bundle-skins">
        ${bundle.skinIds.map(id => {
          const skin = skinsCache.find(s => s.id === id);
          return skin ? `
            <div class="bundle-skin-thumb">
              <img src="${skin.previewImage}" alt="${skin.name}">
            </div>
          ` : '';
        }).join('')}
      </div>
      <div class="bundle-price">
        <div>
          <div class="price-hbar">${bundle.bundlePriceHbar} HBAR</div>
          <div class="bundle-savings">Save ${bundle.savingsHbar} HBAR</div>
        </div>
        <button class="buy-btn" onclick="buyBundle('${bundle.id}')">Buy Bundle</button>
      </div>
    </div>
  `).join('');
}

async function loadInventory() {
  if (!currentWallet) {
    showToast('Connect wallet to view inventory', 'warning');
    return;
  }
  
  try {
    // Simulate inventory data
    const inventory = {
      totalSkins: ownedSkinsCache.length,
      totalSpentHbar: ownedSkinsCache.reduce((sum, s) => sum + (s.basePriceHbar || 0), 0),
      favoriteCategory: ownedSkinsCache.length > 0 ? 'player_ship' : '-'
    };
    
    document.getElementById('totalSkins').textContent = inventory.totalSkins;
    document.getElementById('totalSpent').textContent = inventory.totalSpentHbar;
    document.getElementById('favoriteCategory').textContent = inventory.favoriteCategory;
    
    // Render owned skins
    const inventoryGrid = document.getElementById('inventoryGrid');
    inventoryGrid.innerHTML = ownedSkinsCache.map(skin => `
      <div class="inventory-card" data-skin-id="${skin.id}">
        <div style="height: 80px; display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
          <img src="${skin.previewImage}" alt="${skin.name}" style="max-height: 100%; image-rendering: pixelated;" onerror="this.style.display='none'">
        </div>
        <div style="font-weight: bold; margin-bottom: 5px;">${skin.name}</div>
        <div style="font-size: 12px; opacity: 0.7; text-transform: uppercase;">${skin.rarity}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load inventory:', error);
  }
}

async function loadPromotions() {
  // Show demo promotion
  document.getElementById('promoBanner').style.display = 'block';
}

// Filter and sort
function filterSkins(searchTerm = '') {
  const activeRarities = Array.from(document.querySelectorAll('.rarity-btn.active'))
    .map(btn => btn.dataset.rarity);
  
  let filtered = skinsCache;
  
  if (activeRarities.length > 0) {
    filtered = filtered.filter(s => activeRarities.includes(s.rarity));
  }
  
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.animeTheme.toLowerCase().includes(term)
    );
  }
  
  renderSkins(filtered);
}

function sortSkins() {
  const sortType = document.getElementById('sortSelect').value;
  
  const sorted = [...skinsCache].sort((a, b) => {
    switch (sortType) {
      case 'price-low':
        return (a.discountedPriceHbar || a.priceHbar) - (b.discountedPriceHbar || b.priceHbar);
      case 'price-high':
        return (b.discountedPriceHbar || b.priceHbar) - (a.discountedPriceHbar || a.priceHbar);
      case 'rarity':
        const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
        return rarityOrder[b.rarity] - rarityOrder[a.rarity];
      case 'newest':
        return 0; // Would use actual creation date
      default:
        return 0;
    }
  });
  
  renderSkins(sorted);
}

function markOwnedSkins() {
  document.querySelectorAll('.skin-card').forEach(card => {
    const skinId = card.dataset.skinId;
    const isOwned = ownedSkinsCache.some(s => s.id === skinId);
    if (isOwned) {
      card.classList.add('owned');
      const btn = card.querySelector('.buy-btn');
      if (btn) {
        btn.textContent = 'Owned';
        btn.disabled = true;
      }
    }
  });
}

// Purchase
async function handlePurchase() {
  if (!selectedSkin) return;
  if (!selectedPaymentMethod) {
    showToast('Select a payment method', 'warning');
    return;
  }
  if (!currentWallet) {
    showToast('Connect wallet first', 'warning');
    return;
  }
  
  try {
    const price = selectedSkin.discountedPriceHbar || selectedSkin.priceHbar;
    
    if (currentWallet.balance < price) {
      showToast('Insufficient HBAR balance', 'error');
      return;
    }
    
    // Simulate purchase
    showToast('Processing purchase...', 'info');
    
    setTimeout(() => {
      // Add to owned
      ownedSkinsCache.push({
        ...selectedSkin,
        tokenId: '0.0.' + Math.floor(Math.random() * 1000000),
        mintedAt: Date.now()
      });
      
      // Deduct balance
      currentWallet.balance -= price;
      updateWalletUI();
      
      // Close modal and show success
      closeModal();
      
      document.getElementById('successSkinName').textContent = selectedSkin.name;
      document.getElementById('txLink').href = `https://hashscan.io/mainnet/tx/${Date.now()}`;
      document.getElementById('successOverlay').classList.add('active');
      
      // Refresh UI
      renderSkins(skinsCache);
    }, 1500);
    
  } catch (error) {
    console.error('Purchase failed:', error);
    showToast('Purchase failed', 'error');
  }
}

async function buyBundle(bundleId) {
  if (!currentWallet) {
    showToast('Connect wallet first', 'warning');
    return;
  }
  
  showToast('Bundle purchase coming soon!', 'info');
}

async function equipSkin(skinId) {
  showToast(`Equipped ${skinId}!`, 'success');
  
  // Update equipped in inventory UI
  document.querySelectorAll('.inventory-card').forEach(card => {
    card.classList.remove('equipped');
    if (card.dataset.skinId === skinId) {
      card.classList.add('equipped');
    }
  });
}

// Utility
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 15px 25px;
    background: ${type === 'error' ? '#300' : type === 'success' ? '#030' : '#003'};
    color: ${type === 'error' ? '#f66' : type === 'success' ? '#0f0' : '#66f'};
    border: 1px solid currentColor;
    z-index: 3000;
    font-family: 'Courier New', monospace;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}
