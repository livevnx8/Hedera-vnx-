/**
 * DID Type Definitions
 */

export interface DIDDocument {
  id: string; // did:hedera:mainnet:0.0.123...
  controller: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  keyAgreement: string[];
  capabilityInvocation: string[];
  capabilityDelegation: string[];
  service: ServiceEndpoint[];
  created: number;
  updated: number;
  versionId: string;
}

export interface VerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020' | 'EcdsaSecp256k1VerificationKey2019';
  controller: string;
  publicKeyMultibase: string;
  revoked?: number;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubject;
  proof: CredentialProof;
  status?: RevocationStatus;
}

export interface CredentialSubject {
  id: string;
  [key: string]: unknown;
}

export interface CredentialProof {
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
  jws: string; // JSON Web Signature
  challenge?: string;
}

export interface TrustRelationship {
  source: string;
  target: string;
  type: 'issued' | 'verified' | 'endorsed' | 'delegated';
  credentialId?: string;
  timestamp: number;
  confidence: number;
  expires?: number;
}

export interface RevocationStatus {
  id: string;
  type: 'RevocationList2021Status' | 'BitstringStatusListEntry';
  statusListIndex: string;
  statusListCredential: string;
  revoked: boolean;
  revokedAt?: number;
  reason?: string;
}

export interface VerificationResult {
  valid: boolean;
  didResolved: boolean;
  signatureValid: boolean;
  notExpired: boolean;
  notRevoked: boolean;
  trustScore: number;
  errors: string[];
  verifiedAt: number;
}
