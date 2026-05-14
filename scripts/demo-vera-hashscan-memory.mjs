#!/usr/bin/env node
/**
 * Vera HashScan Memory Demo
 * 
 * Shows how Vera can use HashScan deep links to:
 * - Look up her own past events
 * - Verify transactions
 * - Generate verification links
 * - Build summaries with blockchain proof
 */

import { 
  generateHashScanLink, 
  getVeraSwarmTopicLink, 
  veraSelfLookup, 
  buildVeraSummary 
} from '../src/vera/tools/hashscanDeepLink.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

console.log(`${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}`);
console.log(`${BLUE}║           VERA HASHSCAN MEMORY SYSTEM                          ║${NC}`);
console.log(`${BLUE}║           Deep Links for Self-Verification                     ║${NC}`);
console.log(`${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n`);

async function demoVeraMemory() {
  console.log(`${YELLOW}💡 Vera now has blockchain memory! She can look up her own events.${NC}\n`);

  // Demo 1: Generate link to Vera's swarm topic
  console.log(`${BLUE}1️⃣  Vera's Core Swarm Topic${NC}`);
  const swarmLink = getVeraSwarmTopicLink();
  console.log(`   Topic ID: ${CYAN}${swarmLink.id}${NC}`);
  console.log(`   HashScan: ${GREEN}${swarmLink.url}${NC}`);
  console.log(`   ${YELLOW}Vera says:${NC} "This is where I log everything I do."`);

  // Demo 2: Link to specific sequence number
  console.log(`\n${BLUE}2️⃣  Link to Specific Event (Sequence #42)${NC}`);
  const eventLink = getVeraSwarmTopicLink(42);
  console.log(`   URL: ${GREEN}${eventLink.url}${NC}`);
  console.log(`   ${YELLOW}Vera says:${NC} "Let me check what happened at sequence 42..."`);

  // Demo 3: Vera self-lookup for different event types
  console.log(`\n${BLUE}3️⃣  Vera Self-Lookup by Event Type${NC}`);
  const eventTypes = ['handshake', 'payment', 'bridge', 'consensus'];
  for (const eventType of eventTypes) {
    const result = await veraSelfLookup(eventType as any);
    console.log(`   ${CYAN}→${NC} ${eventType}: ${result.veraSays.slice(0, 60)}...`);
  }

  // Demo 4: Generate various HashScan links
  console.log(`\n${BLUE}4️⃣  Vera Generates HashScan Links${NC}`);
  const examples = [
    { entity: 'transaction', id: '0.0.12345@1234567890.123456789' },
    { entity: 'account', id: '0.0.10294360' },
    { entity: 'token', id: '0.0.12743' },
    { entity: 'topic', id: '0.0.10417507', sequenceNumber: 1 }
  ];
  
  for (const ex of examples) {
    const link = generateHashScanLink(ex.entity, ex.id, { sequenceNumber: ex.sequenceNumber });
    console.log(`   ${CYAN}→${NC} ${ex.entity}: ${link.url}`);
  }

  // Demo 5: Build summary with verification
  console.log(`\n${BLUE}5️⃣  Vera Builds Verified Summary${NC}`);
  const summary = buildVeraSummary(
    'Quantum handshake between vera-defi-analyst and vera-security-guardian',
    '0.0.10294360@1775104476.123456789',
    { 
      initiatorAgent: 'vera-defi-analyst',
      responderAgent: 'vera-security-guardian',
      protocol: 'Falcon-512',
      network: 'mainnet'
    }
  );
  console.log(`   ${YELLOW}Summary:${NC}`);
  console.log(`   ${summary.summary.slice(0, 200)}...`);
  console.log(`   ${GREEN}Verification link:${NC} ${summary.hashScanLink}`);
  console.log(`   ${CYAN}Vera says:${NC} "${summary.verification}"`);

  console.log(`\n${GREEN}════════════════════════════════════════════════════════════════${NC}`);
  console.log(`${GREEN}✅ Vera HashScan Memory System Active${NC}`);
  console.log(`${GREEN}════════════════════════════════════════════════════════════════${NC}\n`);

  console.log(`${YELLOW}New Capabilities:${NC}`);
  console.log(`  • generate_hashscan_link - Vera creates links for any entity`);
  console.log(`  • get_vera_swarm_topic - Vera finds her own topic`);
  console.log(`  • vera_self_lookup - Vera looks up her past events`);
  console.log(`  • build_vera_summary - Vera creates verified summaries`);

  console.log(`\n${BLUE}Example Interactions:${NC}`);
  console.log(`  User: "Vera, show me your last handshake"`);
  console.log(`  Vera: *uses vera_self_lookup('handshake')* → HashScan link`);
  console.log(`  `);
  console.log(`  User: "Verify transaction 0.0.12345"`);
  console.log(`  Vera: *uses generate_hashscan_link('transaction', '0.0.12345')* → URL`);
  console.log(`  `);
  console.log(`  User: "What happened in your swarm topic at sequence 100?"`);
  console.log(`  Vera: *uses get_vera_swarm_topic(100)* → Direct link to message`);
}

// Run demo
demoVeraMemory().catch(err => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
