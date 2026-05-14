#!/usr/bin/env tsx

/**
 * Direct Vera Chat Test
 * Test Vera's enhanced chatting capabilities directly
 */

import { createIntegratedLearning } from './src/learning/integratedLearning.js';
import { createProvider } from './src/llm/realProvider.js';
import { config } from './src/config.js';

async function testVeraChat() {
  console.log('🚀 Testing Vera Enhanced Chat...\n');
  
  try {
    // Initialize Vera with enhanced learning
    const baseProvider = createProvider();
    const vera = createIntegratedLearning(baseProvider, {
      enableHCSLearning: true,
      enableAutoFineTuning: false,
      learningThreshold: 50,
      feedbackWeight: 0.8
    });
    
    await vera.initialize();
    
    // Test conversations
    const testQueries = [
      "What can you help me with?",
      "How do I create a new Hedera token?",
      "Explain quantum computing in simple terms",
      "My transaction failed, what should I do?",
      "What are the best DeFi yield strategies?"
    ];
    
    console.log('💬 Testing Enhanced Conversations:\n');
    
    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i];
      console.log(`\n--- Query ${i + 1} ---`);
      console.log(`👤 User: ${query}`);
      
      try {
        const startTime = Date.now();
        const result = await vera.chat({
          messages: [{ role: 'user', content: query }],
          model: config.DEFAULT_CHAT_MODEL,
          max_tokens: 500,
          temperature: 0.7
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        console.log(`🤖 Vera: ${result.content}`);
        console.log(`⏱️ Response Time: ${responseTime}ms`);
        console.log(`📊 Tokens: ${result.promptTokens + result.completionTokens} total`);
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      
      // Small delay between queries
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Show learning analytics
    console.log('\n📊 Learning Analytics:');
    const analytics = await vera.getLearningAnalytics();
    console.log(`Total Interactions: ${analytics.metrics.total_interactions}`);
    console.log(`Success Rate: ${analytics.metrics.success_rate.toFixed(1)}%`);
    console.log(`Average Response Time: ${analytics.metrics.average_response_time.toFixed(0)}ms`);
    
    console.log('\n🎉 Vera Enhanced Chat Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testVeraChat().catch(console.error);
