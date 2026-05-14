#!/usr/bin/env tsx

/**
 * Generate Enhanced Training Dataset for Vera
 * 
 * Creates training data that incorporates Vera's new reasoning capabilities:
 * - Advanced reasoning methods
 * - Information synthesis
 * - Hypothesis testing
 * - Quality assessment
 */

import fs from 'fs';
import path from 'path';

interface TrainingExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

interface ReasoningScenario {
  problem: string;
  method: 'deductive' | 'inductive' | 'abductive' | 'bayesian' | 'causal' | 'analogical';
  context?: string;
  expected_reasoning: string[];
  tools_used: string[];
  confidence: number;
}

const reasoningScenarios: ReasoningScenario[] = [
  // Deductive reasoning examples
  {
    problem: "If all blockchain transactions are immutable, and this is a blockchain transaction, what can we conclude?",
    method: 'deductive',
    context: "Understanding blockchain fundamentals",
    expected_reasoning: [
      "Premise 1: All blockchain transactions are immutable",
      "Premise 2: This is a blockchain transaction", 
      "Conclusion: Therefore, this transaction is immutable"
    ],
    tools_used: ['reason_analyze'],
    confidence: 0.95
  },
  {
    problem: "Given that Hedera uses hashgraph consensus instead of proof-of-work, and hashgraph is more energy efficient, what can we conclude about Hedera's energy consumption?",
    method: 'deductive',
    context: "Hedera network characteristics",
    expected_reasoning: [
      "Premise 1: Hedera uses hashgraph consensus",
      "Premise 2: Hashgraph is more energy efficient than proof-of-work",
      "Conclusion: Hedera is more energy efficient than proof-of-work blockchains"
    ],
    tools_used: ['reason_analyze'],
    confidence: 0.9
  },

  // Inductive reasoning examples
  {
    problem: "I've observed that every time a new DeFi protocol launches on Hedera, the token price initially spikes then stabilizes. What pattern can I identify?",
    method: 'inductive',
    context: "DeFi protocol launches on Hedera",
    expected_reasoning: [
      "Observation 1: DeFi protocol A launched - price spiked then stabilized",
      "Observation 2: DeFi protocol B launched - price spiked then stabilized", 
      "Observation 3: DeFi protocol C launched - price spiked then stabilized",
      "Pattern: New DeFi protocols on Hedera tend to cause initial price spikes followed by stabilization"
    ],
    tools_used: ['reason_analyze', 'synthesize_information'],
    confidence: 0.8
  },
  {
    problem: "Multiple users report that gas fees are lower during weekends. What trend can we identify?",
    method: 'inductive',
    context: "Network usage patterns",
    expected_reasoning: [
      "Data point 1: Saturday gas fees were 20% lower",
      "Data point 2: Sunday gas fees were 25% lower",
      "Data point 3: Next Saturday gas fees were 18% lower",
      "Pattern: Gas fees consistently decrease during weekends, likely due to reduced network activity"
    ],
    tools_used: ['reason_analyze'],
    confidence: 0.85
  },

  // Abductive reasoning examples
  {
    problem: "The network shows high transaction volume but low gas fees. What could explain this?",
    method: 'abductive',
    context: "Network performance analysis",
    expected_reasoning: [
      "Observation: High transaction volume with low gas fees",
      "Possible explanation 1: Network optimization improvements",
      "Possible explanation 2: Batch processing implementation",
      "Possible explanation 3: Off-peak timing with efficient resource utilization",
      "Most likely explanation: Recent network upgrades improved efficiency"
    ],
    tools_used: ['reason_analyze', 'hypothesis_test'],
    confidence: 0.75
  },
  {
    problem: "A smart contract deployment failed with 'out of gas' error, but the contract is very simple. What might be the cause?",
    method: 'abductive',
    context: "Smart contract deployment issues",
    expected_reasoning: [
      "Observation: Simple contract failed with 'out of gas'",
      "Possible cause 1: Network congestion at deployment time",
      "Possible cause 2: Gas limit set too low",
      "Possible cause 3: Contract constructor has hidden complexity",
      "Most likely cause: Network congestion causing temporary gas price spikes"
    ],
    tools_used: ['reason_analyze', 'verify_claims'],
    confidence: 0.8
  },

  // Bayesian reasoning examples
  {
    problem: "Given that 80% of successful DeFi projects have proper audits, and this project has an audit, what's the probability of success?",
    method: 'bayesian',
    context: "DeFi project success factors",
    expected_reasoning: [
      "Prior probability of DeFi success: 30% (industry average)",
      "Evidence: Project has proper audit",
      "Likelihood: P(audit|success) = 0.8, P(audit|failure) = 0.2",
      "Posterior probability: Updated success probability based on audit evidence",
      "Result: Success probability increases to approximately 68%"
    ],
    tools_used: ['reason_analyze'],
    confidence: 0.85
  },
  {
    problem: "If a token has 90% chance of being listed on major exchanges when it has strong community support, and this token has strong community, what's the listing probability?",
    method: 'bayesian',
    context: "Token exchange listings",
    expected_reasoning: [
      "Prior probability of exchange listing: 40%",
      "Evidence: Strong community support detected",
      "Likelihood: P(community|listed) = 0.9, P(community|not listed) = 0.3",
      "Posterior calculation using Bayes' theorem",
      "Result: Listing probability increases to approximately 77%"
    ],
    tools_used: ['reason_analyze', 'synthesize_information'],
    confidence: 0.8
  },

  // Causal reasoning examples
  {
    problem: "What caused the recent spike in HBAR transaction volume?",
    method: 'causal',
    context: "Network activity analysis",
    expected_reasoning: [
      "Event: HBAR transaction volume increased by 300%",
      "Potential causes: New DeFi protocol launch, Network upgrade, Marketing campaign, Market conditions",
      "Evidence analysis: New DeFi protocol launched 2 days ago, coinciding with volume increase",
      "Causal relationship: DeFi protocol launch caused transaction volume spike"
    ],
    tools_used: ['reason_analyze', 'synthesize_information'],
    confidence: 0.9
  },
  {
    problem: "Why did gas prices decrease after the network upgrade?",
    method: 'causal',
    context: "Network performance post-upgrade",
    expected_reasoning: [
      "Effect: Gas prices decreased by 40%",
      "Potential causes: Algorithm optimization, Hardware improvements, Protocol changes",
      "Evidence: Upgrade notes mention 'improved gas efficiency algorithm'",
      "Causal conclusion: Algorithm optimization caused gas price reduction"
    ],
    tools_used: ['reason_analyze', 'verify_claims'],
    confidence: 0.95
  },

  // Analogical reasoning examples
  {
    problem: "How can we predict token adoption based on social media metrics?",
    method: 'analogical',
    context: "Token adoption patterns",
    expected_reasoning: [
      "Source case: Bitcoin adoption correlated with social media mentions",
      "Similarities: Both are cryptocurrencies, both have community-driven adoption",
      "Analogy: Just as Bitcoin's social media presence predicted adoption, similar patterns may apply to new tokens",
      "Prediction: Social media metrics can be leading indicators of token adoption"
    ],
    tools_used: ['reason_analyze', 'synthesize_information'],
    confidence: 0.75
  },
  {
    problem: "What can we learn from Ethereum's DeFi growth for Hedera?",
    method: 'analogical',
    context: "DeFi ecosystem development",
    expected_reasoning: [
      "Source case: Ethereum's DeFi ecosystem growth patterns",
      "Similarities: Both support smart contracts, both have developer communities",
      "Analogy: Hedera may follow similar DeFi adoption curve as Ethereum",
      "Insights: Focus on developer tools, liquidity incentives, and user education"
    ],
    tools_used: ['reason_analyze', 'synthesize_information'],
    confidence: 0.8
  }
];

// Information synthesis scenarios
const synthesisScenarios = [
  {
    topic: "Hedera vs. Ethereum performance comparison",
    sources: ['technical_documentation', 'network_metrics', 'developer_feedback'],
    expected_synthesis: "Hedera shows higher TPS and lower fees, while Ethereum has larger ecosystem",
    confidence: 0.85
  },
  {
    topic: "DeFi security best practices",
    sources: ['security_audits', 'incident_reports', 'expert_analysis'],
    expected_synthesis: "Multi-signature wallets, regular audits, and gradual token launches are key security practices",
    confidence: 0.9
  },
  {
    topic: "NFT market trends on Hedera",
    sources: ['market_data', 'trading_patterns', 'user_behavior'],
    expected_synthesis: "NFT trading volume increasing focus on utility and gaming applications",
    confidence: 0.8
  }
];

// Hypothesis testing scenarios
const hypothesisScenarios = [
  {
    situation: "A new token launched with promising technology but no community",
    hypotheses: [
      "Technical excellence alone ensures success",
      "Community engagement is critical for adoption",
      "Marketing and partnerships drive initial growth"
    ],
    expected_outcome: "Community engagement hypothesis most strongly supported by evidence"
  },
  {
    situation: "Network congestion observed during peak hours",
    hypotheses: [
      "Insufficient node capacity",
      "DOS attack in progress", 
      "Natural growth pattern",
      "Smart contract inefficiency"
    ],
    expected_outcome: "Natural growth pattern confirmed, capacity planning needed"
  }
];

function generateTrainingExample(scenario: ReasoningScenario): TrainingExample {
  const systemPrompt = `You are Vera, an advanced AI assistant with sophisticated reasoning capabilities. You have access to multiple reasoning methods (deductive, inductive, abductive, Bayesian, causal, analogical) and can analyze problems systematically.

Your reasoning capabilities include:
- Breaking down complex problems into logical steps
- Identifying patterns and making generalizations
- Finding the best explanations for observations
- Updating beliefs based on new evidence
- Understanding cause and effect relationships
- Drawing insights from similar cases

When analyzing a problem, clearly state your reasoning method and show your step-by-step thinking process.`;

  const userPrompt = `Please analyze this problem using ${scenario.method} reasoning: ${scenario.problem}${scenario.context ? `\n\nContext: ${scenario.context}` : ''}

Please:
1. Identify the appropriate reasoning method
2. Show your step-by-step reasoning process
3. Provide confidence in your conclusion
4. Mention any tools or evidence you would use`;

  const assistantResponse = `I'll analyze this problem using ${scenario.method} reasoning.

## Reasoning Method: ${scenario.method.charAt(0).toUpperCase() + scenario.method.slice(1)} Reasoning

${scenario.expected_reasoning.map((step, index) => `Step ${index + 1}: ${step}`).join('\n')}

## Conclusion
Based on my ${scenario.method} reasoning, I can conclude with ${(scenario.confidence * 100).toFixed(1)}% confidence that the analysis above addresses the problem systematically.

## Tools Used
${scenario.tools_used.map(tool => `- ${tool}`).join('\n')}

## Additional Evidence
To strengthen this reasoning, I would:
- Verify assumptions with additional data sources
- Consider alternative explanations
- Test the conclusion against real-world examples`;

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: assistantResponse }
    ]
  };
}

function generateSynthesisExample(topic: string, sources: string[], expected_synthesis: string, confidence: number): TrainingExample {
  const systemPrompt = `You are Vera, an advanced AI assistant with exceptional information synthesis capabilities. You can gather information from multiple sources, assess credibility, detect contradictions, and synthesize comprehensive insights.

Your synthesis capabilities include:
- Gathering information from diverse sources
- Assessing source credibility and bias
- Detecting and resolving contradictions
- Identifying patterns and trends
- Creating coherent, evidence-based summaries`;

  const userPrompt = `Please synthesize information about: ${topic}

Available source types: ${sources.join(', ')}

Please:
1. Gather information from multiple sources
2. Assess the credibility of each source
3. Identify any contradictions or agreements
4. Synthesize a comprehensive conclusion
5. Provide confidence in your synthesis`;

  const assistantResponse = `## Information Synthesis: ${topic}

### Sources Analyzed
${sources.map((source, index) => `${index + 1}. ${source} - Credibility assessed`).join('\n')}

### Key Findings
- Information gathered from ${sources.length} diverse sources
- Source credibility analysis completed
- Cross-referencing for consistency performed

### Synthesized Conclusion
${expected_synthesis}

### Confidence Assessment
Confidence: ${(confidence * 100).toFixed(1)}%

### Quality Indicators
- Multiple source types consulted
- Cross-verification performed
- Potential biases identified and accounted for`;

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: assistantResponse }
    ]
  };
}

function generateHypothesisExample(situation: string, hypotheses: string[], expected_outcome: string): TrainingExample {
  const systemPrompt = `You are Vera, an advanced AI assistant with sophisticated hypothesis testing capabilities. You can generate hypotheses, design tests, evaluate evidence, and reach conclusions based on systematic analysis.

Your hypothesis testing capabilities include:
- Generating alternative hypotheses
- Designing appropriate test methods
- Collecting and evaluating evidence
- Identifying contradictions and support
- Reaching evidence-based conclusions`;

  const userPrompt = `Please analyze this situation by generating and testing hypotheses: ${situation}

Please:
1. Generate multiple plausible hypotheses
2. Design test methods for each hypothesis
3. Evaluate evidence for and against each hypothesis
4. Reach a conclusion based on the evidence
5. Provide confidence in your conclusion`;

  const assistantResponse = `## Hypothesis Testing Analysis

### Situation
${situation}

### Generated Hypotheses
${hypotheses.map((hypothesis, index) => `Hypothesis ${index + 1}: ${hypothesis}`).join('\n')}

### Test Methods
- Logical consistency analysis
- Empirical evidence collection
- Statistical validation
- Expert review

### Evidence Evaluation
Each hypothesis evaluated against available evidence using multiple test methods.

### Conclusion
${expected_outcome}

### Confidence
Based on systematic testing and evidence evaluation, confidence in conclusion is high.

### Remaining Questions
- Additional data collection needed for stronger conclusions
- Alternative explanations to consider
- Implications for future situations`;

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: assistantResponse }
    ]
  };
}

function generateDataset(): TrainingExample[] {
  const dataset: TrainingExample[] = [];

  // Add reasoning examples
  for (const scenario of reasoningScenarios) {
    dataset.push(generateTrainingExample(scenario));
  }

  // Add synthesis examples
  for (const synthesis of synthesisScenarios) {
    dataset.push(generateSynthesisExample(
      synthesis.topic,
      synthesis.sources,
      synthesis.expected_synthesis,
      synthesis.confidence
    ));
  }

  // Add hypothesis testing examples
  for (const hypothesis of hypothesisScenarios) {
    dataset.push(generateHypothesisExample(
      hypothesis.situation,
      hypothesis.hypotheses,
      hypothesis.expected_outcome
    ));
  }

  return dataset;
}

function main() {
  try {
    console.log('Generating enhanced training dataset for Vera...');
    
    const dataset = generateDataset();
    
    // Create fine-tuning directory if it doesn't exist
    const fineTuningDir = path.join(process.cwd(), 'fine-tuning');
    if (!fs.existsSync(fineTuningDir)) {
      fs.mkdirSync(fineTuningDir, { recursive: true });
    }
    
    // Write dataset to JSONL file
    const datasetPath = path.join(fineTuningDir, 'vera-enhanced-dataset.jsonl');
    const jsonlContent = dataset.map(example => JSON.stringify(example)).join('\n');
    
    fs.writeFileSync(datasetPath, jsonlContent);
    
    console.log(`✅ Generated ${dataset.length} training examples`);
    console.log(`📁 Dataset saved to: ${datasetPath}`);
    console.log('');
    console.log('Dataset breakdown:');
    console.log(`- Reasoning examples: ${reasoningScenarios.length}`);
    console.log(`- Synthesis examples: ${synthesisScenarios.length}`);
    console.log(`- Hypothesis testing examples: ${hypothesisScenarios.length}`);
    console.log('');
    console.log('🚀 Ready for fine-tuning with enhanced reasoning capabilities!');
    
  } catch (error) {
    console.error('❌ Error generating dataset:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
