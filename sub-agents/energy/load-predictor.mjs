/**
 * Load Predictor Sub-Agent
 * Predicts energy demand based on historical patterns and external factors
 */

import { SubAgent } from '../base.mjs';

export class LoadPredictor extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'LOAD_PREDICTOR',
      interval: config.interval || 180000 // 3 minutes default
    });
    
    this.region = config.region || 'PJM_AEP';
    this.historicalData = [];
    this.predictions = [];
    this.accuracy = [];
    this.baseLoad = 5000; // MW
  }

  async performTask(parentContext) {
    const now = new Date();
    const currentHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    // Get actual load from parent context or simulate
    const actualLoad = parentContext?.currentLoad || this.simulateLoad(currentHour, isWeekend);
    
    // Generate predictions for next hours
    const predictions = this.generatePredictions(currentHour, isWeekend);
    
    // Record historical data
    this.historicalData.push({
      hour: currentHour,
      load: actualLoad,
      timestamp: Date.now()
    });
    
    // Keep only last 72 hours
    if (this.historicalData.length > 72) {
      this.historicalData.shift();
    }
    
    // Store predictions
    this.predictions = predictions;
    
    return {
      region: this.region,
      currentHour,
      actualLoad,
      predictions,
      peakHour: this.identifyPeakHour(predictions),
      accuracy: this.calculateAccuracy(),
      timestamp: Date.now()
    };
  }

  simulateLoad(hour, isWeekend) {
    // Base load pattern
    let loadFactor = 0.7;
    
    if (isWeekend) {
      // Weekend pattern: later peak, lower overall
      if (hour >= 10 && hour <= 14) loadFactor = 0.85;
      else if (hour >= 19 && hour <= 22) loadFactor = 0.9;
      else loadFactor = 0.7 + Math.random() * 0.1;
    } else {
      // Weekday pattern: morning and evening peaks
      if (hour >= 7 && hour <= 9) loadFactor = 1.0; // Morning peak
      else if (hour >= 17 && hour <= 21) loadFactor = 1.15; // Evening peak
      else if (hour >= 12 && hour <= 14) loadFactor = 0.95; // Lunch
      else loadFactor = 0.75 + Math.random() * 0.1;
    }
    
    // Add temperature factor (simulated)
    const tempFactor = 1 + (Math.random() - 0.5) * 0.2;
    
    return Math.round(this.baseLoad * loadFactor * tempFactor);
  }

  generatePredictions(currentHour, isWeekend) {
    const predictions = [];
    
    for (let i = 1; i <= 6; i++) {
      const hour = (currentHour + i) % 24;
      const predictedLoad = this.simulateLoad(hour, isWeekend);
      const confidence = Math.max(0.6, 0.9 - i * 0.05);
      
      predictions.push({
        hour,
        predictedLoad,
        confidence: (confidence * 100).toFixed(0) + '%',
        confidenceValue: confidence,
        range: {
          min: Math.round(predictedLoad * 0.95),
          max: Math.round(predictedLoad * 1.05)
        }
      });
    }
    
    return predictions;
  }

  identifyPeakHour(predictions) {
    const peak = predictions.reduce((max, p) => 
      p.predictedLoad > max.predictedLoad ? p : max, predictions[0]);
    return {
      hour: peak.hour,
      predictedLoad: peak.predictedLoad,
      isCritical: peak.predictedLoad > this.baseLoad * 1.1
    };
  }

  calculateAccuracy() {
    if (this.historicalData.length < 6 || this.predictions.length < 6) {
      return { average: 0, samples: 0 };
    }
    
    // Compare actual vs predicted for last 3 hours
    const checks = [];
    for (let i = 1; i <= 3; i++) {
      if (this.historicalData.length > i && this.predictions.length >= i) {
        const actual = this.historicalData[this.historicalData.length - i].load;
        const predicted = this.predictions[i - 1]?.predictedLoad;
        if (predicted) {
          const error = Math.abs(actual - predicted) / actual;
          checks.push(1 - error);
        }
      }
    }
    
    if (checks.length === 0) return { average: 0, samples: 0 };
    
    const avg = checks.reduce((a, b) => a + b, 0) / checks.length;
    return {
      average: (avg * 100).toFixed(1) + '%',
      averageValue: avg,
      samples: checks.length
    };
  }

  getStats() {
    return {
      ...super.getStats(),
      region: this.region,
      baseLoad: this.baseLoad,
      dataPoints: this.historicalData.length,
      accuracy: this.calculateAccuracy(),
      lastPrediction: this.predictions[0] || null
    };
  }
}

export default LoadPredictor;
