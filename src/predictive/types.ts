/**
 * Predictive Intelligence Layer - Type Definitions
 */

export interface Prediction {
  id: string;
  topic: string;
  value: number;
  confidence: number;
  timestamp: number;
  predictor: string;
  modelVersion: string;
  features: Record<string, number>;
}

export interface ConsensusPrediction {
  topic: string;
  aggregatedValue: number;
  confidence: number;
  individualPredictions: Prediction[];
  variance: number;
  timestamp: number;
  method: 'mean' | 'median' | 'weighted';
}

export interface RiskScore {
  transactionId: string;
  score: number; // 0-100, higher = more risky
  factors: string[];
  recommendedAction: 'allow' | 'review' | 'block';
  confidence: number;
}

export interface LoadForecast {
  timestamp: number;
  predictedLoad: number;
  confidence: number;
  factors: {
    historicalPattern: number;
    timeOfDay: number;
    dayOfWeek: number;
    specialEvents: string[];
  };
  recommendedScaling: {
    action: 'scale_up' | 'scale_down' | 'maintain';
    targetAgents: number;
    reason: string;
  };
}

export interface AnomalyAlert {
  id: string;
  type: 'transaction' | 'agent' | 'network' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: number;
  relatedEntities: string[];
  confidence: number;
  recommendedAction: string;
}

export interface FraudPattern {
  patternId: string;
  type: 'sybil' | 'wash_trading' | 'front_running' | 'custom';
  indicators: string[];
  affectedAccounts: string[];
  confidence: number;
  firstDetected: number;
  status: 'active' | 'investigating' | 'resolved';
}
