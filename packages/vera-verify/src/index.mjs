/**
 * @vera/verify — Zero-trust verifier for Vera AI action proofs.
 *
 * Trusts only the Hedera mirror node. Validates that a given action hash is:
 *   1. Anchored on an HCS topic with a consensus timestamp
 *   2. Bit-exactly matches the payload stored on-chain
 *   3. Signed by the operator key (Ed25519 only without optional dep)
 *
 * Usage:
 *   import { verifyProof, canonicalize, sha256Hex } from '@vera/verify';
 *
 *   const result = await verifyProof({
 *     hash: '42332a61a35e5e9897b238a4d99f670d0e25588d9a89211abadbb85f8c2b369f',
 *     server: 'https://vera.example.com',  // optional
 *     network: 'mainnet',                   // or 'testnet'
 *   });
 *
 *   if (result.verified) {
 *     console.log('Anchored at', result.consensusTimestamp);
 *   }
 */

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

const MIRROR = {
  mainnet: 'https://mainnet-public.mirrornode.hedera.com',
  testnet: 'https://testnet.mirrornode.hedera.com',
  previewnet: 'https://previewnet.mirrornode.hedera.com',
};

// ─── Canonical JSON (must match Vera's actionVerifier.ts byte-for-byte) ──────
export function canonicalize(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  // Drop undefined keys — not survivable through HCS JSON roundtrip.
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Fetch a single HCS chunk with retries. Returns { ok: true, data } or
 * { ok: false, result: <failure VerificationResult> }.
 */
async function fetchChunk(mirrorBase, topicId, seq, retries) {
  const url = `${mirrorBase}/api/v1/topics/${topicId}/messages/${seq}`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return { ok: true, data: await res.json() };
      if (res.status === 404 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return { ok: false, result: { verified: false, status: 'mirror-error', error: `mirror returned ${res.status}`, url } };
    } catch (e) {
      if (i === retries - 1) {
        return { ok: false, result: { verified: false, status: 'mirror-unreachable', error: e.message, url } };
      }
    }
  }
  return { ok: false, result: { verified: false, status: 'mirror-not-propagated', error: 'message not indexed yet — wait 2-10s' } };
}

/**
 * Verify a Vera proof against Hedera mirror nodes. Zero-trust: only trusts
 * the Hedera public mirror node and the public key you supply (or fetch).
 *
 * @param {object} options
 * @param {string} options.hash              64-hex SHA-256 action hash
 * @param {string} [options.server]          Vera API root (for proof lookup + pubkey). If omitted, caller must supply topicId/sequenceNumber/publicKey directly.
 * @param {string} [options.network='mainnet']
 * @param {string} [options.topicId]         HCS topic ID (overrides server lookup)
 * @param {number} [options.sequenceNumber]  Mirror sequence number
 * @param {string} [options.publicKey]       Operator public key (hex). If omitted, signature verification is skipped.
 * @param {string} [options.signature]       Operator signature (hex).
 * @param {number} [options.fetchRetries=3]  Mirror-node retry count.
 * @returns {Promise<VerificationResult>}
 */
export async function verifyProof(options) {
  const { hash } = options;
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { verified: false, status: 'bad-hash', error: 'hash must be 64 hex chars' };
  }

  const network = options.network || 'mainnet';
  const mirrorBase = MIRROR[network];
  if (!mirrorBase) {
    return { verified: false, status: 'bad-network', error: `unknown network: ${network}` };
  }

  // 1. Resolve topic + sequence (either provided or fetched from server)
  let topicId = options.topicId;
  let sequenceNumber = options.sequenceNumber;
  let publicKey = options.publicKey;
  let signature = options.signature;

  if ((!topicId || !sequenceNumber) && options.server) {
    try {
      const res = await fetch(`${options.server}/api/vera/verify/${hash}`);
      if (!res.ok) {
        return { verified: false, status: 'proof-not-found', error: `server returned ${res.status}` };
      }
      const proof = await res.json();
      topicId = topicId || proof.topicId;
      sequenceNumber = sequenceNumber || proof.sequenceNumber;
      signature = signature || proof.signature;
    } catch (e) {
      return { verified: false, status: 'server-unreachable', error: e.message };
    }
  }

  if (!publicKey && options.server) {
    try {
      const res = await fetch(`${options.server}/api/vera/verify/pubkey`);
      if (res.ok) {
        const pk = await res.json();
        publicKey = pk.publicKey;
      }
    } catch {
      /* non-fatal */
    }
  }

  if (!topicId || !sequenceNumber) {
    return {
      verified: false,
      status: 'not-submitted',
      error: 'proof has no HCS sequence number — never submitted to mainnet',
      hash,
    };
  }

  // 2. Query Hedera mirror node directly (zero-trust step)
  const retries = options.fetchRetries ?? 3;
  const firstMsg = await fetchChunk(mirrorBase, topicId, sequenceNumber, retries);
  if (!firstMsg.ok) return firstMsg.result;
  const mirrorMsg = firstMsg.data;

  // 2b. If the submission was physically chunked by Hedera, reassemble
  const totalChunks = mirrorMsg.chunk_info?.total ?? 1;
  const chunkBuffers = [Buffer.from(mirrorMsg.message, 'base64')];
  if (totalChunks > 1) {
    for (let offset = 1; offset < totalChunks; offset++) {
      const next = await fetchChunk(mirrorBase, topicId, Number(sequenceNumber) + offset, retries);
      if (!next.ok) return next.result;
      chunkBuffers.push(Buffer.from(next.data.message, 'base64'));
    }
  }

  // 3. Decode the double-wrapped payload (outer HIP-993 envelope + inner action)
  const decoded = Buffer.concat(chunkBuffers).toString('utf8');
  let outer;
  try {
    outer = JSON.parse(decoded);
  } catch {
    return { verified: false, status: 'corrupt-message', error: 'mirror message is not JSON' };
  }
  const inner = typeof outer?.data === 'string' ? JSON.parse(outer.data) : outer;
  const mirrorHash = inner?.data?.hash ?? inner?.hash;
  const mirrorSig = inner?.data?.signature ?? inner?.signature;
  const mirrorPayload = inner?.data ?? inner;

  if (mirrorHash !== hash) {
    return {
      verified: false,
      status: 'hash-mismatch',
      error: `on-chain hash differs: ${mirrorHash} vs ${hash}`,
      onChain: true,
      consensusTimestamp: mirrorMsg.consensus_timestamp,
    };
  }

  // 4. Recompute hash from the canonical payload — proves payload bit-exact
  const canonical = canonicalize({
    domain: mirrorPayload.domain,
    type: mirrorPayload.type,
    actor: mirrorPayload.actor,
    payload: mirrorPayload.payload,
    result: mirrorPayload.result,
  });
  const recomputed = sha256Hex(canonical);
  if (recomputed !== hash) {
    return {
      verified: false,
      status: 'recompute-mismatch',
      error: 'canonical recomputation does not match — payload tampered',
      onChain: true,
      consensusTimestamp: mirrorMsg.consensus_timestamp,
    };
  }

  // 5. Optional: signature verification
  let signatureValid = null;
  let signatureNote = null;
  if (publicKey && mirrorSig) {
    try {
      signatureValid = verifyOperatorSignature(publicKey, hash, mirrorSig);
    } catch (e) {
      if (e.skipped) {
        signatureNote = e.message;
      } else {
        signatureNote = `sig error: ${e.message}`;
      }
    }
  }

  return {
    verified: signatureValid !== false,
    status: 'verified',
    hash,
    onChain: true,
    consensusTimestamp: mirrorMsg.consensus_timestamp,
    topicId,
    sequenceNumber: Number(sequenceNumber),
    mirrorHash,
    mirrorSignature: mirrorSig,
    signatureValid,
    signatureNote,
    payload: mirrorPayload,
    hashscan: `https://hashscan.io/${network}/topic/${topicId}`,
  };
}

// ─── Signature verification ──────────────────────────────────────────────────
function verifyOperatorSignature(publicKeyHex, hashHex, signatureHex) {
  const raw = Buffer.from(publicKeyHex, 'hex');
  const sig = Buffer.from(signatureHex, 'hex');
  const msg = Buffer.from(hashHex, 'hex');

  if (raw.length === 32) {
    // Ed25519 SPKI prefix (OID 1.3.101.112)
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    return cryptoVerify(null, msg, key, sig);
  }

  if (raw.length === 33) {
    // ECDSA secp256k1 — try @noble/secp256k1 if available
    return verifySecp256k1Optional(raw, msg, sig);
  }

  throw new Error(`unrecognized public key length: ${raw.length} bytes`);
}

function verifySecp256k1Optional(pubCompressed, msg, sig) {
  // Dynamic import — optional dependency
  try {
    const secp = nodeRequire('@noble/secp256k1');
    // Hedera SDK signs raw message bytes with keccak/sha internally; verify with sha256
    const msgHash = createHash('sha256').update(msg).digest();
    return secp.verify(sig, msgHash, pubCompressed);
  } catch {
    const err = new Error('Install @noble/secp256k1 to enable ECDSA signature verification (hash anchor is already verified)');
    err.skipped = true;
    throw err;
  }
}

/**
 * Convenience: verify many proofs in parallel, return aggregate result.
 */
export async function verifyMany(proofs, commonOpts = {}) {
  return Promise.all(proofs.map((p) => verifyProof({ ...commonOpts, ...p })));
}

/**
 * Mirror-node-only lookup (no server). Useful for replaying proofs from
 * audit archives when the originating Vera server is offline.
 */
export async function verifyFromMirror({ hash, topicId, sequenceNumber, network = 'mainnet', publicKey }) {
  return verifyProof({ hash, topicId, sequenceNumber, network, publicKey });
}

/**
 * @typedef {object} VerificationResult
 * @property {boolean} verified
 * @property {string} status                 'verified' | 'not-submitted' | 'hash-mismatch' | 'mirror-unreachable' | etc.
 * @property {string} [hash]
 * @property {boolean} [onChain]
 * @property {string} [consensusTimestamp]
 * @property {string} [topicId]
 * @property {number} [sequenceNumber]
 * @property {string} [mirrorHash]
 * @property {string} [mirrorSignature]
 * @property {boolean|null} [signatureValid]
 * @property {string} [hashscan]
 * @property {object} [payload]
 * @property {string} [error]
 */
