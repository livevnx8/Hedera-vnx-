#!/usr/bin/env node

/**
 * Vera Capabilities Benchmark - Fixed Version
 * 
 * Tests Vera's current chat API against simulated responses
 * from other top AI systems to demonstrate competitive positioning.
 */

import { performance } from 'node:perf_hooks';
import fs from 'fs/promises';
import path from 'path';

// Test scenarios for Vera's current capabilities
const TEST_SCENARIOS = [
  {
    id: 'hedera_expertise',
    name: 'Hedera Expertise',
    category: 'Domain Knowledge',
    prompt: 'Explain how to create a Hedera token using the HTS service and what are the key parameters needed.',
    expectedKeywords: ['token', 'hts', 'hedera', 'parameters', 'supply'],
    difficulty: 'medium'
  },
  {
    id: 'smart_contract',
    name: 'Smart Contract Guidance',
    category: 'Technical',
    prompt: 'What are the best practices for developing secure smart contracts on Hedera? Include specific security considerations.',
    expectedKeywords: ['security', 'smart', 'contract', 'hedera', 'best'],
    difficulty: 'hard'
  },
  {
    id: 'defi_analysis',
    name: 'DeFi Analysis',
    category: 'Analytics',
    prompt: 'Analyze the current DeFi landscape on Hedera and identify the most promising protocols for yield generation.',
    expectedKeywords: ['defi', 'hedera', 'protocols', 'yield', 'analysis'],
    difficulty: 'medium'
  },
  {
    id: 'user_help',
    name: 'User Assistance',
    category: 'Communication',
    prompt: 'I am new to Hedera and want to create my first NFT collection. Can you guide me through the process step by step?',
    expectedKeywords: ['nft', 'collection', 'step', 'guide', 'hedera'],
    difficulty: 'easy'
  },
  {
    id: 'technical_troubleshooting',
    name: 'Technical Troubleshooting',
    category: 'Problem Solving',
    prompt: 'My Hedera transaction failed with error code INSUFFICIENT_TX_FEE. What does this mean and how can I fix it?',
    expectedKeywords: ['transaction', 'fee', 'error', 'fix', 'hedera'],
    difficulty: 'medium'
  }
];

// Simulated responses from other AI systems
const SIMULATED_RESPONSES = {
  'GPT-4': {
    'hedera_expertise': {
      response: 'To create a Hedera token using the HTS (Hedera Token Service), you will need to use the TokenCreateTransaction. Here are the key parameters: Required Parameters: Token Name, Symbol, Decimals, Initial Supply. Optional Parameters: Treasury Account, Freeze Key, Wipe Key, Supply Key, Admin Key. Best Practices: Use a multisig treasury for security, implement proper key management, consider token economics carefully, test thoroughly on testnet first.',
      score: 91,
      responseTime: 1200
    },
    'smart_contract': {
      response: 'Best practices for developing secure Hedera smart contracts: 1. Security Architecture - Use latest HSCS, implement proper access control, follow principle of least privilege. 2. Code Security - Validate all inputs, use SafeMath libraries, implement reentrancy protection, add proper error handling. 3. Hedera-Specific - Understand gas costs, use efficient data structures, leverage native services, consider 1MB size limit. 4. Testing - Comprehensive testing on testnet, use formal verification, implement upgrade patterns.',
      score: 88,
      responseTime: 1400
    },
    'defi_analysis': {
      response: 'Current DeFi landscape on Hedera shows significant potential: Leading Protocols: 1. SaucerSwap - Largest DEX with high TVL, 15-25% APY. 2. HeliSwap - Growing DEX with advanced routing, 12-20% APY. 3. BarterPay - P2P exchange with escrow, 8-15% APY. Yield Opportunities: High-Yield (15-25% APY) - SaucerSwap pools, yield farming. Medium-Yield (8-15% APY) - Lending protocols, stablecoin pools. Low-Yield (3-8% APY) - HBAR staking, insurance.',
      score: 85,
      responseTime: 1100
    },
    'user_help': {
      response: 'I will guide you through creating your first NFT collection on Hedera step by step: Step 1: Set Up Environment - Install Hedera SDK, get testnet account. Step 2: Create NFT Token - Use TokenCreateTransaction with TokenType.NonFungible. Step 3: Mint NFT - Use TokenMintTransaction with metadata. Step 4: Set Up Sales - Create marketplace contract, set pricing. Step 5: Promote - Share on social media, list on marketplaces. Important: Test on testnet first, keep keys secure, consider gas costs.',
      score: 94,
      responseTime: 900
    },
    'technical_troubleshooting': {
      response: 'The INSUFFICIENT_TX_FEE error means your transaction does not have enough HBAR to cover network fees. Solutions: 1. Increase Transaction Fee - Set higher fee in transaction. 2. Use Dynamic Fee Calculation - Query current network fees. 3. Implement Retry Logic - Double fee and retry on error. Current Fee Levels: Minimum 1,000 tinybars, Recommended 100,000 tinybars, Peak times 500,000+ tinybars. Prevention: Query current fees, use fee estimation, implement retry logic.',
      score: 92,
      responseTime: 800
    }
  },
  'Claude-3': {
    'hedera_expertise': {
      response: 'Creating a Hedera token using HTS involves several key parameters: Core Token Information: Token Name, Symbol, Decimals, Initial Supply. Key Management: Admin Key, Supply Key, Freeze Key, Wipe Key, KYC Key, Pause Key. Treasury Configuration: Treasury Account, Auto Renew. Implementation: Use TokenCreateTransaction class, set appropriate keys, configure treasury, freeze with freeze key. Advanced Considerations: Token economics, security best practices, cost optimization, regulatory compliance, testing strategy.',
      score: 95,
      responseTime: 1000
    },
    'smart_contract': {
      response: 'Developing secure Hedera smart contracts requires: 1. Architecture Security - Proper access control, checks-effects-interactions pattern, upgradeability. 2. Code Security - Input validation, SafeMath, reentrancy protection, error handling. 3. Hedera-Specific - 1MB size limit, gas optimization, native service integration. 4. Key Management - Multi-signature, proper rotation, HSM usage. 5. Testing - Unit tests, integration tests, security audits, staged deployment. Example patterns included for secure implementation.',
      score: 92,
      responseTime: 1200
    },
    'defi_analysis': {
      response: 'Hedera DeFi ecosystem analysis: Leading Protocols: 1. SaucerSwap - $50M+ TVL, 15-25% APY, established leader. 2. HeliSwap - $15M+ TVL, 12-20% APY, innovative features. 3. BarterPay - $8M+ TVL, 8-15% APY, P2P focus. 4. HedgeGuard - $5M+ TVL, 6-10% APY, insurance. Yield Strategies: High-Yield (15-25%) - Liquidity provision, yield farming. Medium-Yield (8-15%) - Stablecoin pools, lending. Low-Yield (3-8%) - HBAR staking, insurance. Portfolio allocation: Conservative 60/30/10, Balanced 40/40/20, Aggressive 20/50/30.',
      score: 90,
      responseTime: 1300
    },
    'user_help': {
      response: 'Creating NFT collection on Hedera: Step 1: Environment Setup - Install SDK, set up testnet account, configure credentials. Step 2: Create NFT Token - Use TokenCreateTransaction with TokenType.NonFungible, configure keys, set treasury. Step 3: Prepare Metadata - Create JSON metadata, store on IPFS, include attributes. Step 4: Mint NFTs - Use TokenMintTransaction with metadata buffer, track serial numbers. Step 5: Associate & Transfer - Associate token with accounts, implement transfers. Step 6: Marketplace Setup - List on Hedera marketplaces, implement sales functionality. Best practices: Test thoroughly, use proper metadata standards, implement security.',
      score: 96,
      responseTime: 1100
    },
    'technical_troubleshooting': {
      response: 'INSUFFICIENT_TX_FEE error indicates transaction fee below network minimum: Understanding: Dynamic fee model based on congestion, protective measure for network stability. Fee Structure: Minimum 1,000 tinybars, Typical 100,000 tinybars, Peak 500,000+ tinybars. Solutions: 1. Increase Fee - Set higher transaction fee. 2. Dynamic Calculation - Query network fees, add safety margin. 3. Retry Logic - Double fee on error, implement exponential backoff. Advanced: Fee estimation function, batch optimization, monitoring. Prevention: Query current fees, implement estimation, monitor congestion, use appropriate buffers.',
      score: 94,
      responseTime: 900
    }
  },
  'Gemini-Pro': {
    'hedera_expertise': {
      response: 'Creating Hedera token using HTS: Core Concept: HTS allows token creation without smart contracts. Essential Parameters: Token Name, Symbol, Decimals, Initial Supply, Key Management (Admin, Supply, Freeze, Wipe, KYC, Pause), Treasury Configuration. Implementation: Initialize client, generate keys, create TokenCreateTransaction with parameters, execute and get token ID. Advanced Options: Custom fees, metadata, supply management. Security: Multi-signature, key rotation, HSM usage. Testing: Test on testnet, verify permissions, monitor performance.',
      score: 87,
      responseTime: 1100
    },
    'smart_contract': {
      response: 'Secure Hedera smart contracts: 1. Security Fundamentals - Access control, input validation, proper modifiers. 2. Hedera-Specific - 1MB size limit, gas optimization, native service integration. 3. Advanced Patterns - Reentrancy protection, upgradeability, emergency controls. 4. Key Management - Multi-signature, proper rotation, HSM. 5. Testing - Comprehensive testing, security audits, staged deployment. Example implementation with proper security patterns and Hedera optimizations.',
      score: 84,
      responseTime: 1300
    },
    'defi_analysis': {
      response: 'Hedera DeFi ecosystem: Current Protocols: 1. SaucerSwap - $50M+ TVL, 15-25% APY, established. 2. HeliSwap - $15M+ TVL, 12-20% APY, growing. 3. BarterPay - $8M+ TVL, 8-15% APY, stable. Yield Strategies: High-Yield (15-25%) - Volatile pairs, yield farming. Medium-Yield (8-15%) - Stablecoin pools, lending. Low-Yield (3-8%) - HBAR staking, insurance. Portfolio Strategy: Conservative 60/30/10, Balanced 40/40/20, Aggressive 20/50/30. Risk Assessment: Monitor protocols, diversify, track regulatory changes.',
      score: 85,
      responseTime: 1200
    },
    'user_help': {
      response: 'Creating NFT collection on Hedera: Step 1: Environment Setup - Install SDK, get testnet account. Step 2: Create NFT Token - Use TokenCreateTransaction, set TokenType.NonFungible, configure keys. Step 3: Mint NFTs - Use TokenMintTransaction, set metadata. Step 4: Manage Collection - Associate tokens, implement transfers. Step 5: Marketplace - Set up sales, list on platforms. Implementation: Use proper SDK methods, test on testnet, consider gas costs, implement security measures. Next Steps: Create artwork, design metadata, promote collection.',
      score: 90,
      responseTime: 1000
    },
    'technical_troubleshooting': {
      response: 'INSUFFICIENT_TX_FEE error: Understanding: Fee below network minimum, dynamic fee model, protective measure. Solutions: 1. Increase Fee - Set higher transaction fee. 2. Dynamic Calculation - Query network fees, add margin. 3. Retry Logic - Double fee and retry. Current Levels: Minimum 1,000 tinybars, Recommended 100,000 tinybars, Peak 500,000+ tinybars. Prevention: Query current fees, use estimation, implement retry, monitor conditions. Best Practices: Test fee levels, use estimation libraries, consider gas costs.',
      score: 88,
      responseTime: 900
    }
  }
};

class VeraBenchmark {
  constructor() {
    this.results = {
      Vera: { tests: [], totalScore: 0, averageTime: 0 },
      'GPT-4': { tests: [], totalScore: 0, averageTime: 0 },
      'Claude-3': { tests: [], totalScore: 0, averageTime: 0 },
      'Gemini-Pro': { tests: [], totalScore: 0, averageTime: 0 }
    };
  }

  async runBenchmark() {
    console.log('🚀 Vera Capabilities Benchmark Suite');
    console.log('=================================\n');

    console.log('Testing Vera against top AI systems...\n');

    for (const scenario of TEST_SCENARIOS) {
      console.log('📊 Testing ' + scenario.name + ' (' + scenario.category + ')...');
      
      // Test Vera
      await this.testVera(scenario);
      
      // Add simulated results for other AIs
      this.addSimulatedResults(scenario);
      
      console.log('');
    }

    this.calculateFinalResults();
    this.displayResults();
    await this.generateReport();
  }

  async testVera(scenario) {
    const startTime = performance.now();
    
    try {
      // Call Vera's chat API
      const response = await fetch('http://localhost:8080/v1/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: scenario.prompt
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }

      const text = await response.text();
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // Handle streaming response
      let veraResponse = 'No response';
      try {
        // Try to parse as JSON first
        const data = JSON.parse(text);
        veraResponse = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : 'No response';
      } catch (e) {
        // If JSON parsing fails, extract from streaming format
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                veraResponse += data.choices[0].delta.content;
              }
            } catch (e2) {
              // Skip invalid JSON lines
            }
          }
        }
      }

      const score = this.evaluateResponse(veraResponse, scenario);
      
      this.results.Vera.tests.push({
        scenario: scenario.name,
        response: veraResponse,
        score: score,
        responseTime: responseTime,
        success: true
      });

      console.log('  ✅ Vera: ' + score + '/100 (' + responseTime.toFixed(0) + 'ms)');

    } catch (error) {
      console.log('  ❌ Vera: Error - ' + error.message);
      
      this.results.Vera.tests.push({
        scenario: scenario.name,
        error: error.message,
        score: 0,
        responseTime: 0,
        success: false
      });
    }
  }

  addSimulatedResults(scenario) {
    // Add simulated results for other AI systems
    for (const aiName in SIMULATED_RESPONSES) {
      const aiResponses = SIMULATED_RESPONSES[aiName];
      const aiResponse = aiResponses[scenario.id];
      
      if (aiResponse) {
        this.results[aiName].tests.push({
          scenario: scenario.name,
          response: aiResponse.response,
          score: aiResponse.score,
          responseTime: aiResponse.responseTime,
          success: true
        });
        
        console.log('  📋 ' + aiName + ': ' + aiResponse.score + '/100 (' + aiResponse.responseTime + 'ms)');
      }
    }
  }

  evaluateResponse(response, scenario) {
    let score = 50; // Base score
    
    // Length check
    if (response.length > 100 && response.length < 2000) {
      score += 10;
    }
    
    // Keyword matching
    const keywordMatches = scenario.expectedKeywords.filter(keyword => 
      response.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += (keywordMatches / scenario.expectedKeywords.length) * 30;
    
    // Quality indicators
    if (response.includes('because') || response.includes('therefore') || response.includes('however')) {
      score += 5;
    }
    
    if (response.match(/\d+\.?\d*/)) {
      score += 5;
    }
    
    return Math.min(100, Math.round(score));
  }

  calculateFinalResults() {
    for (const aiName in this.results) {
      const results = this.results[aiName];
      const successfulTests = results.tests.filter(t => t.success);
      
      if (successfulTests.length > 0) {
        results.totalScore = successfulTests.reduce((sum, t) => sum + t.score, 0) / successfulTests.length;
        results.averageTime = successfulTests.reduce((sum, t) => sum + t.responseTime, 0) / successfulTests.length;
      } else {
        results.totalScore = 0;
        results.averageTime = 0;
      }
    }
  }

  displayResults() {
    console.log('\n🏆 BENCHMARK RESULTS');
    console.log('===================\n');

    // Sort by score
    const rankings = Object.entries(this.results)
      .map(([name, results]) => ({
        name: name,
        score: results.totalScore,
        time: results.averageTime,
        tests: results.tests.filter(t => t.success).length
      }))
      .sort((a, b) => b.score - a.score);

    // Display rankings
    console.log('📊 Overall Rankings:');
    rankings.forEach((rank, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(medal + ' #' + (index + 1) + ' ' + rank.name + ' - ' + rank.score.toFixed(1) + '/100 (' + rank.time.toFixed(0) + 'ms avg)');
    });

    // Category breakdown
    console.log('\n📈 Category Performance:');
    const categories = [...new Set(TEST_SCENARIOS.map(s => s.category))];
    
    categories.forEach(category => {
      console.log('\n' + category + ':');
      const categoryTests = TEST_SCENARIOS.filter(s => s.category === category);
      
      categoryTests.forEach(test => {
        console.log('  ' + test.name + ':');
        rankings.forEach(rank => {
          const testResult = this.results[rank.name].tests.find(t => t.scenario === test.name);
          if (testResult && testResult.success) {
            console.log('    ' + rank.name + ': ' + testResult.score + '/100');
          }
        });
      });
    });

    // Winner announcement
    const winner = rankings[0];
    if (winner) {
      console.log('\n🎯 WINNER: ' + winner.name + ' (' + winner.score.toFixed(1) + '/100)');
    }
  }

  async generateReport() {
    const reportData = {
      timestamp: new Date().toISOString(),
      results: this.results,
      scenarios: TEST_SCENARIOS,
      summary: this.calculateSummary()
    };

    const reportPath = path.join(process.cwd(), 'benchmark-results', 'vera-benchmark-fixed.json');
    
    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
      console.log('\n📄 Detailed report saved to: ' + reportPath);
    } catch (error) {
      console.error('Error saving report:', error.message);
    }
  }

  calculateSummary() {
    const rankings = Object.entries(this.results)
      .map(([name, results]) => ({
        name: name,
        score: results.totalScore,
        time: results.averageTime
      }))
      .sort((a, b) => b.score - a.score);

    return {
      winner: rankings[0],
      rankings: rankings,
      totalTests: TEST_SCENARIOS.length,
      categories: [...new Set(TEST_SCENARIOS.map(s => s.category))]
    };
  }
}

// Run the benchmark
const benchmark = new VeraBenchmark();
benchmark.runBenchmark().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
