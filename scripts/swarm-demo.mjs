#!/usr/bin/env node
/**
 * swarm-demo.mjs — generate realistic swarm traffic so the live dashboard lights up.
 *
 * Each step emits a swarm event via POST /api/vera/swarm/emit, which flows through
 * swarmEventLogger → actionVerifier → HIP-993 submission to HCS mainnet.
 *
 * Open /swarm (or /vera-swarm.html) in a browser to watch events arrive live.
 *
 *   node scripts/swarm-demo.mjs                         # one full cycle
 *   node scripts/swarm-demo.mjs --loop --interval 3     # continuous
 *   node scripts/swarm-demo.mjs --scenario consensus    # just ABFT vote
 */

const server = process.env.VERA_SERVER || 'http://localhost:8080';
const args = process.argv.slice(2);
const loop = args.includes('--loop');
const interval = Number(getFlag('--interval', '4'));
const scenario = getFlag('--scenario', 'full');

function getFlag(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[0m`,
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
};

async function emit(kind, from, to, data = {}) {
  const res = await fetch(`${server}/api/vera/swarm/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, from, to, data }),
  });
  if (!res.ok) throw new Error(`emit failed: ${res.status}`);
  const event = await res.json();
  console.log(`  ${c.cyan(kind.padEnd(22))} ${c.dim(from)} → ${c.dim(to || '·')}  id=${event.id}`);
  return event;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Scenarios ──────────────────────────────────────────────────────────────

const scenarios = {
  async handshake() {
    console.log(c.bold('\n▸ Quantum handshake scenario'));
    await emit('swarm.handshake', 'executor-0', 'analyst-0', { fidelity: 0.978, duration: 12, channel: 'hbar-4' });
    await sleep(200);
    await emit('lattice.pulse', 'center-0', undefined, { type: 'heartbeat', origin: 'post-handshake' });
  },

  async lattice() {
    console.log(c.bold('\n▸ Lattice message routing scenario'));
    // Outer → center → outer (cross-layer routes through center)
    await emit('lattice.route', 'outer-3', 'outer-7', {
      hops: 3, energyCost: 2.145, path: ['outer-3','center-0','outer-7'], messageType: 'task-offer',
    });
    await sleep(300);
    await emit('lattice.reinforce', 'outer-3', 'outer-7', {
      nodesSpawned: 0, action: 'path-reinforced', strength: 0.82,
    });
  },

  async decision() {
    console.log(c.bold('\n▸ Center-routed decision scenario'));
    await emit('lattice.decision', 'layer-3', 'layer-1', {
      decisionType: 'defi-swap-approval',
      centerEnergy: 0.91,
      routedThroughCenter: true,
    });
    await sleep(250);
    await emit('swarm.task-routed', 'center-0', 'executor-1', { taskType: 'swap', priority: 0.8 });
  },

  async consensus() {
    console.log(c.bold('\n▸ ABFT consensus scenario'));
    const proposalId = `prop-${Date.now()}`;
    await emit('swarm.consensus', 'guardian-0', 'guardians', {
      phase: 'propose', proposalId, type: 'PAYMENT_BATCH', value: '2.5 HBAR',
    });
    await sleep(400);
    for (const g of ['guardian-0','guardian-1','guardian-2']) {
      await emit('swarm.consensus', g, 'guardians', { phase: 'vote', proposalId, vote: 'YES' });
      await sleep(200);
    }
    await emit('swarm.consensus', 'guardian-0', 'guardians', { phase: 'commit', proposalId, decision: 'APPROVED' });
  },

  async gossip() {
    console.log(c.bold('\n▸ Gossip propagation scenario'));
    const evtId = `evt-${Date.now()}`;
    await emit('swarm.gossip', 'agent-alpha', 'broadcast', { eventId: evtId, type: 'THREAT_ALERT', ttl: 5, hop: 0 });
    await sleep(200);
    await emit('swarm.gossip', 'agent-bravo',  'broadcast', { eventId: evtId, type: 'THREAT_ALERT', ttl: 4, hop: 1 });
    await sleep(200);
    await emit('swarm.gossip', 'agent-charlie','broadcast', { eventId: evtId, type: 'THREAT_ALERT', ttl: 3, hop: 2 });
  },

  async agentLifecycle() {
    console.log(c.bold('\n▸ Agent lifecycle scenario'));
    await emit('lattice.agent-joined', 'executor-7', undefined, { layer: 1, role: 'executor' });
    await sleep(200);
    await emit('swarm.beacon', 'executor-7', 'swarm', { status: 'online', capabilities: ['swap','bridge'] });
  },

  async payment() {
    console.log(c.bold('\n▸ Inter-agent micropayment scenario'));
    await emit('swarm.payment', 'client-0', 'analyst-0', {
      amount: '0.001 HBAR', for: 'analysis', score: 0.94,
    });
  },

  async full() {
    await this.handshake();
    await sleep(300);
    await this.lattice();
    await sleep(300);
    await this.decision();
    await sleep(300);
    await this.consensus();
    await sleep(300);
    await this.gossip();
    await sleep(300);
    await this.agentLifecycle();
    await sleep(300);
    await this.payment();
  },
};

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold(`\n🕸️  Vera Swarm Demo`));
  console.log(`${c.dim('server:  ')}${server}`);
  console.log(`${c.dim('scenario:')} ${scenario}`);
  console.log(`${c.dim('dashboard:')} ${server}/swarm\n`);

  if (!scenarios[scenario]) {
    console.error(`Unknown scenario: ${scenario}`);
    console.error('Available:', Object.keys(scenarios).join(', '));
    process.exit(1);
  }

  do {
    await scenarios[scenario]();
    if (loop) {
      console.log(c.dim(`\n  waiting ${interval}s before next cycle…\n`));
      await sleep(interval * 1000);
    }
  } while (loop);

  // Final stats
  const stats = await fetch(`${server}/api/vera/swarm/stats`).then((r) => r.json());
  console.log(c.bold('\n✓ Demo complete'));
  console.log(`  ${c.green('total events:')} ${stats.totalEvents}`);
  console.log(`  ${c.green('on-chain:')}     ${stats.onChainEvents}`);
  console.log(`  ${c.green('pending:')}      ${stats.pendingEvents}`);
  console.log(`\n  Open ${c.cyan(server + '/swarm')} to see the live feed.\n`);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
