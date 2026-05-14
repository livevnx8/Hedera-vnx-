/**
 * Lattice Extensions Integration Tests
 *
 * Covers: spawn, promote, demote, hybrid-route, dedupe-stats,
 * swarm-stats, gpu-stats, and QVX training pipeline routes.
 */

import { describe, it, expect, vi } from 'vitest';
import { flowerOfLifeOS } from '../../src/vera/orchestrator/flowerOfLifeOS.js';
import { rigTopology } from '../../src/swarm/rigTopology.js';
import { veraLatticeSwarm } from '../../src/swarm/latticeSwarm.js';
import { qvxSelfTrainer } from '../../src/ai/fineTuning/qvxSelfTrainer.js';

vi.mock('../../src/dovu/veraHCS.js', () => ({
  veraHCS: {
    initialize: vi.fn().mockResolvedValue(undefined),
    logAchievement: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  },
}));

describe('Lattice Dynamic Operations', () => {
  it('flowerOfLifeOS should expose spawn, promote, demote, routeToHybrid', () => {
    expect(typeof flowerOfLifeOS.spawnNodeForDemand).toBe('function');
    expect(typeof flowerOfLifeOS.promoteAgent).toBe('function');
    expect(typeof flowerOfLifeOS.demoteAgent).toBe('function');
    expect(typeof flowerOfLifeOS.routeToHybrid).toBe('function');
  });

  it('spawnNodeForDemand should return null or a node', () => {
    const node = flowerOfLifeOS.spawnNodeForDemand('test-executor', 2);
    // May return null if layer capacity is exceeded
    expect(node === null || typeof node?.id === 'string').toBe(true);
  });
});

describe('Rig Topology & Swarm Stats', () => {
  it('rigTopology.getStats should return gpu list and averageLoad', () => {
    const stats = rigTopology.getStats();
    expect(Array.isArray(stats.gpus)).toBe(true);
    expect(typeof stats.averageLoad).toBe('number');
    expect(stats.averageLoad >= 0 && stats.averageLoad <= 1).toBe(true);
  });

  it('veraLatticeSwarm.getSwarmStats should return embedding and processor stats', () => {
    const stats = veraLatticeSwarm.getSwarmStats();
    expect(stats).toBeDefined();
    expect(typeof stats).toBe('object');
  });

  it('veraLatticeSwarm.getDeduplicatorStats should return inFlight count', () => {
    const stats = veraLatticeSwarm.getDeduplicatorStats();
    expect(typeof stats.inFlight).toBe('number');
    expect(typeof stats.totalSubscribers).toBe('number');
  });
});

describe('QVX Self-Training Pipeline', () => {
  it('qvxSelfTrainer should expose triggerTraining, getStatus, getJobs', () => {
    expect(typeof qvxSelfTrainer.triggerTraining).toBe('function');
    expect(typeof qvxSelfTrainer.getStatus).toBe('function');
    expect(typeof qvxSelfTrainer.getJobs).toBe('function');
  });

  it('getStatus should return isTraining boolean and totalJobs', () => {
    const status = qvxSelfTrainer.getStatus();
    expect(typeof status.isTraining).toBe('boolean');
    expect(typeof status.totalJobs).toBe('number');
    expect(status.totalJobs >= 0).toBe(true);
  });

  it('getJobs should return an array', () => {
    const jobs = qvxSelfTrainer.getJobs();
    expect(Array.isArray(jobs)).toBe(true);
  });
});
