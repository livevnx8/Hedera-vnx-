/**
 * Decentralized Identity & Trust (DID) - Phase 9
 * 
 * Self-sovereign identity using Hedera DID method,
 * verifiable credentials, and trust graph for agent verification.
 */

export {
  HederaDIDManager,
  getHederaDIDManager
} from './didManager.js';

export {
  VerifiableCredentialRegistry,
  getVerifiableCredentialRegistry
} from './vcRegistry.js';

export {
  TrustGraph,
  getTrustGraph
} from './trustGraph.js';

export {
  CredentialRevocation,
  getCredentialRevocation
} from './credentialRevocation.js';

export type {
  DIDDocument,
  VerifiableCredential,
  CredentialProof,
  TrustRelationship,
  RevocationStatus,
  VerificationResult
} from './types.js';
