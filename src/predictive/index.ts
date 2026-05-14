/**
 * Predictive Intelligence Layer (PIL) - Phase 10
 * 
 * AI-powered predictive capabilities for proactive system optimization.
 * Includes predictive oracles, anomaly detection, load forecasting, and
 * fraud prevention using ML models.
 */

export { 
  PredictiveOracle,
  getPredictiveOracle 
} from './oracleNetwork.js';

export { 
  AnomalyDetector,
  getAnomalyDetector 
} from './anomalyDetector.js';

export { 
  LoadForecaster,
  getLoadForecaster 
} from './loadForecaster.js';

export { 
  FraudPrevention,
  getFraudPrevention 
} from './fraudPrevention.js';

export type {
  Prediction,
  ConsensusPrediction,
  RiskScore,
  LoadForecast,
  AnomalyAlert,
  FraudPattern
} from './types.js';
