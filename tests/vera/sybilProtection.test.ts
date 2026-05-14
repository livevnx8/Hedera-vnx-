import { describe, it, expect, beforeEach } from 'vitest';
import { SybilProtection } from '../../src/vera/security/sybilProtection.js';

describe('SybilProtection', () => {
  let sybil: SybilProtection;

  beforeEach(() => {
    sybil = new SybilProtection({
      maxRegistrationsPerHour: 3,
      cooldownMs: 100,           // 100ms for fast tests
      minStakeHbar: 0.1,
      burstThreshold: 2,
      burstWindowMs: 500,
      blockDurationMs: 1000,
      enabled: true,
    });
  });

  it('should allow a valid registration', () => {
    const result = sybil.checkRegistration('ip-1', 1.0);
    expect(result.allowed).toBe(true);
  });

  it('should reject registration with insufficient stake', () => {
    const result = sybil.checkRegistration('ip-1', 0.01);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('insufficient_stake');
  });

  it('should enforce cooldown between registrations', () => {
    sybil.checkRegistration('ip-1', 1.0);
    const result = sybil.checkRegistration('ip-1', 1.0); // immediately after
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cooldown');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should allow registration after cooldown expires', async () => {
    sybil.checkRegistration('ip-1', 1.0);
    await new Promise(r => setTimeout(r, 150)); // wait past 100ms cooldown
    const result = sybil.checkRegistration('ip-1', 1.0);
    expect(result.allowed).toBe(true);
  });

  it('should block source after exceeding hourly limit', async () => {
    // Space attempts outside the burst window so this test isolates hourly limits.
    sybil.checkRegistration('ip-1', 1.0);
    await new Promise(r => setTimeout(r, 510));
    sybil.checkRegistration('ip-1', 1.0);
    await new Promise(r => setTimeout(r, 510));
    sybil.checkRegistration('ip-1', 1.0);
    await new Promise(r => setTimeout(r, 510));

    const result = sybil.checkRegistration('ip-1', 1.0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('rate_limit_exceeded');
  });

  it('should detect burst registrations', async () => {
    // burstThreshold is 2 within 500ms window
    sybil.checkRegistration('ip-2', 1.0);
    await new Promise(r => setTimeout(r, 110)); // past cooldown
    sybil.checkRegistration('ip-2', 1.0);
    await new Promise(r => setTimeout(r, 110)); // past cooldown but within burst window
    const result = sybil.checkRegistration('ip-2', 1.0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('burst_detected');
  });

  it('should manually block and unblock sources', () => {
    sybil.blockSource('ip-bad');
    const result = sybil.checkRegistration('ip-bad', 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('source_blocked');

    sybil.unblockSource('ip-bad');
    const result2 = sybil.checkRegistration('ip-bad', 10);
    expect(result2.allowed).toBe(true);
  });

  it('should pass through when disabled', () => {
    const disabled = new SybilProtection({ enabled: false });
    const result = disabled.checkRegistration('any', 0);
    expect(result.allowed).toBe(true);
  });

  it('should track stats', async () => {
    sybil.checkRegistration('ip-1', 1.0);
    sybil.checkRegistration('ip-2', 0.01); // rejected (stake)
    sybil.blockSource('ip-3');
    sybil.checkRegistration('ip-3', 1.0); // blocked

    const stats = sybil.getStats();
    expect(stats.enabled).toBe(true);
    expect(stats.allowed).toBe(1);
    expect(stats.stakeRejected).toBe(1);
    expect(stats.blocked).toBe(1);
    expect(stats.blockedSources).toBe(1);
  });

  it('should isolate different sources', async () => {
    sybil.checkRegistration('ip-1', 1.0);
    // ip-2 should not be affected by ip-1's cooldown
    const result = sybil.checkRegistration('ip-2', 1.0);
    expect(result.allowed).toBe(true);
  });
});
