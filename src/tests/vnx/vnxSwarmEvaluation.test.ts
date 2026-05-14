import { describe, expect, it } from 'vitest';
import {
  deriveVnxSwarmRouteWeights,
  runVnxSwarmEvaluation,
  runVnxSwarmSelectionEvaluation,
  VNX_SWARM_EVAL_CASES,
} from '../../vnx/swarmEvaluation.js';
import { selectVnxSwarmSpecialists } from '../../vnx/swarmPromptContext.js';

describe('VNX swarm evaluation harness', () => {
  it('covers the core specialist domains', () => {
    const categories = new Set(VNX_SWARM_EVAL_CASES.map((item) => item.category));
    expect(categories).toEqual(new Set([
      'architecture',
      'code',
      'creative',
      'data',
      'dialogue',
      'hedera',
      'memory',
      'qvx',
      'security',
    ]));
  });

  it('passes deterministic selection-only routing gates', () => {
    const results = runVnxSwarmSelectionEvaluation();
    expect(results.every((item) => item.pass)).toBe(true);
  });

  it('passes full local context evaluation against .vnx specialists', async () => {
    const report = await runVnxSwarmEvaluation();
    expect(report.standard).toBe('VNX-SWARM-EVAL-1');
    expect(report.failed).toBe(0);
    expect(report.promotionReady).toBe(true);
    expect(report.specialistStats.length).toBeGreaterThan(0);
    expect(Object.keys(report.recommendedRouteWeights).length).toBeGreaterThan(0);
  });

  it('derives bounded adaptive route weights from evaluation stats', () => {
    const weights = deriveVnxSwarmRouteWeights([
      { id: 'code-forge', selected: 3, expected: 3, missed: 0, forbidden: 0, contributionScore: 3 },
      { id: 'ledger-ops', selected: 1, expected: 0, missed: 0, forbidden: 2, contributionScore: -4 },
    ]);

    expect(weights['code-forge']).toBeGreaterThan(0);
    expect(weights['ledger-ops']).toBeLessThan(0);
    expect(Math.abs(weights['code-forge'])).toBeLessThanOrEqual(2);
    expect(Math.abs(weights['ledger-ops'])).toBeLessThanOrEqual(2);
  });

  it('can apply adaptive route weights without losing keyword routing', () => {
    const selected = selectVnxSwarmSpecialists('debug TypeScript build failure', {
      limit: 2,
      routeWeights: { 'logic-sage': 2 },
    });

    expect(selected.map((item) => item.id)).toContain('code-forge');
    expect(selected.some((item) => item.adaptiveWeight > 0)).toBe(true);
  });
});
