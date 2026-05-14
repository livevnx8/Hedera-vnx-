/**
 * Partner Marketplace Manager
 * 
 * Manages partner ecosystem:
 * - Partner registration and onboarding
 * - Revenue share tracking (70/30 model)
 * - Integration health monitoring
 * - Partner analytics dashboard
 * 
 * @module revenue/marketplace/partnerManager
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  status: PartnerStatus;
  contact: {
    email: string;
    webhook?: string;
    apiKey: string;
  };
  integration: {
    type: string;
    endpoint?: string;
    capabilities: string[];
    health: IntegrationHealth;
  };
  revenue: {
    share: number; // 0-100, partner's share
    minPayout: number; // Minimum before payout
    payoutAddress?: string; // Hedera account
    totalEarned: number;
    pendingPayout: number;
    lastPayout: number;
  };
  metrics: {
    apiCalls: number;
    activeUsers: number;
    uptime: number; // Percentage
    latency: number; // ms p95
  };
  createdAt: number;
  updatedAt: number;
}

export type PartnerType = 
  | 'dex' 
  | 'wallet' 
  | 'bridge' 
  | 'oracle' 
  | 'payment' 
  | 'nft_marketplace' 
  | 'defi_protocol'
  | 'enterprise';

export type PartnerStatus = 'pending' | 'active' | 'suspended' | 'terminated';

export interface IntegrationHealth {
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: number;
  responseTime: number;
  errorRate: number;
  uptime24h: number;
}

export interface PayoutRecord {
  id: string;
  partnerId: string;
  amount: number;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string; // Hedera transaction
  notes?: string;
}

// ─── Partner Manager ───────────────────────────────────────────────────────

export class PartnerManager extends EventEmitter {
  private partners: Map<string, Partner> = new Map();
  private payouts: Map<string, PayoutRecord[]> = new Map();
  private readonly VERA_SHARE = 70; // Vera keeps 70%

  constructor() {
    super();
  }

  /**
   * Register a new partner
   */
  async registerPartner(
    name: string,
    type: PartnerType,
    contactEmail: string,
    integrationType: string,
    capabilities: string[],
    revenueShare: number = 30
  ): Promise<Partner> {
    // Validate revenue share
    if (revenueShare < 0 || revenueShare > 50) {
      throw new Error('Revenue share must be between 0-50%');
    }

    const partnerId = `partner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const apiKey = this.generateApiKey();

    const partner: Partner = {
      id: partnerId,
      name,
      type,
      status: 'pending',
      contact: {
        email: contactEmail,
        apiKey,
      },
      integration: {
        type: integrationType,
        capabilities,
        health: {
          status: 'healthy',
          lastCheck: Date.now(),
          responseTime: 0,
          errorRate: 0,
          uptime24h: 100,
        },
      },
      revenue: {
        share: revenueShare,
        minPayout: 100, // $100 minimum
        totalEarned: 0,
        pendingPayout: 0,
        lastPayout: 0,
      },
      metrics: {
        apiCalls: 0,
        activeUsers: 0,
        uptime: 100,
        latency: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.partners.set(partnerId, partner);
    this.payouts.set(partnerId, []);

    logger.info('PartnerManager', {
      message: 'New partner registered',
      partnerId,
      name,
      type,
      revenueShare,
    });

    this.emit('partner_registered', partner);
    return partner;
  }

  /**
   * Activate partner
   */
  async activatePartner(partnerId: string, payoutAddress: string): Promise<Partner> {
    const partner = this.partners.get(partnerId);
    if (!partner) {
      throw new Error(`Partner ${partnerId} not found`);
    }

    partner.status = 'active';
    partner.revenue.payoutAddress = payoutAddress;
    partner.updatedAt = Date.now();

    logger.info('PartnerManager', {
      message: 'Partner activated',
      partnerId,
      payoutAddress,
    });

    this.emit('partner_activated', partner);
    return partner;
  }

  /**
   * Record revenue for a partner
   */
  async recordRevenue(partnerId: string, amount: number): Promise<void> {
    const partner = this.partners.get(partnerId);
    if (!partner || partner.status !== 'active') {
      throw new Error(`Partner ${partnerId} not found or inactive`);
    }

    const partnerShare = amount * (partner.revenue.share / 100);
    const veraShare = amount * (this.VERA_SHARE / 100);

    partner.revenue.totalEarned += partnerShare;
    partner.revenue.pendingPayout += partnerShare;
    partner.updatedAt = Date.now();

    logger.debug('PartnerManager', {
      message: 'Revenue recorded',
      partnerId,
      amount,
      partnerShare,
      veraShare,
    });

    this.emit('revenue_recorded', {
      partnerId,
      total: amount,
      partnerShare,
      veraShare,
    });

    // Auto-trigger payout if threshold reached
    if (partner.revenue.pendingPayout >= partner.revenue.minPayout) {
      await this.processPayout(partnerId);
    }
  }

  /**
   * Process payout to partner
   */
  async processPayout(partnerId: string, force: boolean = false): Promise<PayoutRecord | null> {
    const partner = this.partners.get(partnerId);
    if (!partner) {
      throw new Error(`Partner ${partnerId} not found`);
    }

    if (!force && partner.revenue.pendingPayout < partner.revenue.minPayout) {
      logger.debug('PartnerManager', {
        message: 'Payout threshold not met',
        partnerId,
        pending: partner.revenue.pendingPayout,
        threshold: partner.revenue.minPayout,
      });
      return null;
    }

    if (!partner.revenue.payoutAddress) {
      throw new Error(`Partner ${partnerId} has no payout address`);
    }

    const payoutId = `payout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const amount = partner.revenue.pendingPayout;

    const record: PayoutRecord = {
      id: payoutId,
      partnerId,
      amount,
      timestamp: Date.now(),
      status: 'pending',
      notes: 'Automated payout',
    };

    // Add to payout history
    const history = this.payouts.get(partnerId) || [];
    history.push(record);
    this.payouts.set(partnerId, history);

    // Reset pending (in production, wait for confirmation)
    partner.revenue.pendingPayout = 0;
    partner.revenue.lastPayout = Date.now();
    partner.updatedAt = Date.now();

    logger.info('PartnerManager', {
      message: 'Payout processed',
      payoutId,
      partnerId,
      amount,
      address: partner.revenue.payoutAddress,
    });

    // Simulate Hedera transaction
    setTimeout(() => {
      record.status = 'completed';
      record.transactionId = `0.0.${Math.floor(Math.random() * 1000000)}@${Date.now()}`;
      
      logger.info('PartnerManager', {
        message: 'Payout confirmed',
        payoutId,
        transactionId: record.transactionId,
      });

      this.emit('payout_completed', record);
    }, 5000);

    this.emit('payout_initiated', record);
    return record;
  }

  /**
   * Get partner by ID
   */
  getPartner(partnerId: string): Partner | undefined {
    return this.partners.get(partnerId);
  }

  /**
   * Get partner by API key
   */
  getPartnerByApiKey(apiKey: string): Partner | undefined {
    return Array.from(this.partners.values()).find(p => p.contact.apiKey === apiKey);
  }

  /**
   * List all partners
   */
  listPartners(status?: PartnerStatus): Partner[] {
    const partners = Array.from(this.partners.values());
    if (status) {
      return partners.filter(p => p.status === status);
    }
    return partners;
  }

  /**
   * Update partner metrics
   */
  updateMetrics(partnerId: string, metrics: Partial<Partner['metrics']>): void {
    const partner = this.partners.get(partnerId);
    if (!partner) return;

    Object.assign(partner.metrics, metrics);
    partner.updatedAt = Date.now();
  }

  /**
   * Update integration health
   */
  updateHealth(partnerId: string, health: Partial<IntegrationHealth>): void {
    const partner = this.partners.get(partnerId);
    if (!partner) return;

    Object.assign(partner.integration.health, health);
    partner.integration.health.lastCheck = Date.now();
    partner.updatedAt = Date.now();

    // Emit if status changed
    if (health.status && health.status !== partner.integration.health.status) {
      this.emit('health_changed', {
        partnerId,
        status: health.status,
        previous: partner.integration.health.status,
      });
    }
  }

  /**
   * Get payout history
   */
  getPayoutHistory(partnerId: string): PayoutRecord[] {
    return this.payouts.get(partnerId) || [];
  }

  /**
   * Get marketplace analytics
   */
  getAnalytics(): {
    totalPartners: number;
    activePartners: number;
    pendingPartners: number;
    totalRevenueShared: number;
    pendingPayouts: number;
    byType: Record<PartnerType, number>;
    topPartners: Array<{ id: string; name: string; earned: number }>;
  } {
    const partners = Array.from(this.partners.values());
    
    const byType: Record<string, number> = {};
    partners.forEach(p => {
      byType[p.type] = (byType[p.type] || 0) + 1;
    });

    const totalRevenueShared = partners.reduce((sum, p) => sum + p.revenue.totalEarned, 0);
    const pendingPayouts = partners.reduce((sum, p) => sum + p.revenue.pendingPayout, 0);

    const topPartners = partners
      .filter(p => p.status === 'active')
      .sort((a, b) => b.revenue.totalEarned - a.revenue.totalEarned)
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        name: p.name,
        earned: p.revenue.totalEarned,
      }));

    return {
      totalPartners: partners.length,
      activePartners: partners.filter(p => p.status === 'active').length,
      pendingPartners: partners.filter(p => p.status === 'pending').length,
      totalRevenueShared,
      pendingPayouts,
      byType: byType as Record<PartnerType, number>,
      topPartners,
    };
  }

  /**
   * Suspend partner
   */
  suspendPartner(partnerId: string, reason: string): void {
    const partner = this.partners.get(partnerId);
    if (!partner) return;

    partner.status = 'suspended';
    partner.updatedAt = Date.now();

    logger.warn('PartnerManager', {
      message: 'Partner suspended',
      partnerId,
      reason,
    });

    this.emit('partner_suspended', { partnerId, reason });
  }

  /**
   * Generate API key
   */
  private generateApiKey(): string {
    return `vera_partner_${Buffer.from(Math.random().toString()).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`;
  }
}

// ─── Analytics Dashboard ───────────────────────────────────────────────────

export class PartnerDashboard extends EventEmitter {
  private manager: PartnerManager;

  constructor(manager: PartnerManager) {
    super();
    this.manager = manager;
  }

  /**
   * Get partner dashboard data
   */
  getPartnerDashboard(partnerId: string): {
    partner: Partner;
    recentPayouts: PayoutRecord[];
    revenueTrend: Array<{ date: string; value: number }>;
    apiUsage: Array<{ date: string; value: number }>;
    healthStatus: IntegrationHealth;
  } | null {
    const partner = this.manager.getPartner(partnerId);
    if (!partner) return null;

    // Generate mock trend data
    const revenueTrend = this.generateTrendData(30, partner.revenue.totalEarned / 30);
    const apiUsage = this.generateTrendData(30, partner.metrics.apiCalls / 30);

    return {
      partner,
      recentPayouts: this.manager.getPayoutHistory(partnerId).slice(-5),
      revenueTrend,
      apiUsage,
      healthStatus: partner.integration.health,
    };
  }

  /**
   * Get admin dashboard data
   */
  getAdminDashboard(): {
    overview: ReturnType<PartnerManager['getAnalytics']>;
    healthAlerts: Array<{ partnerId: string; name: string; issue: string }>;
    pendingApprovals: Partner[];
    recentPayouts: PayoutRecord[];
  } {
    const overview = this.manager.getAnalytics();
    
    const partners = this.manager.listPartners();
    
    const healthAlerts = partners
      .filter(p => p.integration.health.status !== 'healthy')
      .map(p => ({
        partnerId: p.id,
        name: p.name,
        issue: `Health status: ${p.integration.health.status}`,
      }));

    const pendingApprovals = partners.filter(p => p.status === 'pending');

    // Get recent payouts from all partners
    const recentPayouts: PayoutRecord[] = [];
    partners.forEach(p => {
      const history = this.manager.getPayoutHistory(p.id);
      recentPayouts.push(...history.slice(-3));
    });
    recentPayouts.sort((a, b) => b.timestamp - a.timestamp);

    return {
      overview,
      healthAlerts,
      pendingApprovals,
      recentPayouts: recentPayouts.slice(0, 10),
    };
  }

  /**
   * Generate trend data
   */
  private generateTrendData(days: number, baseValue: number): Array<{ date: string; value: number }> {
    const data: Array<{ date: string; value: number }> = [];
    const now = Date.now();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * 86400000);
      const noise = (Math.random() - 0.5) * baseValue * 0.3;
      data.push({
        date: date.toISOString().split('T')[0],
        value: Math.max(0, baseValue + noise),
      });
    }
    
    return data;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────

export const partnerManager = new PartnerManager();
export const partnerDashboard = new PartnerDashboard(partnerManager);
export default partnerManager;
