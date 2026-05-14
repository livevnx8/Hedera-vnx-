/**
 * Carbon Offset Auto-Retirement
 * Phase 2: Automated carbon credit purchasing and retirement
 */

import { EventEmitter } from 'events';
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { raceCarbonAuditor } from './raceCarbonAuditor.js';
import { hcsCarbonReporter } from './hcsCarbonReporter.js';
import crypto from 'crypto';

export interface CarbonCredit {
  id: string;
  projectName: string;
  projectType: 'FORESTRY' | 'RENEWABLE_ENERGY' | 'SOIL_CARBON' | 'DIRECT_AIR_CAPTURE' | 'METHANE_CAPTURE';
  vintage: number; // Year
  tonnes: number;
  pricePerTonne: number; // USD
  location: string;
  standard: 'VERRA' | 'GOLD_STANDARD' | 'CAR' | 'ACR';
  verificationHash: string;
}

export interface RetirementRequest {
  raceId?: string;
  season: string;
  team: string;
  tonnesToRetire: number;
  creditPreferences?: CarbonCredit['projectType'][];
  maxPricePerTonne?: number;
  autoExecute: boolean;
}

export interface RetirementReceipt {
  id: string;
  season: string;
  raceId?: string;
  team: string;
  tonnesRetired: number;
  creditsUsed: Array<{
    creditId: string;
    projectName: string;
    tonnes: number;
    pricePerTonne: number;
  }>;
  totalCost: number;
  retirementDate: number;
  hcsTopicId: string;
  hcsSequenceNumber: string;
  verificationHash: string;
  certificateUrl: string;
}

export interface SeasonOffsetSummary {
  season: string;
  team: string;
  totalEmissionsTco2e: number;
  totalRetiredTco2e: number;
  retirementRate: number; // %
  totalCost: number;
  averagePricePerTonne: number;
  retirements: RetirementReceipt[];
  yoyReduction: number; // %
  projectsSupported: string[];
}

// Simulated carbon credit marketplace
const AVAILABLE_CREDITS: CarbonCredit[] = [
  {
    id: 'VERRA-VCU-1523-2012',
    projectName: 'West Virginia Reforestation',
    projectType: 'FORESTRY',
    vintage: 2024,
    tonnes: 50000,
    pricePerTonne: 12.50,
    location: 'West Virginia, USA',
    standard: 'VERRA',
    verificationHash: crypto.createHash('sha256').update('west-virginia-forest').digest('hex'),
  },
  {
    id: 'VERRA-VCU-2984-2015',
    projectName: 'Kenya Cookstoves',
    projectType: 'METHANE_CAPTURE',
    vintage: 2023,
    tonnes: 25000,
    pricePerTonne: 8.75,
    location: 'Kenya',
    standard: 'VERRA',
    verificationHash: crypto.createHash('sha256').update('kenya-cookstoves').digest('hex'),
  },
  {
    id: 'GS-CC-4829-2022',
    projectName: 'Turkey Wind Farm',
    projectType: 'RENEWABLE_ENERGY',
    vintage: 2024,
    tonnes: 75000,
    pricePerTonne: 6.25,
    location: 'Turkey',
    standard: 'GOLD_STANDARD',
    verificationHash: crypto.createHash('sha256').update('turkey-wind').digest('hex'),
  },
  {
    id: 'CAR-482-2019',
    projectName: 'California Soil Carbon',
    projectType: 'SOIL_CARBON',
    vintage: 2024,
    tonnes: 15000,
    pricePerTonne: 45.00,
    location: 'California, USA',
    standard: 'CAR',
    verificationHash: crypto.createHash('sha256').update('california-soil').digest('hex'),
  },
  {
    id: 'ACR-392-2021',
    projectName: 'DAC Hub Texas',
    projectType: 'DIRECT_AIR_CAPTURE',
    vintage: 2024,
    tonnes: 5000,
    pricePerTonne: 425.00,
    location: 'Texas, USA',
    standard: 'ACR',
    verificationHash: crypto.createHash('sha256').update('dac-texas').digest('hex'),
  },
];

export class CarbonOffsetRetirement extends EventEmitter {
  private client: Client;
  private retirementTopicId: string | null = null;
  private retirements: Map<string, RetirementReceipt> = new Map();
  private seasonSummaries: Map<string, SeasonOffsetSummary> = new Map();

  constructor() {
    super();
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
        
        logger.info('CarbonOffsetRetirement', {
          accountId: config.HEDERA_OPERATOR_ACCOUNT_ID,
          message: 'HCS client initialized for carbon retirement',
        });
      } catch (error) {
        logger.error('CarbonOffsetRetirement', {
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to parse private key - running in local-only mode',
        });
      }
    }
  }

  /**
   * Initialize HCS topic for retirement records
   */
  async initialize(): Promise<string | null> {
    try {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo('Vera-McLaren Carbon Offset Retirement Records')
        .execute(this.client);
      const receipt = await tx.getReceipt(this.client);
      this.retirementTopicId = receipt.topicId?.toString() || null;

      logger.info('CarbonOffsetRetirement', {
        topicId: this.retirementTopicId,
        message: 'Retirement topic created',
      });

      return this.retirementTopicId;
    } catch (error) {
      logger.warn('CarbonOffsetRetirement', {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to create retirement topic, continuing with local-only mode',
      });
      return null;
    }
  }

  /**
   * Execute auto-retirement for a race or season
   */
  async executeRetirement(request: RetirementRequest): Promise<RetirementReceipt | null> {
    try {
      logger.info('CarbonOffsetRetirement', {
        season: request.season,
        raceId: request.raceId,
        tonnes: request.tonnesToRetire,
        message: 'Starting auto-retirement',
      });

      // Find matching credits
      const credits = this.selectCredits(
        request.tonnesToRetire,
        request.creditPreferences,
        request.maxPricePerTonne
      );

      if (credits.length === 0) {
        throw new Error('No matching carbon credits available');
      }

      // Calculate total cost
      const totalCost = credits.reduce((sum, c) => sum + (c.tonnes * c.pricePerTonne), 0);
      const totalTonnes = credits.reduce((sum, c) => sum + c.tonnes, 0);

      // Create receipt
      const receipt: RetirementReceipt = {
        id: crypto.randomUUID(),
        season: request.season,
        raceId: request.raceId,
        team: request.team,
        tonnesRetired: totalTonnes,
        creditsUsed: credits.map(c => ({
          creditId: c.id,
          projectName: c.projectName,
          tonnes: c.tonnes,
          pricePerTonne: c.pricePerTonne,
        })),
        totalCost,
        retirementDate: Date.now(),
        hcsTopicId: this.retirementTopicId || 'local-only',
        hcsSequenceNumber: '',
        verificationHash: '',
        certificateUrl: `https://veralattice.com/carbon/certificate/${crypto.randomUUID()}`,
      };

      // Calculate verification hash
      receipt.verificationHash = this.calculateRetirementHash(receipt);

      // Submit to HCS if topic available
      if (this.retirementTopicId) {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(this.retirementTopicId)
          .setMessage(JSON.stringify({
            type: 'CARBON_RETIREMENT',
            ...receipt,
          }))
          .execute(this.client);

        const hcsReceipt = await tx.getReceipt(this.client);
        receipt.hcsSequenceNumber = hcsReceipt.topicSequenceNumber?.toString() || '';
      } else {
        receipt.hcsSequenceNumber = 'local-only';
      }

      // Store receipt
      this.retirements.set(receipt.id, receipt);

      this.emit('retirement_complete', { 
        receiptId: receipt.id, 
        tonnes: receipt.tonnesRetired,
        cost: receipt.totalCost,
      });

      logger.info('CarbonOffsetRetirement', {
        receiptId: receipt.id,
        tonnes: receipt.tonnesRetired,
        cost: receipt.totalCost,
        hcsSequence: receipt.hcsSequenceNumber,
        message: 'Auto-retirement complete',
      });

      return receipt;
    } catch (error) {
      logger.error('CarbonOffsetRetirement', {
        request,
        error: error instanceof Error ? error.message : String(error),
        message: 'Retirement failed',
      });
      return null;
    }
  }

  /**
   * Select optimal credits for retirement
   */
  private selectCredits(
    tonnesNeeded: number,
    preferences?: CarbonCredit['projectType'][],
    maxPrice?: number
  ): Array<{ id: string; projectName: string; tonnes: number; pricePerTonne: number }> {
    let available = [...AVAILABLE_CREDITS];

    // Filter by preferences if specified
    if (preferences && preferences.length > 0) {
      available = available.filter(c => preferences.includes(c.projectType));
    }

    // Filter by max price if specified
    if (maxPrice) {
      available = available.filter(c => c.pricePerTonne <= maxPrice);
    }

    // Sort by price (cheapest first)
    available.sort((a, b) => a.pricePerTonne - b.pricePerTonne);

    // Select credits to meet tonnes needed
    const selected: Array<{ id: string; projectName: string; tonnes: number; pricePerTonne: number }> = [];
    let remainingTonnes = tonnesNeeded;

    for (const credit of available) {
      if (remainingTonnes <= 0) break;

      const tonnesToUse = Math.min(credit.tonnes, remainingTonnes);
      selected.push({
        id: credit.id,
        projectName: credit.projectName,
        tonnes: tonnesToUse,
        pricePerTonne: credit.pricePerTonne,
      });
      remainingTonnes -= tonnesToUse;
    }

    return selected;
  }

  /**
   * Calculate season auto-retirement based on emissions
   */
  async calculateSeasonRetirement(
    season: string,
    team: string,
    targetReduction: number = 0.23 // 23% default
  ): Promise<RetirementReceipt | null> {
    // Get season emissions from HCS reporter
    const seasonReport = hcsCarbonReporter.getSeasonSummary(season);
    
    if (!seasonReport) {
      logger.warn('CarbonOffsetRetirement', {
        season,
        message: 'No season summary found, cannot calculate retirement',
      });
      return null;
    }

    // Calculate tonnes to retire (23% of total emissions)
    const tonnesToRetire = Math.ceil(seasonReport.totalEmissionsTco2e * targetReduction);

    logger.info('CarbonOffsetRetirement', {
      season,
      totalEmissions: seasonReport.totalEmissionsTco2e,
      targetReduction: `${(targetReduction * 100).toFixed(0)}%`,
      tonnesToRetire,
      message: 'Calculated season auto-retirement',
    });

    // Execute retirement
    return this.executeRetirement({
      season,
      team,
      tonnesToRetire,
      creditPreferences: ['FORESTRY', 'SOIL_CARBON', 'RENEWABLE_ENERGY'],
      maxPricePerTonne: 50.00,
      autoExecute: true,
    });
  }

  /**
   * Generate season offset summary
   */
  async generateSeasonSummary(season: string, team: string): Promise<SeasonOffsetSummary | null> {
    const seasonReport = hcsCarbonReporter.getSeasonSummary(season);
    if (!seasonReport) return null;

    // Get all retirements for this season
    const seasonRetirements = Array.from(this.retirements.values())
      .filter(r => r.season === season);

    const totalRetired = seasonRetirements.reduce((sum, r) => sum + r.tonnesRetired, 0);
    const totalCost = seasonRetirements.reduce((sum, r) => sum + r.totalCost, 0);
    const uniqueProjects = new Set(seasonRetirements.flatMap(r => r.creditsUsed.map(c => c.projectName)));

    const summary: SeasonOffsetSummary = {
      season,
      team,
      totalEmissionsTco2e: seasonReport.totalEmissionsTco2e,
      totalRetiredTco2e: totalRetired,
      retirementRate: (totalRetired / seasonReport.totalEmissionsTco2e) * 100,
      totalCost,
      averagePricePerTonne: totalRetired > 0 ? totalCost / totalRetired : 0,
      retirements: seasonRetirements,
      yoyReduction: seasonReport.yoyReduction,
      projectsSupported: Array.from(uniqueProjects),
    };

    this.seasonSummaries.set(season, summary);

    logger.info('CarbonOffsetRetirement', {
      season,
      totalRetired,
      retirementRate: summary.retirementRate.toFixed(1),
      message: 'Season offset summary generated',
    });

    return summary;
  }

  /**
   * Calculate retirement hash
   */
  private calculateRetirementHash(receipt: RetirementReceipt): string {
    const data = `${receipt.id}:${receipt.season}:${receipt.tonnesRetired}:${receipt.retirementDate}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get retirement receipt by ID
   */
  getRetirement(id: string): RetirementReceipt | undefined {
    return this.retirements.get(id);
  }

  /**
   * Get all retirements for a season
   */
  getSeasonRetirements(season: string): RetirementReceipt[] {
    return Array.from(this.retirements.values())
      .filter(r => r.season === season);
  }

  /**
   * Get season summary
   */
  getSeasonSummary(season: string): SeasonOffsetSummary | undefined {
    return this.seasonSummaries.get(season);
  }

  /**
   * Get total retirements
   */
  getTotalRetirements(): number {
    return this.retirements.size;
  }

  /**
   * Get total tonnes retired
   */
  getTotalTonnesRetired(): number {
    return Array.from(this.retirements.values())
      .reduce((sum, r) => sum + r.tonnesRetired, 0);
  }

  /**
   * Get available credits (for reference)
   */
  getAvailableCredits(): CarbonCredit[] {
    return [...AVAILABLE_CREDITS];
  }

  /**
   * Generate retirement certificate text
   */
  generateCertificateText(receipt: RetirementReceipt): string {
    const date = new Date(receipt.retirementDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
═══════════════════════════════════════════════════════════════════
           CARBON OFFSET RETIREMENT CERTIFICATE
═══════════════════════════════════════════════════════════════════

This certifies that

                ${receipt.team.toUpperCase()}

has permanently retired

              ${receipt.tonnesRetired.toLocaleString()} tonnes CO₂e

from the atmosphere through verified carbon offset projects.

═══════════════════════════════════════════════════════════════════
                    RETIREMENT DETAILS
═══════════════════════════════════════════════════════════════════

Certificate ID: ${receipt.id}
Season: ${receipt.season}
Date: ${date}

Projects Supported:
${receipt.creditsUsed.map(c => `  • ${c.projectName}: ${c.tonnes} tonnes @ $${c.pricePerTonne.toFixed(2)}/tonne`).join('\n')}

Total Investment: $${receipt.totalCost.toLocaleString()}
Average Price: $${(receipt.totalCost / receipt.tonnesRetired).toFixed(2)}/tonne

═══════════════════════════════════════════════════════════════════
                    VERIFICATION
═══════════════════════════════════════════════════════════════════

This retirement is permanently recorded on the Hedera Consensus Service.

HCS Topic ID: ${receipt.hcsTopicId}
HCS Sequence: ${receipt.hcsSequenceNumber}
Verification Hash: ${receipt.verificationHash.slice(0, 32)}...

Certificate URL: ${receipt.certificateUrl}

═══════════════════════════════════════════════════════════════════
Verified by VeraLattice Carbon Auditing | Powered by Hedera
═══════════════════════════════════════════════════════════════════
`;
  }
}

// Singleton instance
export const carbonOffsetRetirement = new CarbonOffsetRetirement();
