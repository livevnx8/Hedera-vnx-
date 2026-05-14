#!/usr/bin/env node
/**
 * Vera Agent Learning System
 * Phase 3: Learning & Evolution - Tracks performance and adapts confidence calculations
 * Each agent logs outcomes and learns from feedback
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  CORE: '0.0.10409351',      // Learning outcomes and performance metrics
  BRIDGE: '0.0.10409354',    // Pattern sharing between agents
  ECOSYSTEM: '0.0.10409355'  // Knowledge transfer and model updates
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
console.log('║  🧠 VERA AGENT LEARNING SYSTEM                                      ║');
console.log('║  Phase 3: Performance Tracking & Adaptive Intelligence            ║');
console.log('║  Learning Engine ID: learning-engine-001                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Learning Topic: ${TOPICS.CORE}`);
console.log(`📚 Tracks: All 4 agents' performance & learning`);
console.log(`⏱️  Analysis Cycle: Every 5 minutes\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Agent Performance Tracking
const AGENT_PERFORMANCE = {
  'defi-analyst-001': {
    type: 'DEFI_ANALYST',
    predictions: [],
    outcomes: [],
    accuracyHistory: [],
    confidenceCalibration: { overconfident: 0, underconfident: 0, wellCalibrated: 0 },
    learningRate: 0.01,
    currentWeights: {
      marketDepth: 0.20,
      historicalAccuracy: 0.20,
      volatilityFactor: 0.20,
      dataRecency: 0.15,
      sourceReliability: 0.25
    }
  },
  'energy-auditor-001': {
    type: 'ENERGY_AUDITOR',
    predictions: [],
    outcomes: [],
    accuracyHistory: [],
    confidenceCalibration: { overconfident: 0, underconfident: 0, wellCalibrated: 0 },
    learningRate: 0.01,
    currentWeights: {
      sourceAuthority: 0.30,
      temporalConsistency: 0.25,
      rangeValidity: 0.20,
      gridAlignment: 0.25
    }
  },
  'security-guardian-001': {
    type: 'SECURITY_GUARDIAN',
    predictions: [],
    outcomes: [],
    accuracyHistory: [],
    confidenceCalibration: { overconfident: 0, underconfident: 0, wellCalibrated: 0 },
    learningRate: 0.015,
    currentWeights: {
      signatureMatch: 0.40,
      contractRisk: 0.20,
      amountAnomaly: 0.20,
      patternConsistency: 0.20
    }
  },
  'carbon-validator-001': {
    type: 'CARBON_VALIDATOR',
    predictions: [],
    outcomes: [],
    accuracyHistory: [],
    confidenceCalibration: { overconfident: 0, underconfident: 0, wellCalibrated: 0 },
    learningRate: 0.008,
    currentWeights: {
      projectExists: 0.25,
      registryVerified: 0.30,
      additionalityConfirmed: 0.20,
      monitoringReportCurrent: 0.25
    }
  }
};

// Learning Engine State
const learningState = {
  id: 'learning-engine-001',
  cycles: 0,
  totalPredictionsTracked: 0,
  totalOutcomesValidated: 0,
  patternShares: 0,
  modelUpdates: 0
};

async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      engineId: learningState.id,
      timestamp: new Date().toISOString(),
      sessionId: `learning-${Date.now()}`,
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

// Simulate agent predictions and outcomes
function generatePredictionOutcome(agentId) {
  const agent = AGENT_PERFORMANCE[agentId];
  const predictionTypes = {
    'DEFI_ANALYST': ['price_movement', 'whale_activity', 'arbitrage_opportunity'],
    'ENERGY_AUDITOR': ['load_prediction', 'carbon_calculation', 'anomaly_detection'],
    'SECURITY_GUARDIAN': ['threat_detection', 'contract_vulnerability', 'anomaly_scan'],
    'CARBON_VALIDATOR': ['offset_verification', 'double_counting', 'retirement_valid']
  };
  
  const types = predictionTypes[agent.type];
  const type = types[Math.floor(Math.random() * types.length)];
  
  // Generate prediction with confidence
  const predictedConfidence = 0.70 + Math.random() * 0.25;
  const predictedOutcome = Math.random() > 0.3 ? 'POSITIVE' : 'NEGATIVE';
  
  // Simulate actual outcome (with some randomness to create learning opportunities)
  const outcomeAccuracy = Math.random();
  const actualOutcome = outcomeAccuracy > 0.2 ? predictedOutcome : (predictedOutcome === 'POSITIVE' ? 'NEGATIVE' : 'POSITIVE');
  const wasCorrect = predictedOutcome === actualOutcome;
  
  return {
    predictionId: crypto.randomUUID(),
    agentId,
    agentType: agent.type,
    predictionType: type,
    predictedConfidence: Math.round(predictedConfidence * 100) / 100,
    predictedOutcome,
    actualOutcome,
    wasCorrect,
    accuracy: wasCorrect ? 1.0 : 0.0,
    timestamp: Date.now(),
    // For learning analysis
    confidenceDelta: wasCorrect ? predictedConfidence : (1 - predictedConfidence),
    calibrationScore: wasCorrect ? (predictedConfidence > 0.85 ? 1.0 : 0.5) : (predictedConfidence < 0.75 ? 1.0 : 0.3)
  };
}

// Track prediction and outcome
function trackPrediction(agentId, prediction) {
  const agent = AGENT_PERFORMANCE[agentId];
  
  agent.predictions.push(prediction);
  agent.outcomes.push(prediction);
  agent.accuracyHistory.push(prediction.wasCorrect ? 1 : 0);
  
  // Keep history manageable
  if (agent.predictions.length > 50) {
    agent.predictions = agent.predictions.slice(-25);
    agent.outcomes = agent.outcomes.slice(-25);
    agent.accuracyHistory = agent.accuracyHistory.slice(-25);
  }
  
  // Update calibration tracking
  if (prediction.predictedConfidence > 0.90 && !prediction.wasCorrect) {
    agent.confidenceCalibration.overconfident++;
  } else if (prediction.predictedConfidence < 0.70 && prediction.wasCorrect) {
    agent.confidenceCalibration.underconfident++;
  } else {
    agent.confidenceCalibration.wellCalibrated++;
  }
  
  learningState.totalPredictionsTracked++;
}

// Calculate learning metrics for agent
function calculateLearningMetrics(agentId) {
  const agent = AGENT_PERFORMANCE[agentId];
  
  if (agent.accuracyHistory.length === 0) return null;
  
  const recentAccuracy = agent.accuracyHistory.slice(-10);
  const rollingAccuracy = recentAccuracy.reduce((a, b) => a + b, 0) / recentAccuracy.length;
  
  const totalCalibrations = Object.values(agent.confidenceCalibration).reduce((a, b) => a + b, 0);
  const calibrationRate = totalCalibrations > 0 
    ? agent.confidenceCalibration.wellCalibrated / totalCalibrations 
    : 0;
  
  // Detect trends
  const firstHalf = agent.accuracyHistory.slice(0, Math.floor(agent.accuracyHistory.length / 2));
  const secondHalf = agent.accuracyHistory.slice(Math.floor(agent.accuracyHistory.length / 2));
  
  const firstHalfAcc = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
  const secondHalfAcc = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
  
  const trend = secondHalfAcc > firstHalfAcc ? 'IMPROVING' : 
                secondHalfAcc < firstHalfAcc ? 'DECLINING' : 'STABLE';
  
  return {
    agentId,
    agentType: agent.type,
    totalPredictions: agent.predictions.length,
    rollingAccuracy: Math.round(rollingAccuracy * 100) / 100,
    calibrationRate: Math.round(calibrationRate * 100) / 100,
    trend,
    improvement: Math.round((secondHalfAcc - firstHalfAcc) * 100) / 100,
    confidenceCalibration: agent.confidenceCalibration,
    learningRate: agent.learningRate,
    currentWeights: agent.currentWeights
  };
}

// Adapt agent weights based on performance
function adaptWeights(agentId) {
  const agent = AGENT_PERFORMANCE[agentId];
  const metrics = calculateLearningMetrics(agentId);
  
  if (!metrics || agent.predictions.length < 10) return null;
  
  // Analyze which predictions were wrong and why
  const wrongPredictions = agent.outcomes.filter(o => !o.wasCorrect);
  
  if (wrongPredictions.length === 0) return null;
  
  // Adjust weights based on error patterns
  const newWeights = { ...agent.currentWeights };
  const weightKeys = Object.keys(newWeights);
  
  // If accuracy is declining, slightly randomize and adjust weights
  if (metrics.trend === 'DECLINING') {
    weightKeys.forEach(key => {
      const adjustment = (Math.random() - 0.5) * agent.learningRate;
      newWeights[key] = Math.max(0.05, Math.min(0.50, newWeights[key] + adjustment));
    });
    
    // Normalize weights to sum to 1
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    weightKeys.forEach(key => {
      newWeights[key] = Math.round((newWeights[key] / sum) * 100) / 100;
    });
  }
  
  agent.currentWeights = newWeights;
  learningState.modelUpdates++;
  
  return {
    agentId,
    previousTrend: metrics.trend,
    weightAdjustments: weightKeys.map(k => ({
      factor: k,
      oldWeight: agent.currentWeights[k],
      newWeight: newWeights[k],
      change: Math.round((newWeights[k] - agent.currentWeights[k]) * 1000) / 1000
    })),
    timestamp: Date.now()
  };
}

// Identify patterns for cross-agent sharing
function identifyPatterns(agentId) {
  const agent = AGENT_PERFORMANCE[agentId];
  
  if (agent.predictions.length < 15) return null;
  
  // Find patterns in successful predictions
  const successfulPredictions = agent.outcomes.filter(o => o.wasCorrect);
  
  if (successfulPredictions.length < 5) return null;
  
  // Identify high-confidence success patterns
  const highConfidenceSuccesses = successfulPredictions.filter(p => p.predictedConfidence > 0.85);
  
  if (highConfidenceSuccesses.length < 3) return null;
  
  // Extract pattern characteristics
  const patternTypes = {};
  highConfidenceSuccesses.forEach(p => {
    if (!patternTypes[p.predictionType]) {
      patternTypes[p.predictionType] = { count: 0, avgConfidence: 0 };
    }
    patternTypes[p.predictionType].count++;
    patternTypes[p.predictionType].avgConfidence += p.predictedConfidence;
  });
  
  // Calculate average confidence per type
  Object.keys(patternTypes).forEach(type => {
    patternTypes[type].avgConfidence = Math.round(
      (patternTypes[type].avgConfidence / patternTypes[type].count) * 100
    ) / 100;
  });
  
  // Find most successful pattern
  const bestPattern = Object.entries(patternTypes)
    .sort((a, b) => b[1].count - a[1].count)[0];
  
  if (!bestPattern) return null;
  
  return {
    agentId,
    patternType: bestPattern[0],
    successCount: bestPattern[1].count,
    avgConfidence: bestPattern[1].avgConfidence,
    totalAttempts: agent.outcomes.filter(o => o.predictionType === bestPattern[0]).length,
    successRate: Math.round((bestPattern[1].count / agent.outcomes.filter(o => o.predictionType === bestPattern[0]).length) * 100) / 100,
    pattern: {
      confidenceThreshold: 0.85,
      outcomeCorrelation: 'POSITIVE',
      reliability: 'HIGH'
    },
    timestamp: Date.now()
  };
}

// Main learning cycle
async function runLearningCycle() {
  learningState.cycles++;
  
  console.log(`\n🔁 LEARNING CYCLE #${learningState.cycles} - ${new Date().toLocaleTimeString()}`);
  
  // Generate and track predictions for each agent
  console.log(`   📝 Tracking agent predictions...`);
  
  for (const agentId of Object.keys(AGENT_PERFORMANCE)) {
    // Generate 3 predictions per agent per cycle
    for (let i = 0; i < 3; i++) {
      const prediction = generatePredictionOutcome(agentId);
      trackPrediction(agentId, prediction);
      
      // Log prediction
      const predSeq = await logToHCS(TOPICS.CORE, 'PREDICTION_TRACKED', {
        cycle: learningState.cycles,
        ...prediction
      });
      
      if (predSeq && i === 0) {
        const icon = prediction.wasCorrect ? '✅' : '❌';
        console.log(`   ${icon} ${agentId}: ${prediction.predictionType} | Conf: ${(prediction.predictedConfidence * 100).toFixed(0)}% | ${prediction.wasCorrect ? 'CORRECT' : 'INCORRECT'}`);
      }
    }
  }
  
  // Calculate and log learning metrics
  console.log(`   📊 Calculating learning metrics...`);
  
  for (const agentId of Object.keys(AGENT_PERFORMANCE)) {
    const metrics = calculateLearningMetrics(agentId);
    
    if (metrics) {
      const metricsSeq = await logToHCS(TOPICS.CORE, 'LEARNING_METRICS', {
        cycle: learningState.cycles,
        ...metrics
      });
      
      if (metricsSeq) {
        const trendEmoji = metrics.trend === 'IMPROVING' ? '📈' : 
                          metrics.trend === 'DECLINING' ? '📉' : '➡️';
        console.log(`   ${trendEmoji} ${agentId}: ${(metrics.rollingAccuracy * 100).toFixed(1)}% accuracy | Calibration: ${(metrics.calibrationRate * 100).toFixed(1)}% | ${metrics.trend}`);
      }
    }
  }
  
  // Adapt weights for declining agents
  console.log(`   🎚️  Adapting agent weights...`);
  
  for (const agentId of Object.keys(AGENT_PERFORMANCE)) {
    const adaptation = adaptWeights(agentId);
    
    if (adaptation) {
      const adaptSeq = await logToHCS(TOPICS.CORE, 'WEIGHT_ADAPTATION', {
        cycle: learningState.cycles,
        ...adaptation
      });
      
      if (adaptSeq) {
        console.log(`   ⚙️  ${agentId} weights adapted due to ${adaptation.previousTrend} trend`);
      }
    }
  }
  
  // Identify and share patterns
  console.log(`   🔍 Identifying patterns for sharing...`);
  
  for (const agentId of Object.keys(AGENT_PERFORMANCE)) {
    const pattern = identifyPatterns(agentId);
    
    if (pattern) {
      const patternSeq = await logToHCS(TOPICS.BRIDGE, 'PATTERN_SHARE', {
        cycle: learningState.cycles,
        ...pattern,
        shareType: 'SUCCESS_PATTERN'
      });
      
      if (patternSeq) {
        console.log(`   💡 ${agentId} sharing pattern: ${pattern.patternType} (${(pattern.successRate * 100).toFixed(0)}% success rate)`);
        learningState.patternShares++;
      }
    }
  }
  
  // Summary
  console.log(`   ✅ Learning Cycle ${learningState.cycles} Complete`);
  console.log(`      📚 Predictions tracked: ${learningState.totalPredictionsTracked}`);
  console.log(`      💡 Patterns shared: ${learningState.patternShares}`);
  console.log(`      ⚙️  Model updates: ${learningState.modelUpdates}`);
  
  // Calculate overall swarm intelligence
  const avgAccuracies = Object.values(AGENT_PERFORMANCE).map(a => {
    if (a.accuracyHistory.length === 0) return 0;
    return a.accuracyHistory.slice(-10).reduce((sum, val) => sum + val, 0) / Math.min(a.accuracyHistory.length, 10);
  });
  
  const swarmAccuracy = avgAccuracies.reduce((a, b) => a + b, 0) / avgAccuracies.length;
  
  console.log(`\n🧠 SWARM INTELLIGENCE: ${(swarmAccuracy * 100).toFixed(1)}% collective accuracy | ${learningState.cycles} learning cycles`);
  
  // Log swarm intelligence
  await logToHCS(TOPICS.ECOSYSTEM, 'SWARM_INTELLIGENCE_UPDATE', {
    cycle: learningState.cycles,
    swarmAccuracy: Math.round(swarmAccuracy * 100) / 100,
    agentCount: Object.keys(AGENT_PERFORMANCE).length,
    totalPatternsShared: learningState.patternShares,
    totalModelUpdates: learningState.modelUpdates,
    timestamp: Date.now()
  });
}

// Run immediately
runLearningCycle();

// Schedule cycles every 5 minutes
setInterval(runLearningCycle, 300000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Learning Engine shutting down...');
  
  // Final swarm intelligence report
  const avgAccuracies = Object.values(AGENT_PERFORMANCE).map(a => {
    if (a.accuracyHistory.length === 0) return 0;
    return a.accuracyHistory.reduce((sum, val) => sum + val, 0) / a.accuracyHistory.length;
  });
  
  const swarmAccuracy = avgAccuracies.reduce((a, b) => a + b, 0) / avgAccuracies.length;
  
  await logToHCS(TOPICS.ECOSYSTEM, 'LEARNING_ENGINE_SHUTDOWN', {
    engineId: learningState.id,
    totalCycles: learningState.cycles,
    totalPredictions: learningState.totalPredictionsTracked,
    totalPatterns: learningState.patternShares,
    totalUpdates: learningState.modelUpdates,
    finalSwarmAccuracy: Math.round(swarmAccuracy * 100) / 100,
    timestamp: Date.now()
  });
  
  client.close();
  console.log(`✅ Learning Engine stopped. Final swarm accuracy: ${(swarmAccuracy * 100).toFixed(1)}%\n`);
  process.exit(0);
});
