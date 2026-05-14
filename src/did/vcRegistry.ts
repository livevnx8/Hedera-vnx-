/**
 * Verifiable Credential Registry
 * 
 * Issues, stores, and verifies W3C Verifiable Credentials
 * using Hedera for timestamping and proof anchoring.
 */

import { logger } from '../monitoring/logger.js';
import type { VerifiableCredential, CredentialSubject, CredentialProof, VerificationResult } from './types.js';

interface VCConfig {
  defaultExpiryDays: number;
  proofType: string;
  hcsTopicId?: string;
}

interface CredentialTemplate {
  type: string;
  requiredFields: string[];
  issuerDID: string;
}

export class VerifiableCredentialRegistry {
  private config: VCConfig;
  private credentials: Map<string, VerifiableCredential> = new Map();
  private issuedCredentials: Map<string, string[]> = new Map(); // issuer -> credential IDs
  private holderCredentials: Map<string, string[]> = new Map(); // holder -> credential IDs
  private templates: Map<string, CredentialTemplate> = new Map();

  constructor(config: Partial<VCConfig> = {}) {
    this.config = {
      defaultExpiryDays: 365,
      proofType: 'Ed25519Signature2020',
      ...config
    };
  }

  /**
   * Register a credential template
   */
  registerTemplate(template: CredentialTemplate): void {
    this.templates.set(template.type, template);
    logger.info('VerifiableCredentialRegistry', {
      message: 'Template registered',
      type: template.type
    });
  }

  /**
   * Issue a new verifiable credential
   */
  async issueCredential(
    issuerDID: string,
    holderDID: string,
    type: string,
    claims: Record<string, unknown>,
    options: {
      expiryDays?: number;
      proof?: string;
    } = {}
  ): Promise<VerifiableCredential> {
    try {
      // Validate template
      const template = this.templates.get(type);
      if (template) {
        for (const field of template.requiredFields) {
          if (!(field in claims)) {
            throw new Error(`Missing required field: ${field}`);
          }
        }
      }

      const now = new Date();
      const expiryDays = options.expiryDays || this.config.defaultExpiryDays;
      const expiry = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

      const credentialId = `urn:uuid:${this.generateUUID()}`;

      const credential: VerifiableCredential = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        id: credentialId,
        type: ['VerifiableCredential', type],
        issuer: issuerDID,
        issuanceDate: now.toISOString(),
        expirationDate: expiry.toISOString(),
        credentialSubject: {
          id: holderDID,
          ...claims
        },
        proof: await this.createProof(credentialId, issuerDID, options.proof)
      };

      // Store credential
      this.credentials.set(credentialId, credential);

      // Track by issuer
      if (!this.issuedCredentials.has(issuerDID)) {
        this.issuedCredentials.set(issuerDID, []);
      }
      this.issuedCredentials.get(issuerDID)!.push(credentialId);

      // Track by holder
      if (!this.holderCredentials.has(holderDID)) {
        this.holderCredentials.set(holderDID, []);
      }
      this.holderCredentials.get(holderDID)!.push(credentialId);

      // Anchor to Hedera (mock)
      await this.anchorToHedera(credential);

      logger.info('VerifiableCredentialRegistry', {
        message: 'Credential issued',
        credentialId,
        issuer: issuerDID,
        holder: holderDID,
        type
      });

      return credential;

    } catch (error) {
      logger.error('VerifiableCredentialRegistry', {
        message: 'Credential issuance failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Verify a credential
   */
  async verifyCredential(credentialId: string): Promise<VerificationResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      const credential = this.credentials.get(credentialId);
      if (!credential) {
        return {
          valid: false,
          didResolved: false,
          signatureValid: false,
          notExpired: false,
          notRevoked: false,
          trustScore: 0,
          errors: ['Credential not found'],
          verifiedAt: startTime
        };
      }

      // Check expiration
      const now = new Date();
      const expiry = new Date(credential.expirationDate || '2099-12-31');
      const notExpired = now <= expiry;
      if (!notExpired) {
        errors.push('Credential has expired');
      }

      // Verify signature (mock)
      const signatureValid = await this.verifyProof(credential.proof);
      if (!signatureValid) {
        errors.push('Invalid signature');
      }

      // Check revocation (mock - would check revocation list)
      const notRevoked = true;

      // Calculate trust score based on issuer reputation
      const trustScore = await this.calculateTrustScore(credential.issuer);

      const valid = notExpired && signatureValid && notRevoked;

      return {
        valid,
        didResolved: true,
        signatureValid,
        notExpired,
        notRevoked,
        trustScore,
        errors,
        verifiedAt: Date.now()
      };

    } catch (error) {
      return {
        valid: false,
        didResolved: false,
        signatureValid: false,
        notExpired: false,
        notRevoked: false,
        trustScore: 0,
        errors: [error instanceof Error ? error.message : 'Verification failed'],
        verifiedAt: startTime
      };
    }
  }

  /**
   * Get credential by ID
   */
  getCredential(credentialId: string): VerifiableCredential | undefined {
    return this.credentials.get(credentialId);
  }

  /**
   * Get all credentials issued by a DID
   */
  getIssuedCredentials(issuerDID: string): VerifiableCredential[] {
    const ids = this.issuedCredentials.get(issuerDID) || [];
    return ids.map(id => this.credentials.get(id)).filter((c): c is VerifiableCredential => !!c);
  }

  /**
   * Get all credentials held by a DID
   */
  getHolderCredentials(holderDID: string): VerifiableCredential[] {
    const ids = this.holderCredentials.get(holderDID) || [];
    return ids.map(id => this.credentials.get(id)).filter((c): c is VerifiableCredential => !!c);
  }

  /**
   * Present credentials (create verifiable presentation)
   */
  async createPresentation(
    holderDID: string,
    credentialIds: string[],
    challenge: string
  ): Promise<{
    '@context': string[];
    type: string[];
    holder: string;
    verifiableCredential: VerifiableCredential[];
    proof: CredentialProof;
  }> {
    const credentials = credentialIds
      .map(id => this.credentials.get(id))
      .filter((c): c is VerifiableCredential => !!c);

    const presentation = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: holderDID,
      verifiableCredential: credentials,
      proof: await this.createPresentationProof(holderDID, challenge, credentials)
    };

    return presentation;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      totalCredentials: this.credentials.size,
      uniqueIssuers: this.issuedCredentials.size,
      uniqueHolders: this.holderCredentials.size,
      templates: this.templates.size,
      credentialsByType: this.getCredentialsByType()
    };
  }

  // Private methods
  private async createProof(
    credentialId: string,
    issuerDID: string,
    proofData?: string
  ): Promise<CredentialProof> {
    const now = new Date().toISOString();
    
    // Mock JWS - would create actual signature in production
    const mockJWS = Buffer.from(`${credentialId}:${issuerDID}:${now}`).toString('base64');

    return {
      type: this.config.proofType,
      created: now,
      proofPurpose: 'assertionMethod',
      verificationMethod: `${issuerDID}#key-1`,
      jws: proofData || mockJWS
    };
  }

  private async verifyProof(proof: CredentialProof): Promise<boolean> {
    // Mock verification - would verify actual signature in production
    return proof.jws.length > 0;
  }

  private async createPresentationProof(
    holderDID: string,
    challenge: string,
    credentials: VerifiableCredential[]
  ): Promise<CredentialProof> {
    const data = `${holderDID}:${challenge}:${credentials.map(c => c.id).join(',')}`;
    const mockJWS = Buffer.from(data).toString('base64');

    return {
      type: this.config.proofType,
      created: new Date().toISOString(),
      proofPurpose: 'authentication',
      verificationMethod: `${holderDID}#key-1`,
      jws: mockJWS,
      challenge
    };
  }

  private async anchorToHedera(credential: VerifiableCredential): Promise<void> {
    // Mock HCS anchoring - would submit hash to Hedera in production
    logger.debug('VerifiableCredentialRegistry', {
      message: 'Anchored to Hedera',
      credentialId: credential.id,
      topicId: this.config.hcsTopicId || 'mock-topic'
    });
  }

  private async calculateTrustScore(issuerDID: string): Promise<number> {
    // Mock trust score calculation
    const issued = this.issuedCredentials.get(issuerDID) || [];
    const baseScore = 50;
    const experienceBonus = Math.min(issued.length * 2, 30);
    return Math.min(baseScore + experienceBonus, 100);
  }

  private getCredentialsByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const credential of this.credentials.values()) {
      for (const type of credential.type) {
        if (type !== 'VerifiableCredential') {
          counts[type] = (counts[type] || 0) + 1;
        }
      }
    }
    return counts;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Singleton
let registryInstance: VerifiableCredentialRegistry | null = null;

export function getVerifiableCredentialRegistry(config?: Partial<VCConfig>): VerifiableCredentialRegistry {
  if (!registryInstance) {
    registryInstance = new VerifiableCredentialRegistry(config);
  }
  return registryInstance;
}
