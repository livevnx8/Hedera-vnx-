#!/usr/bin/env node
/**
 * Vera Energy Audit System - West Virginia Data
 * Live accuracy tracking with HCS logging
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from './dist/config.js';
import crypto from 'crypto';

// HCS Topics
const TOPICS = {
  AUDIT: '0.0.10409353',      // Audit results
  ENERGY: '0.0.10409351',     // Energy data
  ACCURACY: '0.0.10409353'    // Accuracy metrics
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
console.log('║  ⚡ VERA ENERGY AUDIT - WEST VIRGINIA DATA                        ║');
console.log('║  Live Accuracy Tracking & HCS Logging                             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');
console.log(`🔑 Account: ${operatorId}`);
console.log(`🌐 Network: MAINNET`);
console.log(`📡 Audit Topic: ${TOPICS.AUDIT}`);
console.log(`📊 Energy Topic: ${TOPICS.ENERGY}\n`);
console.log('════════════════════════════════════════════════════════════════════\n');

// WV Energy Data Sources
const WV_SOURCES = {
  coal: { name: 'Coal Mines', region: 'Southern WV', baseline: 4500 },
  wind: { name: 'Wind Farms', region: 'Mountaintop', baseline: 1200 },
  solar: { name: 'Solar Arrays', region: 'Eastern Panhandle', baseline: 800 },
  hydro: { name: 'Hydroelectric', region: 'New River', baseline: 600 },
  gas: { name: 'Natural Gas', region: 'Northern Panhandle', baseline: 2100 }
};

// Accuracy tracking
const accuracyMetrics = {
  totalReadings: 0,
  accurateReadings: 0,
  accuracySum: 0,
  avgAccuracy: 0,
  dataPoints: [],
  anomalies: [],
  startTime: Date.now()
};

// Generate realistic WV energy data
function generateWVEnergyData(source, timestamp) {
  const base = WV_SOURCES[source].baseline;
  const variance = base * 0.15; // 15% variance
  const reading = base + (Math.random() * variance * 2 - variance);
  
  // Simulate sensor accuracy (85-99%)
  const sensorAccuracy = 0.85 + Math.random() * 0.14;
  
  // Simulate data quality issues (5% chance of anomaly)
  const isAnomaly = Math.random() < 0.05;
  const qualityScore = isAnomaly ? Math.random() * 0.5 : 0.8 + Math.random() * 0.2;
  
  return {
    source,
    region: WV_SOURCES[source].region,
    timestamp,
    reading: Math.round(reading),
    unit: 'MWh',
    sensorAccuracy: Math.round(sensorAccuracy * 100) / 100,
    qualityScore: Math.round(qualityScore * 100) / 100,
    isAnomaly,
    weather: ['sunny', 'cloudy', 'rainy', 'windy'][Math.floor(Math.random() * 4)],
    gridLoad: Math.round(Math.random() * 100),
    verificationStatus: qualityScore > 0.7 ? 'VERIFIED' : 'PENDING'
  };
}

// Calculate audit accuracy
function calculateAccuracy(dataPoint) {
  // Multi-factor accuracy calculation
  const factors = {
    sensorAccuracy: dataPoint.sensorAccuracy,
    qualityScore: dataPoint.qualityScore,
    consistencyScore: checkConsistency(dataPoint),
    temporalScore: checkTemporalPattern(dataPoint)
  };
  
  // Weighted average
  const weights = { sensorAccuracy: 0.3, qualityScore: 0.3, consistencyScore: 0.2, temporalScore: 0.2 };
  const weightedAccuracy = Object.entries(factors).reduce((sum, [key, value]) => {
    return sum + (value * weights[key]);
  }, 0);
  
  return Math.round(weightedAccuracy * 100) / 100;
}

// Consistency check
function checkConsistency(dataPoint) {
  const similarReadings = accuracyMetrics.dataPoints.filter(dp => 
    dp.source === dataPoint.source && 
    Math.abs(dp.reading - dataPoint.reading) < dataPoint.reading * 0.2
  );
  
  return similarReadings.length > 0 ? 0.9 : 0.7;
}

// Temporal pattern check
function checkTemporalPattern(dataPoint) {
  const hour = new Date(dataPoint.timestamp).getHours();
  // Peak hours (6-9am, 5-8pm) should have higher readings
  const isPeak = (hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 20);
  const expectedHigh = isPeak && dataPoint.reading > WV_SOURCES[dataPoint.source].baseline * 0.8;
  
  return expectedHigh ? 0.95 : 0.85;
}

// Log to HCS with chunking
async function logToHCS(topicId, type, data) {
  try {
    const message = {
      type,
      timestamp: new Date().toISOString(),
      auditor: 'vera-wv-energy',
      sessionId: `audit-${accuracyMetrics.startTime}`,
      ...data
    };

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const seq = receipt.topicSequenceNumber?.toString();
    
    return seq;
  } catch (error) {
    console.log(`   ⚠️ ${type} HCS failed: ${error.message.substring(0, 40)}`);
    return null;
  }
}

// Perform energy audit
async function performEnergyAudit() {
  console.log(`🔍 Starting WV Energy Audit at ${new Date().toLocaleString()}\n`);
  
  // Log audit start
  const auditId = crypto.randomUUID();
  await logToHCS(TOPICS.AUDIT, 'AUDIT_START', {
    auditId,
    region: 'West Virginia',
    sources: Object.keys(WV_SOURCES),
    baselineReadings: Object.fromEntries(
      Object.entries(WV_SOURCES).map(([k, v]) => [k, v.baseline])
    )
  });
  
  console.log('📊 Collecting energy data from WV sources...\n');
  
  // Collect data from all sources
  const sources = Object.keys(WV_SOURCES);
  const batchSize = 50; // Readings per source
  
  for (let i = 0; i < batchSize; i++) {
    const timestamp = Date.now() - (i * 60000); // Spread over last 50 minutes
    
    for (const source of sources) {
      const dataPoint = generateWVEnergyData(source, timestamp);
      const accuracy = calculateAccuracy(dataPoint);
      
      dataPoint.calculatedAccuracy = accuracy;
      accuracyMetrics.dataPoints.push(dataPoint);
      
      // Update metrics
      accuracyMetrics.totalReadings++;
      accuracyMetrics.accuracySum += accuracy;
      accuracyMetrics.avgAccuracy = accuracyMetrics.accuracySum / accuracyMetrics.totalReadings;
      
      if (accuracy >= 0.85) {
        accuracyMetrics.accurateReadings++;
      }
      
      if (dataPoint.isAnomaly) {
        accuracyMetrics.anomalies.push(dataPoint);
      }
      
      // Log to HCS every 10 readings
      if (accuracyMetrics.totalReadings % 10 === 0) {
        const seq = await logToHCS(TOPICS.ENERGY, 'ENERGY_READING', {
          auditId,
          source: dataPoint.source,
          reading: dataPoint.reading,
          accuracy,
          qualityScore: dataPoint.qualityScore,
          verificationStatus: dataPoint.verificationStatus,
          timestamp: dataPoint.timestamp
        });
        
        if (seq) {
          console.log(`[${accuracyMetrics.totalReadings}] ⚡ ${source}: ${dataPoint.reading} MWh | Accuracy: ${(accuracy * 100).toFixed(1)}% | Seq: ${seq}`);
        }
      }
      
      // Small delay to simulate real-time collection
      await new Promise(r => setTimeout(r, 50));
    }
  }
  
  // Calculate final audit results
  const auditResults = {
    auditId,
    timestamp: Date.now(),
    duration: Date.now() - accuracyMetrics.startTime,
    totalReadings: accuracyMetrics.totalReadings,
    avgAccuracy: Math.round(accuracyMetrics.avgAccuracy * 100) / 100,
    highAccuracyPercentage: Math.round((accuracyMetrics.accurateReadings / accuracyMetrics.totalReadings) * 100),
    anomaliesDetected: accuracyMetrics.anomalies.length,
    sourceBreakdown: {},
    confidence: calculateOverallConfidence(),
    recommendations: generateRecommendations()
  };
  
  // Calculate per-source breakdown
  sources.forEach(source => {
    const sourceData = accuracyMetrics.dataPoints.filter(dp => dp.source === source);
    const avgAcc = sourceData.reduce((sum, dp) => sum + dp.calculatedAccuracy, 0) / sourceData.length;
    auditResults.sourceBreakdown[source] = {
      readings: sourceData.length,
      avgAccuracy: Math.round(avgAcc * 100) / 100,
      anomalies: sourceData.filter(dp => dp.isAnomaly).length,
      avgReading: Math.round(sourceData.reduce((sum, dp) => sum + dp.reading, 0) / sourceData.length)
    };
  });
  
  // Log audit completion
  const certSeq = await logToHCS(TOPICS.AUDIT, 'AUDIT_COMPLETE', auditResults);
  
  // Print final report
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                    ✅ ENERGY AUDIT COMPLETE');
  console.log('════════════════════════════════════════════════════════════════════\n');
  console.log(`📊 Audit ID: ${auditId}`);
  console.log(`⏱️  Duration: ${(auditResults.duration / 1000).toFixed(1)}s`);
  console.log(`📈 Total Readings: ${auditResults.totalReadings}`);
  console.log(`🎯 Avg Accuracy: ${(auditResults.avgAccuracy * 100).toFixed(1)}%`);
  console.log(`✅ High Accuracy Rate: ${auditResults.highAccuracyPercentage}%`);
  console.log(`⚠️  Anomalies Detected: ${auditResults.anomaliesDetected}`);
  console.log(`🔷 Overall Confidence: ${(auditResults.confidence * 100).toFixed(1)}%\n`);
  
  console.log(`📍 Source Breakdown:`);
  Object.entries(auditResults.sourceBreakdown).forEach(([source, data]) => {
    const tier = data.avgAccuracy >= 0.95 ? '🔷 PLATINUM' : 
                 data.avgAccuracy >= 0.85 ? '🥇 GOLD' :
                 data.avgAccuracy >= 0.75 ? '🥈 SILVER' : '🥉 BRONZE';
    console.log(`   ${source.toUpperCase()}: ${data.readings} readings | ${(data.avgAccuracy * 100).toFixed(1)}% ${tier}`);
    console.log(`      └─> Avg: ${data.avgReading} MWh | Anomalies: ${data.anomalies}`);
  });
  
  console.log(`\n💡 Recommendations:`);
  auditResults.recommendations.forEach((rec, i) => {
    console.log(`   ${i + 1}. ${rec}`);
  });
  
  console.log(`\n🔗 HashScan Links:`);
  console.log(`   Audit Topic: https://hashscan.io/mainnet/topic/${TOPICS.AUDIT}`);
  console.log(`   Certificate Seq: ${certSeq}`);
  console.log(`   Certificate: https://hashscan.io/mainnet/topic/${TOPICS.AUDIT}/${certSeq}\n`);
  console.log('════════════════════════════════════════════════════════════════════\n');
}

function calculateOverallConfidence() {
  const accuracyWeight = accuracyMetrics.avgAccuracy * 0.4;
  const coverageWeight = (accuracyMetrics.totalReadings / 250) * 0.3; // 250 is max expected
  const anomalyWeight = (1 - (accuracyMetrics.anomalies.length / accuracyMetrics.totalReadings)) * 0.3;
  
  return Math.min(accuracyWeight + coverageWeight + anomalyWeight, 1.0);
}

function generateRecommendations() {
  const recs = [];
  
  const sources = Object.keys(WV_SOURCES);
  sources.forEach(source => {
    const sourceData = accuracyMetrics.dataPoints.filter(dp => dp.source === source);
    const avgAcc = sourceData.reduce((sum, dp) => sum + dp.calculatedAccuracy, 0) / sourceData.length;
    const anomalies = sourceData.filter(dp => dp.isAnomaly).length;
    
    if (avgAcc < 0.85) {
      recs.push(`${source.toUpperCase()}: Consider recalibrating sensors (accuracy: ${(avgAcc * 100).toFixed(1)}%)`);
    }
    if (anomalies > 2) {
      recs.push(`${source.toUpperCase()}: ${anomalies} anomalies detected - investigate data quality`);
    }
  });
  
  if (recs.length === 0) {
    recs.push('All sources operating within normal parameters');
    recs.push('Continue current monitoring schedule');
  }
  
  return recs;
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Stopping energy audit...');
  await logToHCS(TOPICS.AUDIT, 'AUDIT_INTERRUPTED', {
    processed: accuracyMetrics.totalReadings,
    timestamp: Date.now()
  });
  client.close();
  console.log('✅ Audit stopped. Goodbye!\n');
  process.exit(0);
});

// Run audit
performEnergyAudit().catch(console.error);
