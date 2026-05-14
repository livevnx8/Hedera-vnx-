/**
 * Secure Computation Enclaves (SCE) - Type Definitions
 */

export interface EnclaveConfig {
  enclaveId: string;
  type: 'SGX' | 'SEV' | 'TPM' | 'SIMULATED';
  attestationReport: AttestationReport;
  memoryLimit: number; // MB
  cpuLimit: number; // cores
  allowedOperations: string[];
  trustedCA: string[];
}

export interface AttestationReport {
  quote: string;
  measurement: string;
  timestamp: number;
  signer: string;
  version: string;
  status: 'verified' | 'pending' | 'failed';
}

export interface ConfidentialTask {
  taskId: string;
  enclaveId: string;
  input: EncryptedInput;
  code: string; // WASM or encrypted code
  expectedOutputHash: string;
  maxExecutionTime: number; // seconds
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'queued' | 'executing' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface EncryptedInput {
  ciphertext: string;
  nonce: string;
  ephemPublicKey: string;
  encryptedKeys: string[];
}

export interface ComputationResult {
  taskId: string;
  output: string; // encrypted
  outputHash: string;
  proof: ExecutionProof;
  executionTime: number;
  memoryUsed: number;
  status: 'success' | 'failure';
  error?: string;
}

export interface ExecutionProof {
  enclaveId: string;
  measurement: string;
  log: string[];
  signature: string;
}

export interface MemoryEncryptionKey {
  keyId: string;
  key: string; // base64 encoded
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  createdAt: number;
  expiresAt: number;
}
