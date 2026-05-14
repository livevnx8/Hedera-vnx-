/**
 * Load Forecaster
 * 
 * Predicts network load and system demand for proactive scaling.
 * Uses historical patterns, time-of-day analysis, and event detection.
 */

import { logger } from '../monitoring/logger.js';
import type { LoadForecast } from './types.js';

interface ForecasterConfig {
  historyWindowHours: number;
  forecastHorizonHours: number;
  updateIntervalMinutes: number;
  seasonalAdjustment: boolean;
}

interface LoadDataPoint {
  timestamp: number;
  load: number;
  agents: number;
  transactions: number;
  errors: number;
}

export class LoadForecaster {
  private config: ForecasterConfig;
  private history: LoadDataPoint[] = [];
  private currentForecast: LoadForecast | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private subscribers: Set<(forecast: LoadForecast) => void> = new Set();

  constructor(config: Partial<ForecasterConfig> = {}) {
    this.config = {
      historyWindowHours: 168, // 1 week
      forecastHorizonHours: 24,
      updateIntervalMinutes: 15,
      seasonalAdjustment: true,
      ...config
    };
  }

  /**
   * Start forecasting updates
   */
  start(): void {
    this.updateForecast();
    
    this.updateInterval = setInterval(
      () => this.updateForecast(),
      this.config.updateIntervalMinutes * 60 * 1000
    );

    logger.info('LoadForecaster', {
      message: 'Load forecaster started',
      config: this.config
    });
  }

  /**
   * Stop forecasting updates
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Record current load data point
   */
  recordLoad(load: number, agents: number, transactions: number, errors: number): void {
    const dataPoint: LoadDataPoint = {
      timestamp: Date.now(),
      load,
      agents,
      transactions,
      errors
    };

    this.history.push(dataPoint);

    // Trim old data
    const cutoff = Date.now() - (this.config.historyWindowHours * 60 * 60 * 1000);
    this.history = this.history.filter(h => h.timestamp > cutoff);

    logger.debug('LoadForecaster', {
      message: 'Load recorded',
      load,
      agents,
      transactions
    });
  }

  /**
   * Predict load for a specific time in the future
   */
  async predictNetworkLoad(hoursAhead: number): Promise<LoadForecast> {
    if (this.history.length < 24) {
      // Not enough data - return conservative estimate
      return {
        timestamp: Date.now() + (hoursAhead * 60 * 60 * 1000),
        predictedLoad: this.getCurrentLoad() * 1.1,
        confidence: 0.3,
        factors: {
          historicalPattern: 0,
          timeOfDay: this.getTimeOfDayFactor(hoursAhead),
          dayOfWeek: this.getDayOfWeekFactor(hoursAhead),
          specialEvents: []
        },
        recommendedScaling: {
          action: 'maintain',
          targetAgents: 10,
          reason: 'Insufficient historical data for prediction'
        }
      };
    }

    // Calculate prediction factors
    const historicalPattern = this.calculateHistoricalPattern(hoursAhead);
    const timeOfDay = this.getTimeOfDayFactor(hoursAhead);
    const dayOfWeek = this.getDayOfWeekFactor(hoursAhead);
    const events = this.detectSpecialEvents(hoursAhead);

    // Weighted combination
    const baseLoad = this.getAverageLoad();
    const predictedLoad = baseLoad * 
      (historicalPattern * 0.4 + timeOfDay * 0.3 + dayOfWeek * 0.2 + (events.length > 0 ? 1.3 : 1) * 0.1);

    // Calculate confidence based on data quality
    const confidence = Math.min(0.3 + (this.history.length / 168) * 0.7, 0.95);

    // Determine scaling recommendation
    const currentAgents = this.getCurrentAgents();
    const targetLoad = this.getCurrentLoad();
    const capacityPerAgent = 10; // Assumed
    const requiredAgents = Math.ceil(predictedLoad / capacityPerAgent);

    let scalingAction: 'scale_up' | 'scale_down' | 'maintain';
    let reason: string;

    if (requiredAgents > currentAgents * 1.5) {
      scalingAction = 'scale_up';
      reason = `Predicted load ${predictedLoad.toFixed(1)} requires ${requiredAgents} agents (current: ${currentAgents})`;
    } else if (requiredAgents < currentAgents * 0.7) {
      scalingAction = 'scale_down';
      reason = `Predicted load ${predictedLoad.toFixed(1)} can be handled by ${requiredAgents} agents (current: ${currentAgents})`;
    } else {
      scalingAction = 'maintain';
      reason = 'Current capacity sufficient for predicted load';
    }

    const forecast: LoadForecast = {
      timestamp: Date.now() + (hoursAhead * 60 * 60 * 1000),
      predictedLoad,
      confidence,
      factors: {
        historicalPattern,
        timeOfDay,
        dayOfWeek,
        specialEvents: events
      },
      recommendedScaling: {
        action: scalingAction,
        targetAgents: Math.max(requiredAgents, 5),
        reason
      }
    };

    this.currentForecast = forecast;
    return forecast;
  }

  /**
   * Get current forecast
   */
  getCurrentForecast(): LoadForecast | null {
    return this.currentForecast;
  }

  /**
   * Subscribe to forecast updates
   */
  subscribe(callback: (forecast: LoadForecast) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get forecast accuracy metrics
   */
  getAccuracyMetrics(): {
    totalPredictions: number;
    meanAbsoluteError: number;
    within10Percent: number;
    within25Percent: number;
  } {
    // Compare predictions vs actuals
    const comparisons = this.findComparisons();
    
    if (comparisons.length === 0) {
      return {
        totalPredictions: 0,
        meanAbsoluteError: 0,
        within10Percent: 0,
        within25Percent: 0
      };
    }

    const errors = comparisons.map(c => Math.abs(c.predicted - c.actual) / c.actual);
    const mae = errors.reduce((a, b) => a + b, 0) / errors.length;

    return {
      totalPredictions: comparisons.length,
      meanAbsoluteError: mae,
      within10Percent: errors.filter(e => e < 0.1).length / errors.length,
      within25Percent: errors.filter(e => e < 0.25).length / errors.length
    };
  }

  /**
   * Get forecaster statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      historyDataPoints: this.history.length,
      historyHours: this.config.historyWindowHours,
      forecastHorizon: this.config.forecastHorizonHours,
      lastUpdate: this.currentForecast?.timestamp || 0,
      subscribers: this.subscribers.size,
      averageLoad: this.getAverageLoad(),
      peakLoad: Math.max(...this.history.map(h => h.load), 0)
    };
  }

  // Private methods
  private updateForecast(): void {
    this.predictNetworkLoad(this.config.forecastHorizonHours)
      .then(forecast => {
        for (const subscriber of this.subscribers) {
          try {
            subscriber(forecast);
          } catch (error) {
            logger.error('LoadForecaster', {
              message: 'Subscriber callback failed',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      })
      .catch(error => {
        logger.error('LoadForecaster', {
          message: 'Forecast update failed',
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }

  private getCurrentLoad(): number {
    const latest = this.history[this.history.length - 1];
    return latest?.load || 0;
  }

  private getCurrentAgents(): number {
    const latest = this.history[this.history.length - 1];
    return latest?.agents || 10;
  }

  private getAverageLoad(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((acc, h) => acc + h.load, 0);
    return sum / this.history.length;
  }

  private getTimeOfDayFactor(hoursAhead: number): number {
    const futureTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    const hour = futureTime.getHours();
    
    // Business hours (9-17) typically higher load
    if (hour >= 9 && hour <= 17) return 1.3;
    // Evening (18-22) moderate
    if (hour >= 18 && hour <= 22) return 1.1;
    // Night (23-5) low
    if (hour >= 23 || hour <= 5) return 0.7;
    // Morning (6-8) ramping up
    return 0.9;
  }

  private getDayOfWeekFactor(hoursAhead: number): number {
    const futureTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    const day = futureTime.getDay();
    
    // Weekdays higher than weekends
    if (day >= 1 && day <= 5) return 1.2;
    return 0.85;
  }

  private calculateHistoricalPattern(hoursAhead: number): number {
    // Look at same time in previous days
    const targetTime = Date.now() + hoursAhead * 60 * 60 * 1000;
    const hour = new Date(targetTime).getHours();
    
    const sameHourData = this.history.filter(h => {
      const hDate = new Date(h.timestamp);
      return hDate.getHours() === hour;
    });
    
    if (sameHourData.length === 0) return 1;
    
    const avg = sameHourData.reduce((sum, h) => sum + h.load, 0) / sameHourData.length;
    const currentAvg = this.getAverageLoad();
    
    return currentAvg > 0 ? avg / currentAvg : 1;
  }

  private detectSpecialEvents(hoursAhead: number): string[] {
    const events: string[] = [];
    const futureTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    
    // Check for known high-load events (these would come from a calendar in production)
    const month = futureTime.getMonth();
    const date = futureTime.getDate();
    
    // Black Friday / Cyber Monday
    if (month === 10 && date >= 23 && date <= 30) {
      events.push('black_friday_cyber_monday');
    }
    
    // End of month
    if (date >= 28) {
      events.push('month_end_settlement');
    }
    
    return events;
  }

  private findComparisons(): Array<{ predicted: number; actual: number }> {
    // Find predictions that have actual results
    // This is simplified - real implementation would track prediction history
    return [];
  }
}

// Singleton
let forecasterInstance: LoadForecaster | null = null;

export function getLoadForecaster(config?: Partial<ForecasterConfig>): LoadForecaster {
  if (!forecasterInstance) {
    forecasterInstance = new LoadForecaster(config);
  }
  return forecasterInstance;
}
