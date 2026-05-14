import { describe, it, expect, beforeEach } from 'vitest';
import { HMACVerifier } from '../../src/vera/security/hmacVerifier.js';

describe('HMACVerifier', () => {
  let verifier: HMACVerifier;

  beforeEach(() => {
    verifier = new HMACVerifier({
      algorithm: 'sha256',
      secretKeyBase: 'test-secret-key-for-unit-tests',
      timestampToleranceMs: 5 * 60 * 1000,
      enabled: true,
    });
    verifier.start();
  });

  it('should sign and verify a valid message', () => {
    const agentId = 'agent-abc';
    const payload = '{"type":"bid","fee":2}';
    const timestamp = Date.now();
    const signature = verifier.sign(agentId, payload, timestamp);

    const result = verifier.verify({ agentId, payload, timestamp, signature });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should reject a message with wrong signature', () => {
    const result = verifier.verify({
      agentId: 'agent-abc',
      payload: '{"type":"bid"}',
      timestamp: Date.now(),
      signature: 'deadbeef'.repeat(8),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('should reject a stale message (timestamp expired)', () => {
    const agentId = 'agent-abc';
    const payload = '{"type":"bid"}';
    const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 min ago
    const signature = verifier.sign(agentId, payload, oldTimestamp);

    const result = verifier.verify({ agentId, payload, timestamp: oldTimestamp, signature });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_expired');
  });

  it('should reject a replayed message (duplicate signature)', () => {
    const agentId = 'agent-abc';
    const payload = '{"type":"bid"}';
    const timestamp = Date.now();
    const signature = verifier.sign(agentId, payload, timestamp);

    // First time — valid
    const first = verifier.verify({ agentId, payload, timestamp, signature });
    expect(first.valid).toBe(true);

    // Second time — replay
    const second = verifier.verify({ agentId, payload, timestamp, signature });
    expect(second.valid).toBe(false);
    expect(second.reason).toBe('replay_detected');
  });

  it('should pass through when disabled', () => {
    const disabled = new HMACVerifier({ enabled: false, secretKeyBase: '', timestampToleranceMs: 1000, algorithm: 'sha256' });
    const result = disabled.verify({
      agentId: 'x',
      payload: 'anything',
      timestamp: 0,
      signature: 'invalid',
    });
    expect(result.valid).toBe(true);
  });

  it('should derive unique secrets per agent', () => {
    const s1 = verifier.deriveAgentSecret('agent-1');
    const s2 = verifier.deriveAgentSecret('agent-2');
    expect(s1).not.toBe(s2);
    expect(s1.length).toBe(64); // sha256 hex = 64 chars
  });

  it('should report stats accurately', () => {
    const agentId = 'agent-abc';
    const payload = '{"type":"bid"}';
    const ts = Date.now();
    const sig = verifier.sign(agentId, payload, ts);

    verifier.verify({ agentId, payload, timestamp: ts, signature: sig });
    verifier.verify({ agentId, payload: 'tampered', timestamp: ts, signature: sig });

    const stats = verifier.getStats();
    expect(stats.enabled).toBe(true);
    expect(stats.verified).toBe(1);
    expect(stats.rejected).toBeGreaterThanOrEqual(1);
    expect(stats.knownAgents).toBeGreaterThanOrEqual(1);
  });

  it('should verify and parse HCS JSON messages', () => {
    const agentId = 'agent-abc';
    const innerPayload = { type: 'bid', fee: 2 };
    const payloadStr = JSON.stringify(innerPayload);
    const ts = Date.now();
    const sig = verifier.sign(agentId, payloadStr, ts);

    const rawJson = JSON.stringify({
      agentId,
      _ts: ts,
      _sig: sig,
      ...innerPayload,
    });

    const parsed = verifier.verifyHCSMessage(rawJson);
    expect(parsed).not.toBeNull();
    expect(parsed!.agentId).toBe(agentId);
    expect(parsed!.type).toBe('bid');
  });

  it('should reject malformed HCS JSON', () => {
    const parsed = verifier.verifyHCSMessage('not-json');
    expect(parsed).toBeNull();
  });

  it('should reject unsigned HCS messages when signatures are required', () => {
    const required = new HMACVerifier({
      algorithm: 'sha256',
      secretKeyBase: '',
      timestampToleranceMs: 5 * 60 * 1000,
      enabled: false,
      requireSignature: true,
    });

    const parsed = required.verifyHCSMessage(JSON.stringify({ agentId: 'agent-abc', type: 'result' }));
    expect(parsed).toBeNull();
    expect(required.getStats().rejected).toBe(1);
  });
});
