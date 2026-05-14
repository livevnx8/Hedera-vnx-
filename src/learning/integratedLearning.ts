/**
 * Integrated Learning System for Vera
 * Combines HCS adaptive learning with sovereign fine-tuning
 */

import { HCSAdaptiveLearning, createHCSAdaptiveLearning } from './hcsAdaptiveLearning.js';
import { EnhancedModelRouter, createEnhancedRouter } from '../llm/enhancedModelRouter.js';
import { type LlmProvider, type ChatCompletionRequest, type ChatCompletionResult } from '../llm/provider.js';

interface LearningConfig {
  enableHCSLearning: boolean;
  enableAutoFineTuning: boolean;
  learningThreshold: number; // Minimum interactions before fine-tuning
  feedbackWeight: number; // Weight of user feedback in learning
}

export class IntegratedLearningSystem implements LlmProvider {
  private hcsLearning: HCSAdaptiveLearning;
  private modelRouter: EnhancedModelRouter;
  private baseProvider: LlmProvider;
  private config: LearningConfig;
  private interactionCount: number = 0;

  constructor(baseProvider: LlmProvider, config: Partial<LearningConfig> = {}) {
    this.baseProvider = baseProvider;
    this.modelRouter = createEnhancedRouter();
    this.hcsLearning = createHCSAdaptiveLearning();
    
    this.config = {
      enableHCSLearning: true,
      enableAutoFineTuning: false, // Disabled by default for manual control
      learningThreshold: 100,
      feedbackWeight: 0.7,
      ...config
    };
  }

  /**
   * Initialize the integrated learning system
   */
  async initialize(): Promise<void> {
    console.log('🎓 Initializing Vera Integrated Learning System...');
    
    if (this.config.enableHCSLearning) {
      await this.hcsLearning.initialize();
      console.log('✅ HCS Adaptive Learning enabled');
    }
    
    console.log('📊 Learning configuration:', this.config);
    console.log('🎯 Integrated Learning System ready');
  }

  /**
   * Enhanced chat completion with learning integration
   */
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const startTime = Date.now();
    const userQuery = req.messages[req.messages.length - 1]?.content || '';
    
    try {
      // Use enhanced model router for intelligent routing
      const result = await this.modelRouter.chat(req);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Record interaction for learning (async, non-blocking)
      if (this.config.enableHCSLearning) {
        this.recordInteractionAsync({
          user_query: userQuery,
          vera_response: result.content,
          category: this.categorizeQuery(userQuery) as 'conversation' | 'hedera_tools' | 'carbon_credits' | 'defi_analytics' | 'error_handling',
          tools_used: this.extractToolsUsed(req),
          response_time_ms: responseTime,
          success: true,
          context: this.extractContext(req)
        }).catch(error => {
          console.warn('⚠️ Failed to record learning interaction:', error);
        });
      }
      
      this.interactionCount++;
      
      // Check if auto fine-tuning should be triggered
      if (this.config.enableAutoFineTuning && this.interactionCount >= this.config.learningThreshold) {
        this.triggerAutoFineTuning().catch(error => {
          console.warn('⚠️ Auto fine-tuning failed:', error);
        });
      }
      
      return result;
      
    } catch (error) {
      // Record failed interaction
      if (this.config.enableHCSLearning) {
        this.recordInteractionAsync({
          user_query: userQuery,
          vera_response: `Error: ${error.message}`,
          category: this.categorizeQuery(userQuery) as 'conversation' | 'hedera_tools' | 'carbon_credits' | 'defi_analytics' | 'error_handling',
          tools_used: [],
          response_time_ms: Date.now() - startTime,
          success: false,
          context: this.extractContext(req)
        }).catch(() => {}); // Ignore errors in error recording
      }
      
      throw error;
    }
  }

  /**
   * Record interaction asynchronously (non-blocking)
   */
  private async recordInteractionAsync(interaction: {
    user_query: string;
    vera_response: string;
    category: 'conversation' | 'hedera_tools' | 'carbon_credits' | 'defi_analytics' | 'error_handling';
    tools_used: string[];
    response_time_ms: number;
    success: boolean;
    context: string;
  }): Promise<void> {
    try {
      await this.hcsLearning.recordInteraction(interaction);
    } catch (error) {
      // Silently fail to not impact user experience
      console.warn('Learning recording failed:', error);
    }
  }

  /**
   * Categorize query for learning
   */
  private categorizeQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    // Hedera tools keywords
    const hederaKeywords = [
      'hedera', 'hashgraph', 'hts', 'token', 'nft', 'smart contract',
      'account', 'balance', 'transaction', 'consensus', 'hcs', 'mirror node',
      'create token', 'mint', 'burn', 'freeze', 'wipe', 'associate', 'dissociate'
    ];

    // Carbon credits keywords
    const carbonKeywords = [
      'carbon', 'credit', 'dovu', 'verification', 'offset', 'emissions',
      'climate', 'sustainability', 'green', 'environmental', 'co2'
    ];

    // DeFi analytics keywords
    const defiKeywords = [
      'defi', 'yield', 'staking', 'liquidity', 'farming', 'apy', 'returns',
      'saucerswap', 'pool', 'trading', 'swap', 'lending', 'borrowing'
    ];

    // Error handling keywords
    const errorKeywords = [
      'error', 'failed', 'issue', 'problem', 'troubleshoot', 'fix',
      'help', 'stuck', 'broken', 'not working', 'recover', 'lost'
    ];

    // Check for Hedera tools
    if (hederaKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'hedera_tools';
    }

    // Check for carbon credits
    if (carbonKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'carbon_credits';
    }

    // Check for DeFi analytics
    if (defiKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'defi_analytics';
    }

    // Check for error handling
    if (errorKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'error_handling';
    }

    // Default to conversation
    return 'conversation';
  }

  /**
   * Extract tools used from request
   */
  private extractToolsUsed(req: ChatCompletionRequest): string[] {
    // Extract from request metadata - simplified for now
    return [];
  }

  /**
   * Extract context from request
   */
  private extractContext(req: ChatCompletionRequest): string {
    const contextParts: any[] = [];
    
    if (req.model) {
      contextParts.push(`model: ${req.model}`);
    }
    
    if (req.max_tokens) {
      contextParts.push(`max_tokens: ${req.max_tokens}`);
    }
    
    if (req.temperature) {
      contextParts.push(`temperature: ${req.temperature}`);
    }
    
    return contextParts.join(', ');
  }

  /**
   * Trigger automatic fine-tuning based on learning data
   */
  private async triggerAutoFineTuning(): Promise<void> {
    console.log('🔄 Triggering automatic fine-tuning based on learning data...');
    
    try {
      // Generate training data from HCS learning
      const trainingData = await this.hcsLearning.generateTrainingData();
      
      // Check if we have enough data for meaningful fine-tuning
      if (trainingData.conversation.length < 50 || trainingData.hedera.length < 30) {
        console.log('⚠️ Insufficient learning data for auto fine-tuning');
        return;
      }
      
      console.log(`📊 Auto fine-tuning with ${trainingData.conversation.length} conversation and ${trainingData.hedera.length} Hedera examples`);
      
      // In a full implementation, this would trigger the fine-tuning scripts
      // For now, we'll just export the data for manual fine-tuning
      await this.hcsLearning.exportForFineTuning();
      
      // Reset interaction count
      this.interactionCount = 0;
      
      console.log('✅ Auto fine-tuning data exported successfully');
      
    } catch (error) {
      console.error('❌ Auto fine-tuning failed:', error);
    }
  }

  /**
   * Get comprehensive learning analytics
   */
  async getLearningAnalytics(): Promise<{
    metrics: any;
    insights: any;
    routingStats: any;
    recommendations: string[];
  }> {
    const metrics = await this.hcsLearning.calculateMetrics();
    const insights = await this.hcsLearning.getLearningInsights();
    const routingStats = this.modelRouter.getRoutingStats();
    
    const recommendations: string[] = [
      ...insights.recommendations,
      ...this.generateLearningRecommendations(metrics)
    ];
    
    return {
      metrics,
      insights,
      routingStats,
      recommendations
    };
  }

  /**
   * Generate learning-specific recommendations
   */
  private generateLearningRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];
    
    if (metrics.total_interactions < 100) {
      recommendations.push('Increase interaction volume to improve learning accuracy');
    }
    
    if (metrics.success_rate < 85) {
      recommendations.push('Focus on improving success rate through targeted fine-tuning');
    }
    
    if (metrics.average_response_time > 3000) {
      recommendations.push('Optimize response times through model efficiency improvements');
    }
    
    // Category-specific recommendations
    for (const [category, performance] of Object.entries(metrics.category_performance as Record<string, { success_rate: number }>)) {
      const perf = performance as { success_rate: number };
      if (perf.success_rate < 80) {
        recommendations.push(`Improve ${category} category performance (current: ${perf.success_rate.toFixed(1)}%)`);
      }
    }
    
    return recommendations;
  }

  /**
   * Manual fine-tuning trigger
   */
  async triggerManualFineTuning(): Promise<any> {
    console.log('🎯 Manual fine-tuning triggered...');
    
    try {
      // Generate training data
      const trainingData = await this.hcsLearning.generateTrainingData();
      
      // Export for fine-tuning
      await this.hcsLearning.exportForFineTuning();
      
      console.log('✅ Manual fine-tuning data exported');
      console.log(`📊 Conversation examples: ${trainingData.conversation.length}`);
      console.log(`📊 Hedera examples: ${trainingData.hedera.length}`);
      
      return trainingData;
      
    } catch (error) {
      console.error('❌ Manual fine-tuning failed:', error);
      throw error;
    }
  }

  /**
   * Get learning system status
   */
  getStatus(): {
    enabled: boolean;
    hcsLearning: boolean;
    autoFineTuning: boolean;
    interactionCount: number;
    learningThreshold: number;
    nextAutoTune: number;
  } {
    return {
      enabled: this.config.enableHCSLearning,
      hcsLearning: this.config.enableHCSLearning,
      autoFineTuning: this.config.enableAutoFineTuning,
      interactionCount: this.interactionCount,
      learningThreshold: this.config.learningThreshold,
      nextAutoTune: Math.max(0, this.config.learningThreshold - this.interactionCount)
    };
  }

  /**
   * Update learning configuration
   */
  updateConfig(newConfig: Partial<LearningConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 Learning configuration updated:', newConfig);
  }
}

/**
 * Create integrated learning system
 */
export function createIntegratedLearning(
  baseProvider: LlmProvider,
  config?: Partial<LearningConfig>
): IntegratedLearningSystem {
  return new IntegratedLearningSystem(baseProvider, config);
}
