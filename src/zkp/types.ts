/**
 * ZKP Type Definitions
 */

export interface PrivateTx {
  txId: string;
  shieldedAmount: bigint;
  commitment: string;
  nullifier: string;
  merkleRoot: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface ZKProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  publicSignals: string[];
  protocol: 'groth16' | 'plonk';
}

export interface CompiledCircuit {
  r1cs: Buffer;
  wasm: Buffer;
  provingKey: Buffer;
  verificationKey: Buffer;
  circuitHash: string;
}

export interface ShieldedBalance {
  accountId: string;
  tokenId: string;
  encryptedBalance: string;
  commitment: string;
  lastUpdated: number;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  verificationTimeMs: number;
}
