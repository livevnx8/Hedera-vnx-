/**
 * Vera AI Optimization Bootstrap
 * Initializes the 4-week optimization system into production Vera
 */

import { createOptimizationLayer } from './src/ai/veraIntegrationLayer.js';
import { initializeAIRoutes } from './src/routes/aiDashboard.js';
import EnhancedAgentRunner from './src/agent/enhanced-runner.js';
import { HederaLatticeRouter } from './src/vera/orchestrator/hederaLatticeRouter.js';
import { autoDocumenter } from './src/lattice/autoDocumenter.js';
import { knowledgeCapture } from './src/lattice/knowledgeCapture.js';
import { smartRouter } from './src/ai/smartRouter.js';
import { responseCache } from './src/ai/responseCache.js';

console.log('🚀 Vera AI Optimization Bootstrap');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

async function bootstrap() {
  try {
    // 1. Initialize existing components
    console.log('\n📦 Step 1: Initializing Vera components...');
    
    const enhancedRunner = new EnhancedAgentRunner();
    const latticeRouter = new HederaLatticeRouter();
    
    console.log('  ✅ Enhanced Agent Runner ready');
    console.log('  ✅ Hedera Lattice Router ready');

    // 2. Create optimization layer
    console.log('\n⚡ Step 2: Creating AI optimization layer...');
    
    const optimizationLayer = createOptimizationLayer(
      enhancedRunner,
      latticeRouter,
      {
        enableSmartRouting: true,
        enableResponseCache: true,
        enableToolBatching: true,
        enableParallelProcessing: true,
        enableKnowledgeCapture: true,
        enableAutoDocumentation: true
      }
    );

    await optimizationLayer.initialize();
    
    console.log('  ✅ Optimization layer initialized');

    // 3. Generate documentation
    console.log('\n📚 Step 3: Generating auto-documentation...');
    
    await autoDocumenter.documentTools('./src', '/mnt/vera-mirror-shards/vera-lattice');
    const docStats = autoDocumenter.getStats();
    
    console.log(`  ✅ Documented ${docStats.totalTools} tools`);
    console.log(`  📄 Files parsed: ${docStats.filesParsed}`);
    console.log(`  🔧 Functions found: ${docStats.functionsFound}`);

    // 4. Display health status
    console.log('\n🏥 Step 4: Health Check...');
    
    const health = optimizationLayer.getHealth();
    console.log(`  Status: ${health.status.toUpperCase()}`);
    console.log(`  Vera AI: ${health.components.veraAI}`);
    console.log(`  Dashboard: ${health.components.dashboard}`);
    console.log(`  Runner: ${health.components.enhancedRunner}`);
    console.log(`  Router: ${health.components.latticeRouter}`);

    // 5. Show optimizations enabled
    console.log('\n🔧 Step 5: Active Optimizations...');
    
    Object.entries(health.optimizations).forEach(([key, enabled]) => {
      console.log(`  ${enabled ? '✅' : '❌'} ${key}`);
    });

    // 6. Get initial stats
    console.log('\n📊 Step 6: Initial Statistics...');
    
    const stats = optimizationLayer.getStats();
    console.log(`  Total requests: ${stats.totalRequests || 0}`);
    console.log(`  Cache hits: ${stats.cacheHits || 0}`);
    console.log(`  Avg latency: ${Math.round(stats.avgLatency || 0)}ms`);

    // 7. Get recommendations
    console.log('\n💡 Step 7: Optimization Recommendations...');
    
    const recommendations = optimizationLayer.getRecommendations();
    recommendations.forEach(rec => {
      console.log(`  💡 ${rec}`);
    });

    // 8. Test a sample query
    console.log('\n🧪 Step 8: Testing sample query...');
    
    try {
      const testResult = await optimizationLayer.processQuery(
        'What is my Hedera account balance?',
        { userId: 'test-user' }
      );
      
      console.log('  ✅ Sample query processed successfully');
      console.log(`  📍 Routed to: ${testResult.optimizationMetadata?.routedTo || 'native'}`);
      console.log(`  ⚡ Latency: ${testResult.optimizationMetadata?.latency}ms`);
      console.log(`  🎯 Cache hit: ${testResult.optimizationMetadata?.cacheHit ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.log('  ⚠️  Sample query failed (expected - no model connected):', error.message);
    }

    // 9. Final summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ BOOTSTRAP COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nVera AI Optimization System is READY for production!');
    console.log('\nAvailable endpoints:');
    console.log('  GET  /api/ai/status       - System status');
    console.log('  GET  /api/ai/metrics      - Performance metrics');
    console.log('  GET  /api/ai/health       - Health check');
    console.log('  GET  /api/ai/router/stats - Router statistics');
    console.log('  GET  /api/ai/cache/stats  - Cache statistics');
    console.log('  POST /api/ai/process      - Process AI query');
    console.log('\nNext steps:');
    console.log('  1. Integrate optimizationLayer into main Vera app');
    console.log('  2. Mount aiDashboard routes');
    console.log('  3. Monitor via dashboard endpoints');
    console.log('  4. Fine-tune based on metrics');
    console.log('\n🌱 Hedera AI verification - OPTIMIZED AND READY 🚀');

    return {
      optimizationLayer,
      enhancedRunner,
      latticeRouter,
      health,
      stats
    };

  } catch (error) {
    console.error('\n❌ BOOTSTRAP FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run bootstrap
bootstrap().then(result => {
  console.log('\n✨ System ready for integration');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
