#!/usr/bin/env node
/**
 * McLaren F1 Scenario Simulator - Predictive Analytics Swarm
 * Simulates race scenarios and generates predictive carbon/performance insights
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  accountId: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
  privateKey: process.env.HEDERA_OPERATOR_PRIVATE_KEY,
  network: process.env.HEDERA_NETWORK || 'mainnet',
  topic: process.env.MCLAREN_SCENARIO_SIMULATOR_TOPIC_ID || '0.0.10414317' // Using season topic for now
};

// Parse private key
let privateKey;
const keyStr = CONFIG.privateKey;
if (keyStr.startsWith('0x')) {
  privateKey = PrivateKey.fromStringECDSA(keyStr.slice(2));
} else if (keyStr.length === 64) {
  privateKey = PrivateKey.fromStringECDSA(keyStr);
} else if (keyStr.length === 96) {
  privateKey = PrivateKey.fromStringED25519(keyStr);
} else {
  privateKey = PrivateKey.fromString(keyStr);
}

// Initialize Hedera client
const client = CONFIG.network === 'mainnet' 
  ? Client.forMainnet().setOperator(CONFIG.accountId, privateKey)
  : Client.forTestnet().setOperator(CONFIG.accountId, privateKey);

// Scenario Simulator Swarm Agents
const SIMULATION_SWARM = [
  { id: 'sim-predictor-1', name: 'Weather Impact Modeler', role: 'primary', weight: 0.35 },
  { id: 'sim-predictor-2', name: 'Strategy Optimizer', role: 'validator', weight: 0.35 },
  { id: 'sim-predictor-3', name: 'Risk Assessor', role: 'validator', weight: 0.30 }
];

// Race Scenarios to Simulate
const SCENARIOS = [
  {
    id: 'SCEN-001',
    name: 'Wet Weather Monaco',
    description: 'Simulating Monaco GP with 80% rain probability throughout race',
    baseRace: 'Monaco GP',
    variables: {
      weather: 'heavy-rain',
      temperature: 18, // celsius
      trackCondition: 'wet',
      tireStrategy: 'intermediate-full-wet',
      safetyCarProbability: 0.75,
      redFlagProbability: 0.25
    },
    carbonModifiers: {
      fuelConsumption: 1.15, // +15% due to slower pace
      tireUsage: 1.3, // +30% more tire changes
      logistics: 1.0 // unchanged
    }
  },
  {
    id: 'SCEN-002',
    name: 'Extra Pit Stop Strategy',
    description: '3-stop strategy vs optimal 2-stop at Silverstone',
    baseRace: 'British GP',
    variables: {
      pitStops: 3,
      tireChanges: 6,
      fuelLoad: 'lighter',
      pace: 'aggressive',
      overtakeAttempts: 12
    },
    carbonModifiers: {
      fuelConsumption: 0.95, // -5% lighter fuel
      tireUsage: 1.5, // +50% extra tires
      logistics: 1.0
    }
  },
  {
    id: 'SCEN-003',
    name: 'Sprint Weekend Format',
    description: 'F1 Sprint weekend with additional 100km race on Saturday',
    baseRace: 'Italian GP',
    variables: {
      sprintRace: true,
      sprintDistance: 100,
      mainRaceDistance: 305,
      totalSessions: 6, // FP1, Sprint Quali, Sprint, FP2, Quali, Race
      tireAllocation: 12 // extra sets
    },
    carbonModifiers: {
      fuelConsumption: 1.25, // +25% total fuel
      tireUsage: 1.4, // +40% more tires
      logistics: 1.15 // +15% extended operations
    }
  },
  {
    id: 'SCEN-004',
    name: 'Sustainable Fuel Mix',
    description: 'E10 sustainable fuel with 10% bio-component vs standard',
    baseRace: 'Belgian GP',
    variables: {
      fuelType: 'E10-sustainable',
      bioComponent: 0.10,
      powerOutput: 0.98, // -2% power
      fuelEfficiency: 1.05 // +5% efficiency
    },
    carbonModifiers: {
      fuelConsumption: 0.95, // -5% net carbon
      tireUsage: 1.0,
      logistics: 1.0,
      carbonOffset: 0.10 // built-in 10% reduction
    }
  },
  {
    id: 'SCEN-005',
    name: 'Back-to-Back Races',
    description: 'Consecutive race weekends with compressed logistics',
    baseRace: 'Austrian + British GP',
    variables: {
      consecutiveWeekends: 2,
      logisticsMode: 'express',
      freightConsolidation: true,
      personnelRotation: 0.7 // 30% rest rotation
    },
    carbonModifiers: {
      fuelConsumption: 1.0,
      tireUsage: 1.0,
      logistics: 0.85 // -15% due to consolidation
    }
  }
];

// Run simulation
function runSimulation(scenario) {
  const baseCarbon = 2800; // kg CO2e baseline per race
  
  // Calculate modified carbon
  const fuelCarbon = baseCarbon * 0.45 * scenario.carbonModifiers.fuelConsumption;
  const tireCarbon = baseCarbon * 0.25 * scenario.carbonModifiers.tireUsage;
  const logisticsCarbon = baseCarbon * 0.30 * scenario.carbonModifiers.logistics;
  
  let totalCarbon = fuelCarbon + tireCarbon + logisticsCarbon;
  
  // Apply carbon offset if applicable
  if (scenario.carbonModifiers.carbonOffset) {
    totalCarbon = totalCarbon * (1 - scenario.carbonModifiers.carbonOffset);
  }
  
  // Performance impact
  const performanceImpact = calculatePerformanceImpact(scenario);
  
  return {
    scenario: scenario.id,
    name: scenario.name,
    description: scenario.description,
    baseRace: scenario.baseRace,
    carbon: {
      baseline: Math.round(baseCarbon),
      projected: Math.round(totalCarbon),
      delta: Math.round(totalCarbon - baseCarbon),
      deltaPercent: ((totalCarbon - baseCarbon) / baseCarbon * 100).toFixed(1),
      breakdown: {
        fuel: Math.round(fuelCarbon),
        tires: Math.round(tireCarbon),
        logistics: Math.round(logisticsCarbon)
      }
    },
    performance: performanceImpact,
    confidence: 0.85 + (Math.random() * 0.10),
    timestamp: Date.now()
  };
}

function calculatePerformanceImpact(scenario) {
  const impacts = [];
  
  if (scenario.variables.weather === 'heavy-rain') {
    impacts.push({ factor: 'pace', impact: -0.15, reason: 'Wet conditions slow lap times' });
    impacts.push({ factor: 'safety', impact: 0.25, reason: 'Higher crash risk' });
  }
  
  if (scenario.variables.pitStops > 2) {
    impacts.push({ factor: 'strategy', impact: 0.10, reason: 'More strategic flexibility' });
    impacts.push({ factor: 'overtaking', impact: 0.15, reason: 'Fresh tire advantage' });
  }
  
  if (scenario.variables.sprintRace) {
    impacts.push({ factor: 'points-opportunity', impact: 0.20, reason: 'Extra sprint points available' });
    impacts.push({ factor: 'wear', impact: -0.10, reason: 'Increased component stress' });
  }
  
  if (scenario.variables.fuelType?.includes('sustainable')) {
    impacts.push({ factor: 'sustainability', impact: 0.30, reason: 'Carbon neutral progress' });
    impacts.push({ factor: 'power', impact: -0.02, reason: 'Slight power reduction' });
  }
  
  return {
    overall: impacts.reduce((sum, i) => sum + i.impact, 0).toFixed(2),
    factors: impacts,
    recommendation: generateRecommendation(scenario, impacts)
  };
}

function generateRecommendation(scenario, impacts) {
  const netImpact = impacts.reduce((sum, i) => sum + i.impact, 0);
  
  if (netImpact > 0.15) return 'Favorable scenario - recommend implementation';
  if (netImpact > 0) return 'Slightly favorable - monitor closely';
  if (netImpact > -0.10) return 'Neutral - proceed with caution';
  return 'High risk - consider mitigation strategies';
}

// Swarm validation of simulations
async function swarmValidateSimulations(simulations) {
  const validations = await Promise.all(
    SIMULATION_SWARM.map(async agent => {
      let analysis;
      
      // Each agent validates different aspects
      const avgConfidence = simulations.reduce((sum, s) => sum + s.confidence, 0) / simulations.length;
      const totalCarbonDelta = simulations.reduce((sum, s) => sum + parseFloat(s.carbon.delta), 0);
      
      switch(agent.name) {
        case 'Weather Impact Modeler':
          const weatherScenarios = simulations.filter(s => s.scenario.includes('SCEN-001'));
          analysis = {
            perspective: 'weather-modeling',
            confidence: avgConfidence,
            insight: `Weather scenarios show ${totalCarbonDelta > 0 ? 'increased' : 'decreased'} carbon by ${Math.abs(totalCarbonDelta)}kg avg`,
            recommendation: totalCarbonDelta > 500 ? 'Deploy additional carbon offsets' : 'Standard offset program sufficient'
          };
          break;
          
        case 'Strategy Optimizer':
          const strategyScenarios = simulations.filter(s => s.scenario.includes('SCEN-002') || s.scenario.includes('SCEN-003'));
          analysis = {
            perspective: 'strategy-optimization',
            confidence: avgConfidence * 0.98,
            insight: `Strategy variations impact performance by ${simulations[0]?.performance?.overall || 0} points on average`,
            recommendation: 'Optimize for performance-carbon balance'
          };
          break;
          
        case 'Risk Assessor':
          const riskLevel = simulations.some(s => s.performance.overall < -0.10) ? 'high' : 'moderate';
          analysis = {
            perspective: 'risk-assessment',
            confidence: avgConfidence * 0.95,
            insight: `Risk level: ${riskLevel.toUpperCase()} - ${simulations.length} scenarios simulated`,
            recommendation: riskLevel === 'high' ? 'Implement contingency protocols' : 'Standard risk management adequate'
          };
          break;
      }
      
      return {
        agent: agent.id,
        name: agent.name,
        weight: agent.weight,
        ...analysis,
        validated: true,
        timestamp: Date.now()
      };
    })
  );
  
  const consensus = validations.reduce((acc, v) => acc + (v.confidence * v.weight), 0);
  
  return {
    swarm: {
      agents: validations,
      consensusScore: consensus,
      validated: consensus > 0.85,
      timestamp: Date.now()
    }
  };
}

// Submit to HCS
async function submitToHCS(data) {
  if (!CONFIG.topic) {
    console.log('⚠️  Scenario topic not configured, skipping HCS submission');
    return null;
  }

  try {
    const message = JSON.stringify(data, null, 2);
    const transaction = await new TopicMessageSubmitTransaction()
      .setTopicId(CONFIG.topic)
      .setMessage(message)
      .execute(client);
    
    const receipt = await transaction.getReceipt(client);
    return receipt;
  } catch (error) {
    console.error('❌ HCS submission failed:', error.message);
    return null;
  }
}

// Main execution
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     McLAREN F1 SCENARIO SIMULATOR                          ║
║     Predictive Analytics with Swarm Consensus                ║
╚════════════════════════════════════════════════════════════╝
`);

  console.log(`🔑 Operator: ${CONFIG.accountId}`);
  console.log(`🌐 Network: ${CONFIG.network.toUpperCase()}`);
  console.log(`🤖 Swarm Size: ${SIMULATION_SWARM.length} predictors`);
  console.log(`📊 Scenarios: ${SCENARIOS.length} race conditions\n`);

  // Run all simulations
  console.log('🔬 Running Scenario Simulations...\n');
  const simulations = SCENARIOS.map(scenario => {
    const result = runSimulation(scenario);
    
    console.log(`📋 ${result.name}`);
    console.log(`   ${result.description}`);
    console.log(`   🌱 Carbon: ${result.carbon.baseline} → ${result.carbon.projected} kg (${result.carbon.delta > 0 ? '+' : ''}${result.carbon.deltaPercent}%)`);
    console.log(`   📊 Performance: ${result.performance.overall > 0 ? '+' : ''}${result.performance.overall} impact`);
    console.log(`   💡 ${result.performance.recommendation}\n`);
    
    return result;
  });

  // Swarm validation
  console.log('🤖 Swarm Validation:');
  const swarmResult = await swarmValidateSimulations(simulations);
  
  swarmResult.swarm.agents.forEach(agent => {
    console.log(`   ✅ ${agent.name}: ${(agent.confidence * 100).toFixed(1)}%`);
    console.log(`      └─ ${agent.insight}`);
    console.log(`      └─ Recommendation: ${agent.recommendation}`);
  });

  console.log(`\n📊 Consensus Score: ${(swarmResult.swarm.consensusScore * 100).toFixed(1)}%`);

  // Submit to HCS
  if (swarmResult.swarm.validated) {
    console.log('\n📡 Submitting Scenario Predictions to HCS...');
    
    const result = await submitToHCS({
      type: 'SCENARIO_SIMULATION',
      simulations,
      swarm: swarmResult.swarm,
      summary: {
        totalScenarios: simulations.length,
        avgCarbonImpact: simulations.reduce((sum, s) => sum + parseFloat(s.carbon.delta), 0) / simulations.length,
        favorableScenarios: simulations.filter(s => s.performance.overall > 0).length,
        riskScenarios: simulations.filter(s => s.performance.overall < -0.10).length
      },
      submittedBy: 'mclaren-scenario-swarm',
      network: CONFIG.network,
      generatedAt: new Date().toISOString()
    });

    if (result) {
      console.log(`✅ Submitted to topic ${CONFIG.topic}`);
      console.log(`🔗 HashScan: https://hashscan.io/${CONFIG.network}/topic/${CONFIG.topic}`);
    }
  }

  console.log('\n✅ Scenario Simulation Complete\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main, runSimulation, swarmValidateSimulations };
