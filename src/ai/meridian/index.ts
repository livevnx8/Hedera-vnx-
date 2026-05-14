/**
 * Meridian Model System - TypeScript Exports
 *
 * Multi-tier model routing and validation infrastructure.
 */

export {
  modelTierRouter,
  ModelTierRouter,
  type ModelTier,
  type TierConfig,
  type TaskComplexity,
  type RoutingDecision,
} from './modelRouter.js';

export {
  validationHarness,
  ValidationHarness,
  type TestCase,
  type TestResult,
  type ValidationReport,
} from './testing/validationHarness.js';

export {
  checkpointMonitor,
  CheckpointMonitor,
  type CheckpointEvent,
  type MonitorConfig,
} from './testing/checkpointMonitor.js';
