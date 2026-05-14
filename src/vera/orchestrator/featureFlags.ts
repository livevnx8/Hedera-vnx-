/**
 * Feature Flags for Vera Orchestrator
 * 
 * Controls feature availability for safe testnet→mainnet migration
 * and gradual rollout of new capabilities.
 */

import { config } from '../../config.js';

export interface FeatureFlags {
  // Core orchestration features
  enableTaskOrchestrator: boolean;
  enableEscrow: boolean;
  enableX402Settlement: boolean;
  enableLatticeReasoning: boolean;

  // Marketplace features
  enableAgentSelfRegistration: boolean;
  enableReputationEngine: boolean;
  enableDynamicPricing: boolean;

  // Scaling features
  enableClientPool: boolean;
  enableRateLimiter: boolean;
  enableParallelPoller: boolean;
  enableAdaptiveScheduling: boolean;

  // Migration safety
  dryRunMode: boolean;          // Log but don't execute HCS writes
  shadowMode: boolean;          // Process but don't settle payments
  testnetOnly: boolean;         // Block mainnet operations

  // Production safety (new)
  enableMainnetOperations: boolean;
  maxHbarPerSettlement: number;
  maxSettlementsPerHour: number;
  requireMultiSigForLargePayments: boolean;
  enableAutomaticFailover: boolean;
  enableCircuitBreaker: boolean;

  // Gradual rollout
  latticeEnabledServices: string[];
  x402TrafficPercentage: number;
}

const DEFAULT_FLAGS: FeatureFlags = {
  enableTaskOrchestrator: true,
  enableEscrow: true,
  enableX402Settlement: true,
  enableLatticeReasoning: false, // Gradual rollout

  enableAgentSelfRegistration: true,
  enableReputationEngine: true,
  enableDynamicPricing: true,

  enableClientPool: true,
  enableRateLimiter: true,
  enableParallelPoller: true,
  enableAdaptiveScheduling: false, // Gradual rollout

  dryRunMode: false,
  shadowMode: false,
  testnetOnly: config.HEDERA_NETWORK === 'testnet',

  // Production safety defaults
  enableMainnetOperations: config.HEDERA_NETWORK !== 'mainnet', // Disabled by default on mainnet
  maxHbarPerSettlement: 1000, // 1000 HBAR max per settlement
  maxSettlementsPerHour: 100,
  requireMultiSigForLargePayments: true,
  enableAutomaticFailover: false,
  enableCircuitBreaker: true,

  // Gradual rollout
  latticeEnabledServices: [],
  x402TrafficPercentage: 100,
};

class FeatureFlagManager {
  private flags: FeatureFlags;

  constructor() {
    this.flags = { ...DEFAULT_FLAGS };
    this.loadFromEnvironment();
  }

  private loadFromEnvironment(): void {
    // Override from environment variables
    if (process.env.VERA_DRY_RUN === 'true') this.flags.dryRunMode = true;
    if (process.env.VERA_SHADOW_MODE === 'true') this.flags.shadowMode = true;
    if (process.env.VERA_DISABLE_ESCROW === 'true') this.flags.enableEscrow = false;
    if (process.env.VERA_DISABLE_X402 === 'true') this.flags.enableX402Settlement = false;
    if (process.env.VERA_DISABLE_REGISTRATION === 'true') this.flags.enableAgentSelfRegistration = false;
    if (process.env.VERA_TESTNET_ONLY === 'true') this.flags.testnetOnly = true;
    
    // Production safety flags
    if (process.env.VERA_ENABLE_MAINNET === 'true') this.flags.enableMainnetOperations = true;
    if (process.env.VERA_MAX_HBAR_SETTLEMENT) this.flags.maxHbarPerSettlement = parseInt(process.env.VERA_MAX_HBAR_SETTLEMENT, 10);
    if (process.env.VERA_ENABLE_LATTICE === 'true') this.flags.enableLatticeReasoning = true;
    if (process.env.VERA_LATTICE_SERVICES) this.flags.latticeEnabledServices = process.env.VERA_LATTICE_SERVICES.split(',');
    if (process.env.VERA_X402_PERCENTAGE) this.flags.x402TrafficPercentage = parseInt(process.env.VERA_X402_PERCENTAGE, 10);
    if (process.env.VERA_ENABLE_CIRCUIT_BREAKER === 'false') this.flags.enableCircuitBreaker = false;
    if (process.env.VERA_ENABLE_FAILOVER === 'true') this.flags.enableAutomaticFailover = true;
  }

  get<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
    return this.flags[key];
  }

  getAll(): FeatureFlags {
    return { ...this.flags };
  }

  set<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
    this.flags[key] = value;
  }

  /**
   * Check if an operation should be blocked due to testnet-only mode
   */
  isMainnetBlocked(): boolean {
    return this.flags.testnetOnly && config.HEDERA_NETWORK === 'mainnet';
  }

  /**
   * Check if payments should actually be executed (shadow mode off)
   */
  shouldExecutePayments(): boolean {
    return !this.flags.shadowMode && !this.flags.dryRunMode;
  }

  /**
   * Check if HCS writes should actually be sent (dry run off)
   */
  shouldWriteToHCS(): boolean {
    return !this.flags.dryRunMode;
  }

  /**
   * Check if lattice reasoning is enabled for a specific service
   */
  isLatticeEnabledForService(serviceType: string): boolean {
    if (!this.flags.enableLatticeReasoning) return false;
    if (this.flags.latticeEnabledServices.length === 0) return true; // All services if no whitelist
    return this.flags.latticeEnabledServices.includes(serviceType);
  }

  /**
   * Check if x402 should be used for this settlement (traffic percentage)
   */
  shouldUseX402(): boolean {
    if (!this.flags.enableX402Settlement) return false;
    const random = Math.random() * 100;
    return random < this.flags.x402TrafficPercentage;
  }

  /**
   * Check if a settlement amount is within limits
   */
  isSettlementAmountAllowed(amountHbar: number): boolean {
    return amountHbar <= this.flags.maxHbarPerSettlement;
  }

  /**
   * Check if mainnet operations are enabled
   */
  isMainnetEnabled(): boolean {
    return this.flags.enableMainnetOperations && !this.flags.testnetOnly;
  }

  /**
   * Validate all safety checks for an operation
   */
  validateOperation(operation: {
    type: 'settlement' | 'hcs_write' | 'task_submission';
    amountHbar?: number;
    serviceType?: string;
  }): { allowed: boolean; reason?: string } {
    // Mainnet check
    if (config.HEDERA_NETWORK === 'mainnet' && !this.isMainnetEnabled()) {
      return { allowed: false, reason: 'Mainnet operations disabled' };
    }

    // Settlement amount check
    if (operation.type === 'settlement' && operation.amountHbar !== undefined) {
      if (!this.isSettlementAmountAllowed(operation.amountHbar)) {
        return { 
          allowed: false, 
          reason: `Settlement amount ${operation.amountHbar} exceeds max ${this.flags.maxHbarPerSettlement}` 
        };
      }
    }

    // HCS write check
    if (operation.type === 'hcs_write' && this.flags.dryRunMode) {
      return { allowed: true, reason: 'Dry run mode - will log only' };
    }

    return { allowed: true };
  }
}

export const featureFlags = new FeatureFlagManager();
