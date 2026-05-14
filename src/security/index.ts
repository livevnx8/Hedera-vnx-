/**
 * Vera Security Module - Unified Exports
 * 
 * TEE (Trusted Execution Environment), encryption, and audit
 * 
 * @module security
 */

// TEE
export {
  IntelSGXManager,
  AWSNitroManager,
  TEEManager,
  teeManager,
  type TeeType,
  type EnclaveConfig,
  type EnclaveInstance,
  type AttestationReport,
  type SealedData,
  type SealingPolicy,
} from './tee/enclaveManager.js';

// Re-export default
export { teeManager as default } from './tee/enclaveManager.js';
