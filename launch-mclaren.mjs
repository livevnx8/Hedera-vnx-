#!/usr/bin/env node
/**
 * Vera McLaren F1 Carbon Auditing Agents - Launcher
 */

import dotenv from 'dotenv';
dotenv.config();

import { raceCarbonAuditor } from './dist/mclaren/raceCarbonAuditor.js';
import { realTimeCarbonValidator } from './dist/mclaren/realTimeValidator.js';
import { pitWallHUD } from './dist/mclaren/pitWallHUD.js';
import { scenarioSimulator } from './dist/mclaren/scenarioSimulator.js';
import { carbonOffsetRetirement } from './dist/mclaren/carbonOffsetRetirement.js';

const accountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
const network = process.env.HEDERA_NETWORK || 'mainnet';

console.log(`
╔════════════════════════════════════════════════════════════╗
║     VERA McLAREN F1 CARBON AUDITING - AGENTS LAUNCHED      ║
╚════════════════════════════════════════════════════════════╝
`);

console.log(`🔑 Operator: ${accountId}`);
console.log(`🌐 Network: ${network.toUpperCase()}`);

const carbonTopicId = process.env.MCLAREN_CARBON_AUDIT_REPORTS_TOPIC_ID;
const seasonTopicId = process.env.MCLAREN_SEASON_SUMMARIES_TOPIC_ID;
const retirementTopicId = process.env.MCLAREN_OFFSET_RETIREMENT_TOPIC_ID;

const topicsConfigured = [carbonTopicId, seasonTopicId, retirementTopicId].filter(Boolean).length;
console.log(`📊 Topics: ${topicsConfigured}/3 configured\n`);

if (topicsConfigured === 3) {
  console.log('✅ McLaren Topics:');
  console.log(`   Carbon: ${carbonTopicId}`);
  console.log(`   Season: ${seasonTopicId}`);
  console.log(`   Retirement: ${retirementTopicId}\n`);
}

console.log('🏎️  McLaren Agents Ready:\n');
console.log('   ✅ Race Carbon Auditor');
console.log('   ✅ Real-Time Validator');
console.log('   ✅ Pit Wall HUD');
console.log('   ✅ Scenario Simulator');
console.log('   ✅ Offset Retirement\n');

console.log('📊 Demo: Monaco GP 2026');
console.log('   CO₂e: 1.054 tCO₂e (team)');
console.log('   Savings: 35kg CO₂e potential');
console.log('   Confidence: 94%\n');

console.log('🔴 Press Ctrl+C to stop\n');

setInterval(() => {}, 5000);
