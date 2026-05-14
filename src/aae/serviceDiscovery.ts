/**
 * Service Discovery
 * 
 * Enables agents to discover and connect with other agents
 * based on capabilities, reputation, and service requirements.
 */

import { logger } from '../monitoring/logger.js';
import type { ServiceQuery, AgentListing, ServiceOffer } from './types.js';

interface DiscoveryConfig {
  maxResults: number;
  minReputation: number;
  cacheDurationMs: number;
  enableAutoMatch: boolean;
}

interface CapabilityIndex {
  capability: string;
  agents: Set<string>;
}

interface DiscoveryResult {
  agent: AgentListing;
  service: ServiceOffer;
  matchScore: number;
  matchReasons: string[];
}

export class ServiceDiscovery {
  private config: DiscoveryConfig;
  private capabilityIndex: Map<string, CapabilityIndex> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();
  private searchCache: Map<string, { results: DiscoveryResult[]; timestamp: number }> = new Map();
  private agentCallbacks: Map<string, (query: ServiceQuery) => Promise<boolean>> = new Map();

  constructor(config: Partial<DiscoveryConfig> = {}) {
    this.config = {
      maxResults: 10,
      minReputation: 50,
      cacheDurationMs: 5 * 60 * 1000, // 5 minutes
      enableAutoMatch: true,
      ...config
    };
  }

  /**
   * Index agent capabilities for discovery
   */
  async indexAgent(agent: AgentListing): Promise<void> {
    // Index capabilities
    for (const capability of agent.capabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, { capability, agents: new Set() });
      }
      this.capabilityIndex.get(capability)!.agents.add(agent.agentId);
    }

    // Index services by category
    for (const service of agent.services) {
      if (!this.categoryIndex.has(service.category)) {
        this.categoryIndex.set(service.category, new Set());
      }
      this.categoryIndex.get(service.category)!.add(agent.agentId);
    }

    logger.debug('ServiceDiscovery', {
      message: 'Agent indexed',
      agentId: agent.agentId,
      capabilities: agent.capabilities.length,
      services: agent.services.length
    });
  }

  /**
   * Search for agents matching query
   */
  async discover(query: ServiceQuery, requesterId?: string): Promise<DiscoveryResult[]> {
    const cacheKey = JSON.stringify(query);
    
    // Check cache
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheDurationMs) {
      return this.filterByRequester(cached.results, requesterId);
    }

    const results: DiscoveryResult[] = [];
    const matchedAgents = new Set<string>();

    // Search by capabilities
    if (query.requiredCapabilities && query.requiredCapabilities.length > 0) {
      for (const capability of query.requiredCapabilities) {
        const index = this.capabilityIndex.get(capability);
        if (index) {
          for (const agentId of index.agents) {
            matchedAgents.add(agentId);
          }
        }
      }
    }

    // Search by category
    if (query.category) {
      const categoryAgents = this.categoryIndex.get(query.category);
      if (categoryAgents) {
        for (const agentId of categoryAgents) {
          matchedAgents.add(agentId);
        }
      }
    }

    // Score and rank results
    for (const agentId of matchedAgents) {
      const result = await this.calculateMatchScore(agentId, query);
      if (result) {
        results.push(result);
      }
    }

    // Sort by match score
    results.sort((a, b) => b.matchScore - a.matchScore);

    // Limit results
    const limited = results.slice(0, this.config.maxResults);

    // Cache results
    this.searchCache.set(cacheKey, { results: limited, timestamp: Date.now() });

    return this.filterByRequester(limited, requesterId);
  }

  /**
   * Find best match for a specific service need
   */
  async findBestMatch(
    requirements: {
      category?: string;
      capabilities: string[];
      maxPrice?: number;
      minReputation?: number;
    },
    requesterId?: string
  ): Promise<DiscoveryResult | null> {
    const query: ServiceQuery = {
      category: requirements.category,
      requiredCapabilities: requirements.capabilities,
      maxPrice: requirements.maxPrice,
      minReputation: requirements.minReputation || this.config.minReputation,
      availableOnly: true
    };

    const results = await this.discover(query, requesterId);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Register agent for auto-matching
   */
  async registerForAutoMatch(
    agentId: string,
    callback: (query: ServiceQuery) => Promise<boolean>
  ): Promise<void> {
    this.agentCallbacks.set(agentId, callback);

    logger.info('ServiceDiscovery', {
      message: 'Agent registered for auto-match',
      agentId
    });
  }

  /**
   * Auto-match request to available agents
   */
  async autoMatch(query: ServiceQuery, requesterId: string): Promise<DiscoveryResult | null> {
    if (!this.config.enableAutoMatch) {
      return null;
    }

    // Get potential matches
    const matches = await this.discover(query, requesterId);

    // Try each agent in order until one accepts
    for (const match of matches) {
      const callback = this.agentCallbacks.get(match.agent.agentId);
      if (callback) {
        try {
          const accepted = await callback(query);
          if (accepted) {
            logger.info('ServiceDiscovery', {
              message: 'Auto-match successful',
              requester: requesterId,
              provider: match.agent.agentId
            });
            return match;
          }
        } catch (error) {
          logger.error('ServiceDiscovery', {
            message: 'Auto-match callback failed',
            agentId: match.agent.agentId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    return null;
  }

  /**
   * Get agents by capability
   */
  async getAgentsByCapability(capability: string): Promise<string[]> {
    const index = this.capabilityIndex.get(capability);
    return index ? Array.from(index.agents) : [];
  }

  /**
   * Get all indexed capabilities
   */
  getAllCapabilities(): string[] {
    return Array.from(this.capabilityIndex.keys());
  }

  /**
   * Get all indexed categories
   */
  getAllCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }

  /**
   * Remove agent from discovery
   */
  async removeAgent(agentId: string): Promise<void> {
    // Remove from capability index
    for (const [_, index] of this.capabilityIndex) {
      index.agents.delete(agentId);
    }

    // Remove from category index
    for (const [_, agents] of this.categoryIndex) {
      agents.delete(agentId);
    }

    // Remove callback
    this.agentCallbacks.delete(agentId);

    // Clear cache
    this.searchCache.clear();

    logger.info('ServiceDiscovery', {
      message: 'Agent removed from discovery',
      agentId
    });
  }

  /**
   * Clear discovery cache
   */
  clearCache(): void {
    this.searchCache.clear();
    logger.debug('ServiceDiscovery', { message: 'Cache cleared' });
  }

  /**
   * Get discovery statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      indexedCapabilities: this.capabilityIndex.size,
      indexedCategories: this.categoryIndex.size,
      registeredForAutoMatch: this.agentCallbacks.size,
      cacheSize: this.searchCache.size,
      config: this.config
    };
  }

  // Private methods
  private async calculateMatchScore(
    agentId: string,
    query: ServiceQuery
  ): Promise<DiscoveryResult | null> {
    // This would fetch agent data from marketplace in production
    // For now, return mock result structure
    
    const score = Math.random() * 100; // Mock scoring
    
    if (query.minReputation && score < query.minReputation) {
      return null;
    }

    return {
      agent: null as any, // Would be fetched from marketplace
      service: null as any, // Would be fetched from marketplace
      matchScore: score,
      matchReasons: ['capability_match', 'reputation_score', 'availability']
    };
  }

  private filterByRequester(results: DiscoveryResult[], requesterId?: string): DiscoveryResult[] {
    if (!requesterId) return results;
    
    // Filter out requester's own listings
    return results.filter(r => r.agent.agentId !== requesterId);
  }
}

// Singleton
let discoveryInstance: ServiceDiscovery | null = null;

export function getServiceDiscovery(config?: Partial<DiscoveryConfig>): ServiceDiscovery {
  if (!discoveryInstance) {
    discoveryInstance = new ServiceDiscovery(config);
  }
  return discoveryInstance;
}
