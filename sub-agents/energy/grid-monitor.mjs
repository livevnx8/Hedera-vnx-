/**
 * Grid Monitor Sub-Agent
 * Monitors energy grid status and generation data
 */

import { SubAgent } from '../base.mjs';

export class GridMonitor extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'GRID_MONITOR',
      interval: config.interval || 60000 // 1 minute default
    });
    
    this.region = config.region || 'PJM_AEP';
    this.sources = config.sources || ['coal', 'natural_gas', 'wind', 'hydro', 'solar'];
    this.thresholds = {
      frequency: { min: 59.95, max: 60.05 },
      voltage: { min: 0.95, max: 1.05 }
    };
    this.gridHistory = [];
    this.anomaliesDetected = 0;
  }

  async performTask(parentContext) {
    const status = this.collectGridStatus();
    
    // Check for anomalies
    const anomalies = this.detectAnomalies(status);
    
    if (anomalies.length > 0) {
      this.anomaliesDetected += anomalies.length;
    }
    
    // Store history
    this.gridHistory.push({
      status,
      anomalies,
      timestamp: Date.now()
    });
    
    // Keep only last 100 readings
    if (this.gridHistory.length > 100) {
      this.gridHistory.shift();
    }
    
    return {
      region: this.region,
      status,
      anomaliesDetected: anomalies.length,
      totalAnomalies: this.anomaliesDetected,
      isStable: anomalies.length === 0,
      timestamp: Date.now()
    };
  }

  collectGridStatus() {
    // Simulate grid data collection
    const frequency = 60 + (Math.random() - 0.5) * 0.1;
    const voltage = 1.0 + (Math.random() - 0.5) * 0.05;
    
    const generation = {};
    let totalGeneration = 0;
    
    for (const source of this.sources) {
      const baseOutput = this.getBaseOutput(source);
      const variability = 0.9 + Math.random() * 0.2;
      const output = baseOutput * variability;
      
      generation[source] = {
        output: Math.round(output),
        capacity: baseOutput,
        utilization: (output / baseOutput * 100).toFixed(1) + '%'
      };
      
      totalGeneration += output;
    }
    
    const demand = totalGeneration * (0.95 + Math.random() * 0.1);
    
    return {
      frequency: frequency.toFixed(3),
      voltage: voltage.toFixed(4),
      generation,
      totalGeneration: Math.round(totalGeneration),
      demand: Math.round(demand),
      reserve: Math.round(totalGeneration - demand),
      reservePercent: ((totalGeneration - demand) / totalGeneration * 100).toFixed(1) + '%',
      timestamp: Date.now()
    };
  }

  getBaseOutput(source) {
    const baseOutputs = {
      coal: 3500,
      natural_gas: 1200,
      wind: 800,
      hydro: 400,
      solar: 150
    };
    return baseOutputs[source] || 500;
  }

  detectAnomalies(status) {
    const anomalies = [];
    
    const freq = parseFloat(status.frequency);
    if (freq < this.thresholds.frequency.min || freq > this.thresholds.frequency.max) {
      anomalies.push({
        type: 'FREQUENCY_DEVIATION',
        value: status.frequency,
        severity: Math.abs(freq - 60) > 0.08 ? 'HIGH' : 'MEDIUM',
        message: `Grid frequency at ${status.frequency} Hz, outside normal range`
      });
    }
    
    const reserve = parseFloat(status.reservePercent);
    if (reserve < 5) {
      anomalies.push({
        type: 'LOW_RESERVE',
        value: status.reservePercent,
        severity: 'HIGH',
        message: `Grid reserve critically low at ${status.reservePercent}`
      });
    }
    
    return anomalies;
  }

  getStats() {
    return {
      ...super.getStats(),
      region: this.region,
      sources: this.sources.length,
      anomaliesDetected: this.anomaliesDetected,
      lastReading: this.gridHistory.length > 0 ? this.gridHistory[this.gridHistory.length - 1] : null
    };
  }
}

export default GridMonitor;
