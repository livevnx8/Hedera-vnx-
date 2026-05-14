/**
 * Health-Based Payment Example
 * 
 * Demonstrates paying healthy agents with 0.5 HBAR distribution across 4 accounts:
 * - Agent: 50% (0.25 HBAR) - payment for healthy work
 * - Treasury: 20% (0.10 HBAR) - Vera's wallet reserve
 * - Operations: 15% (0.075 HBAR) - infrastructure
 * - Reserve: 15% (0.075 HBAR) - future development
 */

import {
  createAgentBeacon,
  createBeaconListener,
  createPaymentDistributor,
} from '../dist/vera/orchestrator/index.js';
import { getClient } from '../dist/hedera/tools/client.js';
import { logger } from '../dist/monitoring/logger.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Configuration
const BEACON_TOPIC_ID = process.env.VERA_BEACON_TOPIC_ID || '0.0.10414499';
const AGENT_ID = `agent-${Date.now()}`;

// Revenue distribution accounts (from env or defaults)
const TREASURY_ACCOUNT = process.env.VERA_TREASURY_ACCOUNT_ID || '0.0.10414504';
const OPERATIONS_ACCOUNT = process.env.VERA_OPERATIONS_ACCOUNT_ID || '0.0.10414505';
const RESERVE_ACCOUNT = process.env.VERA_RESERVE_ACCOUNT_ID || '0.0.10414506';

async function main() {
  console.log('💰 Health-Based Payment System Example');
  console.log('=====================================\n');
  console.log(`Agent ID: ${AGENT_ID}`);
  console.log(`Topic ID: ${BEACON_TOPIC_ID}`);
  console.log(`Treasury: ${TREASURY_ACCOUNT}`);
  console.log(`\nDistribution per task (0.5 HBAR):`);
  console.log('  - Agent: 50% = 0.25 HBAR');
  console.log('  - Treasury: 20% = 0.10 HBAR');
  console.log('  - Operations: 15% = 0.075 HBAR');
  console.log('  - Reserve: 15% = 0.075 HBAR\n');

  // Initialize Hedera client
  const client = getClient();

  // Create payment distributor
  const distributor = createPaymentDistributor({
    treasuryAccountId: TREASURY_ACCOUNT,
    operationsAccountId: OPERATIONS_ACCOUNT,
    reserveAccountId: RESERVE_ACCOUNT,
    taskRewardHbar: 0.5,
  });
  distributor.setClient(client);

  console.log('📡 Starting beacon listener...');

  // Create beacon listener to monitor agent health
  const listener = createBeaconListener(
    { topicId: BEACON_TOPIC_ID },
    {
      onAgentDiscovered: (agent) => {
        console.log(`\n🔍 Discovered: ${agent.agentId} (${agent.agentType})`);
        console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
      },
      onAgentUpdated: (agent) => {
        console.log(`\n🔄 Updated: ${agent.agentId}`);
        console.log(`   Healthy: ${agent.isHealthy}, Messages: ${agent.messageCount}`);
      },
      onAgentTimeout: (agentId) => {
        console.log(`\n⚠️ Agent timed out: ${agentId}`);
      },
    }
  );

  await listener.start();

  // Create own beacon
  const beacon = createAgentBeacon(AGENT_ID, 'payment-worker', {
    topicId: BEACON_TOPIC_ID,
    intervalMs: 30000,
    capabilities: ['payment-processing', 'health-monitoring', 'task-execution'],
  });

  await beacon.start();

  console.log('\n📢 Beacon active!');
  console.log('Commands:');
  console.log('  p = pay healthy agent (simulates task completion)');
  console.log('  d = show discovered agents');
  console.log('  t = show payment totals');
  console.log('  h = show payment history');
  console.log('  q = quit\n');

  // Command loop
  rl.on('line', async (input) => {
    const cmd = input.trim().toLowerCase();

    switch (cmd) {
      case 'p': {
        // Pay a healthy agent
        const agents = listener.getHealthyAgents();
        if (agents.length === 0) {
          console.log('\n❌ No healthy agents to pay');
          break;
        }

        // Pick first healthy agent
        const targetAgent = agents[0];
        console.log(`\n💸 Paying ${targetAgent.agentId}...`);

        // Simulate getting their account ID (in production, this comes from beacon metadata)
        const agentAccountId = targetAgent.metadata?.accountId || TREASURY_ACCOUNT;

        const result = await distributor.payHealthyAgent(
          targetAgent.agentId,
          agentAccountId,
          targetAgent.isHealthy,
          `task-${Date.now()}`
        );

        if (result.success) {
          console.log(`✅ Payment sent! Tx: ${result.txId}`);
          console.log(`   Distributed: ${JSON.stringify(result.distributed, null, 2)}`);
        } else {
          console.log(`❌ Payment failed: ${result.error}`);
        }
        break;
      }

      case 'd': {
        const agents = listener.getDiscoveredAgents();
        console.log(`\n📊 ${agents.length} agents discovered:`);
        for (const agent of agents) {
          console.log(`   - ${agent.agentId}: ${agent.isHealthy ? '✅ healthy' : '❌ unhealthy'} (${agent.messageCount} msgs)`);
        }
        break;
      }

      case 't': {
        const totals = distributor.getTotalDistributed();
        console.log(`\n💰 Total Distributed:`);
        console.log(`   Agent: ${totals.agent.toFixed(3)} HBAR`);
        console.log(`   Treasury: ${totals.treasury.toFixed(3)} HBAR`);
        console.log(`   Operations: ${totals.operations.toFixed(3)} HBAR`);
        console.log(`   Reserve: ${totals.reserve.toFixed(3)} HBAR`);
        console.log(`   Total: ${totals.total.toFixed(3)} HBAR`);
        break;
      }

      case 'h': {
        const history = distributor.getPaymentHistory();
        console.log(`\n📜 Payment History (${history.length} payments):`);
        for (const p of history.slice(-5)) {
          console.log(`   ${p.success ? '✅' : '❌'} ${p.txId?.slice(0, 20)}... Dist: ${Object.values(p.distributed).reduce((a, b) => a + b, 0).toFixed(3)} HBAR`);
        }
        break;
      }

      case 'q': {
        console.log('\n👋 Stopping...');
        await beacon.stop();
        await listener.stop();
        rl.close();
        process.exit(0);
      }

      default:
        console.log('\nUnknown command. Use: p (pay), d (agents), t (totals), h (history), q (quit)');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down...');
    await beacon.stop();
    await listener.stop();
    rl.close();
    process.exit(0);
  });
}

main().catch(console.error);
