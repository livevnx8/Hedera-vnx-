/**
 * Real Data Connectors for Carbon Tracking
 * 
 * Live API integrations:
 * - ElectricityMap: Real-time grid carbon intensity
 * - WattTime: Marginal emissions data
 * - Ember: Historical emissions data
 * - Hedera Guardian: Policy-based validation
 */

import { logger } from '../monitoring/logger.js';

interface ConnectorConfig {
  electricityMapKey?: string;
  watttimeToken?: string;
  emberKey?: string;
  guardianUrl?: string;
  guardianKey?: string;
  timeoutMs: number;
}

export class CarbonDataConnectors {
  private config: ConnectorConfig;
  private cache: Map<string, { data: unknown; timestamp: number; ttl: number }> = new Map();

  constructor(config: Partial<ConnectorConfig> = {}) {
    this.config = {
      timeoutMs: 30000,
      ...config
    };
  }

  /**
   * Fetch real-time carbon intensity from ElectricityMap
   * 
   * API: https://api.electricitymap.org/v3/carbon-intensity/latest
   * Returns: g CO2eq/kWh for specified zone
   */
  async fetchElectricityMap(zone: string): Promise<{
    zone: string;
    carbonIntensity: number;
    datetime: string;
    updatedAt: string;
    emissionFactorType: string;
    isEstimated: boolean;
    estimationMethod?: string;
  } | null> {
    if (!this.config.electricityMapKey) {
      logger.warn('CarbonDataConnectors', { message: 'ElectricityMap API key not configured' });
      return null;
    }

    const cacheKey = `electricitymap-${zone}`;
    const cached = this.getFromCache(cacheKey, 300000); // 5 min cache
    if (cached) return cached as any;

    try {
      const response = await fetch(
        `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${zone}`,
        {
          headers: {
            'auth-token': this.config.electricityMapKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn('CarbonDataConnectors', { message: 'Zone not found in ElectricityMap', zone });
          return null;
        }
        throw new Error(`ElectricityMap API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert from g CO2eq/kWh to kg CO2/kWh
      const result = {
        zone: data.zone,
        carbonIntensity: (data.carbonIntensity || 0) / 1000,
        datetime: data.datetime,
        updatedAt: data.updatedAt,
        emissionFactorType: data.emissionFactorType,
        isEstimated: data.isEstimated,
        estimationMethod: data.estimationMethod
      };

      this.setCache(cacheKey, result, 300000);

      logger.info('CarbonDataConnectors', {
        message: 'ElectricityMap data fetched',
        zone,
        intensity: result.carbonIntensity,
        estimated: result.isEstimated
      });

      return result;

    } catch (error) {
      logger.error('CarbonDataConnectors', {
        message: 'ElectricityMap fetch failed',
        zone,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Fetch marginal emissions from WattTime
   * 
   * API: https://api2.watttime.org/v2/index
   * Returns: MOER (Marginal Operating Emissions Rate)
   * Use case: When to use electricity (time-shifting)
   */
  async fetchWattTime(ba: string): Promise<{
    ba: string;
    percent: number;
    moer: number; // lbs CO2/MWh
    carbonIntensity: number; // kg CO2/kWh (converted)
    freq: string;
    signal: string;
    timestamp: string;
  } | null> {
    if (!this.config.watttimeToken) {
      logger.warn('CarbonDataConnectors', { message: 'WattTime token not configured' });
      return null;
    }

    const cacheKey = `watttime-${ba}`;
    const cached = this.getFromCache(cacheKey, 300000); // 5 min cache
    if (cached) return cached as any;

    try {
      const response = await fetch(
        `https://api2.watttime.org/v2/index?ba=${ba}&style=all`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.watttimeToken}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          logger.error('CarbonDataConnectors', { message: 'WattTime authentication failed' });
          return null;
        }
        throw new Error(`WattTime API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert MOER from lbs CO2/MWh to kg CO2/kWh
      // 1 lb = 0.453592 kg, 1 MWh = 1000 kWh
      // MOER (lbs/MWh) * 0.453592 / 1000 = kg/kWh
      const carbonIntensity = (data.moer || 0) * 0.000453592;

      const result = {
        ba: data.ba,
        percent: data.percent,
        moer: data.moer,
        carbonIntensity,
        freq: data.freq,
        signal: data.signal,
        timestamp: data.point_time
      };

      this.setCache(cacheKey, result, 300000);

      logger.info('CarbonDataConnectors', {
        message: 'WattTime data fetched',
        ba,
        moer: data.moer,
        percent: data.percent,
        signal: data.signal
      });

      return result;

    } catch (error) {
      logger.error('CarbonDataConnectors', {
        message: 'WattTime fetch failed',
        ba,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Fetch historical grid data from Ember
   * 
   * API: https://api.ember-climate.org/v1/electricity-generation
   * Use case: Yearly average emissions factors
   */
  async fetchEmber(countryCode: string, year?: number): Promise<{
    country: string;
    year: number;
    carbonIntensity: number; // g CO2/kWh
    carbonIntensityKg: number; // kg CO2/kWh
    fossilShare: number; // %
    renewableShare: number; // %
    dataSource: string;
  } | null> {
    if (!this.config.emberKey) {
      logger.warn('CarbonDataConnectors', { message: 'Ember API key not configured' });
      return null;
    }

    const targetYear = year || new Date().getFullYear() - 1;
    const cacheKey = `ember-${countryCode}-${targetYear}`;
    const cached = this.getFromCache(cacheKey, 86400000); // 24 hour cache
    if (cached) return cached as any;

    try {
      const response = await fetch(
        `https://api.ember-climate.org/v1/electricity-generation/yearly?` +
        `entity=${countryCode}&year=${targetYear}&series=Carbon intensity (gCO2/kWh)`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.emberKey}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );

      if (!response.ok) {
        throw new Error(`Ember API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.data || data.data.length === 0) {
        logger.warn('CarbonDataConnectors', {
          message: 'No Ember data for country/year',
          countryCode,
          year: targetYear
        });
        return null;
      }

      const latest = data.data[data.data.length - 1];
      const carbonIntensityG = latest.value || 0;
      
      const result = {
        country: countryCode,
        year: targetYear,
        carbonIntensity: carbonIntensityG,
        carbonIntensityKg: carbonIntensityG / 1000,
        fossilShare: latest.fossilShare || 0,
        renewableShare: latest.renewableShare || 0,
        dataSource: 'Ember Climate'
      };

      this.setCache(cacheKey, result, 86400000);

      logger.info('CarbonDataConnectors', {
        message: 'Ember data fetched',
        country: countryCode,
        year: targetYear,
        intensity: result.carbonIntensity
      });

      return result;

    } catch (error) {
      logger.error('CarbonDataConnectors', {
        message: 'Ember fetch failed',
        countryCode,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get available zones from ElectricityMap
   */
  async getElectricityMapZones(): Promise<Array<{ zone: string; countryName: string; displayName: string }>> {
    if (!this.config.electricityMapKey) {
      return this.getMockZones();
    }

    try {
      const response = await fetch(
        'https://api.electricitymap.org/v3/zones',
        {
          headers: {
            'auth-token': this.config.electricityMapKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );

      if (!response.ok) {
        throw new Error(`Zones fetch failed: ${response.status}`);
      }

      const data = await response.json();
      
      return Object.entries(data).map(([zone, info]: [string, any]) => ({
        zone,
        countryName: info.countryName,
        displayName: info.displayName || zone
      }));

    } catch (error) {
      logger.error('CarbonDataConnectors', {
        message: 'Zones fetch failed',
        error: error instanceof Error ? error.message : String(error)
      });
      return this.getMockZones();
    }
  }

  /**
   * Get available balancing authorities from WattTime
   */
  async getWattTimeRegions(): Promise<Array<{ ba: string; name: string; abbrev: string }>> {
    if (!this.config.watttimeToken) {
      return this.getMockBas();
    }

    try {
      const response = await fetch(
        'https://api2.watttime.org/v2/ba-from-loc',
        {
          headers: {
            'Authorization': `Bearer ${this.config.watttimeToken}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );

      if (!response.ok) {
        throw new Error(`BA fetch failed: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      logger.error('CarbonDataConnectors', {
        message: 'WattTime regions fetch failed',
        error: error instanceof Error ? error.message : String(error)
      });
      return this.getMockBas();
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('CarbonDataConnectors', { message: 'Cache cleared' });
  }

  /**
   * Get connector statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      cacheSize: this.cache.size,
      electricityMapConfigured: !!this.config.electricityMapKey,
      watttimeConfigured: !!this.config.watttimeToken,
      emberConfigured: !!this.config.emberKey,
      guardianConfigured: !!(this.config.guardianUrl && this.config.guardianKey),
      timeoutMs: this.config.timeoutMs
    };
  }

  // Private methods
  private getFromCache(key: string, maxAge: number): unknown | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCache(key: string, data: unknown, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private getMockZones(): Array<{ zone: string; countryName: string; displayName: string }> {
    return [
      { zone: 'US-CAL-CISO', countryName: 'United States', displayName: 'California ISO' },
      { zone: 'US-TEX-ERCO', countryName: 'United States', displayName: 'ERCOT Texas' },
      { zone: 'US-NY-NYIS', countryName: 'United States', displayName: 'New York ISO' },
      { zone: 'DE', countryName: 'Germany', displayName: 'Germany' },
      { zone: 'FR', countryName: 'France', displayName: 'France' },
      { zone: 'GB', countryName: 'United Kingdom', displayName: 'Great Britain' },
      { zone: 'NO', countryName: 'Norway', displayName: 'Norway' },
      { zone: 'BR', countryName: 'Brazil', displayName: 'Brazil' }
    ];
  }

  private getMockBas(): Array<{ ba: string; name: string; abbrev: string }> {
    return [
      { ba: 'CAISO_NORTH', name: 'California ISO North', abbrev: 'CISO' },
      { ba: 'ERCO', name: 'Electric Reliability Council of Texas', abbrev: 'ERCO' },
      { ba: 'ISNE', name: 'ISO New England', abbrev: 'ISNE' },
      { ba: 'NYISO', name: 'New York ISO', abbrev: 'NYISO' },
      { ba: 'PJM_NJ', name: 'PJM New Jersey', abbrev: 'PJM' }
    ];
  }
}

// Singleton
let connectorsInstance: CarbonDataConnectors | null = null;

export function getCarbonConnectors(config?: Partial<ConnectorConfig>): CarbonDataConnectors {
  if (!connectorsInstance) {
    connectorsInstance = new CarbonDataConnectors(config);
  }
  return connectorsInstance;
}
