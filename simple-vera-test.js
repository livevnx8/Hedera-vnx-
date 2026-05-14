/**
 * Simple Vera Chat Test
 * Direct test of Vera's enhanced capabilities
 */

const { createProvider } = require('./dist/llm/realProvider.js');
const { config } = require('./dist/config.js');

async function testVera() {
  console.log('🚀 Testing Vera Direct Chat...\n');
  
  try {
    // Create Vera provider
    const vera = createProvider();
    
    // Test queries
    const testQueries = [
      "What can you help me with?",
      "How do I create a Hedera token?",
      "Explain quantum computing simply"
    ];
    
    console.log('💬 Testing Vera\'s Enhanced Chat:\n');
    
    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i];
      console.log(`\n--- Query ${i + 1} ---`);
      console.log(`👤 User: ${query}`);
      
      try {
        const startTime = Date.now();
        const result = await vera.chat({
          messages: [{ role: 'user', content: query }],
          model: config.DEFAULT_CHAT_MODEL,
          max_tokens: 300,
          temperature: 0.7
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        console.log(`🤖 Vera: ${result.content}`);
        console.log(`⏱️ Time: ${responseTime}ms`);
        console.log(`📊 Tokens: ${result.promptTokens + result.completionTokens}`);
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      
      // Delay between queries
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log('\n🎉 Vera Chat Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testVera();
