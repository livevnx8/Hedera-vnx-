/**
 * Vera Defender Skin Analytics
 * Tracks skin sales, popular skins, revenue, and player engagement
 * Records events to HCS for audit trail
 */

import { logger } from '../../monitoring/logger.js';
import { config } from '../../config.js';
import { Client, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import type { SkinCategory } from '../nft/skinRegistry.js';
import { SkinRarity } from '../nft/skinNFTContract.js';

export interface SkinPurchaseEvent {
  type: 'SKIN_PURCHASED';
  skinId: string;
  category: SkinCategory;
  rarity: SkinRarity;
  buyer: string;
  amountHbar: number;
  amountUsd: number;
  paymentMethod: 'hbar' | 'x402';
  transactionId: string;
  timestamp: number;
  isBundle: boolean;
  bundleId?: string;
  promotionApplied?: string;
  discountPercent: number;
}

export interface SkinEquippedEvent {
  type: 'SKIN_EQUIPPED';
  skinId: string;
  category: SkinCategory;
  accountId: string;
  slot: string;
  previousSkinId?: string;
  timestamp: number;
}

export interface SkinViewEvent {
  type: 'SKIN_VIEWED';
  skinId: string;
  accountId: string;
  source: 'marketplace' | 'inventory' | 'game' | 'social_share';
  timestamp: number;
}

export type SkinEvent = SkinPurchaseEvent | SkinEquippedEvent | SkinViewEvent;

export interface SkinSalesStats {
  skinId: string;
  name: string;
  totalSales: number;
  revenueHbar: number;
  revenueUsd: number;
  uniqueBuyers: Set<string>;
  averageDiscount: number;
  lastSoldAt?: number;
}

export interface CategoryStats {
  category: SkinCategory;
  totalSales: number;
  revenueHbar: number;
  topSkinId: string;
  topSkinSales: number;
}

export interface RarityStats {
  rarity: SkinRarity;
  totalSales: number;
  revenueHbar: number;
  averagePriceHbar: number;
}

export interface TimeSeriesData {
  timestamp: number;
  sales: number;
  revenueHbar: number;
  revenueUsd: number;
}

export interface AnalyticsReport {
  period: { start: number; end: number };
  totalSales: number;
  totalRevenueHbar: number;
  totalRevenueUsd: number;
  uniqueBuyers: number;
  repeatBuyers: number;
  bySkin: SkinSalesStats[];
  byCategory: CategoryStats[];
  byRarity: RarityStats[];
  timeSeries: TimeSeriesData[];
  topPromotions: Array<{ promotionId: string; sales: number; revenueHbar: number }>;
}

export class SkinAnalytics {
  private client: Client;
  private analyticsTopicId: string | null = null;
  private events: SkinEvent[] = [];
  private salesBySkin: Map<string, SkinSalesStats> = new Map();
  private timeSeriesData: TimeSeriesData[] = [];
  private buyerHistory: Map<string, number> = new Map(); // accountId -> purchase count

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.analyticsTopicId = config.VERA_AUDIT_TOPIC_ID || null;
  }

  /**
   * Track a skin purchase
   */
  async trackPurchase(event: Omit<SkinPurchaseEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: SkinPurchaseEvent = {
      ...event,
      type: 'SKIN_PURCHASED',
      timestamp: Date.now()
    };

    this.events.push(fullEvent);

    // Update sales stats
    let stats = this.salesBySkin.get(event.skinId);
    if (!stats) {
      stats = {
        skinId: event.skinId,
        name: event.skinId, // Would look up actual name
        totalSales: 0,
        revenueHbar: 0,
        revenueUsd: 0,
        uniqueBuyers: new Set(),
        averageDiscount: 0,
        lastSoldAt: undefined
      };
      this.salesBySkin.set(event.skinId, stats);
    }

    stats.totalSales++;
    stats.revenueHbar += event.amountHbar;
    stats.revenueUsd += event.amountUsd;
    stats.uniqueBuyers.add(event.buyer);
    stats.lastSoldAt = fullEvent.timestamp;

    // Update buyer history
    const buyerCount = this.buyerHistory.get(event.buyer) || 0;
    this.buyerHistory.set(event.buyer, buyerCount + 1);

    // Update time series
    this.addToTimeSeries(fullEvent.timestamp, event.amountHbar, event.amountUsd);

    // Log to HCS
    await this.logToHCS(fullEvent);

    logger.info('SkinAnalytics', {
      skinId: event.skinId,
      buyer: event.buyer,
      amountHbar: event.amountHbar,
      message: 'Purchase tracked'
    });
  }

  /**
   * Track skin equip
   */
  async trackEquip(event: Omit<SkinEquippedEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: SkinEquippedEvent = {
      ...event,
      type: 'SKIN_EQUIPPED',
      timestamp: Date.now()
    };

    this.events.push(fullEvent);
    await this.logToHCS(fullEvent);

    logger.info('SkinAnalytics', {
      skinId: event.skinId,
      accountId: event.accountId,
      slot: event.slot,
      message: 'Equip tracked'
    });
  }

  /**
   * Track skin view
   */
  async trackView(event: Omit<SkinViewEvent, 'type' | 'timestamp'>): Promise<void> {
    const fullEvent: SkinViewEvent = {
      ...event,
      type: 'SKIN_VIEWED',
      timestamp: Date.now()
    };

    this.events.push(fullEvent);

    // Don't log views to HCS (too noisy), just keep in memory
    logger.debug('SkinAnalytics', {
      skinId: event.skinId,
      accountId: event.accountId,
      source: event.source,
      message: 'View tracked'
    });
  }

  /**
   * Log event to HCS
   */
  private async logToHCS(event: SkinEvent): Promise<void> {
    if (!this.analyticsTopicId) return;

    try {
      const message = JSON.stringify(event);
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.analyticsTopicId)
        .setMessage(message)
        .execute(this.client);
    } catch (error) {
      logger.warn('SkinAnalytics', {
        error: String(error),
        eventType: event.type,
        message: 'Failed to log to HCS'
      });
    }
  }

  /**
   * Add data to time series
   */
  private addToTimeSeries(timestamp: number, hbar: number, usd: number): void {
    const hourKey = Math.floor(timestamp / (60 * 60 * 1000)); // Group by hour
    
    let entry = this.timeSeriesData.find(t => Math.floor(t.timestamp / (60 * 60 * 1000)) === hourKey);
    if (!entry) {
      entry = {
        timestamp: hourKey * 60 * 60 * 1000,
        sales: 0,
        revenueHbar: 0,
        revenueUsd: 0
      };
      this.timeSeriesData.push(entry);
    }

    entry.sales++;
    entry.revenueHbar += hbar;
    entry.revenueUsd += usd;
  }

  /**
   * Generate analytics report for a time period
   */
  generateReport(startTime: number, endTime: number): AnalyticsReport {
    const periodEvents = this.events.filter(
      e => e.timestamp >= startTime && e.timestamp <= endTime && e.type === 'SKIN_PURCHASED'
    ) as SkinPurchaseEvent[];

    const uniqueBuyers = new Set(periodEvents.map(e => e.buyer));
    const repeatBuyers = Array.from(uniqueBuyers).filter(
      b => (this.buyerHistory.get(b) || 0) > 1
    ).length;

    // Stats by skin
    const skinStats: Map<string, SkinSalesStats> = new Map();
    const categoryStats: Map<SkinCategory, CategoryStats> = new Map();
    const rarityStats: Map<SkinRarity, RarityStats> = new Map();
    const promotionStats: Map<string, { promotionId: string; sales: number; revenueHbar: number }> = new Map();

    for (const event of periodEvents) {
      // By skin
      let skinStat = skinStats.get(event.skinId);
      if (!skinStat) {
        skinStat = {
          skinId: event.skinId,
          name: event.skinId,
          totalSales: 0,
          revenueHbar: 0,
          revenueUsd: 0,
          uniqueBuyers: new Set(),
          averageDiscount: 0,
          lastSoldAt: undefined
        };
        skinStats.set(event.skinId, skinStat);
      }
      skinStat.totalSales++;
      skinStat.revenueHbar += event.amountHbar;
      skinStat.revenueUsd += event.amountUsd;
      skinStat.uniqueBuyers.add(event.buyer);

      // By category
      let catStat = categoryStats.get(event.category);
      if (!catStat) {
        catStat = {
          category: event.category,
          totalSales: 0,
          revenueHbar: 0,
          topSkinId: event.skinId,
          topSkinSales: 0
        };
        categoryStats.set(event.category, catStat);
      }
      catStat.totalSales++;
      catStat.revenueHbar += event.amountHbar;
      if (skinStat.totalSales > catStat.topSkinSales) {
        catStat.topSkinId = event.skinId;
        catStat.topSkinSales = skinStat.totalSales;
      }

      // By rarity
      let rareStat = rarityStats.get(event.rarity);
      if (!rareStat) {
        rareStat = {
          rarity: event.rarity,
          totalSales: 0,
          revenueHbar: 0,
          averagePriceHbar: 0
        };
        rarityStats.set(event.rarity, rareStat);
      }
      rareStat.totalSales++;
      rareStat.revenueHbar += event.amountHbar;

      // By promotion
      if (event.promotionApplied) {
        let promoStat = promotionStats.get(event.promotionApplied);
        if (!promoStat) {
          promoStat = {
            promotionId: event.promotionApplied,
            sales: 0,
            revenueHbar: 0
          };
          promotionStats.set(event.promotionApplied, promoStat);
        }
        promoStat.sales++;
        promoStat.revenueHbar += event.amountHbar;
      }
    }

    // Calculate averages
    for (const rareStat of rarityStats.values()) {
      if (rareStat.totalSales > 0) {
        rareStat.averagePriceHbar = rareStat.revenueHbar / rareStat.totalSales;
      }
    }

    // Time series for period
    const periodTimeSeries = this.timeSeriesData.filter(
      t => t.timestamp >= startTime && t.timestamp <= endTime
    );

    return {
      period: { start: startTime, end: endTime },
      totalSales: periodEvents.length,
      totalRevenueHbar: periodEvents.reduce((sum, e) => sum + e.amountHbar, 0),
      totalRevenueUsd: periodEvents.reduce((sum, e) => sum + e.amountUsd, 0),
      uniqueBuyers: uniqueBuyers.size,
      repeatBuyers,
      bySkin: Array.from(skinStats.values()),
      byCategory: Array.from(categoryStats.values()),
      byRarity: Array.from(rarityStats.values()),
      timeSeries: periodTimeSeries,
      topPromotions: Array.from(promotionStats.values()).sort((a, b) => b.sales - a.sales)
    };
  }

  /**
   * Get top selling skins
   */
  getTopSkins(limit: number = 10): SkinSalesStats[] {
    return Array.from(this.salesBySkin.values())
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, limit);
  }

  /**
   * Get total revenue stats
   */
  getTotalRevenue(): { hbar: number; usd: number; sales: number } {
    const allEvents = this.events.filter(e => e.type === 'SKIN_PURCHASED') as SkinPurchaseEvent[];
    return {
      hbar: allEvents.reduce((sum, e) => sum + e.amountHbar, 0),
      usd: allEvents.reduce((sum, e) => sum + e.amountUsd, 0),
      sales: allEvents.length
    };
  }

  /**
   * Get buyer stats
   */
  getBuyerStats(): {
    totalBuyers: number;
    repeatBuyers: number;
    averagePurchasesPerBuyer: number;
  } {
    const counts = Array.from(this.buyerHistory.values());
    const repeatCount = counts.filter(c => c > 1).length;

    return {
      totalBuyers: counts.length,
      repeatBuyers: repeatCount,
      averagePurchasesPerBuyer: counts.length > 0 
        ? counts.reduce((a, b) => a + b, 0) / counts.length 
        : 0
    };
  }

  /**
   * Get real-time dashboard data
   */
  getDashboardData(): {
    todaySales: number;
    todayRevenueHbar: number;
    todayRevenueUsd: number;
    activeBuyers: number;
    topSkin: string | null;
    topSkinSales: number;
    recentEvents: SkinEvent[];
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const todayPurchases = this.events.filter(
      e => e.timestamp >= todayStart && e.type === 'SKIN_PURCHASED'
    ) as SkinPurchaseEvent[];

    const todayBuyers = new Set(todayPurchases.map(e => e.buyer));

    let topSkin: string | null = null;
    let topSales = 0;
    for (const [skinId, stats] of this.salesBySkin) {
      if (stats.totalSales > topSales) {
        topSales = stats.totalSales;
        topSkin = skinId;
      }
    }

    return {
      todaySales: todayPurchases.length,
      todayRevenueHbar: todayPurchases.reduce((sum, e) => sum + e.amountHbar, 0),
      todayRevenueUsd: todayPurchases.reduce((sum, e) => sum + e.amountUsd, 0),
      activeBuyers: todayBuyers.size,
      topSkin,
      topSkinSales: topSales,
      recentEvents: this.events.slice(-20).reverse()
    };
  }

  /**
   * Clean up old events (keep last 30 days in memory)
   */
  cleanupOldEvents(): void {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const beforeCount = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= cutoff);
    this.timeSeriesData = this.timeSeriesData.filter(t => t.timestamp >= cutoff);
    
    logger.info('SkinAnalytics', {
      beforeCount,
      afterCount: this.events.length,
      message: 'Old events cleaned up'
    });
  }

  /**
   * Export analytics data
   */
  exportData(): {
    events: SkinEvent[];
    timeSeries: TimeSeriesData[];
    generatedAt: number;
  } {
    return {
      events: this.events,
      timeSeries: this.timeSeriesData,
      generatedAt: Date.now()
    };
  }
}

// Singleton instance
let skinAnalytics: SkinAnalytics | null = null;

export function getSkinAnalytics(): SkinAnalytics {
  if (!skinAnalytics) {
    skinAnalytics = new SkinAnalytics();
  }
  return skinAnalytics;
}
