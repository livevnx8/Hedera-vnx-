/**
 * Vera Knowledge Capture System
 * Captures every successful AI interaction and decision
 * Builds "what worked" knowledge base automatically
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../monitoring/logger.js';

interface CapturedInteraction {
  id: string;
  timestamp: number;
  query: string;
  context: {
    provider: string;
    model: string;
    toolsUsed: string[];
    latency: number;
  };
  response: {
    success: boolean;
    result: any;
    confidence: number;
  };
  outcome: {
    userSatisfaction?: 'positive' | 'neutral' | 'negative';
    corrections?: string[];
    followUpQueries?: string[];
  };
  pattern: {
    intent: string;
    complexity: number;
    domain: string; // carbon, hedera, general
  };
}

interface KnowledgePattern {
  pattern: string;
  frequency: number;
  successRate: number;
  avgLatency: number;
  bestProvider: string;
  bestTools: string[];
  examples: CapturedInteraction[];
}

export class KnowledgeCapture {
  private interactions: CapturedInteraction[] = [];
  private patterns: Map<string, KnowledgePattern> = new Map();
  private storagePath: string;
  private stats = {
    totalCaptured: 0,
    patternsIdentified: 0,
    knowledgeBaseSize: 0
  };

  constructor(basePath: string = '/mnt/vera-mirror-shards/vera-lattice') {
    this.storagePath = join(basePath, 'captured-knowledge');
    this.loadExisting();
  }

  /**
   * Capture a successful interaction
   */
  capture(interaction: Omit<CapturedInteraction, 'id' | 'timestamp'>): void {
    const fullInteraction: CapturedInteraction = {
      ...interaction,
      id: this.generateId(),
      timestamp: Date.now()
    };

    this.interactions.push(fullInteraction);
    this.stats.totalCaptured++;

    // Update patterns
    this.updatePatterns(fullInteraction);

    // Persist
    this.save();

    logger.debug(`Captured interaction: ${fullInteraction.id}`, {
      intent: fullInteraction.pattern.intent,
      success: fullInteraction.response.success
    });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ki-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update pattern statistics
   */
  private updatePatterns(interaction: CapturedInteraction): void {
    const patternKey = `${interaction.pattern.domain}:${interaction.pattern.intent}`;
    
    let pattern = this.patterns.get(patternKey);
    if (!pattern) {
      pattern = {
        pattern: patternKey,
        frequency: 0,
        successRate: 0,
        avgLatency: 0,
        bestProvider: interaction.context.provider,
        bestTools: interaction.context.toolsUsed,
        examples: []
      };
      this.patterns.set(patternKey, pattern);
      this.stats.patternsIdentified++;
    }

    // Update stats
    pattern.frequency++;
    pattern.successRate = (
      pattern.successRate * (pattern.frequency - 1) + 
      (interaction.response.success ? 1 : 0)
    ) / pattern.frequency;

    pattern.avgLatency = (
      pattern.avgLatency * (pattern.frequency - 1) + 
      interaction.context.latency
    ) / pattern.frequency;

    // Track best provider
    if (interaction.response.success && interaction.response.confidence > 0.8) {
      if (!pattern.bestProvider || interaction.context.latency < pattern.avgLatency) {
        pattern.bestProvider = interaction.context.provider;
      }
    }

    // Keep top examples
    pattern.examples.push(interaction);
    if (pattern.examples.length > 5) {
      // Remove oldest non-successful
      const nonSuccessful = pattern.examples.findIndex(e => !e.response.success);
      if (nonSuccessful >= 0) {
        pattern.examples.splice(nonSuccessful, 1);
      } else {
        pattern.examples.shift();
      }
    }
  }

  /**
   * Find similar past interactions
   */
  findSimilar(query: string, domain?: string): CapturedInteraction[] {
    const queryLower = query.toLowerCase();
    
    return this.interactions
      .filter(i => {
        if (domain && i.pattern.domain !== domain) return false;
        
        // Match by query similarity
        const queryMatch = i.query.toLowerCase().includes(queryLower) ||
                          queryLower.includes(i.query.toLowerCase());
        
        // Match by intent
        const intentMatch = i.pattern.intent.toLowerCase().includes(queryLower);
        
        return queryMatch || intentMatch;
      })
      .filter(i => i.response.success) // Only successful
      .sort((a, b) => b.response.confidence - a.response.confidence)
      .slice(0, 5); // Top 5
  }

  /**
   * Get recommended approach for query type
   */
  getRecommendation(query: string, domain?: string): {
    provider: string;
    tools: string[];
    confidence: number;
    basedOn: number;
  } | null {
    const similar = this.findSimilar(query, domain);
    
    if (similar.length === 0) return null;

    // Count provider usage
    const providerCounts = new Map<string, number>();
    const toolCounts = new Map<string, number>();
    let totalConfidence = 0;

    for (const interaction of similar) {
      providerCounts.set(
        interaction.context.provider,
        (providerCounts.get(interaction.context.provider) || 0) + 1
      );

      for (const tool of interaction.context.toolsUsed) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }

      totalConfidence += interaction.response.confidence;
    }

    // Find best provider
    const bestProvider = Array.from(providerCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'openai';

    // Find best tools
    const bestTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool]) => tool);

    return {
      provider: bestProvider,
      tools: bestTools,
      confidence: totalConfidence / similar.length,
      basedOn: similar.length
    };
  }

  /**
   * Save to disk
   */
  private save(): void {
    try {
      const data = {
        interactions: this.interactions.slice(-1000), // Keep last 1000
        patterns: Array.from(this.patterns.entries()),
        stats: this.stats,
        lastUpdated: Date.now()
      };

      writeFileSync(
        join(this.storagePath, 'knowledge-base.json'),
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      logger.error('Failed to save knowledge base:', error);
    }
  }

  /**
   * Load existing knowledge
   */
  private loadExisting(): void {
    try {
      const path = join(this.storagePath, 'knowledge-base.json');
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        this.interactions = data.interactions || [];
        this.patterns = new Map(data.patterns || []);
        this.stats = { ...this.stats, ...data.stats };
        
        logger.info(`Loaded ${this.interactions.length} captured interactions`);
      }
    } catch (error) {
      logger.warn('No existing knowledge base found');
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      knowledgeBaseSize: this.interactions.length,
      topPatterns: Array.from(this.patterns.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
    };
  }

  /**
   * Export knowledge for lattice documentation
   */
  exportForLattice(): string {
    const patterns = Array.from(this.patterns.values())
      .sort((a, b) => b.successRate - a.successRate);

    let markdown = `# Vera Captured Knowledge Patterns

**Auto-generated from ${this.stats.totalCaptured} interactions**
**Last Updated:** ${new Date().toISOString()}

## Top Performing Patterns

`;

    for (const pattern of patterns.slice(0, 10)) {
      markdown += `### ${pattern.pattern}

- **Frequency:** ${pattern.frequency} uses
- **Success Rate:** ${(pattern.successRate * 100).toFixed(1)}%
- **Avg Latency:** ${Math.round(pattern.avgLatency)}ms
- **Best Provider:** ${pattern.bestProvider}
- **Recommended Tools:** ${pattern.bestTools.join(', ') || 'None recorded'}

**Example Queries:**
${pattern.examples.slice(0, 3).map(e => `- "${e.query.substring(0, 60)}..."`).join('\n')}

---

`;
    }

    return markdown;
  }

  /**
   * Generate lattice documentation from patterns
   */
  generateLatticeDocs(outputPath: string): void {
    const markdown = this.exportForLattice();
    writeFileSync(join(outputPath, 'CAPTURED-PATTERNS.md'), markdown);
    logger.info('Generated lattice documentation from captured patterns');
  }
}

// Singleton
export const knowledgeCapture = new KnowledgeCapture();
