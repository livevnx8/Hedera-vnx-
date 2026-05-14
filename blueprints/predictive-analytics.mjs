#!/usr/bin/env node
/**
 * PredictiveAnalytics - ML Pattern Recognition Engine
 * Phase 4 Implementation
 * Trains on HCS data to predict future trends and anomalies
 */

export class PredictiveAnalytics {
  constructor(config = {}) {
    this.windowSize = config.windowSize || 24; // 24 data points
    this.minSamples = config.minSamples || 10;
    this.models = new Map();
    this.patterns = new Map();
  }
  
  /**
   * Train model on time-series data
   * @param {string} modelId - Unique model identifier
   * @param {Array<number>} data - Historical data points
   * @param {Object} options - Training options
   */
  trainModel(modelId, data, options = {}) {
    if (data.length < this.minSamples) {
      return { success: false, error: `Need ${this.minSamples}+ samples, got ${data.length}` };
    }
    
    // Calculate trend
    const trend = this._calculateTrend(data);
    
    // Calculate seasonality (if enough data)
    const seasonality = data.length >= this.windowSize 
      ? this._detectSeasonality(data) 
      : null;
    
    // Build prediction model
    const model = {
      id: modelId,
      dataPoints: data.length,
      trend,
      seasonality,
      lastUpdated: Date.now(),
      accuracy: this._validateModel(data, trend, seasonality),
      stdDev: this._calculateStdDev(data),
      mean: data.reduce((a, b) => a + b, 0) / data.length
    };
    
    this.models.set(modelId, model);
    
    // Extract patterns
    this._extractPatterns(modelId, data);
    
    return {
      success: true,
      model,
      patternsFound: this.patterns.get(modelId)?.length || 0
    };
  }
  
  /**
   * Predict next N values
   * @param {string} modelId - Model to use
   * @param {number} steps - Number of steps to predict
   */
  predict(modelId, steps = 1) {
    const model = this.models.get(modelId);
    if (!model) {
      return { success: false, error: 'Model not found' };
    }
    
    const predictions = [];
    let lastValue = model.mean;
    
    for (let i = 0; i < steps; i++) {
      // Trend component
      const trendValue = lastValue + (model.trend.slope * (i + 1));
      
      // Seasonality component
      const seasonalValue = model.seasonality 
        ? model.seasonality.pattern[(model.dataPoints + i) % model.seasonality.period]
        : 0;
      
      // Combine
      const predicted = trendValue + seasonalValue;
      const confidence = Math.max(0.5, 1 - (i * 0.05)); // Confidence decreases with horizon
      
      predictions.push({
        step: i + 1,
        value: Math.round(predicted * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        lowerBound: Math.round((predicted - model.stdDev) * 100) / 100,
        upperBound: Math.round((predicted + model.stdDev) * 100) / 100
      });
      
      lastValue = predicted;
    }
    
    return {
      success: true,
      modelId,
      predictions,
      horizon: steps,
      modelAccuracy: model.accuracy
    };
  }
  
  /**
   * Detect anomalies in new data
   * @param {string} modelId - Trained model
   * @param {number} value - New value to check
   */
  detectAnomaly(modelId, value) {
    const model = this.models.get(modelId);
    if (!model) {
      return { success: false, error: 'Model not found' };
    }
    
    // Z-score calculation
    const zScore = Math.abs((value - model.mean) / model.stdDev);
    
    // Anomaly thresholds
    const isAnomaly = zScore > 3; // 3 sigma rule
    const severity = zScore > 4 ? 'CRITICAL' : zScore > 3 ? 'HIGH' : 'NORMAL';
    
    return {
      success: true,
      value,
      zScore: Math.round(zScore * 100) / 100,
      isAnomaly,
      severity,
      expectedRange: {
        min: Math.round((model.mean - 2 * model.stdDev) * 100) / 100,
        max: Math.round((model.mean + 2 * model.stdDev) * 100) / 100
      },
      deviation: Math.round(((value - model.mean) / model.mean) * 100 * 100) / 100
    };
  }
  
  /**
   * Predict when anomaly will occur
   * @param {string} modelId - Model to use
   * @param {number} threshold - Anomaly threshold
   */
  predictAnomaly(modelId, threshold) {
    const prediction = this.predict(modelId, 10);
    if (!prediction.success) return prediction;
    
    const anomalies = prediction.predictions.filter(p => 
      p.upperBound > threshold || p.lowerBound < -threshold
    );
    
    if (anomalies.length === 0) {
      return {
        success: true,
        anomalyPredicted: false,
        message: 'No anomaly predicted in next 10 steps'
      };
    }
    
    return {
      success: true,
      anomalyPredicted: true,
      timeToAnomaly: anomalies[0].step,
      confidence: anomalies[0].confidence,
      predictedValue: anomalies[0].value,
      recommendation: 'Increase monitoring frequency'
    };
  }
  
  // Internal methods
  _calculateTrend(data) {
    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, val) => sum + val, 0);
    const sumXY = data.reduce((sum, val, i) => sum + i * val, 0);
    const sumXX = data.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // R-squared
    const meanY = sumY / n;
    const ssTotal = data.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0);
    const ssResidual = data.reduce((sum, val, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(val - predicted, 2);
    }, 0);
    const rSquared = 1 - (ssResidual / ssTotal);
    
    return {
      slope: Math.round(slope * 1000) / 1000,
      intercept: Math.round(intercept * 100) / 100,
      direction: slope > 0.001 ? 'UP' : slope < -0.001 ? 'DOWN' : 'FLAT',
      strength: Math.abs(slope),
      rSquared: Math.round(rSquared * 100) / 100
    };
  }
  
  _detectSeasonality(data) {
    // Simple autocorrelation for seasonality detection
    const maxLag = Math.floor(data.length / 2);
    let bestPeriod = 0;
    let bestCorrelation = 0;
    
    for (let lag = 2; lag <= maxLag; lag++) {
      let correlation = 0;
      let count = 0;
      
      for (let i = lag; i < data.length; i++) {
        correlation += (data[i] - data[i - lag]) ** 2;
        count++;
      }
      
      const avgCorrelation = correlation / count;
      if (avgCorrelation < bestCorrelation || bestPeriod === 0) {
        bestCorrelation = avgCorrelation;
        bestPeriod = lag;
      }
    }
    
    // Calculate seasonal pattern
    const pattern = [];
    for (let i = 0; i < bestPeriod; i++) {
      const values = [];
      for (let j = i; j < data.length; j += bestPeriod) {
        values.push(data[j]);
      }
      pattern.push(values.reduce((a, b) => a + b, 0) / values.length);
    }
    
    return {
      detected: bestCorrelation < 100,
      period: bestPeriod,
      confidence: Math.max(0, 1 - bestCorrelation / 1000),
      pattern: pattern.map(p => Math.round(p * 100) / 100)
    };
  }
  
  _calculateStdDev(data) {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
  
  _validateModel(data, trend, seasonality) {
    // Simple validation: predict last 3 values and compare
    const testSize = Math.min(3, Math.floor(data.length * 0.1));
    const trainData = data.slice(0, -testSize);
    const testData = data.slice(-testSize);
    
    // Simple trend-based prediction
    let errors = 0;
    const lastTrain = trainData[trainData.length - 1];
    
    for (let i = 0; i < testSize; i++) {
      const predicted = lastTrain + (trend.slope * (i + 1));
      const actual = testData[i];
      errors += Math.abs(predicted - actual) / actual;
    }
    
    const mape = (errors / testSize) * 100;
    return Math.max(0, 1 - (mape / 100)); // Accuracy score 0-1
  }
  
  _extractPatterns(modelId, data) {
    const patterns = [];
    
    // Detect spikes
    for (let i = 1; i < data.length; i++) {
      const change = (data[i] - data[i-1]) / data[i-1];
      if (Math.abs(change) > 0.2) {
        patterns.push({
          type: change > 0 ? 'SPIKE_UP' : 'SPIKE_DOWN',
          magnitude: Math.abs(change),
          index: i,
          timestamp: Date.now() - (data.length - i) * 60000
        });
      }
    }
    
    // Detect plateaus
    let plateauStart = 0;
    for (let i = 1; i < data.length; i++) {
      if (Math.abs(data[i] - data[i-1]) / data[i-1] < 0.01) {
        if (i - plateauStart > 3) {
          patterns.push({
            type: 'PLATEAU',
            duration: i - plateauStart,
            startIndex: plateauStart,
            value: data[plateauStart]
          });
        }
      } else {
        plateauStart = i;
      }
    }
    
    this.patterns.set(modelId, patterns);
  }
  
  /**
   * Get model health and statistics
   */
  getModelStats(modelId) {
    const model = this.models.get(modelId);
    if (!model) return null;
    
    return {
      ...model,
      age: Math.floor((Date.now() - model.lastUpdated) / 1000),
      patterns: this.patterns.get(modelId)?.length || 0
    };
  }
  
  /**
   * List all trained models
   */
  listModels() {
    return Array.from(this.models.entries()).map(([id, model]) => ({
      id,
      dataPoints: model.dataPoints,
      trend: model.trend.direction,
      accuracy: model.accuracy,
      age: Math.floor((Date.now() - model.lastUpdated) / 60000)
    }));
  }
}

// Domain-specific analytics configurations
export const DomainAnalytics = {
  energy: new PredictiveAnalytics({ windowSize: 24, minSamples: 12 }),
  defi: new PredictiveAnalytics({ windowSize: 48, minSamples: 20 }),
  security: new PredictiveAnalytics({ windowSize: 12, minSamples: 6 }),
  carbon: new PredictiveAnalytics({ windowSize: 30, minSamples: 15 })
};

export default PredictiveAnalytics;
