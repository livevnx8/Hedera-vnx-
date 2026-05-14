/**
 * Vera Defender Skin Registry
 * Maintains registry of all available skin NFTs with their properties
 * Maps skin IDs to in-game render configurations
 */

import { SkinRarity, type SkinNFTMetadata, type SkinAttribute } from './skinNFTContract.js';

export { SkinRarity };
import { logger } from '../../monitoring/logger.js';

// Skin categories for the game
export type SkinCategory = 'player_ship' | 'enemy' | 'boss' | 'powerup';

// Base skin definition (before minting)
export interface SkinDefinition {
  id: string;                    // Unique skin identifier
  name: string;                  // Display name
  description: string;           // Lore/flavor text
  category: SkinCategory;
  rarity: SkinRarity;
  tier: number;                  // 1-5, maps to rarity
  
  // Asset configuration
  assets: {
    spriteSheet: string;         // URL to sprite sheet
    previewImage: string;        // Static preview for marketplace
    animationPreview?: string;   // Animated preview (optional)
    pixelDimensions: { width: number; height: number };
    frameCount: number;
    animationSpeed: number;      // Frames per second
  };
  
  // Visual properties
  colors: {
    primary: string;             // Hex color
    secondary: string;
    glow?: string;               // Glow effect color
    trail?: string;              // Trail/emitter color
  };
  
  // Anime theming
  animeTheme: string;           // e.g., "Gundam", "Evangelion", "Macross"
  animeReference: string;       // Specific reference
  
  // Pricing (in HBAR - USD calculated at runtime)
  basePriceHbar: number;
  
  // Gameplay effects (cosmetic only)
  effects: {
    hasGlow: boolean;
    hasTrail: boolean;
    hasParticles: boolean;
    particleType?: 'energy' | 'fire' | 'ice' | 'electric';
  };
  
  // Metadata for NFT
  attributes: SkinAttribute[];
}

// Minted skin instance
export interface MintedSkin extends SkinDefinition {
  tokenId: string;
  serialNumber: number;
  owner: string;
  mintedAt: number;
  transactionId: string;
}

// User's equipped skins
export interface EquippedSkins {
  playerShip: string | null;    // Skin ID
  enemySet: string | null;      // Apply to all enemies
  bossOverride: Record<string, string>; // Boss type -> Skin ID
  powerupSet: string | null;    // Apply to all powerups
}

// Default skins (free, always available)
export const DEFAULT_SKINS: Record<SkinCategory, SkinDefinition> = {
  player_ship: {
    id: 'default_player_ship',
    name: 'Vera Standard',
    description: 'The classic Vera Defender vessel - reliable and proven in battle.',
    category: 'player_ship',
    rarity: SkinRarity.COMMON,
    tier: 1,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/default/player_ship.png',
      previewImage: '/vera-defender/assets/skins/default/player_ship_preview.png',
      pixelDimensions: { width: 40, height: 40 },
      frameCount: 1,
      animationSpeed: 0
    },
    colors: {
      primary: '#0f0',
      secondary: '#00aa00',
      glow: '#0f0'
    },
    animeTheme: 'Classic',
    animeReference: 'Galaga Fighter',
    basePriceHbar: 0,
    effects: {
      hasGlow: true,
      hasTrail: false,
      hasParticles: false
    },
    attributes: [
      { trait_type: 'Category', value: 'Player Ship' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Generation', value: 'Genesis' }
    ]
  },
  
  enemy: {
    id: 'default_enemy',
    name: 'Carbon Bug',
    description: 'The standard Carbon Bug - basic but numerous.',
    category: 'enemy',
    rarity: SkinRarity.COMMON,
    tier: 1,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/default/enemy.png',
      previewImage: '/vera-defender/assets/skins/default/enemy_preview.png',
      pixelDimensions: { width: 30, height: 30 },
      frameCount: 2,
      animationSpeed: 4
    },
    colors: {
      primary: '#0f0',
      secondary: '#00ff00'
    },
    animeTheme: 'Classic',
    animeReference: 'Space Invader',
    basePriceHbar: 0,
    effects: {
      hasGlow: false,
      hasTrail: false,
      hasParticles: false
    },
    attributes: [
      { trait_type: 'Category', value: 'Enemy' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Type', value: 'Carbon Minion' }
    ]
  },
  
  boss: {
    id: 'default_boss',
    name: 'Consensus Dragon',
    description: 'The mighty Consensus Dragon - guardian of the network.',
    category: 'boss',
    rarity: SkinRarity.RARE,
    tier: 2,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/default/boss.png',
      previewImage: '/vera-defender/assets/skins/default/boss_preview.png',
      pixelDimensions: { width: 120, height: 80 },
      frameCount: 4,
      animationSpeed: 6
    },
    colors: {
      primary: '#f00',
      secondary: '#ff4400',
      glow: '#ff0000'
    },
    animeTheme: 'Classic',
    animeReference: 'Boss Galaga',
    basePriceHbar: 0,
    effects: {
      hasGlow: true,
      hasTrail: false,
      hasParticles: true,
      particleType: 'fire'
    },
    attributes: [
      { trait_type: 'Category', value: 'Boss' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Boss Type', value: 'Consensus Dragon' }
    ]
  },
  
  powerup: {
    id: 'default_powerup',
    name: 'Energy Capsule',
    description: 'Standard energy capsule - power in a pill.',
    category: 'powerup',
    rarity: SkinRarity.COMMON,
    tier: 1,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/default/powerup.png',
      previewImage: '/vera-defender/assets/skins/default/powerup_preview.png',
      pixelDimensions: { width: 25, height: 25 },
      frameCount: 4,
      animationSpeed: 8
    },
    colors: {
      primary: '#0ff',
      secondary: '#00ffff',
      glow: '#0ff'
    },
    animeTheme: 'Classic',
    animeReference: 'Power Pellet',
    basePriceHbar: 0,
    effects: {
      hasGlow: true,
      hasTrail: false,
      hasParticles: true,
      particleType: 'energy'
    },
    attributes: [
      { trait_type: 'Category', value: 'Powerup' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Type', value: 'Energy' }
    ]
  }
};

// Premium skin catalog
export const PREMIUM_SKINS: SkinDefinition[] = [
  // Player Ships - Common Tier
  {
    id: 'ship_training_jet',
    name: 'Training Jet',
    description: 'A basic training vessel for new pilots. Painted in academy colors.',
    category: 'player_ship',
    rarity: SkinRarity.COMMON,
    tier: 1,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/ships/training_jet.png',
      previewImage: '/vera-defender/assets/skins/ships/training_jet_preview.png',
      pixelDimensions: { width: 40, height: 40 },
      frameCount: 2,
      animationSpeed: 4
    },
    colors: {
      primary: '#888888',
      secondary: '#aaaaaa',
      glow: '#cccccc'
    },
    animeTheme: 'Training Academy',
    animeReference: 'Top Gun Training',
    basePriceHbar: 5,
    effects: {
      hasGlow: true,
      hasTrail: false,
      hasParticles: false
    },
    attributes: [
      { trait_type: 'Category', value: 'Player Ship' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Generation', value: 'Gen 1' },
      { trait_type: 'Speed Boost', value: 0, display_type: 'boost_number' }
    ]
  },
  
  // Player Ships - Rare Tier
  {
    id: 'ship_ace_interceptor',
    name: 'Ace Interceptor',
    description: 'Customized interceptor flown by aces. Features red comet paint scheme.',
    category: 'player_ship',
    rarity: SkinRarity.RARE,
    tier: 2,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/ships/ace_interceptor.png',
      previewImage: '/vera-defender/assets/skins/ships/ace_interceptor_preview.png',
      pixelDimensions: { width: 40, height: 40 },
      frameCount: 4,
      animationSpeed: 6
    },
    colors: {
      primary: '#ff0000',
      secondary: '#cc0000',
      glow: '#ff3333',
      trail: '#ff6666'
    },
    animeTheme: 'Gundam',
    animeReference: 'Char Aznable\'s Zaku',
    basePriceHbar: 15,
    effects: {
      hasGlow: true,
      hasTrail: true,
      hasParticles: true,
      particleType: 'fire'
    },
    attributes: [
      { trait_type: 'Category', value: 'Player Ship' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Generation', value: 'Gen 1' },
      { trait_type: 'Speed Boost', value: 5, display_type: 'boost_number' }
    ]
  },
  
  // Player Ships - Epic Tier
  {
    id: 'ship_gundam_custom',
    name: 'Gundam Custom',
    description: 'A prototype mobile suit with white armor and devastating beam weapons.',
    category: 'player_ship',
    rarity: SkinRarity.EPIC,
    tier: 3,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/ships/gundam_custom.png',
      previewImage: '/vera-defender/assets/skins/ships/gundam_custom_preview.png',
      animationPreview: '/vera-defender/assets/skins/ships/gundam_custom_anim.gif',
      pixelDimensions: { width: 48, height: 48 },
      frameCount: 6,
      animationSpeed: 8
    },
    colors: {
      primary: '#ffffff',
      secondary: '#0000ff',
      glow: '#00ffff',
      trail: '#0088ff'
    },
    animeTheme: 'Gundam',
    animeReference: 'RX-78-2 Gundam',
    basePriceHbar: 50,
    effects: {
      hasGlow: true,
      hasTrail: true,
      hasParticles: true,
      particleType: 'electric'
    },
    attributes: [
      { trait_type: 'Category', value: 'Player Ship' },
      { trait_type: 'Rarity', value: 'Epic' },
      { trait_type: 'Generation', value: 'Gen 1' },
      { trait_type: 'Speed Boost', value: 10, display_type: 'boost_number' },
      { trait_type: 'Beam Damage', value: 15, display_type: 'boost_number' }
    ]
  },
  
  // Player Ships - Legendary Tier
  {
    id: 'ship_wing_zero',
    name: 'Wing Zero Custom',
    description: 'The ultimate mobile suit with twin buster rifles and ZERO System.',
    category: 'player_ship',
    rarity: SkinRarity.LEGENDARY,
    tier: 4,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/ships/wing_zero.png',
      previewImage: '/vera-defender/assets/skins/ships/wing_zero_preview.png',
      animationPreview: '/vera-defender/assets/skins/ships/wing_zero_anim.gif',
      pixelDimensions: { width: 56, height: 56 },
      frameCount: 8,
      animationSpeed: 10
    },
    colors: {
      primary: '#ffffff',
      secondary: '#000088',
      glow: '#ffff00',
      trail: '#ffdd00'
    },
    animeTheme: 'Gundam Wing',
    animeReference: 'XXXG-00W0 Wing Zero',
    basePriceHbar: 200,
    effects: {
      hasGlow: true,
      hasTrail: true,
      hasParticles: true,
      particleType: 'energy'
    },
    attributes: [
      { trait_type: 'Category', value: 'Player Ship' },
      { trait_type: 'Rarity', value: 'Legendary' },
      { trait_type: 'Generation', value: 'Gen 1' },
      { trait_type: 'Speed Boost', value: 20, display_type: 'boost_number' },
      { trait_type: 'Buster Power', value: 50, display_type: 'boost_number' }
    ]
  },
  
  // Player Ships - Mythic Tier
  {
    id: 'ship_unicorn_destroy',
    name: 'Unicorn Destroy Mode',
    description: 'The legendary Unicorn Gundam in its awakened state - NT-D activated!',
    category: 'player_ship',
    rarity: SkinRarity.MYTHIC,
    tier: 5,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/ships/unicorn_destroy.png',
      previewImage: '/vera-defender/assets/skins/ships/unicorn_destroy_preview.png',
      animationPreview: '/vera-defender/assets/skins/ships/unicorn_destroy_anim.gif',
      pixelDimensions: { width: 64, height: 64 },
      frameCount: 12,
      animationSpeed: 12
    },
    colors: {
      primary: '#ffffff',
      secondary: '#ff0000',
      glow: '#ff0088',
      trail: '#ff00ff'
    },
    animeTheme: 'Gundam Unicorn',
    animeReference: 'RX-0 Unicorn Gundam',
    basePriceHbar: 1000,
    effects: {
      hasGlow: true,
      hasTrail: true,
      hasParticles: true,
      particleType: 'energy'
    },
    attributes: [
      { trait_type: 'Category', value: 'Player Ship' },
      { trait_type: 'Rarity', value: 'Mythic' },
      { trait_type: 'Generation', value: 'Gen 1' },
      { trait_type: 'NT-D System', value: 'Active' },
      { trait_type: 'Psycommu', value: 'Max' },
      { trait_type: 'Frame', value: 'Psycho-Frame' }
    ]
  },
  
  // Enemy Skins - Epic Tier
  {
    id: 'enemy_carbon_ace',
    name: 'Carbon Ace',
    description: 'Elite Carbon Bug with custom paint and enhanced armor.',
    category: 'enemy',
    rarity: SkinRarity.EPIC,
    tier: 3,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/enemies/carbon_ace.png',
      previewImage: '/vera-defender/assets/skins/enemies/carbon_ace_preview.png',
      pixelDimensions: { width: 32, height: 32 },
      frameCount: 4,
      animationSpeed: 6
    },
    colors: {
      primary: '#8800ff',
      secondary: '#4400aa',
      glow: '#aa00ff'
    },
    animeTheme: 'Zaku',
    animeReference: 'Black Tri-Stars Zaku',
    basePriceHbar: 30,
    effects: {
      hasGlow: true,
      hasTrail: false,
      hasParticles: true,
      particleType: 'electric'
    },
    attributes: [
      { trait_type: 'Category', value: 'Enemy' },
      { trait_type: 'Rarity', value: 'Epic' },
      { trait_type: 'Type', value: 'Carbon Ace' }
    ]
  },
  
  // Boss Skins - Legendary Tier
  {
    id: 'boss_phoenix_immortal',
    name: 'Immortal Phoenix',
    description: 'A phoenix that rises from the ashes stronger each time.',
    category: 'boss',
    rarity: SkinRarity.LEGENDARY,
    tier: 4,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/bosses/phoenix_immortal.png',
      previewImage: '/vera-defender/assets/skins/bosses/phoenix_immortal_preview.png',
      pixelDimensions: { width: 128, height: 96 },
      frameCount: 8,
      animationSpeed: 8
    },
    colors: {
      primary: '#ff8800',
      secondary: '#ff4400',
      glow: '#ffaa00',
      trail: '#ff6600'
    },
    animeTheme: 'Phoenix',
    animeReference: 'Fawkes the Phoenix',
    basePriceHbar: 150,
    effects: {
      hasGlow: true,
      hasTrail: true,
      hasParticles: true,
      particleType: 'fire'
    },
    attributes: [
      { trait_type: 'Category', value: 'Boss' },
      { trait_type: 'Rarity', value: 'Legendary' },
      { trait_type: 'Boss Type', value: 'Fork Phoenix' },
      { trait_type: 'Rebirth Count', value: 'Infinite' }
    ]
  },
  
  // Powerup Skins - Rare Tier
  {
    id: 'powerup_plasma_core',
    name: 'Plasma Core',
    description: 'A compressed plasma core that boosts weapon output.',
    category: 'powerup',
    rarity: SkinRarity.RARE,
    tier: 2,
    assets: {
      spriteSheet: '/vera-defender/assets/skins/powerups/plasma_core.png',
      previewImage: '/vera-defender/assets/skins/powerups/plasma_core_preview.png',
      pixelDimensions: { width: 28, height: 28 },
      frameCount: 6,
      animationSpeed: 10
    },
    colors: {
      primary: '#ff00ff',
      secondary: '#8800ff',
      glow: '#ff00ff'
    },
    animeTheme: 'Core Energy',
    animeReference: 'GN Drive',
    basePriceHbar: 10,
    effects: {
      hasGlow: true,
      hasTrail: false,
      hasParticles: true,
      particleType: 'energy'
    },
    attributes: [
      { trait_type: 'Category', value: 'Powerup' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Type', value: 'Plasma' }
    ]
  }
];

export class SkinRegistry {
  private skins: Map<string, SkinDefinition> = new Map();
  private mintedSkins: Map<string, MintedSkin> = new Map();
  
  constructor() {
    // Register default skins
    Object.values(DEFAULT_SKINS).forEach(skin => {
      this.skins.set(skin.id, skin);
    });
    
    // Register premium skins
    PREMIUM_SKINS.forEach(skin => {
      this.skins.set(skin.id, skin);
    });
    
    logger.info('SkinRegistry', {
      defaultSkins: Object.keys(DEFAULT_SKINS).length,
      premiumSkins: PREMIUM_SKINS.length,
      message: 'Skin registry initialized'
    });
  }
  
  /**
   * Get skin by ID
   */
  getSkin(id: string): SkinDefinition | undefined {
    return this.skins.get(id);
  }
  
  /**
   * Get all skins
   */
  getAllSkins(): SkinDefinition[] {
    return Array.from(this.skins.values());
  }
  
  /**
   * Get skins by category
   */
  getSkinsByCategory(category: SkinCategory): SkinDefinition[] {
    return this.getAllSkins().filter(s => s.category === category);
  }
  
  /**
   * Get skins by rarity
   */
  getSkinsByRarity(rarity: SkinRarity): SkinDefinition[] {
    return this.getAllSkins().filter(s => s.rarity === rarity);
  }
  
  /**
   * Get skins by category and rarity
   */
  getSkinsByCategoryAndRarity(category: SkinCategory, rarity: SkinRarity): SkinDefinition[] {
    return this.getAllSkins().filter(s => s.category === category && s.rarity === rarity);
  }
  
  /**
   * Get default skin for a category
   */
  getDefaultSkin(category: SkinCategory): SkinDefinition {
    return DEFAULT_SKINS[category];
  }
  
  /**
   * Get premium skins only (excluding defaults)
   */
  getPremiumSkins(): SkinDefinition[] {
    return PREMIUM_SKINS;
  }
  
  /**
   * Register a minted skin instance
   */
  registerMintedSkin(mintedSkin: MintedSkin): void {
    this.mintedSkins.set(`${mintedSkin.tokenId}:${mintedSkin.serialNumber}`, mintedSkin);
    logger.info('SkinRegistry', {
      skinId: mintedSkin.id,
      tokenId: mintedSkin.tokenId,
      serialNumber: mintedSkin.serialNumber,
      owner: mintedSkin.owner,
      message: 'Minted skin registered'
    });
  }
  
  /**
   * Get minted skin by token ID and serial
   */
  getMintedSkin(tokenId: string, serialNumber: number): MintedSkin | undefined {
    return this.mintedSkins.get(`${tokenId}:${serialNumber}`);
  }
  
  /**
   * Get all minted skins for an owner
   */
  getMintedSkinsByOwner(owner: string): MintedSkin[] {
    return Array.from(this.mintedSkins.values()).filter(s => s.owner === owner);
  }
  
  /**
   * Generate NFT metadata for a skin
   */
  generateNFTMetadata(skin: SkinDefinition, mintNumber: number): SkinNFTMetadata {
    const rarityLabels: Record<SkinRarity, string> = {
      [SkinRarity.COMMON]: 'Common',
      [SkinRarity.RARE]: 'Rare',
      [SkinRarity.EPIC]: 'Epic',
      [SkinRarity.LEGENDARY]: 'Legendary',
      [SkinRarity.MYTHIC]: 'Mythic'
    };
    
    return {
      name: `${skin.name} #${mintNumber}`,
      description: skin.description,
      image: skin.assets.previewImage,
      animation_url: skin.assets.animationPreview,
      external_url: `https://veralattice.com/marketplace/skin/${skin.id}`,
      attributes: [
        ...skin.attributes,
        { trait_type: 'Mint Number', value: mintNumber },
        { trait_type: 'Anime Theme', value: skin.animeTheme },
        { trait_type: 'Has Glow Effect', value: skin.effects.hasGlow },
        { trait_type: 'Has Trail', value: skin.effects.hasTrail },
        { trait_type: 'Has Particles', value: skin.effects.hasParticles }
      ],
      properties: {
        category: skin.category,
        rarity: skin.rarity,
        tier: skin.tier,
        anime_theme: skin.animeTheme,
        pixel_dimensions: skin.assets.pixelDimensions,
        sprite_sheet_url: skin.assets.spriteSheet,
        frame_count: skin.assets.frameCount,
        animation_speed: skin.assets.animationSpeed
      }
    };
  }
}

// Singleton instance
let skinRegistry: SkinRegistry | null = null;

export function getSkinRegistry(): SkinRegistry {
  if (!skinRegistry) {
    skinRegistry = new SkinRegistry();
  }
  return skinRegistry;
}
