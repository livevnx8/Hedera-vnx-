#!/usr/bin/env node
/**
 * Vera Capability Verification Smoke Test
 *
 * Calls every verification endpoint against a running Vera server and
 * confirms the full HIP-991 + HIP-993 + actionVerifier + capabilityRegistry
 * pipeline is wired end-to-end.
 *
 * Usage:
 *   node scripts/verify-vera-capabilities.mjs [BASE_URL]
 *
 * Defaults to http://localhost:8080
 */

const BASE = process.argv[2] || 'http://localhost:8080';

const results = [];

async function hit(label, method, path, body) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    const ok = res.ok;
    results.push({ label, ok, status: res.status, url, sample: summarize(json) });
    return { ok, json };
  } catch (e) {
    results.push({ label, ok: false, status: 0, url, error: String(e) });
    return { ok: false, json: null };
  }
}

function summarize(j) {
  if (!j || typeof j !== 'object') return j;
  const out = {};
  for (const k of ['hash', 'topicId', 'sequenceNumber', 'transactionId', 'hashscanUrl', 'verified', 'toolCount', 'memo', 'hip991']) {
    if (k in j) out[k] = j[k];
  }
  if (j.proof) out.proof = summarize(j.proof);
  if (j.manifest) out.manifest = { toolCount: j.manifest.toolCount, hash: j.manifest.hash };
  return out;
}

(async () => {
  console.log(`🔎 Vera Capability Verification → ${BASE}\n`);

  // 1. Capabilities proof (also publishes to HCS on first call)
  const caps = await hit('GET capabilities proof', 'GET', '/api/vera/capabilities/proof');

  // 2. Generic verify (harmless test payload)
  const ver = await hit('POST verify (test)', 'POST', '/api/vera/verify', {
    domain: 'smoke-test',
    type: 'capability-check',
    actor: 'verify-script',
    payload: { test: true, ts: Date.now() },
  });

  // 3. Look up that proof by hash
  if (ver.json?.hash) {
    await hit('GET verify by hash', 'GET', `/api/vera/verify/${ver.json.hash}`);
  }

  // 4. Verifier stats
  await hit('GET verify stats', 'GET', '/api/vera/verify/stats');

  // 5. Inspect an existing audit topic
  const auditTopic = process.env.VERA_COMPLIANCE_AUDIT_TOPIC_ID || '0.0.10416198';
  await hit('GET hip991 topic info', 'GET', `/api/vera/hip991/topic/${auditTopic}`);

  // 6. Quantum handshake (existing)
  await hit('POST quantum handshake', 'POST', '/api/vera/quantum/handshake', {
    initiatorId: 'node-alpha',
    responderId: 'node-beta',
    purpose: 'smoke-test',
  });

  // 7. Generate a few tool calls so learning/adaptation has data
  for (const body of [
    { tool: 'hedera_get_balance', args: { account_id: '0.0.10294360' } },
    { tool: 'hedera_get_account_info', args: { account_id: '0.0.10294360' } },
    { tool: 'hedera_search_tokens', args: { query: 'HBAR' } },
  ]) {
    await hit(`POST /agent/tool ${body.tool}`, 'POST', '/agent/tool', body);
  }

  // 8. Flush + tick adaptation so data is visible
  await hit('POST learning flush', 'POST', '/api/vera/learning/flush');
  await hit('POST adaptation tick', 'POST', '/api/vera/adaptation/tick');

  // 9. Learning stats
  await hit('GET learning status', 'GET', '/api/vera/learning/status');

  // 10. Adaptation views
  await hit('GET adaptation weights', 'GET', '/api/vera/adaptation/weights');
  await hit('GET adaptation lattice', 'GET', '/api/vera/adaptation/lattice');

  // 11. Vera picks her best tool (proves the wire is closed)
  await hit('POST adaptation pick', 'POST', '/api/vera/adaptation/pick', {
    candidates: ['hedera_get_balance', 'hedera_search_tokens', 'hedera_get_account_info'],
  });

  // 12. Unified self-portrait
  await hit('GET vera self', 'GET', '/api/vera/self');

  // ─── Report ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Results:\n');
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} ${r.label}  [${r.status}]`);
    if (r.sample) console.log('   ', JSON.stringify(r.sample));
    if (r.error) console.log('   ', r.error);
  }

  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n📊 ${pass}/${results.length} checks passed`);
  process.exit(fail > 0 ? 1 : 0);
})();
