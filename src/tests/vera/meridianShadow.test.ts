import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiMeridianShadowScorer } from '../../vera/proofKernel/meridianShadow.js';
import type { VerifiableAITask } from '../../vera/proofKernel/types.js';

function makeTask(): VerifiableAITask {
  return {
    taskId: 'task-1',
    description: 'Publish an HCS proof receipt',
    serviceType: 'proof-publisher',
    payload: {},
    budgetHbar: 1,
    requiredConfidence: 0.7,
    priority: 'normal',
    createdAt: Date.now(),
    metadata: {},
  };
}

describe('MultiMeridianShadowScorer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates multiple Meridian endpoints into one advisory score', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const body = String(url).includes('8124')
        ? { content: 'recommend carbon-verifier incomplete', model: 'meridian-b', backend: 'pytorch' }
        : { content: 'recommend proof-publisher complete', model: 'meridian-a', backend: 'pytorch' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const scorer = new MultiMeridianShadowScorer(
      ['http://127.0.0.1:8123', 'http://127.0.0.1:8124', 'http://127.0.0.1:8125'],
      true,
      1000,
    );
    const score = await scorer.score(makeTask(), ['proof-publisher', 'carbon-verifier']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(score.status).toBe('scored');
    expect(score.model).toBe('meridian-council');
    expect(score.quorum).toMatchObject({
      total: 3,
      scored: 3,
      unavailable: 0,
      recommendations: {
        'proof-publisher': 2,
        'carbon-verifier': 1,
      },
      proofCompleteness: {
        complete: 2,
        incomplete: 1,
      },
    });
    expect(score.recommendation).toBe('proof-publisher');
    expect(score.proofCompleteness).toBe('complete');
  });

  it('stays unavailable when no Meridian endpoint returns a score', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'down' }), { status: 503 }),
    );

    const scorer = new MultiMeridianShadowScorer(['http://127.0.0.1:8123'], true, 1000);
    const score = await scorer.score(makeTask(), ['proof-publisher']);

    expect(score.status).toBe('unavailable');
    expect(score.quorum).toMatchObject({
      total: 1,
      scored: 0,
      unavailable: 1,
    });
  });
});
