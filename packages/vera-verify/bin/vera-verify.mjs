#!/usr/bin/env node
/**
 * vera-verify CLI — zero-trust verifier for Vera proofs.
 *
 *   npx @vera/verify <hash>
 *   npx @vera/verify <hash> --server https://vera.example.com
 *   npx @vera/verify <hash> --topic 0.0.10416198 --seq 1323
 *   npx @vera/verify --list --server http://localhost:8080
 */

import { verifyProof } from '../src/index.mjs';

const args = process.argv.slice(2);
const server = getFlag('--server') || process.env.VERA_SERVER || 'http://localhost:8080';
const network = getFlag('--network') || 'mainnet';
const topicId = getFlag('--topic');
const seq = getFlag('--seq');
const publicKey = getFlag('--pubkey');
const listMode = args.includes('--list');
const jsonMode = args.includes('--json');
const hash = args.find((a) => /^[a-f0-9]{64}$/i.test(a));

function getFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const c = {
  green: (s) => process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:   (s) => process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yel:   (s) => process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:  (s) => process.stdout.isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  bold:  (s) => process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:   (s) => process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
};

async function main() {
  if (listMode) return list();
  if (!hash) return usage();
  return runVerify(hash);
}

function usage() {
  console.log(`
${c.bold('vera-verify')} — zero-trust verifier for Vera AI proofs

Usage:
  vera-verify <hash> [options]
  vera-verify --list [--server URL]

Options:
  --server URL     Vera API base (default: $VERA_SERVER or http://localhost:8080)
  --network NET    mainnet | testnet | previewnet (default: mainnet)
  --topic ID       HCS topic ID (bypass server lookup)
  --seq N          Mirror sequence number (bypass server lookup)
  --pubkey HEX     Operator public key for signature check
  --json           Machine-readable JSON output
  --list           List recent proofs on server

Exit codes: 0=verified, 4=not-verified, 3=unreachable, 1=bad usage
`);
  process.exit(1);
}

async function list() {
  try {
    const res = await fetch(`${server}/api/vera/verify/list?limit=20`);
    if (!res.ok) {
      console.error(c.red('list endpoint unreachable:'), res.status);
      process.exit(3);
    }
    const { proofs = [] } = await res.json();
    if (jsonMode) {
      console.log(JSON.stringify(proofs, null, 2));
      return;
    }
    if (!proofs.length) {
      console.log(c.yel('no proofs cached on server yet'));
      return;
    }
    console.log(c.bold(`\nRecent proofs from ${server}\n`));
    for (const p of proofs) {
      const status = p.verified ? c.green('verified') : p.sequenceNumber ? c.yel('submitted') : c.red('local-only');
      console.log(`  ${c.dim(new Date(p.timestamp).toISOString())}  ${p.hash.slice(0, 16)}…  ${status}  seq=${p.sequenceNumber}`);
    }
    console.log();
  } catch (e) {
    console.error(c.red('error:'), e.message);
    process.exit(3);
  }
}

async function runVerify(h) {
  const result = await verifyProof({ hash: h, server, network, topicId, sequenceNumber: seq ? Number(seq) : undefined, publicKey });
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verified ? 0 : 4);
  }

  console.log(c.bold('\n→ vera-verify\n'));
  console.log(` ${c.dim('hash:')}     ${h}`);
  console.log(` ${c.dim('network:')}  ${network}`);
  console.log(` ${c.dim('status:')}   ${result.verified ? c.green(result.status) : c.red(result.status)}`);

  if (result.onChain) {
    console.log(` ${c.dim('consensus:')} ${c.cyan(result.consensusTimestamp)}`);
    console.log(` ${c.dim('topic:')}    ${result.topicId} ${c.dim('seq=' + result.sequenceNumber)}`);
    console.log(` ${c.dim('hashscan:')} ${c.cyan(result.hashscan)}`);
  }
  if (result.signatureValid === true) console.log(` ${c.dim('signature:')} ${c.green('valid')}`);
  if (result.signatureValid === false) console.log(` ${c.dim('signature:')} ${c.red('INVALID')}`);
  if (result.signatureNote) console.log(` ${c.dim('sig-note:')}  ${c.yel(result.signatureNote)}`);
  if (result.error) console.log(` ${c.dim('error:')}    ${c.red(result.error)}`);

  console.log();
  console.log(result.verified
    ? c.green('✓ VERIFIED') + ' — cryptographically anchored on Hedera ' + network
    : c.red('✗ NOT VERIFIED') + ' — ' + result.status
  );
  console.log();
  process.exit(result.verified ? 0 : 4);
}

main().catch((e) => {
  console.error(c.red('unexpected error:'), e.stack || e.message);
  process.exit(10);
});
