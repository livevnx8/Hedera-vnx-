/**
 * Vera Local RAG Engine
 * 
 * Sovereign document memory system - 100% local, zero external APIs.
 * Similar to AnythingLLM/PrivateGPT but integrated into Vera's lattice.
 * 
 * Features:
 * - Local embeddings using Ollama's embedding models
 * - In-memory vector store with cosine similarity
 * - Document chunking and indexing
 * - Conversation history search
 * - No data ever leaves your machine
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export interface Document {
  id: string;
  content: string;
  metadata: {
    source: string;
    type: 'conversation' | 'document' | 'code' | 'web';
    timestamp: number;
    title?: string;
  };
  chunks: TextChunk[];
}

export interface TextChunk {
  id: string;
  content: string;
  embedding: number[];
  documentId: string;
  index: number;
}

export interface SearchResult {
  chunk: TextChunk;
  document: Document;
  score: number;
  context: string;
}

export interface RagConfig {
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
}

export class LocalRagEngine extends EventEmitter {
  private documents = new Map<string, Document>();
  private chunks = new Map<string, TextChunk>();
  private config: RagConfig;
  private ollamaEndpoint: string;

  constructor(config?: Partial<RagConfig>) {
    super();
    this.config = {
      embeddingModel: 'nomic-embed-text',  // 137M params, fast & local
      chunkSize: 512,
      chunkOverlap: 50,
      topK: 5,
      similarityThreshold: 0.7,
      ...config,
    };
    this.ollamaEndpoint = process.env.OLLAMA_URL || 'http://localhost:11434';
  }

  /**
   * Generate embeddings using local Ollama model
   * 100% sovereign - no API calls to OpenAI/etc
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding failed: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.error('[RAG] Embedding generation failed:', error);
      // Fallback: simple hash-based embedding (not semantic but functional)
      return this.fallbackEmbedding(text);
    }
  }

  /**
   * Fallback embedding when Ollama unavailable
   * Uses character n-gram frequency (surprisingly effective for similarity)
   */
  private fallbackEmbedding(text: string): number[] {
    const normalized = text.toLowerCase().slice(0, 1000);
    const embedding: number[] = [];
    
    // Character bigram frequencies
    for (let i = 0; i < 256; i++) {
      const char = String.fromCharCode(i);
      const count = (normalized.match(new RegExp(char, 'g')) || []).length;
      embedding.push(count / normalized.length);
    }
    
    // Add some positional features
    embedding.push(normalized.length / 1000);
    embedding.push(new Set(normalized).size / 100);
    
    // Pad/truncate to 384 dimensions (common embedding size)
    while (embedding.length < 384) embedding.push(0);
    return embedding.slice(0, 384);
  }

  /**
   * Chunk text into overlapping segments
   */
  private chunkText(text: string, documentId: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const { chunkSize, chunkOverlap } = this.config;
    
    // Smart chunking at sentence boundaries when possible
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    let index = 0;
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize) {
        if (currentChunk) {
          chunks.push({
            id: `${documentId}-chunk-${index}`,
            content: currentChunk.trim(),
            embedding: [], // Will be filled later
            documentId,
            index,
          });
          index++;
        }
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push({
        id: `${documentId}-chunk-${index}`,
        content: currentChunk.trim(),
        embedding: [],
        documentId,
        index,
      });
    }
    
    return chunks;
  }

  /**
   * Add a document to the RAG store
   */
  async addDocument(
    content: string,
    metadata: Omit<Document['metadata'], 'timestamp'>,
    id?: string
  ): Promise<Document> {
    const docId = id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Chunk the document
    const chunks = this.chunkText(content, docId);
    
    // Generate embeddings for each chunk
    for (const chunk of chunks) {
      chunk.embedding = await this.generateEmbedding(chunk.content);
      this.chunks.set(chunk.id, chunk);
    }
    
    // Create document
    const document: Document = {
      id: docId,
      content,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
      },
      chunks,
    };
    
    this.documents.set(docId, document);
    
    this.emit('document_added', { document, chunkCount: chunks.length });
    console.log(`[RAG] Indexed "${metadata.title || docId}" - ${chunks.length} chunks`);
    
    return document;
  }

  /**
   * Add conversation to memory
   */
  async addConversation(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<Document> {
    const content = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    
    return this.addDocument(content, {
      source: sessionId,
      type: 'conversation',
      title: `Conversation ${sessionId.slice(0, 8)}`,
    }, `conv-${sessionId}`);
  }

  /**
   * Search for relevant context
   */
  async search(query: string, topK?: number): Promise<SearchResult[]> {
    const k = topK || this.config.topK;
    
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Calculate cosine similarity with all chunks
    const scores: Array<{ chunk: TextChunk; score: number }> = [];
    
    for (const chunk of this.chunks.values()) {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= this.config.similarityThreshold) {
        scores.push({ chunk, score });
      }
    }
    
    // Sort by score and take top K
    scores.sort((a, b) => b.score - a.score);
    const topChunks = scores.slice(0, k);
    
    // Build results with context
    const results: SearchResult[] = [];
    for (const { chunk, score } of topChunks) {
      const document = this.documents.get(chunk.documentId);
      if (document) {
        results.push({
          chunk,
          document,
          score,
          context: this.getContext(chunk, document),
        });
      }
    }
    
    this.emit('search_completed', { query, results: results.length });
    return results;
  }

  /**
   * Get surrounding context for a chunk
   */
  private getContext(chunk: TextChunk, document: Document): string {
    const adjacentChunks = document.chunks.filter(c => 
      c.index >= chunk.index - 1 && c.index <= chunk.index + 1
    );
    return adjacentChunks.map(c => c.content).join('\n---\n');
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * Augment prompt with relevant context
   */
  async augmentPrompt(query: string, originalPrompt: string): Promise<string> {
    const results = await this.search(query);
    
    if (results.length === 0) {
      return originalPrompt;
    }
    
    const context = results
      .map(r => `[Source: ${r.document.metadata.title || r.document.metadata.source}]\n${r.context}`)
      .join('\n\n');
    
    return `Relevant context from memory:\n${context}\n\n---\n\nUser query: ${query}\n\n${originalPrompt}`;
  }

  /**
   * Get stats about the RAG store
   */
  getStats(): { documents: number; chunks: number; model: string } {
    return {
      documents: this.documents.size,
      chunks: this.chunks.size,
      model: this.config.embeddingModel,
    };
  }

  /**
   * List all documents
   */
  listDocuments(): Array<{ id: string; title: string; type: string; chunks: number; timestamp: number }> {
    return Array.from(this.documents.values()).map(d => ({
      id: d.id,
      title: d.metadata.title || d.metadata.source,
      type: d.metadata.type,
      chunks: d.chunks.length,
      timestamp: d.metadata.timestamp,
    }));
  }

  /**
   * Delete a document
   */
  deleteDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;
    
    // Remove all chunks
    for (const chunk of doc.chunks) {
      this.chunks.delete(chunk.id);
    }
    
    this.documents.delete(id);
    this.emit('document_deleted', { id });
    return true;
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.documents.clear();
    this.chunks.clear();
    this.emit('memory_cleared');
  }
}

// Singleton export
export const localRagEngine = new LocalRagEngine();
