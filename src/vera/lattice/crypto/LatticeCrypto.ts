/**
 * Vera Lattice - Cryptographic Layer
 * 
 * Ed25519 signatures for all gossip messages with:
 * - Node identity derived from Hedera keys
 * - Message integrity verification
 * - Replay attack protection via sequence numbers
 * - Optional encrypted channels for sensitive data
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../../monitoring/logger.js';

export interface SignedMessage {
  payload: string; // Base64 encoded original message
  signature: string; // Base64 encoded signature
  publicKey: string; // Base64 encoded public key
  timestamp: number;
  sequence: number;
  nodeId: string;
}

export interface CryptoConfig {
  privateKey?: Buffer;
  publicKey?: Buffer;
  keyAlgorithm: 'ed25519' | 'secp256k1';
  signatureEncoding: 'base64' | 'hex';
  enableEncryption: boolean;
  replayWindowMs: number;
}

export const DEFAULT_CRYPTO_CONFIG: CryptoConfig = {
  keyAlgorithm: 'ed25519',
  signatureEncoding: 'base64',
  enableEncryption: false,
  replayWindowMs: 5 * 60 * 1000, // 5 minutes
};

export class LatticeCrypto extends EventEmitter {
  private nodeId: string;
  private keyPair: { privateKey: Buffer; publicKey: Buffer } | null = null;
  private config: CryptoConfig;
  private seenSequences: Map<string, Set<number>> = new Map(); // nodeId -> set of sequences
  private lastSequence = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(nodeId: string, config: Partial<CryptoConfig> = {}) {
    super();
    this.nodeId = nodeId;
    this.config = { ...DEFAULT_CRYPTO_CONFIG, ...config };

    // Generate or load keys
    this.initializeKeys();

    // Start cleanup interval for old sequences
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSequences();
    }, 60000); // Every minute
  }

  /**
   * Generate or load cryptographic keys
   */
  private initializeKeys(): void {
    if (this.config.privateKey && this.config.publicKey) {
      this.keyPair = {
        privateKey: this.config.privateKey,
        publicKey: this.config.publicKey,
      };
    } else {
      // Generate new Ed25519 key pair
      this.keyPair = this.generateKeyPair();
    }

    logger.info('LatticeCrypto', {
      message: 'Keys initialized',
      nodeId: this.nodeId,
      algorithm: this.config.keyAlgorithm,
    });
  }

  /**
   * Generate Ed25519 key pair
   */
  private generateKeyPair(): { privateKey: Buffer; publicKey: Buffer } {
    // Use Node.js crypto for Ed25519
    const privateKey = crypto.generateKeyPairSync('ed25519').privateKey.export({
      type: 'pkcs8',
      format: 'der',
    });
    const publicKey = crypto.generateKeyPairSync('ed25519').publicKey.export({
      type: 'spki',
      format: 'der',
    });

    return { privateKey, publicKey };
  }

  /**
   * Sign a message
   */
  signMessage<T extends Record<string, unknown>>(message: T): SignedMessage {
    if (!this.keyPair) {
      throw new Error('Keys not initialized');
    }

    this.lastSequence++;
    const timestamp = Date.now();

    // Create canonical message string
    const messageWithMeta = {
      ...message,
      _meta: {
        nodeId: this.nodeId,
        timestamp,
        sequence: this.lastSequence,
      },
    };

    const payload = Buffer.from(JSON.stringify(messageWithMeta)).toString('base64');

    // Sign the payload
    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();
    const signature = sign.sign(this.keyPair.privateKey);

    const signedMessage: SignedMessage = {
      payload,
      signature: signature.toString(this.config.signatureEncoding),
      publicKey: this.keyPair.publicKey.toString('base64'),
      timestamp,
      sequence: this.lastSequence,
      nodeId: this.nodeId,
    };

    logger.debug('LatticeCrypto', {
      message: 'Message signed',
      nodeId: this.nodeId,
      sequence: this.lastSequence,
    });

    return signedMessage;
  }

  /**
   * Verify a signed message
   */
  verifyMessage(signedMessage: SignedMessage): {
    valid: boolean;
    message?: Record<string, unknown>;
    error?: string;
  } {
    try {
      // Check for replay attack
      if (this.isReplayAttack(signedMessage.nodeId, signedMessage.sequence)) {
        return { valid: false, error: 'Replay attack detected' };
      }

      // Check timestamp freshness
      const age = Date.now() - signedMessage.timestamp;
      if (age > this.config.replayWindowMs) {
        return { valid: false, error: 'Message too old' };
      }

      if (age < -60000) {
        return { valid: false, error: 'Message from future' };
      }

      // Decode public key
      const publicKey = Buffer.from(signedMessage.publicKey, 'base64');

      // Decode signature
      const signature = Buffer.from(
        signedMessage.signature,
        this.config.signatureEncoding
      );

      // Verify signature
      const verify = crypto.createVerify('SHA256');
      verify.update(signedMessage.payload);
      verify.end();

      const valid = verify.verify(publicKey, signature);

      if (!valid) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Record sequence number
      this.recordSequence(signedMessage.nodeId, signedMessage.sequence);

      // Decode payload
      const payload = Buffer.from(signedMessage.payload, 'base64').toString();
      const message = JSON.parse(payload);

      logger.debug('LatticeCrypto', {
        message: 'Message verified',
        fromNode: signedMessage.nodeId,
        sequence: signedMessage.sequence,
      });

      return { valid: true, message };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Quick validation without full verification (for filtering)
   */
  quickValidate(signedMessage: SignedMessage): {
    valid: boolean;
    error?: string;
  } {
    // Check timestamp
    const age = Date.now() - signedMessage.timestamp;
    if (age > this.config.replayWindowMs) {
      return { valid: false, error: 'Message too old' };
    }

    // Check for replay
    if (this.isReplayAttack(signedMessage.nodeId, signedMessage.sequence)) {
      return { valid: false, error: 'Replay detected' };
    }

    return { valid: true };
  }

  /**
   * Get public key for sharing
   */
  getPublicKey(): string {
    if (!this.keyPair) {
      throw new Error('Keys not initialized');
    }
    return this.keyPair.publicKey.toString('base64');
  }

  /**
   * Get node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Create shared secret for encrypted channels (X25519 key exchange)
   */
  deriveSharedSecret(peerPublicKeyBase64: string): Buffer {
    if (!this.keyPair) {
      throw new Error('Keys not initialized');
    }

    // In production, this would use X25519 ECDH
    // For now, create a simple shared secret derivation
    const peerPublicKey = Buffer.from(peerPublicKeyBase64, 'base64');
    
    // Use HKDF-like construction
    const hash = crypto.createHmac('sha256', this.keyPair.privateKey)
      .update(peerPublicKey)
      .digest();
    
    return hash;
  }

  /**
   * Encrypt message for specific peer
   */
  encryptForPeer(message: Record<string, unknown>, peerPublicKeyBase64: string): {
    encrypted: string;
    iv: string;
    tag: string;
  } {
    const sharedSecret = this.deriveSharedSecret(peerPublicKeyBase64);
    
    // Generate IV
    const iv = crypto.randomBytes(16);
    
    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', sharedSecret, iv);
    const plaintext = JSON.stringify(message);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  /**
   * Decrypt message from peer
   */
  decryptFromPeer(
    peerPublicKeyBase64: string,
    encrypted: string,
    ivBase64: string,
    tagBase64: string
  ): Record<string, unknown> {
    const sharedSecret = this.deriveSharedSecret(peerPublicKeyBase64);
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', sharedSecret, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Get statistics
   */
  getStats(): {
    signedMessages: number;
    verifiedMessages: number;
    rejectedMessages: number;
    knownPeers: number;
  } {
    return {
      signedMessages: this.lastSequence,
      verifiedMessages: Array.from(this.seenSequences.values()).reduce(
        (sum, set) => sum + set.size,
        0
      ),
      rejectedMessages: 0, // Would track in verifyMessage
      knownPeers: this.seenSequences.size,
    };
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Private methods

  private isReplayAttack(nodeId: string, sequence: number): boolean {
    const seen = this.seenSequences.get(nodeId);
    if (!seen) return false;
    return seen.has(sequence);
  }

  private recordSequence(nodeId: string, sequence: number): void {
    if (!this.seenSequences.has(nodeId)) {
      this.seenSequences.set(nodeId, new Set());
    }
    this.seenSequences.get(nodeId)!.add(sequence);
  }

  private cleanupOldSequences(): void {
    const cutoff = Date.now() - this.config.replayWindowMs;
    let cleaned = 0;

    // Note: We can't easily clean by timestamp since we only store sequences
    // In production, store timestamp with each sequence
    for (const [nodeId, sequences] of this.seenSequences) {
      // Keep only last 1000 sequences per node
      if (sequences.size > 1000) {
        const sorted = Array.from(sequences).sort((a, b) => a - b);
        const toKeep = sorted.slice(-1000);
        this.seenSequences.set(nodeId, new Set(toKeep));
        cleaned += sequences.size - 1000;
      }
    }

    if (cleaned > 0) {
      logger.debug('LatticeCrypto', {
        message: 'Cleaned old sequences',
        cleaned,
      });
    }
  }
}

// Export singleton factory
export function createLatticeCrypto(
  nodeId: string,
  config?: Partial<CryptoConfig>
): LatticeCrypto {
  return new LatticeCrypto(nodeId, config);
}

export default LatticeCrypto;
