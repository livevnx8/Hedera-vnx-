/**
 * Vera Defender Skin NFT Contract
 * Hedera Token Service (HTS) NFT collection management for game skins
 * HIP-412 compliant metadata with anime-themed naming
 */

import {
  Client,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenAssociateTransaction,
  PrivateKey,
  AccountId,
  TransactionReceipt,
  TokenInfoQuery,
  TokenNftInfoQuery,
  NftId,
  Hbar
} from '@hashgraph/sdk';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// Skin rarity tiers with anime-themed naming
export enum SkinRarity {
  COMMON = 'common',           // Training Gear
  RARE = 'rare',              // Pilot Suit
  EPIC = 'epic',              // Ace Custom
  LEGENDARY = 'legendary',   // Gundam Prototype
  MYTHIC = 'mythic'          // Evangelion Unit
}

export interface SkinNFTMetadata {
  name: string;
  description: string;
  image: string;              // IPFS/Arweave URL
  animation_url?: string;     // Optional animated version
  external_url: string;     // Link to marketplace
  attributes: SkinAttribute[];
  properties: {
    category: 'player_ship' | 'enemy' | 'boss' | 'powerup';
    rarity: SkinRarity;
    tier: number;
    anime_theme: string;
    pixel_dimensions: { width: number; height: number };
    sprite_sheet_url: string;
    frame_count: number;
    animation_speed: number;
  };
}

export interface SkinAttribute {
  trait_type: string;
  value: string | number | boolean;
  display_type?: 'number' | 'boost_number' | 'boost_percentage';
}

export interface SkinNFT {
  tokenId: string;
  serialNumber: number;
  metadata: SkinNFTMetadata;
  owner: string;
  mintedAt: number;
}

export interface CreateCollectionResult {
  tokenId: string;
  transactionId: string;
  success: boolean;
}

export class SkinNFTContract {
  private client: Client;
  private operatorKey: PrivateKey;
  private collectionTokenId: string | null = null;
  private readonly treasuryAccountId: string;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    const privateKeyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
    if (!privateKeyStr) {
      throw new Error('HEDERA_OPERATOR_PRIVATE_KEY not configured');
    }
    
    this.operatorKey = privateKeyStr.length === 64
      ? PrivateKey.fromStringECDSA(privateKeyStr.replace(/^0x/, ''))
      : PrivateKey.fromString(privateKeyStr.replace(/^0x/, ''));
    
    const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!operatorId) {
      throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
    }
    
    this.client.setOperator(operatorId, this.operatorKey);
    this.treasuryAccountId = operatorId;
  }

  /**
   * Create the Vera Defender Skin NFT Collection
   * Called once during initial setup
   */
  async createCollection(): Promise<CreateCollectionResult> {
    try {
      logger.info('SkinNFT', { message: 'Creating skin NFT collection...' });

      const tx = await new TokenCreateTransaction()
        .setTokenName('Vera Defender Skins')
        .setTokenSymbol('VDSKIN')
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Infinite)
        .setDecimals(0)
        .setInitialSupply(0)
        .setTreasuryAccountId(this.treasuryAccountId)
        .setAdminKey(this.operatorKey.publicKey)
        .setSupplyKey(this.operatorKey.publicKey)
        .setFreezeKey(this.operatorKey.publicKey)
        .setWipeKey(this.operatorKey.publicKey)
        .setTokenMemo('Vera Defender Game Skins - Retro Pixel Anime Collection')
        .setMaxTransactionFee(new Hbar(10))
        .execute(this.client);

      const receipt = await tx.getReceipt(this.client);
      const tokenId = receipt.tokenId?.toString();

      if (!tokenId) {
        throw new Error('Failed to create collection - no token ID returned');
      }

      this.collectionTokenId = tokenId;

      logger.info('SkinNFT', {
        tokenId,
        transactionId: tx.transactionId.toString(),
        message: 'Skin NFT collection created successfully'
      });

      return {
        tokenId,
        transactionId: tx.transactionId.toString(),
        success: true
      };
    } catch (error) {
      logger.error('SkinNFT', {
        error: String(error),
        message: 'Failed to create skin NFT collection'
      });
      throw error;
    }
  }

  /**
   * Mint a new skin NFT to a buyer's account
   */
  async mintSkin(
    buyerAccountId: string,
    metadata: SkinNFTMetadata
  ): Promise<{ serialNumber: number; transactionId: string }> {
    if (!this.collectionTokenId) {
      throw new Error('Collection not initialized. Call createCollection() or setCollectionTokenId() first');
    }

    try {
      // First, ensure buyer is associated with the token
      await this.associateToken(buyerAccountId);

      // Prepare metadata JSON
      const metadataJson = JSON.stringify(metadata);
      const metadataBytes = Buffer.from(metadataJson);

      // Mint the NFT
      const mintTx = await new TokenMintTransaction()
        .setTokenId(this.collectionTokenId)
        .setMetadata([metadataBytes])
        .setMaxTransactionFee(new Hbar(2))
        .execute(this.client);

      const mintReceipt = await mintTx.getReceipt(this.client);
      const serialNumber = mintReceipt.serials[0]?.toNumber();

      if (!serialNumber) {
        throw new Error('Failed to mint NFT - no serial number returned');
      }

      // Transfer to buyer
      const { TransferTransaction } = await import('@hashgraph/sdk');
      const transferTx = await new TransferTransaction()
        .addNftTransfer(this.collectionTokenId, serialNumber, this.treasuryAccountId, buyerAccountId)
        .setMaxTransactionFee(new Hbar(1))
        .execute(this.client);

      await transferTx.getReceipt(this.client);

      logger.info('SkinNFT', {
        tokenId: this.collectionTokenId,
        serialNumber,
        buyer: buyerAccountId,
        skinName: metadata.name,
        rarity: metadata.properties.rarity,
        message: 'Skin NFT minted and transferred'
      });

      return {
        serialNumber,
        transactionId: mintTx.transactionId.toString()
      };
    } catch (error) {
      logger.error('SkinNFT', {
        error: String(error),
        buyer: buyerAccountId,
        message: 'Failed to mint skin NFT'
      });
      throw error;
    }
  }

  /**
   * Associate token with an account (required before receiving NFTs)
   */
  private async associateToken(accountId: string): Promise<void> {
    if (!this.collectionTokenId) return;

    try {
      const associateTx = await new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([this.collectionTokenId])
        .setMaxTransactionFee(new Hbar(1))
        .execute(this.client);

      await associateTx.getReceipt(this.client);
    } catch (error) {
      // Token might already be associated, which is fine
      if (!String(error).includes('TOKEN_ALREADY_ASSOCIATED')) {
        throw error;
      }
    }
  }

  /**
   * Get NFT info by serial number
   */
  async getNFTInfo(serialNumber: number): Promise<SkinNFT | null> {
    if (!this.collectionTokenId) {
      throw new Error('Collection not initialized');
    }

    try {
      const nftId = new NftId(
        AccountId.fromString(this.collectionTokenId),
        serialNumber
      );

      const query = new TokenNftInfoQuery()
        .setNftId(nftId);

      const info = await query.execute(this.client);

      if (!info || info.length === 0) {
        return null;
      }

      const nftInfo = info[0];
      const metadata = JSON.parse(nftInfo.metadata.toString()) as SkinNFTMetadata;

      return {
        tokenId: this.collectionTokenId,
        serialNumber,
        metadata,
        owner: nftInfo.accountId.toString(),
        mintedAt: nftInfo.creationTime.toDate().getTime()
      };
    } catch (error) {
      logger.error('SkinNFT', {
        error: String(error),
        serialNumber,
        message: 'Failed to get NFT info'
      });
      return null;
    }
  }

  /**
   * Set collection token ID (for existing collections)
   */
  setCollectionTokenId(tokenId: string): void {
    this.collectionTokenId = tokenId;
  }

  /**
   * Get collection token ID
   */
  getCollectionTokenId(): string | null {
    return this.collectionTokenId;
  }

  /**
   * Generate anime-themed skin name based on category and rarity
   */
  generateSkinName(category: string, rarity: SkinRarity, index: number): string {
    const animeThemes: Record<string, Record<SkinRarity, string[]>> = {
      player_ship: {
        [SkinRarity.COMMON]: ['Training Jet', 'Cadet Cruiser', 'Rookie Raider'],
        [SkinRarity.RARE]: ['Ace Interceptor', 'Veteran Vanguard', 'Elite Evasion'],
        [SkinRarity.EPIC]: ['Gundam Custom', 'Evangelion Proto', 'Macross Valiant'],
        [SkinRarity.LEGENDARY]: ['Wing Zero Custom', 'Unit-01 Berserk', 'VF-1S Super'],
        [SkinRarity.MYTHIC]: ['Unicorn Destroy Mode', 'Evangelion 13', 'YF-19 Excalibur']
      },
      enemy: {
        [SkinRarity.COMMON]: ['Carbon Grunt', 'Gas Mook', 'Validator Minion'],
        [SkinRarity.RARE]: ['Carbon Soldier', 'Gas Warrior', 'Validator Knight'],
        [SkinRarity.EPIC]: ['Carbon Ace', 'Gas Berserker', 'Validator Paladin'],
        [SkinRarity.LEGENDARY]: ['Carbon Overlord', 'Gas Tyrant', 'Validator Sovereign'],
        [SkinRarity.MYTHIC]: ['Carbon Harbinger', 'Gas Annihilator', 'Validator Deity']
      },
      boss: {
        [SkinRarity.COMMON]: ['Lesser Kraken', 'Young Phoenix', 'Golem Spawn'],
        [SkinRarity.RARE]: ['Kraken Adult', 'Phoenix Rising', 'Golem Crusher'],
        [SkinRarity.EPIC]: ['Kraken Lord', 'Phoenix Reborn', 'Golem Titan'],
        [SkinRarity.LEGENDARY]: ['Kraken Emperor', 'Immortal Phoenix', 'World Golem'],
        [SkinRarity.MYTHIC]: ['Kraken Genesis', 'Phoenix Eternal', 'Cosmic Golem']
      },
      powerup: {
        [SkinRarity.COMMON]: ['Energy Orb', 'Shield Bubble', 'Ammo Box'],
        [SkinRarity.RARE]: ['Plasma Core', 'Barrier Field', 'Hyper Magazine'],
        [SkinRarity.EPIC]: ['Positron Sphere', 'AT Field', 'Buster Cell'],
        [SkinRarity.LEGENDARY]: ['S2 Engine', 'Absolute Terror', 'Twin Buster'],
        [SkinRarity.MYTHIC]: ['Laplace\'s Box', 'Third Impact', 'ZERO System']
      }
    };

    const themes = animeThemes[category]?.[rarity] || ['Unknown'];
    return themes[index % themes.length];
  }
}

// Singleton instance
let skinNFTContract: SkinNFTContract | null = null;

export function getSkinNFTContract(): SkinNFTContract {
  if (!skinNFTContract) {
    skinNFTContract = new SkinNFTContract();
  }
  return skinNFTContract;
}
