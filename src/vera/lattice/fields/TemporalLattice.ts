/**
 * Temporal Lattice Field
 * 3D: historical, seasonal, predictive
 * For forecasting and time-series reasoning
 */

import { ReasoningFieldImpl } from '../core/LatticeField.js';

export interface TemporalData {
  historical: number;   // 0-1: Historical pattern strength
  seasonal: number;     // 0-1: Seasonal factor
  predictive: number;     // 0-1: Prediction confidence
}

export interface ForecastResult {
  timestamp: number;
  value: number;
  confidence: number;
  factors: string[];
}

export class TemporalLattice extends ReasoningFieldImpl {
  private forecastHistory: Map<string, ForecastResult[]> = new Map();

  constructor() {
    super(
      'temporal',
      'Temporal Forecasting & Prediction',
      ['historical', 'seasonal', 'predictive']
    );
  }

  /**
   * Create forecast hypothesis
   */
  createForecast(forecastId: string, targetTime: number, data: Partial<TemporalData>): void {
    const hypothesis = `Forecast for ${forecastId} at ${new Date(targetTime).toISOString()}`;
    
    const metadata = {
      forecastId,
      targetTime,
      type: 'FORECAST',
      temporalScores: {
        historical: data.historical ?? 0.5,
        seasonal: data.seasonal ?? 0.5,
        predictive: data.predictive ?? 0.5,
      }
    };

    const node = this.superpose(hypothesis, metadata);
    
    // Add temporal evidence
    if (data.historical !== undefined) {
      this.addEvidenceToNode(node.id, `Historical pattern strength: ${(data.historical * 100).toFixed(0)}%`, data.historical);
    }
    if (data.seasonal !== undefined) {
      this.addEvidenceToNode(node.id, `Seasonal factor: ${(data.seasonal * 100).toFixed(0)}%`, data.seasonal);
    }
    if (data.predictive !== undefined) {
      this.addEvidenceToNode(node.id, `Model confidence: ${(data.predictive * 100).toFixed(0)}%`, data.predictive);
    }
  }

  /**
   * Calculate forecast confidence
   */
  calculateForecastConfidence(nodeId: string): number | null {
    const node = this.nodes.get(nodeId) as any;
    if (!node) return null;

    const scores = node.metadata?.temporalScores as TemporalData;
    if (!scores) return node.confidence;

    // Weight historical and predictive higher than seasonal
    const weights = {
      historical: 0.4,
      seasonal: 0.2,
      predictive: 0.4,
    };

    let weightedSum = 0;

    for (const [dimension, score] of Object.entries(scores)) {
      const weight = weights[dimension as keyof typeof weights] || 0.3;
      weightedSum += score * weight;
    }

    return weightedSum;
  }

  /**
   * Get forecast result
   */
  getForecast(forecastId: string): {
    value: number;
    confidence: number;
    targetTime: number;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
  } {
    for (const node of this.nodes.values()) {
      if (node.metadata?.forecastId === forecastId) {
        const confidence = this.calculateForecastConfidence(node.id) || node.confidence;
        const scores = node.metadata?.temporalScores as TemporalData;
        
        return {
          value: this.calculateForecastValue(scores, node.metadata?.targetTime as number),
          confidence,
          targetTime: node.metadata?.targetTime as number,
          reliability: confidence > 0.8 ? 'HIGH' : confidence > 0.5 ? 'MEDIUM' : 'LOW',
        };
      }
    }

    return { value: 0, confidence: 0, targetTime: 0, reliability: 'LOW' };
  }

  /**
   * Compare forecast to actual outcome
   */
  validateForecast(forecastId: string, actualValue: number): {
    accuracy: number;
    error: number;
    calibrated: boolean;
  } {
    const forecast = this.getForecast(forecastId);
    if (forecast.confidence === 0) {
      return { accuracy: 0, error: 1, calibrated: false };
    }

    const error = Math.abs(forecast.value - actualValue) / actualValue;
    const accuracy = 1 - error;
    
    // Store for calibration
    const history = this.forecastHistory.get(forecastId) || [];
    history.push({
      timestamp: Date.now(),
      value: actualValue,
      confidence: forecast.confidence,
      factors: ['validation'],
    });
    this.forecastHistory.set(forecastId, history);

    // Calibrated if confidence roughly matches accuracy
    const calibrated = Math.abs(forecast.confidence - accuracy) < 0.2;

    return { accuracy, error, calibrated };
  }

  /**
   * Find similar historical patterns
   */
  findSimilarPatterns(queryId: string): string[] {
    const target = Array.from(this.nodes.values())
      .find(n => n.metadata?.forecastId === queryId);
    
    if (!target) return [];

    const similar: string[] = [];
    
    for (const node of this.nodes.values()) {
      if (node.id !== target.id) {
        const distance = (target as any).distanceTo?.(node) || 1.0;
        if (distance < 0.5) { // Close in temporal space
          similar.push(node.metadata?.forecastId as string);
        }
      }
    }

    return similar;
  }

  private calculateForecastValue(scores: TemporalData | undefined, targetTime: number): number {
    if (!scores) return 0;
    
    // Simulate forecast calculation based on temporal factors
    const baseValue = 100;
    const historicalFactor = scores.historical * 0.3;
    const seasonalFactor = scores.seasonal * 0.2;
    const predictiveFactor = scores.predictive * 0.5;
    
    // Add some time-based variation
    const timeFactor = Math.sin(targetTime / (24 * 60 * 60 * 1000)) * 0.1;
    
    return baseValue * (1 + historicalFactor + seasonalFactor + predictiveFactor + timeFactor);
  }

  private addEvidenceToNode(nodeId: string, evidence: string, weight: number): void {
    const node = this.nodes.get(nodeId) as any;
    if (node && node.addEvidence) {
      node.addEvidence(evidence, weight);
    }
  }
}

export default TemporalLattice;
