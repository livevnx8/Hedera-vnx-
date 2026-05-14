/**
 * Basic tests for @vera/verify — runs against a live Vera server if available.
 * Skips gracefully if VERA_SERVER is unreachable.
 */

import assert from 'node:assert/strict';
import { canonicalize, sha256Hex, verifyProof } from '../src/index.mjs';

const server = process.env.VERA_SERVER || 'http://localhost:8080';

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`);
    failed++;
  }
};

console.log('\n@vera/verify — basic tests\n');

await test('canonicalize sorts object keys', () => {
  const a = canonicalize({ b: 1, a: 2 });
  const b = canonicalize({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1}');
});

await test('canonicalize handles nested + arrays', () => {
  const out = canonicalize({ z: [3, 1, { b: 2, a: 1 }], y: null });
  assert.equal(out, '{"y":null,"z":[3,1,{"a":1,"b":2}]}');
});

await test('sha256Hex is stable', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

await test('verifyProof rejects bad hash format', async () => {
  const r = await verifyProof({ hash: 'not-a-hash', server });
  assert.equal(r.verified, false);
  assert.equal(r.status, 'bad-hash');
});

await test('verifyProof rejects unknown network', async () => {
  const r = await verifyProof({ hash: 'a'.repeat(64), server, network: 'fakenet' });
  assert.equal(r.verified, false);
  assert.equal(r.status, 'bad-network');
});

// Live server tests — skip if unreachable
let liveServer = false;
try {
  const res = await fetch(`${server}/health`, { signal: AbortSignal.timeout(2000) });
  liveServer = res.ok;
} catch { /* skip */ }

if (liveServer) {
  await test('verifyProof handles not-found hash', async () => {
    const r = await verifyProof({ hash: 'f'.repeat(64), server });
    assert.equal(r.verified, false);
    assert.ok(['proof-not-found', 'not-submitted'].includes(r.status));
  });

  // Try to verify the most recent real proof end-to-end
  try {
    const list = await fetch(`${server}/api/vera/verify/list?limit=5`).then((r) => r.json());
    const onChain = (list.proofs || []).find((p) => p.sequenceNumber > 0);
    if (onChain) {
      await test(`verifyProof anchors real proof on-chain (seq=${onChain.sequenceNumber})`, async () => {
        const r = await verifyProof({ hash: onChain.hash, server });
        assert.equal(r.onChain, true, `expected onChain: got ${r.status}: ${r.error}`);
        assert.equal(r.mirrorHash, onChain.hash);
      });
    } else {
      console.log('  - skipping on-chain test (no submitted proofs)');
    }
  } catch (e) {
    console.log(`  - on-chain test skipped: ${e.message}`);
  }
} else {
  console.log('  - live-server tests skipped (no Vera at', server + ')');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
