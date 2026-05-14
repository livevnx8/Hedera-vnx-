/**
 * Carbon & Energy Tracking Module
 * 
 * Real-world carbon footprint validation with:
 * - Hedera Guardian policy integration
 * - Real-time energy data from smart meters
 * - Multi-party validation workflows
 * - GHG Protocol compliant calculations
 * - Carbon offset tokenization
 */

export {
  CarbonDataSources,
  getCarbonDataSources
} from './dataSources.js';

export {
  CarbonValidationWorkflow,
  getCarbonValidationWorkflow
} from './validationWorkflow.js';

export {
  CarbonCalculator,
  getCarbonCalculator
} from './calculator.js';

export {
  CarbonDataConnectors,
  getCarbonConnectors
} from './connectors.js';

export type {
  CarbonSource,
  EnergyReading,
  CarbonEmission,
  CarbonOffset,
  CarbonReport,
  EnergyForecast,
  ValidationWorkflow,
  GuardianPolicy
} from './types.js';
