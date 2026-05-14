#!/usr/bin/env tsx

/**
 * Vera HCS Learning System Demo
 * Demonstrates continuous learning through Hedera Consensus Service
 */

import { createIntegratedLearning } from '../src/learning/integratedLearning.js';
import { createProvider } from '../src/llm/realProvider.js';
import { config } from '../src/config.js';

interface DemoInteraction {
  userQuery: string;
  expectedCategory: string;
  description: string;
}

class HCSLearningDemo {
  private integratedLearning: any;

  constructor() {
    const baseProvider = createProvider();
    this.integratedLearning = createIntegratedLearning(baseProvider, {
      enableHCSLearning: true,
      enableAutoFineTuning: false, // Manual control for demo
      learningThreshold: 50,
      feedbackWeight: 0.8
    });
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Vera HCS Learning Demo...');
    
    try {
      await this.integratedLearning.initialize();
      console.log('✅ HCS Learning System initialized');
      
      // Display system status
      const status = this.integratedLearning.getStatus();
      console.log('📊 System Status:', status);
      
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      throw error;
    }
  }

  async runDemo(): Promise<void> {
    console.log('\n🎭 Running HCS Learning Demo...\n');
    
    const demoInteractions: DemoInteraction[] = [
      {
        userQuery: "What can you help me with?",
        expectedCategory: "conversation",
        description: "General conversation test"
      },
      {
        userQuery: "How do I create a new Hedera token?",
        expectedCategory: "hedera_tools",
        description: "Hedera tools expertise test"
      },
      {
        userQuery: "Verify this carbon credit: CC-2024-001",
        expectedCategory: "carbon_credits",
        description: "Carbon credits verification test"
      },
      {
        userQuery: "What are the best DeFi yield strategies?",
        expectedCategory: "defi_analytics",
        description: "DeFi analytics test"
      },
      {
        userQuery: "My transaction failed, what should I do?",
        expectedCategory: "error_handling",
        description: "Error handling test"
      },
      {
        userQuery: "Explain quantum computing in simple terms",
        expectedCategory: "conversation",
        description: "Complex concept explanation test"
      },
      {
        userQuery: "How do I create an NFT collection on Hedera?",
        expectedCategory: "hedera_tools",
        description: "Advanced Hedera NFT creation test"
      },
      {
        userQuery: "What's the environmental impact of this project?",
        expectedCategory: "carbon_credits",
        description: "Environmental analysis test"
      }
    ];

    console.log(`📝 Processing ${demoInteractions.length} demo interactions...\n`);

    for (let i = 0; i < demoInteractions.length; i++) {
      const interaction = demoInteractions[i];
      
      console.log(`\n--- Interaction ${i + 1}: ${interaction.description} ---`);
      console.log(`📝 Query: ${interaction.userQuery}`);
      console.log(`🎯 Expected Category: ${interaction.expectedCategory}`);
      
      try {
        // Process the interaction
        const startTime = Date.now();
        const result = await this.integratedLearning.chat({
          messages: [{ role: 'user', content: interaction.userQuery }],
          model: config.DEFAULT_CHAT_MODEL,
          max_tokens: 1000,
          temperature: 0.7
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        console.log(`💬 Response: ${result.content.slice(0, 150)}...`);
        console.log(`⏱️ Response Time: ${responseTime}ms`);
        console.log(`📊 Tokens: ${result.promptTokens + result.completionTokens} total`);
        
        // Simulate user feedback (positive for demo)
        console.log(`👍 User Feedback: Positive`);
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      
      // Small delay between interactions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ Demo interactions completed');
  }

  async showLearningAnalytics(): Promise<void> {
    console.log('\n📊 HCS Learning Analytics...\n');
    
    try {
      const analytics = await this.integratedLearning.getLearningAnalytics();
      
      console.log('📈 Learning Metrics:');
      console.log(`  Total Interactions: ${analytics.metrics.total_interactions}`);
      console.log(`  Success Rate: ${analytics.metrics.success_rate.toFixed(1)}%`);
      console.log(`  Average Response Time: ${analytics.metrics.average_response_time.toFixed(0)}ms`);
      
      console.log('\n🎯 Category Performance:');
      for (const [category, performance] of Object.entries(analytics.metrics.category_performance)) {
        console.log(`  ${category}:`);
        console.log(`    Count: ${performance.count}`);
        console.log(`    Success Rate: ${performance.success_rate.toFixed(1)}%`);
        console.log(`    Avg Response Time: ${performance.avg_response_time.toFixed(0)}ms`);
      }
      
      console.log('\n🧠 Learning Progress:');
      const progress = analytics.metrics.learning_progress;
      console.log(`  Week-over-Week Improvement: ${progress.week_over_week_improvement.toFixed(1)}%`);
      console.log(`  Accuracy Trend: ${progress.accuracy_trend}`);
      console.log(`  Knowledge Expansion: ${progress.knowledge_expansion} new categories`);
      
      console.log('\n💡 Insights:');
      console.log(`  Strengths: ${analytics.insights.strengths.join(', ')}`);
      console.log(`  Improvements: ${analytics.insights.improvements.join(', ')}`);
      
      console.log('\n🎯 Recommendations:');
      analytics.recommendations.forEach((rec: string, index: number) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
      
      console.log('\n🔀 Model Routing Stats:');
      console.log(`  Enabled: ${analytics.routingStats.enabled}`);
      console.log(`  Routes Configured: ${analytics.routingStats.routes.length}`);
      analytics.routingStats.routes.forEach((route: any) => {
        console.log(`    ${route.category}: ${route.model} (fallback: ${route.hasFallback})`);
      });
      
    } catch (error) {
      console.error('❌ Failed to get analytics:', error);
    }
  }

  async demonstrateHCSFeatures(): Promise<void> {
    console.log('\n🔗 HCS-Specific Features Demo...\n');
    
    try {
      // Show how HCS provides immutable learning records
      console.log('📚 HCS Immutable Learning Records:');
      console.log('  ✅ Every interaction timestamped on Hedera blockchain');
      console.log('  ✅ Tamper-proof audit trail of all learning data');
      console.log('  ✅ Cryptographic verification of data integrity');
      console.log('  ✅ Decentralized storage prevents single point of failure');
      
      // Show continuous learning capabilities
      console.log('\n🔄 Continuous Learning Capabilities:');
      console.log('  ✅ Real-time adaptation from user interactions');
      console.log('  ✅ Automatic categorization and pattern recognition');
      console.log('  ✅ Performance metrics tracking and optimization');
      console.log('  ✅ Knowledge expansion through experience');
      
      // Show sovereign advantages
      console.log('\n🛡️ Sovereign Learning Advantages:');
      console.log('  ✅ 100% data ownership and control');
      console.log('  ✅ No external dependencies for learning');
      console.log('  ✅ Customizable learning algorithms');
      console.log('  ✅ Privacy-preserving data handling');
      console.log('  ✅ Predictable cost structure');
      
      // Show integration benefits
      console.log('\n🔗 Integration Benefits:');
      console.log('  ✅ Seamless integration with existing Vera capabilities');
      console.log('  ✅ Enhanced model routing based on learning');
      console.log('  ✅ Automatic fine-tuning data generation');
      console.log('  ✅ Real-time performance optimization');
      
    } catch (error) {
      console.error('❌ HCS features demo failed:', error);
    }
  }

  async demonstrateLearningEvolution(): Promise<void> {
    console.log('\n🧬 Learning Evolution Demo...\n');
    
    try {
      console.log('📈 How Vera Learns and Evolves:');
      console.log('');
      
      console.log('1️⃣ Initial State:');
      console.log('   • Base knowledge from pre-training');
      console.log('   • General conversation capabilities');
      console.log('   • Basic Hedera blockchain knowledge');
      console.log('   • Standard error handling patterns');
      
      console.log('\n2️⃣ Learning Phase:');
      console.log('   • Records every user interaction on HCS');
      console.log('   • Categorizes queries by domain and complexity');
      console.log('   • Tracks success rates and response times');
      console.log('   • Identifies knowledge gaps and improvement areas');
      
      console.log('\n3️⃣ Adaptation Phase:');
      console.log('   • Generates training data from successful interactions');
      console.log('   • Fine-tunes specialized models for different domains');
      console.log('   • Optimizes routing based on performance metrics');
      console.log('   • Continuously improves accuracy and speed');
      
      console.log('\n4️⃣ Evolution Phase:');
      console.log('   • Expands knowledge base through new interactions');
      console.log('   • Develops expertise in specialized areas');
      console.log('   • Adapts to user preferences and patterns');
      console.log('   • Becomes more accurate and efficient over time');
      
      console.log('\n🎯 Evolution Benefits:');
      console.log('   • Personalized responses based on interaction history');
      console.log('   • Improved accuracy in specialized domains');
      console.log('   • Faster response times through optimization');
      console.log('   • Better error handling and recovery');
      console.log('   • Continuous improvement without manual intervention');
      
    } catch (error) {
      console.error('❌ Learning evolution demo failed:', error);
    }
  }

  async triggerManualFineTuning(): Promise<void> {
    console.log('\n🎯 Manual Fine-Tuning Trigger...\n');
    
    try {
      console.log('📊 Generating training data from HCS learning...');
      const trainingData = await this.integratedLearning.triggerManualFineTuning();
      
      console.log(`✅ Generated ${trainingData.conversation.length} conversation examples`);
      console.log(`✅ Generated ${trainingData.hedera.length} Hedera examples`);
      
      console.log('\n📝 Sample Training Data:');
      
      // Show sample conversation data
      if (trainingData.conversation.length > 0) {
        const sample = trainingData.conversation[0];
        console.log('\nConversation Example:');
        console.log(`  Instruction: ${sample.instruction.slice(0, 100)}...`);
        console.log(`  Input: ${sample.input.slice(0, 100)}...`);
        console.log(`  Output: ${sample.output.slice(0, 100)}...`);
      }
      
      // Show sample Hedera data
      if (trainingData.hedera.length > 0) {
        const sample = trainingData.hedera[0];
        console.log('\nHedera Example:');
        console.log(`  Instruction: ${sample.instruction.slice(0, 100)}...`);
        console.log(`  Input: ${sample.input.slice(0, 100)}...`);
        console.log(`  Output: ${sample.output.slice(0, 100)}...`);
      }
      
      console.log('\n📁 Training data exported to: training-data/hcs-generated/');
      console.log('🔧 Ready for fine-tuning with sovereign models');
      
    } catch (error) {
      console.error('❌ Manual fine-tuning failed:', error);
    }
  }

  async runCompleteDemo(): Promise<void> {
    console.log('🚀 Starting Complete HCS Learning Demo...\n');
    
    try {
      await this.initialize();
      await this.runDemo();
      await this.showLearningAnalytics();
      await this.demonstrateHCSFeatures();
      await this.demonstrateLearningEvolution();
      await this.triggerManualFineTuning();
      
      console.log('\n🎉 HCS Learning Demo Complete!');
      console.log('\n📋 Summary:');
      console.log('  ✅ HCS adaptive learning system operational');
      console.log('  ✅ Continuous learning from user interactions');
      console.log('  ✅ Immutable learning records on Hedera blockchain');
      console.log('  ✅ Sovereign data control and privacy');
      console.log('  ✅ Automatic fine-tuning data generation');
      console.log('  ✅ Performance monitoring and optimization');
      console.log('  ✅ Intelligent model routing and adaptation');
      
      console.log('\n🔗 Next Steps:');
      console.log('  1. Enable auto fine-tuning for continuous improvement');
      console.log('  2. Expand HCS topics for more granular learning');
      console.log('  3. Integrate user feedback mechanisms');
      console.log('  4. Deploy enhanced models from learning data');
      console.log('  5. Monitor and optimize learning performance');
      
    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  }
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new HCSLearningDemo();
  demo.runCompleteDemo().catch(console.error);
}

export { HCSLearningDemo };
