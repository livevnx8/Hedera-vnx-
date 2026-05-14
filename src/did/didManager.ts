/**
 * Hedera DID Manager
 * 
 * Manages Hedera DIDs (did:hedera) for self-sovereign identity.
 * Creates, updates, and resolves DID documents on Hedera Consensus Service.
 */

import { logger } from '../monitoring/logger.js';
import type { DIDDocument, VerificationMethod, ServiceEndpoint } from './types.js';

interface DIDConfig {
  network: 'mainnet' | 'testnet' | 'previewnet';
  hcsTopicId?: string;
  defaultValidityDays: number;
}

export class HederaDIDManager {
  private config: DIDConfig;
  private didCache: Map<string, DIDDocument> = new Map();
  private keyRegistry: Map<string, string> = new Map(); // did -> private key reference

  constructor(config: Partial<DIDConfig> = {}) {
    this.config = {
      network: 'testnet',
      defaultValidityDays: 365,
      ...config
    };
  }

  /**
   * Create a new Hedera DID
   */
  async createDID(
    controller: string,
    options: {
      publicKey?: string;
      services?: ServiceEndpoint[];
    } = {}
  ): Promise<DIDDocument> {
    try {
      const timestamp = Date.now();
      const didId = this.generateDID(controller, timestamp);
      
      // Create verification method
      const keyId = `${didId}#key-1`;
      const verificationMethod: VerificationMethod = {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: didId,
        publicKeyMultibase: options.publicKey || this.generateMockPublicKey()
      };

      const didDocument: DIDDocument = {
        id: didId,
        controller: didId,
        verificationMethod: [verificationMethod],
        authentication: [keyId],
        assertionMethod: [keyId],
        keyAgreement: [keyId],
        capabilityInvocation: [keyId],
        capabilityDelegation: [],
        service: options.services || [],
        created: timestamp,
        updated: timestamp,
        versionId: '1'
      };

      // Store in cache
      this.didCache.set(didId, didDocument);

      // Log to HCS (mock implementation)
      await this.publishToHCS(didId, didDocument);

      logger.info('HederaDIDManager', {
        message: 'DID created',
        did: didId,
        controller
      });

      return didDocument;

    } catch (error) {
      logger.error('HederaDIDManager', {
        message: 'DID creation failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Resolve a DID to its document
   */
  async resolveDID(did: string): Promise<DIDDocument | null> {
    try {
      // Check cache first
      const cached = this.didCache.get(did);
      if (cached) return cached;

      // Validate DID format
      if (!this.isValidHederaDID(did)) {
        throw new Error('Invalid Hedera DID format');
      }

      // Fetch from HCS (mock implementation)
      const document = await this.fetchFromHCS(did);
      
      if (document) {
        this.didCache.set(did, document);
      }

      return document;

    } catch (error) {
      logger.error('HederaDIDManager', {
        message: 'DID resolution failed',
        did,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Update a DID document
   */
  async updateDID(
    did: string,
    updates: Partial<Pick<DIDDocument, 'service' | 'verificationMethod'>>,
    proof: string
  ): Promise<DIDDocument> {
    try {
      const document = await this.resolveDID(did);
      if (!document) {
        throw new Error('DID not found');
      }

      // Verify controller authorization
      if (!await this.verifyController(did, proof)) {
        throw new Error('Unauthorized update attempt');
      }

      // Apply updates
      if (updates.service) {
        document.service = updates.service;
      }
      if (updates.verificationMethod) {
        document.verificationMethod = updates.verificationMethod;
      }

      document.updated = Date.now();
      document.versionId = (parseInt(document.versionId) + 1).toString();

      // Update cache and publish
      this.didCache.set(did, document);
      await this.publishToHCS(did, document);

      logger.info('HederaDIDManager', {
        message: 'DID updated',
        did,
        version: document.versionId
      });

      return document;

    } catch (error) {
      logger.error('HederaDIDManager', {
        message: 'DID update failed',
        did,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Deactivate a DID (soft delete)
   */
  async deactivateDID(did: string, proof: string): Promise<void> {
    try {
      const document = await this.resolveDID(did);
      if (!document) {
        throw new Error('DID not found');
      }

      if (!await this.verifyController(did, proof)) {
        throw new Error('Unauthorized deactivation attempt');
      }

      // Remove verification methods (effectively deactivates)
      document.verificationMethod = [];
      document.authentication = [];
      document.assertionMethod = [];
      document.keyAgreement = [];
      document.capabilityInvocation = [];
      document.updated = Date.now();

      // Update and publish
      this.didCache.set(did, document);
      await this.publishToHCS(did, document);

      logger.info('HederaDIDManager', {
        message: 'DID deactivated',
        did
      });

    } catch (error) {
      logger.error('HederaDIDManager', {
        message: 'DID deactivation failed',
        did,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Add a service endpoint to a DID
   */
  async addService(did: string, service: ServiceEndpoint, proof: string): Promise<DIDDocument> {
    const document = await this.resolveDID(did);
    if (!document) throw new Error('DID not found');

    if (!await this.verifyController(did, proof)) {
      throw new Error('Unauthorized');
    }

    // Check for duplicate service ID
    if (document.service.find(s => s.id === service.id)) {
      throw new Error('Service ID already exists');
    }

    document.service.push(service);
    document.updated = Date.now();
    document.versionId = (parseInt(document.versionId) + 1).toString();

    this.didCache.set(did, document);
    await this.publishToHCS(did, document);

    return document;
  }

  /**
   * Rotate a verification key
   */
  async rotateKey(
    did: string,
    newPublicKey: string,
    proof: string
  ): Promise<VerificationMethod> {
    const document = await this.resolveDID(did);
    if (!document) throw new Error('DID not found');

    if (!await this.verifyController(did, proof)) {
      throw new Error('Unauthorized key rotation');
    }

    const keyId = `${did}#key-${document.verificationMethod.length + 1}`;
    const newMethod: VerificationMethod = {
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: newPublicKey
    };

    // Mark old key as revoked
    const oldKey = document.verificationMethod[0];
    if (oldKey) {
      oldKey.revoked = Date.now();
    }

    // Add new key
    document.verificationMethod.push(newMethod);
    document.authentication = [keyId];
    document.assertionMethod = [keyId];
    document.keyAgreement = [keyId];
    document.updated = Date.now();
    document.versionId = (parseInt(document.versionId) + 1).toString();

    this.didCache.set(did, document);
    await this.publishToHCS(did, document);

    logger.info('HederaDIDManager', {
      message: 'Key rotated',
      did,
      newKeyId: keyId
    });

    return newMethod;
  }

  /**
   * Check if a DID is active
   */
  async isActive(did: string): Promise<boolean> {
    const document = await this.resolveDID(did);
    if (!document) return false;
    return document.verificationMethod.length > 0;
  }

  /**
   * Get DID statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      cachedDIDs: this.didCache.size,
      network: this.config.network,
      topicId: this.config.hcsTopicId
    };
  }

  // Private methods
  private generateDID(controller: string, timestamp: number): string {
    const hash = Buffer.from(`${controller}:${timestamp}:${Math.random()}`).toString('hex').slice(0, 16);
    return `did:hedera:${this.config.network}:${hash}`;
  }

  private generateMockPublicKey(): string {
    return 'z' + Buffer.from(Math.random().toString()).toString('base64url').slice(0, 43);
  }

  private isValidHederaDID(did: string): boolean {
    return did.startsWith('did:hedera:');
  }

  private async verifyController(did: string, proof: string): Promise<boolean> {
    // Mock verification - would verify cryptographic proof in production
    return proof.length > 0;
  }

  private async publishToHCS(did: string, document: DIDDocument): Promise<void> {
    // Mock HCS publication - would submit to Hedera Consensus Service in production
    logger.debug('HederaDIDManager', {
      message: 'Published to HCS',
      did,
      topicId: this.config.hcsTopicId || 'mock-topic'
    });
  }

  private async fetchFromHCS(did: string): Promise<DIDDocument | null> {
    // Mock HCS fetch - would query Hedera Consensus Service in production
    return this.didCache.get(did) || null;
  }
}

// Singleton
let didManagerInstance: HederaDIDManager | null = null;

export function getHederaDIDManager(config?: Partial<DIDConfig>): HederaDIDManager {
  if (!didManagerInstance) {
    didManagerInstance = new HederaDIDManager(config);
  }
  return didManagerInstance;
}
