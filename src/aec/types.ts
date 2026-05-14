/**
 * Autonomous Economic Zone Types (Phase 18)
 * 
 * Type definitions for self-running AI economy components.
 */

// Treasury Manager Types
export type AssetClass = 'stable' | 'growth' | 'liquid' | 'hedge';
export type YieldStrategy = 'lending' | 'staking' | 'liquidity' | 'arbitrage' | 'hold';

export interface TreasuryAsset {
  assetId: string;
  symbol: string;
  balance: bigint;
  valueUsd: number;
  assetClass: AssetClass;
  yieldStrategy: YieldStrategy;
  apy: number;
  riskScore: number; // 0-100
}

export interface RebalancePlan {
  planId: string;
  currentAllocation: Record<AssetClass, number>;
  targetAllocation: Record<AssetClass, number>;
  trades: TradeInstruction[];
  expectedYield: number;
  riskDelta: number;
  executedAt?: number;
}

export interface TradeInstruction {
  fromAsset: string;
  toAsset: string;
  amount: bigint;
  expectedRate: number;
  slippage: number;
  protocol: string;
}

export interface YieldReport {
  period: { start: number; end: number };
  totalYieldUsd: number;
  yieldByAsset: Record<string, number>;
  apr: number;
  benchmark: number;
  alpha: number;
}

export interface RunwayProjection {
  currentRunwayMonths: number;
  targetRunwayMonths: number;
  monthlyBurn: number;
  monthlyYield: number;
  netRunway: number;
  projection: Array<{ month: number; balance: number }>;
}

export interface RiskExposure {
  assetId: string;
  exposureUsd: number;
  volatility: number;
  correlationToMarket: number;
  maxDrawdown: number;
}

export interface HedgePosition {
  hedgeId: string;
  underlying: string;
  hedgeAsset: string;
  positionSize: bigint;
  cost: number;
  protectionLevel: number; // % of exposure hedged
}

export interface TreasuryReport {
  timestamp: number;
  totalAum: number;
  assetBreakdown: TreasuryAsset[];
  performance: YieldReport;
  runway: RunwayProjection;
  activeHedges: HedgePosition[];
  recommendations: string[];
}

// Pricing Engine Types
export type ServiceType = 'inference' | 'bridge' | 'governance' | 'storage' | 'compute' | 'multimodal';

export interface PricePoint {
  service: ServiceType;
  basePrice: number;
  congestionMultiplier: number;
  demandMultiplier: number;
  finalPrice: number;
  currency: string;
  validUntil: number;
}

export interface DemandForecast {
  service: ServiceType;
  horizon: number;
  predictedDemand: number;
  confidence: number;
  seasonality: number;
  trend: 'up' | 'down' | 'stable';
}

export interface MarketPosition {
  service: ServiceType;
  ourPrice: number;
  marketAvg: number;
  percentile: number;
  competitiveness: 'premium' | 'competitive' | 'discount';
}

// AI Venture Capitalist Types
export type DealStage = 'screening' | 'dd' | 'negotiation' | 'term_sheet' | 'invested' | 'exited';
export type InvestmentThesis = 'infrastructure' | 'application' | 'research' | 'ecosystem';

export interface Project {
  projectId: string;
  name: string;
  description: string;
  team: string[];
  stage: 'idea' | 'mvp' | 'product' | 'scale';
  chain: string;
  raiseAmount: bigint;
  valuation: bigint;
  thesis: InvestmentThesis;
  traction: {
    users: number;
    revenue: number;
    growth: number;
  };
}

export interface DealFlow {
  projects: Project[];
  screenedAt: number;
  matchScore: number;
  passedScreening: boolean;
}

export interface DDReport {
  projectId: string;
  technicalScore: number;
  teamScore: number;
  marketScore: number;
  tokenomicsScore: number;
  riskFactors: string[];
  redFlags: string[];
  recommendation: 'pass' | 'weak_pass' | 'weak_no' | 'strong_no' | 'invest';
  confidence: number;
}

export interface TermSheet {
  projectId: string;
  investmentAmount: bigint;
  valuation: bigint;
  ownership: number;
  tokenAllocation: number;
  vesting: string;
  rights: string[];
  conditions: string[];
}

export interface InvestmentReceipt {
  dealId: string;
  projectId: string;
  amount: bigint;
  txHash: string;
  timestamp: number;
  termSheet: TermSheet;
}

export interface PortfolioReport {
  totalInvested: bigint;
  totalValue: bigint;
  unrealizedReturn: number;
      realizedReturn: number;
      investments: InvestmentReceipt[];
      byThesis: Record<InvestmentThesis, { count: number; value: bigint }>;
}

// Service Marketplace Types
export interface ServiceOffer {
  offerId: string;
  provider: string;
  serviceType: ServiceType;
  capabilities: string[];
  pricePerUnit: number;
  unit: string;
  reputation: number;
  availability: number; // % uptime
  minOrder: bigint;
  maxOrder: bigint;
}

export interface MarketClearing {
  matches: Array<{
    buyer: string;
    seller: string;
    service: ServiceType;
    quantity: bigint;
    price: number;
  }>;
  totalVolume: bigint;
  averagePrice: number;
  clearedAt: number;
}

export interface ReputationUpdate {
  agentId: string;
  serviceType: ServiceType;
  rating: number;
  reviews: number;
  avgResponseTime: number;
  successRate: number;
}

// Monetary Policy Types
export interface EconomicIndicators {
  timestamp: number;
  tokenPrice: number;
  marketCap: bigint;
  stakingRatio: number;
  velocity: number;
  inflationRate: number;
  treasurySurplus: number;
  runwayMonths: number;
}

export interface InflationTarget {
  target: number;
  current: number;
  adjustment: number;
  mechanism: 'rewards' | 'burn' | 'buyback';
  rationale: string;
}

export interface RewardAdjustment {
  oldRate: number;
    newRate: number;
    effectiveAt: number;
    estimatedImpact: string;
}

export interface BuybackExecution {
  amount: bigint;
  price: number;
    tokensBurned: bigint;
    txHash: string;
    executedAt: number;
}

export interface StressReport {
  scenario: string;
    probability: number;
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigations: string[];
    survivalLikelihood: number;
}
