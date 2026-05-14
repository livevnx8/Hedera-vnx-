/**
 * Vera Hybrid Memory Engine
 * 
 * Intelligent memory layer that uses Qdrant (persistent) when available,
 * falls back to in-memory LocalRagEngine when Qdrant is offline.
 * 
 * Features:
 * - Automatic backend selection
 * - Document chunking (unified)
 * - Embedding generation via Ollama/nomic-embed-text
 * - Metadata filtering
 * - Self-knowledge auto-loading
 * 
 * @module vera/memory/hybridMemory
 */

import { EventEmitter } from 'events';
import { QdrantEngine, QdrantDocument, QdrantSearchResult } from './qdrantEngine.js';
import { localRagEngine, type Document } from './localRagEngine.js';

export interface MemoryDocument {
  id: string;
  content: string;
  metadata: {
    title: string;
    source?: string;
    category?: 'self_knowledge' | 'conversation' | 'knowledge_base' | 'file';
    createdAt: string;
  };
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  metadata: MemoryDocument['metadata'];
}

export interface MemoryStats {
  backend: 'qdrant' | 'local';
  documents: number;
  chunks: number;
  size: string;
  dimension: number;
}

export class HybridMemoryEngine extends EventEmitter {
  private qdrant: QdrantEngine;
  private useQdrant: boolean = false;
  private embeddingModel: string = 'nomic-embed-text';
  private ollamaUrl: string = 'http://localhost:11434';

  constructor(
    ollamaUrl?: string,
    embeddingModel?: string,
    qdrantUrl?: string
  ) {
    super();
    this.ollamaUrl = ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.embeddingModel = embeddingModel || process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    
    this.qdrant = new QdrantEngine(
      qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333',
      'vera_memory',
      768 // nomic-embed-text dimension
    );
  }

  /**
   * Initialize memory engine
   */
  async initialize(): Promise<void> {
    // Try Qdrant first
    const qdrantReady = await this.qdrant.initialize();
    if (qdrantReady) {
      this.useQdrant = true;
      console.log('[HybridMemory] Using Qdrant backend');
    } else {
      this.useQdrant = false;
      console.log('[HybridMemory] Using local in-memory backend');
    }

    this.emit('ready', { backend: this.useQdrant ? 'qdrant' : 'local' });
  }

  /**
   * Generate embedding via Ollama
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding failed: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding || null;
    } catch (error) {
      console.error('[HybridMemory] Embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Chunk document into segments
   */
  private chunkDocument(content: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = [];
    const sentences = content.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let lastOverlap = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        lastOverlap = currentChunk.slice(-overlap);
        currentChunk = lastOverlap + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Add document to memory
   */
  async addDocument(doc: MemoryDocument): Promise<boolean> {
    const chunks = this.chunkDocument(doc.content);
    const timestamp = new Date().toISOString();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = `${doc.id}_chunk_${i}`;
      
      // Generate embedding
      const embedding = await this.generateEmbedding(chunk);
      if (!embedding) {
        console.warn(`[HybridMemory] Failed to embed chunk ${i} of ${doc.id}`);
        continue;
      }

      if (this.useQdrant) {
        const qdrantDoc: QdrantDocument = {
          id,
          content: chunk,
          embedding,
          metadata: {
            title: doc.metadata.title,
            source: doc.metadata.source,
            category: doc.metadata.category,
            createdAt: timestamp,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        };

        await this.qdrant.addDocument(qdrantDoc);
      } else {
        await localRagEngine.addDocument(
          chunk,
          {
            title: doc.metadata.title,
            source: doc.metadata.source || 'memory',
            type: 'document',
          },
          id
        );
      }
    }

    this.emit('document_added', { id: doc.id, chunks: chunks.length });
    return true;
  }

  /**
   * Search memory by query
   */
  async search(
    query: string,
    topK: number = 5,
    filters?: { category?: string }
  ): Promise<MemorySearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    if (!queryEmbedding) {
      return [];
    }

    if (this.useQdrant) {
      const results = await this.qdrant.search(queryEmbedding, topK, filters);
      return results.map(r => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata as any,
      }));
    } else {
      const results = await localRagEngine.search(query, topK);
      return results.map(r => ({
        id: r.chunk.id,
        content: r.context,
        score: r.score,
        metadata: {
          title: r.document.metadata.title,
          source: r.document.metadata.source,
          category: r.document.metadata.type as any,
          createdAt: new Date(r.document.metadata.timestamp).toISOString(),
        },
      }));
    }
  }

  /**
   * Delete document by ID
   */
  async deleteDocument(id: string): Promise<boolean> {
    if (this.useQdrant) {
      // Get all chunk IDs for this document
      const { documents } = await this.qdrant.listDocuments(1000);
      const chunkIds = documents
        .filter(d => d.id.startsWith(`${id}_chunk_`))
        .map(d => d.id);
      
      for (const chunkId of chunkIds) {
        await this.qdrant.deleteDocument(chunkId);
      }
    } else {
      await localRagEngine.deleteDocument(id);
    }

    this.emit('document_deleted', { id });
    return true;
  }

  /**
   * List all documents
   */
  async listDocuments(): Promise<{ id: string; title: string; chunks: number }[]> {
    if (this.useQdrant) {
      const { documents } = await this.qdrant.listDocuments(1000);
      
      // Group by base document ID
      const docMap = new Map<string, { title: string; chunks: number }>();
      
      for (const doc of documents) {
        const baseId = doc.id.split('_chunk_')[0];
        const existing = docMap.get(baseId);
        if (existing) {
          existing.chunks++;
        } else {
          docMap.set(baseId, {
            title: doc.metadata.title,
            chunks: 1,
          });
        }
      }

      return Array.from(docMap.entries()).map(([id, data]) => ({
        id,
        title: data.title,
        chunks: data.chunks,
      }));
    } else {
      return localRagEngine.listDocuments();
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    if (this.useQdrant) {
      const stats = await this.qdrant.getStats();
      if (stats) {
        return {
          backend: 'qdrant',
          documents: stats.documents,
          chunks: stats.vectors,
          size: stats.size,
          dimension: stats.dimension,
        };
      }
    }

    const localStats = localRagEngine.getStats();
    return {
      backend: 'local',
      documents: localStats.documents,
      chunks: localStats.chunks,
      size: 'in-memory',
      dimension: 768,
    };
  }

  /**
   * Clear all memory
   */
  async clear(): Promise<boolean> {
    if (this.useQdrant) {
      await this.qdrant.clear();
    }
    await localRagEngine.clear();

    this.emit('cleared');
    return true;
  }

  /**
   * Get current backend
   */
  get backend(): 'qdrant' | 'local' {
    return this.useQdrant ? 'qdrant' : 'local';
  }
}

// Singleton instance
export const hybridMemory = new HybridMemoryEngine();
