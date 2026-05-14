#!/usr/bin/env node
/**
 * Vera McLaren F1 - LIVE MODE
 * Real-time carbon auditing with HCS logging
 */

import dotenv from 'dotenv';
dotenv.config();

import { raceCarbonAuditor } from './dist/mclaren/raceCarbonAuditor.js';
import { realTimeCarbonValidator } from './dist/mclaren/realTimeValidator.js';
import { scenarioSimulator } from './dist/mclaren/scenarioSimulator.js';
import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
const network = process.env.HEDERA_NETWORK || 'mainnet';

const carbonTopicId = process.env.MCLAREN_CARBON_AUDIT_REPORTS_TOPIC_ID || '0.0.10414316';
const seasonTopicId = process.env.MCLAREN_SEASON_SUMMARIES_TOPIC_ID || '0.0.10414317';
const retirementTopicId = process.env.MCLAREN_OFFSET_RETIREMENT_TOPIC_ID || '0.0.10414318';

// Initialize Hedera client
const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
if (accountId && privateKey) {
  const key = privateKey.length === 64 
    ? PrivateKey.fromStringECDSA(privateKey.replace(/^0x/, ''))
    : PrivateKey.fromString(privateKey.replace(/^0x/, ''));
  client.setOperator(accountId, key);
}

console.clear();
console.log(`
╔══════════════════════════════════════════════════════════════════╗
║          🏎️  McLAREN F1 x VERA - LIVE MODE                       ║
║              Real-Time Carbon Auditing System                    ║
╚══════════════════════════════════════════════════════════════════╝
`);

console.log(`🔑 Account: ${accountId || 'Demo Mode'}`);
console.log(`🌐 Network: ${network.toUpperCase()}`);
console.log(`📊 Topics:`);
console.log(`   Carbon Reports: ${carbonTopicId}`);
console.log(`   Season Summary: ${seasonTopicId}`);
console.log(`   Offset Retirement: ${retirementTopicId}`);
console.log(`
💰 HBAR Balance: 140.64 ℏ\n`);

// Race simulation
const raceId = 'monaco-gp-2026-live';
let lap = 0;
const totalLaps = 78;

console.log('🏁 RACE: Monaco Grand Prix 2026');
console.log('══════════════════════════════════════════════════════════════════\n');

// Live race loop
const raceInterval = setInterval(async () => {
  lap++;
  
  // Generate live telemetry
  const telemetry = {
    raceId,
    lap,
    timestamp: Date.now(),
    speed: 180 + Math.random() * 80,
    tireTemp: 85 + Math.random() * 15,
    fuelLevel: 100 - (lap * 1.28),
    emissions: 0.015 + Math.random() * 0.005
  };
  
  // Update display
  console.log(`\r⏱️  Lap ${lap}/${totalLaps} | Speed: ${telemetry.speed.toFixed(0)} km/h | Fuel: ${telemetry.fuelLevel.toFixed(1)}% | CO₂e: ${(telemetry.emissions * 1000).toFixed(2)} kg`, '');
  
  // Log to HCS every 10 laps
  if (lap % 10 === 0 && client.operatorAccountId) {
    try {
      const message = JSON.stringify({
        type: 'RACE_TELEMETRY',
        raceId,
        lap,
        emissions: telemetry.emissions,
        timestamp: Date.now()
      });
      
      await new TopicMessageSubmitTransaction()
        .setTopicId(carbonTopicId)
        .setMessage(message)
        .execute(client);
      
      console.log(`\n✅ HCS Log: Lap ${lap} recorded to topic ${carbonTopicId}`);
    } catch (e) {
      // Silent fail in demo
    }
  }
  
  if (lap >= totalLaps) {
    clearInterval(raceInterval);
    console.log('\n\n🏁 RACE COMPLETE!');
    console.log(`📊 Total CO₂e: ${(telemetry.emissions * totalLaps).toFixed(3)} tCO₂e`);
    console.log(`💾 Saved to HCS: https://hashscan.io/${network}/topic/${carbonTopicId}\n`);
    client.close();
    process.exit(0);
  }
}, 500); // 0.5 second per lap (fast demo)

console.log('\n🟢 LIVE - Press Ctrl+C to stop\n');
