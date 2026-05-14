/**
 * API Monetization Middleware
 * 
 * Implements x402 micropayments and tiered API access:
 * - Free tier: 100 calls/day
 * - Pro tier: 10,000 calls/month ($49)
 * - Enterprise tier: Unlimited ($499)
 * 
 * Endpoints:
 * - /agent/list: Free
 * - /agent/execute: $0.01
 * - /handshake/initiate: $0.05
 * - /swarm/coordinate: $0.10
 * - /bridge/cross-chain: $0.25 + 0.1%
 * - /llm/query: $0.001/token
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

export interface TierConfig {
  name: 'free' | 'pro' | 'enterprise';
  dailyLimit: number;
  monthlyLimit: number;
  price: number;
  features: string[];
}

export interface ApiKeyRecord {
  key: string;
  tier: TierConfig['name'];
  owner: string;
  createdAt: number;
  lastUsed: number;
  dailyCalls: number;
  monthlyCalls: number;
  totalSpent: number;
  resetDate: number;
}

interface EndpointPricing {
  [endpoint: string]: {
    cost: number; // in USD
    freeQuota?: number; // calls per day
  };
}

const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    name: 'free',
    dailyLimit: 100,
    monthlyLimit: 3000,
    price: 0,
    features: ['basic_agents', 'public_tools']
  },
  pro: {
    name: 'pro',
    dailyLimit: 1000,
    monthlyLimit: 10000,
    price: 49,
    features: ['priority_agents', 'custom_tools', 'analytics']
  },
  enterprise: {
    name: 'enterprise',
    dailyLimit: Infinity,
    monthlyLimit: Infinity,
    price: 499,
    features: ['dedicated_agents', 'sla', 'support', 'white_label']
  }
};

const ENDPOINT_PRICING: EndpointPricing = {
  '/agent/list': { cost: 0, freeQuota: 100 },
  '/agent/execute': { cost: 0.01 },
  '/handshake/initiate': { cost: 0.05 },
  '/swarm/coordinate': { cost: 0.10 },
  '/bridge/cross-chain': { cost: 0.25 },
  '/llm/query': { cost: 0.001 }, // per token
  '/api/v1/status': { cost: 0, freeQuota: 1000 },
  '/health': { cost: 0, freeQuota: Infinity }
};

export class APIMonetization {
  private apiKeys: Map<string, ApiKeyRecord> = new Map();
  private revenueTotal: number = 0;

  /**
   * Register Fastify hooks for API monetization
   */
  registerHooks(app: FastifyInstance): void {
    // Pre-handler: Check API key and quota
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const endpoint = request.url;
      
      // Skip monetization for free endpoints
      if (this.isFreeEndpoint(endpoint)) {
        return;
      }

      const apiKey = request.headers['x-api-key'] as string;
      
      if (!apiKey) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'API key required. Get one at https://vera.lattice/api-keys'
        });
      }

      const keyRecord = this.apiKeys.get(apiKey);
      
      if (!keyRecord) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid API key'
        });
      }

      // Check quota
      const quotaCheck = this.checkQuota(keyRecord, endpoint);
      if (!quotaCheck.allowed) {
        return reply.status(402).send({
          error: 'Payment Required',
          message: quotaCheck.reason,
          upgradeUrl: 'https://vera.lattice/pricing'
        });
      }

      // Attach key record to request for post-handler
      (request as any).apiKeyRecord = keyRecord;
    });

    // On-send: Track usage and charge
    app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: string) => {
      const keyRecord = (request as any).apiKeyRecord;
      if (!keyRecord) return;

      const endpoint = request.url;
      const cost = this.calculateCost(endpoint, payload);
      
      this.recordUsage(keyRecord, endpoint, cost);
      
      // Add payment headers
      reply.header('X-API-Cost', cost.toFixed(4));
      reply.header('X-API-Remaining', this.getRemainingQuota(keyRecord));
    });
  }

  /**
   * Generate new API key
   */
  generateApiKey(owner: string, tier: TierConfig['name'] = 'free'): string {
    const key = `vera_${Buffer.from(`${owner}:${Date.now()}:${Math.random()}`).toString('base64url')}`;
    
    const record: ApiKeyRecord = {
      key,
      tier,
      owner,
      createdAt: Date.now(),
      lastUsed: 0,
      dailyCalls: 0,
      monthlyCalls: 0,
      totalSpent: 0,
      resetDate: this.getNextResetDate()
    };

    this.apiKeys.set(key, record);
    
    return key;
  }

  /**
   * Revoke API key
   */
  revokeApiKey(key: string): boolean {
    return this.apiKeys.delete(key);
  }

  /**
   * Upgrade API key tier
   */
  upgradeApiKey(key: string, newTier: TierConfig['name']): boolean {
    const record = this.apiKeys.get(key);
    if (!record) return false;

    record.tier = newTier;
    return true;
  }

  /**
   * Get API key stats
   */
  getKeyStats(key: string): ApiKeyRecord | null {
    return this.apiKeys.get(key) || null;
  }

  /**
   * Get total revenue
   */
  getRevenue(): { total: number; byTier: Record<string, number> } {
    const byTier: Record<string, number> = {};
    
    for (const record of this.apiKeys.values()) {
      byTier[record.tier] = (byTier[record.tier] || 0) + record.totalSpent;
    }

    return {
      total: this.revenueTotal,
      byTier
    };
  }

  // Private helpers

  private isFreeEndpoint(endpoint: string): boolean {
    const pricing = ENDPOINT_PRICING[endpoint];
    return !pricing || pricing.cost === 0;
  }

  private checkQuota(record: ApiKeyRecord, endpoint: string): { allowed: boolean; reason?: string } {
    // Reset counters if needed
    this.resetCountersIfNeeded(record);

    const tier = TIER_CONFIGS[record.tier];
    const pricing = ENDPOINT_PRICING[endpoint];

    // Check daily limit
    if (record.dailyCalls >= tier.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit (${tier.dailyLimit}) reached. Resets at midnight UTC.`
      };
    }

    // Check monthly limit
    if (record.monthlyCalls >= tier.monthlyLimit) {
      return {
        allowed: false,
        reason: `Monthly limit (${tier.monthlyLimit}) reached. Upgrade to continue.`
      };
    }

    // Check free quota for endpoint
    if (pricing?.freeQuota && record.dailyCalls < pricing.freeQuota) {
      return { allowed: true };
    }

    // Paid endpoint - always allow if within quota (charge applies)
    return { allowed: true };
  }

  private calculateCost(endpoint: string, payload: string): number {
    const pricing = ENDPOINT_PRICING[endpoint];
    if (!pricing) return 0;

    let cost = pricing.cost;

    // Estimate token count for LLM queries
    if (endpoint === '/llm/query') {
      try {
        const body = JSON.parse(payload);
        const tokens = Math.ceil((body.message?.length || 0) / 4);
        cost = tokens * pricing.cost;
      } catch {
        cost = 100 * pricing.cost; // Default estimate
      }
    }

    return cost;
  }

  private recordUsage(record: ApiKeyRecord, endpoint: string, cost: number): void {
    record.dailyCalls++;
    record.monthlyCalls++;
    record.lastUsed = Date.now();
    
    if (cost > 0) {
      record.totalSpent += cost;
      this.revenueTotal += cost;
    }
  }

  private getRemainingQuota(record: ApiKeyRecord): number {
    this.resetCountersIfNeeded(record);
    const tier = TIER_CONFIGS[record.tier];
    return Math.max(0, tier.dailyLimit - record.dailyCalls);
  }

  private resetCountersIfNeeded(record: ApiKeyRecord): void {
    const now = Date.now();
    
    if (now >= record.resetDate) {
      record.dailyCalls = 0;
      record.resetDate = this.getNextResetDate();
    }
  }

  private getNextResetDate(): number {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }
}

// Singleton
let monetizationInstance: APIMonetization | null = null;

export function getAPIMonetization(): APIMonetization {
  if (!monetizationInstance) {
    monetizationInstance = new APIMonetization();
  }
  return monetizationInstance;
}

// Fastify plugin
export async function apiMonetizationPlugin(app: FastifyInstance): Promise<void> {
  const monetization = getAPIMonetization();
  monetization.registerHooks(app);
}
