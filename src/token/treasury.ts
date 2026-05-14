/**
 * Vera Treasury
 * Self-funding economic engine for sovereign operation
 * 
 * Responsibilities:
 * - Accumulate task fees (HBAR)
 * - Auto-convert to VERA (buyback)
 * - Pay Akash compute costs
 * - Maintain reserves and emit warnings
 * - Economic self-preservation logic
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import { akashClient } from '../hosting/akashClient.js';
import { veraToken } from './veraToken.js';
import { flowerOfLifeOS } from '../vera/orchestrator/flowerOfLifeOS.js';

export interface TreasuryState {
  hbarBalance: number;
  veraBalance: number;
  totalRevenue: number;
  totalSpent: number;
  akashCosts: number;
  agentRewards: number;
  reserveRatio: number;         // (balance / monthly_cost)
  lastUpdated: number;
}

export interface TreasuryAlert {
  level: 'info' | 'warning' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export interface SpendingProposal {
  id: string;
  description: string;
  amount: number;               // VERA amount
  recipient: string;
  category: 'compute' | 'development' | 'marketing' | 'emergency';
  votesFor: number;
  votesAgainst: number;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: number;
}

export class Treasury extends EventEmitter {
  private state: TreasuryState = {
    hbarBalance: 0,
    veraBalance: 0,
    totalRevenue: 0,
    totalSpent: 0,
    akashCosts: 0,
    agentRewards: 0,
    reserveRatio: 0,
    lastUpdated: Date.now(),
  };
  
  private proposals = new Map<string, SpendingProposal>();
  private alerts: TreasuryAlert[] = [];
  private hbarToVeraRate = 0.001;  // Approximate: 1 HBAR = 0.001 VERA (will use oracle in prod)
  private monthlyCostEstimate = 0;
  private checkInterval: NodeJS.Timeout | null = null;

  // Thresholds for alerts
  private thresholds = {
    reserveWarning: 1.0,    // < 1 month runway
    reserveCritical: 0.25,  // < 1 week runway
    buybackThreshold: 100, // HBAR before auto-conversion
  };

  constructor() {
    super();
  }

  /**
   * Start treasury monitoring
   */
  start(): void {
    logger.info('Treasury', { message: 'Treasury monitoring started' });

    // Periodic economic health check
    this.checkInterval = setInterval(() => {
      void this.performEconomicCheck();
    }, 60000); // Every minute

    // Listen for task revenue
    this.setupRevenueListener();

    // Listen for compute costs
    this.setupCostListener();
  }

  /**
   * Stop treasury monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Record HBAR revenue from task fees
   */
  recordRevenue(hbarAmount: number, source: string): void {
    this.state.hbarBalance += hbarAmount;
    this.state.totalRevenue += hbarAmount;
    this.state.lastUpdated = Date.now();

    this.emit('revenue', { hbarAmount, source, totalRevenue: this.state.totalRevenue });

    logger.info('Treasury', {
      message: 'Revenue recorded',
      hbarAmount: hbarAmount.toFixed(2),
      source,
      totalRevenue: this.state.totalRevenue.toFixed(2),
    });

    // Trigger buyback if above threshold
    if (this.state.hbarBalance >= this.thresholds.buybackThreshold) {
      void this.autoBuyback();
    }
  }

  /**
   * Record compute costs (Akash)
   */
  recordComputeCost(aktAmount: number): void {
    // Convert AKT to HBAR equivalent (simplified)
    const hbarEquivalent = aktAmount * 100; // Rough conversion
    
    this.state.akashCosts += hbarEquivalent;
    this.state.totalSpent += hbarEquivalent;
    this.state.lastUpdated = Date.now();

    this.emit('compute_cost', { aktAmount, hbarEquivalent });

    logger.info('Treasury', {
      message: 'Compute cost recorded',
      aktAmount: aktAmount.toFixed(4),
      hbarEquivalent: hbarEquivalent.toFixed(2),
    });
  }

  /**
   * Record agent reward payment
   */
  recordAgentReward(veraAmount: number): void {
    this.state.agentRewards += veraAmount;
    this.state.veraBalance -= veraAmount;
    this.state.lastUpdated = Date.now();

    this.emit('agent_reward', { veraAmount });

    logger.info('Treasury', {
      message: 'Agent reward recorded',
      veraAmount: veraAmount.toFixed(2),
      remainingBalance: this.state.veraBalance.toFixed(2),
    });
  }

  /**
   * Auto-buyback: Convert HBAR to VERA
   */
  private async autoBuyback(): Promise<void> {
    if (this.state.hbarBalance < this.thresholds.buybackThreshold) return;

    const hbarToConvert = this.state.hbarBalance * 0.8; // Keep 20% as HBAR reserve
    const veraToBuy = hbarToConvert * this.hbarToVeraRate;

    logger.info('Treasury', {
      message: 'Executing auto-buyback',
      hbarAmount: hbarToConvert.toFixed(2),
      veraAmount: veraToBuy.toFixed(2),
    });

    // In production:
    // 1. Swap HBAR → VERA on SaucerSwap DEX
    // 2. Update balances
    // For now, simulate:
    
    this.state.hbarBalance -= hbarToConvert;
    this.state.veraBalance += veraToBuy;

    this.emit('buyback', { hbarSpent: hbarToConvert, veraAcquired: veraToBuy });

    // Log to HCS
    await this.logToHcs({
      type: 'AUTO_BUYBACK',
      hbarSpent: hbarToConvert,
      veraAcquired: veraToBuy,
      remainingHbar: this.state.hbarBalance,
      remainingVera: this.state.veraBalance,
    });
  }

  /**
   * Perform economic health check
   */
  private async performEconomicCheck(): Promise<void> {
    // Update monthly cost estimate from Akash
    this.monthlyCostEstimate = akashClient.getTotalMonthlyCost();

    // Calculate reserve ratio (months of runway)
    const totalHbarValue = this.state.hbarBalance + (this.state.veraBalance / this.hbarToVeraRate);
    this.state.reserveRatio = this.monthlyCostEstimate > 0 
      ? totalHbarValue / this.monthlyCostEstimate 
      : 999;

    // Check thresholds and emit alerts
    if (this.state.reserveRatio < this.thresholds.reserveCritical) {
      this.emitAlert('critical', 'Reserve depleted', 'reserveRatio', this.state.reserveRatio, this.thresholds.reserveCritical);
      
      // Emergency measures
      await this.emergencyMeasures();
    } else if (this.state.reserveRatio < this.thresholds.reserveWarning) {
      this.emitAlert('warning', 'Low reserves', 'reserveRatio', this.state.reserveRatio, this.thresholds.reserveWarning);
    }

    // Auto-adjust pricing if needed
    await this.adjustPricing();

    this.emit('check_complete', { reserveRatio: this.state.reserveRatio });
  }

  /**
   * Emergency measures when reserves critical
   */
  private async emergencyMeasures(): Promise<void> {
    logger.error('Treasury', {
      message: 'EMERGENCY: Reserve ratio critical',
      reserveRatio: this.state.reserveRatio.toFixed(2),
    });

    // 1. Reduce Akash instances
    this.emit('emergency_scale_down', {});

    // 2. Increase task prices
    this.emit('emergency_price_increase', { multiplier: 2.0 });

    // 3. Route through center for visibility
    flowerOfLifeOS.centerRoute({
      type: 'general',
      data: {
        emergency: 'treasury_critical',
        reserveRatio: this.state.reserveRatio,
        action: 'scale_down_and_price_increase',
      },
    });

    // Log to HCS
    await this.logToHcs({
      type: 'EMERGENCY_MEASURES',
      reserveRatio: this.state.reserveRatio,
      hbarBalance: this.state.hbarBalance,
      veraBalance: this.state.veraBalance,
      monthlyCost: this.monthlyCostEstimate,
    });
  }

  /**
   * Auto-adjust pricing based on treasury health
   */
  private async adjustPricing(): Promise<void> {
    // If reserves healthy (>3 months), can lower prices to attract more tasks
    // If reserves stressed (<1 month), raise prices
    
    if (this.state.reserveRatio > 3.0) {
      this.emit('pricing_adjustment', { direction: 'decrease', factor: 0.9 });
    } else if (this.state.reserveRatio < 0.5) {
      this.emit('pricing_adjustment', { direction: 'increase', factor: 1.5 });
    }
  }

  /**
   * Create spending proposal (governance)
   */
  createProposal(
    description: string,
    amount: number,
    recipient: string,
    category: SpendingProposal['category']
  ): string {
    const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const proposal: SpendingProposal = {
      id,
      description,
      amount,
      recipient,
      category,
      votesFor: 0,
      votesAgainst: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.proposals.set(id, proposal);

    this.emit('proposal_created', proposal);

    logger.info('Treasury', {
      message: 'Spending proposal created',
      id,
      amount: amount.toFixed(2),
      category,
    });

    return id;
  }

  /**
   * Vote on a proposal
   */
  vote(proposalId: string, support: boolean, votingPower: number): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (support) {
      proposal.votesFor += votingPower;
    } else {
      proposal.votesAgainst += votingPower;
    }

    // Auto-execute if threshold reached (simplified)
    if (proposal.votesFor > 1000 && proposal.status === 'pending') {
      proposal.status = 'approved';
      this.emit('proposal_approved', proposal);
    }

    this.proposals.set(proposalId, proposal);
  }

  /**
   * Execute approved proposal
   */
  async executeProposal(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'approved') {
      throw new Error('Proposal not found or not approved');
    }

    if (proposal.amount > this.state.veraBalance) {
      throw new Error('Insufficient treasury balance');
    }

    // Execute transfer
    this.state.veraBalance -= proposal.amount;
    proposal.status = 'executed';
    this.proposals.set(proposalId, proposal);

    this.emit('proposal_executed', proposal);

    logger.info('Treasury', {
      message: 'Proposal executed',
      id: proposalId,
      amount: proposal.amount.toFixed(2),
      recipient: proposal.recipient,
    });
  }

  /**
   * Get treasury state
   */
  getState(): TreasuryState {
    return { ...this.state };
  }

  /**
   * Get all proposals
   */
  getProposals(): SpendingProposal[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Get alerts history
   */
  getAlerts(): TreasuryAlert[] {
    return [...this.alerts];
  }

  /**
   * Get treasury statistics
   */
  getStats(): {
    monthlyRunway: number;
    monthlyCost: number;
    totalRevenue: number;
    totalSpent: number;
    profitMargin: number;
    proposalCount: number;
    pendingProposals: number;
  } {
    const profit = this.state.totalRevenue - this.state.totalSpent;
    return {
      monthlyRunway: this.state.reserveRatio,
      monthlyCost: this.monthlyCostEstimate,
      totalRevenue: this.state.totalRevenue,
      totalSpent: this.state.totalSpent,
      profitMargin: this.state.totalRevenue > 0 ? profit / this.state.totalRevenue : 0,
      proposalCount: this.proposals.size,
      pendingProposals: Array.from(this.proposals.values()).filter(p => p.status === 'pending').length,
    };
  }

  /**
   * Emit alert
   */
  private emitAlert(
    level: TreasuryAlert['level'],
    message: string,
    metric: string,
    value: number,
    threshold: number
  ): void {
    const alert: TreasuryAlert = {
      level,
      message,
      metric,
      value,
      threshold,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    this.emit('alert', alert);

    logger[level]('Treasury', {
      message,
      metric,
      value: value.toFixed(2),
      threshold: threshold.toFixed(2),
    });
  }

  /**
   * Setup revenue listener
   */
  private setupRevenueListener(): void {
    // Listen to task completion events for revenue
    // This would be wired into the orchestrator's settlement flow
  }

  /**
   * Setup cost listener
   */
  private setupCostListener(): void {
    // Listen to Akash client for compute costs
    akashClient.on('deployed', () => {
      this.monthlyCostEstimate = akashClient.getTotalMonthlyCost();
    });
  }

  /**
   * Log to HCS audit
   */
  private async logToHcs(data: Record<string, unknown>): Promise<void> {
    // In production: submit to HCS audit topic
    logger.debug('Treasury', { message: 'HCS log', data });
  }
}

// Singleton
export const treasury = new Treasury();
export default treasury;
