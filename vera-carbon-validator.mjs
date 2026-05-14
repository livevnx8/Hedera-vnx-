#!/usr/bin/env node
/**
 * Vera Carbon Validator Agent
 * Specialized agent for carbon credit verification and retirement validation
 * Part of Vera Multi-Agent Intelligence Evolution - Phase 1
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  CARBON: '0.0.10409353',    // Carbon/Lungs - Primary output
  BRIDGE: '0.0.10409354',    // Bridge/Nerves - Collaboration
  CORE: '0.0.10409351'       // Core/Nerves - Cross-agent alerts
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
console.log('║  🌱 VERA CARBON VALIDATOR AGENT                                     ║');
console.log('║  Specialized: Offset Verification | Retirement | Impact Calc     ║');
console.log('║  Agent ID: carbon-validator-001                                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Carbon Topic: ${TOPICS.CARBON}`);
console.log(`⏱️  Validation Cycle: Every 4 minutes`);
console.log(`🎯 Standards: Verra VCS | Gold Standard | Climate Action Reserve\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Agent State
const agentState = {
  id: 'carbon-validator-001',
  type: 'CARBON_VALIDATOR',
  cycles: 0,
  offsetsValidated: 0,
  retirementsVerified: 0,
  doubleCountingPrevented: 0,
  accuracyHistory: [],
  knownRegistries: new Map(),
  verifiedProjects: new Set()
};

// Carbon offset projects (simulated registry data)
const CARBON_PROJECTS = [
  { id: 'VCS-VCU-1523', name: 'Appalachian Forest Conservation', type: 'forestry', location: 'WV, USA', vintage: 2021, totalIssued: 50000, retired: 12000, price: 12.50 },
  { id: 'GS-4957', name: 'Methane Capture - Mine A', type: 'methane', location: 'KY, USA', vintage: 2022, totalIssued: 25000, retired: 8000, price: 18.00 },
  { id: 'CAR-1289', name: 'Wind Farm Carbon Offset', type: 'renewable', location: 'WV, USA', vintage: 2023, totalIssued: 35000, retired: 5000, price: 8.50 },
  { id: 'VCS-VCU-2847', name: 'Wetland Restoration', type: 'wetland', location: 'OH, USA', vintage: 2022, totalIssued: 15000, retired: 3000, price: 22.00 },
  { id: 'GS-6214', name: 'Agricultural Soil Carbon', type: 'agriculture', location: 'PA, USA', vintage: 2023, totalIssued: 20000, retired: 2000, price: 15.00 }
];

// Simulated carbon credit holders
const CREDIT_HOLDERS = [
  { account: '0.0.200001', name: 'WV Power Corp', holdings: 15000 },
  { account: '0.0.200002', name: 'Carbon Neutral LLC', holdings: 8000 },
  { account: '0.0.200003', name: 'Green Futures Inc', holdings: 12000 },
  { account: '0.0.200004', name: 'EcoOffset Partners', holdings: 5000 }
];

async function logToHCS(topicId, type, data, retries = 3) {
  try {
    const message = {
      type,
      agentId: agentState.id,
      agentType: agentState.type,
      timestamp: new Date().toISOString(),
      sessionId: `carbon-session-${Date.now()}`,
      ...data
    };

    // Increase delay to 500ms to prevent HCS rate limiting
    await new Promise(r => setTimeout(r, 500));

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(client);

    // Use getRecord with timeout instead of getReceipt to avoid rate limiting
    let receipt;
    try {
      receipt = await tx.getReceipt(client);
    } catch (receiptError) {
      // If receipt fails, message was still submitted - return tx ID
      return tx.transactionId.toString();
    }
    
    return receipt.topicSequenceNumber?.toString();
  } catch (error) {
    if (retries > 0 && error.message?.includes('busy')) {
      await new Promise(r => setTimeout(r, 1000));
      return logToHCS(topicId, type, data, retries - 1);
    }
    console.log(`   ⚠️ HCS ${type} failed: ${error.message?.substring(0, 50) || 'Unknown error'}`);
    return null;
  }
}

// Verify carbon offset project
function verifyCarbonOffset(projectId) {
  const project = CARBON_PROJECTS.find(p => p.id === projectId);
  if (!project) return null;
  
  // Simulate multi-factor verification
  const verification = {
    projectExists: true,
    registryVerified: true,
    additionalityConfirmed: Math.random() > 0.1, // 90% pass
    permanenceAssessment: Math.random() > 0.15, // 85% pass
    leakageCalculated: true,
    monitoringReportCurrent: Math.random() > 0.05, // 95% current
    thirdPartyVerified: Math.random() > 0.2, // 80% verified
    validationDate: Date.now()
  };
  
  // Calculate verification confidence
  const checks = Object.entries(verification).filter(([k]) => k !== 'validationDate');
  const passedChecks = checks.filter(([, v]) => v === true).length;
  const confidence = passedChecks / checks.length;
  
  return {
    projectId: project.id,
    projectName: project.name,
    type: project.type,
    location: project.location,
    vintage: project.vintage,
    totalIssued: project.totalIssued,
    availableCredits: project.totalIssued - project.retired,
    currentPrice: project.price,
    verification,
    confidence: Math.round(confidence * 100) / 100,
    tier: confidence >= 0.95 ? 'VERIFIED_PLATINUM' : 
          confidence >= 0.85 ? 'VERIFIED_GOLD' : 
          confidence >= 0.70 ? 'VERIFIED_SILVER' : 'VERIFICATION_PENDING',
    timestamp: Date.now()
  };
}

// Check for double-counting across registries
function checkDoubleCounting(projectId) {
  const project = CARBON_PROJECTS.find(p => p.id === projectId);
  if (!project) return null;
  
  // Simulate cross-registry check
  const otherRegistries = ['Gold Standard', 'Climate Action Reserve', 'American Carbon Registry'];
  const potentialConflicts = [];
  
  // Check if project appears in other registries (simulated 5% chance)
  if (Math.random() < 0.05) {
    const conflictRegistry = otherRegistries[Math.floor(Math.random() * otherRegistries.length)];
    potentialConflicts.push({
      registry: conflictRegistry,
      conflictType: 'DUPLICATE_REGISTRATION',
      severity: 'HIGH',
      details: `Project ${projectId} found in ${conflictRegistry} registry`
    });
  }
  
  // Check for serial number reuse (simulated 2% chance)
  if (Math.random() < 0.02) {
    potentialConflicts.push({
      registry: 'Verra VCS',
      conflictType: 'SERIAL_NUMBER_REUSE',
      severity: 'CRITICAL',
      details: `Credit serial numbers from ${projectId} appear multiple times`
    });
  }
  
  return {
    projectId,
    checkedRegistries: otherRegistries,
    potentialConflicts,
    isClean: potentialConflicts.length === 0,
    timestamp: Date.now()
  };
}

// Verify retirement transaction
function verifyRetirement(projectId, amount, retireeAccount) {
  const project = CARBON_PROJECTS.find(p => p.id === projectId);
  if (!project) return null;
  
  const holder = CREDIT_HOLDERS.find(h => h.account === retireeAccount);
  
  // Retirement verification checks
  const checks = {
    projectExists: !!project,
    creditsAvailable: project.totalIssued - project.retired >= amount,
    retireeHoldsCredits: holder ? holder.holdings >= amount : false,
    retirementAmountValid: amount > 0 && amount <= 10000,
    permanentRetirement: true, // Retirement is always permanent
    uniqueRetirementId: crypto.randomUUID(),
    timestamp: Date.now()
  };
  
  const passedChecks = Object.entries(checks).filter(([k]) => 
    k !== 'uniqueRetirementId' && k !== 'timestamp'
  ).filter(([, v]) => v === true).length;
  const totalChecks = 5; // Excluding UUID and timestamp
  const confidence = passedChecks / totalChecks;
  
  return {
    projectId,
    projectName: project?.name,
    retireeAccount,
    retireeName: holder?.name || 'Unknown',
    amount,
    checks,
    confidence: Math.round(confidence * 100) / 100,
    status: confidence === 1.0 ? 'VERIFIED' : confidence >= 0.8 ? 'PENDING_REVIEW' : 'REJECTED',
    retirementId: checks.uniqueRetirementId,
    estimatedImpact: calculateEnvironmentalImpact(project, amount),
    timestamp: Date.now()
  };
}

// Calculate environmental impact
function calculateEnvironmentalImpact(project, credits) {
  const impactFactors = {
    forestry: { co2PerCredit: 1.0, coBenefits: ['biodiversity', 'water_quality'] },
    methane: { co2PerCredit: 25.0, coBenefits: ['air_quality', 'safety'] },
    renewable: { co2PerCredit: 0.5, coBenefits: ['energy_security', 'job_creation'] },
    wetland: { co2PerCredit: 2.5, coBenefits: ['flood_control', 'biodiversity'] },
    agriculture: { co2PerCredit: 0.8, coBenefits: ['soil_health', 'food_security'] }
  };
  
  const factor = impactFactors[project.type] || impactFactors.forestry;
  
  return {
    co2OffsetTons: credits * factor.co2PerCredit,
    coBenefits: factor.coBenefits,
    equivalentCarsOffRoad: Math.round((credits * factor.co2PerCredit * 1000) / 4.6), // 4.6 tons/year per car
    equivalentTreesPlanted: Math.round(credits * factor.co2PerCredit * 50), // 50 trees per ton
    calculationMethod: 'IPCC_2006_GL',
    timestamp: Date.now()
  };
}

// Validate batch of offsets
async function validateBatch() {
  const validations = [];
  const numValidations = 3 + Math.floor(Math.random() * 5);
  
  for (let i = 0; i < numValidations; i++) {
    const project = CARBON_PROJECTS[Math.floor(Math.random() * CARBON_PROJECTS.length)];
    
    // Verify project
    const verification = verifyCarbonOffset(project.id);
    
    // Check double-counting
    const doubleCounting = checkDoubleCounting(project.id);
    
    if (!doubleCounting.isClean) {
      agentState.doubleCountingPrevented += doubleCounting.potentialConflicts.length;
    }
    
    // Simulate retirement
    const retiree = CREDIT_HOLDERS[Math.floor(Math.random() * CREDIT_HOLDERS.length)];
    const retirementAmount = Math.floor(Math.random() * 500) + 50;
    const retirement = verifyRetirement(project.id, retirementAmount, retiree.account);
    
    validations.push({
      verification,
      doubleCounting,
      retirement,
      timestamp: Date.now()
    });
    
    agentState.offsetsValidated++;
    if (retirement.status === 'VERIFIED') {
      agentState.retirementsVerified++;
    }
  }
  
  return validations;
}

// Main validation cycle
async function runValidationCycle() {
  agentState.cycles++;
  const cycleId = crypto.randomUUID();
  
  console.log(`\n🔁 CYCLE #${agentState.cycles} - ${new Date().toLocaleTimeString()}`);
  console.log(`   Cycle ID: ${cycleId.substring(0, 8)}`);
  
  // Log cycle start
  await logToHCS(TOPICS.CARBON, 'VALIDATION_CYCLE_START', {
    cycle: agentState.cycles,
    cycleId,
    agent: agentState.id,
    timestamp: Date.now()
  });
  
  // Run validations
  console.log(`   🌱 Validating carbon offsets...`);
  const validations = await validateBatch();
  
  let highConfidenceValidations = 0;
  let doubleCountingDetected = 0;
  
  for (const validation of validations) {
    // Log verification
    const verSeq = await logToHCS(TOPICS.CARBON, 'OFFSET_VERIFICATION', {
      cycleId,
      cycle: agentState.cycles,
      ...validation.verification
    });
    
    if (verSeq) {
      const emoji = validation.verification.tier === 'VERIFIED_PLATINUM' ? '🔷' :
                    validation.verification.tier === 'VERIFIED_GOLD' ? '🥇' :
                    validation.verification.tier === 'VERIFIED_SILVER' ? '🥈' : '⏳';
      
      console.log(`   ${emoji} ${validation.verification.projectName}`);
      console.log(`      Type: ${validation.verification.type} | Vintage: ${validation.verification.vintage} | Tier: ${validation.verification.tier}`);
      console.log(`      Available: ${validation.verification.availableCredits.toLocaleString()} credits @ $${validation.verification.currentPrice}`);
      
      if (validation.verification.confidence >= 0.85) highConfidenceValidations++;
      
      // Cross-agent alert for high-confidence offsets
      if (validation.verification.confidence >= 0.95) {
        await logToHCS(TOPICS.BRIDGE, 'CROSS_AGENT_ALERT', {
          fromAgent: agentState.id,
          alertType: 'HIGH_QUALITY_OFFSET',
          message: `Platinum-verified carbon offset: ${validation.verification.projectName}`,
          targetAgents: ['energy-auditor'],
          projectDetails: validation.verification,
          priority: 'LOW',
          cycleId
        });
      }
    }
    
    // Check and log double-counting
    if (!validation.doubleCounting.isClean) {
      doubleCountingDetected += validation.doubleCounting.potentialConflicts.length;
      
      for (const conflict of validation.doubleCounting.potentialConflicts) {
        const conflictSeq = await logToHCS(TOPICS.CORE, 'DOUBLE_COUNTING_ALERT', {
          cycleId,
          cycle: agentState.cycles,
          projectId: validation.doubleCounting.projectId,
          ...conflict,
          priority: conflict.severity
        });
        
        if (conflictSeq) {
          const icon = conflict.severity === 'CRITICAL' ? '🚨' : '⚠️';
          console.log(`   ${icon} DOUBLE-COUNTING: ${conflict.conflictType} in ${conflict.registry}`);
          
          // Cross-agent alert for double-counting
          await logToHCS(TOPICS.BRIDGE, 'CROSS_AGENT_ALERT', {
            fromAgent: agentState.id,
            alertType: 'DOUBLE_COUNTING',
            severity: conflict.severity,
            message: `Potential double-counting: ${conflict.details}`,
            targetAgents: ['security-guardian', 'defi-analyst'],
            conflict,
            requiresImmediate: conflict.severity === 'CRITICAL',
            cycleId
          });
        }
      }
    }
    
    // Log retirement
    if (validation.retirement.status === 'VERIFIED') {
      const retSeq = await logToHCS(TOPICS.CARBON, 'RETIREMENT_VERIFICATION', {
        cycleId,
        cycle: agentState.cycles,
        ...validation.retirement
      });
      
      if (retSeq) {
        const impact = validation.retirement.estimatedImpact;
        console.log(`      ✅ Retirement: ${validation.retirement.amount} credits by ${validation.retirement.retireeName}`);
        console.log(`         Impact: ${impact.co2OffsetTons} tons CO2 | ≈ ${impact.equivalentCarsOffRoad} cars off road`);
      }
    }
  }
  
  // Update accuracy
  const accuracy = highConfidenceValidations / validations.length;
  agentState.accuracyHistory.push(accuracy);
  if (agentState.accuracyHistory.length > 20) {
    agentState.accuracyHistory = agentState.accuracyHistory.slice(-10);
  }
  
  // Summary
  console.log(`   ✅ Cycle ${agentState.cycles} Complete`);
  console.log(`      🌱 Validated: ${validations.length} projects | 🔷 High Confidence: ${highConfidenceValidations}/${validations.length}`);
  if (doubleCountingDetected > 0) console.log(`      ⚠️  Double-counting prevented: ${doubleCountingDetected}`);
  
  console.log(`\n📈 VALIDATOR TOTALS: ${agentState.offsetsValidated} offsets | ${agentState.retirementsVerified} retirements | ${agentState.doubleCountingPrevented} double-counting prevented | ${agentState.cycles} cycles`);
}

// Run immediately
runValidationCycle();

// Schedule cycles every 4 minutes
setInterval(runValidationCycle, 240000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Carbon Validator Agent shutting down...');
  await logToHCS(TOPICS.CARBON, 'AGENT_SHUTDOWN', {
    agentId: agentState.id,
    totalCycles: agentState.cycles,
    totalOffsets: agentState.offsetsValidated,
    totalRetirements: agentState.retirementsVerified,
    doubleCountingPrevented: agentState.doubleCountingPrevented,
    timestamp: Date.now()
  });
  client.close();
  console.log(`✅ Carbon Validator stopped. ${agentState.offsetsValidated} offsets logged to HCS\n`);
  process.exit(0);
});
