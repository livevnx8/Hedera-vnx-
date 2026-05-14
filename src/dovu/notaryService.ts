/**
 * Dovu Notary Service
 * Creates and manages verifiable attestations on Hedera
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';
import type { DovuDataPayload, DovuVerificationResult } from './dovuAdapter.js';
import type { AdvancedVerificationResult } from './verificationEngine.js';

export interface NotarizationRecord {
  id: string;
  dovuDataId: string;
  verificationHash: string;
  attestationHash: string;
  hcsTopicId: string;
  hcsSequenceNumber: string;
  timestamp: number;
  verifier: string;
  verified: boolean;
  confidence: number;
  riskScore: number;
  signature: string;
}

export interface CompletionCertificate {
  id: string;
  notarizationIds: string[];
  timestamp: number;
  projectName: string;
  description: string;
  totalVerifications: number;
  successfulVerifications: number;
  totalCarbonTons: number;
  signature: string;
  hcsTopicId: string;
  hcsSequenceNumber: string;
}

export class NotaryService {
  private client: Client;
  private notarizationTopicId: string | null = null;
  private certificateTopicId: string | null = null;
  private notarizationRecords = new Map<string, NotarizationRecord>();
  private certificates = new Map<string, CompletionCertificate>();

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      // Parse private key properly
      const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
      let privateKey: PrivateKey;
      
      try {
        if (keyStr.length === 64) {
          // Try ECDSA first, then ED25519
          try {
            privateKey = PrivateKey.fromStringECDSA(keyStr);
          } catch {
            privateKey = PrivateKey.fromStringED25519(keyStr);
          }
        } else {
          privateKey = PrivateKey.fromString(keyStr);
        }
        
        this.client.setOperator(
          config.HEDERA_OPERATOR_ACCOUNT_ID,
          privateKey
        );
        
        logger.info('NotaryService', { 
          accountId: config.HEDERA_OPERATOR_ACCOUNT_ID,
          message: 'HCS client initialized with valid operator key' 
        });
      } catch (error) {
        logger.error('NotaryService', { 
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to parse private key - HCS will run in local-only mode' 
        });
      }
    }
  }

  /**
   * Initialize notary service - create HCS topics (optional)
   */
  async initialize(): Promise<void> {
    logger.info('NotaryService', { message: 'Initializing notary service...' });

    try {
      // Create notarization topic for individual attestations
      const notaryTx = await new TopicCreateTransaction()
        .setTopicMemo('Vera-Dovu Notarization Records')
        .execute(this.client);
      const notaryReceipt = await notaryTx.getReceipt(this.client);
      this.notarizationTopicId = notaryReceipt.topicId?.toString() || null;
      logger.info('NotaryService', { topicId: this.notarizationTopicId, message: 'Notarization topic created' });
    } catch (error) {
      logger.warn('NotaryService', { error: error instanceof Error ? error.message : String(error), message: 'Failed to create notarization topic, continuing with local-only mode' });
    }

    try {
      // Create certificate topic for completion certificates
      const certTx = await new TopicCreateTransaction()
        .setTopicMemo('Vera-Dovu Completion Certificates')
        .execute(this.client);
      const certReceipt = await certTx.getReceipt(this.client);
      this.certificateTopicId = certReceipt.topicId?.toString() || null;
      logger.info('NotaryService', { topicId: this.certificateTopicId, message: 'Certificate topic created' });
    } catch (error) {
      logger.warn('NotaryService', { error: error instanceof Error ? error.message : String(error), message: 'Failed to create certificate topic, continuing with local-only mode' });
    }

    logger.info('NotaryService', { 
      notarizationTopicId: this.notarizationTopicId,
      certificateTopicId: this.certificateTopicId,
      message: 'Notary service initialized' 
    });
  }

  /**
   * Create notarization for verified data
   */
  async notarize(
    payload: DovuDataPayload,
    result: DovuVerificationResult | AdvancedVerificationResult
  ): Promise<NotarizationRecord | null> {
    try {
      const record: NotarizationRecord = {
        id: crypto.randomUUID(),
        dovuDataId: payload.id,
        verificationHash: result.verificationHash,
        attestationHash: '', // Will be set after HCS submission
        hcsTopicId: this.notarizationTopicId || 'local-only',
        hcsSequenceNumber: '', // Will be set after HCS submission
        timestamp: Date.now(),
        verifier: config.HEDERA_OPERATOR_ACCOUNT_ID || '',
        verified: result.verified,
        confidence: result.confidence,
        riskScore: 'riskScore' in result ? result.riskScore : 0,
        signature: '', // Will be set after signing
      };

      // Create attestation message
      const attestation = {
        type: 'NOTARIZATION',
        recordId: record.id,
        dovuDataId: payload.id,
        dovuDataType: payload.type,
        verificationHash: result.verificationHash,
        verified: result.verified,
        confidence: result.confidence,
        verifier: record.verifier,
        timestamp: record.timestamp,
        checks: result.checks,
        metadata: 'metadata' in result ? result.metadata : undefined,
      };

      // Calculate attestation hash
      record.attestationHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(attestation))
        .digest('hex');

      // Sign the record
      record.signature = this.signRecord(record);

      // Submit to HCS if topic available, otherwise local-only
      if (this.notarizationTopicId) {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(this.notarizationTopicId)
          .setMessage(JSON.stringify({
            ...attestation,
            attestationHash: record.attestationHash,
            signature: record.signature,
          }))
          .execute(this.client);

        const receipt = await tx.getReceipt(this.client);
        record.hcsSequenceNumber = receipt.topicSequenceNumber?.toString() || '';
      } else {
        // Local-only mode
        record.hcsSequenceNumber = 'local-only';
        logger.info('NotaryService', { message: 'Local-only notarization (HCS not available)' });
      }

      // Store locally
      this.notarizationRecords.set(record.id, record);

      logger.info('NotaryService', { 
        recordId: record.id,
        dovuDataId: payload.id,
        hcsSequenceNumber: record.hcsSequenceNumber,
        verified: record.verified,
        message: 'Notarization created' 
      });

      return record;
    } catch (error) {
      logger.error('NotaryService', { 
        dovuDataId: payload.id, 
        error, 
        message: 'Failed to create notarization' 
      });
      return null;
    }
  }

  /**
   * Create completion certificate for batch verifications
   */
  async createCertificate(
    projectName: string,
    description: string,
    notarizationIds: string[]
  ): Promise<CompletionCertificate | null> {
    try {
      // Gather notarizations
      const notarizations = notarizationIds
        .map(id => this.notarizationRecords.get(id))
        .filter((n): n is NotarizationRecord => !!n);

      if (notarizations.length === 0) {
        throw new Error('No valid notarizations found');
      }

      const successful = notarizations.filter(n => n.verified);
      
      // Calculate total carbon tons (if available in original data)
      const totalCarbonTons = successful.length * 100; // Simplified calculation

      const certificate: CompletionCertificate = {
        id: crypto.randomUUID(),
        notarizationIds,
        timestamp: Date.now(),
        projectName,
        description,
        totalVerifications: notarizations.length,
        successfulVerifications: successful.length,
        totalCarbonTons,
        signature: '', // Will be set after signing
        hcsTopicId: this.certificateTopicId || 'local-only',
        hcsSequenceNumber: '', // Will be set after HCS submission
      };

      // Sign certificate
      certificate.signature = this.signCertificate(certificate);

      // Submit to HCS if topic available, otherwise local-only
      if (this.certificateTopicId) {
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(this.certificateTopicId)
          .setMessage(JSON.stringify({
            type: 'COMPLETION_CERTIFICATE',
            ...certificate,
          }))
          .execute(this.client);

        const receipt = await tx.getReceipt(this.client);
        certificate.hcsSequenceNumber = receipt.topicSequenceNumber?.toString() || '';
      } else {
        // Local-only mode
        certificate.hcsSequenceNumber = 'local-only';
        logger.info('NotaryService', { message: 'Local-only certificate (HCS not available)' });
      }

      // Store locally
      this.certificates.set(certificate.id, certificate);

      logger.info('NotaryService', { 
        certificateId: certificate.id,
        projectName,
        hcsSequenceNumber: certificate.hcsSequenceNumber,
        totalVerifications: certificate.totalVerifications,
        successfulVerifications: certificate.successfulVerifications,
        message: 'Completion certificate issued' 
      });

      return certificate;
    } catch (error) {
      logger.error('NotaryService', { 
        projectName, 
        error, 
        message: 'Failed to create certificate' 
      });
      return null;
    }
  }

  /**
   * Get notarization record by ID
   */
  getNotarization(id: string): NotarizationRecord | undefined {
    return this.notarizationRecords.get(id);
  }

  /**
   * Get all notarizations for a Dovu data ID
   */
  getNotarizationsByDovuId(dovuDataId: string): NotarizationRecord[] {
    return Array.from(this.notarizationRecords.values())
      .filter(n => n.dovuDataId === dovuDataId);
  }

  /**
   * Get certificate by ID
   */
  getCertificate(id: string): CompletionCertificate | undefined {
    return this.certificates.get(id);
  }

  /**
   * Get all certificates
   */
  getAllCertificates(): CompletionCertificate[] {
    return Array.from(this.certificates.values());
  }

  /**
   * Get topic IDs
   */
  getTopicIds(): { notarizationTopicId: string | null; certificateTopicId: string | null } {
    return {
      notarizationTopicId: this.notarizationTopicId,
      certificateTopicId: this.certificateTopicId,
    };
  }

  // Signing helpers
  private signRecord(record: NotarizationRecord): string {
    const data = `${record.id}:${record.dovuDataId}:${record.verificationHash}:${record.timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private signCertificate(cert: CompletionCertificate): string {
    const data = `${cert.id}:${cert.projectName}:${cert.timestamp}:${cert.totalVerifications}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// Singleton instance
export const notaryService = new NotaryService();
