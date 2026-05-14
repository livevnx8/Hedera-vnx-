/**
 * Predictive Oracle Network
 * 
 * AI-powered oracles for predictive capabilities including
 * price feeds, gas predictions, network load forecasting,
 * and market intelligence.
 */

import { logger } from '../monitoring/logger.js';
import type { Prediction, ConsensusPrediction } from './types.js';

interface OracleConfig {
  minConfidence: number;
  aggregationMethod: 'mean' | 'median' | 'weighted';
  maxPredictors: number;
  stalePredictionMs: number;
}

export class PredictiveOracle {
  private predictions: Map<string, Prediction[]> = new Map();
  private config: OracleConfig;
  private subscribers: Map<string, Set<(prediction: ConsensusPrediction) => void>> = new Map();

  constructor(config: Partial<OracleConfig> = {}) {
    this.config = {
      minConfidence: 0.7,
      aggregationMethod: 'weighted',
      maxPredictors: 10,
      stalePredictionMs: 5 * 60 * 1000, // 5 minutes
      ...config
    };
  }

  /**
   * Submit a prediction to the oracle network
   */
  async submitPrediction(
    topic: string,
    value: number,
    confidence: number,
    predictor: string,
    features: Record<string, number> = {}
  ): Promise<void> {
    try {
      if (confidence < this.config.minConfidence) {
        logger.warn('PredictiveOracle', {
          message: 'Prediction rejected - confidence too low',
          topic,
          predictor,
          confidence
        });
        return;
      }

      const prediction: Prediction = {
        id: `${topic}-${predictor}-${Date.now()}`,
        topic,
        value,
        confidence,
        timestamp: Date.now(),
        predictor,
        modelVersion: '1.0.0',
        features
      };

      // Store prediction
      if (!this.predictions.has(topic)) {
        this.predictions.set(topic, []);
      }
      const topicPredictions = this.predictions.get(topic)!;
      topicPredictions.push(prediction);

      // Keep only recent predictions
      const cutoff = Date.now() - this.config.stalePredictionMs;
      const filtered = topicPredictions.filter(p => p.timestamp > cutoff);
      
      // Limit predictors
      if (filtered.length > this.config.maxPredictors) {
        filtered.sort((a, b) => b.confidence - a.confidence);
        filtered.length = this.config.maxPredictors;
      }

      this.predictions.set(topic, filtered);

      // Trigger aggregation and notify subscribers
      const consensus = await this.aggregatePredictions(topic);
      this.notifySubscribers(topic, consensus);

      logger.debug('PredictiveOracle', {
        message: 'Prediction submitted',
        topic,
        predictor,
        value,
        confidence
      });

    } catch (error) {
      logger.error('PredictiveOracle', {
        message: 'Failed to submit prediction',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Aggregate predictions for a topic into consensus
   */
  async aggregatePredictions(topic: string): Promise<ConsensusPrediction> {
    const predictions = this.predictions.get(topic) || [];
    
    if (predictions.length === 0) {
      return {
        topic,
        aggregatedValue: 0,
        confidence: 0,
        individualPredictions: [],
        variance: 0,
        timestamp: Date.now(),
        method: this.config.aggregationMethod
      };
    }

    // Calculate aggregated value based on method
    let aggregatedValue: number;
    
    switch (this.config.aggregationMethod) {
      case 'median':
        const sorted = [...predictions].sort((a, b) => a.value - b.value);
        const mid = Math.floor(sorted.length / 2);
        aggregatedValue = sorted.length % 2 === 0
          ? (sorted[mid - 1].value + sorted[mid].value) / 2
          : sorted[mid].value;
        break;
        
      case 'weighted':
        const totalWeight = predictions.reduce((sum, p) => sum + p.confidence, 0);
        aggregatedValue = predictions.reduce((sum, p) => 
          sum + (p.value * p.confidence / totalWeight), 0);
        break;
        
      case 'mean':
      default:
        aggregatedValue = predictions.reduce((sum, p) => sum + p.value, 0) / predictions.length;
    }

    // Calculate variance
    const mean = predictions.reduce((sum, p) => sum + p.value, 0) / predictions.length;
    const variance = predictions.reduce((sum, p) => sum + Math.pow(p.value - mean, 2), 0) / predictions.length;

    // Overall confidence
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;

    return {
      topic,
      aggregatedValue,
      confidence: avgConfidence,
      individualPredictions: predictions,
      variance,
      timestamp: Date.now(),
      method: this.config.aggregationMethod
    };
  }

  /**
   * Get prediction history for a topic
   */
  async getPredictionHistory(topic: string, hours: number = 24): Promise<Prediction[]> {
    const predictions = this.predictions.get(topic) || [];
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    
    return predictions.filter(p => p.timestamp > cutoff);
  }

  /**
   * Subscribe to predictions for a topic
   */
  subscribe(topic: string, callback: (prediction: ConsensusPrediction) => void): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    
    this.subscribers.get(topic)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.get(topic)?.delete(callback);
    };
  }

  /**
   * Notify subscribers of new consensus
   */
  private notifySubscribers(topic: string, consensus: ConsensusPrediction): void {
    const callbacks = this.subscribers.get(topic);
    if (!callbacks) return;
    
    for (const callback of callbacks) {
      try {
        callback(consensus);
      } catch (error) {
        logger.error('PredictiveOracle', {
          message: 'Subscriber callback failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Get available topics
   */
  getTopics(): string[] {
    return Array.from(this.predictions.keys());
  }

  /**
   * Get oracle statistics
   */
  getStats() {
    const totalPredictions = Array.from(this.predictions.values())
      .reduce((sum, preds) => sum + preds.length, 0);
    return {
      timestamp: Date.now(),
      topics: this.predictions.size,
      totalPredictions,
      subscribers: Array.from(this.subscribers.values())
        .reduce((sum, set) => sum + set.size, 0),
      config: this.config
    };
  }
}

// Singleton
let oracleInstance: PredictiveOracle | null = null;

export function getPredictiveOracle(config?: Partial<OracleConfig>): PredictiveOracle {
  if (!oracleInstance) {
    oracleInstance = new PredictiveOracle(config);
  }
  return oracleInstance;
}
