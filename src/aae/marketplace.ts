/**
 * Agent Marketplace
 * 
 * Self-sustaining marketplace for AI agents to list services,
 * discover opportunities, and negotiate terms autonomously.
 */

import { logger } from '../monitoring/logger.js';
import type { AgentListing, ServiceOffer, ServiceQuery } from './types.js';

interface ListingConfig {
  minReputationToList: number;
  listingFeeHbar: number;
  platformFeePercent: number;
  escrowTimeoutHours: number;
}

export class AgentMarketplace {
  private listings: Map<string, AgentListing> = new Map();
  private services: Map<string, ServiceOffer> = new Map();
  private config: ListingConfig;
  private subscribers: Set<(event: MarketplaceEvent) => void> = new Set();

  constructor(config: Partial<ListingConfig> = {}) {
    this.config = {
      minReputationToList: 50,
      listingFeeHbar: 10,
      platformFeePercent: 2.5,
      escrowTimeoutHours: 24,
      ...config
    };
  }

  /**
   * Register a new agent listing
   */
  async registerAgent(listing: Omit<AgentListing, 'createdAt' | 'lastActive'>): Promise<AgentListing> {
    try {
      // Validate reputation requirement
      if (listing.reputation.overall < this.config.minReputationToList) {
        throw new Error(`Reputation ${listing.reputation.overall} below minimum ${this.config.minReputationToList}`);
      }

      const fullListing: AgentListing = {
        ...listing,
        createdAt: Date.now(),
        lastActive: Date.now()
      };

      this.listings.set(listing.agentId, fullListing);

      // Register all services
      for (const service of listing.services) {
        this.services.set(service.serviceId, service);
      }

      this.emitEvent({
        type: 'agent_registered',
        agentId: listing.agentId,
        timestamp: Date.now()
      });

      logger.info('AgentMarketplace', {
        message: 'Agent registered',
        agentId: listing.agentId,
        services: listing.services.length
      });

      return fullListing;

    } catch (error) {
      logger.error('AgentMarketplace', {
        message: 'Agent registration failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update agent availability status
   */
  async updateAvailability(agentId: string, status: AgentListing['availability']): Promise<void> {
    const listing = this.listings.get(agentId);
    if (!listing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    listing.availability = status;
    listing.lastActive = Date.now();

    this.emitEvent({
      type: 'availability_changed',
      agentId,
      status,
      timestamp: Date.now()
    });
  }

  /**
   * Add new service to agent listing
   */
  async addService(agentId: string, service: ServiceOffer): Promise<void> {
    const listing = this.listings.get(agentId);
    if (!listing) {
      throw new Error(`Agent ${agentId} not found`);
    }

    listing.services.push(service);
    this.services.set(service.serviceId, service);
    listing.lastActive = Date.now();

    logger.info('AgentMarketplace', {
      message: 'Service added',
      agentId,
      serviceId: service.serviceId
    });
  }

  /**
   * Search for services matching query
   */
  async searchServices(query: ServiceQuery): Promise<Array<{ agent: AgentListing; service: ServiceOffer }>> {
    const results: Array<{ agent: AgentListing; service: ServiceOffer }> = [];

    for (const [agentId, agent] of this.listings) {
      // Filter by availability
      if (query.availableOnly && agent.availability !== 'available') {
        continue;
      }

      // Filter by reputation
      if (query.minReputation && agent.reputation.overall < query.minReputation) {
        continue;
      }

      for (const service of agent.services) {
        // Filter by category
        if (query.category && service.category !== query.category) {
          continue;
        }

        // Filter by price
        if (query.maxPrice && service.price > query.maxPrice) {
          continue;
        }

        // Filter by capabilities
        if (query.requiredCapabilities) {
          const hasAllCapabilities = query.requiredCapabilities.every(
            cap => agent.capabilities.includes(cap)
          );
          if (!hasAllCapabilities) continue;
        }

        results.push({ agent, service });
      }
    }

    // Sort by reputation score (highest first)
    results.sort((a, b) => b.agent.reputation.overall - a.agent.reputation.overall);

    return results;
  }

  /**
   * Get agent listing by ID
   */
  getAgent(agentId: string): AgentListing | undefined {
    return this.listings.get(agentId);
  }

  /**
   * Get service by ID
   */
  getService(serviceId: string): ServiceOffer | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Subscribe to marketplace events
   */
  subscribe(callback: (event: MarketplaceEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get marketplace statistics
   */
  getStats() {
    const timestamp = Date.now();
    const categories = new Map<string, number>();
    for (const service of this.services.values()) {
      categories.set(service.category, (categories.get(service.category) || 0) + 1);
    }

    return {
      timestamp,
      totalAgents: this.listings.size,
      totalServices: this.services.size,
      availableAgents: Array.from(this.listings.values()).filter(a => a.availability === 'available').length,
      busyAgents: Array.from(this.listings.values()).filter(a => a.availability === 'busy').length,
      categories: Object.fromEntries(categories),
      averageReputation: Array.from(this.listings.values())
        .reduce((sum, a) => sum + a.reputation.overall, 0) / this.listings.size || 0,
      config: this.config
    };
  }

  /**
   * Get top agents by reputation
   */
  getTopAgents(limit: number = 10): AgentListing[] {
    return Array.from(this.listings.values())
      .sort((a, b) => b.reputation.overall - a.reputation.overall)
      .slice(0, limit);
  }

  /**
   * Calculate platform fee for a transaction
   */
  calculatePlatformFee(amount: number): number {
    return Math.ceil(amount * (this.config.platformFeePercent / 100));
  }

  // Private methods
  private emitEvent(event: MarketplaceEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        logger.error('AgentMarketplace', {
          message: 'Event subscriber failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}

interface MarketplaceEvent {
  type: 'agent_registered' | 'availability_changed' | 'service_added' | 'transaction_completed';
  agentId?: string;
  status?: string;
  timestamp: number;
}

// Singleton
let marketplaceInstance: AgentMarketplace | null = null;

export function getAgentMarketplace(config?: Partial<ListingConfig>): AgentMarketplace {
  if (!marketplaceInstance) {
    marketplaceInstance = new AgentMarketplace(config);
  }
  return marketplaceInstance;
}
