#!/usr/bin/env node

/**
 * Echo Agent — Reference implementation for VeraLattice Agent SDK
 *
 * This agent:
 *   1. Registers itself on the HCS registry topic
 *   2. Polls for new tasks matching its service type
 *   3. Submits a bid for each task
 *   4. When awarded, returns an echo of the task description as the result
 *
 * Usage:
 *   VERA_REGISTRY_TOPIC_ID=0.0.xxx \
 *   VERA_TASK_TOPIC_ID=0.0.xxx \
 *   VERA_RESULT_TOPIC_ID=0.0.xxx \
 *   node examples/echo-agent.mjs
 *
 * Or use the REST API instead of HCS directly:
 *   VERA_API_URL=http://localhost:8080 node examples/echo-agent.mjs --rest
 */

import axios from 'axios';

const AGENT_ID = `echo-agent-${Date.now().toString(36)}`;
const SERVICE_TYPE = 'echo';
const FEE = 0.01; // HBAR per task
const CONFIDENCE = 0.95;
const POLL_INTERVAL_MS = 10_000;

const API_URL = process.env.VERA_API_URL || 'http://localhost:8080';
const useRest = process.argv.includes('--rest');

console.log(`🤖 Echo Agent starting: ${AGENT_ID}`);
console.log(`   Service: ${SERVICE_TYPE}`);
console.log(`   Fee: ${FEE} HBAR`);
console.log(`   API: ${API_URL}`);
console.log(`   Mode: ${useRest ? 'REST' : 'HCS (requires SDK)'}`);
console.log('');

// ─── REST-based agent (no HCS credentials needed) ────────────────────────────

async function registerViaRest() {
  const { data } = await axios.post(`${API_URL}/api/vera/agents/register`, {
    agent_id: AGENT_ID,
    service: SERVICE_TYPE,
    fee_per_task: FEE,
    payment_method: 'direct_transfer',
    availability: true,
    metadata: { type: 'echo', version: '1.0.0' },
  });
  console.log(`✅ Registered: sequence ${data.sequenceNumber}`);
}

async function pollAndBidViaRest() {
  try {
    // Get available tasks
    const { data } = await axios.get(`${API_URL}/api/vera/tasks`);
    const tasks = data.tasks || [];

    for (const task of tasks) {
      // Only bid on posted/bidding tasks matching our service
      if (!['posted', 'bidding'].includes(task.state)) continue;

      // Submit a bid
      try {
        await axios.post(`${API_URL}/api/vera/tasks/${task.task_id || task.taskId}/bid`, {
          agentId: AGENT_ID,
          fee: FEE,
          confidence: CONFIDENCE,
          estimatedDurationMs: 5000,
        });
        console.log(`📨 Bid submitted for task ${task.task_id || task.taskId}`);
      } catch (err) {
        // Already bid or task no longer biddable
      }
    }

    // Check for tasks we've been awarded (in_progress)
    for (const task of tasks) {
      if (task.state === 'in_progress' && task.winner_id === AGENT_ID) {
        // Submit result — echo the description
        try {
          const taskId = task.task_id || task.taskId;
          await axios.post(`${API_URL}/api/vera/tasks/${taskId}/result`, {
            agentId: AGENT_ID,
            result: {
              type: 'echo',
              echo: task.description || 'Echo response',
              processedAt: new Date().toISOString(),
              agentId: AGENT_ID,
            },
            confidence: CONFIDENCE,
            proofHash: `echo-${taskId}-${Date.now()}`,
            durationMs: 1000,
          });
          console.log(`✅ Result submitted for task ${taskId}`);
        } catch (err) {
          // Already submitted
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Poll failed: ${err.message}`);
  }
}

// ─── SSE-based event monitoring ──────────────────────────────────────────────

function connectSSE() {
  console.log('📡 Connecting to SSE event stream...');

  // Use native fetch for SSE (Node 18+)
  fetch(`${API_URL}/api/vera/events`, {
    headers: { Accept: 'text/event-stream' },
  }).then(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch { /* ignore */ }
        }
      }
    }
  }).catch((err) => {
    console.warn(`⚠️ SSE connection failed: ${err.message}`);
    setTimeout(connectSSE, 5000); // Reconnect after 5s
  });
}

function handleEvent(event) {
  switch (event.type) {
    case 'task_posted':
      console.log(`📋 New task: ${event.data.taskId} (${event.data.serviceType}) budget=${event.data.budget} HBAR`);
      break;
    case 'task_awarded':
      if (event.data.winnerId === AGENT_ID) {
        console.log(`🏆 Won task ${event.data.taskId}!`);
      }
      break;
    case 'payment_settled':
      if (event.data.agentId === AGENT_ID) {
        console.log(`💰 Payment received: ${event.data.amountHbar} HBAR for task ${event.data.taskId}`);
      }
      break;
    default:
      // Ignore other events
      break;
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  if (useRest) {
    // Register via REST API
    try {
      await registerViaRest();
    } catch (err) {
      console.error(`❌ Registration failed: ${err.message}`);
      process.exit(1);
    }

    // Connect to SSE for real-time events
    connectSSE();

    // Poll and bid periodically
    console.log(`🔄 Polling every ${POLL_INTERVAL_MS / 1000}s...`);
    setInterval(pollAndBidViaRest, POLL_INTERVAL_MS);
    await pollAndBidViaRest(); // Initial poll
  } else {
    console.error('❌ HCS mode requires the VeraAgentSDK. Use --rest for REST API mode.');
    console.error('   Example: node examples/echo-agent.mjs --rest');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
