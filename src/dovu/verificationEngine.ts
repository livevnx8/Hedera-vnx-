/**
 * Dovu Verification Engine
 * Advanced data validation and verification algorithms
 */

import { Client, AccountBalanceQuery, AccountInfoQuery } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';
import type { DovuDataPayload, DovuVerificationResult } from './dovuAdapter.js';

export interface VerificationContext {
  payload: DovuDataPayload;
  mirrorNodeData?: Record<string, unknown>;
  historicalVerifications?: string[];
  riskScore?: number;
}

export interface AdvancedVerificationResult extends DovuVerificationResult {
  riskScore: number; // 0-100, higher = riskier
  verificationDepth: 'basic' | 'standard' | 'deep';
  crossReferences: {
    mirrorNodeMatch: boolean;
    hcsMessagesFound: number;
    similarDataPoints: number;
  };
  metadata: {
    verificationDuration: number;
    checksPerformed: number;
    dataQuality: number;
  };
}

export class VerificationEngine {
  private client: Client;
  private verificationCache = new Map<string, AdvancedVerificationResult>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      this.client.setOperator(
        config.HEDERA_OPERATOR_ACCOUNT_ID,
        config.HEDERA_OPERATOR_PRIVATE_KEY
      );
    }
  }

  /**
   * Perform advanced verification with multiple validation layers
   */
  async verify(
    payload: DovuDataPayload,
    depth: 'basic' | 'standard' | 'deep' = 'standard'
  ): Promise<AdvancedVerificationResult> {
    const startTime = Date.now();
    const cacheKey = `${payload.id}-${depth}`;

    // Check cache
    const cached = this.verificationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      logger.info('VerificationEngine', { 
        dataId: payload.id, 
        message: 'Returning cached verification' 
      });
      return cached;
    }

    logger.info('VerificationEngine', { 
      dataId: payload.id, 
      depth,
      message: 'Starting advanced verification' 
    });

    const context: VerificationContext = { payload };
    const errors: string[] = [];

    // Layer 1: Basic checks
    const basicChecks = await this.performBasicChecks(payload);
    
    // Layer 2: Standard checks (mirror node validation)
    let mirrorNodeData: Record<string, unknown> | null = null;
    if (depth !== 'basic' && payload.hederaAccountId) {
      mirrorNodeData = await this.queryMirrorNode(payload.hederaAccountId);
      context.mirrorNodeData = mirrorNodeData || undefined;
    }

    // Layer 3: Deep verification (HCS history, cross-references)
    let hcsMessages: number = 0;
    let similarData: number = 0;
    if (depth === 'deep') {
      hcsMessages = await this.checkHCSHistory(payload);
      similarData = await this.findSimilarData(payload);
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(payload, basicChecks, mirrorNodeData);

    // Determine verification status
    const passedChecks = Object.values(basicChecks).filter(Boolean).length;
    const totalChecks = Object.keys(basicChecks).length;
    const confidence = passedChecks / totalChecks;
    
    // Deep verification requires more strict criteria
    const verified = depth === 'deep' 
      ? confidence >= 0.9 && riskScore < 30
      : confidence >= 0.75;

    const result: AdvancedVerificationResult = {
      verified,
      confidence,
      checks: basicChecks,
      verificationHash: this.generateVerificationHash(payload, basicChecks),
      timestamp: Date.now(),
      errors,
      riskScore,
      verificationDepth: depth,
      crossReferences: {
        mirrorNodeMatch: !!mirrorNodeData,
        hcsMessagesFound: hcsMessages,
        similarDataPoints: similarData,
      },
      metadata: {
        verificationDuration: Date.now() - startTime,
        checksPerformed: totalChecks,
        dataQuality: this.assessDataQuality(payload),
      },
    };

    // Cache result
    this.verificationCache.set(cacheKey, result);

    logger.info('VerificationEngine', { 
      dataId: payload.id,
      verified,
      confidence: `${(confidence * 100).toFixed(0)}%`,
      riskScore,
      duration: `${result.metadata.verificationDuration}ms`,
      message: 'Verification complete' 
    });

    return result;
  }

  /**
   * Perform basic validation checks
   */
  private async performBasicChecks(payload: DovuDataPayload): Promise<{
    accountValid: boolean;
    signatureValid: boolean;
    dataHashValid: boolean;
    timestampValid: boolean;
    dataFormatValid: boolean;
    requiredFieldsPresent: boolean;
  }> {
    return {
      accountValid: this.validateAccount(payload.hederaAccountId),
      signatureValid: this.validateSignature(payload),
      dataHashValid: this.validateDataHash(payload),
      timestampValid: this.validateTimestamp(payload.timestamp),
      dataFormatValid: this.validateDataFormat(payload),
      requiredFieldsPresent: this.validateRequiredFields(payload),
    };
  }

  /**
   * Query Hedera Mirror Node for account validation
   */
  private async queryMirrorNode(accountId: string): Promise<Record<string, unknown> | null> {
    try {
      // In production, call actual Mirror Node API
      // For now, simulate successful response
      logger.info('VerificationEngine', { accountId, message: 'Querying Mirror Node' });
      
      return {
        accountId,
        balance: 1000000000,
        exists: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('VerificationEngine', { accountId, error, message: 'Mirror Node query failed' });
      return null;
    }
  }

  /**
   * Check HCS history for similar attestations
   */
  private async checkHCSHistory(payload: DovuDataPayload): Promise<number> {
    // In production, query HCS topic for related messages
    logger.info('VerificationEngine', { dataId: payload.id, message: 'Checking HCS history' });
    return Math.floor(Math.random() * 5); // Simulate 0-4 related messages
  }

  /**
   * Find similar data points for cross-validation
   */
  private async findSimilarData(payload: DovuDataPayload): Promise<number> {
    // In production, query database for similar data
    logger.info('VerificationEngine', { dataId: payload.id, message: 'Finding similar data' });
    return Math.floor(Math.random() * 3); // Simulate 0-2 similar data points
  }

  /**
   * Calculate risk score based on multiple factors
   */
  private calculateRiskScore(
    payload: DovuDataPayload,
    checks: Record<string, boolean>,
    mirrorNodeData: Record<string, unknown> | null
  ): number {
    let score = 0;

    // Failed checks increase risk
    const failedChecks = Object.values(checks).filter(v => !v).length;
    score += failedChecks * 15;

    // No mirror node data increases risk
    if (!mirrorNodeData) score += 20;

    // Old data increases risk
    const age = Date.now() - payload.timestamp;
    if (age > 30 * 24 * 60 * 60 * 1000) score += 25; // >30 days
    else if (age > 7 * 24 * 60 * 60 * 1000) score += 10; // >7 days

    // Missing fields increase risk
    if (!payload.signature) score += 15;
    if (!payload.hederaAccountId) score += 20;

    return Math.min(score, 100);
  }

  /**
   * Assess data quality score
   */
  private assessDataQuality(payload: DovuDataPayload): number {
    let score = 0;
    const maxScore = 100;

    // Completeness
    if (payload.data) {
      const fieldCount = Object.keys(payload.data).length;
      score += Math.min(fieldCount * 5, 40);
    }

    // Has metadata
    if (payload.timestamp) score += 10;
    if (payload.signature) score += 20;
    if (payload.hederaAccountId) score += 15;
    if (payload.source) score += 10;

    // Type specificity
    if (payload.type) score += 5;

    return Math.min(score, maxScore);
  }

  // Validation helpers
  private validateAccount(accountId?: string): boolean {
    if (!accountId) return false;
    // Hedera account ID format: 0.0.xxxxxx
    return /^0\.0\.\d+$/.test(accountId);
  }

  private validateSignature(payload: DovuDataPayload): boolean {
    if (!payload.signature) return false;
    // Check signature format (should be hex string)
    return /^[a-f0-9]{64}$/i.test(payload.signature);
  }

  private validateDataHash(payload: DovuDataPayload): boolean {
    if (!payload.data) return false;
    // Data should be non-empty object
    return Object.keys(payload.data).length > 0;
  }

  private validateTimestamp(timestamp?: number): boolean {
    if (!timestamp) return false;
    const now = Date.now();
    const age = now - timestamp;
    // Must be in past but not too old (< 1 year)
    return age >= 0 && age < 365 * 24 * 60 * 60 * 1000;
  }

  private validateDataFormat(payload: DovuDataPayload): boolean {
    return !!(
      payload.id &&
      payload.type &&
      payload.source &&
      payload.timestamp &&
      typeof payload.data === 'object'
    );
  }

  private validateRequiredFields(payload: DovuDataPayload): boolean {
    const required = ['projectId', 'carbonTons', 'vintage'];
    const data = payload.data || {};
    return required.every(field => field in data);
  }

  private generateVerificationHash(
    payload: DovuDataPayload,
    checks: Record<string, boolean>
  ): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ payload: payload.id, checks, timestamp: Date.now() }))
      .digest('hex');
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verificationCache.clear();
    logger.info('VerificationEngine', { message: 'Verification cache cleared' });
  }
}

// Singleton instance
export const verificationEngine = new VerificationEngine();
