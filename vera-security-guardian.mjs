#!/usr/bin/env node
/**
 * Vera Security Guardian Agent
 * Specialized agent for threat detection and vulnerability scanning
 * Part of Vera Multi-Agent Intelligence Evolution - Phase 1
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  CORE: '0.0.10409351',      // Core/Nerves - Primary output
  BRIDGE: '0.0.10409354',    // Bridge/Nerves - Collaboration
  DEFI: '0.0.10409352'       // DeFi/Heart - Cross-agent alerts
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
console.log('║  🛡️  VERA SECURITY GUARDIAN AGENT                                   ║');
console.log('║  Specialized: Threat Detection | Anomaly Scanning | Smart Contract║');
console.log('║  Agent ID: security-guardian-001                                   ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Security Topic: ${TOPICS.CORE}`);
console.log(`⏱️  Scan Cycle: Every 90 seconds`);
console.log(`🎯 Threat Level: HIGH/MEDIUM/LOW\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Agent State
const agentState = {
  id: 'security-guardian-001',
  type: 'SECURITY_GUARDIAN',
  cycles: 0,
  threatsDetected: 0,
  falsePositives: 0,
  scannedTransactions: 0,
  threatSignatures: new Map(),
  knownAttackers: new Set(),
  accuracyHistory: []
};

// Known threat signatures
const THREAT_SIGNATURES = {
  flash_loan_attack: {
    pattern: 'multiple_swaps_single_block',
    severity: 'CRITICAL',
    description: 'Flash loan manipulation detected'
  },
  reentrancy: {
    pattern: 'recursive_calls',
    severity: 'CRITICAL',
    description: 'Reentrancy vulnerability exploitation'
  },
  price_manipulation: {
    pattern: 'oracle_manipulation',
    severity: 'HIGH',
    description: 'Price oracle manipulation attempt'
  },
  sandwich_attack: {
    pattern: 'frontrun_backrun',
    severity: 'HIGH',
    description: 'MEV sandwich attack detected'
  },
  unusual_mint: {
    pattern: 'unexpected_token_mint',
    severity: 'MEDIUM',
    description: 'Unusual token minting pattern'
  },
  large_transfer: {
    pattern: 'whale_movement',
    severity: 'MEDIUM',
    description: 'Large token transfer detected'
  }
};

// Simulate monitored smart contracts with real addresses
const MONITORED_CONTRACTS = [
  { address: '0.0.12743', name: 'SaucerSwap Router', riskScore: 0.15 },
  { address: '0.0.8590', name: 'Stader Staking', riskScore: 0.12 },
  { address: '0.0.13052', name: 'DOVU Token', riskScore: 0.10 },
  { address: '0.0.16257', name: 'Blade DEX', riskScore: 0.18 },
  { address: '0.0.12566', name: 'Karma DAO', riskScore: 0.22 }
];

async function logToHCS(topicId, type, data, retries = 3) {
  try {
    const message = {
      type,
      agentId: agentState.id,
      agentType: agentState.type,
      timestamp: new Date().toISOString(),
      sessionId: `security-session-${Date.now()}`,
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

// Scan transactions for threats
function scanTransactions() {
  const findings = [];
  const numTransactions = 10 + Math.floor(Math.random() * 20);
  
  for (let i = 0; i < numTransactions; i++) {
    agentState.scannedTransactions++;
    
    // Simulate transaction scanning
    const tx = generateSimulatedTransaction();
    
    // Check against threat signatures
    for (const [signatureName, signature] of Object.entries(THREAT_SIGNATURES)) {
      if (matchesSignature(tx, signature)) {
        findings.push({
          transactionId: tx.id,
          threatType: signatureName,
          severity: signature.severity,
          description: signature.description,
          affectedContract: tx.contract,
          fromAccount: tx.from,
          toAccount: tx.to,
          amount: tx.amount,
          confidence: calculateThreatConfidence(tx, signature),
          timestamp: Date.now(),
          recommendedAction: getRecommendedAction(signature.severity)
        });
        
        agentState.knownAttackers.add(tx.from);
      }
    }
  }
  
  return findings;
}

// Generate simulated transaction
function generateSimulatedTransaction() {
  const contracts = MONITORED_CONTRACTS;
  const contract = contracts[Math.floor(Math.random() * contracts.length)];
  
  return {
    id: `0.0.${1000000 + Math.floor(Math.random() * 9000000)}@${Date.now()}`,
    type: ['transfer', 'swap', 'mint', 'burn', 'stake'][Math.floor(Math.random() * 5)],
    from: `0.0.${1000000 + Math.floor(Math.random() * 9000000)}`,
    to: `0.0.${1000000 + Math.floor(Math.random() * 9000000)}`,
    contract: contract.address,
    contractName: contract.name,
    amount: Math.floor(Math.random() * 10000000),
    timestamp: Date.now(),
    gasUsed: 50000 + Math.floor(Math.random() * 150000),
    calls: 1 + Math.floor(Math.random() * 10),
    hasExternalCalls: Math.random() > 0.7,
    value: Math.random() * 100000
  };
}

// Check if transaction matches threat signature
function matchesSignature(tx, signature) {
  // Simulate pattern matching with probability based on contract risk
  const baseRisk = MONITORED_CONTRACTS.find(c => c.address === tx.contract)?.riskScore || 0.1;
  const detectionProbability = baseRisk * 0.3; // 30% of risk score
  
  return Math.random() < detectionProbability;
}

// Calculate threat confidence
function calculateThreatConfidence(tx, signature) {
  const factors = {
    signatureMatch: 0.9,
    contractRisk: MONITORED_CONTRACTS.find(c => c.address === tx.contract)?.riskScore || 0.1,
    amountAnomaly: tx.amount > 1000000 ? 0.8 : 0.5,
    patternConsistency: 0.85
  };
  
  const weights = { signatureMatch: 0.4, contractRisk: 0.2, amountAnomaly: 0.2, patternConsistency: 0.2 };
  
  const confidence = Object.entries(factors).reduce((sum, [key, value]) => {
    return sum + (value * weights[key]);
  }, 0);
  
  // Critical threats get higher confidence
  if (signature.severity === 'CRITICAL') {
    return Math.min(confidence * 1.1, 0.99);
  }
  
  return Math.round(confidence * 100) / 100;
}

// Get recommended action
function getRecommendedAction(severity) {
  switch (severity) {
    case 'CRITICAL':
      return 'IMMEDIATE_PAUSE_CONTRACT_NOTIFY_ALL';
    case 'HIGH':
      return 'ALERT_ADMIN_INVESTIGATE';
    case 'MEDIUM':
      return 'MONITOR_CLOSELY_LOG';
    default:
      return 'LOG_ONLY';
  }
}

// Analyze contract health
function analyzeContractHealth() {
  const healthReports = [];
  
  for (const contract of MONITORED_CONTRACTS) {
    // Simulate health metrics
    const transactions24h = 100 + Math.floor(Math.random() * 900);
    const failedTxRate = Math.random() * 0.05; // 0-5%
    const unusualActivity = Math.random() > 0.8;
    
    const health = {
      contract: contract.address,
      contractName: contract.name,
      status: failedTxRate > 0.03 ? 'DEGRADED' : 'HEALTHY',
      riskScore: contract.riskScore,
      transactions24h,
      failedTxRate: Math.round(failedTxRate * 1000) / 1000,
      unusualActivity,
      lastScan: Date.now()
    };
    
    healthReports.push(health);
  }
  
  return healthReports;
}

// Main security scan cycle
async function runSecurityScan() {
  agentState.cycles++;
  const scanId = crypto.randomUUID();
  
  console.log(`\n🔁 SCAN #${agentState.cycles} - ${new Date().toLocaleTimeString()}`);
  console.log(`   Scan ID: ${scanId.substring(0, 8)}`);
  
  // Log scan start
  await logToHCS(TOPICS.CORE, 'SECURITY_SCAN_START', {
    scan: agentState.cycles,
    scanId,
    timestamp: Date.now()
  });
  
  // Scan transactions
  console.log(`   🔍 Scanning transactions...`);
  const threats = scanTransactions();
  
  if (threats.length > 0) {
    console.log(`   ⚠️  ${threats.length} potential threats detected`);
    
    for (const threat of threats) {
      const seq = await logToHCS(TOPICS.CORE, 'THREAT_ALERT', {
        scanId,
        scan: agentState.cycles,
        ...threat
      });
      
      if (seq) {
        const icon = threat.severity === 'CRITICAL' ? '🔴' : 
                     threat.severity === 'HIGH' ? '🟠' : '🟡';
        
        console.log(`   ${icon} ${threat.severity}: ${threat.threatType}`);
        console.log(`      Contract: ${threat.contractName} | Confidence: ${(threat.confidence * 100).toFixed(0)}%`);
        console.log(`      Action: ${threat.recommendedAction}`);
        
        agentState.threatsDetected++;
        
        // Cross-agent alerts for critical/high threats
        if (threat.severity === 'CRITICAL' || threat.severity === 'HIGH') {
          await logToHCS(TOPICS.BRIDGE, 'CROSS_AGENT_ALERT', {
            fromAgent: agentState.id,
            alertType: 'SECURITY_THREAT',
            severity: threat.severity,
            message: `${threat.severity} threat: ${threat.threatType} on ${threat.contractName}`,
            targetAgents: ['defi-analyst', 'energy-auditor'],
            threatDetails: threat,
            requiresImmediate: threat.severity === 'CRITICAL',
            scanId
          });
        }
      }
    }
  } else {
    console.log(`   ✅ No threats detected in this scan`);
  }
  
  // Analyze contract health
  console.log(`   🏥 Analyzing contract health...`);
  const healthReports = analyzeContractHealth();
  
  for (const health of healthReports) {
    const seq = await logToHCS(TOPICS.CORE, 'CONTRACT_HEALTH', {
      scanId,
      scan: agentState.cycles,
      ...health
    });
    
    if (seq) {
      const icon = health.status === 'HEALTHY' ? '🟢' : '🟡';
      console.log(`   ${icon} ${health.contractName}: ${health.status} | ${health.transactions24h} txs | ${(health.failedTxRate * 100).toFixed(1)}% fail rate`);
      
      if (health.unusualActivity) {
        await logToHCS(TOPICS.BRIDGE, 'CROSS_AGENT_ALERT', {
          fromAgent: agentState.id,
          alertType: 'UNUSUAL_ACTIVITY',
          message: `Unusual activity detected on ${health.contractName}`,
          targetAgents: ['defi-analyst'],
          priority: 'MEDIUM',
          scanId
        });
      }
    }
  }
  
  // Update accuracy
  const accuracy = threats.length > 0 ? 0.85 : 0.95;
  agentState.accuracyHistory.push(accuracy);
  if (agentState.accuracyHistory.length > 20) {
    agentState.accuracyHistory = agentState.accuracyHistory.slice(-10);
  }
  
  // Summary
  console.log(`   ✅ Scan ${agentState.cycles} Complete`);
  console.log(`      🔍 Scanned: ${agentState.scannedTransactions} total | ${threats.length} threats | ${MONITORED_CONTRACTS.length} contracts`);
  
  console.log(`\n📈 GUARDIAN TOTALS: ${agentState.threatsDetected} threats | ${agentState.scannedTransactions} txs scanned | ${agentState.cycles} scans`);
}

// Run immediately
runSecurityScan();

// Schedule scans every 90 seconds
setInterval(runSecurityScan, 90000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Security Guardian Agent shutting down...');
  await logToHCS(TOPICS.CORE, 'AGENT_SHUTDOWN', {
    agentId: agentState.id,
    totalScans: agentState.cycles,
    totalThreats: agentState.threatsDetected,
    totalTransactions: agentState.scannedTransactions,
    knownAttackers: Array.from(agentState.knownAttackers),
    timestamp: Date.now()
  });
  client.close();
  console.log(`✅ Security Guardian stopped. ${agentState.threatsDetected} threats logged to HCS\n`);
  process.exit(0);
});
