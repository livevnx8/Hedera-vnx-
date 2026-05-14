/**
 * Vera Blueprint Library Index
 * Central exports for all reusable components
 */

export { VeraAgent } from './agent-base.mjs';
export { HCSLogger, createHCSLogger } from './hcs-logger.mjs';
export { calculateQuality, CommonChecks, DomainQuality, TIERS } from './data-quality.mjs';
export { CrossAgentMessenger } from './cross-agent.mjs';

// Phase 3: Sub-agents & Adaptive Scheduling
export { SubAgent, LoadPredictionSubAgent, AnomalyDetectionSubAgent, WhaleTrackingSubAgent, ThreatAnalysisSubAgent } from './sub-agent.mjs';
export { AdaptiveScheduler, PriorityQueue, CircuitBreaker, DomainSchedulers } from './adaptive-scheduler.mjs';
export { AgentCoordinator, coordinator } from './coordinator.mjs';

// Phase 4: Predictive Analytics
export { PredictiveAnalytics, DomainAnalytics } from './predictive-analytics.mjs';
export { TimeSeriesForecast, Forecasters } from './time-series-forecast.mjs';
export { TrendCorrelation, CorrelationMatrix } from './trend-correlation.mjs';

// Version info
export const VERSION = '3.0.0';
export const BLUEPRINT_DATE = '2026-03-29';
export const PHASE = '4';
