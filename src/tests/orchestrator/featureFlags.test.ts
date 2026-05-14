import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockConfig: Record<string, any> = {};
vi.mock('../../config.js', () => ({
  get config() { return mockConfig; },
}));

describe('FeatureFlagManager', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clean env vars
    delete process.env.VERA_DRY_RUN;
    delete process.env.VERA_SHADOW_MODE;
    delete process.env.VERA_DISABLE_ESCROW;
    delete process.env.VERA_DISABLE_X402;
    delete process.env.VERA_DISABLE_REGISTRATION;
    delete process.env.VERA_TESTNET_ONLY;

    mockConfig = { HEDERA_NETWORK: 'testnet' };
  });

  async function loadManager() {
    const mod = await import('../../vera/orchestrator/featureFlags.js');
    return new (mod as any).FeatureFlagManager
      ? new (mod as any).FeatureFlagManager()
      : mod.featureFlags;
  }

  // We need to test the class directly. Since it's constructed at module load,
  // we'll test via get/set/getAll and env overrides by re-importing.

  describe('defaults', () => {
    it('should have task orchestrator enabled by default', async () => {
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      // Test against the exported class interface
      const flags = mod.featureFlags.getAll();

      expect(flags.enableTaskOrchestrator).toBe(true);
      expect(flags.enableEscrow).toBe(true);
      expect(flags.enableX402Settlement).toBe(true);
      expect(flags.enableAgentSelfRegistration).toBe(true);
      expect(flags.enableReputationEngine).toBe(true);
      expect(flags.enableDynamicPricing).toBe(true);
      expect(flags.enableClientPool).toBe(true);
      expect(flags.enableRateLimiter).toBe(true);
      expect(flags.enableParallelPoller).toBe(true);
      expect(flags.dryRunMode).toBe(false);
      expect(flags.shadowMode).toBe(false);
    });
  });

  describe('get / set', () => {
    it('should get individual flags', async () => {
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('enableEscrow')).toBe(true);
    });

    it('should set individual flags', async () => {
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      mod.featureFlags.set('enableEscrow', false);
      expect(mod.featureFlags.get('enableEscrow')).toBe(false);
      // Reset for other tests
      mod.featureFlags.set('enableEscrow', true);
    });
  });

  describe('environment overrides', () => {
    it('VERA_DRY_RUN=true should enable dry run mode', async () => {
      process.env.VERA_DRY_RUN = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('dryRunMode')).toBe(true);
    });

    it('VERA_SHADOW_MODE=true should enable shadow mode', async () => {
      process.env.VERA_SHADOW_MODE = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('shadowMode')).toBe(true);
    });

    it('VERA_DISABLE_ESCROW=true should disable escrow', async () => {
      process.env.VERA_DISABLE_ESCROW = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('enableEscrow')).toBe(false);
    });

    it('VERA_DISABLE_X402=true should disable x402 settlement', async () => {
      process.env.VERA_DISABLE_X402 = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('enableX402Settlement')).toBe(false);
    });

    it('VERA_DISABLE_REGISTRATION=true should disable agent registration', async () => {
      process.env.VERA_DISABLE_REGISTRATION = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('enableAgentSelfRegistration')).toBe(false);
    });

    it('VERA_TESTNET_ONLY=true should enforce testnet only', async () => {
      process.env.VERA_TESTNET_ONLY = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.get('testnetOnly')).toBe(true);
    });
  });

  describe('safety checks', () => {
    it('isMainnetBlocked should be true when testnetOnly on mainnet', async () => {
      mockConfig.HEDERA_NETWORK = 'mainnet';
      vi.resetModules();
      process.env.VERA_TESTNET_ONLY = 'true';
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.isMainnetBlocked()).toBe(true);
    });

    it('isMainnetBlocked should be false on testnet', async () => {
      mockConfig.HEDERA_NETWORK = 'testnet';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.isMainnetBlocked()).toBe(false);
    });

    it('shouldExecutePayments should be false in shadow mode', async () => {
      process.env.VERA_SHADOW_MODE = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.shouldExecutePayments()).toBe(false);
    });

    it('shouldExecutePayments should be false in dry run mode', async () => {
      process.env.VERA_DRY_RUN = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.shouldExecutePayments()).toBe(false);
    });

    it('shouldExecutePayments should be true normally', async () => {
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.shouldExecutePayments()).toBe(true);
    });

    it('shouldWriteToHCS should be false in dry run mode', async () => {
      process.env.VERA_DRY_RUN = 'true';
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.shouldWriteToHCS()).toBe(false);
    });

    it('shouldWriteToHCS should be true normally', async () => {
      vi.resetModules();
      const mod = await import('../../vera/orchestrator/featureFlags.js');
      expect(mod.featureFlags.shouldWriteToHCS()).toBe(true);
    });
  });
});
