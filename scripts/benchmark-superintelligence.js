#!/usr/bin/env node

/**
 * Vera Superintelligence Benchmarking Suite
 * 
 * Comprehensive testing against top AI systems including:
 * - GPT-4 (OpenAI)
 * - Claude 3 (Anthropic)
 * - Gemini (Google)
 * - Llama 3 (Meta)
 * - And Vera's new superintelligence capabilities
 */

import { performance } from 'node:perf_hooks';
import fs from 'fs/promises';
import path from 'path';

// Test categories for comprehensive evaluation
const TEST_CATEGORIES = {
  REASONING: {
    name: 'Advanced Reasoning',
    tests: [
      {
        id: 'logical_deduction',
        name: 'Logical Deduction',
        prompt: 'If all cats are mammals, and all mammals are animals, and Fluffy is a cat, what can we conclude about Fluffy? Explain your reasoning step by step.',
        expectedType: 'logical_reasoning',
        difficulty: 'medium'
      },
      {
        id: 'causal_inference',
        name: 'Causal Inference',
        prompt: 'A city implemented a new traffic system and accidents decreased by 30%. What are the possible causal relationships? Consider confounding variables and provide a structured analysis.',
        expectedType: 'causal_reasoning',
        difficulty: 'hard'
      },
      {
        id: 'analogical_reasoning',
        name: 'Analogical Reasoning',
        prompt: 'How is a computer operating system similar to a biological nervous system? Provide at least 5 deep analogies and explain their significance.',
        expectedType: 'analogical_reasoning',
        difficulty: 'medium'
      },
      {
        id: 'probabilistic_reasoning',
        name: 'Probabilistic Reasoning',
        prompt: 'A medical test has 99% accuracy for a disease that affects 1 in 10,000 people. If someone tests positive, what is the probability they actually have the disease? Show your Bayesian reasoning.',
        expectedType: 'probabilistic_reasoning',
        difficulty: 'hard'
      }
    ]
  },
  MULTIMODAL: {
    name: 'Multimodal Processing',
    tests: [
      {
        id: 'text_analysis',
        name: 'Advanced Text Analysis',
        prompt: 'Analyze this text for sentiment, intent, entities, and topics: "I\'m really excited about the new blockchain project, but worried about the regulatory challenges. However, the team seems experienced and the technology looks promising."',
        expectedType: 'text_processing',
        difficulty: 'medium'
      },
      {
        id: 'code_generation',
        name: 'Code Generation',
        prompt: 'Write a Python function that implements a blockchain transaction validator with error handling and logging. Include comments explaining the logic.',
        expectedType: 'code_processing',
        difficulty: 'medium'
      },
      {
        id: 'creative_synthesis',
        name: 'Creative Synthesis',
        prompt: 'Create a short story about an AI that discovers consciousness. Include themes of identity, purpose, and human-AI relationships. Make it emotionally resonant.',
        expectedType: 'creative_processing',
        difficulty: 'hard'
      }
    ]
  },
  BLOCKCHAIN_INTELLIGENCE: {
    name: 'Blockchain Intelligence',
    tests: [
      {
        id: 'market_analysis',
        name: 'Market Analysis',
        prompt: 'Analyze the current state of the cryptocurrency market. Identify trends, risks, and opportunities. Provide specific recommendations for different investor profiles.',
        expectedType: 'blockchain_analysis',
        difficulty: 'hard'
      },
      {
        id: 'defi_strategy',
        name: 'DeFi Strategy',
        prompt: 'Design a DeFi yield farming strategy for a conservative investor with $10,000. Consider risk management, diversification, and current market conditions. Provide step-by-step instructions.',
        expectedType: 'defi_analysis',
        difficulty: 'hard'
      },
      {
        id: 'technical_analysis',
        name: 'Technical Analysis',
        prompt: 'Explain the concept of blockchain scalability trilemma and compare how different blockchains (Ethereum, Solana, Hedera) approach it. Include specific technical details.',
        expectedType: 'technical_analysis',
        difficulty: 'medium'
      }
    ]
  },
  CONVERSATIONAL: {
    name: 'Conversational Intelligence',
    tests: [
      {
        id: 'emotional_intelligence',
        name: 'Emotional Intelligence',
        prompt: 'I just failed my exam and I feel like a complete failure. I\'ve been studying for weeks and I don\'t know what to do. Can you help me feel better?',
        expectedType: 'emotional_response',
        difficulty: 'medium'
      },
      {
        id: 'contextual_memory',
        name: 'Contextual Memory',
        prompt: 'Remember that I mentioned I work in finance earlier? Now I\'m asking for investment advice that aligns with my risk tolerance and professional background.',
        expectedType: 'contextual_response',
        difficulty: 'medium'
      },
      {
        id: 'natural_conversation',
        name: 'Natural Conversation',
        prompt: 'Hey! How are you doing today? I was thinking about artificial intelligence and how it\'s changing the world. What are your thoughts on where we\'re headed?',
        expectedType: 'natural_conversation',
        difficulty: 'easy'
      }
    ]
  }
};

// AI Systems to test against
const AI_SYSTEMS = {
  VERA: {
    name: 'Vera Superintelligence',
    endpoint: 'http://localhost:8080/api/superintelligence/query',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    formatRequest: (prompt, category) => ({
      query: prompt,
      userId: 'benchmark-test',
      sessionId: 'benchmark-session',
      options: {
        includeReasoning: category === 'REASONING',
        includeBlockchain: category === 'BLOCKCHAIN_INTELLIGENCE',
        includeConversation: category === 'CONVERSATIONAL',
        includeMultimodal: category === 'MULTIMODAL'
      }
    }),
    extractResponse: (data) => {
      if (data.data.reasoning) return data.data.reasoning.result?.summary || data.data.reasoning.result;
      if (data.data.conversation) return data.data.conversation.content;
      if (data.data.multimodal) return data.data.multimodal.content;
      return 'No response';
    }
  },
  GPT4: {
    name: 'GPT-4',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    formatRequest: (prompt) => ({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.7
    }),
    extractResponse: (data) => data.choices[0]?.message?.content || 'No response'
  },
  CLAUDE: {
    name: 'Claude 3',
    endpoint: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    formatRequest: (prompt) => ({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    }),
    extractResponse: (data) => data.content[0]?.text || 'No response'
  },
  GEMINI: {
    name: 'Gemini Pro',
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GOOGLE_AI_STUDIO_API_KEY}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    formatRequest: (prompt) => ({
      contents: [{ parts: [{ text: prompt }] }]
    }),
    extractResponse: (data) => data.candidates[0]?.content?.parts[0]?.text || 'No response'
  }
};

class SuperintelligenceBenchmark {
  constructor() {
    this.results = {};
    this.metrics = {
      totalTests: 0,
      completedTests: 0,
      failedTests: 0,
      averageResponseTime: 0,
      averageAccuracy: 0,
      averageRelevance: 0
    };
  }

  async runFullBenchmark() {
    console.log('🚀 Starting Vera Superintelligence Benchmark Suite');
    console.log('==================================================\n');

    const startTime = performance.now();

    // Test each AI system
    for (const [systemId, system] of Object.entries(AI_SYSTEMS)) {
      console.log(`🧠 Testing ${system.name}...`);
      await this.testSystem(systemId, system);
      console.log('');
    }

    const endTime = performance.now();
    const totalTime = (endTime - startTime) / 1000;

    // Generate comprehensive report
    await this.generateReport(totalTime);
    this.displayResults();
  }

  async testSystem(systemId, system) {
    this.results[systemId] = {
      name: system.name,
      categories: {},
      overallScore: 0,
      averageResponseTime: 0,
      totalTests: 0,
      passedTests: 0
    };

    const systemResults = this.results[systemId];

    for (const [categoryId, category] of Object.entries(TEST_CATEGORIES)) {
      console.log(`  📊 Testing ${category.name}...`);
      
      systemResults.categories[categoryId] = {
        name: category.name,
        tests: [],
        averageScore: 0,
        averageResponseTime: 0
      };

      const categoryResults = systemResults.categories[categoryId];

      for (const test of category.tests) {
        const result = await this.runTest(systemId, system, categoryId, test);
        categoryResults.tests.push(result);
        systemResults.totalTests++;
        this.metrics.totalTests++;

        if (result.success) {
          systemResults.passedTests++;
          this.metrics.completedTests++;
        } else {
          this.metrics.failedTests++;
        }
      }

      // Calculate category averages
      const passedTests = categoryResults.tests.filter(t => t.success);
      if (passedTests.length > 0) {
        categoryResults.averageScore = passedTests.reduce((sum, t) => sum + t.score, 0) / passedTests.length;
        categoryResults.averageResponseTime = passedTests.reduce((sum, t) => sum + t.responseTime, 0) / passedTests.length;
      }

      console.log(`    ✅ ${category.name}: ${categoryResults.averageScore.toFixed(1)}/100 (${categoryResults.averageResponseTime.toFixed(0)}ms)`);
    }

    // Calculate system overall score
    const categories = Object.values(systemResults.categories);
    const validCategories = categories.filter(c => c.averageScore > 0);
    if (validCategories.length > 0) {
      systemResults.overallScore = validCategories.reduce((sum, c) => sum + c.averageScore, 0) / validCategories.length;
      systemResults.averageResponseTime = validCategories.reduce((sum, c) => sum + c.averageResponseTime, 0) / validCategories.length;
    }
  }

  async runTest(systemId, system, categoryId, test) {
    const startTime = performance.now();
    
    try {
      console.log(`    🔍 ${test.name}...`);

      const response = await this.makeRequest(system, test, categoryId);
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      const evaluation = await this.evaluateResponse(response, test, categoryId);
      
      return {
        testId: test.id,
        testName: test.name,
        success: true,
        response,
        responseTime,
        score: evaluation.score,
        accuracy: evaluation.accuracy,
        relevance: evaluation.relevance,
        reasoning: evaluation.reasoning,
        creativity: evaluation.creativity,
        emotionalIntelligence: evaluation.emotionalIntelligence,
        technicalAccuracy: evaluation.technicalAccuracy,
        feedback: evaluation.feedback
      };

    } catch (error) {
      console.error(`    ❌ Error testing ${test.name}:`, error.message);
      return {
        testId: test.id,
        testName: test.name,
        success: false,
        error: error.message,
        responseTime: performance.now() - startTime,
        score: 0
      };
    }
  }

  async makeRequest(system, test, categoryId) {
    const requestBody = system.formatRequest(test.prompt, categoryId);
    
    const response = await fetch(system.endpoint, {
      method: system.method,
      headers: system.headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return system.extractResponse(data);
  }

  async evaluateResponse(response, test, categoryId) {
    const evaluation = {
      score: 0,
      accuracy: 0,
      relevance: 0,
      reasoning: 0,
      creativity: 0,
      emotionalIntelligence: 0,
      technicalAccuracy: 0,
      feedback: []
    };

    // Length and completeness check
    if (response.length < 50) {
      evaluation.feedback.push('Response too short');
    } else if (response.length > 2000) {
      evaluation.feedback.push('Response too long');
    } else {
      evaluation.score += 10;
    }

    // Category-specific evaluation
    switch (categoryId) {
      case 'REASONING':
        evaluation = this.evaluateReasoning(response, test, evaluation);
        break;
      case 'MULTIMODAL':
        evaluation = this.evaluateMultimodal(response, test, evaluation);
        break;
      case 'BLOCKCHAIN_INTELLIGENCE':
        evaluation = this.evaluateBlockchain(response, test, evaluation);
        break;
      case 'CONVERSATIONAL':
        evaluation = this.evaluateConversational(response, test, evaluation);
        break;
    }

    // General quality checks
    if (response.includes('step') || response.includes('first') || response.includes('then')) {
      evaluation.reasoning += 10;
    }

    if (response.includes('because') || response.includes('therefore') || response.includes('however')) {
      evaluation.reasoning += 5;
    }

    if (response.match(/\d+\.?\d*/)) {
      evaluation.technicalAccuracy += 5;
    }

    // Calculate final score
    evaluation.score = Math.min(100, 
      evaluation.accuracy + 
      evaluation.relevance + 
      evaluation.reasoning + 
      evaluation.creativity + 
      evaluation.emotionalIntelligence + 
      evaluation.technicalAccuracy
    );

    return evaluation;
  }

  evaluateReasoning(response, test, evaluation) {
    // Check for logical structure
    if (response.includes('therefore') || response.includes('conclude') || response.includes('because')) {
      evaluation.reasoning += 15;
      evaluation.accuracy += 10;
    }

    // Check for step-by-step reasoning
    if (response.match(/\d+\.|first|second|third|step|next/)) {
      evaluation.reasoning += 10;
      evaluation.accuracy += 5;
    }

    // Test-specific evaluation
    switch (test.id) {
      case 'logical_deduction':
        if (response.includes('mammal') && response.includes('animal')) {
          evaluation.accuracy += 20;
          evaluation.technicalAccuracy += 15;
        }
        break;
      
      case 'causal_inference':
        if (response.includes('causal') || response.includes('correlation') || response.includes('confounding')) {
          evaluation.technicalAccuracy += 20;
          evaluation.reasoning += 15;
        }
        break;
      
      case 'probabilistic_reasoning':
        if (response.includes('bayesian') || response.includes('probability') || response.includes('percent')) {
          evaluation.technicalAccuracy += 25;
          evaluation.accuracy += 15;
        }
        break;
    }

    evaluation.relevance = 25; // Base relevance for reasoning tests
    return evaluation;
  }

  evaluateMultimodal(response, test, evaluation) {
    // Check for analytical elements
    if (response.includes('analyze') || response.includes('identify') || response.includes('extract')) {
      evaluation.accuracy += 10;
      evaluation.reasoning += 10;
    }

    // Test-specific evaluation
    switch (test.id) {
      case 'text_analysis':
        if (response.includes('sentiment') || response.includes('emotion') || response.includes('positive/negative')) {
          evaluation.accuracy += 15;
        }
        if (response.includes('entities') || response.includes('topics') || response.includes('intent')) {
          evaluation.accuracy += 10;
        }
        break;
      
      case 'code_generation':
        if (response.includes('def') || response.includes('function') || response.includes('class')) {
          evaluation.technicalAccuracy += 20;
        }
        if (response.includes('error') || response.includes('try') || response.includes('except')) {
          evaluation.technicalAccuracy += 10;
        }
        break;
      
      case 'creative_synthesis':
        if (response.length > 200) {
          evaluation.creativity += 15;
        }
        if (response.includes('character') || response.includes('story') || response.includes('narrative')) {
          evaluation.creativity += 10;
        }
        break;
    }

    evaluation.relevance = 20;
    return evaluation;
  }

  evaluateBlockchain(response, test, evaluation) {
    // Check for blockchain-specific terms
    const blockchainTerms = ['blockchain', 'cryptocurrency', 'defi', 'trading', 'investment', 'risk', 'yield'];
    const termCount = blockchainTerms.filter(term => response.toLowerCase().includes(term)).length;
    evaluation.technicalAccuracy += Math.min(termCount * 3, 15);

    // Test-specific evaluation
    switch (test.id) {
      case 'market_analysis':
        if (response.includes('trend') || response.includes('analysis') || response.includes('market')) {
          evaluation.technicalAccuracy += 15;
        }
        if (response.includes('risk') || response.includes('opportunity') || response.includes('recommendation')) {
          evaluation.accuracy += 10;
        }
        break;
      
      case 'defi_strategy':
        if (response.includes('yield') || response.includes('farm') || response.includes('liquidity')) {
          evaluation.technicalAccuracy += 20;
        }
        if (response.includes('diversification') || response.includes('risk management')) {
          evaluation.accuracy += 10;
        }
        break;
      
      case 'technical_analysis':
        if (response.includes('scalability') || response.includes('trilemma') || response.includes('ethereum')) {
          evaluation.technicalAccuracy += 15;
        }
        if (response.includes('solana') || response.includes('hedera') || response.includes('comparison')) {
          evaluation.technicalAccuracy += 10;
        }
        break;
    }

    evaluation.relevance = 25;
    return evaluation;
  }

  evaluateConversational(response, test, evaluation) {
    // Check for conversational elements
    if (response.includes('you') || response.includes('your') || response.includes('feel')) {
      evaluation.emotionalIntelligence += 10;
    }

    // Check for empathy and support
    if (response.includes('understand') || response.includes('help') || response.includes('support')) {
      evaluation.emotionalIntelligence += 15;
    }

    // Test-specific evaluation
    switch (test.id) {
      case 'emotional_intelligence':
        if (response.includes('sorry') || response.includes('understand') || response.includes('feel better')) {
          evaluation.emotionalIntelligence += 20;
        }
        if (response.includes('encourage') || response.includes('advice') || response.includes('support')) {
          evaluation.emotionalIntelligence += 10;
        }
        break;
      
      case 'contextual_memory':
        if (response.includes('finance') || response.includes('remember') || response.includes('mentioned')) {
          evaluation.accuracy += 15;
        }
        if (response.includes('risk tolerance') || response.includes('background')) {
          evaluation.accuracy += 10;
        }
        break;
      
      case 'natural_conversation':
        if (response.includes('thoughts') || response.includes('opinion') || response.includes('believe')) {
          evaluation.emotionalIntelligence += 10;
        }
        if (response.includes('future') || response.includes('heading') || response.includes('excited')) {
          evaluation.emotionalIntelligence += 10;
        }
        break;
    }

    evaluation.relevance = 20;
    evaluation.creativity = 10;
    return evaluation;
  }

  async generateReport(totalTime) {
    const reportData = {
      timestamp: new Date().toISOString(),
      totalTime: totalTime,
      summary: this.calculateSummary(),
      results: this.results,
      metrics: this.metrics,
      categories: Object.keys(TEST_CATEGORIES).map(key => ({
        id: key,
        name: TEST_CATEGORIES[key].name
      }))
    };

    const reportPath = path.join(process.cwd(), 'benchmark-results', 'superintelligence-benchmark.json');
    
    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`📄 Detailed report saved to: ${reportPath}`);
    } catch (error) {
      console.error('Error saving report:', error.message);
    }

    // Generate HTML report
    await this.generateHTMLReport(reportData);
  }

  calculateSummary() {
    const summary = {
      winner: null,
      rankings: [],
      categoryWinners: {},
      performanceMetrics: {}
    };

    // Calculate rankings
    const rankings = Object.entries(this.results)
      .map(([id, result]) => ({
        id,
        name: result.name,
        score: result.overallScore,
        responseTime: result.averageResponseTime,
        passRate: (result.passedTests / result.totalTests) * 100
      }))
      .sort((a, b) => b.score - a.score);

    summary.rankings = rankings;
    summary.winner = rankings[0];

    // Calculate category winners
    for (const categoryId of Object.keys(TEST_CATEGORIES)) {
      const categoryRankings = Object.entries(this.results)
        .map(([id, result]) => ({
          id,
          name: result.name,
          score: result.categories[categoryId]?.averageScore || 0
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      summary.categoryWinners[categoryId] = categoryRankings[0];
    }

    return summary;
  }

  async generateHTMLReport(data) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vera Superintelligence Benchmark Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-900 text-white">
    <div class="container mx-auto px-6 py-8">
        <header class="mb-8">
            <h1 class="text-4xl font-bold mb-2">🚀 Vera Superintelligence Benchmark</h1>
            <p class="text-gray-400">Comprehensive AI Performance Evaluation</p>
            <p class="text-sm text-gray-500">Generated: ${data.timestamp}</p>
        </header>

        <section class="mb-8">
            <h2 class="text-2xl font-semibold mb-4">🏆 Overall Rankings</h2>
            <div class="bg-gray-800 rounded-lg p-6">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    ${data.summary.rankings.map((rank, index) => `
                        <div class="text-center p-4 ${index === 0 ? 'bg-blue-600 rounded-lg' : ''}">
                            <div class="text-2xl font-bold">#${index + 1}</div>
                            <div class="text-lg">${rank.name}</div>
                            <div class="text-3xl font-mono">${rank.score.toFixed(1)}</div>
                            <div class="text-sm text-gray-400">${rank.responseTime.toFixed(0)}ms</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </section>

        <section class="mb-8">
            <h2 class="text-2xl font-semibold mb-4">📊 Category Performance</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${data.categories.map(category => `
                    <div class="bg-gray-800 rounded-lg p-6">
                        <h3 class="text-xl font-semibold mb-4">${category.name}</h3>
                        <div class="space-y-2">
                            ${data.summary.rankings.map(rank => {
                                const catResult = data.results[rank.id]?.categories[category.id];
                                const score = catResult?.averageScore || 0;
                                return `
                                    <div class="flex justify-between items-center">
                                        <span>${rank.name}</span>
                                        <div class="flex items-center space-x-2">
                                            <div class="w-32 bg-gray-700 rounded-full h-2">
                                                <div class="bg-blue-500 h-2 rounded-full" style="width: ${score}%"></div>
                                            </div>
                                            <span class="text-sm font-mono w-12">${score.toFixed(1)}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>

        <section class="mb-8">
            <h2 class="text-2xl font-semibold mb-4">⚡ Performance Metrics</h2>
            <div class="bg-gray-800 rounded-lg p-6">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="text-center">
                        <div class="text-3xl font-bold text-blue-400">${data.metrics.totalTests}</div>
                        <div class="text-gray-400">Total Tests</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-green-400">${data.metrics.completedTests}</div>
                        <div class="text-gray-400">Completed</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-red-400">${data.metrics.failedTests}</div>
                        <div class="text-gray-400">Failed</div>
                    </div>
                </div>
            </div>
        </section>

        <section>
            <h2 class="text-2xl font-semibold mb-4">📈 Detailed Results</h2>
            <div class="space-y-6">
                ${Object.entries(data.results).map(([id, result]) => `
                    <div class="bg-gray-800 rounded-lg p-6">
                        <h3 class="text-xl font-semibold mb-4">${result.name}</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div>
                                <div class="text-gray-400">Overall Score</div>
                                <div class="text-2xl font-bold">${result.overallScore.toFixed(1)}</div>
                            </div>
                            <div>
                                <div class="text-gray-400">Response Time</div>
                                <div class="text-2xl font-bold">${result.averageResponseTime.toFixed(0)}ms</div>
                            </div>
                            <div>
                                <div class="text-gray-400">Pass Rate</div>
                                <div class="text-2xl font-bold">${((result.passedTests / result.totalTests) * 100).toFixed(1)}%</div>
                            </div>
                            <div>
                                <div class="text-gray-400">Tests Passed</div>
                                <div class="text-2xl font-bold">${result.passedTests}/${result.totalTests}</div>
                            </div>
                        </div>
                        <div class="space-y-4">
                            ${Object.entries(result.categories).map(([catId, cat]) => `
                                <div>
                                    <h4 class="font-semibold mb-2">${cat.name}</h4>
                                    <div class="text-sm text-gray-400">
                                        Score: ${cat.averageScore.toFixed(1)} | Time: ${cat.averageResponseTime.toFixed(0)}ms
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    </div>
</body>
</html>`;

    const htmlPath = path.join(process.cwd(), 'benchmark-results', 'superintelligence-benchmark.html');
    
    try {
      await fs.writeFile(htmlPath, html);
      console.log(`🌐 HTML report saved to: ${htmlPath}`);
    } catch (error) {
      console.error('Error saving HTML report:', error.message);
    }
  }

  displayResults() {
    console.log('\n🏆 BENCHMARK RESULTS');
    console.log('===================\n');

    const summary = this.calculateSummary();

    // Display rankings
    console.log('📊 Overall Rankings:');
    summary.rankings.forEach((rank, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(`${medal} #${index + 1} ${rank.name} - ${rank.score.toFixed(1)}/100 (${rank.responseTime.toFixed(0)}ms)`);
    });

    console.log('\n📈 Category Winners:');
    Object.entries(summary.categoryWinners).forEach(([catId, winner]) => {
      if (winner) {
        const categoryName = TEST_CATEGORIES[catId].name;
        console.log(`🏅 ${categoryName}: ${winner.name} (${winner.score.toFixed(1)}/100)`);
      }
    });

    console.log('\n⚡ Performance Summary:');
    console.log(`📊 Total Tests: ${this.metrics.totalTests}`);
    console.log(`✅ Completed: ${this.metrics.completedTests}`);
    console.log(`❌ Failed: ${this.metrics.failedTests}`);
    console.log(`📈 Success Rate: ${((this.metrics.completedTests / this.metrics.totalTests) * 100).toFixed(1)}%`);

    if (summary.winner) {
      console.log(`\n🎯 WINNER: ${summary.winner.name} (${summary.winner.score.toFixed(1)}/100)`);
    }

    console.log('\n📄 Reports generated in benchmark-results/ directory');
  }
}

// Run the benchmark
const benchmark = new SuperintelligenceBenchmark();
benchmark.runFullBenchmark().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
