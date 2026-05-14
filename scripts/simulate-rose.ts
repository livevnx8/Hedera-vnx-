/**
 * simulate-rose.ts
 *
 * 🌹 Rose Over Waterfall — Hedera Simulation
 *
 * Encodes a creative scene as real on-chain events:
 *   - 2 HBAR microtransfers  → rose petal weight floating downstream
 *   - 3 HCS consensus messages → scene description, moonlight effect, moon object
 *
 * Run:
 *   npx tsx scripts/simulate-rose.ts
 *
 * Prerequisites in .env:
 *   HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxxxx
 *   HEDERA_OPERATOR_PRIVATE_KEY=302e...
 *   TREASURY_ACCOUNT_ID=0.0.yyyyy   (receiver of petal transfers)
 *   HCS_TOPIC_ID=0.0.zzzzz          (topic to post scene messages to)
 *   HEDERA_NETWORK=mainnet           (or testnet)
 */

import 'dotenv/config';
import { transferHbar } from '../src/hedera/hederaTxTools.js';
import { sendHcsMessage } from '../src/hedera/hederaTxTools.js';
import { config } from '../src/config.js';

// ── Preflight check ──────────────────────────────────────────────────────────

function checkConfig(): boolean {
  const missing: string[] = [];
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) missing.push('HEDERA_OPERATOR_ACCOUNT_ID');
  if (!config.HEDERA_OPERATOR_PRIVATE_KEY) missing.push('HEDERA_OPERATOR_PRIVATE_KEY');
  if (!config.TREASURY_ACCOUNT_ID)        missing.push('TREASURY_ACCOUNT_ID');
  if (!config.HCS_TOPIC_ID)               missing.push('HCS_TOPIC_ID');

  if (missing.length > 0) {
    console.error('\n❌  Missing required .env values:\n');
    missing.forEach(k => console.error(`   ${k}=`));
    console.error('\nFill these in .env and re-run.\n');
    return false;
  }
  return true;
}

// ── Scene data ───────────────────────────────────────────────────────────────

const PETALS = [
  { label: 'Petal 1 — first to touch the water', amount: 0.0001, memo: '🌹 Rose Sim: Petal 1 weight' },
  { label: 'Petal 2 — drifting downstream',       amount: 0.0001, memo: '🌹 Rose Sim: Petal 2 weight' },
];

const SCENE_MESSAGES = [
  {
    label: 'Rose Object',
    payload: {
      type: 1,
      content: {
        id: 'RoseFloatingOverWaterfall',
        name: 'Rose',
        description: 'A delicate rose floating over a cascading waterfall.',
        position: { x: 0.5, y: 0.5, z: 0.5 },
        size: { width: 0.01, height: 0.01, depth: 0.01 },
        color: { r: 0.9, g: 0.2, b: 0.2, a: 1.0 },
        texture: 'rose_texture.png',
      },
    },
  },
  {
    label: 'Moonlight Effect',
    payload: {
      type: 2,
      content: {
        id: 'MoonlightIlluminatingRose',
        description: 'Crescent moonlight gently illuminates the rose.',
        position: { x: 0.5, y: 0.5, z: 0.5 },
        color: { r: 0.7, g: 0.7, b: 0.9, a: 0.7 },
        intensity: 0.5,
        duration_s: 10,
      },
    },
  },
  {
    label: 'Crescent Moon',
    payload: {
      type: 3,
      content: {
        id: 'CrescentMoon',
        name: 'Moon',
        description: 'A glowing crescent moon hanging in the night sky.',
        position: { x: 0.8, y: 0.9, z: 0.0 },
        color: { r: 1.0, g: 1.0, b: 0.85, a: 1.0 },
        intensity: 0.8,
      },
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function explorerUrl(txId: string): string {
  const net = config.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/transaction/${txId}`;
}

function sep(char = '─', len = 60) { return char.repeat(len); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function simulateScene() {
  if (!checkConfig()) process.exit(1);

  console.log(`\n${sep('═')}`);
  console.log('  🌹  Rose Over Waterfall  ·  Hedera On-Chain Simulation');
  console.log(`  Network : ${config.HEDERA_NETWORK}`);
  console.log(`  Operator: ${config.HEDERA_OPERATOR_ACCOUNT_ID}`);
  console.log(`  Receiver: ${config.TREASURY_ACCOUNT_ID}`);
  console.log(`  Topic   : ${config.HCS_TOPIC_ID}`);
  console.log(sep('═'));

  // ── Step 1: HBAR petal transfers ─────────────────────────────────────────
  console.log('\n🌊  Step 1 — HBAR Microtransfers (petal weight)');
  console.log(sep());

  for (const petal of PETALS) {
    process.stdout.write(`  ↳ ${petal.label} … `);
    const result = await transferHbar({
      toAccountId: config.TREASURY_ACCOUNT_ID!,
      amountHbar: petal.amount,
      memo: petal.memo,
    });
    console.log(`${result.status}`);
    console.log(`     tx: ${result.txId}`);
    console.log(`     🔗 ${explorerUrl(result.txId)}`);
  }

  // ── Step 2 & 3: HCS scene messages ───────────────────────────────────────
  console.log('\n📜  Step 2 — HCS Scene Messages (description + effects)');
  console.log(sep());

  for (const scene of SCENE_MESSAGES) {
    process.stdout.write(`  ↳ ${scene.label} … `);
    const result = await sendHcsMessage({
      topicId: config.HCS_TOPIC_ID!,
      message: JSON.stringify(scene.payload),
    });
    console.log(`${result.status}  (seq #${result.sequenceNumber})`);
    console.log(`     tx: ${result.txId}`);
    console.log(`     🔗 ${explorerUrl(result.txId)}`);
  }

  console.log(`\n${sep('═')}`);
  console.log('  🌑  Simulation complete — the rose is immortalised on-chain.');
  console.log(sep('═'));
  console.log(`\n  View the full topic stream:`);
  console.log(`  https://hashscan.io/${config.HEDERA_NETWORK}/topic/${config.HCS_TOPIC_ID}\n`);
}

simulateScene().catch(err => {
  console.error('\n❌  Simulation failed:', err.message ?? err);
  process.exit(1);
});
