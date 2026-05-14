/**
 * Implementation Pattern Logging System
 * 
 * Vera logs "key ways for things to be implemented" - creating a reusable
 * knowledge base of working patterns, solutions, and best practices.
 * 
 * This creates verifiable AI that can:
 * - Reference proven implementation patterns
 * - Audit decision lineage through HCS
 * - Reuse working solutions instead of reinventing
 * 
 * Each pattern is logged to HCS for permanent, tamper-proof storage.
 */

import { TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import { hcsBrainRetrieval } from './hcsBrainRetrieval.js';

export interface ImplementationPattern {
  id: string;
  timestamp: number;
  version: string;
  
  // What was implemented
  title: string;
  description: string;
  category: PatternCategory;
  
  // Technical details
  components: string[]; // e.g., ['HTS', 'HCS', 'Smart Contract']
  tools: string[]; // e.g., ['hedera-agent-kit', 'ethers.js']
  codeSnippet?: string;
  configuration?: Record<string, any>;
  
  // Success metrics
  verified: boolean;
  testResults?: {
    passed: boolean;
    coverage?: number;
    performanceMetrics?: Record<string, number>;
  };
  
  // Dependencies
  dependsOn?: string[]; // Pattern IDs this builds upon
  usedBy?: string[]; // Pattern IDs that use this
  
  // Context
  problemSolved: string;
  alternativesConsidered?: string[];
  rationale: string;
  
  // Audit trail
  author: string;
  reviewedBy?: string[];
  hederaTxId?: string; // HCS submit transaction
  
  // Searchable tags
  tags: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedTime?: string; // e.g., "2 hours"
}

export type PatternCategory =
  | 'token_creation'
  | 'token_management'
  | 'consensus_messaging'
  | 'smart_contracts'
  | 'defi_integration'
  | 'payment_systems'
  | 'carbon_tracking'
  | 'agent_orchestration'
  | 'scaling'
  | 'security'
  | 'testing'
  | 'deployment'
  | 'ui_ux'
  | 'api_design'
  | 'database'
  | 'general';

interface PatternQuery {
  category?: PatternCategory;
  components?: string[];
  tags?: string[];
  complexity?: 'simple' | 'moderate' | 'complex';
  verifiedOnly?: boolean;
  searchQuery?: string;
  limit?: number;
}

interface PatternUsage {
  patternId: string;
  usedInSession: string;
  usedAt: number;
  context: string;
  success: boolean;
  notes?: string;
}

export class ImplementationPatternLogger {
  private patterns: Map<string, ImplementationPattern> = new Map();
  private usageLog: PatternUsage[] = [];
  private hcsTopicId: string | null = null;
  private client: any = null; // Hedera client
  private patternCache: Map<string, { pattern: ImplementationPattern; lastAccessed: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.hcsTopicId = process.env.VERA_PATTERNS_TOPIC_ID || null;
    this.initializeClient().catch(() => {});
  }

  private async initializeClient(): Promise<void> {
    try {
      const { Client } = await import('@hashgraph/sdk');
      this.client = Client.forName(config.HEDERA_NETWORK);
      
      if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
        const privateKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY);
        this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
      }
    } catch (error) {
      logger.warn('ImplementationPatternLogger', {
        message: 'Hedera client not available, patterns will be logged locally only'
      });
    }
  }

  /**
   * Log a new implementation pattern
   * Stores in memory + submits to HCS for permanent record
   */
  async logPattern(
    pattern: Omit<ImplementationPattern, 'id' | 'timestamp' | 'version' | 'hederaTxId'>
  ): Promise<ImplementationPattern> {
    const fullPattern: ImplementationPattern = {
      ...pattern,
      id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      version: '1.0.0',
      hederaTxId: undefined
    };

    // Store locally
    this.patterns.set(fullPattern.id, fullPattern);
    this.patternCache.set(fullPattern.id, { 
      pattern: fullPattern, 
      lastAccessed: Date.now() 
    });

    // Submit to HCS if available
    if (this.client && this.hcsTopicId) {
      try {
        const privateKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY!);
        
        const message = JSON.stringify({
          type: 'IMPLEMENTATION_PATTERN',
          pattern: fullPattern
        });

        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(this.hcsTopicId)
          .setMessage(message)
          .freezeWith(this.client);

        const signTx = await tx.sign(privateKey);
        const submitTx = await signTx.execute(this.client);
        const receipt = await submitTx.getReceipt(this.client);

        fullPattern.hederaTxId = submitTx.transactionId.toString();

        logger.info('ImplementationPatternLogger', {
          patternId: fullPattern.id,
          category: fullPattern.category,
          txId: fullPattern.hederaTxId,
          message: 'Pattern logged to HCS'
        });
      } catch (error) {
        logger.error('ImplementationPatternLogger', {
          patternId: fullPattern.id,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to log pattern to HCS, stored locally only'
        });
      }
    }

    return fullPattern;
  }

  /**
   * Quick log for simple patterns
   */
  async quickLog(
    title: string,
    category: PatternCategory,
    description: string,
    components: string[],
    options: {
      codeSnippet?: string;
      tags?: string[];
      complexity?: 'simple' | 'moderate' | 'complex';
      verified?: boolean;
    } = {}
  ): Promise<ImplementationPattern> {
    return this.logPattern({
      title,
      category,
      description,
      components,
      tools: [],
      codeSnippet: options.codeSnippet,
      verified: options.verified ?? true,
      problemSolved: description,
      rationale: 'Working implementation pattern extracted from successful usage',
      author: 'vera-system',
      tags: options.tags || components,
      complexity: options.complexity || 'moderate'
    });
  }

  /**
   * Find patterns matching query criteria
   * Searches both local cache and HCS
   */
  async findPatterns(query: PatternQuery): Promise<ImplementationPattern[]> {
    const results: ImplementationPattern[] = [];
    const seen = new Set<string>();

    // Search local patterns
    for (const pattern of this.patterns.values()) {
      if (this.matchesQuery(pattern, query) && !seen.has(pattern.id)) {
        results.push(pattern);
        seen.add(pattern.id);
        this.patternCache.set(pattern.id, { pattern, lastAccessed: Date.now() });
      }
    }

    // Search HCS if no local results or query is broad
    if (results.length < (query.limit || 10)) {
      const hcsResults = await this.searchHCSPatterns(query);
      for (const pattern of hcsResults) {
        if (!seen.has(pattern.id)) {
          results.push(pattern);
          seen.add(pattern.id);
          this.patterns.set(pattern.id, pattern);
        }
      }
    }

    // Sort by relevance (verified first, then by timestamp)
    results.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return b.timestamp - a.timestamp;
    });

    return results.slice(0, query.limit || 10);
  }

  /**
   * Check if pattern matches query criteria
   */
  private matchesQuery(pattern: ImplementationPattern, query: PatternQuery): boolean {
    if (query.category && pattern.category !== query.category) return false;
    if (query.verifiedOnly && !pattern.verified) return false;
    if (query.complexity && pattern.complexity !== query.complexity) return false;
    
    if (query.components && query.components.length > 0) {
      const hasAllComponents = query.components.every(c => 
        pattern.components.some(pc => pc.toLowerCase().includes(c.toLowerCase()))
      );
      if (!hasAllComponents) return false;
    }

    if (query.tags && query.tags.length > 0) {
      const hasAnyTag = query.tags.some(t => 
        pattern.tags.some(pt => pt.toLowerCase().includes(t.toLowerCase()))
      );
      if (!hasAnyTag) return false;
    }

    if (query.searchQuery) {
      const searchLower = query.searchQuery.toLowerCase();
      const matchesSearch = 
        pattern.title.toLowerCase().includes(searchLower) ||
        pattern.description.toLowerCase().includes(searchLower) ||
        pattern.problemSolved.toLowerCase().includes(searchLower) ||
        pattern.tags.some(t => t.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }

    return true;
  }

  /**
   * Search for patterns in HCS
   */
  private async searchHCSPatterns(
    query: PatternQuery
  ): Promise<ImplementationPattern[]> {
    if (!this.hcsTopicId) return [];

    try {
      // Use hcsBrainRetrieval to get messages from pattern topic
      const memories = await hcsBrainRetrieval.queryTopicMessages(
        this.hcsTopicId,
        { limit: 100, order: 'desc' }
      );

      const patterns: ImplementationPattern[] = [];

      for (const memory of memories) {
        if (memory.content?.type === 'IMPLEMENTATION_PATTERN') {
          const pattern = memory.content.pattern as ImplementationPattern;
          if (this.matchesQuery(pattern, query)) {
            patterns.push(pattern);
          }
        }
      }

      return patterns;
    } catch (error) {
      logger.warn('ImplementationPatternLogger', {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to search HCS patterns'
      });
      return [];
    }
  }

  /**
   * Get pattern by ID
   */
  async getPattern(id: string): Promise<ImplementationPattern | null> {
    // Check cache first
    const cached = this.patternCache.get(id);
    if (cached && Date.now() - cached.lastAccessed < this.CACHE_TTL) {
      cached.lastAccessed = Date.now();
      return cached.pattern;
    }

    // Check local store
    const local = this.patterns.get(id);
    if (local) {
      this.patternCache.set(id, { pattern: local, lastAccessed: Date.now() });
      return local;
    }

    // Search HCS
    const fromHCS = await this.searchHCSPatterns({ searchQuery: id, limit: 1 });
    if (fromHCS.length > 0) {
      this.patterns.set(id, fromHCS[0]);
      this.patternCache.set(id, { pattern: fromHCS[0], lastAccessed: Date.now() });
      return fromHCS[0];
    }

    return null;
  }

  /**
   * Record that a pattern was used
   */
  async recordUsage(
    patternId: string,
    sessionId: string,
    context: string,
    success: boolean,
    notes?: string
  ): Promise<void> {
    const usage: PatternUsage = {
      patternId,
      usedInSession: sessionId,
      usedAt: Date.now(),
      context,
      success,
      notes
    };

    this.usageLog.push(usage);

    // Update pattern with usage info
    const pattern = await this.getPattern(patternId);
    if (pattern) {
      pattern.usedBy = pattern.usedBy || [];
      if (!pattern.usedBy.includes(sessionId)) {
        pattern.usedBy.push(sessionId);
      }
    }

    logger.debug('ImplementationPatternLogger', {
      patternId,
      sessionId,
      success,
      message: 'Pattern usage recorded'
    });
  }

  /**
   * Get related patterns (dependency chain)
   */
  async getRelatedPatterns(patternId: string): Promise<{
    dependencies: ImplementationPattern[];
    dependents: ImplementationPattern[];
    similar: ImplementationPattern[];
  }> {
    const pattern = await this.getPattern(patternId);
    if (!pattern) return { dependencies: [], dependents: [], similar: [] };

    const dependencies: ImplementationPattern[] = [];
    const dependents: ImplementationPattern[] = [];
    const similar: ImplementationPattern[] = [];

    // Get dependencies
    if (pattern.dependsOn) {
      for (const depId of pattern.dependsOn) {
        const dep = await this.getPattern(depId);
        if (dep) dependencies.push(dep);
      }
    }

    // Get dependents
    for (const [id, p] of this.patterns) {
      if (p.dependsOn?.includes(patternId)) {
        dependents.push(p);
      }
      // Similar = same category, different ID
      if (p.category === pattern.category && p.id !== patternId) {
        similar.push(p);
      }
    }

    return {
      dependencies,
      dependents: dependents.slice(0, 5),
      similar: similar.slice(0, 5)
    };
  }

  /**
   * Get pattern statistics
   */
  getStats(): {
    totalPatterns: number;
    byCategory: Record<string, number>;
    verifiedCount: number;
    totalUsages: number;
    hcsTopicId: string | null;
  } {
    const byCategory: Record<string, number> = {};
    let verifiedCount = 0;

    for (const pattern of this.patterns.values()) {
      byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
      if (pattern.verified) verifiedCount++;
    }

    return {
      totalPatterns: this.patterns.size,
      byCategory,
      verifiedCount,
      totalUsages: this.usageLog.length,
      hcsTopicId: this.hcsTopicId
    };
  }

  /**
   * Get most used patterns
   */
  getMostUsed(limit: number = 10): Array<{ pattern: ImplementationPattern; usageCount: number }> {
    const usageCounts = new Map<string, number>();

    for (const usage of this.usageLog) {
      usageCounts.set(usage.patternId, (usageCounts.get(usage.patternId) || 0) + 1);
    }

    const sorted = Array.from(usageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([id, count]) => {
      const pattern = this.patterns.get(id);
      return pattern ? { pattern, usageCount: count } : null;
    }).filter(Boolean) as Array<{ pattern: ImplementationPattern; usageCount: number }>;
  }

  /**
   * Export patterns for sharing/backup
   */
  exportPatterns(category?: PatternCategory): ImplementationPattern[] {
    let patterns = Array.from(this.patterns.values());
    
    if (category) {
      patterns = patterns.filter(p => p.category === category);
    }

    return patterns.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Import patterns (e.g., from backup or other Vera instance)
   */
  async importPatterns(patterns: ImplementationPattern[]): Promise<{
    imported: number;
    skipped: number;
    failed: number;
  }> {
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const pattern of patterns) {
      try {
        if (this.patterns.has(pattern.id)) {
          skipped++;
          continue;
        }

        // Re-log to HCS with new timestamp
        await this.logPattern({
          ...pattern,
          title: `[Imported] ${pattern.title}`,
          tags: [...pattern.tags, 'imported']
        });
        imported++;
      } catch (error) {
        failed++;
        logger.error('ImplementationPatternLogger', {
          patternId: pattern.id,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to import pattern'
        });
      }
    }

    return { imported, skipped, failed };
  }

  /**
   * Clean old cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [id, entry] of this.patternCache) {
      if (now - entry.lastAccessed > this.CACHE_TTL) {
        this.patternCache.delete(id);
      }
    }
  }
}

// Export singleton
export const implementationPatterns = new ImplementationPatternLogger();
export default implementationPatterns;
