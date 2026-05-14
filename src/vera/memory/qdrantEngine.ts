/**
 * Vera Qdrant Vector Engine
 * 
 * Persistent, production-grade vector memory using Qdrant.
 * Replaces in-memory RAG with disk-persistent storage.
 * 
 * Features:
 * - HNSW indexing for fast similarity search
 * - Persistent storage (survives restarts)
 * - GPU-accelerated on CUDA (optional)
 * - Metadata filtering
 * - Collection management
 * 
 * @module vera/memory/qdrantEngine
 */

import { EventEmitter } from 'events';

export interface QdrantDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    title: string;
    source?: string;
    category?: string;
    createdAt: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface QdrantSearchResult {
  id: string;
  score: number;
  content: string;
  metadata: QdrantDocument['metadata'];
}

export interface QdrantStats {
  documents: number;
  vectors: number;
  dimension: number;
  size: string;
}

export class QdrantEngine extends EventEmitter {
  private serverUrl: string;
  private collectionName: string;
  private vectorSize: number;
  private isConnected: boolean = false;

  constructor(
    serverUrl: string = 'http://localhost:6333',
    collectionName: string = 'vera_memory',
    vectorSize: number = 768 // nomic-embed-text
  ) {
    super();
    this.serverUrl = serverUrl;
    this.collectionName = collectionName;
    this.vectorSize = vectorSize;
  }

  /**
   * Initialize connection and create collection if needed
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if Qdrant is running
      const health = await fetch(`${this.serverUrl}/healthz`);
      if (!health.ok) {
        console.warn('[Qdrant] Server not available, falling back to in-memory');
        return false;
      }

      // Check if collection exists
      const exists = await this.collectionExists();
      if (!exists) {
        await this.createCollection();
      }

      this.isConnected = true;
      console.log('[Qdrant] Connected to', this.serverUrl);
      this.emit('connected');
      return true;
    } catch (error) {
      console.warn('[Qdrant] Connection failed:', error);
      return false;
    }
  }

  /**
   * Check if collection exists
   */
  private async collectionExists(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.serverUrl}/collections/${this.collectionName}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Create collection with HNSW indexing
   */
  private async createCollection(): Promise<void> {
    const config = {
      vectors: {
        size: this.vectorSize,
        distance: 'Cosine',
        hnsw_config: {
          m: 16,              // Number of edges per node
          ef_construct: 100, // Build-time search depth
          full_scan_threshold: 10000,
        },
      },
      optimizers_config: {
        default_segment_number: 2,
        memmap_threshold: 20000,
        indexing_threshold: 1000,
      },
    };

    const response = await fetch(
      `${this.serverUrl}/collections/${this.collectionName}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create collection: ${error}`);
    }

    console.log('[Qdrant] Created collection:', this.collectionName);
  }

  /**
   * Add document with embedding
   */
  async addDocument(doc: QdrantDocument): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const payload = {
        points: [
          {
            id: doc.id,
            vector: doc.embedding,
            payload: {
              content: doc.content,
              metadata: doc.metadata,
            },
          },
        ],
      };

      const response = await fetch(
        `${this.serverUrl}/collections/${this.collectionName}/points?wait=true`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[Qdrant] Add document failed:', error);
      return false;
    }
  }

  /**
   * Search by vector similarity
   */
  async search(
    queryEmbedding: number[],
    topK: number = 5,
    filters?: Record<string, any>
  ): Promise<QdrantSearchResult[]> {
    if (!this.isConnected) return [];

    try {
      const payload: any = {
        vector: queryEmbedding,
        limit: topK,
        with_payload: true,
        with_vector: false,
      };

      if (filters) {
        payload.filter = this.buildFilter(filters);
      }

      const response = await fetch(
        `${this.serverUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) return [];

      const data = await response.json();
      
      return data.result.map((hit: any) => ({
        id: hit.id,
        score: hit.score,
        content: hit.payload.content,
        metadata: hit.payload.metadata,
      }));
    } catch (error) {
      console.error('[Qdrant] Search failed:', error);
      return [];
    }
  }

  /**
   * Build Qdrant filter from metadata
   */
  private buildFilter(filters: Record<string, any>): any {
    const conditions = [];
    
    for (const [key, value] of Object.entries(filters)) {
      conditions.push({
        key: `metadata.${key}`,
        match: { value },
      });
    }

    return conditions.length === 1
      ? { must: conditions }
      : { must: conditions };
  }

  /**
   * Delete document by ID
   */
  async deleteDocument(id: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const response = await fetch(
        `${this.serverUrl}/collections/${this.collectionName}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [id],
          }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[Qdrant] Delete failed:', error);
      return false;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<QdrantStats | null> {
    if (!this.isConnected) return null;

    try {
      const response = await fetch(
        `${this.serverUrl}/collections/${this.collectionName}`
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      const info = data.result;

      return {
        documents: info.vectors_count || 0,
        vectors: info.vectors_count || 0,
        dimension: info.config?.params?.vectors?.size || this.vectorSize,
        size: info.disk_data_size || '0B',
      };
    } catch (error) {
      console.error('[Qdrant] Stats failed:', error);
      return null;
    }
  }

  /**
   * Delete all documents (clear collection)
   */
  async clear(): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      // Delete and recreate collection
      await fetch(
        `${this.serverUrl}/collections/${this.collectionName}`,
        { method: 'DELETE' }
      );
      
      await this.createCollection();
      console.log('[Qdrant] Collection cleared');
      return true;
    } catch (error) {
      console.error('[Qdrant] Clear failed:', error);
      return false;
    }
  }

  /**
   * Scroll through all documents
   */
  async listDocuments(
    limit: number = 100,
    offset?: string
  ): Promise<{ documents: QdrantSearchResult[]; nextOffset?: string }> {
    if (!this.isConnected) return { documents: [] };

    try {
      const payload: any = {
        limit,
        with_payload: true,
        with_vector: false,
      };

      if (offset) {
        payload.offset = offset;
      }

      const response = await fetch(
        `${this.serverUrl}/collections/${this.collectionName}/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) return { documents: [] };

      const data = await response.json();

      const documents = data.result.points.map((point: any) => ({
        id: point.id,
        score: 1.0,
        content: point.payload.content,
        metadata: point.payload.metadata,
      }));

      return {
        documents,
        nextOffset: data.result.next_page_offset,
      };
    } catch (error) {
      console.error('[Qdrant] List failed:', error);
      return { documents: [] };
    }
  }

  /**
   * Check connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
export const qdrantEngine = new QdrantEngine();
