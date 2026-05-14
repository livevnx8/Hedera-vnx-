import { afterEach, describe, expect, it, vi } from 'vitest';
import { NIMRouter } from '../../llm/nimRouter.js';
import { NemotronRouter } from '../../llm/nemotronRouter.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('NVIDIA inference routers', () => {
  it('normalizes NIM base URLs whether callers include /v1 or not', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const withoutVersion = new NIMRouter({ url: 'http://localhost:8000' }, { startHealthChecks: false });
    const withVersion = new NIMRouter({ url: 'http://localhost:8001/v1/' }, { startHealthChecks: false });

    await withoutVersion.checkHealth();
    await withVersion.checkHealth();

    withoutVersion.destroy();
    withVersion.destroy();

    expect(calls).toEqual([
      'http://localhost:8000/v1/models',
      'http://localhost:8001/v1/models',
    ]);
  });

  it('lets Nemotron health fall back from /health to /models for OpenAI-compatible NIM servers', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).endsWith('/health')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const router = new NemotronRouter({ url: 'http://localhost:8002/v1' });

    await expect(router.checkHealth()).resolves.toBe(true);
    expect(calls).toEqual([
      'http://localhost:8002/v1/health',
      'http://localhost:8002/v1/models',
    ]);
  });

  it('sends Nemotron inference to a normalized OpenAI-compatible chat completions endpoint', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"answer":"ok"}' }, finish_reason: 'stop' }],
        usage: { total_tokens: 9 },
      }), { status: 200 });
    }) as typeof fetch;

    const router = new NemotronRouter({
      url: 'http://localhost:8003',
      model: 'nemotron-nano',
      provider: 'nim',
    });

    const result = await router.generateStructured<{ answer: string }>('say ok', '{"answer":"string"}');

    expect(result).toEqual({ answer: 'ok' });
    expect(calls).toEqual(['http://localhost:8003/v1/chat/completions']);
  });
});
