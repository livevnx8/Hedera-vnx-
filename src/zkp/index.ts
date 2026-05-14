/**
 * Zero-Knowledge Privacy Layer (ZKP) - Phase 7
 * 
 * Privacy-preserving transactions and computations using zk-SNARKs
 * on the Hedera network. Enables private token transfers, shielded
 * balances, and verifiable credentials without revealing sensitive data.
 */

export { 
  PrivateTransferManager,
  getPrivateTransferManager 
} from './privateTransfer.js';

export { 
  CircuitCompiler,
  getCircuitCompiler 
} from './circuitCompiler.js';

export { 
  ZKVerifier,
  getZKVerifier 
} from './zkVerifier.js';

export { 
  ShieldedAccount 
} from './shieldedAccount.js';

export type { 
  PrivateTx, 
  ZKProof, 
  CompiledCircuit, 
  ShieldedBalance,
  VerificationResult 
} from './types.js';
