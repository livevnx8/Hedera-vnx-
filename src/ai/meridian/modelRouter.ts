/**
 * Meridian Model Tier Router
 *
 * Intelligently routes tasks to appropriate model size based on complexity.
 * Tiers: Tiny (125M) → Medium (260M) → Compact (350M) → Plus (457M) → External (API)
 */

import { config } from '../../config.js';
import type { VerifiableAITask } from '../../vera/proofKernel/types.js';

export type ModelTier = 'tiny' | 'medium' | 'compact' | 'plus' | 'external';

export interface TierConfig {
  name: ModelTier;
  url: string;
  size: number; // Parameter count in millions
  latencyTargetMs: number;
  useCases: string[];
  keywords: string[];
  maxPayloadBytes: number;
  minStakesHbar: number;
}

export interface TaskComplexity {
  payloadSize: number;
  estimatedTokens: number;
  keywordComplexity: number; // 0-1
  toolCount: number;
  financialStakes: number; // HBAR
  requiresVerification: boolean;
  hasStructuredData: boolean;
  multiStepReasoning: boolean;
}

export interface RoutingDecision {
  selectedTier: ModelTier;
  fallbackChain: ModelTier[];
  estimatedLatencyMs: number;
  confidence: number; // Routing confidence (0-1)
  reason: string;
}

const TIER_CONFIGS: TierConfig[] = [
  {
    name: 'tiny',
    url: config.MERIDIAN_TIER_TINY_URL || '',
    size: 125,
    latencyTargetMs: 50,
    useCases: ['simple_queries', 'faqs', 'greetings'],
    keywords: ['hello', 'help', 'what is', 'how to', 'simple'],
    maxPayloadBytes: 1024,
    minStakesHbar: 0,
  },
  {
    name: 'medium',
    url: config.MERIDIAN_TIER_MEDIUM_URL || '',
    size: 260,
    latencyTargetMs: 100,
    useCases: ['standard_tasks', 'tool_calls', 'basic_analysis'],
    keywords: ['check', 'get', 'find', 'show', 'list'],
    maxPayloadBytes: 4096,
    minStakesHbar: 0,
  },
  {
    name: 'compact',
    url: config.MERIDIAN_TIER_COMPACT_URL || 'http://localhost:8123',
    size: 350,
    latencyTargetMs: 200,
    useCases: ['complex_analysis', 'verification', 'multi_step'],
    keywords: ['verify', 'audit', 'analyze', 'validate', 'check', 'confirm'],
    maxPayloadBytes: 8192,
    minStakesHbar: 100,
  },
  {
    name: 'plus',
    url: config.MERIDIAN_TIER_PLUS_URL || '',
    size: 457,
    latencyTargetMs: 300,
    useCases: ['critical_decisions', 'high_stakes', 'edge_cases'],
    keywords: ['critical', 'urgent', 'emergency', 'compliance', 'legal'],
    maxPayloadBytes: 16384,
    minStakesHbar: 1000,
  },
  {
    name: 'external',
    url: config.MERIDIAN_TIER_EXTERNAL_API_KEY ? 'https://api.openai.com/v1' : '',
    size: 1750, // GPT-4 equivalent
    latencyTargetMs: 1000,
    useCases: ['emergency_fallback', 'unprecedented_cases'],
    keywords: [],
    maxPayloadBytes: 32768,
    minStakesHbar: 0,
  },
];

export class ModelTierRouter {
  private tiers: TierConfig[];
  private complexityCache = new Map<string, TaskComplexity>();
  private readonly cacheTtlMs = 60000;

  constructor() {
    // Filter to only available tiers
    this.tiers = TIER_CONFIGS.filter(t => t.url && t.url.length > 0);

    // Always ensure at least compact tier (your training model)
    if (!this.tiers.find(t => t.name === 'compact')) {
      this.tiers.push(TIER_CONFIGS.find(t => t.name === 'compact')!);
    }

    console.log(`🔀 Model Tier Router initialized with ${this.tiers.length} tiers:`);
    this.tiers.forEach(t => console.log(`   - ${t.name} (${t.size}M): ${t.latencyTargetMs}ms target`));
  }

  /**
   * Analyze task complexity for routing
   */
  analyzeComplexity(task: VerifiableAITask): TaskComplexity {
    const cacheKey = task.taskId || JSON.stringify(task);

    // Check cache
    const cached = this.complexityCache.get(cacheKey);
    if (cached && Date.now() - (this.complexityCache.get(`${cacheKey}_ts`) as unknown as number) < this.cacheTtlMs) {
      return cached;
    }

    const description = task.description || '';
    const payload = JSON.stringify(task.payload || {});
    const payloadSize = Buffer.byteLength(payload, 'utf8');

    // Estimate tokens (rough approximation)
    const estimatedTokens = Math.ceil(description.length / 4) + Math.ceil(payloadSize / 4);

    // Keyword complexity analysis
    const allKeywords = this.tiers.flatMap(t => t.keywords);
    const keywordMatches = allKeywords.filter(kw =>
      description.toLowerCase().includes(kw.toLowerCase())
    );
    const keywordComplexity = Math.min(1, keywordMatches.length / 5);

    // Count potential tool calls in payload
    const toolCount = (payload.match(/"tool"/g) || []).length +
                     (payload.match(/"function"/g) || []).length;

    // Financial stakes
    const financialStakes = task.budgetHbar || 0;

    // Verification requirements
    const requiresVerification = /verify|validate|audit|confirm|check/i.test(description);

    // Structured data detection
    const hasStructuredData = /\{.*\}|\[.*\]/.test(payload) || payloadSize > 512;

    // Multi-step reasoning detection
    const multiStepReasoning = /then|next|after|subsequently|finally/i.test(description) ||
                               (description.match(/and|then/g) || []).length > 2;

    const complexity: TaskComplexity = {
      payloadSize,
      estimatedTokens,
      keywordComplexity,
      toolCount,
      financialStakes,
      requiresVerification,
      hasStructuredData,
      multiStepReasoning,
    };

    // Cache result
    this.complexityCache.set(cacheKey, complexity);
    this.complexityCache.set(`${cacheKey}_ts`, Date.now() as unknown as TaskComplexity);

    return complexity;
  }

  /**
   * Route task to optimal model tier
   */
  routeTask(task: VerifiableAITask): RoutingDecision {
    const complexity = this.analyzeComplexity(task);
    const availableTiers = this.tiers.filter(t => t.url && t.url.length > 0);

    if (availableTiers.length === 0) {
      return {
        selectedTier: 'compact',
        fallbackChain: [],
        estimatedLatencyMs: 200,
        confidence: 0.5,
        reason: 'No tiers configured, defaulting to compact',
      };
    }

    // Score each tier for this task
    const tierScores = availableTiers.map(tier => {
      let score = 0;
      let reasons: string[] = [];

      // Financial stakes override
      if (complexity.financialStakes >= tier.minStakesHbar) {
        score += 30;
        reasons.push('stakes match');
      }

      // Payload size match
      if (complexity.payloadSize <= tier.maxPayloadBytes) {
        score += 20;
        reasons.push('payload fits');
      }

      // Keyword match
      const keywordMatches = tier.keywords.filter(kw =>
        task.description?.toLowerCase().includes(kw.toLowerCase())
      );
      if (keywordMatches.length > 0) {
        score += 15 * keywordMatches.length;
        reasons.push(`keywords: ${keywordMatches.join(', ')}`);
      }

      // Complexity indicators
      if (complexity.requiresVerification && tier.name !== 'tiny') {
        score += 10;
        reasons.push('verification needed');
      }

      if (complexity.multiStepReasoning && tier.size >= 350) {
        score += 15;
        reasons.push('multi-step reasoning');
      }

      if (complexity.hasStructuredData && tier.size >= 260) {
        score += 10;
        reasons.push('structured data');
      }

      if (complexity.toolCount > 2 && tier.size >= 350) {
        score += 10;
        reasons.push('multiple tools');
      }

      // Prefer faster models for simple tasks
      if (complexity.keywordComplexity < 0.3 && tier.latencyTargetMs < 100) {
        score += 20;
        reasons.push('simple task, fast tier preferred');
      }

      return {
        tier,
        score,
        reasons,
        confidence: Math.min(0.95, score / 100),
      };
    });

    // Sort by score descending
    tierScores.sort((a, b) => b.score - a.score);

    // Build fallback chain (next 2 tiers or external)
    const selectedTier = tierScores[0].tier.name;
    const fallbackChain = tierScores
      .slice(1, 3)
      .map(s => s.tier.name)
      .filter(t => t !== selectedTier);

    // Always include external as final fallback if available
    if (this.tiers.find(t => t.name === 'external') && !fallbackChain.includes('external')) {
      fallbackChain.push('external');
    }

    return {
      selectedTier,
      fallbackChain,
      estimatedLatencyMs: tierScores[0].tier.latencyTargetMs,
      confidence: tierScores[0].confidence,
      reason: tierScores[0].reasons.join(', '),
    };
  }

  /**
   * Get tier configuration
   */
  getTierConfig(tier: ModelTier): TierConfig | undefined {
    return this.tiers.find(t => t.name === tier);
  }

  /**
   * Get all available tiers
   */
  getAvailableTiers(): ModelTier[] {
    return this.tiers.map(t => t.name);
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    availableTiers: number;
    totalTiers: number;
    cacheSize: number;
    tiers: Array<{ name: ModelTier; size: number; url: string }>;
  } {
    return {
      availableTiers: this.tiers.length,
      totalTiers: TIER_CONFIGS.length,
      cacheSize: this.complexityCache.size / 2, // Divide by 2 because we store timestamp too
      tiers: this.tiers.map(t => ({ name: t.name, size: t.size, url: t.url })),
    };
  }

  /**
   * Clear complexity cache
   */
  clearCache(): void {
    this.complexityCache.clear();
  }
}

// Global router instance
export const modelTierRouter = new ModelTierRouter();
