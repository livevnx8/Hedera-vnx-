#!/usr/bin/env node
/**
 * Vera Cross-Agent Knowledge Transfer
 * Phase 3: Knowledge Transfer - Agents share insights and learn from each other
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  BRIDGE: '0.0.10409354',    // Knowledge sharing hub
  ECOSYSTEM: '0.0.10409355', // Knowledge base updates
  CORE: '0.0.10409351'       // Knowledge validation
};

// Initialize HCS Client
const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';

const client = Client.forMainnet();
let privateKey;

if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}

client.setOperator(operatorId, privateKey);

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  📚 VERA CROSS-AGENT KNOWLEDGE TRANSFER                             ║');
console.log('║  Phase 3: Knowledge Sharing & Collective Learning                  ║');
console.log('║  Knowledge Transfer ID: knowledge-transfer-001                      ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Knowledge Topic: ${TOPICS.BRIDGE}`);
console.log(`📖 Sharing: Patterns | Insights | Best Practices | Models`);
console.log(`⏱️  Transfer Cycle: Every 6 minutes\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Shared Knowledge Base
const KNOWLEDGE_BASE = {
  patterns: new Map(),
  insights: new Map(),
  bestPractices: new Map(),
  models: new Map()
};

// Knowledge Transfer State
const transferState = {
  id: 'knowledge-transfer-001',
  cycles: 0,
  patternsShared: 0,
  insightsTransferred: 0,
  bestPracticesAdopted: 0,
  modelUpdates: 0,
  knowledgeAdoption: new Map() // Track which agents adopt what knowledge
};

// Agent knowledge profiles
const AGENT_KNOWLEDGE_PROFILES = {
  'defi-analyst-001': {
    type: 'DEFI_ANALYST',
    expertise: ['tokenomics', 'market_analysis', 'liquidity_pools'],
    knowledgeGaps: ['security_threats', 'carbon_impact'],
    sharedPatterns: [],
    adoptedPatterns: []
  },
  'energy-auditor-001': {
    type: 'ENERGY_AUDITOR',
    expertise: ['grid_monitoring', 'carbon_calculation', 'load_prediction'],
    knowledgeGaps: ['defi_protocols', 'security_anomalies'],
    sharedPatterns: [],
    adoptedPatterns: []
  },
  'security-guardian-001': {
    type: 'SECURITY_GUARDIAN',
    expertise: ['threat_detection', 'anomaly_scanning', 'attack_patterns'],
    knowledgeGaps: ['carbon_verification', 'energy_forecasting'],
    sharedPatterns: [],
    adoptedPatterns: []
  },
  'carbon-validator-001': {
    type: 'CARBON_VALIDATOR',
    expertise: ['offset_verification', 'double_counting', 'impact_assessment'],
    knowledgeGaps: ['defi_analysis', 'grid_monitoring'],
    sharedPatterns: [],
    adoptedPatterns: []
  }
};

async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      transferId: transferState.id,
      timestamp: new Date().toISOString(),
      sessionId: `transfer-${Date.now()}`,
      ...data
    };

    await new Promise(r => setTimeout(r, 150));

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    return receipt.topicSequenceNumber?.toString();
  } catch (error) {
    console.log(`   ⚠️ HCS ${type} failed: ${error.message.substring(0, 40)}`);
    return null;
  }
}

// Generate pattern from agent expertise
function generatePattern(agentId) {
  const profile = AGENT_KNOWLEDGE_PROFILES[agentId];
  const expertise = profile.expertise[Math.floor(Math.random() * profile.expertise.length)];
  
  const patterns = {
    tokenomics: {
      name: 'High_Velocity_Token_Detection',
      description: 'Detect tokens with velocity >2x average and declining holder concentration',
      conditions: ['velocity > 2.0', 'holder_concentration > 0.6', 'volume_spike > 150%'],
      confidence: 0.88,
      successRate: 0.82,
      useCases: ['whale_detection', 'pump_dump_prevention']
    },
    market_analysis: {
      name: 'Arbitrage_Opportunity_Identification',
      description: 'Identify price discrepancies >1.5% across DEXs with sufficient liquidity',
      conditions: ['price_spread > 1.5%', 'liquidity_depth > $100K', 'execution_time < 20s'],
      confidence: 0.91,
      successRate: 0.87,
      useCases: ['profit_generation', 'market_efficiency']
    },
    grid_monitoring: {
      name: 'Frequency_Anomaly_Detection',
      description: 'Detect grid frequency deviations >0.05 Hz from 60 Hz baseline',
      conditions: ['frequency_deviation > 0.05', 'duration > 30s', 'zone_affected = true'],
      confidence: 0.94,
      successRate: 0.89,
      useCases: ['grid_stability', 'emergency_response']
    },
    carbon_calculation: {
      name: 'Carbon_Intensity_Correlation',
      description: 'Correlate generation mix with real-time carbon intensity calculations',
      conditions: ['generation_data_fresh < 10min', 'source_verified = true', 'weather_data_available = true'],
      confidence: 0.86,
      successRate: 0.84,
      useCases: ['carbon_footprint', 'offset_planning']
    },
    threat_detection: {
      name: 'Flash_Loan_Attack_Pattern',
      description: 'Detect flash loan attacks via rapid sequential transactions on same block',
      conditions: ['transaction_count > 5', 'time_window < 15s', 'value_change > 20%'],
      confidence: 0.92,
      successRate: 0.90,
      useCases: ['security_alert', 'contract_protection']
    },
    offset_verification: {
      name: 'Double_Counting_Detection',
      description: 'Cross-reference serial numbers across multiple registries',
      conditions: ['registry_check = complete', 'serial_unique = verified', 'retirement_traceable = true'],
      confidence: 0.95,
      successRate: 0.93,
      useCases: ['integrity_assurance', 'fraud_prevention']
    }
  };
  
  const pattern = patterns[expertise];
  if (!pattern) return null;
  
  return {
    patternId: crypto.randomUUID(),
    sourceAgent: agentId,
    sourceType: profile.type,
    expertise,
    ...pattern,
    timestamp: Date.now(),
    transferCount: 0,
    adoptionCount: 0
  };
}

// Share pattern with other agents
async function sharePattern(pattern) {
  const seq = await logToHCS(TOPICS.BRIDGE, 'KNOWLEDGE_PATTERN_SHARE', {
    ...pattern,
    shareType: 'PATTERN',
    transferableTo: Object.keys(AGENT_KNOWLEDGE_PROFILES).filter(id => id !== pattern.sourceAgent)
  });
  
  if (seq) {
    // Add to knowledge base
    KNOWLEDGE_BASE.patterns.set(pattern.patternId, pattern);
    
    // Update source agent
    AGENT_KNOWLEDGE_PROFILES[pattern.sourceAgent].sharedPatterns.push(pattern.patternId);
    
    transferState.patternsShared++;
    
    console.log(`   💡 ${pattern.sourceAgent} shared: ${pattern.name}`);
    console.log(`      Domain: ${pattern.expertise} | Success rate: ${(pattern.successRate * 100).toFixed(0)}%`);
    
    return true;
  }
  
  return false;
}

// Generate insight from cross-domain analysis
function generateInsight(agentId) {
  const profile = AGENT_KNOWLEDGE_PROFILES[agentId];
  
  // Generate cross-domain insights
  const insights = [
    {
      title: 'DeFi_Carbon_Correlation',
      description: 'High transaction volume on DOVU corresponds to increased carbon offset retirements',
      sourceDomains: ['defi', 'carbon'],
      correlation: 0.73,
      actionable: true,
      recommendation: 'Monitor DOVU activity as leading indicator for carbon demand'
    },
    {
      title: 'Energy_Price_Impact',
      description: 'Grid load peaks correlate with decreased HBAR staking activity',
      sourceDomains: ['energy', 'defi'],
      correlation: -0.68,
      actionable: true,
      recommendation: 'Adjust staking incentives during peak energy hours'
    },
    {
      title: 'Security_Carbon_Link',
      description: 'Suspicious retirement patterns often precede smart contract exploits',
      sourceDomains: ['security', 'carbon'],
      correlation: 0.61,
      actionable: true,
      recommendation: 'Cross-reference carbon retirements with security monitoring'
    },
    {
      title: 'Grid_Frequency_Alert_Efficiency',
      description: 'Grid frequency anomalies detected 15 minutes before market volatility',
      sourceDomains: ['energy', 'defi'],
      correlation: 0.79,
      actionable: true,
      recommendation: 'Use grid stability as market health indicator'
    }
  ];
  
  const insight = insights[Math.floor(Math.random() * insights.length)];
  
  return {
    insightId: crypto.randomUUID(),
    sourceAgent: agentId,
    sourceType: profile.type,
    ...insight,
    timestamp: Date.now(),
    validationStatus: 'PENDING',
    adoptionCount: 0
  };
}

// Transfer insight to knowledge base
async function transferInsight(insight) {
  const seq = await logToHCS(TOPICS.ECOSYSTEM, 'INSIGHT_TRANSFER', {
    ...insight,
    transferType: 'INSIGHT',
    relevance: insight.actionable ? 'HIGH' : 'MEDIUM'
  });
  
  if (seq) {
    KNOWLEDGE_BASE.insights.set(insight.insightId, insight);
    transferState.insightsTransferred++;
    
    console.log(`   🔍 ${insight.sourceAgent} insight: ${insight.title}`);
    console.log(`      Correlation: ${(insight.correlation * 100).toFixed(0)}% | Actionable: ${insight.actionable ? 'YES' : 'NO'}`);
    
    return true;
  }
  
  return false;
}

// Simulate agent adopting knowledge
async function adoptKnowledge(agentId, knowledgeType, knowledgeId) {
  const profile = AGENT_KNOWLEDGE_PROFILES[agentId];
  
  // Check if agent can adopt this knowledge type
  let canAdopt = false;
  
  if (knowledgeType === 'PATTERN') {
    const pattern = KNOWLEDGE_BASE.patterns.get(knowledgeId);
    if (pattern) {
      // Agent can adopt if it's not their own pattern and they have related knowledge gaps
      canAdopt = pattern.sourceAgent !== agentId && 
                 profile.knowledgeGaps.some(gap => pattern.useCases.includes(gap));
    }
  }
  
  if (!canAdopt) return null;
  
  // Simulate adoption with learning curve
  const adoptionRate = 0.7 + Math.random() * 0.25; // 70-95% adoption
  const proficiencyTime = Math.round(7 + Math.random() * 21); // 7-28 days to proficiency
  
  const adoption = {
    adoptionId: crypto.randomUUID(),
    agentId,
    agentType: profile.type,
    knowledgeType,
    knowledgeId,
    adoptionRate: Math.round(adoptionRate * 100) / 100,
    expectedProficiencyDays: proficiencyTime,
    status: 'ADOPTING',
    timestamp: Date.now()
  };
  
  const seq = await logToHCS(TOPICS.CORE, 'KNOWLEDGE_ADOPTION', adoption);
  
  if (seq) {
    profile.adoptedPatterns.push(knowledgeId);
    
    // Track in transfer state
    if (!transferState.knowledgeAdoption.has(agentId)) {
      transferState.knowledgeAdoption.set(agentId, []);
    }
    transferState.knowledgeAdoption.get(agentId).push(knowledgeId);
    
    console.log(`   📖 ${agentId} adopting ${knowledgeType.toLowerCase()} ${knowledgeId.substring(0, 8)}...`);
    console.log(`      Adoption rate: ${(adoptionRate * 100).toFixed(0)}% | Proficiency: ${proficiencyTime} days`);
    
    return adoption;
  }
  
  return null;
}

// Update knowledge base statistics
async function updateKnowledgeBaseStats() {
  const stats = {
    totalPatterns: KNOWLEDGE_BASE.patterns.size,
    totalInsights: KNOWLEDGE_BASE.insights.size,
    totalBestPractices: KNOWLEDGE_BASE.bestPractices.size,
    totalModels: KNOWLEDGE_BASE.models.size,
    patternsShared: transferState.patternsShared,
    insightsTransferred: transferState.insightsTransferred,
    adoptionsByAgent: Object.fromEntries(
      Array.from(transferState.knowledgeAdoption.entries()).map(([agent, knowledge]) => [agent, knowledge.length])
    ),
    swarmKnowledgeScore: calculateSwarmKnowledgeScore()
  };
  
  const seq = await logToHCS(TOPICS.ECOSYSTEM, 'KNOWLEDGE_BASE_STATS', {
    cycle: transferState.cycles,
    ...stats,
    timestamp: Date.now()
  });
  
  if (seq) {
    console.log(`   📊 Knowledge Base: ${stats.totalPatterns} patterns | ${stats.totalInsights} insights`);
    console.log(`      Swarm Knowledge Score: ${(stats.swarmKnowledgeScore * 100).toFixed(1)}%`);
  }
}

// Calculate swarm knowledge score
function calculateSwarmKnowledgeScore() {
  const totalAdoptions = Array.from(transferState.knowledgeAdoption.values())
    .reduce((sum, adoptions) => sum + adoptions.length, 0);
  
  const totalPossibleAdoptions = Object.keys(AGENT_KNOWLEDGE_PROFILES).length * KNOWLEDGE_BASE.patterns.size;
  
  if (totalPossibleAdoptions === 0) return 0;
  
  return Math.min(totalAdoptions / (totalPossibleAdoptions * 0.3), 1.0); // 30% adoption = 100% score
}

// Main transfer cycle
async function runTransferCycle() {
  transferState.cycles++;
  
  console.log(`\n🔁 TRANSFER CYCLE #${transferState.cycles} - ${new Date().toLocaleTimeString()}`);
  
  // Each agent shares a pattern
  console.log(`   💡 Agents sharing patterns...`);
  
  for (const agentId of Object.keys(AGENT_KNOWLEDGE_PROFILES)) {
    const pattern = generatePattern(agentId);
    if (pattern) {
      await sharePattern(pattern);
    }
  }
  
  // Generate and transfer insights
  console.log(`   🔍 Generating cross-domain insights...`);
  
  for (let i = 0; i < 2; i++) {
    const randomAgent = Object.keys(AGENT_KNOWLEDGE_PROFILES)[
      Math.floor(Math.random() * Object.keys(AGENT_KNOWLEDGE_PROFILES).length)
    ];
    const insight = generateInsight(randomAgent);
    await transferInsight(insight);
  }
  
  // Simulate knowledge adoption
  console.log(`   📖 Simulating knowledge adoption...`);
  
  for (const agentId of Object.keys(AGENT_KNOWLEDGE_PROFILES)) {
    // Try to adopt 1-2 random patterns
    const availablePatterns = Array.from(KNOWLEDGE_BASE.patterns.values())
      .filter(p => p.sourceAgent !== agentId && !AGENT_KNOWLEDGE_PROFILES[agentId].adoptedPatterns.includes(p.patternId));
    
    if (availablePatterns.length > 0) {
      const patternsToAdopt = availablePatterns.slice(0, 1 + Math.floor(Math.random() * 2));
      
      for (const pattern of patternsToAdopt) {
        await adoptKnowledge(agentId, 'PATTERN', pattern.patternId);
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
  
  // Update knowledge base stats
  await updateKnowledgeBaseStats();
  
  // Summary
  console.log(`   ✅ Transfer Cycle ${transferState.cycles} Complete`);
  console.log(`      💡 Patterns shared: ${transferState.patternsShared}`);
  console.log(`      🔍 Insights transferred: ${transferState.insightsTransferred}`);
  
  const totalAdoptions = Array.from(transferState.knowledgeAdoption.values())
    .reduce((sum, adoptions) => sum + adoptions.length, 0);
  console.log(`      📖 Total adoptions: ${totalAdoptions}`);
  
  console.log(`\n📚 KNOWLEDGE TRANSFER TOTALS: ${transferState.patternsShared} patterns | ${transferState.insightsTransferred} insights | ${totalAdoptions} adoptions | ${transferState.cycles} cycles`);
}

// Run immediately
runTransferCycle();

// Schedule cycles every 6 minutes
setInterval(runTransferCycle, 360000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Knowledge Transfer shutting down...');
  
  const totalAdoptions = Array.from(transferState.knowledgeAdoption.values())
    .reduce((sum, adoptions) => sum + adoptions.length, 0);
  
  await logToHCS(TOPICS.ECOSYSTEM, 'KNOWLEDGE_TRANSFER_SHUTDOWN', {
    transferId: transferState.id,
    totalCycles: transferState.cycles,
    totalPatterns: transferState.patternsShared,
    totalInsights: transferState.insightsTransferred,
    totalAdoptions,
    finalSwarmKnowledgeScore: calculateSwarmKnowledgeScore(),
    timestamp: Date.now()
  });
  
  client.close();
  console.log(`✅ Knowledge Transfer stopped. ${totalAdoptions} knowledge adoptions completed\n`);
  process.exit(0);
});
