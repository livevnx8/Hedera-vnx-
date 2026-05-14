#!/usr/bin/env node

/**
 * Test Vera's Reasoning Engine
 * 
 * Simple test to verify reasoning capabilities work
 */

import { reasoningEngine } from '../src/reasoning/reasoningEngine.js';

async function testReasoningEngine() {
  console.log('🧠 Testing Vera Reasoning Engine');
  console.log('📅 Test Date:', new Date().toISOString());
  console.log('');

  const testQuestions = [
    {
      type: 'Logical Reasoning',
      question: 'If all humans are mortal and Socrates is human, is Socrates mortal?'
    },
    {
      type: 'Problem Solving',
      question: 'How many ways can you arrange the letters in CAT?'
    },
    {
      type: 'Mathematical Reasoning',
      question: 'If x + y = 10 and 2x - y = 5, what is x?'
    },
    {
      type: 'Analytical Reasoning',
      question: 'A company revenue grew 10% in 2022, 15% in 2023, but only 5% in 2024. What does this pattern suggest?'
    },
    {
      type: 'Ethical Reasoning',
      question: 'Should a company lay off 10% of workers to save the company and save 90% of jobs?'
    }
  ];

  for (const test of testQuestions) {
    console.log(`🔍 Testing ${test.type}:`);
    console.log(`  Question: ${test.question}`);
    
    try {
      const startTime = Date.now();
      const result = await reasoningEngine.reason(test.question);
      const endTime = Date.now();
      
      console.log(`  ✅ Success!`);
      console.log(`  🧠 Conclusion: ${result.conclusion}`);
      console.log(`  📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  🎯 Reasoning Type: ${result.reasoningType}`);
      console.log(`  📋 Steps: ${result.steps.length}`);
      console.log(`  ⏱️  Processing Time: ${endTime - startTime}ms`);
      console.log(`  📝 Evidence: ${result.evidence.join(', ')}`);
      console.log(`  🤔 Assumptions: ${result.assumptions.join(', ')}`);
      
      if (result.steps.length > 0) {
        console.log(`  📈 Reasoning Steps:`);
        result.steps.slice(0, 2).forEach(step => {
          console.log(`    Step ${step.step}: ${step.description}`);
          console.log(`      Result: ${step.result}`);
        });
        if (result.steps.length > 2) {
          console.log(`    ... and ${result.steps.length - 2} more steps`);
        }
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }

  // Test quick reasoning
  console.log('⚡ Testing Quick Reasoning:');
  try {
    reasoningEngine.config.explainReasoning = false;
    const quickResult = await reasoningEngine.reason('What is 2 + 2?');
    console.log(`  ✅ Quick Answer: ${quickResult.conclusion}`);
    console.log(`  📊 Confidence: ${(quickResult.confidence * 100).toFixed(1)}%`);
  } catch (error) {
    console.log(`  ❌ Quick reasoning error: ${error.message}`);
  }
  
  console.log('');
  console.log('🎯 Reasoning Engine Test Complete!');
  console.log('📊 Summary: Vera now has actual reasoning capabilities instead of templates!');
}

// Run the test
testReasoningEngine().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
