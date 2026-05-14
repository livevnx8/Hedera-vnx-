/**
 * Quantum-Resistant Security Types (Phase 17)
 * 
 * Type definitions for post-quantum cryptography (PQC).
 */

export type PQAlgorithm = 'kyber512' | 'kyber768' | 'kyber1024' | 'sphincs+-sha256-128s' | 'sphincs+-sha256-256s';

export interface KyberKeypair {
  publicKey: KyberPublicKey;
  secretKey: KyberSecretKey;
  algorithm: 'kyber512' | 'kyber768' | 'kyber1024';
}

export interface KyberPublicKey {
  key: Buffer;
  algorithm: string;
}

export interface KyberSecretKey {
  key: Buffer;
  algorithm: string;
}

export interface KyberCiphertext {
  ciphertext: Buffer;
  algorithm: string;
}

export interface SphincsKeypair {
  publicKey: SphincsPublicKey;
  secretKey: SphincsSecretKey;
  algorithm: 'sphincs+-sha256-128s' | 'sphincs+-sha256-256s';
}

export interface SphincsPublicKey {
  key: Buffer;
  algorithm: string;
}

export interface SphincsSecretKey {
  key: Buffer;
  algorithm: string;
}

export interface SphincsSignature {
  signature: Buffer;
  algorithm: string;
}

export interface HybridAccount {
  accountId: string;
  hederaAccount: string;
  ecdsaPublicKey: string;
  sphincsPublicKey: SphincsPublicKey;
  kyberPublicKey?: KyberPublicKey; // For encrypted communication
  createdAt: number;
  isQuantumSafe: boolean;
}

export interface HybridSignature {
  ecdsaSignature: string;
  sphincsSignature: SphincsSignature;
  timestamp: number;
}

export interface SealedData {
  ciphertext: Buffer;
  kyberCiphertext: KyberCiphertext;
  algorithm: string;
}

export interface MigrationResult {
  accountId: string;
  success: boolean;
  ecdsaKeyRetired: boolean;
  sphincsKeyActive: boolean;
  migrationTx: string;
  completedAt: number;
}
