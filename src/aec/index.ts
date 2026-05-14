/**
 * Autonomous Economic Zone (Phase 18)
 * 
 * Self-running AI economy with autonomous treasury, pricing,
 * investment, marketplace, and monetary policy.
 */

export {
  AutonomousTreasury,
  getAutonomousTreasury
} from './treasuryManager.js';

export {
  DynamicPricingEngine,
  getDynamicPricingEngine
} from './pricingEngine.js';

export {
  AIVentureCapitalist,
  getAIVentureCapitalist
} from './ventureCapitalist.js';

export {
  AutonomousMarketplace,
  getAutonomousMarketplace
} from './serviceMarketplace.js';

export {
  MonetaryPolicyController,
  getMonetaryPolicyController
} from './monetaryPolicy.js';

export type {
  TreasuryAsset,
  RebalancePlan,
  YieldReport,
  RunwayProjection,
  HedgePosition,
  TreasuryReport,
  PricePoint,
  DemandForecast,
  MarketPosition,
  Project,
  DealFlow,
  DDReport,
  TermSheet,
  InvestmentReceipt,
  PortfolioReport,
  ServiceOffer,
  MarketClearing,
  ReputationUpdate,
  EconomicIndicators,
  InflationTarget,
  BuybackExecution
} from './types.js';
