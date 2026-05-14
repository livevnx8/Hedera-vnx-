/**
 * Carbon-Verified NFT Badge System
 * Integration with McLaren collectible drops for carbon verification badges
 */

import { Client, PrivateKey, TokenCreateTransaction, TokenMintTransaction, 
         TokenType, TokenSupplyType, CustomFixedFee, Hbar } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { raceCarbonAuditor, type CarbonCalculation } from './raceCarbonAuditor.js';
import crypto from 'crypto';

export interface CarbonBadgeMetadata {
  name: string;
  description: string;
  image: string;
  attributes: {
    trait_type: string;
    value: string | number;
  }[];
  carbon_data: {
    race_id: string;
    race_name: string;
    total_emissions_tco2e: number;
    team_emissions_tco2e: number;
    confidence_score: number;
    auditor: string;
    hcs_report_hash: string;
    timestamp: number;
  };
}

export interface MintBadgeRequest {
  raceId: string;
  raceName: string;
  recipientAddress: string;
  collectibleId: string;
  calculation: CarbonCalculation;
  hcsReportHash: string;
}

export interface CarbonBadge {
  serialNumber: number;
  metadata: CarbonBadgeMetadata;
  tokenId: string;
  mintedAt: number;
  recipient: string;
  hcsAttestation: string;
}

export class CarbonBadgeService {
  private client: Client;
  private badgeTokenId: string | null = null;
  private badges: Map<number, CarbonBadge> = new Map();
  private serialCounter = 1;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      try {
        const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
        let privateKey: PrivateKey;
        
        if (keyStr.length === 64) {
          try {
            privateKey = PrivateKey.fromStringECDSA(keyStr);
          } catch {
            privateKey = PrivateKey.fromStringED25519(keyStr);
          }
        } else {
          privateKey = PrivateKey.fromString(keyStr);
        }
        
        this.client.setOperator(
          config.HEDERA_OPERATOR_ACCOUNT_ID,
          privateKey
        );
        
        logger.info('CarbonBadgeService', {
          accountId: config.HEDERA_OPERATOR_ACCOUNT_ID,
          message: 'HCS client initialized for carbon badges',
        });
      } catch (error) {
        logger.error('CarbonBadgeService', {
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to parse private key - running in local-only mode',
        });
      }
    }
  }

  /**
   * Initialize the carbon badge NFT collection
   */
  async initializeBadgeCollection(): Promise<string | null> {
    try {
      // Create NFT collection for carbon-verified badges
      const createTx = await new TokenCreateTransaction()
        .setTokenName('McLaren Carbon-Verified Badge')
        .setTokenSymbol('MCV')
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(10000)
        .setTreasuryAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID!)
        .setAutoRenewAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID!)
        .setTokenMemo('Carbon-verified badges for McLaren Racing collectibles - audited by VeraLattice')
        .execute(this.client);

      const receipt = await createTx.getReceipt(this.client);
      this.badgeTokenId = receipt.tokenId?.toString() || null;

      logger.info('CarbonBadgeService', {
        tokenId: this.badgeTokenId,
        message: 'Carbon badge NFT collection created',
      });

      return this.badgeTokenId;
    } catch (error) {
      logger.error('CarbonBadgeService', {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to create badge collection',
      });
      return null;
    }
  }

  /**
   * Mint a carbon-verified badge for a collectible
   */
  async mintCarbonBadge(request: MintBadgeRequest): Promise<CarbonBadge | null> {
    try {
      if (!this.badgeTokenId) {
        await this.initializeBadgeCollection();
      }

      if (!this.badgeTokenId) {
        throw new Error('Badge token not initialized');
      }

      // Build badge metadata
      const metadata: CarbonBadgeMetadata = {
        name: `Carbon-Verified: ${request.raceName}`,
        description: `This badge certifies that the associated McLaren collectible for ${request.raceName} has been carbon audited by VeraLattice. Race emissions: ${request.calculation.totalEmissionsTco2e.toFixed(2)} tCO₂e.`,
        image: `https://veralattice.com/badges/carbon-verified-${request.raceId}.png`,
        attributes: [
          { trait_type: 'Race', value: request.raceName },
          { trait_type: 'Total Emissions', value: `${request.calculation.totalEmissionsTco2e.toFixed(2)} tCO₂e` },
          { trait_type: 'Team Share', value: `${request.calculation.teamSharePercentage}%` },
          { trait_type: 'Confidence', value: `${(request.calculation.confidenceScore * 100).toFixed(0)}%` },
          { trait_type: 'Auditor', value: request.calculation.auditor },
          { trait_type: 'Collectible ID', value: request.collectibleId },
        ],
        carbon_data: {
          race_id: request.raceId,
          race_name: request.raceName,
          total_emissions_tco2e: request.calculation.totalEmissionsTco2e,
          team_emissions_tco2e: request.calculation.teamEmissionsTco2e,
          confidence_score: request.calculation.confidenceScore,
          auditor: request.calculation.auditor,
          hcs_report_hash: request.hcsReportHash,
          timestamp: Date.now(),
        },
      };

      // Convert metadata to JSON and base64 encode for Hedera
      const metadataJson = JSON.stringify(metadata);
      const metadataBytes = Buffer.from(metadataJson);

      // Mint the NFT
      const mintTx = await new TokenMintTransaction()
        .setTokenId(this.badgeTokenId)
        .addMetadata(metadataBytes)
        .execute(this.client);

      const mintReceipt = await mintTx.getReceipt(this.client);
      const serialNumber = mintReceipt.serials[0].toNumber();

      // Create badge record
      const badge: CarbonBadge = {
        serialNumber,
        metadata,
        tokenId: this.badgeTokenId,
        mintedAt: Date.now(),
        recipient: request.recipientAddress,
        hcsAttestation: request.hcsReportHash,
      };

      this.badges.set(serialNumber, badge);

      logger.info('CarbonBadgeService', {
        serialNumber,
        raceId: request.raceId,
        recipient: request.recipientAddress,
        message: 'Carbon-verified badge minted',
      });

      return badge;
    } catch (error) {
      logger.error('CarbonBadgeService', {
        raceId: request.raceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to mint carbon badge',
      });
      return null;
    }
  }

  /**
   * Batch mint badges for multiple collectible buyers
   */
  async batchMintBadges(
    raceId: string,
    raceName: string,
    recipients: Array<{ address: string; collectibleId: string }>
  ): Promise<CarbonBadge[]> {
    const badges: CarbonBadge[] = [];
    
    // Get carbon calculation for this race
    const calculation = raceCarbonAuditor.getCalculation(raceId, 'RACE');
    if (!calculation) {
      throw new Error(`No carbon calculation found for race ${raceId}`);
    }

    const hcsReportHash = raceCarbonAuditor.generateHCSReport(raceId, 'RACE');
    if (!hcsReportHash) {
      throw new Error(`Failed to generate HCS report for race ${raceId}`);
    }

    for (const recipient of recipients) {
      const badge = await this.mintCarbonBadge({
        raceId,
        raceName,
        recipientAddress: recipient.address,
        collectibleId: recipient.collectibleId,
        calculation,
        hcsReportHash: (hcsReportHash as any).hash || '',
      });

      if (badge) {
        badges.push(badge);
      }
    }

    logger.info('CarbonBadgeService', {
      raceId,
      batchSize: recipients.length,
      successCount: badges.length,
      message: 'Batch badge minting complete',
    });

    return badges;
  }

  /**
   * Verify a carbon badge
   */
  async verifyBadge(serialNumber: number): Promise<{ valid: boolean; badge?: CarbonBadge; error?: string }> {
    try {
      const badge = this.badges.get(serialNumber);
      
      if (!badge) {
        return { valid: false, error: 'Badge not found' };
      }

      // Verify HCS attestation exists
      if (!badge.hcsAttestation) {
        return { valid: false, error: 'Missing HCS attestation' };
      }

      // Verify carbon data is present
      if (!badge.metadata.carbon_data) {
        return { valid: false, error: 'Missing carbon data' };
      }

      // Verify confidence score meets threshold
      if (badge.metadata.carbon_data.confidence_score < 0.8) {
        return { valid: false, error: 'Confidence score below threshold' };
      }

      return { valid: true, badge };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Verification failed' 
      };
    }
  }

  /**
   * Get badge by serial number
   */
  getBadge(serialNumber: number): CarbonBadge | undefined {
    return this.badges.get(serialNumber);
  }

  /**
   * Get all badges for a race
   */
  getBadgesByRace(raceId: string): CarbonBadge[] {
    return Array.from(this.badges.values())
      .filter(badge => badge.metadata.carbon_data.race_id === raceId);
  }

  /**
   * Get badge token ID
   */
  getBadgeTokenId(): string | null {
    return this.badgeTokenId;
  }

  /**
   * Get total badges minted
   */
  getTotalMinted(): number {
    return this.badges.size;
  }

  /**
   * Generate badge verification summary
   */
  generateVerificationSummary(raceId: string): object {
    const badges = this.getBadgesByRace(raceId);
    const calculation = raceCarbonAuditor.getCalculation(raceId, 'RACE');

    return {
      race_id: raceId,
      total_badges: badges.length,
      carbon_audited: badges.length > 0,
      total_emissions_tco2e: calculation?.totalEmissionsTco2e || 0,
      team_emissions_tco2e: calculation?.teamEmissionsTco2e || 0,
      confidence_score: calculation?.confidenceScore || 0,
      auditor: calculation?.auditor || 'vera-lattice',
      badges: badges.map(b => ({
        serial_number: b.serialNumber,
        recipient: b.recipient,
        minted_at: b.mintedAt,
      })),
    };
  }
}

// Singleton instance
export const carbonBadgeService = new CarbonBadgeService();
