/**
 * AnythingLLM Integration for Vera
 * Replaces SQLite with proper semantic memory + vector search
 * Local-first: Runs on your 4060 Ti alongside Vera
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface AnythingLLMConfig {
  baseUrl: string;
  apiKey: string;
  workspace: string;
  threadSlug?: string;
}

export interface DocumentUpload {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchResult {
  id: string;
  text: string;
  score: number;
  source: string;
  metadata: Record<string, unknown>;
}

export interface ChatThread {
  slug: string;
  name: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    sentAt: string;
  }>;
}

/**
 * AnythingLLM Memory Provider
 * Full RAG pipeline with vector embeddings
 */
export class AnythingLLMIntegration extends EventEmitter {
  private config: AnythingLLMConfig;
  private available = false;
  private documentCache: Map<string, string> = new Map();

  constructor(config: Partial<AnythingLLMConfig> = {}) {
    super();
    
    this.config = {
      baseUrl: config.baseUrl || process.env.ANYTHINGLLM_URL || 'http://localhost:3001',
      apiKey: config.apiKey || process.env.ANYTHINGLLM_API_KEY || '',
      workspace: config.workspace || process.env.ANYTHINGLLM_WORKSPACE || 'vera-memory',
      threadSlug: config.threadSlug,
    };

    logger.info('AnythingLLM', {
      message: 'AnythingLLM integration initialized',
      workspace: this.config.workspace,
      url: this.config.baseUrl,
    });
  }

  /**
   * Check if AnythingLLM is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/health`);
      this.available = response.ok;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Upload document to vector database
   */
  async uploadDocument(doc: DocumentUpload): Promise<{ id: string; success: boolean }> {
    try {
      // Create workspace if doesn't exist
      await this.ensureWorkspace();

      const response = await fetch(
        `${this.config.baseUrl}/api/v1/workspace/${this.config.workspace}/document`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            title: doc.title,
            content: doc.content,
            metadata: doc.metadata || {},
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      
      // Cache locally
      this.documentCache.set(result.id || doc.title, doc.content);

      this.emit('document:uploaded', { id: result.id, title: doc.title });
      
      logger.debug('AnythingLLM', {
        message: 'Document uploaded',
        title: doc.title,
        id: result.id,
      });

      return { id: result.id || doc.title, success: true };
    } catch (error) {
      logger.error('AnythingLLM', {
        message: 'Document upload failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Semantic search across all documents
   */
  async semanticSearch(
    query: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/workspace/${this.config.workspace}/search`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ query, limit }),
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const results = await response.json();
      
      return results.map((r: unknown) => ({
        id: (r as Record<string, string>).id || '',
        text: (r as Record<string, string>).text || '',
        score: (r as Record<string, number>).score || 0,
        source: (r as Record<string, string>).source || '',
        metadata: (r as Record<string, Record<string, unknown>>).metadata || {},
      }));
    } catch (error) {
      logger.error('AnythingLLM', {
        message: 'Semantic search failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Store conversation turn
   */
  async storeConversation(
    role: 'user' | 'assistant',
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const doc: DocumentUpload = {
      title: `conversation-${Date.now()}`,
      content: `[${role.toUpperCase()}] ${content}`,
      metadata: {
        type: 'conversation',
        role,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    await this.uploadDocument(doc);
  }

  /**
   * Get relevant context for RAG
   */
  async getContextForRAG(
    query: string,
    maxTokens: number = 4000
  ): Promise<{
    context: string;
    sources: string[];
    tokenCount: number;
  }> {
    const results = await this.semanticSearch(query, 10);
    
    let context = '';
    const sources: string[] = [];
    let tokenCount = 0;

    for (const result of results) {
      const text = result.text;
      const estimatedTokens = Math.ceil(text.length / 4);
      
      if (tokenCount + estimatedTokens > maxTokens) break;
      
      context += `\n[Source: ${result.source}]\n${text}\n`;
      sources.push(result.source);
      tokenCount += estimatedTokens;
    }

    return { context, sources: [...new Set(sources)], tokenCount };
  }

  /**
   * Create or get chat thread
   */
  async createThread(name: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/workspace/${this.config.workspace}/thread/new`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ name }),
        }
      );

      if (!response.ok) {
        throw new Error(`Thread creation failed: ${response.status}`);
      }

      const result = await response.json();
      return result.thread.slug;
    } catch (error) {
      logger.error('AnythingLLM', {
        message: 'Thread creation failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Chat with memory (RAG-enabled)
   */
  async chat(message: string, threadSlug?: string): Promise<{
    response: string;
    sources: string[];
  }> {
    const slug = threadSlug || this.config.threadSlug;
    
    if (!slug) {
      throw new Error('No thread slug provided');
    }

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/workspace/${this.config.workspace}/thread/${slug}/chat`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ message }),
        }
      );

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        response: result.textResponse || '',
        sources: result.sources || [],
      };
    } catch (error) {
      logger.error('AnythingLLM', {
        message: 'Chat failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(docId: string): Promise<void> {
    try {
      await fetch(
        `${this.config.baseUrl}/api/v1/workspace/${this.config.workspace}/document/${docId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        }
      );

      this.documentCache.delete(docId);
    } catch (error) {
      logger.error('AnythingLLM', {
        message: 'Document deletion failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all documents in workspace
   */
  async listDocuments(): Promise<Array<{ id: string; title: string; created: string }>> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/workspace/${this.config.workspace}/documents`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return [];
      }

      const docs = await response.json();
      return docs.map((d: unknown) => ({
        id: (d as Record<string, string>).id,
        title: (d as Record<string, string>).title,
        created: (d as Record<string, string>).createdAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Private: Ensure workspace exists
   */
  private async ensureWorkspace(): Promise<void> {
    try {
      await fetch(
        `${this.config.baseUrl}/api/v1/workspace/new`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            name: this.config.workspace,
            slug: this.config.workspace.toLowerCase().replace(/\s+/g, '-'),
          }),
        }
      );
    } catch {
      // Workspace might already exist, that's fine
    }
  }

  /**
   * Private: Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }
}

// Export singleton
export const anythingLLM = new AnythingLLMIntegration();
