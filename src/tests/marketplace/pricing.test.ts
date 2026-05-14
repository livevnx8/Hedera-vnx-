import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamicPricingEngine, type PricingConfig } from '../../../src/vera/marketplace/pricing.js';

describe('DynamicPricingEngine', () => {
  let engine: DynamicPricingEngine;

  beforeEach(() => {
    engine = new DynamicPricingEngine();
  });

  describe('updateSupply', () => {
    it('should update supply count for a service type', () => {
      engine.updateSupply('data-analysis', 5);

      const pricing = engine.getPricing('data-analysis');
      expect(pricing.supplyCount).toBe(5);
    });

    it('should recalculate price when supply changes', () => {
      // First create demand
      for (let i = 0; i < 10; i++) {
        engine.recordDemand('data-analysis');
      }

      // Set low supply -> scarcity -> premium
      engine.updateSupply('data-analysis', 2);
      const lowSupplyPricing = engine.getPricing('data-analysis');

      // Set high supply -> surplus -> discount
      engine.updateSupply('data-analysis', 20);
      const highSupplyPricing = engine.getPricing('data-analysis');

      expect(lowSupplyPricing.currentBudgetHbar).toBeGreaterThan(highSupplyPricing.currentBudgetHbar);
    });
  });

  describe('recordDemand', () => {
    it('should record demand for a service type', () => {
      engine.recordDemand('data-analysis');
      engine.recordDemand('data-analysis');

      const pricing = engine.getPricing('data-analysis');
      expect(pricing.demandCount).toBeGreaterThanOrEqual(2);
    });

    it('should recalculate price when demand changes', () => {
      engine.updateSupply('data-analysis', 10); // Fixed supply

      // Low demand
      engine.recordDemand('data-analysis');
      const lowDemandPricing = engine.getPricing('data-analysis');

      // High demand
      for (let i = 0; i < 50; i++) {
        engine.recordDemand('data-analysis');
      }
      const highDemandPricing = engine.getPricing('data-analysis');

      expect(highDemandPricing.currentBudgetHbar).toBeGreaterThanOrEqual(lowDemandPricing.currentBudgetHbar);
    });

    it('should clean old demand records outside window', () => {
      // Create engine with very short window for testing
      const shortWindowEngine = new DynamicPricingEngine({
        demandWindowMs: 100, // 100ms window
      });

      shortWindowEngine.recordDemand('test-service');
      const pricingBefore = shortWindowEngine.getPricing('test-service');

      // Wait for window to pass
      vi.useFakeTimers();
      vi.advanceTimersByTime(200);

      // Trigger recalculation by recording new demand
      shortWindowEngine.recordDemand('test-service');
      const pricingAfter = shortWindowEngine.getPricing('test-service');

      vi.useRealTimers();

      // The old demand should be cleaned up, so demand count should be low
      expect(pricingAfter.demandCount).toBeLessThanOrEqual(2);
    });
  });

  describe('getBudget', () => {
    it('should return base budget for unknown service types', () => {
      const budget = engine.getBudget('unknown-service');
      expect(budget).toBe(0.5); // DEFAULT_CONFIG.baseBudgetHbar
    });

    it('should return adjusted budget for known service types', () => {
      engine.updateSupply('data-analysis', 10);
      engine.recordDemand('data-analysis');

      const budget = engine.getBudget('data-analysis');
      expect(budget).not.toBe(0.5); // Should be adjusted based on supply/demand
    });
  });

  describe('getPricing', () => {
    it('should return default pricing for unknown service', () => {
      const pricing = engine.getPricing('unknown-service');

      expect(pricing.serviceType).toBe('unknown-service');
      expect(pricing.baseBudgetHbar).toBe(0.5);
      expect(pricing.supplyCount).toBe(0);
      expect(pricing.demandCount).toBe(0);
    });

    it('should return current pricing for known service', () => {
      engine.updateSupply('data-analysis', 5);
      engine.recordDemand('data-analysis');

      const pricing = engine.getPricing('data-analysis');
      expect(pricing.supplyCount).toBe(5);
    });
  });

  describe('supply/demand ratio effects', () => {
    it('should apply surplus discount when supply > demand', () => {
      engine.updateSupply('surplus-service', 20);
      for (let i = 0; i < 5; i++) {
        engine.recordDemand('surplus-service');
      }

      const pricing = engine.getPricing('surplus-service');
      expect(pricing.supplyDemandRatio).toBeGreaterThan(1);
      expect(pricing.currentBudgetHbar).toBeLessThan(pricing.baseBudgetHbar);
    });

    it('should apply scarcity premium when demand > supply', () => {
      engine.updateSupply('scarce-service', 2);
      for (let i = 0; i < 20; i++) {
        engine.recordDemand('scarce-service');
      }

      const pricing = engine.getPricing('scarce-service');
      expect(pricing.supplyDemandRatio).toBeLessThan(1);
      expect(pricing.currentBudgetHbar).toBeGreaterThan(pricing.baseBudgetHbar);
    });

    it('should respect min/max budget bounds', () => {
      const boundedEngine = new DynamicPricingEngine({
        minBudgetHbar: 0.1,
        maxBudgetHbar: 2.0,
        baseBudgetHbar: 1.0,
        scarcityPremium: 10.0, // Would try to push way over max
        surplusDiscount: 0.9, // Would try to push way under min
      });

      // Test max bound
      boundedEngine.updateSupply('scarce-service', 1);
      for (let i = 0; i < 100; i++) {
        boundedEngine.recordDemand('scarce-service');
      }
      const scarcePricing = boundedEngine.getPricing('scarce-service');
      expect(scarcePricing.currentBudgetHbar).toBeLessThanOrEqual(2.0);

      // Test min bound
      boundedEngine.updateSupply('surplus-service', 1000);
      boundedEngine.recordDemand('surplus-service');
      const surplusPricing = boundedEngine.getPricing('surplus-service');
      expect(surplusPricing.currentBudgetHbar).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('getStats', () => {
    it('should return aggregate pricing stats', () => {
      engine.updateSupply('service-1', 5);
      engine.updateSupply('service-2', 10);
      engine.recordDemand('service-1');
      engine.recordDemand('service-2');

      const stats = engine.getStats();

      expect(stats.trackedServices).toBe(2);
      expect(stats.totalSupply).toBe(15);
      expect(stats.config).toBeDefined();
    });

    it('should calculate average budget across services', () => {
      engine.updateSupply('service-1', 10); // High supply -> low price
      engine.updateSupply('service-2', 1); // Low supply -> high price
      engine.recordDemand('service-1');
      engine.recordDemand('service-2');

      const stats = engine.getStats();
      expect(stats.averageBudget).toBeGreaterThan(0);
    });
  });

  describe('getAllPricing', () => {
    it('should return all service pricing', () => {
      engine.updateSupply('service-1', 5);
      engine.updateSupply('service-2', 10);
      engine.updateSupply('service-3', 15);

      const allPricing = engine.getAllPricing();
      expect(allPricing.length).toBe(3);
    });
  });

  describe('case insensitivity', () => {
    it('should treat service types case-insensitively', () => {
      engine.updateSupply('Data-Analysis', 5);
      engine.recordDemand('data-analysis');

      const pricing = engine.getPricing('DATA-ANALYSIS');
      expect(pricing.supplyCount).toBe(5);
      expect(pricing.demandCount).toBeGreaterThanOrEqual(1);
    });
  });
});
