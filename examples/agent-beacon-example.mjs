/**
 * Agent HCS Beacon System - Usage Example
 * 
 * This example demonstrates how agents can use the HCS SOS beacon system
 * for constant heartbeat broadcasting and discovery.
 * 
 * Features shown:
 * - Agent heartbeat broadcasting (every 30s)
 * - SOS mode for emergencies (every 5s)
 * - Agent discovery via HCS
 * - Real-time agent monitoring
 * 
 * Run: node examples/agent-beacon-example.mjs
 */

import { AgentHCSBeacon } from '../dist/vera/orchestrator/agentHCSBeacon.js';
import { createBeaconListener } from '../dist/vera/orchestrator/agentHCSBeaconListener.js';

// Configuration
const TOPIC_ID = process.env.VERA_REGISTRY_TOPIC_ID || '0.0.10414499';
const AGENT_ID = process.env.AGENT_ID || `agent-${Date.now()}`;
const AGENT_TYPE = process.env.AGENT_TYPE || 'data-processor';

async function main() {
  console.log('🆘 Agent HCS Beacon System Example\n');
  console.log(`Agent ID: ${AGENT_ID}`);
  console.log(`Agent Type: ${AGENT_TYPE}`);
  console.log(`Topic ID: ${TOPIC_ID}\n`);

  // Create beacon for this agent
  const beacon = new AgentHCSBeacon(AGENT_ID, AGENT_TYPE, {
    topicId: TOPIC_ID,
    intervalMs: 30000, // Heartbeat every 30 seconds
    sosIntervalMs: 5000, // SOS every 5 seconds
  });

  // Set up dynamic status callback
  beacon.onStatus(() => ({
    healthy: true,
    load: Math.random() * 0.5, // Simulated load 0-50%
    queueDepth: Math.floor(Math.random() * 10), // Simulated queue
    lastTaskCompleted: Date.now() - Math.random() * 60000,
  }));

  // Set up capabilities callback
  beacon.onCapabilities(() => [
    'data-processing',
    'analytics',
    'reporting',
    'hedera-query',
  ]);

  // Set up metadata callback
  beacon.onMetadata(() => ({
    version: '1.0.0',
    endpoint: `https://api.example.com/agents/${AGENT_ID}`,
    region: 'us-east-1',
  }));

  // Create listener for discovering other agents
  const listener = createBeaconListener(
    {
      topicId: TOPIC_ID,
      agentTimeoutMs: 120000, // 2 minute timeout
    },
    {
      onAgentDiscovered: (agent) => {
        console.log(`\n🔍 New agent discovered: ${agent.agentId} (${agent.agentType})`);
        console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
        console.log(`   Endpoint: ${agent.endpoint || 'N/A'}`);
      },
      onAgentUpdated: (agent) => {
        console.log(`\n🔄 Agent updated: ${agent.agentId}`);
        console.log(`   Healthy: ${agent.healthy}, Messages: ${agent.messageCount}`);
      },
      onSOS: (message) => {
        console.log(`\n🚨 SOS RECEIVED from ${message.agentId}!`);
        console.log(`   Level: ${message.sos?.level}`);
        console.log(`   Message: ${message.sos?.message}`);
        console.log(`   Code: ${message.sos?.code || 'N/A'}`);
      },
      onAgentTimeout: (agentId) => {
        console.log(`\n⚠️ Agent timed out: ${agentId}`);
      },
      onError: (error) => {
        console.error('\n❌ Listener error:', error.message);
      },
    }
  );

  // Start listener first
  console.log('📡 Starting beacon listener...');
  await listener.start();

  // Start broadcasting
  console.log('📢 Starting beacon broadcasts...');
  await beacon.start();

  console.log('\n✅ Beacon system active!');
  console.log('Commands:');
  console.log('  p = pulse (immediate heartbeat)');
  console.log('  s = trigger SOS');
  console.log('  c = cancel SOS');
  console.log('  d = show discovered agents');
  console.log('  h = show own message history');
  console.log('  q = quit\n');

  // Interactive commands
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', async (key) => {
    const char = key.toString();

    if (char === 'q') {
      console.log('\n🛑 Stopping...');
      await beacon.stop();
      await listener.stop();
      process.exit(0);
    }

    if (char === 'p') {
      console.log('\n💓 Sending pulse...');
      await beacon.pulse();
      console.log('Pulse sent!');
    }

    if (char === 's') {
      console.log('\n🚨 Triggering SOS...');
      await beacon.triggerSOS(
        'warning',
        'High memory usage detected',
        'MEM_HIGH'
      );
      console.log('SOS triggered! Broadcasting every 5 seconds...');
    }

    if (char === 'c') {
      console.log('\n✋ Cancelling SOS...');
      await beacon.cancelSOS();
      console.log('SOS cancelled!');
    }

    if (char === 'd') {
      console.log('\n📋 Discovered Agents:');
      const agents = listener.getDiscoveredAgents();
      if (agents.length === 0) {
        console.log('  No agents discovered yet');
      } else {
        agents.forEach((agent) => {
          const age = Math.floor((Date.now() - agent.lastSeen) / 1000);
          console.log(`  - ${agent.agentId} (${agent.agentType})`);
          console.log(`    Healthy: ${agent.healthy}, Last seen: ${age}s ago`);
          console.log(`    Capabilities: ${agent.capabilities.join(', ')}`);
        });
      }
    }

    if (char === 'h') {
      console.log('\n📜 Own Message History:');
      const history = beacon.getMessageHistory();
      if (history.length === 0) {
        console.log('  No messages yet');
      } else {
        history.slice(-5).forEach((msg) => {
          console.log(`  [${msg.type}] #${msg.sequence} at ${new Date(msg.timestamp).toISOString()}`);
        });
      }
    }
  });

  // Periodic status display
  setInterval(() => {
    const agents = listener.getDiscoveredAgents();
    console.log(`\n📊 Status: ${agents.length} agents discovered, ${beacon.getMessageHistory().length} beacons sent`);
  }, 60000);
}

// Run example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
