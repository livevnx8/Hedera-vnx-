/**
 * Vera Lattice Oracles
 * 
 * Feed external data as lattice points for geometric truth consensus.
 * 
 * Key Concepts:
 * - External data sources → lattice embeddings
 * - Oracle nodes participate in meet/join operations
 * - Consensus via geometric intersection (meet)
 * - No single point of failure (distributed oracle swarm)
 */

import { logger } from '../monitoring/logger.js';
import { veraHCS } from '../dovu/veraHCS.js';
import { LatticeNode } from './latticeSwarm.js';

// Oracle data source
export interface OracleSource {
  id: string;
  name: string;
  type: 'price' | 'weather' | 'carbon' | 'compliance' | 'custom';
  endpoint: string;
  reliability: number; // 0.0-1.0
  lastUpdate: number;
  embedding: number[];
}

// Oracle reading
export interface OracleReading {
  sourceId: string;
  value: any;
  timestamp: number;
  confidence: number;
  embedding: number[];
  signature?: string;
}

// Geometric consensus result
export interface OracleConsensus {
  value: any;
  confidence: number;
  sources: string[];
  meetScore: number; // Geometric overlap
  timestamp: number;
}

// Price data (example)
export interface PriceData {
  token: string;
  price: number;
  currency: string;
  source: string;
}

// Carbon data (example)
export interface CarbonData {
  standard: string;
  pricePerTon: number;
  volume: number;
  region: string;
}

/**
 * Vera Lattice Oracle - External data as geometric points
 */
export class VeraLatticeOracle {
  private sources: Map<string, OracleSource> = new Map();
  private readings: Map<string, OracleReading[]> = new Map();
  private embeddingDim: number = 128;

  async initialize(): Promise<void> {
    logger.info('VeraLatticeOracle', { message: 'Initializing lattice oracles...' });

    // Register default oracle sources
    this.registerSource({
      id: 'hedera-price',
      name: 'HBAR Price Oracle',
      type: 'price',
      endpoint: 'https://api.hedera.com/v1/price',
      reliability: 0.95,
      lastUpdate: 0,
      embedding: this.generateTypeEmbedding('price')
    });

    this.registerSource({
      id: 'dovu-price',
      name: 'DOVU Token Price',
      type: 'price',
      endpoint: 'https://api.saucerswap.finance/dovu',
      reliability: 0.90,
      lastUpdate: 0,
      embedding: this.generateTypeEmbedding('price')
    });

    this.registerSource({
      id: 'carbon-market',
      name: 'Carbon Credit Market Data',
      type: 'carbon',
      endpoint: 'https://api.carbonmarket.com/v1/prices',
      reliability: 0.85,
      lastUpdate: 0,
      embedding: this.generateTypeEmbedding('carbon')
    });

    this.registerSource({
      id: 'gold-standard',
      name: 'Gold Standard Registry',
      type: 'compliance',
      endpoint: 'https://registry.goldstandard.org/api',
      reliability: 0.98,
      lastUpdate: 0,
      embedding: this.generateTypeEmbedding('compliance')
    });

    logger.info('VeraLatticeOracle', {
      sources: this.sources.size,
      message: 'Lattice oracles ready'
    });
  }

  /**
   * Register new oracle source
   */
  registerSource(source: OracleSource): void {
    this.sources.set(source.id, source);
    this.readings.set(source.id, []);
    logger.debug('VeraLatticeOracle', { sourceId: source.id, type: source.type, message: 'Source registered' });
  }

  /**
   * Fetch data from oracle and convert to lattice point
   */
  async fetchData(sourceId: string): Promise<OracleReading | null> {
    const source = this.sources.get(sourceId);
    if (!source) {
      logger.warn('VeraLatticeOracle', { sourceId, message: 'Unknown source' });
      return null;
    }

    try {
      // Mock fetch (in production: actual HTTP request)
      const value = await this.mockFetch(source);
      
      // Convert to embedding
      const embedding = this.valueToEmbedding(value, source.type);

      const reading: OracleReading = {
        sourceId,
        value,
        timestamp: Date.now(),
        confidence: source.reliability * (0.9 + Math.random() * 0.1),
        embedding,
        signature: this.signReading(sourceId, value)
      };

      // Store
      const readings = this.readings.get(sourceId) || [];
      readings.push(reading);
      this.readings.set(sourceId, readings);

      // Update source
      source.lastUpdate = Date.now();

      logger.debug('VeraLatticeOracle', { sourceId, type: source.type, message: 'Data fetched' });
      return reading;
    } catch (error) {
      logger.error('VeraLatticeOracle', { error, sourceId, message: 'Fetch failed' });
      return null;
    }
  }

  /**
   * Reach geometric consensus across multiple oracles
   * Uses meet operation to find overlapping truth
   */
  async reachConsensus(
    sourceIds: string[],
    dataType: string
  ): Promise<OracleConsensus | null> {
    // Fetch from all sources
    const readings: OracleReading[] = [];
    for (const id of sourceIds) {
      const reading = await this.fetchData(id);
      if (reading) readings.push(reading);
    }

    if (readings.length === 0) {
      logger.warn('VeraLatticeOracle', { message: 'No oracle data available' });
      return null;
    }

    // Calculate meet (geometric intersection)
    const meetResult = this.calculateMeet(readings);

    // Aggregate values based on meet score
    const consensus = this.aggregateValues(readings, meetResult.overlap);

    // Log to HCS
    await this.logConsensus(consensus, readings);

    logger.info('VeraLatticeOracle', {
      sources: readings.length,
      meetScore: (meetResult.overlap * 100).toFixed(1) + '%',
      confidence: (consensus.confidence * 100).toFixed(1) + '%',
      message: 'Consensus reached'
    });

    return consensus;
  }

  /**
   * Get price consensus from multiple price oracles
   */
  async getPriceConsensus(token: string): Promise<OracleConsensus | null> {
    const priceSources = Array.from(this.sources.values())
      .filter(s => s.type === 'price');

    return this.reachConsensus(
      priceSources.map(s => s.id),
      'price'
    );
  }

  /**
   * Get carbon market consensus
   */
  async getCarbonConsensus(): Promise<OracleConsensus | null> {
    const carbonSources = Array.from(this.sources.values())
      .filter(s => s.type === 'carbon' || s.type === 'compliance');

    return this.reachConsensus(
      carbonSources.map(s => s.id),
      'carbon'
    );
  }

  /**
   * Project oracle data into lattice space
   */
  projectToLattice(reading: OracleReading): LatticeNode {
    const source = this.sources.get(reading.sourceId)!;
    
    return {
      id: `oracle-${reading.sourceId}-${Date.now()}`,
      role: 'analyst',
      tier: 2,
      embedding: reading.embedding,
      extent: Array.from({ length: this.embeddingDim }, () => 0.5),
      intent: `oracle_${source.type}`,
      confidence: reading.confidence,
      timestamp: reading.timestamp,
      children: []
    };
  }

  // Private helpers

  private async mockFetch(source: OracleSource): Promise<any> {
    // Mock data based on source type
    switch (source.type) {
      case 'price':
        return {
          token: source.id.includes('dovu') ? 'DOVU' : 'HBAR',
          price: source.id.includes('dovu') ? 0.05 + Math.random() * 0.02 : 0.15 + Math.random() * 0.05,
          currency: 'USD',
          source: source.name
        };
      
      case 'carbon':
        return {
          standard: 'VCS',
          pricePerTon: 15 + Math.random() * 10,
          volume: 1000000 + Math.floor(Math.random() * 500000),
          region: 'Global'
        };
      
      case 'compliance':
        return {
          standard: 'Gold Standard',
          activeProjects: 500 + Math.floor(Math.random() * 100),
          verifiedCredits: 50000000 + Math.floor(Math.random() * 10000000),
          complianceRate: 0.95 + Math.random() * 0.04
        };
      
      case 'weather':
        return {
          region: 'Amazon',
          temperature: 25 + Math.random() * 10,
          rainfall: 100 + Math.random() * 50,
          fireRisk: Math.random()
        };
      
      default:
        return { value: Math.random(), source: source.name };
    }
  }

  private generateTypeEmbedding(type: string): number[] {
    // Type-specific base embeddings
    const typeVectors: Record<string, number[]> = {
      price: [0.9, 0.1, 0.2, 0.1, 0.1],      // Economic
      carbon: [0.2, 0.9, 0.5, 0.3, 0.4],     // Environmental
      compliance: [0.1, 0.3, 0.9, 0.8, 0.7], // Regulatory
      weather: [0.3, 0.8, 0.2, 0.6, 0.5],    // Physical
      custom: [0.5, 0.5, 0.5, 0.5, 0.5]     // Neutral
    };

    const base = typeVectors[type] || typeVectors.custom;
    
    return Array.from({ length: this.embeddingDim }, (_, i) => {
      const baseVal = base[i % base.length];
      const noise = (Math.random() - 0.5) * 0.05;
      return Math.max(0, Math.min(1, baseVal + noise));
    });
  }

  private valueToEmbedding(value: any, type: string): number[] {
    // Convert value to embedding based on type
    const baseEmbedding = this.generateTypeEmbedding(type);
    
    // Add value-specific perturbation
    const valueHash = JSON.stringify(value).length / 1000;
    
    return baseEmbedding.map(v => 
      Math.max(0, Math.min(1, v + (valueHash % 0.2) - 0.1))
    );
  }

  private signReading(sourceId: string, value: any): string {
    // Simple signature for verification
    return Buffer.from(`${sourceId}:${JSON.stringify(value)}`).toString('base64').slice(0, 16);
  }

  private calculateMeet(readings: OracleReading[]): { overlap: number; centroid: number[] } {
    if (readings.length === 0) return { overlap: 0, centroid: [] };
    if (readings.length === 1) return { overlap: 1, centroid: readings[0].embedding };

    // Calculate pairwise similarities
    let totalSim = 0;
    let count = 0;
    
    for (let i = 0; i < readings.length; i++) {
      for (let j = i + 1; j < readings.length; j++) {
        totalSim += this.cosineSimilarity(readings[i].embedding, readings[j].embedding);
        count++;
      }
    }

    const overlap = count > 0 ? totalSim / count : 1;

    // Calculate centroid (mean embedding)
    const centroid = readings[0].embedding.map((_, i) => 
      readings.reduce((sum, r) => sum + r.embedding[i], 0) / readings.length
    );

    return { overlap, centroid };
  }

  private aggregateValues(readings: OracleReading[], meetScore: number): OracleConsensus {
    // Weight by confidence
    const weights = readings.map(r => r.confidence);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    // For numeric values, calculate weighted average
    const numericValues = readings
      .map(r => r.value)
      .filter(v => typeof v === 'number') as number[];
    
    let aggregatedValue: any;
    if (numericValues.length > 0) {
      const weightedSum = numericValues.reduce((sum, v, i) => sum + v * weights[i], 0);
      aggregatedValue = weightedSum / totalWeight;
    } else {
      // Take most confident reading
      const best = readings.reduce((a, b) => a.confidence > b.confidence ? a : b);
      aggregatedValue = best.value;
    }

    // Confidence is meet score weighted by individual confidences
    const confidence = meetScore * (totalWeight / readings.length);

    return {
      value: aggregatedValue,
      confidence,
      sources: readings.map(r => r.sourceId),
      meetScore,
      timestamp: Date.now()
    };
  }

  private async logConsensus(consensus: OracleConsensus, readings: OracleReading[]): Promise<void> {
    try {
      await veraHCS.logAchievement('lattice_oracle_consensus', {
        value: consensus.value,
        confidence: consensus.confidence,
        sources: consensus.sources.length,
        meetScore: consensus.meetScore,
        timestamp: consensus.timestamp
      });
    } catch (error) {
      logger.debug('VeraLatticeOracle', { error, message: 'HCS log failed' });
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  // Public API
  getOracleStats(): any {
    return {
      sources: Array.from(this.sources.values()).map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        reliability: s.reliability,
        lastUpdate: s.lastUpdate,
        readings: this.readings.get(s.id)?.length || 0
      })),
      totalSources: this.sources.size,
      totalReadings: Array.from(this.readings.values()).reduce(
        (sum, arr) => sum + arr.length, 0
      )
    };
  }

  getReadings(sourceId: string): OracleReading[] {
    return this.readings.get(sourceId) || [];
  }
}

// Export singleton
export const veraLatticeOracle = new VeraLatticeOracle();
