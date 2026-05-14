/**
 * Vera Action Verifier
 *
 * Single entrypoint for Vera self-verification:
 * 1. Canonicalize action payload (stable JSON stringify)
 * 2. SHA-256 hash the payload
 * 3. ED25519 sign with operator key
 * 4. Submit to HCS (HIP-993 chunked) via hederaMaster
 * 5. Async: mirror-node round-trip verify, mark verified
 *
 * @module vera/verification/actionVerifier
 */

import { createHash } from 'crypto';
import { PrivateKey } from '@hashgraph/sdk';
import { EventEmitter } from 'events';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VeraAction {
  /** Action domain (e.g. 'tool-call', 'quantum-handshake', 'decision') */
  domain: string;
  /** Action type within the domain (e.g. 'hts_create_token') */
  type: string;
  /** Agent or subsystem that performed the action */
  actor: string;
  /** Canonical payload — must be JSON-serializable */
  payload: Record<string, unknown>;
  /** Optional result of the action */
  result?: unknown;
  /** Optional override for audit topic */
  topicId?: string;
}

export interface VerificationProof {
  /** SHA-256 of canonical payload (64 hex chars) */
  hash: string;
  /** ED25519 signature of hash (hex) */
  signature: string;
  /** HCS topic the proof was submitted to */
  topicId: string;
  /** HCS sequence number (first chunk) */
  sequenceNumber: number;
  /** Hedera transaction ID */
  transactionId: string;
  /** HashScan URL for human verification */
  hashscanUrl: string;
  /** Number of HIP-993 chunks used */
  chunks: number;
  /** Timestamp (ms) of submission */
  timestamp: number;
  /** True once mirror-node round-trip confirms */
  verified: boolean;
  /** Mirror-node consensus timestamp once confirmed */
  consensusTimestamp?: string;
  /** Error message if verification failed */
  error?: string;
}

// ─── Canonical Serialization ────────────────────────────────────────────────

/**
 * Deterministic JSON stringify — sorts object keys recursively so hash is stable.
 */
function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  // Drop undefined properties — they're lost in HCS round-trip anyway.
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]));
  return '{' + pairs.join(',') + '}';
}

// ─── Verifier ───────────────────────────────────────────────────────────────

export class ActionVerifier extends EventEmitter {
  private operatorKey: PrivateKey | null = null;
  private auditTopicId: string;
  private network: 'mainnet' | 'testnet';
  private proofCache = new Map<string, VerificationProof>();
  private stats = { submitted: 0, verified: 0, failed: 0 };

  constructor() {
    super();
    this.network = (config.HEDERA_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
    this.auditTopicId =
      process.env.VERA_COMPLIANCE_AUDIT_TOPIC_ID ||
      process.env.HCS_TOPIC_ID ||
      '';

    const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
    if (keyStr) {
      try {
        this.operatorKey =
          keyStr.length === 64
            ? (() => {
                try {
                  return PrivateKey.fromStringECDSA(keyStr);
                } catch {
                  return PrivateKey.fromStringED25519(keyStr);
                }
              })()
            : PrivateKey.fromString(keyStr);
      } catch (e) {
        logger.error('ActionVerifier', { message: 'Failed to load operator key', error: String(e) });
      }
    }

    if (!this.auditTopicId) {
      logger.warn('ActionVerifier', { message: 'No audit topic configured — verification will be local-only' });
    }
  }

  /**
   * Verify an action end-to-end.
   * Submits synchronously, mirror-node verification is async (non-blocking).
   */
  async verifyAction(action: VeraAction): Promise<VerificationProof> {
    const canonical = canonicalize({
      domain: action.domain,
      type: action.type,
      actor: action.actor,
      payload: action.payload,
      result: action.result,
    });

    const hash = createHash('sha256').update(canonical).digest('hex');

    const signature = this.operatorKey
      ? Buffer.from(this.operatorKey.sign(Buffer.from(hash, 'hex'))).toString('hex')
      : '';

    const topicId = action.topicId || this.auditTopicId;

    const proof: VerificationProof = {
      hash,
      signature,
      topicId,
      sequenceNumber: 0,
      transactionId: '',
      hashscanUrl: '',
      chunks: 0,
      timestamp: Date.now(),
      verified: false,
    };

    if (!topicId) {
      proof.error = 'No audit topic configured';
      this.stats.failed++;
      return proof;
    }

    try {
      const hip993Payload = {
        _hip993: {
          type: 'ACTION_VERIFICATION',
          version: '1.0.0',
          max_chunk_size: 4096,
          features: ['canonical_hash', 'operator_signature', 'mirror_verify'],
          timestamp: proof.timestamp,
          domain: action.domain,
        },
        data: {
          domain: action.domain,
          type: action.type,
          actor: action.actor,
          hash,
          signature,
          payload: action.payload,
          result: action.result,
        },
      };

      const submit = await hederaMaster.submitMessage(topicId, hip993Payload, { maxChunkSize: 4096 });

      proof.sequenceNumber = submit.sequenceNumber;
      proof.transactionId = submit.transactionId;
      proof.chunks = submit.chunks;
      proof.hashscanUrl = `https://hashscan.io/${this.network}/topic/${topicId}`;

      this.stats.submitted++;
      this.proofCache.set(hash, proof);
      this.emit('submitted', proof);

      // Async mirror-node round-trip (non-blocking)
      this.scheduleMirrorVerify(proof).catch((e) =>
        logger.debug('ActionVerifier', { message: 'Mirror verify errored', error: String(e) })
      );

      return proof;
    } catch (err) {
      this.stats.failed++;
      proof.error = err instanceof Error ? err.message : String(err);
      // Cache the (failed) proof anyway so it's retrievable — local hash+sig are still valid
      this.proofCache.set(hash, proof);
      logger.warn('ActionVerifier', {
        message: 'HCS submission failed',
        hash,
        error: proof.error,
      });
      this.emit('failed', proof);
      return proof;
    }
  }

  /**
   * Look up a proof by hash (cache only; mirror for persistence).
   */
  getProof(hash: string): VerificationProof | undefined {
    return this.proofCache.get(hash);
  }

  /**
   * Mirror-node round-trip: fetch the message back, confirm hash matches.
   */
  private async scheduleMirrorVerify(proof: VerificationProof): Promise<void> {
    // Wait for mirror node propagation (typically 2-5s)
    await new Promise((r) => setTimeout(r, 5000));

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await hederaMaster.queryMirrorNode(
          `/api/v1/topics/${proof.topicId}/messages/${proof.sequenceNumber}`
        );
        if (data?.message) {
          const decoded = Buffer.from(data.message, 'base64').toString('utf8');
          const outer = JSON.parse(decoded);
          // hederaMaster wraps our payload: outer.data is a stringified inner JSON
          const inner = typeof outer?.data === 'string' ? JSON.parse(outer.data) : outer;
          const mirrorHash = inner?.data?.hash ?? inner?.hash;
          if (mirrorHash === proof.hash) {
            proof.verified = true;
            proof.consensusTimestamp = data.consensus_timestamp;
            this.stats.verified++;
            this.emit('verified', proof);
            return;
          }
          proof.error = `Hash mismatch: local=${proof.hash} mirror=${mirrorHash}`;
          this.emit('drift', proof);
          return;
        }
      } catch (e) {
        if (attempt === maxAttempts - 1) {
          proof.error = `Mirror verify failed: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }

  getStats() {
    return { ...this.stats, cached: this.proofCache.size, auditTopic: this.auditTopicId };
  }

  /**
   * Operator public key (hex DER) — used by external verifiers to validate signatures
   * without trusting this process.
   */
  getPublicKey(): { publicKey: string; accountId: string; network: string } | null {
    if (!this.operatorKey) return null;
    return {
      publicKey: this.operatorKey.publicKey.toStringRaw(),
      accountId: config.HEDERA_OPERATOR_ACCOUNT_ID,
      network: this.network,
    };
  }

  /**
   * List cached proofs (most recent first). Used by /api/vera/verify/list.
   */
  listProofs(limit = 50): VerificationProof[] {
    return Array.from(this.proofCache.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

export const actionVerifier = new ActionVerifier();
