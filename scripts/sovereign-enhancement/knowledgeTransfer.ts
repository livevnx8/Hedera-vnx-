#!/usr/bin/env tsx

/**
 * Vera Sovereign Enhancement - Knowledge Transfer Pipeline
 * 
 * This script extracts Vera's existing knowledge and uses Gemini to generate
 * enhanced training datasets for sovereign fine-tuning.
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../../src/config.js';
import { createLlmClient, isGoogleProvider } from '../../src/llm/realProvider.js';

interface TrainingExample {
  input: string;
  output: string;
  category: 'general' | 'hedera_tools' | 'carbon_credits' | 'defi_analytics' | 'error_handling';
  context?: string;
  tools_used?: string[];
}

interface KnowledgeDataset {
  examples: TrainingExample[];
  metadata: {
    total_examples: number;
    categories: Record<string, number>;
    generated_at: string;
    source: 'vera_history' | 'gemini_enhanced';
  };
}

class KnowledgeTransferPipeline {
  private client: any;
  private outputDir: string;

  constructor() {
    this.client = createLlmClient();
    this.outputDir = path.join(process.cwd(), 'training-data');
  }

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Vera Sovereign Enhancement Pipeline...');
    
    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Verify Google provider for knowledge enhancement
    if (!isGoogleProvider()) {
      console.warn('⚠️  Google provider not configured. Knowledge enhancement will be limited.');
    }
    
    console.log('✅ Pipeline initialized');
  }

  /**
   * Extract existing conversation history from work records
   */
  async extractVeraHistory(): Promise<TrainingExample[]> {
    console.log('📖 Extracting Vera conversation history...');
    
    const workRecordsPath = path.join(process.cwd(), 'data/work-records-cache.json');
    const examples: TrainingExample[] = [];
    
    try {
      const data = await fs.readFile(workRecordsPath, 'utf-8');
      const records = JSON.parse(data).records;
      
      for (const record of records) {
        if (record.success && record.outputs?.result) {
          const example: TrainingExample = {
            input: record.description || record.inputs?.task || '',
            output: record.outputs.result,
            category: this.categorizeTask(record.description),
            context: record.taskType,
            tools_used: record.toolsUsed || []
          };
          
          examples.push(example);
        }
      }
      
      console.log(`✅ Extracted ${examples.length} examples from Vera history`);
      return examples;
    } catch (error) {
      console.error('❌ Error extracting Vera history:', error);
      return [];
    }
  }

  /**
   * Categorize tasks based on description
   */
  private categorizeTask(description: string): TrainingExample['category'] {
    const desc = description.toLowerCase();
    
    if (desc.includes('defi') || desc.includes('yield') || desc.includes('staking')) {
      return 'defi_analytics';
    }
    if (desc.includes('carbon') || desc.includes('dovu') || desc.includes('verification')) {
      return 'carbon_credits';
    }
    if (desc.includes('security') || desc.includes('audit') || desc.includes('error')) {
      return 'error_handling';
    }
    if (desc.includes('token') || desc.includes('contract') || desc.includes('hedera')) {
      return 'hedera_tools';
    }
    
    return 'general';
  }

  /**
   * Use Gemini to enhance existing examples
   */
  async enhanceWithGemini(examples: TrainingExample[]): Promise<TrainingExample[]> {
    console.log('🚀 Enhancing examples with Gemini knowledge transfer...');
    
    if (!isGoogleProvider()) {
      console.log('⚠️  Skipping Gemini enhancement (not configured)');
      return examples;
    }
    
    const enhancedExamples: TrainingExample[] = [];
    const batchSize = 10; // Process in batches to avoid rate limits
    
    for (let i = 0; i < examples.length; i += batchSize) {
      const batch = examples.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(examples.length / batchSize)}...`);
      
      for (const example of batch) {
        try {
          const enhanced = await this.enhanceExample(example);
          enhancedExamples.push(enhanced);
          
          // Add delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Error enhancing example: ${example.input.slice(0, 50)}...`, error);
          // Keep original example if enhancement fails
          enhancedExamples.push(example);
        }
      }
    }
    
    console.log(`✅ Enhanced ${enhancedExamples.length} examples with Gemini`);
    return enhancedExamples;
  }

  /**
   * Enhance a single example using Gemini
   */
  private async enhanceExample(example: TrainingExample): Promise<TrainingExample> {
    const prompt = this.createEnhancementPrompt(example);
    
    const response = await this.client.chat.completions.create({
      model: config.DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Vera's knowledge enhancement AI. Your task is to improve and expand upon existing training examples to create more comprehensive and educational responses for sovereign fine-tuning. Focus on:
1. Technical accuracy and detail
2. Clear explanations
3. Hedera-specific expertise
4. Practical examples and best practices
5. Error handling and edge cases

Maintain the original intent while significantly improving the quality and depth of the response.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });
    
    const enhancedOutput = response.choices[0]?.message.content || example.output;
    
    return {
      ...example,
      output: enhancedOutput,
      // Mark as enhanced
      context: example.context ? `${example.context} (gemini-enhanced)` : 'gemini-enhanced'
    };
  }

  /**
   * Create enhancement prompt for Gemini
   */
  private createEnhancementPrompt(example: TrainingExample): string {
    return `Please enhance this training example for Vera's sovereign AI model:

CATEGORY: ${example.category}
ORIGINAL INPUT: ${example.input}
ORIGINAL OUTPUT: ${example.output}
TOOLS USED: ${example.tools_used?.join(', ') || 'none'}

Please provide an enhanced, more comprehensive response that:
1. Explains concepts more clearly
2. Includes specific Hedera technical details when relevant
3. Provides practical examples and best practices
4. Anticipates common follow-up questions
5. Includes error handling considerations when appropriate

The enhanced response should maintain the original purpose while being more educational and thorough.`;
  }

  /**
   * Generate synthetic examples for edge cases and new scenarios
   */
  async generateSyntheticExamples(): Promise<TrainingExample[]> {
    console.log('🎭 Generating synthetic examples for edge cases...');
    
    if (!isGoogleProvider()) {
      console.log('⚠️  Skipping synthetic generation (not configured)');
      return [];
    }
    
    const syntheticPrompts = this.getSyntheticPrompts();
    const syntheticExamples: TrainingExample[] = [];
    
    for (const prompt of syntheticPrompts) {
      try {
        const example = await this.generateSyntheticExample(prompt);
        syntheticExamples.push(example);
        
        // Add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Error generating synthetic example: ${prompt.category}`, error);
      }
    }
    
    console.log(`✅ Generated ${syntheticExamples.length} synthetic examples`);
    return syntheticExamples;
  }

  /**
   * Get prompts for synthetic example generation
   */
  private getSyntheticPrompts(): Array<{ category: TrainingExample['category']; prompt: string }> {
    return [
      {
        category: 'hedera_tools',
        prompt: 'Create a comprehensive guide for someone who wants to create their first NFT collection on Hedera, including step-by-step instructions, common pitfalls, and best practices.'
      },
      {
        category: 'carbon_credits',
        prompt: 'Explain the carbon credit verification process on Hedera, including how DOVU integration works and what makes blockchain verification valuable.'
      },
      {
        category: 'defi_analytics',
        prompt: 'Provide a detailed analysis of yield farming strategies on Hedera, including risk assessment and optimization techniques.'
      },
      {
        category: 'error_handling',
        prompt: 'Create a troubleshooting guide for common Hedera transaction failures, including error codes and resolution steps.'
      },
      {
        category: 'general',
        prompt: 'Explain quantum computing concepts in the context of blockchain AI, making it accessible to a technical audience.'
      }
    ];
  }

  /**
   * Generate a single synthetic example
   */
  private async generateSyntheticExample(prompt: { category: TrainingExample['category']; prompt: string }): Promise<TrainingExample> {
    const response = await this.client.chat.completions.create({
      model: config.DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Vera's training data generator. Create high-quality, educational responses that demonstrate deep expertise in the specified domain. Include practical examples, technical details, and clear explanations.`
        },
        {
          role: 'user',
          content: prompt.prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.8
    });
    
    return {
      input: prompt.prompt,
      output: response.choices[0]?.message.content || '',
      category: prompt.category,
      context: 'synthetic'
    };
  }

  /**
   * Create final training dataset
   */
  async createTrainingDataset(examples: TrainingExample[], syntheticExamples: TrainingExample[]): Promise<KnowledgeDataset> {
    console.log('📚 Creating final training dataset...');
    
    const allExamples = [...examples, ...syntheticExamples];
    
    // Categorize and count
    const categories: Record<string, number> = {};
    for (const example of allExamples) {
      categories[example.category] = (categories[example.category] || 0) + 1;
    }
    
    const dataset: KnowledgeDataset = {
      examples: allExamples,
      metadata: {
        total_examples: allExamples.length,
        categories,
        generated_at: new Date().toISOString(),
        source: 'vera_history'
      }
    };
    
    console.log(`✅ Created dataset with ${allExamples.length} total examples`);
    console.log('📊 Category distribution:', categories);
    
    return dataset;
  }

  /**
   * Save training dataset
   */
  async saveDataset(dataset: KnowledgeDataset, filename: string): Promise<void> {
    const filepath = path.join(this.outputDir, filename);
    await fs.writeFile(filepath, JSON.stringify(dataset, null, 2));
    console.log(`💾 Saved dataset to ${filepath}`);
  }

  /**
   * Create separate datasets for different fine-tuning tracks
   */
  async createTrackDatasets(dataset: KnowledgeDataset): Promise<void> {
    console.log('🎯 Creating track-specific datasets...');
    
    // Conversation enhancement dataset
    const conversationExamples = dataset.examples.filter(
      e => e.category === 'general' || e.category === 'error_handling'
    );
    
    const conversationDataset: KnowledgeDataset = {
      examples: conversationExamples,
      metadata: {
        ...dataset.metadata,
        total_examples: conversationExamples.length,
        categories: { general: conversationExamples.filter(e => e.category === 'general').length, error_handling: conversationExamples.filter(e => e.category === 'error_handling').length }
      }
    };
    
    await this.saveDataset(conversationDataset, 'conversation-enhancement.jsonl');
    
    // Hedera tools dataset
    const hederaExamples = dataset.examples.filter(
      e => e.category === 'hedera_tools' || e.category === 'carbon_credits' || e.category === 'defi_analytics'
    );
    
    const hederaDataset: KnowledgeDataset = {
      examples: hederaExamples,
      metadata: {
        ...dataset.metadata,
        total_examples: hederaExamples.length,
        categories: { hedera_tools: hederaExamples.filter(e => e.category === 'hedera_tools').length, carbon_credits: hederaExamples.filter(e => e.category === 'carbon_credits').length, defi_analytics: hederaExamples.filter(e => e.category === 'defi_analytics').length }
      }
    };
    
    await this.saveDataset(hederaDataset, 'hedera-tools-optimization.jsonl');
    
    console.log('✅ Created track-specific datasets');
  }

  /**
   * Execute the complete knowledge transfer pipeline
   */
  async execute(): Promise<void> {
    console.log('🚀 Starting Vera Sovereign Enhancement Pipeline...\n');
    
    try {
      await this.initialize();
      
      // Phase 1: Extract existing knowledge
      const existingExamples = await this.extractVeraHistory();
      
      // Phase 2: Enhance with Gemini
      const enhancedExamples = await this.enhanceWithGemini(existingExamples);
      
      // Phase 3: Generate synthetic examples
      const syntheticExamples = await this.generateSyntheticExamples();
      
      // Phase 4: Create comprehensive dataset
      const dataset = await this.createTrainingDataset(enhancedExamples, syntheticExamples);
      
      // Phase 5: Save datasets
      await this.saveDataset(dataset, 'vera-complete-dataset.jsonl');
      await this.createTrackDatasets(dataset);
      
      console.log('\n🎉 Sovereign Enhancement Pipeline Complete!');
      console.log(`📈 Generated ${dataset.metadata.total_examples} training examples`);
      console.log('📁 Datasets saved to training-data/ directory');
      console.log('\n📋 Next Steps:');
      console.log('1. Review generated datasets');
      console.log('2. Set up fine-tuning environment with Unsloth');
      console.log('3. Execute dual-track fine-tuning');
      
    } catch (error) {
      console.error('❌ Pipeline execution failed:', error);
      process.exit(1);
    }
  }
}

// Execute pipeline if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const pipeline = new KnowledgeTransferPipeline();
  pipeline.execute().catch(console.error);
}

export { KnowledgeTransferPipeline, type TrainingExample, type KnowledgeDataset };
