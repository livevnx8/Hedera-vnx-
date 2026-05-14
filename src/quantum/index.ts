/**
 * Quantum-Resistant Security Module (Phase 17)
 * 
 * ML-KEM (Kyber) for key encapsulation and SLH-DSA (SPHINCS+) for signatures.
 * Hybrid cryptography combining classical + post-quantum.
 */

export {
  QuantumSafeCrypto,
  getQuantumSafeCrypto
} from './pqCrypto.js';

export {
  HybridWallet,
  getHybridWallet
} from './hybridWallet.js';

export type {
  KyberKeypair,
  KyberPublicKey,
  KyberSecretKey,
  KyberCiphertext,
  SphincsKeypair,
  SphincsPublicKey,
  SphincsSecretKey,
  SphincsSignature,
  HybridAccount,
  HybridSignature,
  SealedData,
  MigrationResult
} from './types.js';
