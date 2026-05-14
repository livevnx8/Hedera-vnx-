/**
 * Time Series Forecasting Engine
 * 
 * Hybrid ARIMA + LSTM approach for:
 * - HBAR price prediction
 * - DeFi yield forecasting
 * - Network congestion prediction
 * - Anomaly detection
 * 
 * @module ai/predictive/timeSeriesForecaster
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  features?: Record<string, number>; // Additional features (volume, volatility, etc.)
}

export interface ForecastResult {
  predictions: Array<{
    timestamp: number;
    value: number;
    confidenceLower: number;
    confidenceUpper: number;
  }>;
  horizon: number; // Hours ahead
  confidence: number; // Overall confidence (0-1)
  model: 'arima' | 'lstm' | 'ensemble';
  metrics: {
    mae: number; // Mean Absolute Error
    rmse: number; // Root Mean Square Error
    mape: number; // Mean Absolute Percentage Error
  };
}

export interface AnomalyResult {
  timestamp: number;
  value: number;
  expectedValue: number;
  deviation: number; // Z-score
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ─── ARIMA Model (Simplified) ────────────────────────────────────────────────

class ARIMAModel {
  private p: number; // Autoregressive order
  private d: number; // Differencing order
  private q: number; // Moving average order

  constructor(p = 2, d = 1, q = 2) {
    this.p = p;
    this.d = d;
    this.q = q;
  }

  /**
   * Fit ARIMA model to data
   */
  fit(data: number[]): { coefficients: number[]; residuals: number[] } {
    // Simplified: Calculate differences
    const diff = this.differentiate(data, this.d);
    
    // Simple autoregression (mock)
    const coefficients = new Array(this.p).fill(0).map(() => Math.random() * 0.5);
    
    // Calculate residuals
    const residuals = diff.slice(this.p).map((val, i) => {
      const predicted = coefficients.reduce((sum, coef, j) => {
        return sum + coef * (diff[i + this.p - j - 1] || 0);
      }, 0);
      return val - predicted;
    });

    return { coefficients, residuals };
  }

  /**
   * Forecast future values
   */
  forecast(data: number[], steps: number): Array<{ value: number; variance: number }> {
    const { coefficients } = this.fit(data);
    const predictions: Array<{ value: number; variance: number }> = [];
    
    // Extend data with predictions
    const extended = [...data];
    
    for (let i = 0; i < steps; i++) {
      // Simple AR prediction
      const prediction = coefficients.reduce((sum, coef, j) => {
        const idx = extended.length - j - 1;
        return sum + coef * (extended[idx] || extended[extended.length - 1]);
      }, 0);
      
      extended.push(prediction);
      predictions.push({
        value: prediction,
        variance: Math.abs(prediction) * 0.1, // 10% variance estimate
      });
    }

    return predictions;
  }

  /**
   * Differentiate time series
   */
  private differentiate(data: number[], order: number): number[] {
    if (order === 0) return data;
    
    const diff = data.slice(1).map((val, i) => val - data[i]);
    return this.differentiate(diff, order - 1);
  }
}

// ─── LSTM-like Model (Simplified for TypeScript) ────────────────────────────

class LSTMModel {
  private windowSize: number;
  private weights: number[][];

  constructor(windowSize = 10) {
    this.windowSize = windowSize;
    this.weights = this.initializeWeights();
  }

  /**
   * Initialize random weights
   */
  private initializeWeights(): number[][] {
    return new Array(this.windowSize)
      .fill(0)
      .map(() => new Array(5).fill(0).map(() => Math.random() * 0.1));
  }

  /**
   * Simplified LSTM forward pass
   */
  predict(window: number[]): number {
    // Simplified: weighted average with non-linearity
    const weighted = window.map((val, i) => {
      const w = this.weights[i % this.windowSize];
      return val * w[0] + Math.tanh(val) * w[1];
    });
    
    const sum = weighted.reduce((a, b) => a + b, 0);
    return sum / window.length;
  }

  /**
   * Forecast using sliding window
   */
  forecast(data: number[], steps: number): number[] {
    const predictions: number[] = [];
    const extended = [...data];

    for (let i = 0; i < steps; i++) {
      const window = extended.slice(-this.windowSize);
      const prediction = this.predict(window);
      extended.push(prediction);
      predictions.push(prediction);
    }

    return predictions;
  }
}

// ─── Ensemble Forecaster ───────────────────────────────────────────────────

export class TimeSeriesForecaster extends EventEmitter {
  private arima: ARIMAModel;
  private lstm: LSTMModel;
  private history: Map<string, TimeSeriesPoint[]> = new Map();

  constructor() {
    super();
    this.arima = new ARIMAModel(2, 1, 2);
    this.lstm = new LSTMModel(10);
  }

  /**
   * Add data point to history
   */
  addDataPoint(seriesId: string, point: TimeSeriesPoint): void {
    if (!this.history.has(seriesId)) {
      this.history.set(seriesId, []);
    }
    
    const series = this.history.get(seriesId)!;
    series.push(point);
    
    // Keep last 1000 points
    if (series.length > 1000) {
      series.shift();
    }

    this.emit('data_added', { seriesId, point });
  }

  /**
   * Forecast future values
   */
  async forecast(
    seriesId: string,
    horizon: number = 24 // Hours ahead
  ): Promise<ForecastResult> {
    const series = this.history.get(seriesId);
    if (!series || series.length < 20) {
      throw new Error(`Insufficient data for series ${seriesId} (need 20+, have ${series?.length || 0})`);
    }

    const values = series.map(p => p.value);
    const lastTimestamp = series[series.length - 1].timestamp;
    const interval = this.calculateInterval(series);

    // ARIMA forecast
    const arimaResults = this.arima.forecast(values, horizon);
    
    // LSTM forecast
    const lstmResults = this.lstm.forecast(values, horizon);

    // Ensemble: average both models
    const predictions = arimaResults.map((arima, i) => {
      const lstm = lstmResults[i];
      const ensemble = (arima.value + lstm) / 2;
      const variance = (arima.variance + Math.abs(lstm - arima.value)) / 2;
      
      return {
        timestamp: lastTimestamp + (i + 1) * interval,
        value: ensemble,
        confidenceLower: ensemble - 1.96 * variance,
        confidenceUpper: ensemble + 1.96 * variance,
      };
    });

    // Calculate confidence metrics
    const metrics = this.calculateMetrics(values.slice(-horizon), predictions.map(p => p.value));
    const confidence = Math.max(0, Math.min(1, 1 - metrics.mape));

    this.emit('forecast_complete', { seriesId, horizon, confidence });

    return {
      predictions,
      horizon,
      confidence,
      model: 'ensemble',
      metrics,
    };
  }

  /**
   * Detect anomalies in time series
   */
  async detectAnomalies(
    seriesId: string,
    lookback: number = 50
  ): Promise<AnomalyResult[]> {
    const series = this.history.get(seriesId);
    if (!series || series.length < lookback) {
      throw new Error(`Insufficient data for anomaly detection`);
    }

    const recent = series.slice(-lookback);
    const values = recent.map(p => p.value);
    
    // Calculate statistics
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    // Detect anomalies (Z-score > 2.5)
    const anomalies: AnomalyResult[] = recent.map((point, i) => {
      const zScore = (point.value - mean) / (std || 1);
      const isAnomaly = Math.abs(zScore) > 2.5;
      
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (Math.abs(zScore) > 4) severity = 'critical';
      else if (Math.abs(zScore) > 3.5) severity = 'high';
      else if (Math.abs(zScore) > 2.5) severity = 'medium';

      return {
        timestamp: point.timestamp,
        value: point.value,
        expectedValue: mean,
        deviation: zScore,
        isAnomaly,
        severity,
      };
    });

    const foundAnomalies = anomalies.filter(a => a.isAnomaly);
    if (foundAnomalies.length > 0) {
      this.emit('anomalies_detected', { seriesId, anomalies: foundAnomalies });
    }

    return anomalies;
  }

  /**
   * Analyze trends
   */
  analyzeTrend(seriesId: string): {
    direction: 'up' | 'down' | 'sideways';
    strength: number; // 0-1
    changePercent: number;
  } {
    const series = this.history.get(seriesId);
    if (!series || series.length < 10) {
      return { direction: 'sideways', strength: 0, changePercent: 0 };
    }

    const values = series.map(p => p.value);
    const first = values[0];
    const last = values[values.length - 1];
    const change = ((last - first) / Math.abs(first || 1)) * 100;

    // Calculate trend using linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Calculate R-squared (trend strength)
    const yMean = sumY / n;
    const ssTotal = values.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const predicted = x.map(xi => slope * xi + (sumY - slope * sumX) / n);
    const ssResidual = values.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
    const rSquared = 1 - ssResidual / ssTotal;

    let direction: 'up' | 'down' | 'sideways';
    if (slope > 0.01) direction = 'up';
    else if (slope < -0.01) direction = 'down';
    else direction = 'sideways';

    return {
      direction,
      strength: Math.abs(rSquared),
      changePercent: change,
    };
  }

  /**
   * Get series statistics
   */
  getStatistics(seriesId: string): {
    count: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    latest: number;
  } | null {
    const series = this.history.get(seriesId);
    if (!series || series.length === 0) return null;

    const values = series.map(p => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return {
      count: values.length,
      mean,
      std: Math.sqrt(variance),
      min: Math.min(...values),
      max: Math.max(...values),
      latest: values[values.length - 1],
    };
  }

  /**
   * Calculate average interval between points
   */
  private calculateInterval(series: TimeSeriesPoint[]): number {
    if (series.length < 2) return 3600000; // Default 1 hour
    
    const intervals: number[] = [];
    for (let i = 1; i < series.length; i++) {
      intervals.push(series[i].timestamp - series[i - 1].timestamp);
    }
    
    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  /**
   * Calculate forecast accuracy metrics
   */
  private calculateMetrics(actual: number[], predicted: number[]): {
    mae: number;
    rmse: number;
    mape: number;
  } {
    const errors = actual.map((val, i) => val - predicted[i]);
    
    const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;
    const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
    const mape = errors.reduce((sum, e, i) => sum + Math.abs(e / (actual[i] || 1)), 0) / errors.length;

    return { mae, rmse, mape };
  }
}

// ─── Specialized Forecasters ────────────────────────────────────────────────

export class HBARPriceForecaster extends TimeSeriesForecaster {
  constructor() {
    super();
  }

  /**
   * Add HBAR price data
   */
  addPrice(timestamp: number, price: number, volume?: number): void {
    this.addDataPoint('hbar_price', {
      timestamp,
      value: price,
      features: volume ? { volume } : undefined,
    });
  }

  /**
   * Predict HBAR price
   */
  async predictPrice(horizonHours: number = 24): Promise<ForecastResult> {
    return this.forecast('hbar_price', horizonHours);
  }

  /**
   * Detect price anomalies
   */
  async detectPriceSpikes(): Promise<AnomalyResult[]> {
    return this.detectAnomalies('hbar_price', 50);
  }
}

export class DeFiYieldForecaster extends TimeSeriesForecaster {
  constructor() {
    super();
  }

  /**
   * Add yield data for a pool
   */
  addYield(poolId: string, timestamp: number, apy: number, tvl?: number): void {
    this.addDataPoint(`yield_${poolId}`, {
      timestamp,
      value: apy,
      features: tvl ? { tvl } : undefined,
    });
  }

  /**
   * Predict yield for a pool
   */
  async predictYield(poolId: string, horizonDays: number = 7): Promise<ForecastResult> {
    return this.forecast(`yield_${poolId}`, horizonDays * 24);
  }

  /**
   * Find best yield opportunities
   */
  findBestOpportunities(poolIds: string[]): Array<{
    poolId: string;
    currentApy: number;
    trend: 'up' | 'down' | 'sideways';
    confidence: number;
  }> {
    return poolIds.map(id => {
      const stats = this.getStatistics(`yield_${id}`);
      const trend = this.analyzeTrend(`yield_${id}`);
      
      return {
        poolId: id,
        currentApy: stats?.latest || 0,
        trend: trend.direction,
        confidence: trend.strength,
      };
    }).sort((a, b) => b.currentApy - a.currentApy);
  }
}

// ─── Singleton Exports ─────────────────────────────────────────────────────

export const timeSeriesForecaster = new TimeSeriesForecaster();
export const hbarForecaster = new HBARPriceForecaster();
export const defiForecaster = new DeFiYieldForecaster();
export default timeSeriesForecaster;
