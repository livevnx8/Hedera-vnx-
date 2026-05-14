/**
 * Predictive Memory Pre-fetch System
 * 
 * Based on current conversation context, pre-fetches relevant HCS memories
 * before the user explicitly asks. Creates seamless, context-aware responses.
 * 
 * Uses:
 * - Conversation intent classification
 * - Topic modeling on current context
 * - Semantic similarity to predict what knowledge will be needed
 */

import { hcsVectorSync, SemanticQueryResult } from './hcsVectorSync.js';
import { hcsBrainRetrieval } from './hcsBrainRetrieval.js';
import { logger } from '../monitoring/logger.js';

interface ConversationContext {
  sessionId: string;
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  detectedTopics: string[];
  intent: string;
  confidence: number;
}

export interface PredictedMemory {
  query: string;
  confidence: number; // 0-1 likelihood this will be needed
  urgency: 'immediate' | 'soon' | 'background';
  results: SemanticQueryResult[];
  preFetchedAt: number;
}

interface MemoryCache {
  memories: SemanticQueryResult[];
  fetchedAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface IntentPattern {
  intent: string;
  keywords: string[];
  typicalQueries: string[];
  category: string;
  confidenceThreshold: number;
}

export class PredictiveMemory {
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private memoryCache: Map<string, MemoryCache> = new Map();
  private predictedMemories: Map<string, PredictedMemory[]> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;

  // Hedera-specific intent patterns for prediction
  private intentPatterns: IntentPattern[] = [
    {
      intent: 'hts_token_creation',
      keywords: ['token', 'create', 'mint', 'hts', 'supply', 'decimals'],
      typicalQueries: ['How do I create a token', 'HTS token example', 'token creation steps'],
      category: 'hedera_tools',
      confidenceThreshold: 0.7
    },
    {
      intent: 'hcs_messaging',
      keywords: ['topic', 'hcs', 'message', 'consensus', 'subscribe'],
      typicalQueries: ['Create HCS topic', 'submit message', 'read HCS messages'],
      category: 'hedera_tools',
      confidenceThreshold: 0.6
    },
    {
      intent: 'defi_saucerswap',
      keywords: ['swap', 'pool', 'liquidity', 'saucerswap', 'dex', 'exchange'],
      typicalQueries: ['How to swap tokens', 'add liquidity', 'SaucerSwap tutorial'],
      category: 'defi_analytics',
      confidenceThreshold: 0.7
    },
    {
      intent: 'carbon_credits',
      keywords: ['carbon', 'dovu', 'guardian', 'offset', 'sustainability', 'environment'],
      typicalQueries: ['carbon credit tokenization', 'Dovu integration', 'ESG tracking'],
      category: 'carbon_credits',
      confidenceThreshold: 0.75
    },
    {
      intent: 'smart_contracts',
      keywords: ['contract', 'solidity', 'deploy', 'evm', 'bytecode', 'hardhat'],
      typicalQueries: ['Deploy smart contract', 'Solidity on Hedera', 'EVM contract'],
      category: 'hedera_tools',
      confidenceThreshold: 0.7
    },
    {
      intent: 'payments_x402',
      keywords: ['payment', 'x402', 'escrow', 'settlement', 'hbar', 'transfer'],
      typicalQueries: ['x402 payment', 'create escrow', 'HBAR transfer'],
      category: 'hedera_tools',
      confidenceThreshold: 0.65
    },
    {
      intent: 'account_management',
      keywords: ['account', 'key', 'private', 'public', 'associate', 'balance'],
      typicalQueries: ['create account', 'associate token', 'check balance'],
      category: 'hedera_tools',
      confidenceThreshold: 0.6
    },
    {
      intent: 'nft_operations',
      keywords: ['nft', 'collection', 'metadata', 'serial', 'mint', 'transfer'],
      typicalQueries: ['create NFT collection', 'mint NFT', 'NFT metadata'],
      category: 'hedera_tools',
      confidenceThreshold: 0.75
    }
  ];

  /**
   * Analyze conversation and pre-fetch relevant memories
   */
  async analyzeAndPrefetch(sessionId: string, userMessage: string): Promise<{
    predictedIntent: string | null;
    prefetchedCount: number;
    relevantMemories: SemanticQueryResult[];
  }> {
    // Get or create context
    let context = this.conversationContexts.get(sessionId);
    if (!context) {
      context = {
        sessionId,
        recentMessages: [],
        detectedTopics: [],
        intent: 'unknown',
        confidence: 0
      };
      this.conversationContexts.set(sessionId, context);
    }

    // Add new message
    context.recentMessages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    });

    // Keep only last 10 messages
    context.recentMessages = context.recentMessages.slice(-10);

    // Detect intent
    const intentDetection = this.detectIntent(context);
    context.detectedTopics = intentDetection.relatedTopics;
    context.intent = intentDetection.intent;
    context.confidence = intentDetection.confidence;

    // If no clear intent, return empty
    if (!intentDetection.intent || intentDetection.confidence < 0.5) {
      return {
        predictedIntent: null,
        prefetchedCount: 0,
        relevantMemories: []
      };
    }

    // Check cache first
    const cacheKey = `${sessionId}:${intentDetection.intent}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      
      logger.debug('PredictiveMemory', {
        sessionId,
        intent: intentDetection.intent,
        cacheHit: true,
        message: 'Returning cached memories'
      });

      return {
        predictedIntent: intentDetection.intent,
        prefetchedCount: cached.memories.length,
        relevantMemories: cached.memories
      };
    }

    // Pre-fetch relevant memories
    const prefetched = await this.prefetchForIntent(intentDetection);
    
    // Cache results
    this.memoryCache.set(cacheKey, {
      memories: prefetched.results,
      fetchedAt: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });

    // Store prediction for analytics
    const predictions = this.predictedMemories.get(sessionId) || [];
    predictions.push(prefetched);
    this.predictedMemories.set(sessionId, predictions);

    // Clean old cache entries if needed
    this.cleanCache();

    logger.info('PredictiveMemory', {
      sessionId,
      intent: intentDetection.intent,
      confidence: intentDetection.confidence,
      prefetchedCount: prefetched.results.length,
      message: 'Pre-fetched memories for predicted intent'
    });

    return {
      predictedIntent: intentDetection.intent,
      prefetchedCount: prefetched.results.length,
      relevantMemories: prefetched.results
    };
  }

  /**
   * Detect intent from conversation context
   */
  private detectIntent(context: ConversationContext): {
    intent: string | null;
    confidence: number;
    relatedTopics: string[];
  } {
    // Combine recent messages for analysis
    const recentText = context.recentMessages
      .slice(-3) // Last 3 messages
      .map(m => m.content.toLowerCase())
      .join(' ');

    let bestMatch: IntentPattern | null = null;
    let bestScore = 0;
    const relatedTopics: string[] = [];

    for (const pattern of this.intentPatterns) {
      let score = 0;
      let matchedKeywords = 0;

      for (const keyword of pattern.keywords) {
        if (recentText.includes(keyword.toLowerCase())) {
          score += 0.15;
          matchedKeywords++;
        }
      }

      // Boost score for multiple keyword matches
      if (matchedKeywords >= 2) {
        score += 0.2;
      }
      if (matchedKeywords >= 3) {
        score += 0.3;
      }

      // Check for typical queries
      for (const query of pattern.typicalQueries) {
        const queryWords = query.toLowerCase().split(/\s+/);
        const matchCount = queryWords.filter(w => recentText.includes(w)).length;
        score += (matchCount / queryWords.length) * 0.2;
      }

      if (score > bestScore && score >= pattern.confidenceThreshold) {
        bestScore = score;
        bestMatch = pattern;
      }

      // Track related topics even if not best match
      if (matchedKeywords > 0) {
        relatedTopics.push(pattern.intent);
      }
    }

    return {
      intent: bestMatch?.intent || null,
      confidence: Math.min(bestScore, 1),
      relatedTopics: [...new Set(relatedTopics)]
    };
  }

  /**
   * Pre-fetch memories for detected intent
   */
  private async prefetchForIntent(
    intentDetection: { intent: string; confidence: number; relatedTopics: string[] }
  ): Promise<PredictedMemory> {
    const pattern = this.intentPatterns.find(p => p.intent === intentDetection.intent);
    
    if (!pattern) {
      return {
        query: intentDetection.intent,
        confidence: intentDetection.confidence,
        urgency: 'background',
        results: [],
        preFetchedAt: Date.now()
      };
    }

    // Build search query from intent
    const searchQueries = [
      ...pattern.typicalQueries,
      ...pattern.keywords.map(k => `${pattern.category} ${k}`)
    ];

    // Use hybrid search for best results
    const allResults: SemanticQueryResult[] = [];
    
    for (const query of searchQueries.slice(0, 3)) { // Top 3 queries
      const results = await hcsVectorSync.hybridSearch(query, {
        topK: 5,
        keywordWeight: 0.4,
        semanticWeight: 0.6
      });
      allResults.push(...results);
    }

    // Deduplicate by topic+sequence
    const seen = new Set<string>();
    const unique = allResults.filter(r => {
      const key = `${r.memory.topicId}-${r.memory.sequence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by combined score and take top 10
    unique.sort((a, b) => b.similarity - a.similarity);
    const topResults = unique.slice(0, 10);

    return {
      query: searchQueries[0],
      confidence: intentDetection.confidence,
      urgency: intentDetection.confidence > 0.8 ? 'immediate' : 
               intentDetection.confidence > 0.6 ? 'soon' : 'background',
      results: topResults,
      preFetchedAt: Date.now()
    };
  }

  /**
   * Get pre-fetched memories for current context
   */
  getPrefetchedMemories(sessionId: string): SemanticQueryResult[] {
    const context = this.conversationContexts.get(sessionId);
    if (!context || !context.intent) return [];

    const cacheKey = `${sessionId}:${context.intent}`;
    const cached = this.memoryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      cached.lastAccessed = Date.now();
      return cached.memories;
    }

    return [];
  }

  /**
   * Record that a memory was used (for feedback loop)
   */
  recordMemoryUsage(sessionId: string, memoryId: string): void {
    // This helps improve prediction accuracy over time
    logger.debug('PredictiveMemory', {
      sessionId,
      memoryId,
      message: 'Memory was used in response'
    });
  }

  /**
   * Get prediction accuracy stats
   */
  getStats(): {
    activeContexts: number;
    cachedMemories: number;
    totalPredictions: number;
    averageCacheHitRate: number;
  } {
    let totalAccesses = 0;
    let totalCacheHits = 0;

    for (const cache of this.memoryCache.values()) {
      totalAccesses += cache.accessCount;
      if (cache.accessCount > 1) {
        totalCacheHits += cache.accessCount - 1;
      }
    }

    return {
      activeContexts: this.conversationContexts.size,
      cachedMemories: this.memoryCache.size,
      totalPredictions: Array.from(this.predictedMemories.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      averageCacheHitRate: totalAccesses > 0 
        ? totalCacheHits / totalAccesses 
        : 0
    };
  }

  /**
   * Clean old cache entries
   */
  private cleanCache(): void {
    if (this.memoryCache.size <= this.MAX_CACHE_SIZE) return;

    // Remove oldest entries
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Clear context for session
   */
  clearSession(sessionId: string): void {
    this.conversationContexts.delete(sessionId);
    this.predictedMemories.delete(sessionId);
    
    // Clean up cache entries for this session
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.memoryCache.delete(key);
      }
    }
  }
}

// Export singleton
export const predictiveMemory = new PredictiveMemory();
export default predictiveMemory;
