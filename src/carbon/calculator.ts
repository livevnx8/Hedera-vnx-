/**
 * Carbon Calculator
 * 
 * Calculates emissions according to GHG Protocol standards.
 * Supports Scope 1, 2, and 3 with real emission factors.
 */

import { logger } from '../monitoring/logger.js';
import type { CarbonEmission, CarbonReport, CarbonSource, EnergyReading } from './types.js';

interface CalculatorConfig {
  reportingStandard: 'GHG Protocol' | 'ISO 14064' | 'PAS 2050';
  includeScope3: boolean;
  marketBasedScope2: boolean;
}

interface EmissionFactor {
  fuelType: string;
  factor: number; // kg CO2/unit
  unit: string;
  source: string;
}

export class CarbonCalculator {
  private config: CalculatorConfig;
  private emissionFactors: Map<string, EmissionFactor> = new Map();
  private reports: Map<string, CarbonReport> = new Map();

  constructor(config: Partial<CalculatorConfig> = {}) {
    this.config = {
      reportingStandard: 'GHG Protocol',
      includeScope3: true,
      marketBasedScope2: true,
      ...config
    };

    this.initializeEmissionFactors();
  }

  /**
   * Calculate Scope 2 emissions from energy readings
   */
  async calculateScope2(
    source: CarbonSource,
    readings: EnergyReading[],
    options: {
      locationBased?: boolean;
      marketBasedFactor?: number; // For renewable energy purchases
    } = {}
  ): Promise<CarbonEmission> {
    try {
      const period = {
        start: Math.min(...readings.map(r => r.timestamp)),
        end: Math.max(...readings.map(r => r.timestamp))
      };

      const totalEnergy = readings.reduce((sum, r) => sum + r.energyKWh, 0);

      // Location-based (grid average)
      const locationFactor = source.location.gridFactor;
      const locationEmissions = totalEnergy * locationFactor;

      // Market-based (if renewable energy purchased)
      let marketEmissions = locationEmissions;
      if (options.marketBasedFactor !== undefined) {
        marketEmissions = totalEnergy * options.marketBasedFactor;
      }

      const useMarketBased = options.locationBased === false && this.config.marketBasedScope2;
      const carbonEmitted = useMarketBased ? marketEmissions : locationEmissions;
      const methodology = useMarketBased 
        ? 'Scope 2 - Market-based with renewable energy attribution'
        : 'Scope 2 - Location-based with grid emission factors';

      const emission: CarbonEmission = {
        emissionId: `scope2-${source.sourceId}-${period.start}`,
        sourceId: source.sourceId,
        period,
        energyConsumed: totalEnergy,
        carbonEmitted,
        methodology,
        standard: this.config.reportingStandard,
        verified: false
      };

      logger.info('CarbonCalculator', {
        message: 'Scope 2 calculated',
        sourceId: source.sourceId,
        energyKWh: totalEnergy,
        carbonKg: carbonEmitted,
        methodology
      });

      return emission;

    } catch (error) {
      logger.error('CarbonCalculator', {
        message: 'Scope 2 calculation failed',
        sourceId: source.sourceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Calculate Scope 1 emissions (direct)
   */
  async calculateScope1(
    fuelConsumption: Array<{
      fuelType: string;
      amount: number;
      unit: string;
    }>,
    period: { start: number; end: number }
  ): Promise<{
    stationary: number;
    mobile: number;
    fugitive: number;
    total: number;
    breakdown: CarbonEmission[];
  }> {
    try {
      let stationary = 0;
      let mobile = 0;
      let fugitive = 0;
      const breakdown: CarbonEmission[] = [];

      for (const consumption of fuelConsumption) {
        const factor = this.emissionFactors.get(consumption.fuelType);
        if (!factor) {
          logger.warn('CarbonCalculator', {
            message: 'Unknown fuel type',
            fuelType: consumption.fuelType
          });
          continue;
        }

        const emissions = consumption.amount * factor.factor;

        // Categorize
        if (['natural_gas', 'diesel_stationary', 'propane'].includes(consumption.fuelType)) {
          stationary += emissions;
        } else if (['gasoline', 'diesel', 'jet_fuel'].includes(consumption.fuelType)) {
          mobile += emissions;
        } else if (['refrigerants', 'fire_suppressants'].includes(consumption.fuelType)) {
          fugitive += emissions;
        }

        breakdown.push({
          emissionId: `scope1-${consumption.fuelType}-${period.start}`,
          sourceId: 'scope1-direct',
          period,
          energyConsumed: consumption.amount,
          carbonEmitted: emissions,
          methodology: `Scope 1 - ${consumption.fuelType} combustion`,
          standard: this.config.reportingStandard,
          verified: false
        });
      }

      logger.info('CarbonCalculator', {
        message: 'Scope 1 calculated',
        stationary,
        mobile,
        fugitive,
        total: stationary + mobile + fugitive
      });

      return {
        stationary,
        mobile,
        fugitive,
        total: stationary + mobile + fugitive,
        breakdown
      };

    } catch (error) {
      logger.error('CarbonCalculator', {
        message: 'Scope 1 calculation failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Calculate Scope 3 emissions (value chain)
   */
  async calculateScope3(
    upstreamData: {
      purchasedGoods: number; // kg CO2
      capitalGoods: number;
      transportation: number;
      businessTravel: number;
      employeeCommuting: number;
    },
    downstreamData: {
      processing: number;
      useOfProducts: number;
      endOfLife: number;
      investments: number;
    },
    period: { start: number; end: number }
  ): Promise<{
    upstream: number;
    downstream: number;
    total: number;
  }> {
    try {
      const upstream = Object.values(upstreamData).reduce((sum, v) => sum + v, 0);
      const downstream = Object.values(downstreamData).reduce((sum, v) => sum + v, 0);

      if (!this.config.includeScope3) {
        logger.info('CarbonCalculator', {
          message: 'Scope 3 excluded by configuration'
        });
        return { upstream: 0, downstream: 0, total: 0 };
      }

      logger.info('CarbonCalculator', {
        message: 'Scope 3 calculated',
        upstream,
        downstream,
        total: upstream + downstream
      });

      return {
        upstream,
        downstream,
        total: upstream + downstream
      };

    } catch (error) {
      logger.error('CarbonCalculator', {
        message: 'Scope 3 calculation failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate full carbon report
   */
  async generateReport(
    organizationId: string,
    period: { start: number; end: number },
    data: {
      scope1: {
        stationary: number;
        mobile: number;
        fugitive: number;
      };
      scope2: {
        locationBased: number;
        marketBased: number;
      };
      scope3: {
        upstream: number;
        downstream: number;
      };
      energyMix: {
        renewable: number;
        grid: number;
        onsite: number;
      };
      offsets?: {
        purchased: number;
        retired: number;
      };
    }
  ): Promise<CarbonReport> {
    try {
      const scope1Total = data.scope1.stationary + data.scope1.mobile + data.scope1.fugitive;
      const scope2Total = this.config.marketBasedScope2 ? data.scope2.marketBased : data.scope2.locationBased;
      const scope3Total = this.config.includeScope3 ? data.scope3.upstream + data.scope3.downstream : 0;
      
      const grossEmissions = scope1Total + scope2Total + scope3Total;
      const offsetsRetired = data.offsets?.retired || 0;
      const netEmissions = Math.max(0, grossEmissions - offsetsRetired);

      const report: CarbonReport = {
        reportId: `report-${organizationId}-${period.start}`,
        organizationId,
        reportingPeriod: period,
        scope1: {
          ...data.scope1,
          total: scope1Total
        },
        scope2: {
          ...data.scope2,
          total: scope2Total
        },
        scope3: {
          ...data.scope3,
          total: scope3Total
        },
        offsets: {
          purchased: data.offsets?.purchased || 0,
          retired: offsetsRetired,
          netEmissions
        },
        energyMix: data.energyMix,
        verified: false,
        verification: {
          body: '',
          date: 0,
          assuranceLevel: 'limited'
        }
      };

      this.reports.set(report.reportId, report);

      logger.info('CarbonCalculator', {
        message: 'Carbon report generated',
        reportId: report.reportId,
        organizationId,
        grossEmissions,
        netEmissions,
        period: `${new Date(period.start).toISOString()} - ${new Date(period.end).toISOString()}`
      });

      return report;

    } catch (error) {
      logger.error('CarbonCalculator', {
        message: 'Report generation failed',
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Verify carbon report
   */
  async verifyReport(
    reportId: string,
    verifier: string,
    assuranceLevel: 'limited' | 'reasonable' | 'full'
  ): Promise<CarbonReport> {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    report.verified = true;
    report.verification = {
      body: verifier,
      date: Date.now(),
      assuranceLevel
    };

    logger.info('CarbonCalculator', {
      message: 'Carbon report verified',
      reportId,
      verifier,
      assuranceLevel
    });

    return report;
  }

  /**
   * Get emission factor for fuel type
   */
  getEmissionFactor(fuelType: string): EmissionFactor | undefined {
    return this.emissionFactors.get(fuelType);
  }

  /**
   * Get report by ID
   */
  getReport(reportId: string): CarbonReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * Get all reports for organization
   */
  getOrganizationReports(organizationId: string): CarbonReport[] {
    return Array.from(this.reports.values())
      .filter(r => r.organizationId === organizationId)
      .sort((a, b) => b.reportingPeriod.start - a.reportingPeriod.start);
  }

  /**
   * Compare emissions across periods
   */
  compareEmissions(
    reportId1: string,
    reportId2: string
  ): {
    absoluteChange: number;
    percentageChange: number;
    scope1Change: number;
    scope2Change: number;
    scope3Change: number;
  } | null {
    const r1 = this.reports.get(reportId1);
    const r2 = this.reports.get(reportId2);

    if (!r1 || !r2) return null;

    const total1 = r1.scope1.total + r1.scope2.total + r1.scope3.total;
    const total2 = r2.scope1.total + r2.scope2.total + r2.scope3.total;

    return {
      absoluteChange: total2 - total1,
      percentageChange: ((total2 - total1) / total1) * 100,
      scope1Change: r2.scope1.total - r1.scope1.total,
      scope2Change: r2.scope2.total - r1.scope2.total,
      scope3Change: r2.scope3.total - r1.scope3.total
    };
  }

  /**
   * Get calculator statistics
   */
  getStats() {
    const reports = Array.from(this.reports.values());
    const verified = reports.filter(r => r.verified);

    return {
      timestamp: Date.now(),
      totalReports: reports.length,
      verifiedReports: verified.length,
      emissionFactors: this.emissionFactors.size,
      config: this.config,
      latestReport: reports.sort((a, b) => b.reportingPeriod.start - a.reportingPeriod.start)[0]?.reportId
    };
  }

  // Private methods
  private initializeEmissionFactors(): void {
    // EPA emission factors (2024) - kg CO2 per unit
    const factors: EmissionFactor[] = [
      { fuelType: 'natural_gas', factor: 1.81, unit: 'kg CO2/m3', source: 'EPA' },
      { fuelType: 'diesel', factor: 2.68, unit: 'kg CO2/L', source: 'EPA' },
      { fuelType: 'gasoline', factor: 2.31, unit: 'kg CO2/L', source: 'EPA' },
      { fuelType: 'propane', factor: 1.51, unit: 'kg CO2/L', source: 'EPA' },
      { fuelType: 'jet_fuel', factor: 2.52, unit: 'kg CO2/L', source: 'EPA' },
      { fuelType: 'coal', factor: 2.86, unit: 'kg CO2/kg', source: 'EPA' },
      { fuelType: 'fuel_oil', factor: 2.96, unit: 'kg CO2/L', source: 'EPA' },
      { fuelType: 'refrigerants_r410a', factor: 2088, unit: 'kg CO2/kg', source: 'IPCC' },
      { fuelType: 'refrigerants_r22', factor: 1810, unit: 'kg CO2/kg', source: 'IPCC' }
    ];

    for (const factor of factors) {
      this.emissionFactors.set(factor.fuelType, factor);
    }
  }
}

// Singleton
let calculatorInstance: CarbonCalculator | null = null;

export function getCarbonCalculator(config?: Partial<CalculatorConfig>): CarbonCalculator {
  if (!calculatorInstance) {
    calculatorInstance = new CarbonCalculator(config);
  }
  return calculatorInstance;
}
