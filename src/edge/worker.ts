/**
 * Cloudflare Worker Edge Runtime Stub
 *
 * Lightweight Vera agent shard for edge deployment.
 * Runs minimal inference + HCS publish loop near the user.
 *
 * Deploy: wrangler deploy src/edge/worker.ts
 * Requires: Wrangler CLI + CLOUDFLARE_API_TOKEN
 */

// Cloudflare Workers runtime types (declared as ambient for compilation)
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  }
  interface Request {
    cf?: { colo?: string; country?: string };
  }
}

export interface EdgeEnv {
  HEDERA_OPERATOR_ID: string;
  HEDERA_OPERATOR_KEY: string;
  VERA_TOPIC_ID: string;
  OPENAI_API_KEY: string;
  CACHE: KVNamespace;
}

// Lightweight HCS message submit via Hedera REST API (no SDK overhead)
async function submitHcsMessage(env: EdgeEnv, message: string): Promise<{ sequenceNumber: number }> {
  const topicId = env.VERA_TOPIC_ID;
  const apiUrl = `https://mainnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`;

  // In production, use a micro-gateway or HCS proxy to avoid exposing keys in Workers
  // This stub shows the pattern; actual signing requires a WASM Hedera crypto module
  return { sequenceNumber: Date.now() };
}

// Edge inference stub — calls OpenAI or a local mini-model
async function edgeInfer(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

// ─── Worker Handler ───────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      // ─── Health ──────────────────────────────────────────────────────────
      if (path === '/health' || path === '/') {
        return jsonResponse({ ok: true, edge: true, ts: Date.now() });
      }

      // ─── Edge Inference ──────────────────────────────────────────────────
      if (path === '/infer' && request.method === 'POST') {
        const body = (await request.json()) as { prompt: string };
        if (!body.prompt) return jsonResponse({ error: 'prompt required' }, 400);

        const cacheKey = `infer:${await hash(body.prompt)}`;
        const cached = await env.CACHE.get(cacheKey);
        if (cached) return jsonResponse({ cached: true, response: cached });

        const result = await edgeInfer(body.prompt, env.OPENAI_API_KEY);
        await env.CACHE.put(cacheKey, result, { expirationTtl: 300 });

        return jsonResponse({ cached: false, response: result });
      }

      // ─── HCS Publish ─────────────────────────────────────────────────────
      if (path === '/hcs/publish' && request.method === 'POST') {
        const body = (await request.json()) as { message: string };
        if (!body.message) return jsonResponse({ error: 'message required' }, 400);

        const result = await submitHcsMessage(env, body.message);
        return jsonResponse({ published: true, sequenceNumber: result.sequenceNumber });
      }

      // ─── Lattice Pulse (echo to nearest region) ────────────────────────────
      if (path === '/lattice/pulse' && request.method === 'POST') {
        const body = (await request.json()) as { type?: string; data?: Record<string, unknown> };
        const pulse = {
          origin: 'edge',
          timestamp: Date.now(),
          type: body.type || 'heartbeat',
          data: body.data || {},
          cf: {
            colo: request.cf?.colo ?? 'unknown',
            country: request.cf?.country ?? 'unknown',
          },
        };

        // Async fire-and-forget to HCS
        env.CACHE.put(`pulse:${pulse.timestamp}`, JSON.stringify(pulse), { expirationTtl: 60 });
        return jsonResponse({ received: true, pulse });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
