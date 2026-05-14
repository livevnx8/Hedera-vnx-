#!/usr/bin/env node
/**
 * CLI script to show all configured Vera topics and their HashScan URLs
 * Polished version with colors, status indicators, and full architecture view
 */

import { config } from '../src/config.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const network = config.HEDERA_NETWORK || 'mainnet';
const operatorId = config.HEDERA_OPERATOR_ACCOUNT_ID;

// All expected topics with their expected layer/domain
const allTopics = [
  { key: 'VERA_REGISTRY_TOPIC_ID', name: 'Registry', domain: 'foundation', layer: 1, icon: '📋' },
  { key: 'VERA_TASK_TOPIC_ID', name: 'Task', domain: 'foundation', layer: 1, icon: '📋' },
  { key: 'VERA_RESULT_TOPIC_ID', name: 'Result', domain: 'foundation', layer: 1, icon: '📋' },
  { key: 'VERA_AUDIT_TOPIC_ID', name: 'Audit', domain: 'foundation', layer: 1, icon: '📋' },
  { key: 'VERA_BEACON_TOPIC_ID', name: 'Beacon', domain: 'foundation', layer: 1, icon: '📋' },
  { key: 'VERA_HOT_TOPICS_TOPIC_ID', name: 'Hot Topics', domain: 'foundation', layer: 1, icon: '📋' },
  { key: 'VERA_SWARM_STATE_TOPIC_ID', name: 'Swarm State', domain: 'swarm', layer: 2, icon: '🐝' },
  { key: 'VERA_SWARM_CONSENSUS_TOPIC_ID', name: 'Swarm Consensus', domain: 'swarm', layer: 2, icon: '🐝' },
  { key: 'VERA_SWARM_MEET_TOPIC_ID', name: 'Swarm Meet', domain: 'swarm', layer: 2, icon: '🐝' },
  { key: 'VERA_SWARM_JOIN_TOPIC_ID', name: 'Swarm Join', domain: 'swarm', layer: 2, icon: '🐝' },
  { key: 'VERA_SWARM_ROUTING_TOPIC_ID', name: 'Swarm Routing', domain: 'swarm', layer: 2, icon: '🐝' },
  { key: 'VERA_FEDERATION_HANDSHAKE_TOPIC_ID', name: 'Federation Handshake', domain: 'federation', layer: 2, icon: '🤝' },
  { key: 'VERA_FEDERATION_CONSENSUS_TOPIC_ID', name: 'Federation Consensus', domain: 'federation', layer: 2, icon: '🤝' },
  { key: 'VERA_FEDERATION_TASK_TOPIC_ID', name: 'Federation Task', domain: 'federation', layer: 2, icon: '🤝' },
  { key: 'VERA_FEDERATION_HEARTBEAT_TOPIC_ID', name: 'Federation Heartbeat', domain: 'federation', layer: 2, icon: '🤝' },
  { key: 'VERA_DEFI_INTELLIGENCE_TOPIC_ID', name: 'DeFi Intelligence', domain: 'domain', layer: 3, icon: '💰' },
  { key: 'VERA_CARBON_VERIFICATION_TOPIC_ID', name: 'Carbon Verification', domain: 'domain', layer: 3, icon: '🌱' },
  { key: 'VERA_COMPLIANCE_AUDIT_TOPIC_ID', name: 'Compliance Audit', domain: 'domain', layer: 3, icon: '✅' },
  { key: 'VERA_AGENT_LEARNING_TOPIC_ID', name: 'Agent Learning', domain: 'domain', layer: 3, icon: '🧠' },
  { key: 'VERA_PAYMENT_STREAM_TOPIC_ID', name: 'Payment Stream', domain: 'domain', layer: 3, icon: '💸' },
];

// Get actual configured topics
const topics = allTopics.map(t => ({
  ...t,
  id: config[t.key as keyof typeof config] as string | undefined,
  configured: !!config[t.key as keyof typeof config],
}));

const configuredTopics = topics.filter(t => t.configured);
const missingTopics = topics.filter(t => !t.configured);

// Layer colors
const layerColors = {
  1: colors.cyan,
  2: colors.magenta,
  3: colors.yellow,
};

console.log(`\n${colors.bright}${'═'.repeat(70)}${colors.reset}`);
console.log(`${colors.bright}  🌐 VERA HCS TOPOLOGY${colors.reset}`);
console.log(`${colors.bright}${'═'.repeat(70)}${colors.reset}`);

console.log(`\n  ${colors.cyan}⛓️  Network:${colors.reset}     ${colors.bright}${network}${colors.reset}`);
console.log(`  ${colors.cyan}👤 Operator:${colors.reset}    ${operatorId || colors.red + 'Not configured' + colors.reset}`);
console.log(`  ${colors.cyan}📊 Topics:${colors.reset}      ${colors.green}${configuredTopics.length}${colors.reset}/${topics.length} configured ${missingTopics.length > 0 ? `(${colors.red}${missingTopics.length} missing${colors.reset})` : ''}`);

// Summary by layer
console.log(`\n  ${colors.dim}Architecture Layers:${colors.reset}`);
const byLayer = {
  1: { name: 'Foundation', topics: topics.filter(t => t.layer === 1) },
  2: { name: 'Coordination', topics: topics.filter(t => t.layer === 2) },
  3: { name: 'Domain', topics: topics.filter(t => t.layer === 3) },
};

for (const [layerNum, layer] of Object.entries(byLayer)) {
  const configured = layer.topics.filter(t => t.configured).length;
  const total = layer.topics.length;
  const color = layerColors[Number(layerNum) as keyof typeof layerColors];
  const status = configured === total ? colors.green + '✓' : configured === 0 ? colors.red + '✗' : colors.yellow + '◐';
  console.log(`     ${color}Layer ${layerNum}:${colors.reset} ${layer.name.padEnd(15)} ${status}${colors.reset} ${configured}/${total}`);
}

// Detailed view by layer
for (const [layerNum, layer] of Object.entries(byLayer)) {
  const color = layerColors[Number(layerNum) as keyof typeof layerColors];
  const configured = layer.topics.filter(t => t.configured);
  
  if (configured.length === 0) continue;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${color}  ${layer.name.toUpperCase()} LAYER${colors.reset} (${configured.length}/${layer.topics.length} topics)`);
  console.log(`${'─'.repeat(70)}`);

  // Group by domain
  const byDomain = configured.reduce((acc, t) => {
    acc[t.domain] = acc[t.domain] || [];
    acc[t.domain].push(t);
    return acc;
  }, {} as Record<string, typeof configured>);

  for (const [domain, domainTopics] of Object.entries(byDomain)) {
    console.log(`\n  ${colors.dim}${domain.toUpperCase()}${colors.reset}`);
    
    for (const topic of domainTopics) {
      const hashscanUrl = `https://hashscan.io/${network}/topic/${topic.id}`;
      console.log(`    ${topic.icon} ${colors.bright}${topic.name}${colors.reset}`);
      console.log(`       ${colors.gray}ID:${colors.reset}  ${topic.id}`);
      console.log(`       ${colors.gray}URL:${colors.reset} ${colors.cyan}${hashscanUrl}${colors.reset}`);
    }
  }
}

// Show missing topics if any
if (missingTopics.length > 0) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${colors.red}  ⚠️  MISSING TOPICS (${missingTopics.length})${colors.reset}`);
  console.log(`${'─'.repeat(70)}`);
  
  for (const topic of missingTopics) {
    console.log(`    ${colors.red}✗${colors.reset} ${topic.icon} ${topic.name} ${colors.gray}(${topic.key})${colors.reset}`);
  }
  console.log(`\n  ${colors.dim}Run the topic setup script to create missing topics.${colors.reset}`);
}

// Quick commands
console.log(`\n${'═'.repeat(70)}`);
console.log(`${colors.bright}  📋 Quick Commands:${colors.reset}`);
console.log(`${'═'.repeat(70)}`);
console.log(`  ${colors.cyan}View on HashScan:${colors.reset}`);
console.log(`    ${colors.gray}→${colors.reset} https://hashscan.io/${network}/account/${operatorId}`);
console.log(`\n  ${colors.cyan}API Endpoints:${colors.reset}`);
console.log(`    ${colors.gray}→${colors.reset} GET /api/vera/hashscan/topics`);
console.log(`    ${colors.gray}→${colors.reset} GET /api/vera/hashscan/topic/:topicId`);
console.log(`\n  ${colors.cyan}Scripts:${colors.reset}`);
console.log(`    ${colors.gray}→${colors.reset} npm run show:topics     (this view)`);
console.log(`    ${colors.gray}→${colors.reset} npm run verify:topics   (validate topics)`);
console.log(`    ${colors.gray}→${colors.reset} npm run sandbox:start   (start full stack)`);

console.log(`\n${colors.bright}${'═'.repeat(70)}${colors.reset}\n`);
