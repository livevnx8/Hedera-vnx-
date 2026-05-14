/**
 * HCS → Vector DB Sync System
 * 
 * Streams historical HCS messages into vector database for:
 * - Semantic similarity search
 * - Fast retrieval (sub-100ms vs mirror node's 500ms+)
 * - Hybrid search (keyword + semantic)
 * 
 * Supports Pinecone, pgvector (PostgreSQL), or in-memory fallback
 */

import { hcsBrainRetrieval, RetrievedMemory } from './hcsBrainRetrieval.js';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';

interface EmbeddingVector {
  id: string;
  values: number[];
  metadata: {
    sequence: number;
    topicId: string;
    timestamp: string;
    category?: string;
    content: string; // Truncated for search context
    [key: string]: any;
  };
}

export interface VectorDBConfig {
  provider: 'pinecone' | 'pgvector' | 'memory';
  dimension: number; // 384 for all-MiniLM, 768 for all-mpnet, 1536 for OpenAI
  indexName: string;
  namespace?: string;
}

export interface SyncProgress {
  totalMessages: number;
  processed: number;
  failed: number;
  lastSequenceByTopic: Record<string, number>;
  startedAt: Date;
  estimatedCompletion?: Date;
}

export interface SemanticQueryResult {
  memory: RetrievedMemory;
  similarity: number; // 0-1 cosine similarity
  ranking: number;
}

export class HCSVectorSync {
  private config: VectorDBConfig;
  private syncProgress: SyncProgress | null = null;
  private memoryStore: Map<string, EmbeddingVector> = new Map(); // Fallback in-memory
  private pgPool: any = null; // PostgreSQL connection (lazy loaded)
  private pineconeIndex: any = null; // Pinecone index (lazy loaded)

  constructor(vectorConfig?: Partial<VectorDBConfig>) {
    this.config = {
      provider: (process.env.VECTOR_DB_PROVIDER as any) || 'memory',
      dimension: parseInt(process.env.VECTOR_DIMENSION || '384'),
      indexName: process.env.VECTOR_INDEX_NAME || 'vera-hcs-embeddings',
      namespace: process.env.VECTOR_NAMESPACE || 'learning',
      ...vectorConfig
    };
  }

  /**
   * Initialize vector database connection
   */
  async initialize(): Promise<boolean> {
    logger.info('HCSVectorSync', {
      provider: this.config.provider,
      dimension: this.config.dimension,
      message: 'Initializing vector database'
    });

    try {
      switch (this.config.provider) {
        case 'pinecone':
          return await this.initPinecone();
        case 'pgvector':
          return await this.initPgvector();
        case 'memory':
        default:
          logger.info('HCSVectorSync', { message: 'Using in-memory vector store' });
          return true;
      }
    } catch (error) {
      logger.error('HCSVectorSync', {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to initialize vector DB, falling back to memory'
      });
      this.config.provider = 'memory';
      return true;
    }
  }

  /**
   * Initialize Pinecone connection
   */
  private async initPinecone(): Promise<boolean> {
    const { Pinecone } = await import('@pinecone-database/pinecone');
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    this.pineconeIndex = pinecone.Index(this.config.indexName);
    
    // Verify connection
    await this.pineconeIndex.describeIndexStats();
    
    logger.info('HCSVectorSync', {
      indexName: this.config.indexName,
      message: 'Pinecone connected'
    });
    return true;
  }

  /**
   * Initialize pgvector (PostgreSQL) connection
   */
  private async initPgvector(): Promise<boolean> {
    const { Pool } = await import('pg');
    
    this.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Ensure pgvector extension and table exist
    const client = await this.pgPool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`
        CREATE TABLE IF NOT EXISTS vera_embeddings (
          id TEXT PRIMARY KEY,
          topic_id TEXT NOT NULL,
          sequence_number INTEGER NOT NULL,
          embedding vector(${this.config.dimension}),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vera_embeddings_vector 
        ON vera_embeddings USING ivfflat (embedding vector_cosine_ops)
      `);
    } finally {
      client.release();
    }

    logger.info('HCSVectorSync', { message: 'pgvector connected' });
    return true;
  }

  /**
   * Generate embedding from text using local model or API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Try local embedding first (no API cost)
    try {
      return await this.generateLocalEmbedding(text);
    } catch (error) {
      // Fall back to OpenAI if local fails and API key exists
      if (process.env.OPENAI_API_KEY) {
        return await this.generateOpenAIEmbedding(text);
      }
      throw error;
    }
  }

  /**
   * Generate embedding using local ONNX model
   */
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    // Dynamic import to avoid loading if not used
    const { pipeline } = await import('@xenova/transformers');
    
    // Use lightweight model: all-MiniLM-L6-v2 (384 dims, ~80MB)
    const embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }
    );

    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000) // Token limit
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Sync HCS messages to vector database
   * Streams in chunks for 100k+ items
   */
  async syncHistoricalMessages(
    topicId: string,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncProgress> {
    this.syncProgress = {
      totalMessages: 0,
      processed: 0,
      failed: 0,
      lastSequenceByTopic: {},
      startedAt: new Date()
    };

    logger.info('HCSVectorSync', {
      topicId,
      message: 'Starting historical sync'
    });

    // Get brain stats to estimate total
    const stats = await hcsBrainRetrieval.getBrainStats();
    this.syncProgress.totalMessages = stats.messagesByTopic[topicId] || 100000;

    // Stream messages in chunks
    for await (const chunk of hcsBrainRetrieval.streamHistoricalMessages(topicId, undefined, 50)) {
      const embeddings: EmbeddingVector[] = [];

      for (const memory of chunk) {
        try {
          // Generate text representation for embedding
          const text = this.memoryToText(memory);
          const vector = await this.generateEmbedding(text);

          embeddings.push({
            id: `${memory.topicId}-${memory.sequence}`,
            values: vector,
            metadata: {
              sequence: memory.sequence,
              topicId: memory.topicId,
              timestamp: memory.timestamp.toISOString(),
              category: memory.content?.category,
              content: text.slice(0, 500) // Store truncated for context
            }
          });

          this.syncProgress.processed++;
          this.syncProgress.lastSequenceByTopic[topicId] = memory.sequence;
        } catch (error) {
          this.syncProgress.failed++;
          logger.warn('HCSVectorSync', {
            sequence: memory.sequence,
            error: error instanceof Error ? error.message : String(error),
            message: 'Failed to process message'
          });
        }
      }

      // Batch upsert to vector DB
      if (embeddings.length > 0) {
        await this.upsertEmbeddings(embeddings);
      }

      // Report progress
      if (onProgress) {
        onProgress({ ...this.syncProgress });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger.info('HCSVectorSync', {
      topicId,
      processed: this.syncProgress.processed,
      failed: this.syncProgress.failed,
      message: 'Historical sync completed'
    });

    return this.syncProgress;
  }

  /**
   * Convert memory to searchable text
   */
  private memoryToText(memory: RetrievedMemory): string {
    const parts: string[] = [];
    
    if (memory.content?.user_query) {
      parts.push(`Query: ${memory.content.user_query}`);
    }
    if (memory.content?.vera_response) {
      parts.push(`Response: ${memory.content.vera_response}`);
    }
    if (memory.content?.category) {
      parts.push(`Category: ${memory.content.category}`);
    }
    if (memory.content?.tools_used?.length) {
      parts.push(`Tools: ${memory.content.tools_used.join(', ')}`);
    }
    if (memory.content?.message) {
      parts.push(String(memory.content.message));
    }

    return parts.join('\n') || JSON.stringify(memory.content);
  }

  /**
   * Upsert embeddings to vector database
   */
  private async upsertEmbeddings(embeddings: EmbeddingVector[]): Promise<void> {
    switch (this.config.provider) {
      case 'pinecone':
        await this.pineconeIndex.upsert(embeddings.map(e => ({
          id: e.id,
          values: e.values,
          metadata: e.metadata
        })));
        break;

      case 'pgvector':
        const client = await this.pgPool.connect();
        try {
          // Batch insert for better performance
          const BATCH_SIZE = 100;
          for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
            const batch = embeddings.slice(i, i + BATCH_SIZE);
            const values = batch.map((e, idx) => 
              `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
            ).join(',');
            const params = batch.flatMap(e => [
              e.id, e.metadata.topicId, e.metadata.sequence, 
              `[${e.values.join(',')}]`, e.metadata
            ]);
            
            await client.query(`
              INSERT INTO vera_embeddings (id, topic_id, sequence_number, embedding, metadata)
              VALUES ${values}
              ON CONFLICT (id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata
            `, params);
          }
        } finally {
          client.release();
        }
        break;

      case 'memory':
      default:
        // Parallelize in-memory storage for better performance
        await Promise.all(embeddings.map(e => {
          this.memoryStore.set(e.id, e);
          return Promise.resolve();
        }));
    }
  }

  /**
   * Semantic search using vector similarity
   */
  async semanticSearch(
    query: string,
    topK: number = 10,
    filter?: { topicId?: string; category?: string }
  ): Promise<SemanticQueryResult[]> {
    const queryVector = await this.generateEmbedding(query);

    switch (this.config.provider) {
      case 'pinecone':
        return this.searchPinecone(queryVector, topK, filter);
      case 'pgvector':
        return this.searchPgvector(queryVector, topK, filter);
      case 'memory':
      default:
        return this.searchMemory(queryVector, topK, filter);
    }
  }

  /**
   * Pinecone semantic search
   */
  private async searchPinecone(
    queryVector: number[],
    topK: number,
    filter?: { topicId?: string; category?: string }
  ): Promise<SemanticQueryResult[]> {
    const results = await this.pineconeIndex.query({
      vector: queryVector,
      topK,
      filter: filter ? {
        ...(filter.topicId && { topicId: filter.topicId }),
        ...(filter.category && { category: filter.category })
      } : undefined,
      includeMetadata: true
    });

    return results.matches?.map((match: any, idx: number) => ({
      memory: {
        sequence: match.metadata.sequence,
        timestamp: new Date(match.metadata.timestamp),
        content: match.metadata,
        topicId: match.metadata.topicId
      },
      similarity: match.score,
      ranking: idx + 1
    })) || [];
  }

  /**
   * pgvector semantic search
   */
  private async searchPgvector(
    queryVector: number[],
    topK: number,
    filter?: { topicId?: string; category?: string }
  ): Promise<SemanticQueryResult[]> {
    const client = await this.pgPool.connect();
    try {
      let query = `
        SELECT id, topic_id, sequence_number, metadata,
               1 - (embedding <=> $1::vector) as similarity
        FROM vera_embeddings
      `;
      const params: any[] = [`[${queryVector.join(',')}]`];
      
      if (filter?.topicId) {
        query += ` WHERE topic_id = $2`;
        params.push(filter.topicId);
      }
      if (filter?.category) {
        query += filter?.topicId ? ` AND metadata->>'category' = $3` : ` WHERE metadata->>'category' = $2`;
        params.push(filter.category);
      }
      
      query += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
      params.push(topK);

      const result = await client.query(query, params);

      return result.rows.map((row: any, idx: number) => ({
        memory: {
          sequence: row.sequence_number,
          timestamp: new Date(row.metadata.timestamp),
          content: row.metadata,
          topicId: row.topic_id
        },
        similarity: row.similarity,
        ranking: idx + 1
      }));
    } finally {
      client.release();
    }
  }

  /**
   * In-memory semantic search (cosine similarity)
   */
  private async searchMemory(
    queryVector: number[],
    topK: number,
    filter?: { topicId?: string; category?: string }
  ): Promise<SemanticQueryResult[]> {
    const results: SemanticQueryResult[] = [];

    for (const [id, embedding] of this.memoryStore) {
      // Apply filters
      if (filter?.topicId && embedding.metadata.topicId !== filter.topicId) continue;
      if (filter?.category && embedding.metadata.category !== filter.category) continue;

      const similarity = this.cosineSimilarity(queryVector, embedding.values);
      results.push({
        memory: {
          sequence: embedding.metadata.sequence,
          timestamp: new Date(embedding.metadata.timestamp),
          content: embedding.metadata,
          topicId: embedding.metadata.topicId
        },
        similarity,
        ranking: 0 // Set after sorting
      });
    }

    // Sort by similarity and take topK
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK).map((r, idx) => ({
      ...r,
      ranking: idx + 1
    }));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Hybrid search: combines keyword + semantic
   */
  async hybridSearch(
    query: string,
    options: {
      topK?: number;
      keywordWeight?: number;
      semanticWeight?: number;
    } = {}
  ): Promise<SemanticQueryResult[]> {
    const { topK = 10, keywordWeight = 0.3, semanticWeight = 0.7 } = options;

    // Get semantic results
    const semanticResults = await this.semanticSearch(query, topK * 2);

    // Get keyword results from HCS
    const keywordResults = await hcsBrainRetrieval.retrieveContextualMemories({
      query,
      limit: topK * 2
    });

    // Combine and rerank
    const combined = new Map<string, SemanticQueryResult>();

    // Add semantic results
    for (const result of semanticResults) {
      const key = `${result.memory.topicId}-${result.memory.sequence}`;
      combined.set(key, {
        ...result,
        similarity: result.similarity * semanticWeight
      });
    }

    // Add keyword results (normalize relevance score to 0-1)
    for (const memory of keywordResults) {
      const key = `${memory.topicId}-${memory.sequence}`;
      const normalizedScore = Math.min((memory.relevanceScore || 0) / 50, 1); // Assume max 50
      
      if (combined.has(key)) {
        // Combine scores
        const existing = combined.get(key)!;
        existing.similarity += normalizedScore * keywordWeight;
      } else {
        combined.set(key, {
          memory,
          similarity: normalizedScore * keywordWeight,
          ranking: 0
        });
      }
    }

    // Sort and return topK
    const sorted = Array.from(combined.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((r, idx) => ({ ...r, ranking: idx + 1 }));

    return sorted;
  }

  /**
   * Get sync progress
   */
  getSyncProgress(): SyncProgress | null {
    return this.syncProgress;
  }

  /**
   * Get vector database stats
   */
  async getVectorStats(): Promise<{
    totalVectors: number;
    dimensions: number;
    provider: string;
  }> {
    switch (this.config.provider) {
      case 'pinecone':
        const stats = await this.pineconeIndex.describeIndexStats();
        return {
          totalVectors: stats.totalVectorCount || 0,
          dimensions: this.config.dimension,
          provider: 'pinecone'
        };
      case 'pgvector':
        const client = await this.pgPool.connect();
        try {
          const result = await client.query('SELECT COUNT(*) as count FROM vera_embeddings');
          return {
            totalVectors: parseInt(result.rows[0].count),
            dimensions: this.config.dimension,
            provider: 'pgvector'
          };
        } finally {
          client.release();
        }
      case 'memory':
      default:
        return {
          totalVectors: this.memoryStore.size,
          dimensions: this.config.dimension,
          provider: 'memory'
        };
    }
  }
}

// Export singleton
export const hcsVectorSync = new HCSVectorSync();
export default hcsVectorSync;
