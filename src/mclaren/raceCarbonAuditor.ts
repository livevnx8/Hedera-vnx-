/**
 * Race Carbon Auditor
 * F1 telemetry ingestion and carbon emission analysis for McLaren Racing
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import crypto from 'crypto';

// Telemetry data interfaces
export interface TireTelemetry {
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';
  degradationRate: number; // % per lap
  lapsRemaining: number;
  optimalTemp: number;
  currentTemp: number;
  pressure: number;
}

export interface FuelTelemetry {
  currentLevel: number; // kg
  consumptionPerLap: number; // kg/lap
  optimalBurnRate: number; // kg/lap
  remainingLaps: number;
  leanMixEnabled: boolean;
}

export interface RouteLogistics {
  freightDistance: number; // km
  transportMode: 'air' | 'sea' | 'road';
  cargoWeight: number; // kg
  fuelType: 'jet_a' | 'marine_diesel' | 'diesel';
}

export interface PitOperations {
  pitStopCount: number;
  avgStopDuration: number; // seconds
  equipmentPowerDraw: number; // kWh per stop
  personnelCount: number;
}

export interface RaceTelemetry {
  raceId: string;
  raceName: string;
  circuit: string;
  date: string;
  team: string;
  session: 'FP1' | 'FP2' | 'FP3' | 'QUALIFYING' | 'RACE' | 'SPRINT';
  tires: TireTelemetry;
  fuel: FuelTelemetry;
  logistics: RouteLogistics;
  pitOps: PitOperations;
  lapCount: number;
  trackLength: number; // km
  timestamp: number;
}

// Carbon calculation result
export interface CarbonCalculation {
  raceId: string;
  timestamp: number;
  totalEmissionsKg: number;
  totalEmissionsTco2e: number;
  breakdown: {
    fuelEmissions: number;
    tireEmissions: number;
    logisticsEmissions: number;
    pitOperationsEmissions: number;
  };
  teamSharePercentage: number;
  teamEmissionsTco2e: number;
  confidenceScore: number;
  auditor: string;
  recommendations: string[];
}

// Carbon emission factors (simplified - would be loaded from config/database)
const EMISSION_FACTORS = {
  fuel: {
    f1_hybrid: 2.31, // kg CO2 per kg fuel (F1 E10 blend)
  },
  tires: {
    soft: 8.5,      // kg CO2 per set
    medium: 8.5,
    hard: 8.5,
    intermediate: 9.2,
    wet: 9.8,
  },
  logistics: {
    air: 0.602,     // kg CO2 per ton-km
    sea: 0.012,     // kg CO2 per ton-km
    road: 0.062,    // kg CO2 per ton-km
  },
  pitOperations: {
    equipment: 0.5,   // kg CO2 per kWh (grid mix)
    personnel: 50,    // kg CO2 per person (travel/accommodation)
  },
};

export class RaceCarbonAuditor extends EventEmitter {
  private telemetryBuffer: Map<string, RaceTelemetry[]> = new Map();
  private calculations: Map<string, CarbonCalculation> = new Map();
  private readonly auditorId: string;

  constructor() {
    super();
    this.auditorId = config.HEDERA_OPERATOR_ACCOUNT_ID || 'vera-lattice';
  }

  /**
   * Ingest telemetry data from McLaren/FIA sources
   */
  async ingestTelemetry(telemetry: RaceTelemetry): Promise<void> {
    try {
      const raceKey = `${telemetry.raceId}_${telemetry.session}`;
      
      if (!this.telemetryBuffer.has(raceKey)) {
        this.telemetryBuffer.set(raceKey, []);
      }
      
      const buffer = this.telemetryBuffer.get(raceKey)!;
      buffer.push(telemetry);
      
      // Keep only last 1000 readings per session
      if (buffer.length > 1000) {
        buffer.shift();
      }

      this.emit('telemetry_ingested', {
        raceId: telemetry.raceId,
        session: telemetry.session,
        timestamp: telemetry.timestamp,
      });

      logger.info('RaceCarbonAuditor', {
        raceId: telemetry.raceId,
        session: telemetry.session,
        circuit: telemetry.circuit,
        message: 'Telemetry ingested',
      });
    } catch (error) {
      logger.error('RaceCarbonAuditor', {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to ingest telemetry',
      });
      throw error;
    }
  }

  /**
   * Calculate carbon emissions from telemetry data
   */
  calculateEmissions(raceId: string, session: string): CarbonCalculation | null {
    try {
      const raceKey = `${raceId}_${session}`;
      const telemetryData = this.telemetryBuffer.get(raceKey);
      
      if (!telemetryData || telemetryData.length === 0) {
        logger.warn('RaceCarbonAuditor', {
          raceId,
          session,
          message: 'No telemetry data available for calculation',
        });
        return null;
      }

      // Use latest telemetry snapshot for calculations
      const latest = telemetryData[telemetryData.length - 1];

      // Calculate fuel emissions
      const totalFuelBurned = latest.fuel.consumptionPerLap * latest.lapCount;
      const fuelEmissions = totalFuelBurned * EMISSION_FACTORS.fuel.f1_hybrid;

      // Calculate tire emissions (assume 2 sets per race on average)
      const tireSetsUsed = 2;
      const tireEmissions = tireSetsUsed * EMISSION_FACTORS.tires[latest.tires.compound.toLowerCase() as keyof typeof EMISSION_FACTORS.tires] || 8.5;

      // Calculate logistics emissions
      const logisticsEmissions = 
        latest.logistics.cargoWeight * 
        latest.logistics.freightDistance * 
        EMISSION_FACTORS.logistics[latest.logistics.transportMode] / 1000;

      // Calculate pit operations emissions
      const equipmentEmissions = latest.pitOps.pitStopCount * latest.pitOps.equipmentPowerDraw * EMISSION_FACTORS.pitOperations.equipment;
      const personnelEmissions = latest.pitOps.personnelCount * EMISSION_FACTORS.pitOperations.personnel;
      const pitOperationsEmissions = equipmentEmissions + personnelEmissions;

      // Total emissions
      const totalEmissionsKg = fuelEmissions + tireEmissions + logisticsEmissions + pitOperationsEmissions;
      const totalEmissionsTco2e = totalEmissionsKg / 1000;

      // Team share (McLaren typically ~15% of total race emissions)
      const teamSharePercentage = 15;
      const teamEmissionsTco2e = totalEmissionsTco2e * (teamSharePercentage / 100);

      // Confidence score based on data quality
      const confidenceScore = this.calculateConfidence(latest);

      // Generate recommendations
      const recommendations = this.generateRecommendations(latest, fuelEmissions, logisticsEmissions);

      const calculation: CarbonCalculation = {
        raceId,
        timestamp: Date.now(),
        totalEmissionsKg,
        totalEmissionsTco2e,
        breakdown: {
          fuelEmissions,
          tireEmissions,
          logisticsEmissions,
          pitOperationsEmissions,
        },
        teamSharePercentage,
        teamEmissionsTco2e,
        confidenceScore,
        auditor: this.auditorId,
        recommendations,
      };

      // Store calculation
      this.calculations.set(raceKey, calculation);

      this.emit('calculation_complete', {
        raceId,
        totalEmissionsTco2e,
        confidenceScore,
      });

      logger.info('RaceCarbonAuditor', {
        raceId,
        session,
        totalEmissionsTco2e,
        teamEmissionsTco2e,
        confidenceScore,
        message: 'Carbon calculation complete',
      });

      return calculation;
    } catch (error) {
      logger.error('RaceCarbonAuditor', {
        raceId,
        session,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to calculate emissions',
      });
      return null;
    }
  }

  /**
   * Calculate confidence score based on data completeness
   */
  private calculateConfidence(telemetry: RaceTelemetry): number {
    let score = 0.5; // Base score

    // Data completeness checks
    if (telemetry.fuel.currentLevel > 0) score += 0.1;
    if (telemetry.fuel.consumptionPerLap > 0) score += 0.1;
    if (telemetry.lapCount > 0) score += 0.1;
    if (telemetry.logistics.freightDistance > 0) score += 0.1;
    if (telemetry.pitOps.pitStopCount >= 0) score += 0.1;

    // Cap at 0.99 (never 100% certain due to estimation factors)
    return Math.min(score, 0.99);
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    telemetry: RaceTelemetry, 
    fuelEmissions: number, 
    logisticsEmissions: number
  ): string[] {
    const recommendations: string[] = [];

    // Fuel optimization
    if (telemetry.fuel.consumptionPerLap > telemetry.fuel.optimalBurnRate * 1.1) {
      recommendations.push(`Enable lean fuel mix - potential ${Math.round((telemetry.fuel.consumptionPerLap - telemetry.fuel.optimalBurnRate) * telemetry.lapCount * 2.31)}kg CO2 savings`);
    }

    // Tire strategy
    if (telemetry.tires.degradationRate > 15) {
      recommendations.push('High tire degradation - consider one-stop strategy to reduce tire CO2 footprint');
    }

    // Logistics
    if (telemetry.logistics.transportMode === 'air' && logisticsEmissions > 5000) {
      recommendations.push('Consider sea freight for non-critical equipment - potential 95% logistics emission reduction');
    }

    // Pit operations
    if (telemetry.pitOps.avgStopDuration > 3.5) {
      recommendations.push('Pit stop optimization - faster stops reduce equipment power draw and emissions');
    }

    return recommendations;
  }

  /**
   * Get calculation by race ID
   */
  getCalculation(raceId: string, session: string): CarbonCalculation | undefined {
    return this.calculations.get(`${raceId}_${session}`);
  }

  /**
   * Get all calculations
   */
  getAllCalculations(): CarbonCalculation[] {
    return Array.from(this.calculations.values());
  }

  /**
   * Generate HCS report payload
   */
  generateHCSReport(raceId: string, session: string): object | null {
    const calculation = this.getCalculation(raceId, session);
    if (!calculation) return null;

    return {
      type: 'CARBON_AUDIT_REPORT',
      raceId: calculation.raceId,
      timestamp: calculation.timestamp,
      auditor: calculation.auditor,
      totalEmissionsTco2e: calculation.totalEmissionsTco2e,
      teamSharePercentage: calculation.teamSharePercentage,
      teamEmissionsTco2e: calculation.teamEmissionsTco2e,
      breakdown: calculation.breakdown,
      confidenceScore: calculation.confidenceScore,
      recommendations: calculation.recommendations,
      hash: this.calculateReportHash(calculation),
    };
  }

  /**
   * Calculate report hash for immutability
   */
  private calculateReportHash(calculation: CarbonCalculation): string {
    const data = `${calculation.raceId}:${calculation.timestamp}:${calculation.totalEmissionsTco2e}:${calculation.auditor}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get telemetry buffer for debugging
   */
  getTelemetryBuffer(raceId: string, session: string): RaceTelemetry[] {
    return this.telemetryBuffer.get(`${raceId}_${session}`) || [];
  }

  /**
   * Clear telemetry buffer for a race
   */
  clearTelemetry(raceId: string, session: string): void {
    this.telemetryBuffer.delete(`${raceId}_${session}`);
  }
}

// Singleton instance
export const raceCarbonAuditor = new RaceCarbonAuditor();
