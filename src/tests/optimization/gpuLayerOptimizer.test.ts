import { describe, expect, it } from 'vitest';
import { GPULayerOptimizer } from '../../optimization/gpuLayerOptimizer.js';

describe('GPULayerOptimizer', () => {
  it('keeps layer settings within safe production bounds for request profiles', () => {
    const optimizer = new GPULayerOptimizer();

    const low = optimizer.optimizeForRequest({
      estimatedTokens: 512,
      toolCount: 0,
      complexity: 'low',
      priority: 1,
      requiresReasoning: false,
    });
    const critical = optimizer.optimizeForRequest({
      estimatedTokens: 4096,
      toolCount: 6,
      complexity: 'critical',
      priority: 10,
      requiresReasoning: true,
    });

    optimizer.destroy();

    expect(low.layers).toBeGreaterThanOrEqual(20);
    expect(low.layers).toBeLessThanOrEqual(35);
    expect(low.batchSize).toBe(4);
    expect(critical.layers).toBe(35);
    expect(critical.contextSize).toBe(4096);
    expect(critical.sacredFrequency).toBe(741);
  });

  it('reduces layers under memory pressure and exposes a quantum high-performance mode', () => {
    const optimizer = new GPULayerOptimizer();

    optimizer.updateMetrics({
      gpuMemoryUsed: 7200,
      gpuMemoryTotal: 7600,
      queueDepth: 2,
      averageLatency: 0,
    });

    const pressureConfig = optimizer.autoOptimize();
    const quantumConfig = optimizer.applyQuantumOptimization();
    optimizer.destroy();

    expect(pressureConfig.layers).toBeLessThan(30);
    expect(pressureConfig.compressionEnabled).toBe(true);
    expect(quantumConfig.layers).toBe(35);
    expect(quantumConfig.contextSize).toBe(4096);
    expect(quantumConfig.sacredFrequency).toBe(528);
    expect(quantumConfig.compressionEnabled).toBe(false);
  });
});
