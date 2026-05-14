#!/usr/bin/env node
/**
 * run.mjs — DeFi Attested Trading Agent entrypoint.
 *
 *   node run.mjs --pair HBAR/USDC --size 100 --dry-run
 *   node run.mjs --pair HBAR/USDC --interval 30 --max-trades 3
 *   node run.mjs --verify-pair <intent-hash> <execution-hash>
 */

import { SimpleMomentumAgent } from './agent.mjs';
import { PriceFeed } from './price-feed.mjs';
import { Attestor } from './attestation.mjs';

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getFlag = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes(name);

const server = getFlag('--server', process.env.VERA_SERVER || 'http://localhost:8080');
const pair = getFlag('--pair', 'HBAR/USDC');
const size = Number(getFlag('--size', '100'));
const interval = Number(getFlag('--interval', '0'));
const maxTrades = Number(getFlag('--max-trades', '1'));
const dryRun = hasFlag('--dry-run');
const verifyPair = hasFlag('--verify-pair');

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yel: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const log = {
  agent: (m) => console.log(`${c.dim('[agent]  ')}${m}`),
  intent: (m) => console.log(`${c.cyan('[intent] ')}${m}`),
  exec: (m) => console.log(`${c.green('[exec]   ')}${m}`),
  warn: (m) => console.log(`${c.yel('[warn]   ')}${m}`),
  err: (m) => console.log(`${c.red('[error]  ')}${m}`),
};

// ─── Shared initialization ───────────────────────────────────────────────────
const attestor = new Attestor({ server, actor: 'defi-agent-demo' });

// ─── Verify-pair mode: prove intent→execution consistency ────────────────────
if (verifyPair) {
  const [intentHash, execHash] = args.filter((a) => /^[a-f0-9]{64}$/i.test(a));
  if (!intentHash || !execHash) {
    console.error('usage: node run.mjs --verify-pair <intent-hash> <execution-hash>');
    process.exit(1);
  }
  await verifyPairHashes(intentHash, execHash);
  process.exit(0);
}

// ─── Trading loop ────────────────────────────────────────────────────────────
const feed = new PriceFeed({ server, pair });
const threshold = Number(getFlag('--threshold', '0.3'));
const agent = new SimpleMomentumAgent({ buyThreshold: threshold, sellThreshold: threshold });

console.log(c.bold(`\n🤖 DeFi Attested Trading Agent`));
console.log(`${c.dim('server:  ')}${server}`);
console.log(`${c.dim('pair:    ')}${pair}`);
console.log(`${c.dim('size:    ')}${size}`);
console.log(`${c.dim('interval:')} ${interval}s`);
console.log(`${c.dim('trades:  ')}${maxTrades}`);
console.log(`${c.dim('mode:    ')}${dryRun ? c.yel('DRY-RUN') : c.green('LIVE')}\n`);

let tradesDone = 0;

async function iterate() {
  tradesDone++;
  console.log(c.bold(`\n── Iteration ${tradesDone}/${maxTrades} ──`));

  // 1. Observe
  let snapshot;
  try {
    snapshot = await feed.current();
    if (!snapshot?.price) throw new Error('no price');
    log.agent(`observed ${pair} = ${c.cyan(snapshot.price)}  ${c.dim('@ ' + new Date(snapshot.observedAt).toISOString())}`);
  } catch (e) {
    log.err(`price feed failed: ${e.message}`);
    return;
  }

  // 2. Decide
  const decision = agent.decide(snapshot, size);
  log.agent(`decision: ${c.bold(decision.action)}  ${c.dim(`confidence=${decision.confidence.toFixed(2)} reason=${decision.reason}`)}`);

  // 3. Attest intent (BEFORE any execution — this is the anti-frontrun proof)
  let intentProof;
  try {
    intentProof = await attestor.attestIntent({
      decision,
      observedPrice: snapshot.price,
      context: { pair, source: snapshot.source },
    });
    log.intent(`anchored  hash=${c.dim(intentProof.hash.slice(0, 16) + '…')} topic=${intentProof.topicId} seq=${intentProof.sequenceNumber || c.yel('pending')}`);
    if (!intentProof.sequenceNumber) log.warn('intent not yet on-chain — may be mid-propagation');
  } catch (e) {
    log.err(`intent attestation failed: ${e.message}`);
    return;
  }

  // 4. Execute (skip if HOLD or dry-run)
  if (decision.action === 'HOLD') {
    log.agent(c.dim('no trade — respecting HOLD decision'));
    return;
  }
  if (dryRun) {
    log.agent(c.yel('dry-run — skipping execution'));
    return;
  }

  const tradeResult = await agent.executeTrade(decision, snapshot);
  log.agent(`executed ${c.bold(decision.action)} ${decision.size} ${pair} @ ${tradeResult.executionPrice} ${c.dim(`(slippage ${tradeResult.slippage}%)`)}`);

  // 5. Attest execution (AFTER, referencing intent hash)
  try {
    const execProof = await attestor.attestExecution({
      intentHash: intentProof.hash,
      trade: { action: decision.action, size: decision.size, pair },
      actualResult: tradeResult,
    });
    log.exec(`anchored  hash=${c.dim(execProof.hash.slice(0, 16) + '…')} seq=${execProof.sequenceNumber || c.yel('pending')}`);
    console.log();
    console.log(`${c.bold('Verify with:')}`);
    console.log(`  npx @vera/verify ${intentProof.hash} --server ${server}`);
    console.log(`  npx @vera/verify ${execProof.hash} --server ${server}`);
    console.log(`  node run.mjs --verify-pair ${intentProof.hash} ${execProof.hash}`);
  } catch (e) {
    log.err(`execution attestation failed: ${e.message}`);
  }
}

// Loop or one-shot
if (interval > 0 && maxTrades > 1) {
  while (tradesDone < maxTrades) {
    await iterate();
    if (tradesDone < maxTrades) await new Promise((r) => setTimeout(r, interval * 1000));
  }
} else {
  await iterate();
}

console.log(c.bold(`\n✓ ${tradesDone} iterations complete\n`));

// ─── Verify a pair of hashes: prove intent→execution consistency ─────────────
async function verifyPairHashes(intentHash, execHash) {
  console.log(c.bold(`\n🔍 Verifying intent→execution pair\n`));

  const [intent, execution] = await Promise.all([
    attestor.verify(intentHash),
    attestor.verify(execHash),
  ]);

  const intentAnchored = !!intent.onChain;
  const execAnchored = !!execution.onChain;
  const intentTs = intent.consensusTimestamp;
  const execTs = execution.consensusTimestamp;

  console.log(`${c.dim('intent:   ')}${intentAnchored ? c.green('✓ anchored') : c.red('✗ not anchored')}  ${c.dim('at ' + intentTs)}`);
  console.log(`${c.dim('execution:')}${execAnchored ? c.green('✓ anchored') : c.red('✗ not anchored')}  ${c.dim('at ' + execTs)}`);

  if (!intentAnchored || !execAnchored) {
    console.log(c.red('\n✗ VERIFICATION FAILED — one or both proofs are missing'));
    process.exit(4);
  }

  // Check 1: execution after intent
  const order = intentTs < execTs;
  console.log(`${c.dim('ordering:')} ${order ? c.green('✓ execution came AFTER intent') : c.red('✗ out-of-order — execution BEFORE intent (impossible if honest)')}`);

  // Check 2: execution references the intent hash (from decoded mirror payload)
  const execIntentHash = execution.payload?.intentHash
    ?? execution.localProof?.payload?.intentHash;
  const refOk = execIntentHash === intentHash;
  console.log(`${c.dim('binding: ')} ${refOk ? c.green('✓ execution references intent hash') : c.red(`✗ intent hash mismatch (execution claims ${execIntentHash})`)}`);

  if (order && refOk) {
    console.log(c.green('\n✓ PAIR VERIFIED — intent was pre-committed, execution followed and matches'));
    process.exit(0);
  } else {
    console.log(c.red('\n✗ PAIR VERIFICATION FAILED'));
    process.exit(4);
  }
}
