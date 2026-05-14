#!/usr/bin/env node
/**
 * TimeSeriesForecast - Advanced forecasting for energy/DeFi/carbon
 * Phase 4 Implementation
 */

export class TimeSeriesForecast {
  constructor(config = {}) {
    this.horizon = config.horizon || 24; // 24 steps ahead
    this.confidenceLevel = config.confidenceLevel || 0.95;
    this.models = new Map();
  }
  
  /**
   * Train ARIMA-like model (simplified)
   * @param {string} seriesId - Time series identifier
   * @param {Array<{timestamp: number, value: number}>} data - Time series data
   */
  train(seriesId, data) {
    if (data.length < 10) {
      return { success: false, error: 'Need 10+ data points' };
    }
    
    // Sort by timestamp
    const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const values = sorted.map(d => d.value);
    
    // Calculate components
    const trend = this._fitTrend(values);
    const seasonality = this._fitSeasonality(values);
    const residuals = this._calculateResiduals(values, trend, seasonality);
    
    const model = {
      seriesId,
      lastValue: values[values.length - 1],
      trend,
      seasonality,
      residualStd: this._stdDev(residuals),
      lastTimestamp: sorted[sorted.length - 1].timestamp,
      interval: this._estimateInterval(sorted),
      dataPoints: values.length,
      trainedAt: Date.now()
    };
    
    this.models.set(seriesId, model);
    
    return {
      success: true,
      model: {
        seriesId,
        trend: trend.direction,
        seasonalityDetected: seasonality.detected,
        confidence: this._calculateModelConfidence(values, trend, seasonality),
        dataPoints: values.length
      }
    };
  }
  
  /**
   * Forecast next N values
   * @param {string} seriesId - Trained series
   * @param {number} steps - Steps to forecast
   */
  forecast(seriesId, steps = null) {
    const model = this.models.get(seriesId);
    if (!model) {
      return { success: false, error: 'Model not trained' };
    }
    
    const horizon = steps || this.horizon;
    const forecasts = [];
    
    for (let i = 1; i <= horizon; i++) {
      // Trend component
      const trendValue = model.lastValue + (model.trend.slope * i);
      
      // Seasonal component
      const seasonalValue = model.seasonality.detected 
        ? model.seasonality.component[(model.dataPoints + i - 1) % model.seasonality.period]
        : 0;
      
      // Combine
      const point = trendValue + seasonalValue;
      
      // Confidence intervals (widening with horizon)
      const zScore = 1.96; // 95% confidence
      const margin = zScore * model.residualStd * Math.sqrt(1 + (i * 0.1));
      
      forecasts.push({
        step: i,
        timestamp: model.lastTimestamp + (i * model.interval),
        value: Math.round(point * 100) / 100,
        lower: Math.round((point - margin) * 100) / 100,
        upper: Math.round((point + margin) * 100) / 100,
        confidence: Math.max(0.5, 0.95 - (i * 0.02))
      });
    }
    
    return {
      success: true,
      seriesId,
      horizon,
      lastValue: model.lastValue,
      forecasts,
      trend: model.trend.direction,
      reliability: this._assessReliability(model, horizon)
    };
  }
  
  /**
   * Detect trend changes
   * @param {string} seriesId - Model to analyze
   */
  detectTrendChange(seriesId) {
    const model = this.models.get(seriesId);
    if (!model) return { success: false, error: 'Model not found' };
    
    const recent = model.trend.recentSlope || model.trend.slope;
    const historical = model.trend.historicalSlope || model.trend.slope;
    
    const change = Math.abs(recent - historical);
    const significance = change > (2 * model.residualStd);
    
    return {
      success: true,
      trendChange: significance,
      direction: recent > historical ? 'ACCELERATING' : 'DECELERATING',
      magnitude: Math.round(change * 1000) / 1000,
      recommendation: significance 
        ? 'Trend shift detected - review underlying factors'
        : 'Trend stable'
    };
  }
  
  // Internal methods
  _fitTrend(values) {
    const n = values.length;
    const mid = Math.floor(n / 2);
    
    // Recent trend vs historical trend
    const recent = values.slice(-Math.min(10, Math.floor(n/3)));
    const historical = values.slice(0, Math.max(10, Math.floor(n/3)));
    
    const recentSlope = this._linearRegression(recent).slope;
    const historicalSlope = this._linearRegression(historical).slope;
    const overallSlope = this._linearRegression(values).slope;
    
    return {
      slope: overallSlope,
      recentSlope,
      historicalSlope,
      direction: overallSlope > 0.001 ? 'UP' : overallSlope < -0.001 ? 'DOWN' : 'FLAT',
      acceleration: recentSlope - historicalSlope
    };
  }
  
  _fitSeasonality(values) {
    // Try periods 3-12
    let bestPeriod = 0;
    let bestScore = Infinity;
    
    for (let period = 3; period <= 12 && period < values.length / 2; period++) {
      const segments = [];
      for (let i = 0; i < period; i++) {
        const segment = [];
        for (let j = i; j < values.length; j += period) {
          segment.push(values[j]);
        }
        segments.push(segment);
      }
      
      // Calculate variance within segments vs between segments
      const withinVar = segments.reduce((sum, seg) => sum + this._variance(seg), 0) / segments.length;
      const betweenVar = this._variance(segments.map(s => s.reduce((a,b) => a+b)/s.length));
      
      const score = withinVar / (betweenVar + 0.001);
      if (score < bestScore) {
        bestScore = score;
        bestPeriod = period;
      }
    }
    
    const detected = bestScore < 0.5;
    
    // Calculate seasonal component
    const component = [];
    if (detected) {
      for (let i = 0; i < bestPeriod; i++) {
        const valuesAtPhase = [];
        for (let j = i; j < values.length; j += bestPeriod) {
          valuesAtPhase.push(values[j]);
        }
        const avg = valuesAtPhase.reduce((a,b) => a+b) / valuesAtPhase.length;
        component.push(avg - (values.reduce((a,b) => a+b) / values.length));
      }
    }
    
    return {
      detected,
      period: bestPeriod,
      confidence: Math.max(0, 1 - bestScore),
      component: component.map(c => Math.round(c * 100) / 100)
    };
  }
  
  _calculateResiduals(values, trend, seasonality) {
    return values.map((v, i) => {
      const trendComponent = trend.slope * i;
      const seasonalComponent = seasonality.detected 
        ? seasonality.component[i % seasonality.period] 
        : 0;
      return v - trendComponent - seasonalComponent;
    });
  }
  
  _linearRegression(values) {
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumXX = values.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
  }
  
  _stdDev(values) {
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  _variance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    return values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length;
  }
  
  _estimateInterval(sorted) {
    if (sorted.length < 2) return 60000; // Default 1 min
    const intervals = [];
    for (let i = 1; i < Math.min(sorted.length, 10); i++) {
      intervals.push(sorted[i].timestamp - sorted[i-1].timestamp);
    }
    return intervals.reduce((a, b) => a + b) / intervals.length;
  }
  
  _calculateModelConfidence(values, trend, seasonality) {
    // R-squared approximation
    const predicted = values.map((v, i) => {
      const t = trend.slope * i;
      const s = seasonality.detected ? seasonality.component[i % seasonality.period] : 0;
      return t + s;
    });
    
    const mean = values.reduce((a, b) => a + b) / values.length;
    const ssTotal = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
    const ssRes = values.reduce((sum, v, i) => sum + Math.pow(v - predicted[i], 2), 0);
    
    return Math.max(0, 1 - (ssRes / ssTotal));
  }
  
  _assessReliability(model, horizon) {
    const dataQuality = Math.min(1, model.dataPoints / 100);
    const horizonFactor = Math.max(0, 1 - (horizon / 100));
    const trendStrength = Math.min(1, Math.abs(model.trend.slope) * 10);
    
    const reliability = (dataQuality * 0.4 + horizonFactor * 0.4 + trendStrength * 0.2);
    
    if (reliability > 0.7) return 'HIGH';
    if (reliability > 0.4) return 'MEDIUM';
    return 'LOW';
  }
  
  getStats(seriesId) {
    const model = this.models.get(seriesId);
    if (!model) return null;
    
    return {
      seriesId,
      dataPoints: model.dataPoints,
      trend: model.trend.direction,
      seasonality: model.seasonality.detected ? `Period ${model.seasonality.period}` : 'None',
      residualStd: Math.round(model.residualStd * 100) / 100,
      age: Math.floor((Date.now() - model.trainedAt) / 60000)
    };
  }
}

// Pre-configured forecasters
export const Forecasters = {
  energyLoad: new TimeSeriesForecast({ horizon: 24, confidenceLevel: 0.9 }),
  defiPrice: new TimeSeriesForecast({ horizon: 12, confidenceLevel: 0.85 }),
  carbonCredit: new TimeSeriesForecast({ horizon: 30, confidenceLevel: 0.95 }),
  securityEvents: new TimeSeriesForecast({ horizon: 6, confidenceLevel: 0.9 })
};

export default TimeSeriesForecast;
