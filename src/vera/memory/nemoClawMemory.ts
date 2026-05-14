/**
 * NVIDIA NemoClaw Memory Integration
 * Personal/local AI memory with RAG, vector storage, and context management
 * Fully sovereign - runs on local RTX/DGX hardware
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface MemoryDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    timestamp: Date;
    type: 'conversation' | 'fact' | 'insight' | 'task' | 'carbon';
    tags: string[];
    importance: number; // 0-1
    agentId?: string;
    sessionId?: string;
  };
  relationships: string[]; // Related document IDs
}

export interface MemoryQuery {
  query: string;
  embedding?: number[];
  filters?: {
    types?: string[];
    tags?: string[];
    agentId?: string;
    sessionId?: string;
    timeRange?: { from: Date; to: Date };
    minImportance?: number;
  };
  limit?: number;
  similarityThreshold?: number;
}

export interface MemoryQueryResult {
  document: MemoryDocument;
  similarity: number;
  contextRelevance: number;
}

export interface RAGContext {
  documents: MemoryDocument[];
  summary: string;
  totalTokens: number;
  sources: string[];
}

/**
 * NemoClaw Memory Engine
 * Vector-based semantic memory with RAG capabilities
 */
export class NemoClawMemory extends EventEmitter {
  private documents: Map<string, MemoryDocument> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private index: Map<string, Set<string>> = new Map(); // tag -> docIds
  private session: string;
  private maxDocuments: number;

  constructor(sessionId: string = 'default', maxDocs: number = 10000) {
    super();
    this.session = sessionId;
    this.maxDocuments = maxDocs;
    logger.info('NemoClawMemory', {
      message: 'NemoClaw memory initialized',
      session: sessionId,
      maxDocuments: maxDocs,
    });
  }

  /**
   * Store a document in memory
   */
  async store(document: Omit<MemoryDocument, 'id'>): Promise<MemoryDocument> {
    const id = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const doc: MemoryDocument = { ...document, id };

    // Store document
    this.documents.set(id, doc);

    // Store embedding if provided
    if (doc.embedding) {
      this.embeddings.set(id, doc.embedding);
    }

    // Index by tags
    for (const tag of doc.metadata.tags) {
      if (!this.index.has(tag)) {
        this.index.set(tag, new Set());
      }
      this.index.get(tag)!.add(id);
    }

    // Index by type
    const typeTag = `type:${doc.metadata.type}`;
    if (!this.index.has(typeTag)) {
      this.index.set(typeTag, new Set());
    }
    this.index.get(typeTag)!.add(id);

    // Index by agent
    if (doc.metadata.agentId) {
      const agentTag = `agent:${doc.metadata.agentId}`;
      if (!this.index.has(agentTag)) {
        this.index.set(agentTag, new Set());
      }
      this.index.get(agentTag)!.add(id);
    }

    // Prune if over limit
    if (this.documents.size > this.maxDocuments) {
      this.pruneOldDocuments();
    }

    this.emit('document:stored', { id, document: doc });
    
    logger.debug('NemoClawMemory', {
      message: 'Document stored',
      id,
      type: doc.metadata.type,
      importance: doc.metadata.importance,
    });

    return doc;
  }

  /**
   * Query memory with semantic search
   */
  async query(request: MemoryQuery): Promise<MemoryQueryResult[]> {
    const startTime = Date.now();
    const results: MemoryQueryResult[] = [];

    // Get candidate documents from index
    let candidates: Set<string> = new Set();
    
    if (request.filters?.tags && request.filters.tags.length > 0) {
      // Intersection of tag sets
      for (const tag of request.filters.tags) {
        const tagDocs = this.index.get(tag);
        if (tagDocs) {
          if (candidates.size === 0) {
            candidates = new Set(tagDocs);
          } else {
            candidates = new Set([...candidates].filter(x => tagDocs.has(x)));
          }
        }
      }
    }

    if (request.filters?.types && request.filters.types.length > 0) {
      const typeDocs = new Set<string>();
      for (const type of request.filters.types) {
        const docs = this.index.get(`type:${type}`);
        if (docs) {
          docs.forEach(id => typeDocs.add(id));
        }
      }
      if (candidates.size === 0) {
        candidates = typeDocs;
      } else {
        candidates = new Set([...candidates].filter(x => typeDocs.has(x)));
      }
    }

    // If no candidates from filters, use all documents
    if (candidates.size === 0) {
      candidates = new Set(this.documents.keys());
    }

    // Score and rank candidates
    for (const docId of candidates) {
      const doc = this.documents.get(docId);
      if (!doc) continue;

      // Filter by time range
      if (request.filters?.timeRange) {
        const ts = doc.metadata.timestamp.getTime();
        if (ts < request.filters.timeRange.from.getTime() ||
            ts > request.filters.timeRange.to.getTime()) {
          continue;
        }
      }

      // Filter by importance
      if (request.filters?.minImportance !== undefined) {
        if (doc.metadata.importance < request.filters.minImportance) {
          continue;
        }
      }

      // Filter by agent
      if (request.filters?.agentId) {
        if (doc.metadata.agentId !== request.filters.agentId) {
          continue;
        }
      }

      // Filter by session
      if (request.filters?.sessionId) {
        if (doc.metadata.sessionId !== request.filters.sessionId) {
          continue;
        }
      }

      // Calculate similarity (cosine if embeddings available, otherwise keyword)
      let similarity = 0;
      if (request.embedding && doc.embedding) {
        similarity = this.cosineSimilarity(request.embedding, doc.embedding);
      } else {
        similarity = this.keywordSimilarity(request.query, doc.content);
      }

      // Boost by importance
      similarity *= (0.7 + 0.3 * doc.metadata.importance);

      results.push({
        document: doc,
        similarity,
        contextRelevance: similarity,
      });
    }

    // Sort by similarity and apply threshold
    const threshold = request.similarityThreshold ?? 0.3;
    const filtered = results
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, request.limit ?? 10);

    logger.debug('NemoClawMemory', {
      message: 'Query completed',
      query: request.query.substring(0, 50),
      candidates: candidates.size,
      results: filtered.length,
      latencyMs: Date.now() - startTime,
    });

    return filtered;
  }

  /**
   * Retrieve context for RAG (Retrieval-Augmented Generation)
   */
  async retrieveContext(
    query: string,
    queryEmbedding?: number[],
    maxTokens: number = 4000
  ): Promise<RAGContext> {
    const results = await this.query({
      query,
      embedding: queryEmbedding,
      limit: 20,
      similarityThreshold: 0.5,
    });

    // Build context within token budget
    const documents: MemoryDocument[] = [];
    let totalTokens = 0;
    const sources: Set<string> = new Set();

    for (const result of results) {
      const docTokens = this.estimateTokens(result.document.content);
      if (totalTokens + docTokens > maxTokens) break;

      documents.push(result.document);
      totalTokens += docTokens;
      sources.add(result.document.metadata.source);
    }

    // Generate summary
    const summary = this.generateContextSummary(documents, query);

    return {
      documents,
      summary,
      totalTokens,
      sources: Array.from(sources),
    };
  }

  /**
   * Store conversation turn
   */
  async storeConversation(
    role: 'user' | 'assistant' | 'system',
    content: string,
    agentId?: string,
    tags: string[] = []
  ): Promise<MemoryDocument> {
    return this.store({
      content: `[${role}] ${content}`,
      metadata: {
        source: 'conversation',
        timestamp: new Date(),
        type: 'conversation',
        tags: ['conversation', role, ...tags],
        importance: role === 'user' ? 0.8 : 0.6,
        agentId,
        sessionId: this.session,
      },
      relationships: [],
    });
  }

  /**
   * Store carbon insight
   */
  async storeCarbonInsight(
    content: string,
    category: string,
    importance: number = 0.7
  ): Promise<MemoryDocument> {
    return this.store({
      content,
      metadata: {
        source: 'carbon-analysis',
        timestamp: new Date(),
        type: 'carbon',
        tags: ['carbon', 'insight', category],
        importance,
      },
      relationships: [],
    });
  }

  /**
   * Link documents by relationship
   */
  linkDocuments(docId1: string, docId2: string, relationType: string): void {
    const doc1 = this.documents.get(docId1);
    const doc2 = this.documents.get(docId2);

    if (doc1 && doc2) {
      doc1.relationships.push(`${relationType}:${docId2}`);
      doc2.relationships.push(`${relationType}:${docId1}`);
      
      this.emit('documents:linked', { docId1, docId2, relationType });
    }
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalDocuments: number;
    byType: Record<string, number>;
    byTag: Record<string, number>;
    averageImportance: number;
    memoryAge: number; // ms since oldest document
  } {
    const byType: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    let totalImportance = 0;
    let oldestTimestamp = Date.now();

    for (const doc of this.documents.values()) {
      // Count by type
      byType[doc.metadata.type] = (byType[doc.metadata.type] || 0) + 1;

      // Count by tag
      for (const tag of doc.metadata.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      totalImportance += doc.metadata.importance;

      const ts = doc.metadata.timestamp.getTime();
      if (ts < oldestTimestamp) {
        oldestTimestamp = ts;
      }
    }

    return {
      totalDocuments: this.documents.size,
      byType,
      byTag,
      averageImportance: this.documents.size > 0 ? totalImportance / this.documents.size : 0,
      memoryAge: Date.now() - oldestTimestamp,
    };
  }

  /**
   * Export memory for backup/transfer
   */
  export(): MemoryDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Import memory from backup
   */
  async import(documents: MemoryDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
      if (doc.embedding) {
        this.embeddings.set(doc.id, doc.embedding);
      }
    }
    this.emit('memory:imported', { count: documents.length });
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.documents.clear();
    this.embeddings.clear();
    this.index.clear();
    this.emit('memory:cleared');
  }

  /**
   * Prune old documents when over limit
   */
  private pruneOldDocuments(): void {
    const sorted = Array.from(this.documents.values())
      .sort((a, b) => {
        // Keep high importance, recent documents
        const scoreA = a.metadata.importance * 0.6 + 
          (a.metadata.timestamp.getTime() / Date.now()) * 0.4;
        const scoreB = b.metadata.importance * 0.6 + 
          (b.metadata.timestamp.getTime() / Date.now()) * 0.4;
        return scoreA - scoreB;
      });

    // Remove bottom 10%
    const toRemove = Math.ceil(sorted.length * 0.1);
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      this.documents.delete(sorted[i].id);
      this.embeddings.delete(sorted[i].id);
    }

    logger.info('NemoClawMemory', {
      message: 'Pruned old documents',
      removed: toRemove,
      remaining: this.documents.size,
    });
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Simple keyword similarity (fallback when no embeddings)
   */
  private keywordSimilarity(query: string, content: string): number {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    
    let matches = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) matches++;
    }
    
    return matches / queryWords.size;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate context summary
   */
  private generateContextSummary(docs: MemoryDocument[], query: string): string {
    const types = new Set(docs.map(d => d.metadata.type));
    const timeRange = {
      oldest: Math.min(...docs.map(d => d.metadata.timestamp.getTime())),
      newest: Math.max(...docs.map(d => d.metadata.timestamp.getTime())),
    };
    
    return `Context: ${docs.length} documents retrieved for "${query.substring(0, 30)}...". ` +
      `Types: ${Array.from(types).join(', ')}. ` +
      `Time span: ${Math.round((timeRange.newest - timeRange.oldest) / 1000 / 60)} minutes.`;
  }
}

// Export singleton instance
export const nemoClawMemory = new NemoClawMemory('vera-main', 50000);
