/**
 * Enhanced Context Window Management for Vera
 * 
 * Expands context capabilities to handle larger context windows
 * with intelligent compression and prioritization.
 */

import { ReasoningGraph, getReasoningGraph } from './reasoning/reasoningGraph.js';
import { ReasoningNode } from './reasoning/graphNode.js';
import { logger } from '../monitoring/logger.js';

export interface ContextItem {
  id: string;
  type: 'user_message' | 'assistant_message' | 'system' | 'tool_result' | 'knowledge' | 'reasoning';
  content: string;
  timestamp: Date;
  priority: number;
  tokens: number;
  metadata?: Record<string, any>;
}

export interface ContextWindowConfig {
  maxTokens: number;
  compressionThreshold: number;
  priorityWeights: {
    recent: number;
    important: number;
    relevant: number;
    diverse: number;
  };
  retentionPolicy: {
    keepSystemMessages: boolean;
    keepToolResults: boolean;
    keepKnowledge: boolean;
    keepReasoning: boolean;
  };
}

export interface ContextSummary {
  totalTokens: number;
  itemCount: number;
  compressionRatio: number;
  retainedItems: number;
  discardedItems: number;
  processingTime: number;
}

export class EnhancedContextManager {
  private reasoningGraph: ReasoningGraph;
  private contextItems: ContextItem[] = [];
  private config: ContextWindowConfig;
  private maxContextTokens: number = 32768; // 32K tokens for enhanced context

  constructor(config?: Partial<ContextWindowConfig>) {
    this.reasoningGraph = getReasoningGraph();
    this.config = {
      maxTokens: this.maxContextTokens,
      compressionThreshold: 0.8,
      priorityWeights: {
        recent: 0.3,
        important: 0.4,
        relevant: 0.2,
        diverse: 0.1
      },
      retentionPolicy: {
        keepSystemMessages: true,
        keepToolResults: true,
        keepKnowledge: true,
        keepReasoning: true
      },
      ...config
    };
  }

  // Add item to context
  addItem(item: Omit<ContextItem, 'id' | 'tokens'>): string {
    const id = `context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tokens = this.estimateTokens(item.content);
    
    const contextItem: ContextItem = {
      ...item,
      id,
      tokens
    };

    this.contextItems.push(contextItem);
    
    // Manage context size
    this.manageContextSize();
    
    logger.debug('Context item added', { 
      id, 
      type: item.type, 
      tokens,
      totalItems: this.contextItems.length 
    });

    return id;
  }

  // Get optimized context window
  getContextWindow(maxTokens?: number): ContextItem[] {
    const targetTokens = maxTokens || this.config.maxTokens;
    
    // Calculate current token usage
    const currentTokens = this.contextItems.reduce((sum, item) => sum + item.tokens, 0);
    
    if (currentTokens <= targetTokens) {
      return this.contextItems;
    }

    // Need to compress context
    return this.compressContext(targetTokens);
  }

  // Compress context to fit within token limit
  private compressContext(targetTokens: number): ContextItem[] {
    const startTime = Date.now();
    
    // Calculate priorities for all items
    const itemsWithPriority = this.contextItems.map(item => ({
      ...item,
      priority: this.calculatePriority(item)
    }));

    // Sort by priority (highest first)
    itemsWithPriority.sort((a, b) => b.priority - a.priority);

    // Select items until token limit is reached
    const selectedItems: ContextItem[] = [];
    let currentTokens = 0;

    for (const item of itemsWithPriority) {
      if (currentTokens + item.tokens <= targetTokens) {
        selectedItems.push(item);
        currentTokens += item.tokens;
      } else {
        // Try to compress the item
        const compressedItem = this.compressItem(item, targetTokens - currentTokens);
        if (compressedItem) {
          selectedItems.push(compressedItem);
          currentTokens += compressedItem.tokens;
        }
        break;
      }
    }

    const processingTime = Date.now() - startTime;
    
    logger.info('Context compressed', {
      originalItems: this.contextItems.length,
      selectedItems: selectedItems.length,
      originalTokens: this.contextItems.reduce((sum, item) => sum + item.tokens, 0),
      selectedTokens: currentTokens,
      targetTokens,
      processingTime
    });

    return selectedItems;
  }

  // Calculate priority for context item
  private calculatePriority(item: ContextItem): number {
    let priority = 0;

    // Recent items get higher priority
    const ageInMs = Date.now() - item.timestamp.getTime();
    const ageInHours = ageInMs / (1000 * 60 * 60);
    const recentScore = Math.max(0, 1 - (ageInHours / 24)); // Decay over 24 hours
    priority += recentScore * this.config.priorityWeights.recent;

    // Important items get higher priority
    const importanceScore = this.calculateImportance(item);
    priority += importanceScore * this.config.priorityWeights.important;

    // Relevant items get higher priority
    const relevanceScore = this.calculateRelevance(item);
    priority += relevanceScore * this.config.priorityWeights.relevant;

    // Diverse content gets bonus
    const diversityScore = this.calculateDiversity(item);
    priority += diversityScore * this.config.priorityWeights.diverse;

    // Type-specific priorities
    const typePriority = this.getTypePriority(item.type);
    priority += typePriority;

    return Math.min(1, priority);
  }

  private calculateImportance(item: ContextItem): number {
    let importance = 0.5; // Base importance

    // Check for important keywords
    const importantKeywords = [
      'critical', 'urgent', 'important', 'key', 'essential',
      'primary', 'main', 'core', 'fundamental', 'crucial'
    ];

    const contentLower = item.content.toLowerCase();
    const keywordMatches = importantKeywords.filter(keyword => 
      contentLower.includes(keyword)
    ).length;

    importance += keywordMatches * 0.1;

    // Check for question marks (questions are important)
    if (item.content.includes('?')) {
      importance += 0.2;
    }

    // Check for length (longer content might be more important)
    if (item.tokens > 100) {
      importance += 0.1;
    }

    return Math.min(1, importance);
  }

  private calculateRelevance(item: ContextItem): number {
    // Calculate relevance based on recent interactions
    const recentItems = this.contextItems.filter(i => 
      i.timestamp > new Date(Date.now() - 60 * 60 * 1000) // Last hour
    );

    if (recentItems.length === 0) return 0.5;

    // Simple relevance based on content similarity
    const similarities = recentItems.map(recentItem => 
      this.calculateSimilarity(item.content, recentItem.content)
    );

    const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
    
    return avgSimilarity;
  }

  private calculateDiversity(item: ContextItem): number {
    // Calculate diversity based on how different this item is from others
    if (this.contextItems.length === 0) return 1;

    const similarities = this.contextItems.map(otherItem => 
      this.calculateSimilarity(item.content, otherItem.content)
    );

    const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
    
    // Diversity is inverse of average similarity
    return 1 - avgSimilarity;
  }

  private getTypePriority(type: ContextItem['type']): number {
    const typePriorities: Record<ContextItem['type'], number> = {
      'user_message': 0.8,
      'assistant_message': 0.7,
      'system': 0.9,
      'tool_result': 0.9,
      'knowledge': 0.6,
      'reasoning': 0.8
    };

    return typePriorities[type] || 0.5;
  }

  private calculateSimilarity(content1: string, content2: string): number {
    // Simple similarity calculation - can be enhanced with NLP
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private compressItem(item: ContextItem, maxTokens: number): ContextItem | null {
    if (item.tokens <= maxTokens) {
      return item;
    }

    // Try to compress content
    const compressionRatio = maxTokens / item.tokens;
    const compressedContent = this.compressText(item.content, compressionRatio);
    
    if (compressedContent.length === 0) {
      return null;
    }

    return {
      ...item,
      content: compressedContent,
      tokens: this.estimateTokens(compressedContent)
    };
  }

  private compressText(text: string, compressionRatio: number): string {
    // Simple text compression - can be enhanced with NLP
    const sentences = text.split(/[.!?]+/);
    const targetSentences = Math.floor(sentences.length * compressionRatio);
    
    if (targetSentences === 0) return '';
    
    // Keep the most important sentences
    const sentenceScores = sentences.map((sentence, index) => ({
      sentence: sentence.trim(),
      score: this.calculateSentenceImportance(sentence),
      index
    }));

    sentenceScores.sort((a, b) => b.score - a.score);
    
    const selectedSentences = sentenceScores
      .slice(0, targetSentences)
      .sort((a, b) => a.index - b.index)
      .map(item => item.sentence);

    return selectedSentences.join('. ') + '.';
  }

  private calculateSentenceImportance(sentence: string): number {
    let importance = 0;

    // Length importance
    importance += Math.min(1, sentence.length / 100);

    // Keyword importance
    const importantWords = ['important', 'key', 'critical', 'main', 'primary'];
    const contentLower = sentence.toLowerCase();
    const keywordMatches = importantWords.filter(word => 
      contentLower.includes(word)
    ).length;
    
    importance += keywordMatches * 0.2;

    // Question importance
    if (sentence.includes('?')) {
      importance += 0.3;
    }

    // Number importance (facts with numbers)
    if (/\d+/.test(sentence)) {
      importance += 0.1;
    }

    return importance;
  }

  private estimateTokens(text: string): number {
    // Simple token estimation - roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }

  private manageContextSize(): void {
    const currentTokens = this.contextItems.reduce((sum, item) => sum + item.tokens, 0);
    
    if (currentTokens > this.config.maxTokens * this.config.compressionThreshold) {
      this.compressContext(this.config.maxTokens);
    }
  }

  // Get context statistics
  getContextStats(): {
    totalItems: number;
    totalTokens: number;
    averageTokensPerItem: number;
    typeDistribution: Record<string, number>;
    oldestItem: Date;
    newestItem: Date;
  } {
    const totalItems = this.contextItems.length;
    const totalTokens = this.contextItems.reduce((sum, item) => sum + item.tokens, 0);
    const averageTokensPerItem = totalItems > 0 ? totalTokens / totalItems : 0;

    const typeDistribution: Record<string, number> = {};
    for (const item of this.contextItems) {
      typeDistribution[item.type] = (typeDistribution[item.type] || 0) + 1;
    }

    const timestamps = this.contextItems.map(item => item.timestamp);
    const oldestItem = timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : new Date();
    const newestItem = timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : new Date();

    return {
      totalItems,
      totalTokens,
      averageTokensPerItem,
      typeDistribution,
      oldestItem,
      newestItem
    };
  }

  // Clear old context items
  clearOldItems(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const initialCount = this.contextItems.length;
    
    this.contextItems = this.contextItems.filter(item => {
      // Keep system messages and recent items
      if (item.type === 'user_message' || item.type === 'assistant_message') {
        return item.timestamp > cutoffTime;
      }
      
      // Keep important items based on retention policy
      if (this.config.retentionPolicy.keepSystemMessages && item.type === 'system') {
        return true;
      }
      
      if (this.config.retentionPolicy.keepToolResults && item.type === 'tool_result') {
        return true;
      }
      
      if (this.config.retentionPolicy.keepKnowledge && item.type === 'knowledge') {
        return true;
      }
      
      if (this.config.retentionPolicy.keepReasoning && item.type === 'reasoning') {
        return true;
      }
      
      return item.timestamp > cutoffTime;
    });

    const removedCount = initialCount - this.contextItems.length;
    
    logger.info('Old context items cleared', {
      removedCount,
      remainingCount: this.contextItems.length,
      olderThanHours
    });
  }

  // Export context for analysis
  exportContext(): ContextItem[] {
    return [...this.contextItems];
  }

  // Import context (for restoration)
  importContext(items: ContextItem[]): void {
    this.contextItems = [...items];
    this.manageContextSize();
    
    logger.info('Context imported', { itemCount: items.length });
  }

  // Update configuration
  updateConfig(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config };
    this.manageContextSize();
  }

  // Get current configuration
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const enhancedContext = new EnhancedContextManager();
