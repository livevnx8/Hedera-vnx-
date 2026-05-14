/**
 * Secure Computation Enclaves (SCE) - Phase 11
 * 
 * Trusted Execution Environment (TEE) integration for
 * confidential computing with SGX/SEV support and
 * verifiable secure AI inference.
 */

export {
  EnclaveManager,
  getEnclaveManager
} from './enclaveManager.js';

export {
  ConfidentialAI,
  getConfidentialAI
} from './confidentialAI.js';

export type {
  EnclaveConfig,
  AttestationReport,
  ConfidentialTask,
  ComputationResult,
  ExecutionProof,
  MemoryEncryptionKey
} from './types.js';
