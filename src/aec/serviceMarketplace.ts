/**
 * Autonomous Service Marketplace (Phase 18)
 * 
 * Self-organizing marketplace where agents offer and consume services
 * with automated reputation tracking and market clearing.
 */

import { logger } from '../monitoring/logger.js';
import type {
  ServiceType,
  ServiceOffer,
  MarketClearing,
  ReputationUpdate
} from './types.js';

interface MarketplaceConfig {
  commissionRate: number; // 0.01-0.10
  minCommission: bigint;
  escrowTimeoutMs: number;
  autoMatchIntervalMs: number;
}

interface ServiceRequest {
  requestId: string;
  buyer: string;
  serviceType: ServiceType;
  quantity: bigint;
  maxPrice: number;
  deadline: number;
  status: 'open' | 'matched' | 'fulfilled' | 'expired';
}

interface ServiceTransaction {
  txId: string;
  buyer: string;
  seller: string;
  serviceType: ServiceType;
  quantity: bigint;
  price: number;
  commission: bigint;
  status: 'pending' | 'completed' | 'disputed';
  createdAt: number;
  completedAt?: number;
}

export class AutonomousMarketplace {
  private config: MarketplaceConfig;
  private offers: Map<string, ServiceOffer> = new Map();
  private requests: Map<string, ServiceRequest> = new Map();
  private transactions: Map<string, ServiceTransaction> = new Map();
  private reputations: Map<string, Map<ServiceType, ReputationUpdate>> = new Map();
  private commissionPool: bigint = BigInt(0);

  constructor(config: Partial<MarketplaceConfig> = {}) {
    this.config = {
      commissionRate: 0.05, // 5%
      minCommission: BigInt(1000000), // $0.01
      escrowTimeoutMs: 86400000, // 24 hours
      autoMatchIntervalMs: 300000, // 5 minutes
      ...config
    };

    // Start auto-matching loop
    this.startAutoMatching();
  }

  /**
   * Register a service offer
   */
  async registerOffer(offer: Omit<ServiceOffer, 'offerId'>): Promise<ServiceOffer> {
    const offerId = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const fullOffer: ServiceOffer = {
      ...offer,
      offerId
    };

    this.offers.set(offerId, fullOffer);

    logger.info('AutonomousMarketplace', {
      message: 'Service offer registered',
      offerId,
      provider: offer.provider,
      serviceType: offer.serviceType,
      price: offer.pricePerUnit
    });

    // Try immediate matching
    await this.attemptMatch(fullOffer);

    return fullOffer;
  }

  /**
   * Submit a service request
   */
  async submitRequest(
    buyer: string,
    serviceType: ServiceType,
    quantity: bigint,
    maxPrice: number,
    deadline: number
  ): Promise<ServiceRequest> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const request: ServiceRequest = {
      requestId,
      buyer,
      serviceType,
      quantity,
      maxPrice,
      deadline,
      status: 'open'
    };

    this.requests.set(requestId, request);

    logger.info('AutonomousMarketplace', {
      message: 'Service request submitted',
      requestId,
      buyer,
      serviceType,
      quantity: quantity.toString()
    });

    // Try immediate matching
    await this.matchRequest(request);

    return request;
  }

  /**
   * Match supply with demand (market clearing)
   */
  async matchSupplyDemand(): Promise<MarketClearing> {
    const matches: MarketClearing['matches'] = [];
    const openRequests = Array.from(this.requests.values())
      .filter(r => r.status === 'open' && r.deadline > Date.now());

    for (const request of openRequests) {
      // Find best matching offer
      const matchingOffers = Array.from(this.offers.values())
        .filter(o => 
          o.serviceType === request.serviceType &&
          o.pricePerUnit <= request.maxPrice &&
          o.availability > 0.8
        )
        .sort((a, b) => b.reputation - a.reputation || a.pricePerUnit - b.pricePerUnit);

      if (matchingOffers.length > 0) {
        const bestOffer = matchingOffers[0];
        const matchQuantity = request.quantity < bestOffer.maxOrder 
          ? request.quantity 
          : bestOffer.maxOrder;

        matches.push({
          buyer: request.buyer,
          seller: bestOffer.provider,
          service: request.serviceType,
          quantity: matchQuantity,
          price: bestOffer.pricePerUnit
        });

        // Create transaction
        await this.createTransaction(request, bestOffer, matchQuantity);

        // Update request status
        request.status = 'matched';
        this.requests.set(request.requestId, request);
      }
    }

    const totalVolume = matches.reduce((sum, m) => sum + m.quantity, BigInt(0));
    const avgPrice = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.price, 0) / matches.length
      : 0;

    const clearing: MarketClearing = {
      matches,
      totalVolume,
      averagePrice: avgPrice,
      clearedAt: Date.now()
    };

    logger.info('AutonomousMarketplace', {
      message: 'Market clearing complete',
      matches: matches.length,
      totalVolume: totalVolume.toString(),
      avgPrice: avgPrice.toFixed(4)
    });

    return clearing;
  }

  /**
   * Settle transactions and distribute payments
   */
  async settleTransactions(): Promise<{
    settled: number;
    totalValue: bigint;
    commission: bigint;
  }> {
    const pending = Array.from(this.transactions.values())
      .filter(t => t.status === 'pending' && 
        Date.now() > t.createdAt + this.config.escrowTimeoutMs);

    let settledCount = 0;
    let totalValue = BigInt(0);

    for (const tx of pending) {
      // Mock settlement - in production would execute on-chain
      tx.status = 'completed';
      tx.completedAt = Date.now();
      this.transactions.set(tx.txId, tx);

      totalValue += tx.quantity * BigInt(Math.floor(tx.price * 100_000_000));
      this.commissionPool += tx.commission;
      settledCount++;

      // Update reputation
      await this.updateReputation(tx.seller, tx.serviceType, 1.0, 100);
    }

    logger.info('AutonomousMarketplace', {
      message: 'Transactions settled',
      settled: settledCount,
      totalValue: totalValue.toString(),
      commission: this.commissionPool.toString()
    });

    return {
      settled: settledCount,
      totalValue,
      commission: this.commissionPool
    };
  }

  /**
   * Update agent reputation based on service quality
   */
  async updateReputation(
    agentId: string,
    serviceType: ServiceType,
    rating: number,
    responseTime: number
  ): Promise<ReputationUpdate> {
    const currentRep = this.getReputation(agentId, serviceType);

    const update: ReputationUpdate = {
      agentId,
      serviceType,
      rating: (currentRep?.rating || 5) * 0.8 + rating * 0.2, // EMA
      reviews: (currentRep?.reviews || 0) + 1,
      avgResponseTime: currentRep 
        ? (currentRep.avgResponseTime * 0.9 + responseTime * 0.1)
        : responseTime,
      successRate: currentRep 
        ? currentRep.successRate * 0.95 + 0.05 // Assume success
        : 1.0
    };

    let agentReps = this.reputations.get(agentId);
    if (!agentReps) {
      agentReps = new Map();
      this.reputations.set(agentId, agentReps);
    }
    agentReps.set(serviceType, update);

    // Update offer reputation if exists
    for (const offer of this.offers.values()) {
      if (offer.provider === agentId && offer.serviceType === serviceType) {
        offer.reputation = update.rating;
      }
    }

    logger.debug('AutonomousMarketplace', {
      message: 'Reputation updated',
      agentId,
      serviceType,
      newRating: update.rating.toFixed(2)
    });

    return update;
  }

  /**
   * Discover available services
   */
  async discoverServices(serviceType?: ServiceType): Promise<ServiceOffer[]> {
    let offers = Array.from(this.offers.values())
      .filter(o => o.availability > 0.5);

    if (serviceType) {
      offers = offers.filter(o => o.serviceType === serviceType);
    }

    // Sort by reputation, then price
    return offers.sort((a, b) => 
      b.reputation - a.reputation || a.pricePerUnit - b.pricePerUnit
    );
  }

  /**
   * Get reputation for an agent
   */
  getReputation(agentId: string, serviceType: ServiceType): ReputationUpdate | undefined {
    return this.reputations.get(agentId)?.get(serviceType);
  }

  /**
   * Get transaction by ID
   */
  getTransaction(txId: string): ServiceTransaction | undefined {
    return this.transactions.get(txId);
  }

  /**
   * Get marketplace statistics
   */
  getStats() {
    const transactions = Array.from(this.transactions.values());
    const completed = transactions.filter(t => t.status === 'completed');
    const totalVolume = completed.reduce((s, t) => s + t.quantity, BigInt(0));

    return {
      timestamp: Date.now(),
      activeOffers: this.offers.size,
      openRequests: Array.from(this.requests.values()).filter(r => r.status === 'open').length,
      totalTransactions: transactions.length,
      completedTransactions: completed.length,
      totalVolume: totalVolume.toString(),
      commissionPool: this.commissionPool.toString(),
      avgCommissionRate: this.config.commissionRate,
      topProviders: this.getTopProviders()
    };
  }

  // Private methods
  private async attemptMatch(offer: ServiceOffer): Promise<void> {
    const openRequests = Array.from(this.requests.values())
      .filter(r => 
        r.status === 'open' &&
        r.serviceType === offer.serviceType &&
        r.maxPrice >= offer.pricePerUnit &&
        r.deadline > Date.now()
      );

    if (openRequests.length > 0) {
      // Match with highest value request
      const bestRequest = openRequests
        .sort((a, b) => Number(b.quantity - a.quantity))[0];
      
      await this.matchRequest(bestRequest, offer);
    }
  }

  private async matchRequest(
    request: ServiceRequest,
    specificOffer?: ServiceOffer
  ): Promise<void> {
    const offer = specificOffer || Array.from(this.offers.values())
      .filter(o => 
        o.serviceType === request.serviceType &&
        o.pricePerUnit <= request.maxPrice
      )
      .sort((a, b) => b.reputation - a.reputation)[0];

    if (offer) {
      const quantity = request.quantity < offer.maxOrder 
        ? request.quantity 
        : offer.maxOrder;

      await this.createTransaction(request, offer, quantity);
      request.status = 'matched';
      this.requests.set(request.requestId, request);
    }
  }

  private async createTransaction(
    request: ServiceRequest,
    offer: ServiceOffer,
    quantity: bigint
  ): Promise<ServiceTransaction> {
    const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const totalValue = Number(quantity) * offer.pricePerUnit;
    const commission = BigInt(Math.max(
      Number(this.config.minCommission),
      totalValue * this.config.commissionRate
    ));

    const tx: ServiceTransaction = {
      txId,
      buyer: request.buyer,
      seller: offer.provider,
      serviceType: request.serviceType,
      quantity,
      price: offer.pricePerUnit,
      commission,
      status: 'pending',
      createdAt: Date.now()
    };

    this.transactions.set(txId, tx);

    logger.info('AutonomousMarketplace', {
      message: 'Transaction created',
      txId,
      buyer: request.buyer,
      seller: offer.provider,
      quantity: quantity.toString(),
      commission: commission.toString()
    });

    return tx;
  }

  private startAutoMatching(): void {
    // Auto-match every 5 minutes
    setInterval(async () => {
      try {
        await this.matchSupplyDemand();
        await this.settleTransactions();
      } catch (error) {
        logger.error('AutonomousMarketplace', {
          message: 'Auto-matching error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.autoMatchIntervalMs);
  }

  private getTopProviders(): Array<{ agentId: string; reputation: number; volume: bigint }> {
    const providerStats = new Map<string, { reputation: number; volume: bigint }>();

    for (const tx of this.transactions.values()) {
      if (tx.status === 'completed') {
        const stats = providerStats.get(tx.seller) || { reputation: 0, volume: BigInt(0) };
        stats.volume += tx.quantity;
        providerStats.set(tx.seller, stats);
      }
    }

    for (const [agentId, reps] of this.reputations) {
      const avgRep = Array.from(reps.values()).reduce((s, r) => s + r.rating, 0) / reps.size;
      const stats = providerStats.get(agentId) || { reputation: 0, volume: BigInt(0) };
      stats.reputation = avgRep;
      providerStats.set(agentId, stats);
    }

    return Array.from(providerStats.entries())
      .map(([agentId, stats]) => ({ agentId, ...stats }))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 10);
  }
}

// Singleton
let marketplaceInstance: AutonomousMarketplace | null = null;

export function getAutonomousMarketplace(config?: Partial<MarketplaceConfig>): AutonomousMarketplace {
  if (!marketplaceInstance) {
    marketplaceInstance = new AutonomousMarketplace(config);
  }
  return marketplaceInstance;
}
