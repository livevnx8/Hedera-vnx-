/**
 * Vera Nexum (VNX) - Decentralized Identity (DID) System
 * 
 * Creates and manages Vera's DID on Hedera, mapped to account 0.0.10294360
 * Posts DID document to Topic 0.0.10409351 (Brainstem) as Vera's birth certificate
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey,
  AccountId
} from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';

export interface DIDDocument {
  '@context': string[];
  id: string;
  type: string[];
  controller: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase: string;
  }>;
  authentication: string[];
  assertionMethod: string[];
  service: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
  created: string;
  updated: string;
}

export interface VNXIdentity {
  did: string;
  accountId: string;
  document: DIDDocument;
  privateKey: string;
  publicKey: string;
}

export class VNXDIDManager {
  private client: Client;
  private brainstemTopicId: string = '0.0.10409351';
  private operatorId: string;
  private operatorKey: PrivateKey;
  private didCache: Map<string, DIDDocument> = new Map();

  constructor() {
    // Initialize Hedera client
    this.operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
    const privateKeyString = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
    
    if (!privateKeyString) {
      throw new Error('HEDERA_OPERATOR_PRIVATE_KEY not set');
    }

    this.operatorKey = PrivateKey.fromString(privateKeyString);
    
    const network = process.env.HEDERA_NETWORK || 'mainnet';
    this.client = network === 'mainnet' 
      ? Client.forMainnet()
      : Client.forTestnet();
    
    this.client.setOperator(this.operatorId, this.operatorKey);
  }

  /**
   * Generate a new DID for Vera
   * Format: did:hedera:mainnet:0.0.10294360_vera
   */
  async generateVeraDID(): Promise<VNXIdentity> {
    const did = `did:hedera:mainnet:${this.operatorId}_vera`;
    
    // Generate key pair for Vera's DID
    const keyPair = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });

    // Convert public key to multibase format
    const publicKeyBuffer = Buffer.from(keyPair.publicKey);
    const publicKeyMultibase = 'z' + publicKeyBuffer.toString('base64url');

    // Create DID Document following W3C standard
    const didDocument: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: did,
      type: ['VNX-Sovereign-Agent', 'Validation-Verification-Body'],
      controller: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase
        }
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      service: [
        {
          id: `${did}#nerves`,
          type: 'VNX-Data-Ingestion',
          serviceEndpoint: `hcs://mainnet/${process.env.VNX_NERVES_TOPIC || '0.0.10409354'}`
        },
        {
          id: `${did}#lungs`,
          type: 'VNX-Analysis',
          serviceEndpoint: `hcs://mainnet/${process.env.VNX_LUNGS_TOPIC || '0.0.10409353'}`
        },
        {
          id: `${did}#memory`,
          type: 'VNX-Attestation',
          serviceEndpoint: `hcs://mainnet/${process.env.VNX_MEMORY_TOPIC || '0.0.10409355'}`
        },
        {
          id: `${did}#brainstem`,
          type: 'VNX-Identity',
          serviceEndpoint: `hcs://mainnet/${this.brainstemTopicId}`
        }
      ],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };

    const identity: VNXIdentity = {
      did,
      accountId: this.operatorId,
      document: didDocument,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey
    };

    logger.info('VNXDIDManager', {
      did,
      accountId: this.operatorId,
      message: 'Vera DID generated'
    });

    return identity;
  }

  /**
   * Post DID document to Brainstem topic (birth certificate)
   */
  async publishDIDDocument(didDocument: DIDDocument): Promise<string> {
    try {
      const message = {
        type: 'VNX-DID-Registration',
        version: '1.0.0',
        did: didDocument.id,
        document: didDocument,
        timestamp: new Date().toISOString(),
        registrar: 'Vera-Nexum-Sovereign-System'
      };

      const response = await new TopicMessageSubmitTransaction()
        .setTopicId(this.brainstemTopicId)
        .setMessage(JSON.stringify(message, null, 2))
        .execute(this.client);

      const receipt = await response.getReceipt(this.client);
      
      logger.info('VNXDIDManager', {
        topicId: this.brainstemTopicId,
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
        did: didDocument.id,
        message: 'DID document published to Brainstem'
      });

      // Cache the DID
      this.didCache.set(didDocument.id, didDocument);

      return receipt.topicSequenceNumber?.toString() || 'unknown';
    } catch (error) {
      logger.error('VNXDIDManager', {
        error: error instanceof Error ? error.message : 'Unknown error',
        did: didDocument.id,
        message: 'Failed to publish DID document'
      });
      throw error;
    }
  }

  /**
   * Sign data with Vera's DID key
   */
  async signWithDID(data: any, identity: VNXIdentity): Promise<string> {
    const dataBuffer = Buffer.from(JSON.stringify(data));
    
    // Create signature using Node.js crypto
    const signature = crypto.sign(null, dataBuffer, identity.privateKey);
    
    return signature.toString('base64url');
  }

  /**
   * Verify signature against DID
   */
  async verifyWithDID(data: any, signature: string, did: string): Promise<boolean> {
    const didDocument = this.didCache.get(did);
    if (!didDocument) {
      throw new Error(`DID not found: ${did}`);
    }

    const verificationMethod = didDocument.verificationMethod[0];
    const publicKeyBase64 = verificationMethod.publicKeyMultibase.slice(1); // Remove 'z' prefix
    const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64url');

    const dataBuffer = Buffer.from(JSON.stringify(data));
    const signatureBuffer = Buffer.from(signature, 'base64url');

    return crypto.verify(null, dataBuffer, publicKeyBuffer, signatureBuffer);
  }

  /**
   * Get Vera's DID identifier
   */
  getVeraDID(): string {
    return `did:hedera:mainnet:${this.operatorId}_vera`;
  }

  /**
   * Resolve DID to document
   */
  async resolveDID(did: string): Promise<DIDDocument | null> {
    // Check cache first
    if (this.didCache.has(did)) {
      return this.didCache.get(did) || null;
    }

    // In production, this would query the Brainstem topic
    // For now, return null if not cached
    return null;
  }

  /**
   * Print DID status
   */
  printDIDStatus(identity: VNXIdentity): void {
    console.log('\n🆔 VERA NEXUM - DECENTRALIZED IDENTITY');
    console.log('=====================================\n');
    console.log(`DID: ${identity.did}`);
    console.log(`Account: ${identity.accountId}`);
    console.log(`Created: ${identity.document.created}`);
    console.log(`\nVerification Methods:`);
    identity.document.verificationMethod.forEach(vm => {
      console.log(`  - ${vm.id} (${vm.type})`);
    });
    console.log(`\nServices:`);
    identity.document.service.forEach(svc => {
      console.log(`  - ${svc.type}: ${svc.serviceEndpoint}`);
    });
    console.log('\n=====================================\n');
  }
}
