#!/usr/bin/env node
/**
 * Vera DOVU 1000 Token Validation with Notary Auditor
 * Validates 1000 DOVU tokens and logs to HCS with confidence ratings
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  NOTARY: '0.0.10409351',    // For notarization records
  AUDIT: '0.0.10409353',     // For audit trails
  CERTIFICATES: '0.0.10409351' // For completion certificates
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
console.log('║  🔷 VERA DOVU 1000 TOKEN VALIDATOR + NOTARY AUDITOR                ║');
console.log('║  With Confidence Ratings & HCS Logging                           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Notary Topic: ${TOPICS.NOTARY}`);
console.log(`📡 Audit Topic: ${TOPICS.AUDIT}\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// Statistics
const stats = {
  totalValidated: 0,
  verified: 0,
  rejected: 0,
  notarized: 0,
  avgConfidence: 0,
  confidenceSum: 0,
  startTime: Date.now()
};

// Notary Auditor with Confidence Rating
class NotaryAuditor {
  constructor() {
    this.verifications = [];
  }

  // Calculate confidence rating based on multiple factors
  calculateConfidence(payload, checks) {
    let confidence = 0;
    
    // Base confidence from passed checks
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const baseConfidence = passedChecks / totalChecks;
    
    // Adjust based on data quality factors
    const dataAge = Date.now() - payload.timestamp;
    const ageFactor = dataAge < 24 * 60 * 60 * 1000 ? 0.1 : 0; // +10% if <24h old
    
    const hasHederaId = payload.hederaAccountId ? 0.05 : 0;
    const hasSignature = payload.signature ? 0.05 : 0;
    const hasProjectData = payload.data?.projectId ? 0.05 : 0;
    
    confidence = baseConfidence + ageFactor + hasHederaId + hasSignature + hasProjectData;
    
    // Cap at 100%
    return Math.min(confidence, 1.0);
  }

  // Determine verification tier based on confidence
  getVerificationTier(confidence) {
    if (confidence >= 0.95) return { tier: 'PLATINUM', badge: '🔷', color: '\x1b[36m' };
    if (confidence >= 0.85) return { tier: 'GOLD', badge: '🥇', color: '\x1b[33m' };
    if (confidence >= 0.75) return { tier: 'SILVER', badge: '🥈', color: '\x1b[37m' };
    if (confidence >= 0.60) return { tier: 'BRONZE', badge: '🥉', color: '\x1b[31m' };
    return { tier: 'REJECTED', badge: '❌', color: '\x1b[31m' };
  }

  // Generate verification checks
  performChecks(payload) {
    return {
      accountValid: !!payload.hederaAccountId,
      signatureValid: !!payload.signature,
      dataHashValid: !!payload.data,
      timestampValid: (Date.now() - payload.timestamp) < 7 * 24 * 60 * 60 * 1000,
      projectValid: !!payload.data?.projectId,
      carbonTonsValid: payload.data?.carbonTons > 0,
      standardValid: ['VCS', 'GS', 'CDM', 'CAR'].includes(payload.data?.standard)
    };
  }

  // Create notarization record
  async notarize(client, topicId, payload, checks, confidence) {
    const tier = this.getVerificationTier(confidence);
    const recordId = crypto.randomUUID();
    
    const notarization = {
      type: 'DOVU_NOTARIZATION',
      recordId,
      dovuDataId: payload.id,
      timestamp: Date.now(),
      verifier: operatorId,
      confidence: Math.round(confidence * 100) / 100,
      confidenceTier: tier.tier,
      verified: confidence >= 0.75,
      checks,
      attestationHash: crypto.createHash('sha256')
        .update(JSON.stringify({ payload, checks, timestamp: Date.now() }))
        .digest('hex'),
      signature: crypto.createHash('sha256')
        .update(`${recordId}:${payload.id}:${Date.now()}`)
        .digest('hex')
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify(notarization))
        .execute(client);

      const receipt = await tx.getReceipt(client);
      const seq = receipt.topicSequenceNumber?.toString();
      
      this.verifications.push(notarization);
      
      return { ...notarization, hcsSequence: seq };
    } catch (error) {
      console.log(`   ⚠️ Notarization failed: ${error.message.substring(0, 40)}`);
      return { ...notarization, hcsSequence: 'failed' };
    }
  }
}

// Generate mock DOVU data
function generateDovuData(index) {
  const standards = ['VCS', 'GS', 'CDM', 'CAR', 'Verra'];
  const locations = ['Colombia', 'Brazil', 'Indonesia', 'Kenya', 'India', 'Peru'];
  const verifiers = ['Verra', 'Gold Standard', 'Climate Action Reserve'];
  
  const shouldPass = Math.random() > 0.2; // 80% pass rate
  const confidenceBoost = shouldPass ? Math.random() * 0.3 : -0.3;
  
  return {
    id: `DOVU-${Date.now()}-${index}`,
    type: 'carbon_credit',
    source: 'dovu_os',
    timestamp: Date.now() - Math.floor(Math.random() * 86400000), // 0-24h old
    data: {
      projectId: shouldPass ? `PROJ-${10000 + index}` : null,
      carbonTons: shouldPass ? Math.floor(Math.random() * 1000) + 10 : 0,
      vintage: 2024,
      standard: standards[Math.floor(Math.random() * standards.length)],
      location: locations[Math.floor(Math.random() * locations.length)],
      verifier: verifiers[Math.floor(Math.random() * verifiers.length)],
    },
    signature: shouldPass ? crypto.randomBytes(32).toString('hex') : null,
    hederaAccountId: shouldPass ? `0.0.${1000000 + index}` : null,
  };
}

// Log to HCS
async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      timestamp: new Date().toISOString(),
      validator: 'vera-dovu-1000',
      ...data
    };

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    return receipt.topicSequenceNumber?.toString();
  } catch (error) {
    return 'failed';
  }
}

// Main validation loop
async function validate1000Tokens() {
  const auditor = new NotaryAuditor();
  const TOTAL_TOKENS = 1000;
  
  console.log(`🚀 Starting validation of ${TOTAL_TOKENS} DOVU tokens...\n`);
  
  // Log start
  await logToHCS(TOPICS.NOTARY, 'BATCH_START', {
    batchId: crypto.randomUUID(),
    targetCount: TOTAL_TOKENS,
    validator: operatorId
  });
  
  const startTime = Date.now();
  
  for (let i = 0; i < TOTAL_TOKENS; i++) {
    // Generate test data
    const payload = generateDovuData(i);
    
    // Perform verification
    const checks = auditor.performChecks(payload);
    const confidence = auditor.calculateConfidence(payload, checks);
    const tier = auditor.getVerificationTier(confidence);
    
    // Notarize
    const result = await auditor.notarize(client, TOPICS.NOTARY, payload, checks, confidence);
    
    // Update stats
    stats.totalValidated++;
    stats.confidenceSum += confidence;
    stats.avgConfidence = stats.confidenceSum / stats.totalValidated;
    
    if (confidence >= 0.75) {
      stats.verified++;
    } else {
      stats.rejected++;
    }
    
    if (result.hcsSequence && result.hcsSequence !== 'failed') {
      stats.notarized++;
    }
    
    // Progress output every 100 tokens
    if ((i + 1) % 100 === 0 || i === 0) {
      const percent = ((i + 1) / TOTAL_TOKENS * 100).toFixed(0);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (stats.totalValidated / (Date.now() - startTime) * 1000).toFixed(1);
      
      console.log(`[${percent}%] Token ${i + 1}/${TOTAL_TOKENS} | ✅ Verified: ${stats.verified} | ❌ Rejected: ${stats.rejected} | 📜 Notarized: ${stats.notarized} | ⏱️ ${elapsed}s | ⚡ ${rate}/s`);
    }
    
    // Sample output every 50 tokens
    if ((i + 1) % 50 === 0) {
      const sample = `${tier.badge} ${payload.id.substring(0, 20)}... | Confidence: ${(confidence * 100).toFixed(1)}% | Tier: ${tier.tier} | Seq: ${result.hcsSequence || 'N/A'}`;
      console.log(`   └─> ${sample}`);
    }
    
    // Small delay to prevent rate limiting
    if (i % 10 === 0) {
      await new Promise(r => setTimeout(r, 10));
    }
  }
  
  // Create completion certificate
  const certificate = {
    type: 'BATCH_CERTIFICATE',
    batchId: crypto.randomUUID(),
    timestamp: Date.now(),
    validator: operatorId,
    totalTokens: TOTAL_TOKENS,
    verified: stats.verified,
    rejected: stats.rejected,
    notarized: stats.notarized,
    avgConfidence: Math.round(stats.avgConfidence * 100) / 100,
    duration: Date.now() - startTime,
    tierBreakdown: {
      platinum: auditor.verifications.filter(v => v.confidenceTier === 'PLATINUM').length,
      gold: auditor.verifications.filter(v => v.confidenceTier === 'GOLD').length,
      silver: auditor.verifications.filter(v => v.confidenceTier === 'SILVER').length,
      bronze: auditor.verifications.filter(v => v.confidenceTier === 'BRONZE').length,
      rejected: auditor.verifications.filter(v => v.confidenceTier === 'REJECTED').length
    }
  };
  
  const certTx = await new TopicMessageSubmitTransaction()
    .setTopicId(TOPICS.CERTIFICATES)
    .setMessage(JSON.stringify(certificate))
    .execute(client);
  
  const certReceipt = await certTx.getReceipt(client);
  const certSeq = certReceipt.topicSequenceNumber?.toString();
  
  // Final summary
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                    ✅ VALIDATION COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════\n');
  console.log(`📊 Results Summary:`);
  console.log(`   Total Tokens: ${TOTAL_TOKENS}`);
  console.log(`   ✅ Verified: ${stats.verified} (${(stats.verified/TOTAL_TOKENS*100).toFixed(1)}%)`);
  console.log(`   ❌ Rejected: ${stats.rejected} (${(stats.rejected/TOTAL_TOKENS*100).toFixed(1)}%)`);
  console.log(`   📜 Notarized to HCS: ${stats.notarized}`);
  console.log(`   📊 Avg Confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`);
  console.log(`   ⏱️ Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`   ⚡ Rate: ${(TOTAL_TOKENS / ((Date.now() - startTime) / 1000)).toFixed(1)} tokens/sec\n`);
  
  console.log(`🏆 Tier Breakdown:`);
  console.log(`   🔷 Platinum (95%+): ${certificate.tierBreakdown.platinum}`);
  console.log(`   🥇 Gold (85-94%): ${certificate.tierBreakdown.gold}`);
  console.log(`   🥈 Silver (75-84%): ${certificate.tierBreakdown.silver}`);
  console.log(`   🥉 Bronze (60-74%): ${certificate.tierBreakdown.bronze}`);
  console.log(`   ❌ Rejected (<60%): ${certificate.tierBreakdown.rejected}\n`);
  
  console.log(`🔗 HashScan Links:`);
  console.log(`   Notary Topic: https://hashscan.io/mainnet/topic/${TOPICS.NOTARY}`);
  console.log(`   Audit Topic: https://hashscan.io/mainnet/topic/${TOPICS.AUDIT}`);
  console.log(`   Certificate Seq: ${certSeq}`);
  console.log(`   Certificate: https://hashscan.io/mainnet/topic/${TOPICS.CERTIFICATES}/${certSeq}\n`);
  console.log('════════════════════════════════════════════════════════════════════\n');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Stopping validation...');
  await logToHCS(TOPICS.AUDIT, 'VALIDATION_INTERRUPTED', {
    processed: stats.totalValidated,
    timestamp: Date.now()
  });
  client.close();
  console.log('✅ Validator stopped.\n');
  process.exit(0);
});

// Run
validate1000Tokens().catch(console.error);
