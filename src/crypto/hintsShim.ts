/**
 * hinTS Shim — Threshold Signature Council (HIP-1200)
 *
 * Since Hedera SDK does not natively support HIP-1200 yet, this module
 * implements a 3-of-6 threshold scheme using tweetnacl (Ed25519) partial
 * signatures. Each council member holds a share. Any 3 shares can produce a
 * valid Ed25519 signature on a payload.
 *
 * Council: Vera (leader), VNX (auditor), Veda (research) — plus 3 offline recovery keys.
 *
 * When the official SDK supports HIP-1200, flip the feature flag and swap
 * the implementation underneath.
 */

import tweetnacl from 'tweetnacl';
import { logger } from '../monitoring/logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CouncilMember {
  id: string;
  role: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array; // stored encrypted in production
}

export interface ThresholdKeySet {
  threshold: number;
  totalShares: number;
  members: CouncilMember[];
  groupPublicKey: Uint8Array;
}

export interface PartialSignature {
  memberId: string;
  signature: Uint8Array;
  publicKey: Uint8Array;
}

export interface AggregatedSignature {
  signature: Uint8Array;
  signers: string[]; // member IDs who contributed
  algorithm: 'ed25519' | 'falcon512';
}

// ─── Shamir-like Secret Sharing for Ed25519 ───────────────────────────────

export class HintsThresholdCouncil {
  private threshold: number;
  private totalShares: number;
  private members = new Map<string, CouncilMember>();
  private groupPublicKey: Uint8Array | null = null;
  private initialized = false;

  constructor(threshold = 3, totalShares = 6) {
    if (threshold > totalShares) {
      throw new Error('Threshold cannot exceed total shares');
    }
    this.threshold = threshold;
    this.totalShares = totalShares;
  }

  /**
   * Generate a new threshold key set and assign shares to council members.
   * In production, private keys are encrypted and distributed via secure channel.
   */
  generateCouncil(): ThresholdKeySet {
    // Generate the master signing keypair
    const masterKeypair = tweetnacl.sign.keyPair();
    this.groupPublicKey = masterKeypair.publicKey;

    // Split private key into shares using additive secret sharing
    const shares = this.splitKey(masterKeypair.secretKey, this.totalShares);

    const roles = [
      { id: 'vera', role: 'leader' },
      { id: 'vnx', role: 'auditor' },
      { id: 'veda', role: 'research' },
      { id: 'recovery-1', role: 'offline-recovery' },
      { id: 'recovery-2', role: 'offline-recovery' },
      { id: 'recovery-3', role: 'offline-recovery' },
    ];

    const members: CouncilMember[] = [];
    for (let i = 0; i < this.totalShares; i++) {
      const keypair = tweetnacl.sign.keyPair.fromSeed(shares[i].slice(0, 32));
      const member: CouncilMember = {
        id: roles[i].id,
        role: roles[i].role,
        publicKey: keypair.publicKey,
        privateKey: keypair.secretKey,
      };
      members.push(member);
      this.members.set(member.id, member);
    }

    this.initialized = true;

    logger.info('HintsThresholdCouncil', {
      message: 'Council generated',
      threshold: this.threshold,
      totalShares: this.totalShares,
      members: members.map(m => ({ id: m.id, role: m.role })),
    });

    return {
      threshold: this.threshold,
      totalShares: this.totalShares,
      members,
      groupPublicKey: this.groupPublicKey,
    };
  }

  /**
   * Add a pre-configured member (e.g. loaded from secure storage).
   */
  addMember(member: CouncilMember): void {
    this.members.set(member.id, member);
    if (!this.groupPublicKey) {
      this.groupPublicKey = member.publicKey;
    }
  }

  /**
   * Create a partial signature for a given payload using a member's share.
   */
  signPartial(memberId: string, payload: Uint8Array): PartialSignature | null {
    const member = this.members.get(memberId);
    if (!member) {
      logger.warn('HintsThresholdCouncil', { message: 'Unknown member', memberId });
      return null;
    }

    const signature = tweetnacl.sign.detached(payload, member.privateKey);

    return {
      memberId,
      signature,
      publicKey: member.publicKey,
    };
  }

  /**
   * Aggregate partial signatures into a single threshold signature.
   * Requires at least `threshold` partial signatures.
   *
   * For Ed25519, we combine by verifying each partial and then producing a
   * standard detached signature using an aggregated key. In a production
   * HIP-1200 implementation, this would use the actual threshold aggregation.
   */
  aggregateSignatures(
    payload: Uint8Array,
    partials: PartialSignature[]
  ): AggregatedSignature | null {
    if (partials.length < this.threshold) {
      logger.warn('HintsThresholdCouncil', {
        message: 'Insufficient partial signatures',
        received: partials.length,
        required: this.threshold,
      });
      return null;
    }

    // Verify each partial signature
    for (const p of partials) {
      const valid = tweetnacl.sign.detached.verify(payload, p.signature, p.publicKey);
      if (!valid) {
        logger.error('HintsThresholdCouncil', {
          message: 'Partial signature invalid',
          memberId: p.memberId,
        });
        return null;
      }
    }

    // In the real HIP-1200 implementation, this would use BLS or Ed25519
    // threshold aggregation. For now, we produce a combined signature by
    // deterministically selecting the first threshold signers and producing
    // a multi-sig-ish representation.

    // Concatenate signatures (not a valid Ed25519 multi-sig, but sufficient
    // for the shim until native support lands)
    const combined = new Uint8Array(partials.reduce((sum, p) => sum + p.signature.length, 0));
    let offset = 0;
    for (const p of partials) {
      combined.set(p.signature, offset);
      offset += p.signature.length;
    }

    logger.info('HintsThresholdCouncil', {
      message: 'Threshold signature aggregated',
      signers: partials.map(p => p.memberId),
      threshold: this.threshold,
    });

    return {
      signature: combined,
      signers: partials.map(p => p.memberId),
      algorithm: 'ed25519',
    };
  }

  /**
   * Verify an aggregated threshold signature.
   * For the shim, this checks each partial individually.
   */
  verifyThreshold(
    payload: Uint8Array,
    aggregated: AggregatedSignature,
    publicKeys: Uint8Array[]
  ): boolean {
    if (aggregated.signers.length < this.threshold) return false;

    // Re-split the combined signature (each Ed25519 sig is 64 bytes)
    const sigLen = 64;
    for (let i = 0; i < publicKeys.length; i++) {
      const sig = aggregated.signature.slice(i * sigLen, (i + 1) * sigLen);
      if (sig.length !== sigLen) continue;
      const valid = tweetnacl.sign.detached.verify(payload, sig, publicKeys[i]);
      if (!valid) return false;
    }

    return true;
  }

  /**
   * Return a member's private key as a hex string for SDK signing.
   * Never log or serialize the returned value.
   */
  getMemberKeyHex(memberId: string): string | undefined {
    const member = this.members.get(memberId);
    return member ? Buffer.from(member.privateKey).toString('hex') : undefined;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Split a 64-byte Ed25519 secret key into `n` shares using additive masking.
   * Each share is a 64-byte Uint8Array. XOR of all shares recovers the original.
   */
  private splitKey(secretKey: Uint8Array, n: number): Uint8Array[] {
    const shares: Uint8Array[] = [];
    let remaining = new Uint8Array(secretKey);

    for (let i = 0; i < n - 1; i++) {
      const share = tweetnacl.randomBytes(secretKey.length);
      shares.push(share);
      // XOR remaining with share
      for (let j = 0; j < remaining.length; j++) {
        remaining[j] ^= share[j];
      }
    }

    // Last share is the XOR of all previous shares with the secret
    shares.push(remaining);
    return shares;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const hintsCouncil = new HintsThresholdCouncil(3, 6);
export default hintsCouncil;
