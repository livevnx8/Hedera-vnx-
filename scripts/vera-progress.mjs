#!/usr/bin/env node
/**
 * Vera Progress Monitor
 * 
 * Shows comprehensive status of Vera's growth and learning systems.
 * Run: node scripts/vera-progress.mjs
 */
import { execSync } from 'child_process';

const API = 'http://127.0.0.1:8080';

function fetch(endpoint) {
  try {
    return JSON.parse(execSync(`curl -s ${API}${endpoint}`, { encoding: 'utf8', timeout: 5000 }));
  } catch {
    return null;
  }
}

console.log('\n🌸 VERA LATTICE PROGRESS REPORT\n');

// Core Health
const health = fetch('/api/vera/health');
if (health) {
  console.log(`✅ Status: ${health.status}`);
  console.log(`⏱️  Uptime: ${Math.floor(health.uptime / 60000)} minutes`);
  console.log(`📡 Topics: ${Object.keys(health.topics || {}).length} active`);
} else {
  console.log('❌ Vera not responding');
  process.exit(1);
}

// Lattice
const lattice = fetch('/api/vera/lattice/stats');
if (lattice) {
  console.log(`\n🕸️  LATTICE`);
  console.log(`   Nodes: ${lattice.totalNodes} | Edges: ${lattice.totalEdges}`);
  console.log(`   Energy: ${(lattice.averageNodeEnergy * 100).toFixed(1)}%`);
  console.log(`   Layers: L0=${lattice.layerCounts[0]}, L1=${lattice.layerCounts[1]}, L2=${lattice.layerCounts[2]}, L3=${lattice.layerCounts[3]}`);
}

// Tool Consciousness
const tools = fetch('/api/vera/tools');
if (tools) {
  console.log(`\n🔧 TOOL CONSCIOUSNESS`);
  console.log(`   Total: ${tools.totalTools} tools`);
  const active = tools.recentlyActive?.length || 0;
  console.log(`   Active: ${active} tools used recently`);
}

// Knowledge Graph
const kg = fetch('/api/vera/knowledge/graph');
if (kg) {
  console.log(`\n🧠 KNOWLEDGE GRAPH`);
  console.log(`   Entities: ${kg.entities} | Relationships: ${kg.relationships}`);
  if (kg.byType && Object.keys(kg.byType).length > 0) {
    console.log(`   Types: ${Object.entries(kg.byType).map(([t,c]) => `${t}:${c}`).join(', ')}`);
  }
}

// Chat Memory
const memory = fetch('/api/vera/memory/stats');
if (memory) {
  console.log(`\n💬 CHAT MEMORY`);
  console.log(`   Shards: ${memory.total}`);
  console.log(`   Storage: ${memory.dir}`);
}

// Temporal Patterns
const temporal = fetch('/api/vera/temporal/stats');
if (temporal) {
  console.log(`\n⏰ TEMPORAL PATTERNS`);
  console.log(`   Predictions: ${temporal.predictions?.length || 0} hot tools`);
  console.log(`   Hot Hour: ${temporal.isHotHour ? '🔥 YES' : '❄️ no'}`);
  const toolCount = Object.keys(temporal.stats?.tools || {}).length;
  console.log(`   Tools Tracked: ${toolCount}`);
}

// Economic
const eco = fetch('/api/vera/economic/stats');
if (eco) {
  console.log(`\n💰 ECONOMIC TRACKER`);
  console.log(`   Total Spent: ${(eco.stats?.totalSpent || 0).toFixed(4)} ℏ`);
  console.log(`   Calls: ${eco.stats?.totalCalls || 0}`);
  console.log(`   Savings Opportunities: ${eco.savingsOpportunities?.length || 0}`);
}

// Swarm
const swarm = fetch('/api/vera/swarm/load');
if (swarm) {
  console.log(`\n🐝 SWARM LOAD BALANCER`);
  const busy = swarm.agents?.filter(a => a.activeTasks > 0).length || 0;
  console.log(`   Agents: ${swarm.agents?.length || 0} (${busy} busy)`);
}

// Tool Health
const toolHealth = fetch('/api/vera/tools/health');
if (toolHealth) {
  console.log(`\n🏥 TOOL HEALTH`);
  console.log(`   Tracked: ${toolHealth.tools || 0}`);
  console.log(`   Unhealthy: ${toolHealth.unhealthy?.length || 0}`);
}

// Learning & Cross-Shard
const learning = fetch('/api/vera/learning/clusters');
if (learning) {
  console.log(`\n🧬 CROSS-SHARD LEARNING`);
  console.log(`   Clusters: ${learning.stats?.clusters || 0}`);
  console.log(`   Patterns: ${learning.stats?.patterns || 0}`);
}

// Sentiment
const sentiment = fetch('/api/vera/sentiment/mood');
if (sentiment) {
  console.log(`\n💭 SENTIMENT TRACKING`);
  const moodEmoji = sentiment.mood === 'positive' ? '😊' : sentiment.mood === 'negative' ? '😔' : '😐';
  console.log(`   Mood: ${moodEmoji} ${sentiment.mood}`);
  console.log(`   Satisfaction: ${sentiment.satisfaction || 0}%`);
  console.log(`   Trend: ${sentiment.recentTrend || 'stable'}`);
}

// Lattice Evolution
const evolution = fetch('/api/vera/evolution/stats');
if (evolution) {
  console.log(`\n🌱 LATTICE EVOLUTION`);
  const ageMin = Math.floor((evolution.age || 0) / 60000);
  console.log(`   Age: ${ageMin} min | Snapshots: ${evolution.snapshots?.length || 0}`);
  console.log(`   Trend: ${evolution.trend || 'stable'} | Max: ${evolution.maxNodes || 0} nodes`);
}

// Intent Prediction
const intent = fetch('/api/vera/intent/sequences');
if (intent) {
  console.log(`\n🎯 INTENT PREDICTION`);
  console.log(`   Sequences: ${intent.stats?.sequences || 0}`);
  console.log(`   Patterns: ${intent.stats?.patterns || 0}`);
}

// HCS Insights Logger
const insights = fetch('/api/vera/insights/status');
if (insights) {
  console.log(`\n📡 HCS INSIGHTS (HIP-993)`);
  console.log(`   Status: ${insights.running ? '🟢 Running' : '⚪ Stopped'}`);
  console.log(`   Messages: ${insights.totalMessages || 0} | Seq: ${insights.sequenceNumber || 0}`);
  if (insights.lastLogTime) {
    const lastMin = Math.floor((Date.now() - insights.lastLogTime) / 60000);
    console.log(`   Last Log: ${lastMin}m ago (minutely heartbeats)`);
  }
}

console.log('\n✨ Vera is growing and learning continuously\n');
