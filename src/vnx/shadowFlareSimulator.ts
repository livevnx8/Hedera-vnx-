/**
 * VNX-S (Shadow Flare) Simulation Mode
 * 
 * Simulates Flare gas data center validation without actual hardware.
 * Uses historical VMR0016 data patterns to build a "History of Competence"
 * so that when real hardware arrives, Vera's "Audit License" is mature.
 * 
 * This is the "Shadow Flare" - feeding Vera historical methane data
 * and having her issue "VNX-S" (Simulated) credits to test minting logic.
 */

import { VNXValidationWorkflow, VNXAttestation } from './validationWorkflow.js';
import { logger } from '../monitoring/logger.js';

export interface VMR0016DataPoint {
  timestamp: string;
  facilityId: string;
  methaneFlowRate: number; // kg/hour
  methaneConcentration: number; // percentage
  gasVolume: number; // cubic meters
  destructionEfficiency: number; // percentage
  uptime: number; // percentage
  location: {
    lat: number;
    lng: number;
    region: string;
  };
}

export interface SimulatedValidation {
  dataPoint: VMR0016DataPoint;
  simulatedCarbonCredits: number;
  validationType: 'VNX-S-Realtime' | 'VNX-S-Historical' | 'VNX-S-Projected';
  confidence: number;
  vc: VNXAttestation | null;
}

export class VNXShadowFlareSimulator {
  private workflow: VNXValidationWorkflow;
  private isRunning: boolean = false;
  private simulationInterval: NodeJS.Timeout | null = null;
  
  // Simulation parameters
  private config = {
    methaneFlowBase: 500,        // kg/hour baseline
    methaneFlowVariance: 200,    // +/- variance
    destructionEfficiencyBase: 99.5, // percentage
    facilityUptimeBase: 95,      // percentage
    creditsPerKgMethane: 25,     // GWP-100 factor for CH4
    simulationSpeed: 1           // 1x = real time, 10x = 10x faster
  };

  // Historical data cache
  private simulatedHistory: SimulatedValidation[] = [];
  private maxHistorySize: number = 10000;

  constructor(workflow: VNXValidationWorkflow) {
    this.workflow = workflow;
  }

  /**
   * Start Shadow Flare simulation
   */
  async startSimulation(intervalMinutes: number = 60): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    logger.info('VNXShadowFlare', {
      mode: 'VNX-S',
      interval: intervalMinutes,
      message: 'Starting Shadow Flare simulation'
    });

    console.log('\n🔥 VNX-S SHADOW FLARE SIMULATION STARTED');
    console.log('==========================================\n');
    console.log(`Mode: Historical VMR0016 Pattern Simulation`);
    console.log(`Speed: ${this.config.simulationSpeed}x`);
    console.log(`Interval: ${intervalMinutes} minutes\n`);

    // Initial simulation
    await this.simulateDataPoint();

    // Schedule regular simulations
    this.simulationInterval = setInterval(
      () => this.simulateDataPoint(),
      (intervalMinutes * 60 * 1000) / this.config.simulationSpeed
    );
  }

  /**
   * Stop simulation
   */
  stopSimulation(): void {
    this.isRunning = false;

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    logger.info('VNXShadowFlare', {
      totalSimulations: this.simulatedHistory.length,
      message: 'Shadow Flare simulation stopped'
    });
  }

  /**
   * Simulate a single data point
   */
  private async simulateDataPoint(): Promise<SimulatedValidation> {
    // Generate realistic VMR0016 data
    const dataPoint = this.generateVMR0016Data();

    // Calculate carbon credits
    const credits = this.calculateCarbonCredits(dataPoint);

    // Determine validation type based on timestamp
    const now = new Date();
    const dataTime = new Date(dataPoint.timestamp);
    const hoursDiff = (now.getTime() - dataTime.getTime()) / (1000 * 60 * 60);

    let validationType: SimulatedValidation['validationType'];
    if (hoursDiff < 1) {
      validationType = 'VNX-S-Realtime';
    } else if (hoursDiff < 24) {
      validationType = 'VNX-S-Historical';
    } else {
      validationType = 'VNX-S-Projected';
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(dataPoint);

    const simulation: SimulatedValidation = {
      dataPoint,
      simulatedCarbonCredits: credits,
      validationType,
      confidence,
      vc: null // Would be generated for high-confidence points
    };

    // Issue VC if confidence is high enough
    if (confidence > 0.8 && dataPoint.uptime > 90) {
      try {
        // Ingest the simulated data
        const ingestion = await this.workflow.ingestData(dataPoint, {
          region: dataPoint.location.region,
          node: dataPoint.facilityId,
          apiVersion: 'VMR0016-Simulated'
        });

        // Analyze
        const analysis = await this.workflow.analyzeData(ingestion);

        // Attest
        const vc = await this.workflow.attestValidation(analysis, ingestion);
        simulation.vc = vc;

        logger.info('VNXShadowFlare', {
          facility: dataPoint.facilityId,
          credits: credits.toFixed(2),
          confidence: confidence.toFixed(3),
          type: validationType,
          message: 'VC issued for simulated Flare data'
        });

      } catch (error) {
        logger.error('VNXShadowFlare', {
          error: error instanceof Error ? error.message : 'Unknown',
          facility: dataPoint.facilityId,
          message: 'Failed to issue VC'
        });
      }
    }

    // Store in history
    this.simulatedHistory.push(simulation);
    if (this.simulatedHistory.length > this.maxHistorySize) {
      this.simulatedHistory.shift();
    }

    return simulation;
  }

  /**
   * Generate realistic VMR0016 data point
   */
  private generateVMR0016Data(): VMR0016DataPoint {
    const now = new Date();
    
    // Random facility ID
    const facilities = [
      'VMR0016-ALPHA', 'VMR0016-BETA', 'VMR0016-GAMMA',
      'VMR0016-DELTA', 'VMR0016-ECHO'
    ];
    const facilityId = facilities[Math.floor(Math.random() * facilities.length)];

    // Simulate methane flow with realistic variance
    const flowVariance = (Math.random() - 0.5) * 2 * this.config.methaneFlowVariance;
    const methaneFlowRate = Math.max(100, 
      this.config.methaneFlowBase + flowVariance
    );

    // Concentration typically 50-90%
    const methaneConcentration = 50 + Math.random() * 40;

    // Gas volume correlates with flow
    const gasVolume = methaneFlowRate * 2.5 + Math.random() * 50;

    // Destruction efficiency (typically 99-99.9%)
    const destructionEfficiency = this.config.destructionEfficiencyBase + 
      (Math.random() * 0.4 - 0.2);

    // Uptime with occasional dips
    const uptime = Math.random() < 0.95 
      ? this.config.facilityUptimeBase + Math.random() * 4
      : 70 + Math.random() * 20; // Occasional low uptime

    // West Virginia location
    const locations = [
      { lat: 39.45, lng: -80.15, region: 'Fairmont' },
      { lat: 39.63, lng: -79.95, region: 'Morgantown' },
      { lat: 39.28, lng: -80.34, region: 'Clarksburg' },
      { lat: 37.78, lng: -81.18, region: 'Beckley' },
      { lat: 38.42, lng: -82.44, region: 'Huntington' }
    ];
    const location = locations[Math.floor(Math.random() * locations.length)];

    return {
      timestamp: now.toISOString(),
      facilityId,
      methaneFlowRate: Math.round(methaneFlowRate * 100) / 100,
      methaneConcentration: Math.round(methaneConcentration * 100) / 100,
      gasVolume: Math.round(gasVolume * 100) / 100,
      destructionEfficiency: Math.round(destructionEfficiency * 100) / 100,
      uptime: Math.round(uptime * 100) / 100,
      location
    };
  }

  /**
   * Calculate carbon credits from methane data
   * 
   * Formula: kg CH4 * GWP-100 (25) * destruction efficiency
   */
  private calculateCarbonCredits(data: VMR0016DataPoint): number {
    // Methane destroyed = flow rate * uptime * destruction efficiency
    const methaneDestroyed = data.methaneFlowRate * 
      (data.uptime / 100) * 
      (data.destructionEfficiency / 100);

    // Carbon credits = methane * GWP-100
    const credits = methaneDestroyed * this.config.creditsPerKgMethane;

    return Math.round(credits * 100) / 100;
  }

  /**
   * Calculate confidence score for simulation
   */
  private calculateConfidence(data: VMR0016DataPoint): number {
    let score = 0.5;

    // Uptime contribution
    score += (data.uptime / 100) * 0.3;

    // Destruction efficiency contribution
    score += (data.destructionEfficiency / 100) * 0.2;

    // Data quality (concentration in valid range)
    if (data.methaneConcentration > 40 && data.methaneConcentration < 95) {
      score += 0.1;
    }

    // Flow rate sanity check
    if (data.methaneFlowRate > 50 && data.methaneFlowRate < 1000) {
      score += 0.1;
    }

    return Math.min(score, 0.98);
  }

  /**
   * Generate 24 hours of historical data
   * For building "History of Competence"
   */
  async generateHistoricalData(hours: number = 24): Promise<SimulatedValidation[]> {
    console.log(`\n📚 Generating ${hours} hours of historical data...`);

    const results: SimulatedValidation[] = [];
    
    for (let i = hours; i > 0; i--) {
      // Set timestamp to historical time
      const historicalTime = new Date(Date.now() - (i * 60 * 60 * 1000));
      
      // Generate data with historical timestamp
      const dataPoint = this.generateVMR0016Data();
      dataPoint.timestamp = historicalTime.toISOString();

      // Calculate credits
      const credits = this.calculateCarbonCredits(dataPoint);
      
      // Calculate confidence
      const confidence = this.calculateConfidence(dataPoint);

      const simulation: SimulatedValidation = {
        dataPoint,
        simulatedCarbonCredits: credits,
        validationType: 'VNX-S-Historical',
        confidence,
        vc: null
      };

      // Issue VC for high-quality historical data
      if (confidence > 0.85 && dataPoint.uptime > 90) {
        try {
          const ingestion = await this.workflow.ingestData(dataPoint, {
            region: dataPoint.location.region,
            node: dataPoint.facilityId,
            apiVersion: 'VMR0016-Historical'
          });
          
          const analysis = await this.workflow.analyzeData(ingestion);
          const vc = await this.workflow.attestValidation(analysis, ingestion);
          
          simulation.vc = vc;
        } catch (error) {
          // Continue even if one fails
        }
      }

      results.push(simulation);
      this.simulatedHistory.push(simulation);
    }

    console.log(`✅ Generated ${results.length} historical data points`);
    console.log(`   VCs issued: ${results.filter(r => r.vc !== null).length}\n`);

    return results;
  }

  /**
   * Get simulation statistics
   */
  getStats(): {
    isRunning: boolean;
    totalSimulations: number;
    totalVcsIssued: number;
    totalCreditsSimulated: number;
    averageConfidence: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {
      'VNX-S-Realtime': 0,
      'VNX-S-Historical': 0,
      'VNX-S-Projected': 0
    };

    let totalCredits = 0;
    let totalConfidence = 0;

    for (const sim of this.simulatedHistory) {
      byType[sim.validationType]++;
      totalCredits += sim.simulatedCarbonCredits;
      totalConfidence += sim.confidence;
    }

    return {
      isRunning: this.isRunning,
      totalSimulations: this.simulatedHistory.length,
      totalVcsIssued: this.simulatedHistory.filter(s => s.vc !== null).length,
      totalCreditsSimulated: Math.round(totalCredits * 100) / 100,
      averageConfidence: this.simulatedHistory.length > 0 
        ? Math.round((totalConfidence / this.simulatedHistory.length) * 1000) / 1000
        : 0,
      byType
    };
  }

  /**
   * Print simulation status
   */
  printStatus(): void {
    const stats = this.getStats();
    
    console.log('\n🔥 VNX-S SHADOW FLARE SIMULATION');
    console.log('=================================\n');
    console.log(`Status: ${stats.isRunning ? '🟢 RUNNING' : '⚪ STOPPED'}`);
    console.log(`Total Simulations: ${stats.totalSimulations}`);
    console.log(`VCs Issued: ${stats.totalVcsIssued}`);
    console.log(`Total Credits: ${stats.totalCreditsSimulated.toFixed(2)} tCO2e`);
    console.log(`Avg Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
    console.log(`\nBy Type:`);
    Object.entries(stats.byType).forEach(([type, count]) => {
      if (count > 0) console.log(`  ${type}: ${count}`);
    });
    console.log('\n=================================\n');
  }
}
