/**
 * Vera HCS Adaptive Learning System
 * Continuous learning through Hedera Consensus Service with full sovereignty
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, TopicMessageQuery, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

interface LearningInteraction {
  id: string;
  timestamp: number;
  category: 'conversation' | 'hedera_tools' | 'carbon_credits' | 'defi_analytics' | 'error_handling';
  user_query: string;
  vera_response: string;
  user_feedback?: 'positive' | 'negative' | 'neutral';
  tools_used: string[];
  response_time_ms: number;
  success: boolean;
  context: string;
}

interface LearningMetrics {
  total_interactions: number;
  success_rate: number;
  average_response_time: number;
  category_performance: Record<string, {
    count: number;
    success_rate: number;
    avg_response_time: number;
  }>;
  learning_progress: {
    week_over_week_improvement: number;
    accuracy_trend: 'improving' | 'stable' | 'declining';
    knowledge_expansion: number;
  };
}

export class HCSAdaptiveLearning {
  private client: Client;
  private learningTopicId: string | null = null;
  private metricsTopicId: string | null = null;
  private learningDataPath: string;
  private metricsPath: string;

  constructor() {
    this.client = Client.forName(config.HEDERA_NETWORK);
    this.learningDataPath = path.join(process.cwd(), 'data/learning-interactions.jsonl');
    this.metricsPath = path.join(process.cwd(), 'data/learning-metrics.json');
  }

  /**
   * Initialize HCS learning system
   */
  async initialize(): Promise<void> {
    logger.info('HCSAdaptiveLearning', { message: 'Initializing Vera HCS Adaptive Learning System' });
    
    try {
      // Set up Hedera client
      if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
        const privateKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY);
        this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
      }

      // Create or load learning topics
      await this.setupLearningTopics();
      
      // Load existing learning data
      await this.loadLearningData();
      
      logger.info('HCSAdaptiveLearning', { message: 'HCS Adaptive Learning System initialized', learningTopic: this.learningTopicId, metricsTopic: this.metricsTopicId });
      
    } catch (error) {
      logger.error('HCSAdaptiveLearning', { message: 'Failed to initialize HCS learning', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Create HCS topics for learning data
   */
  private async setupLearningTopics(): Promise<void> {
    try {
      // Check if topics already exist in environment
      this.learningTopicId = process.env.VERA_LEARNING_TOPIC_ID;
      this.metricsTopicId = process.env.VERA_METRICS_TOPIC_ID;
      
      if (this.learningTopicId && this.metricsTopicId) {
        logger.info('HCSAdaptiveLearning', { message: 'Using existing HCS topics' });
        return;
      }

      logger.info('HCSAdaptiveLearning', { message: 'Creating new HCS learning topics' });
      
      // Get private key for signing
      const privateKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY!);
      
      // Create learning interactions topic
      const learningTopicTx = await new TopicCreateTransaction()
        .setTopicMemo('Vera Learning Interactions - Continuous Improvement Data')
        .freezeWith(this.client);

      const learningTopicSign = await learningTopicTx.sign(privateKey);
      const learningTopicSubmit = await learningTopicSign.execute(this.client);
      const learningTopicReceipt = await learningTopicSubmit.getReceipt(this.client);
      
      this.learningTopicId = learningTopicReceipt.topicId.toString();
      
      // Create metrics topic
      const metricsTopicTx = await new TopicCreateTransaction()
        .setTopicMemo('Vera Learning Metrics - Performance Analytics')
        .freezeWith(this.client);

      const metricsTopicSign = await metricsTopicTx.sign(privateKey);
      const metricsTopicSubmit = await metricsTopicSign.execute(this.client);
      const metricsTopicReceipt = await metricsTopicSubmit.getReceipt(this.client);
      
      this.metricsTopicId = metricsTopicReceipt.topicId.toString();
      
      logger.info('HCSAdaptiveLearning', { learningTopic: this.learningTopicId, metricsTopic: this.metricsTopicId, message: 'Created HCS learning topics' });
      
      // Save topic IDs to environment file
      await this.saveTopicIds();
      
    } catch (error) {
      logger.error('HCSAdaptiveLearning', { message: 'Failed to setup HCS topics', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Save topic IDs to environment
   */
  private async saveTopicIds(): Promise<void> {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // .env may not exist yet
    }

    const learningLine = `VERA_LEARNING_TOPIC_ID=${this.learningTopicId}`;
    const metricsLine = `VERA_METRICS_TOPIC_ID=${this.metricsTopicId}`;

    // Replace existing lines or append
    const updateVar = (content: string, key: string, line: string): string => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, line);
      }
      return content + `\n${line}`;
    };

    envContent = updateVar(envContent, 'VERA_LEARNING_TOPIC_ID', learningLine);
    envContent = updateVar(envContent, 'VERA_METRICS_TOPIC_ID', metricsLine);

    await fs.writeFile(envPath, envContent.trim() + '\n');
  }

  /**
   * Record a learning interaction
   */
  async recordInteraction(interaction: Omit<LearningInteraction, 'id' | 'timestamp'>): Promise<string> {
    const learningInteraction: LearningInteraction = {
      ...interaction,
      id: this.generateInteractionId(),
      timestamp: Date.now()
    };

    try {
      // Store locally
      await this.storeInteractionLocally(learningInteraction);
      
      // Submit to HCS for immutable storage
      if (this.learningTopicId) {
        await this.submitToHCS(learningInteraction);
      }
      
      // Update metrics
      await this.updateMetrics(learningInteraction);
      
      logger.info('HCSAdaptiveLearning', { interactionId: learningInteraction.id, category: learningInteraction.category, message: 'Recorded interaction' });
      
      return learningInteraction.id;
      
    } catch (error) {
      logger.error('HCSAdaptiveLearning', { message: 'Failed to record interaction', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Store interaction locally for immediate access
   */
  private async storeInteractionLocally(interaction: LearningInteraction): Promise<void> {
    // Ensure directory exists (defensive in case initialize() wasn't called)
    try {
      await fs.mkdir(path.dirname(this.learningDataPath), { recursive: true });
    } catch { /* directory may already exist */ }
    const line = JSON.stringify(interaction) + '\n';
    await fs.appendFile(this.learningDataPath, line);
  }

  /**
   * Submit learning data to HCS
   */
  private async submitToHCS(interaction: LearningInteraction): Promise<void> {
    if (!this.learningTopicId) return;
    
    const message = JSON.stringify({
      version: '1.0',
      interaction: interaction,
      checksum: this.calculateChecksum(interaction)
    });
    
    const privateKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY!);
    
    const messageTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.learningTopicId)
      .setMessage(message)
      .freezeWith(this.client);

    const messageSign = await messageTx.sign(privateKey);
    const messageSubmit = await messageSign.execute(this.client);
    await messageSubmit.getReceipt(this.client);
  }

  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: any): string {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Generate unique interaction ID
   */
  private generateInteractionId(): string {
    return `vera-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update learning metrics
   */
  private async updateMetrics(newInteraction: LearningInteraction): Promise<void> {
    const metrics = await this.calculateMetrics();
    
    // Submit metrics to HCS
    if (this.metricsTopicId) {
      const metricsMessage = JSON.stringify({
        timestamp: Date.now(),
        metrics: metrics,
        trigger_interaction: newInteraction.id
      });
      
      const privateKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY!);
      
      const metricsTx = await new TopicMessageSubmitTransaction()
        .setTopicId(this.metricsTopicId)
        .setMessage(metricsMessage)
        .freezeWith(this.client);

      const metricsSign = await metricsTx.sign(privateKey);
      const metricsSubmit = await metricsSign.execute(this.client);
      await metricsSubmit.getReceipt(this.client);
    }
    
    // Save locally
    await fs.writeFile(this.metricsPath, JSON.stringify(metrics, null, 2));
  }

  /**
   * Calculate comprehensive learning metrics
   */
  async calculateMetrics(): Promise<LearningMetrics> {
    const interactions = await this.loadRecentInteractions(1000); // Last 1000 interactions
    
    if (interactions.length === 0) {
      return this.getEmptyMetrics();
    }
    
    const totalInteractions = interactions.length;
    const successfulInteractions = interactions.filter(i => i.success).length;
    const successRate = (successfulInteractions / totalInteractions) * 100;
    
    const responseTimes = interactions.map(i => i.response_time_ms);
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    // Category-specific performance
    const categoryPerformance: Record<string, any> = {};
    const categories = [...new Set(interactions.map(i => i.category))];
    
    for (const category of categories) {
      const categoryInteractions = interactions.filter(i => i.category === category);
      const categorySuccess = categoryInteractions.filter(i => i.success).length;
      const categoryAvgTime = categoryInteractions.reduce((sum, i) => sum + i.response_time_ms, 0) / categoryInteractions.length;
      
      categoryPerformance[category] = {
        count: categoryInteractions.length,
        success_rate: (categorySuccess / categoryInteractions.length) * 100,
        avg_response_time: categoryAvgTime
      };
    }
    
    // Learning progress analysis
    const learningProgress = await this.analyzeLearningProgress(interactions);
    
    return {
      total_interactions: totalInteractions,
      success_rate: successRate,
      average_response_time: averageResponseTime,
      category_performance: categoryPerformance,
      learning_progress: learningProgress
    };
  }

  /**
   * Analyze learning progress over time
   */
  private async analyzeLearningProgress(interactions: LearningInteraction[]): Promise<any> {
    if (interactions.length < 100) {
      return {
        week_over_week_improvement: 0,
        accuracy_trend: 'stable' as const,
        knowledge_expansion: 0
      };
    }
    
    // Compare recent week vs previous week
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);
    
    const recentInteractions = interactions.filter(i => i.timestamp >= oneWeekAgo);
    const previousInteractions = interactions.filter(i => i.timestamp >= twoWeeksAgo && i.timestamp < oneWeekAgo);
    
    if (previousInteractions.length === 0 || recentInteractions.length === 0) {
      return {
        week_over_week_improvement: 0,
        accuracy_trend: 'stable' as const,
        knowledge_expansion: 0
      };
    }
    
    const recentSuccessRate = recentInteractions.filter(i => i.success).length / recentInteractions.length;
    const previousSuccessRate = previousInteractions.filter(i => i.success).length / previousInteractions.length;
    
    const weekOverWeekImprovement = ((recentSuccessRate - previousSuccessRate) / previousSuccessRate) * 100;
    
    // Determine trend
    let accuracyTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (weekOverWeekImprovement > 2) accuracyTrend = 'improving';
    else if (weekOverWeekImprovement < -2) accuracyTrend = 'declining';
    
    // Knowledge expansion (unique categories/tools used)
    const recentCategories = new Set(recentInteractions.map(i => i.category)).size;
    const previousCategories = new Set(previousInteractions.map(i => i.category)).size;
    const knowledgeExpansion = Math.max(0, recentCategories - previousCategories);
    
    return {
      week_over_week_improvement: weekOverWeekImprovement,
      accuracy_trend: accuracyTrend,
      knowledge_expansion: knowledgeExpansion
    };
  }

  /**
   * Load recent interactions for analysis
   */
  private async loadRecentInteractions(limit: number): Promise<LearningInteraction[]> {
    try {
      const data = await fs.readFile(this.learningDataPath, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.length > 0);
      const interactions = lines.map(line => JSON.parse(line));
      
      // Return most recent interactions
      return interactions.slice(-limit);
    } catch (error) {
      return [];
    }
  }

  /**
   * Load existing learning data
   */
  private async loadLearningData(): Promise<void> {
    // Ensure data directory exists
    try {
      await fs.mkdir(path.dirname(this.learningDataPath), { recursive: true });
    } catch { /* directory may already exist */ }

    try {
      await fs.access(this.learningDataPath);
    } catch {
      await fs.writeFile(this.learningDataPath, '');
    }

    try {
      await fs.access(this.metricsPath);
    } catch {
      await fs.writeFile(this.metricsPath, JSON.stringify(this.getEmptyMetrics(), null, 2));
    }
  }

  /**
   * Get empty metrics structure
   */
  private getEmptyMetrics(): LearningMetrics {
    return {
      total_interactions: 0,
      success_rate: 0,
      average_response_time: 0,
      category_performance: {},
      learning_progress: {
        week_over_week_improvement: 0,
        accuracy_trend: 'stable',
        knowledge_expansion: 0
      }
    };
  }

  /**
   * Generate training data from HCS learning
   */
  async generateTrainingData(): Promise<{
    conversation: Array<{instruction: string; input: string; output: string}>;
    hedera: Array<{instruction: string; input: string; output: string}>;
  }> {
    logger.info('HCSAdaptiveLearning', { message: 'Generating training data from HCS learning interactions' });
    
    const interactions = await this.loadRecentInteractions(500);
    const successfulInteractions = interactions.filter(i => i.success && i.user_feedback !== 'negative');
    
    const conversationData: Array<{instruction: string; input: string; output: string}> = [];
    const hederaData: Array<{instruction: string; input: string; output: string}> = [];
    
    for (const interaction of successfulInteractions) {
      const trainingExample = {
        instruction: interaction.user_query,
        input: `Category: ${interaction.category}, Tools: ${interaction.tools_used.join(', ')}, Context: ${interaction.context}`,
        output: interaction.vera_response
      };
      
      if (interaction.category === 'conversation' || interaction.category === 'error_handling') {
        conversationData.push(trainingExample);
      } else {
        hederaData.push(trainingExample);
      }
    }
    
    logger.info('HCSAdaptiveLearning', { conversationExamples: conversationData.length, hederaExamples: hederaData.length, message: 'Generated training data' });
    
    return {
      conversation: conversationData,
      hedera: hederaData
    };
  }

  /**
   * Get learning insights and recommendations
   */
  async getLearningInsights(): Promise<{
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  }> {
    const metrics = await this.calculateMetrics();
    const insights = {
      strengths: [] as string[],
      improvements: [] as string[],
      recommendations: [] as string[]
    };
    
    // Analyze strengths
    if (metrics.success_rate > 90) {
      insights.strengths.push('Excellent overall success rate');
    }
    
    if (metrics.average_response_time < 2000) {
      insights.strengths.push('Fast response times');
    }
    
    // Analyze category performance
    for (const [category, performance] of Object.entries(metrics.category_performance)) {
      if (performance.success_rate > 95) {
        insights.strengths.push(`Outstanding performance in ${category}`);
      } else if (performance.success_rate < 80) {
        insights.improvements.push(`Needs improvement in ${category} (success rate: ${performance.success_rate.toFixed(1)}%)`);
      }
    }
    
    // Learning progress recommendations
    if (metrics.learning_progress.accuracy_trend === 'improving') {
      insights.recommendations.push('Continue current learning approach - showing improvement');
    } else if (metrics.learning_progress.accuracy_trend === 'declining') {
      insights.recommendations.push('Review recent changes - accuracy declining');
    }
    
    if (metrics.learning_progress.knowledge_expansion === 0) {
      insights.recommendations.push('Explore new categories and tools to expand knowledge');
    }
    
    return insights;
  }

  /**
   * Export learning data for fine-tuning
   */
  async exportForFineTuning(): Promise<void> {
    logger.info('HCSAdaptiveLearning', { message: 'Exporting HCS learning data for fine-tuning' });
    
    const trainingData = await this.generateTrainingData();
    const exportPath = path.join(process.cwd(), 'training-data/hcs-generated');
    
    await fs.mkdir(exportPath, { recursive: true });
    
    // Export conversation data
    const conversationDataset = {
      examples: trainingData.conversation,
      metadata: {
        total_examples: trainingData.conversation.length,
        source: 'hcs_adaptive_learning',
        generated_at: new Date().toISOString(),
        category: 'conversation_enhancement'
      }
    };
    
    await fs.writeFile(
      path.join(exportPath, 'hcs-conversation-enhancement.jsonl'),
      JSON.stringify(conversationDataset, null, 2)
    );
    
    // Export Hedera data
    const hederaDataset = {
      examples: trainingData.hedera,
      metadata: {
        total_examples: trainingData.hedera.length,
        source: 'hcs_adaptive_learning',
        generated_at: new Date().toISOString(),
        category: 'hedera_tools_optimization'
      }
    };
    
    await fs.writeFile(
      path.join(exportPath, 'hcs-hedera-tools-optimization.jsonl'),
      JSON.stringify(hederaDataset, null, 2)
    );
    
    logger.info('HCSAdaptiveLearning', { exportPath, conversationExamples: trainingData.conversation.length, hederaExamples: trainingData.hedera.length, message: 'Exported HCS learning data for fine-tuning' });
  }
}

/**
 * Create HCS adaptive learning instance
 */
export function createHCSAdaptiveLearning(): HCSAdaptiveLearning {
  return new HCSAdaptiveLearning();
}
