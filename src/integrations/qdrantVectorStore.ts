/**
 * Qdrant Vector Store Adapter
 *
 * Self-hosted alternative to Pinecone for vector search.
 * Keeps embeddings on-premise, cuts cloud costs, and enables air-gapped deployments.
 *
 * Requires: Qdrant running at QDRANT_URL (default http://localhost:6333)
 * Install: docker run -p 6333:6333 qdrant/qdrant
 */

import { logger } from '../monitoring/logger.js';

interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  distance: 'Cosine' | 'Euclid' | 'Dot';
}

export interface VectorPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface SearchResult {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
}

function getConfig(): QdrantConfig {
  return {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
    collectionName: process.env.QDRANT_COLLECTION || 'vera-lattice',
    vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '384', 10),
    distance: (process.env.QDRANT_DISTANCE as any) || 'Cosine',
  };
}

async function qdrantRequest(path: string, method: string, body?: unknown): Promise<unknown> {
  const cfg = getConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['api-key'] = cfg.apiKey;

  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

// ─── Collection Management ────────────────────────────────────────────────────

export async function ensureCollection(): Promise<void> {
  const cfg = getConfig();
  try {
    await qdrantRequest(`/collections/${cfg.collectionName}`, 'GET');
    logger.info('Qdrant', { message: 'Collection exists', name: cfg.collectionName });
  } catch {
    await qdrantRequest(`/collections/${cfg.collectionName}`, 'PUT', {
      vectors: {
        size: cfg.vectorSize,
        distance: cfg.distance,
      },
    });
    logger.info('Qdrant', { message: 'Collection created', name: cfg.collectionName });
  }
}

export async function deleteCollection(): Promise<void> {
  const cfg = getConfig();
  await qdrantRequest(`/collections/${cfg.collectionName}`, 'DELETE');
}

// ─── Point Operations ────────────────────────────────────────────────────────

export async function upsert(points: VectorPoint[]): Promise<void> {
  const cfg = getConfig();
  await qdrantRequest(`/collections/${cfg.collectionName}/points?wait=true`, 'PUT', {
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload ?? {},
    })),
  });
}

export async function search(
  vector: number[],
  limit: number = 10,
  filter?: Record<string, unknown>
): Promise<SearchResult[]> {
  const cfg = getConfig();
  const res = (await qdrantRequest(
    `/collections/${cfg.collectionName}/points/search`,
    'POST',
    {
      vector,
      limit,
      with_payload: true,
      filter: filter ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) } : undefined,
    }
  )) as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> };

  return (res.result ?? []).map((r) => ({ id: r.id, score: r.score, payload: r.payload }));
}

export async function deletePoints(ids: (string | number)[]): Promise<void> {
  const cfg = getConfig();
  await qdrantRequest(`/collections/${cfg.collectionName}/points/delete?wait=true`, 'POST', {
    points: ids,
  });
}

export async function getPoint(id: string | number): Promise<VectorPoint | null> {
  const cfg = getConfig();
  const res = (await qdrantRequest(
    `/collections/${cfg.collectionName}/points`,
    'POST',
    { ids: [id], with_payload: true, with_vector: true }
  )) as { result?: Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }> };
  const p = res.result?.[0];
  return p ? { id: p.id, vector: p.vector, payload: p.payload } : null;
}

export async function scroll(limit: number = 100, offset?: string | number): Promise<{ points: VectorPoint[]; nextOffset?: string | number }> {
  const cfg = getConfig();
  const res = (await qdrantRequest(
    `/collections/${cfg.collectionName}/points/scroll`,
    'POST',
    { limit, offset, with_payload: true, with_vector: true }
  )) as { result?: { points: Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }>; next_page_offset?: string | number } };

  return {
    points: (res.result?.points ?? []).map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
    nextOffset: res.result?.next_page_offset,
  };
}

// ─── Collection Info ─────────────────────────────────────────────────────────

export async function collectionInfo(): Promise<Record<string, unknown>> {
  const cfg = getConfig();
  return (await qdrantRequest(`/collections/${cfg.collectionName}`, 'GET')) as Record<string, unknown>;
}

// ─── Batch Embedding Helper (uses Xenova locally) ──────────────────────────

let embedder: any = null;

export async function embedText(text: string): Promise<number[]> {
  if (!embedder) {
    const { pipeline } = await import('@xenova/transformers');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function indexDocument(id: string, text: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await ensureCollection();
  const vector = await embedText(text);
  await upsert([{ id, vector, payload: { text, ...metadata } }]);
}

export async function semanticSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
  await ensureCollection();
  const vector = await embedText(query);
  return search(vector, limit);
}
