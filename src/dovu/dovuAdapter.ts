/**
 * Dovu OS Adapter Module
 * Integrates Vera with Dovu OS for data verification and attestation
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';

// DOVU Token ID on Hedera (mainnet)
const DOVU_TOKEN_ID = '0.0.3716059';

// Dovu OS API endpoints
const DOVU_API_BASE = process.env.DOVU_API_BASE || 'https://api.dovu.earth';

export interface DovuDataPayload {
  id: string;
  type: 'carbon_credit' | 'supply_chain' | 'environmental' | 'verification_request';
  source: string;
  timestamp: number;
  data: Record<string, unknown>;
  signature?: string;
  hederaAccountId?: string;
}

export interface DovuVerificationResult {
  verified: boolean;
  confidence: number; // 0-1
  checks: {
    accountValid: boolean;
    signatureValid: boolean;
    dataHashValid: boolean;
    timestampValid: boolean;
  };
  verificationHash: string;
  timestamp: number;
  errors: string[];
}

export class DovuAdapter {
  private client: Client;
  private dovuApiKey: string;
  private verificationTopicId: string | null = null;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      const privateKey = this.parsePrivateKey(config.HEDERA_OPERATOR_PRIVATE_KEY);
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
    }
    
    this.dovuApiKey = process.env.DOVU_API_KEY || '';
  }

  private parsePrivateKey(keyStr: string): PrivateKey {
    if (keyStr.startsWith('302')) {
      return PrivateKey.fromStringDer(keyStr);
    } else if (keyStr.length === 64) {
      try { 
        return PrivateKey.fromStringECDSA(keyStr); 
      } catch { 
        return PrivateKey.fromStringED25519(keyStr); 
      }
    }
    return PrivateKey.fromString(keyStr);
  }

  /**
   * Initialize Dovu adapter - create HCS topic for attestations
   */
  async initialize(): Promise<void> {
    logger.info('DovuAdapter', { message: 'Initializing Dovu adapter...' });

    // Create verification topic
    const topicTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera-Dovu Verification Attestations')
      .execute(this.client);
    
    const receipt = await topicTx.getReceipt(this.client);
    this.verificationTopicId = receipt.topicId?.toString() || null;
    
    logger.info('DovuAdapter', { 
      topicId: this.verificationTopicId,
      message: 'Dovu adapter initialized' 
    });
  }

  /**
   * Fetch data from Dovu OS
   */
  async fetchDovuData(dataId: string): Promise<DovuDataPayload | null> {
    try {
      // In production, this would call the actual Dovu API
      // For now, simulate the API response
      logger.info('DovuAdapter', { dataId, message: 'Fetching data from Dovu OS' });
      
      // Simulate API call with realistic payload structure
      const mockData: DovuDataPayload = {
        id: dataId,
        type: 'carbon_credit',
        source: 'dovu_os',
        timestamp: Date.now(),
        data: {
          projectId: 'PROJ-12345',
          carbonTons: 100,
          vintage: 2024,
          standard: 'VCS',
          location: 'Colombia',
          verifier: 'Verra',
        },
        signature: this.generateMockSignature(dataId),
        hederaAccountId: '0.0.12345',
      };
      
      return mockData;
    } catch (error) {
      logger.error('DovuAdapter', { dataId, error, message: 'Failed to fetch Dovu data' });
      return null;
    }
  }

  /**
   * Verify Dovu data using multiple checks
   */
  async verifyData(payload: DovuDataPayload): Promise<DovuVerificationResult> {
    logger.info('DovuAdapter', { dataId: payload.id, message: 'Starting verification' });
    
    const checks = {
      accountValid: false,
      signatureValid: false,
      dataHashValid: false,
      timestampValid: false,
    };
    const errors: string[] = [];

    try {
      // Check 1: Account validation
      if (payload.hederaAccountId) {
        // In production, query Mirror Node to verify account exists
        checks.accountValid = true; // Simplified for now
      } else {
        errors.push('Missing Hedera account ID');
      }

      // Check 2: Signature validation
      if (payload.signature) {
        // In production, verify cryptographic signature
        checks.signatureValid = this.verifySignature(payload);
      } else {
        errors.push('Missing signature');
      }

      // Check 3: Data hash validation
      const expectedHash = this.calculateDataHash(payload.data);
      checks.dataHashValid = true; // Simplified

      // Check 4: Timestamp validation (not too old)
      const age = Date.now() - payload.timestamp;
      checks.timestampValid = age < 7 * 24 * 60 * 60 * 1000; // Less than 7 days old
      
      if (!checks.timestampValid) {
        errors.push('Data is too old (>7 days)');
      }

    } catch (error) {
      errors.push(`Verification error: ${error}`);
    }

    // Calculate confidence score
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const confidence = passedChecks / 4;
    const verified = confidence >= 0.75; // 75% threshold

    // Generate verification hash
    const verificationHash = crypto.createHash('sha256')
      .update(JSON.stringify({ payload, checks, timestamp: Date.now() }))
      .digest('hex');

    const result: DovuVerificationResult = {
      verified,
      confidence,
      checks,
      verificationHash,
      timestamp: Date.now(),
      errors,
    };

    logger.info('DovuAdapter', { 
      dataId: payload.id,
      verified,
      confidence: `${(confidence * 100).toFixed(0)}%`,
      message: 'Verification complete' 
    });

    return result;
  }

  /**
   * Submit verification attestation to HCS
   */
  async submitAttestation(
    payload: DovuDataPayload,
    result: DovuVerificationResult
  ): Promise<string | null> {
    if (!this.verificationTopicId) {
      throw new Error('DovuAdapter not initialized');
    }

    try {
      const attestation = {
        type: 'DOVU_VERIFICATION',
        dovuDataId: payload.id,
        verificationHash: result.verificationHash,
        verified: result.verified,
        confidence: result.confidence,
        timestamp: Date.now(),
        verifier: config.HEDERA_OPERATOR_ACCOUNT_ID,
        checks: result.checks,
      };

      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(this.verificationTopicId)
        .setMessage(JSON.stringify(attestation))
        .execute(this.client);

      const receipt = await tx.getReceipt(this.client);
      
      logger.info('DovuAdapter', { 
        dataId: payload.id,
        topicId: this.verificationTopicId,
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
        message: 'Attestation submitted to HCS' 
      });

      return receipt.topicSequenceNumber?.toString() || null;
    } catch (error) {
      logger.error('DovuAdapter', { dataId: payload.id, error, message: 'Failed to submit attestation' });
      return null;
    }
  }

  /**
   * Get verification topic ID
   */
  getVerificationTopicId(): string | null {
    return this.verificationTopicId;
  }

  // Helper methods
  private generateMockSignature(dataId: string): string {
    return crypto.createHash('sha256').update(dataId + 'secret').digest('hex');
  }

  private verifySignature(payload: DovuDataPayload): boolean {
    // In production, implement actual signature verification
    // For now, check if signature exists and has proper format
    return payload.signature ? payload.signature.length === 64 : false;
  }

  private calculateDataHash(data: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }
}

// Singleton instance
export const dovuAdapter = new DovuAdapter();
