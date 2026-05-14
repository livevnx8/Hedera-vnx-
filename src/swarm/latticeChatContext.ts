/**
 * VERA LATTICE CHAT CONTEXT SYSTEM
 * Cross-session conversation memory using geometric lattice storage
 * 
 * Features:
 * - Conversation embedding and storage
 * - Intent-based context recall across sessions
 * - Topic-aware context retrieval
 * - Semantic conversation threading
 * - HCS-persistent chat history
 */

import { logger } from '../monitoring/logger.js';
import { veraHCS } from '../dovu/veraHCS.js';
import { veraLatticeMemory, LatticeMemory, LatticeQuery } from './latticeMemory.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sessionId: string;
  intent?: string;
  embedding?: number[];
  topics?: string[];
}

export interface ChatSession {
  id: string;
  userId: string;
  startTime: number;
  lastActive: number;
  messages: ChatMessage[];
  contextEmbedding: number[];
  dominantTopics: string[];
  hcsSequence?: number;
}

export interface ContextRecallResult {
  relevantSessions: ChatSession[];
  relevantMessages: ChatMessage[];
  contextScore: number;
  suggestedContinuations: string[];
  topicAlignment: number;
}

export class VeraLatticeChatContext {
  private sessions: Map<string, ChatSession> = new Map();
  private messageIndex: Map<string, ChatMessage> = new Map();
  private topicIndex: Map<string, Set<string>> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private embeddingDim: number = 128;

  async initialize(): Promise<void> {
    logger.info('VeraLatticeChatContext', { 
      message: 'Initializing lattice-based chat context system' 
    });
    await veraHCS.initialize();
    await veraLatticeMemory.initialize();
  }

  /**
   * Store a chat message with lattice embedding
   */
  async storeMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    intent?: string
  ): Promise<ChatMessage> {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId, userId);
      this.sessions.set(sessionId, session);
      
      // Index user sessions
      if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, new Set());
      }
      this.userSessions.get(userId)!.add(sessionId);
    }

    // Generate embedding from content
    const embedding = this.contentToEmbedding(content);
    
    // Extract topics
    const topics = this.extractTopics(content);

    const message: ChatMessage = {
      id: messageId,
      role,
      content,
      timestamp: Date.now(),
      sessionId,
      intent: intent || this.inferIntent(content),
      embedding,
      topics
    };

    // Store message
    session.messages.push(message);
    session.lastActive = Date.now();
    this.messageIndex.set(messageId, message);

    // Index by topics
    topics.forEach(topic => this.indexTopic(topic, messageId));

    // Update session context embedding (rolling average)
    session.contextEmbedding = this.updateSessionContext(session);
    session.dominantTopics = this.calculateDominantTopics(session);

    // Store in lattice memory for cross-session recall
    await veraLatticeMemory.storeMemory(
      `chat-${userId}`,
      message.intent || 'conversation',
      embedding,
      {
        messageId,
        sessionId,
        content: content.slice(0, 200),
        role,
        topics,
        timestamp: message.timestamp
      }
    );

    // Log to HCS for persistence
    await this.logToHCS('chat_message', {
      messageId,
      sessionId,
      userId,
      role,
      intent: message.intent,
      topics,
      timestamp: message.timestamp
    });

    logger.debug('VeraLatticeChatContext', { 
      messageId, 
      sessionId, 
      intent: message.intent,
      message: 'Chat message stored' 
    });

    return message;
  }

  /**
   * Recall relevant context from previous sessions
   * Uses geometric similarity to find related conversations
   */
  async recallContext(
    currentSessionId: string,
    userId: string,
    query: string,
    maxResults: number = 5
  ): Promise<ContextRecallResult> {
    const queryEmbedding = this.contentToEmbedding(query);
    const queryTopics = this.extractTopics(query);

    // Get user's previous sessions
    const userSessionIds = this.userSessions.get(userId) || new Set();
    const previousSessions = Array.from(userSessionIds)
      .filter(id => id !== currentSessionId)
      .map(id => this.sessions.get(id))
      .filter((s): s is ChatSession => !!s);

    // Score sessions by geometric similarity
    const scoredSessions = previousSessions.map(session => ({
      session,
      score: this.cosineSimilarity(queryEmbedding, session.contextEmbedding),
      topicOverlap: this.calculateTopicOverlap(queryTopics, session.dominantTopics)
    }));

    // Sort by combined score
    scoredSessions.sort((a, b) => 
      (b.score + b.topicOverlap) - (a.score + a.topicOverlap)
    );

    const relevantSessions = scoredSessions.slice(0, maxResults).map(s => s.session);

    // Find relevant messages within sessions
    const relevantMessages: ChatMessage[] = [];
    for (const session of relevantSessions) {
      const scoredMessages = session.messages.map(msg => ({
        msg,
        score: this.cosineSimilarity(queryEmbedding, msg.embedding || [])
      }));
      
      scoredMessages.sort((a, b) => b.score - a.score);
      relevantMessages.push(...scoredMessages.slice(0, 3).map(m => m.msg));
    }

    // Calculate overall context alignment
    const contextScore = scoredSessions.length > 0 ? scoredSessions[0].score : 0;
    const topicAlignment = scoredSessions.length > 0 ? scoredSessions[0].topicOverlap : 0;

    // Generate suggested continuations based on recalled context
    const suggestedContinuations = this.generateSuggestions(
      query, 
      relevantMessages,
      queryTopics
    );

    logger.debug('VeraLatticeChatContext', {
      userId,
      currentSessionId,
      sessionsRecalled: relevantSessions.length,
      messagesRecalled: relevantMessages.length,
      contextScore,
      message: 'Context recalled'
    });

    return {
      relevantSessions,
      relevantMessages,
      contextScore,
      suggestedContinuations,
      topicAlignment
    };
  }

  /**
   * Get conversation thread across sessions
   * Finds semantically related conversations
   */
  async getConversationThread(
    userId: string,
    topic: string,
    maxSessions: number = 10
  ): Promise<ChatSession[]> {
    const queryEmbedding = this.contentToEmbedding(topic);
    
    // Use lattice memory for broader recall
    const latticeRecall = await veraLatticeMemory.recallByIntent(topic, 0.6);
    
    const relevantSessionIds = new Set<string>();
    
    // Extract session IDs from lattice memories
    latticeRecall.memories.forEach(memory => {
      if (memory.context?.sessionId) {
        relevantSessionIds.add(memory.context.sessionId);
      }
    });

    // Get full session objects
    const sessions = Array.from(relevantSessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is ChatSession => !!s)
      .filter(s => s.messages.length > 0);

    // Score by relevance to topic
    const scoredSessions = sessions.map(session => ({
      session,
      score: this.cosineSimilarity(queryEmbedding, session.contextEmbedding)
    }));

    scoredSessions.sort((a, b) => b.score - a.score);

    return scoredSessions.slice(0, maxSessions).map(s => s.session);
  }

  /**
   * Continue a previous conversation
   * Retrieves full context from a past session
   */
  async continueConversation(
    sessionId: string,
    userId: string
  ): Promise<ChatSession | null> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      // Try to recall from lattice memory
      const latticeRecall = await veraLatticeMemory.recallByIntent(
        `session-${sessionId}`,
        0.8
      );
      
      if (latticeRecall.memories.length > 0) {
        logger.info('VeraLatticeChatContext', {
          sessionId,
          message: 'Session recalled from lattice memory'
        });
        // Would reconstruct session from HCS here
      }
      
      return null;
    }

    // Update session as continued
    session.lastActive = Date.now();
    
    logger.info('VeraLatticeChatContext', {
      sessionId,
      messageCount: session.messages.length,
      message: 'Conversation continued'
    });

    return session;
  }

  /**
   * Find related conversations across all users
   * For collaborative/contextual assistance
   */
  async findRelatedConversations(
    query: string,
    maxResults: number = 5
  ): Promise<{ session: ChatSession; relevance: number }[]> {
    const queryEmbedding = this.contentToEmbedding(query);
    
    const allSessions = Array.from(this.sessions.values());
    
    const scoredSessions = allSessions.map(session => ({
      session,
      relevance: this.cosineSimilarity(queryEmbedding, session.contextEmbedding)
    }));

    scoredSessions.sort((a, b) => b.relevance - a.relevance);

    return scoredSessions.slice(0, maxResults);
  }

  // Private helpers

  private createSession(sessionId: string, userId: string): ChatSession {
    return {
      id: sessionId,
      userId,
      startTime: Date.now(),
      lastActive: Date.now(),
      messages: [],
      contextEmbedding: Array.from({ length: this.embeddingDim }, () => 0),
      dominantTopics: []
    };
  }

  private contentToEmbedding(content: string): number[] {
    // Generate deterministic embedding from content
    const normalized = content.toLowerCase().slice(0, 500);
    const hash = this.hashString(normalized);
    
    return Array.from({ length: this.embeddingDim }, (_, i) => {
      const charCode = hash.charCodeAt(i % hash.length) || 128;
      return (charCode % 256) / 256;
    });
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private extractTopics(content: string): string[] {
    const topics: string[] = [];
    const normalized = content.toLowerCase();
    
    // Topic extraction patterns
    const topicPatterns = [
      { pattern: /\b(defi|saucerswap|stader|hbar|crypto|token|swap)\b/, topic: 'defi' },
      { pattern: /\b(carbon|credit|dovu|environmental|sustainability|climate)\b/, topic: 'dovu' },
      { pattern: /\b(lattice|memory|recall|context|shard|topic)\b/, topic: 'lattice' },
      { pattern: /\b(hedera|hashscan|hcs|consensus|blockchain)\b/, topic: 'hedera' },
      { pattern: /\b(deploy|infrastructure|scaling|performance|system)\b/, topic: 'system' }
    ];

    topicPatterns.forEach(({ pattern, topic }) => {
      if (pattern.test(normalized)) {
        topics.push(topic);
      }
    });

    return [...new Set(topics)];
  }

  private inferIntent(content: string): string {
    const normalized = content.toLowerCase();
    
    if (normalized.includes('?')) return 'question';
    if (normalized.includes('how')) return 'how_to';
    if (normalized.includes('what')) return 'what_is';
    if (normalized.includes('why')) return 'explanation';
    if (normalized.includes('deploy') || normalized.includes('create')) return 'action';
    if (normalized.includes('show') || normalized.includes('display')) return 'display';
    if (normalized.includes('analyze') || normalized.includes('check')) return 'analysis';
    
    return 'conversation';
  }

  private indexTopic(topic: string, messageId: string): void {
    if (!this.topicIndex.has(topic)) {
      this.topicIndex.set(topic, new Set());
    }
    this.topicIndex.get(topic)!.add(messageId);
  }

  private updateSessionContext(session: ChatSession): number[] {
    if (session.messages.length === 0) {
      return Array.from({ length: this.embeddingDim }, () => 0);
    }

    // Calculate rolling average of message embeddings
    const sum = session.messages.reduce((acc, msg) => {
      const embedding = msg.embedding || Array.from({ length: this.embeddingDim }, () => 0);
      return acc.map((val, i) => val + embedding[i]);
    }, Array.from({ length: this.embeddingDim }, () => 0));

    return sum.map(val => val / session.messages.length);
  }

  private calculateDominantTopics(session: ChatSession): string[] {
    const topicCounts = new Map<string, number>();
    
    session.messages.forEach(msg => {
      msg.topics?.forEach(topic => {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      });
    });

    const sorted = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return sorted.map(([topic]) => topic);
  }

  private calculateTopicOverlap(topicsA: string[], topicsB: string[]): number {
    const intersection = topicsA.filter(t => topicsB.includes(t));
    const union = [...new Set([...topicsA, ...topicsB])];
    return union.length > 0 ? intersection.length / union.length : 0;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private generateSuggestions(
    query: string,
    relevantMessages: ChatMessage[],
    topics: string[]
  ): string[] {
    const suggestions: string[] = [];
    
    if (topics.includes('defi')) {
      suggestions.push('Would you like to continue discussing DeFi protocols?');
    }
    if (topics.includes('dovu')) {
      suggestions.push('Should I recall your previous carbon credit validations?');
    }
    if (topics.includes('lattice')) {
      suggestions.push('Would you like to see your lattice deployment history?');
    }
    
    if (relevantMessages.length > 0) {
      const lastAssistantMsg = relevantMessages
        .filter(m => m.role === 'assistant')
        .pop();
      if (lastAssistantMsg) {
        suggestions.push(`Previously we discussed: "${lastAssistantMsg.content.slice(0, 50)}..."`);
      }
    }

    return suggestions.slice(0, 3);
  }

  private async logToHCS(type: string, data: any): Promise<void> {
    try {
      await veraHCS.logAchievement(`chat_context_${type}`, {
        ...data,
        lattice_context: true,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.debug('VeraLatticeChatContext', { error, message: 'HCS log failed' });
    }
  }

  // Public API methods

  getSessionStats(userId?: string): any {
    if (userId) {
      const sessions = this.userSessions.get(userId) || new Set();
      return {
        userId,
        totalSessions: sessions.size,
        totalMessages: Array.from(sessions).reduce((sum, sid) => {
          const session = this.sessions.get(sid);
          return sum + (session?.messages.length || 0);
        }, 0),
        topics: Array.from(this.topicIndex.keys())
      };
    }

    return {
      totalSessions: this.sessions.size,
      totalMessages: this.messageIndex.size,
      totalUsers: this.userSessions.size,
      indexedTopics: Array.from(this.topicIndex.keys())
    };
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  getMessage(messageId: string): ChatMessage | undefined {
    return this.messageIndex.get(messageId);
  }
}

// Export singleton
export const veraLatticeChatContext = new VeraLatticeChatContext();
