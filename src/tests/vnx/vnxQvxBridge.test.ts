import { describe, expect, it, vi } from 'vitest';

describe('VNX QVX bridge', () => {
  it('validates required keys for vnx.train.started', async () => {
    const { emitVnxSignal } = await import('../../vnx/qvxBridge.js');
    const result = await emitVnxSignal('vnx.train.started', { contextSize: 4 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Missing required key 'modelName'");
  });

  it('validates required keys for vnx.inference.completed', async () => {
    const { emitVnxSignal } = await import('../../vnx/qvxBridge.js');
    const result = await emitVnxSignal('vnx.inference.completed', {
      modelHash: 'a'.repeat(64),
      outputHash: 'b'.repeat(64),
      traceHash: 'c'.repeat(64),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Missing required key 'generatedTokens'");
  });

  it('rejects unknown signal type', async () => {
    const { emitVnxSignal } = await import('../../vnx/qvxBridge.js');
    const result = await emitVnxSignal('vnx.unknown.signal' as any, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown signal type');
  });

  it('validates required keys for vnx.swarm.selected', async () => {
    const { emitVnxSignal } = await import('../../vnx/qvxBridge.js');
    const result = await emitVnxSignal('vnx.swarm.selected', {
      promptHash: 'a'.repeat(64),
      selected: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Missing required key 'maxSpecialists'");
  });
});
