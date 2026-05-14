#!/usr/bin/env node
/**
 * Vera x402 Micropayment Demo
 * Demonstrates per-request payment handling with x402
 */

import { EnhancedX402Settlement } from '../src/vera/payments/enhancedX402Settlement.js';
import dotenv from 'dotenv';

dotenv.config();

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

console.log(`${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}`);
console.log(`${BLUE}║           VERA x402 MICROPAYMENT DEMO                          ║${NC}`);
console.log(`${BLUE}║           Per-Request Payment Handling                         ║${NC}`);
console.log(`${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n`);

// Initialize x402 settlement handler
const settlement = new EnhancedX402Settlement({
  maxRetries: 3,
  retryDelayMs: 1000,
  enableCircuitBreaker: true,
  supportedCurrencies: ['HBAR', 'USDC']
});

// Track settlements
const settlements = [];

// Simulate micropayment scenarios
async function demoMicropayments() {
  console.log(`${YELLOW}💡 Scenario: Agent swarm with per-request payments${NC}\n`);

  // Demo 1: Simple task payment
  console.log(`${BLUE}1️⃣  Simple Task Payment (1 HBAR)${NC}`);
  try {
    const result = await settlement.settle(
      'task-001',
      'vera-defi-analyst',
      '0.0.10294360', // recipient
      1, // 1 HBAR
      'HBAR'
    );
    settlements.push(result);
    console.log(`   ${GREEN}✓ Settlement created: ${result.settlementId}${NC}`);
    console.log(`   Status: ${result.state}`);
    console.log(`   Amount: ${result.amountHbar} ${result.currency || 'HBAR'}`);
  } catch (err) {
    console.log(`   ${RED}✗ Failed: ${err.message}${NC}`);
  }

  // Demo 2: Batch payments (multiple agents)
  console.log(`\n${BLUE}2️⃣  Batch Agent Payments${NC}`);
  const agents = [
    { id: 'vera-energy-auditor', amount: 0.5 },
    { id: 'vera-security-guardian', amount: 0.75 },
    { id: 'vera-carbon-validator', amount: 0.25 }
  ];

  for (const agent of agents) {
    try {
      const result = await settlement.settle(
        `batch-task-${Date.now()}`,
        agent.id,
        '0.0.10294360',
        agent.amount,
        'HBAR'
      );
      settlements.push(result);
      console.log(`   ${GREEN}✓ ${agent.id}: ${agent.amount} HBAR${NC}`);
    } catch (err) {
      console.log(`   ${RED}✗ ${agent.id}: ${err.message}${NC}`);
    }
  }

  // Demo 3: Get settlement stats
  console.log(`\n${BLUE}3️⃣  Settlement Statistics${NC}`);
  const stats = settlement.getStats();
  console.log(`   Total settlements: ${stats.total}`);
  console.log(`   Settled: ${stats.settled}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Total HBAR paid: ${stats.totalHbarPaid}`);

  // Demo 4: List all settlements
  console.log(`\n${BLUE}4️⃣  Recent Settlements${NC}`);
  const allSettlements = settlement.getAllSettlements();
  allSettlements.slice(-5).forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.settlementId} - ${s.state} - ${s.amount} HBAR`);
  });

  console.log(`\n${GREEN}════════════════════════════════════════════════════════════════${NC}`);
  console.log(`${GREEN}✅ x402 Micropayment Demo Complete${NC}`);
  console.log(`${GREEN}════════════════════════════════════════════════════════════════${NC}\n`);

  console.log(`${YELLOW}Key Features Demonstrated:${NC}`);
  console.log(`  • Per-request payment settlement`);
  console.log(`  • Circuit breaker protection`);
  console.log(`  • Automatic retry with backoff`);
  console.log(`  • Idempotency (no double payments)`);
  console.log(`  • Multi-currency support (HBAR/USDC)`);
  console.log(`  • Real-time settlement statistics`);

  console.log(`\n${BLUE}API Usage:${NC}`);
  console.log(`  POST /api/vera/payments/settle - Create settlement`);
  console.log(`  GET  /api/vera/payments/stats   - Get statistics`);
  console.log(`  GET  /api/vera/payments/:id     - Get settlement details`);
}

// Run demo
demoMicropayments().catch(err => {
  console.error(`${RED}Demo failed: ${err.message}${NC}`);
  process.exit(1);
});
