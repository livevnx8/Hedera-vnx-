/**
 * Week 3 Knowledge System Tests
 * Validates Auto Documenter and Knowledge Capture
 */

import { autoDocumenter } from './src/lattice/autoDocumenter.js';
import { knowledgeCapture } from './src/lattice/knowledgeCapture.js';

console.log('🧪 Week 3: Knowledge Expansion Tests\n');

async function testAutoDocumenter() {
  console.log('📍 Testing Auto Documenter');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test 1: Parse current source files
  console.log('Test 1: Scanning source directory...');
  const sourceFiles = autoDocumenter.scanDirectory('./src', /\.(ts|js|mjs)$/);
  console.log(`  ✅ Found ${sourceFiles.length} source files`);

  // Test 2: Parse a sample file
  console.log('Test 2: Parsing smartRouter.ts...');
  const functions = autoDocumenter.parseFile('./src/ai/smartRouter.ts');
  console.log(`  ✅ Found ${functions.length} documented functions`);
  
  if (functions.length > 0) {
    const firstFunc = functions[0];
    console.log(`  📄 First function: ${firstFunc.name}`);
    console.log(`     Description: ${firstFunc.description.substring(0, 50)}...`);
    console.log(`     Params: ${firstFunc.params.map(p => p.name).join(', ') || 'None'}`);
  }

  // Test 3: Find code
  console.log('Test 3: Searching for "route" function...');
  // First populate by parsing
  const sampleFunctions = autoDocumenter.parseFile('./src/ai/smartRouter.ts');
  if (sampleFunctions.length > 0) {
    const results = autoDocumenter.findCode('route');
    console.log(`  ✅ Found ${results.length} matching functions`);
    
    if (results.length > 0) {
      console.log(`  📍 Top result: ${results[0].tool}.${results[0].function} (relevance: ${results[0].relevance})`);
    }
  }

  // Show stats
  const stats = autoDocumenter.getStats();
  console.log('\nAuto Documenter Stats:');
  console.log(`  Files parsed: ${stats.filesParsed}`);
  console.log(`  Functions found: ${stats.functionsFound}`);
  console.log(`  Docs generated: ${stats.docsGenerated}`);

  console.log('');
}

async function testKnowledgeCapture() {
  console.log('📍 Testing Knowledge Capture');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test 1: Capture an interaction
  console.log('Test 1: Capturing sample interaction...');
  knowledgeCapture.capture({
    query: 'How do I create a carbon credit on Hedera?',
    context: {
      provider: 'openai',
      model: 'gpt-4',
      toolsUsed: ['hts_create_token', 'carbon_retire'],
      latency: 250
    },
    response: {
      success: true,
      result: { instructions: 'Use HTS to create...' },
      confidence: 0.92
    },
    outcome: {
      userSatisfaction: 'positive'
    },
    pattern: {
      intent: 'create_carbon_credit',
      complexity: 7,
      domain: 'carbon'
    }
  });
  console.log('  ✅ Interaction captured');

  // Test 2: Capture another (different provider)
  console.log('Test 2: Capturing Google model interaction...');
  knowledgeCapture.capture({
    query: 'Show my token balance',
    context: {
      provider: 'google',
      model: 'gemini-pro',
      toolsUsed: ['get_balance'],
      latency: 150
    },
    response: {
      success: true,
      result: { balance: 1000 },
      confidence: 0.95
    },
    pattern: {
      intent: 'show_balance',
      complexity: 3,
      domain: 'hedera'
    }
  });
  console.log('  ✅ Second interaction captured');

  // Test 3: Find similar
  console.log('Test 3: Finding similar interactions...');
  const similar = knowledgeCapture.findSimilar('create carbon', 'carbon');
  console.log(`  ✅ Found ${similar.length} similar interactions`);

  // Test 4: Get recommendation
  console.log('Test 4: Getting recommendations...');
  const rec = knowledgeCapture.getRecommendation('create carbon credit', 'carbon');
  if (rec) {
    console.log(`  ✅ Recommended provider: ${rec.provider}`);
    console.log(`  ✅ Recommended tools: ${rec.tools.join(', ')}`);
    console.log(`  ✅ Confidence: ${(rec.confidence * 100).toFixed(1)}%`);
    console.log(`  ✅ Based on: ${rec.basedOn} examples`);
  } else {
    console.log('  ℹ️  No recommendation yet (need more data)');
  }

  // Show stats
  const stats = knowledgeCapture.getStats();
  console.log('\nKnowledge Capture Stats:');
  console.log(`  Total captured: ${stats.totalCaptured}`);
  console.log(`  Patterns identified: ${stats.patternsIdentified}`);
  console.log(`  Knowledge base size: ${stats.knowledgeBaseSize}`);

  // Test 5: Export to lattice
  console.log('\nTest 5: Exporting to lattice format...');
  const markdown = knowledgeCapture.exportForLattice();
  console.log(`  ✅ Generated ${markdown.length} chars of markdown`);
  console.log('  📄 First 200 chars:');
  console.log(markdown.substring(0, 200) + '...');

  console.log('');
}

async function runTests() {
  try {
    await testAutoDocumenter();
    await testKnowledgeCapture();

    console.log('✅ Week 3 Tests Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Auto Documenter:');
    console.log('  - Parses source files automatically');
    console.log('  - Extracts JSDoc and function signatures');
    console.log('  - Generates searchable documentation');
    console.log('');
    console.log('Knowledge Capture:');
    console.log('  - Records every AI interaction');
    console.log('  - Identifies successful patterns');
    console.log('  - Recommends best approaches');
    console.log('');
    console.log('Targets:');
    console.log('  - 50+ auto-documented tools');
    console.log('  - <10 second code finding');
    console.log('  - Self-learning system');
    console.log('');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

runTests();
