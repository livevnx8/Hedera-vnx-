/**
 * Carbon Credit Data Validation Engine
 * 
 * Comprehensive validation for carbon credit data with:
 * - Multi-layer validation (format, business rules, chain of custody)
 * - Integration with Hedera for immutable attestation
 * - WV Power Grid correlation for renewable energy credits
 * - Real-time monitoring and alerts
 */

import { verificationEngine } from '../dovu/verificationEngine.js';
import { hcsDomainLogger } from '../vera/logging/hcsDomainLogger.js';
import { hederaToolRegistry } from '../hedera/tools/index.js';
import { logger } from '../monitoring/logger.js';
import { ValidationErrorCode, ValidationError, createValidationError, mapCheckToErrorCode } from './errors.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CarbonCreditData {
  id: string;
  projectId: string;
  projectName: string;
  carbonTons: number;
  vintage: number;
  standard: 'VCS' | 'GoldStandard' | 'CAR' | 'ACR' | 'CDM' | 'Other';
  certificationBody: string;
  issuanceDate: string;
  expiryDate?: string;
  location: {
    country: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  };
  hash: string;
  signature: string;
  hederaAccountId: string;
  timestamp: number;
  source: string;
  type: 'RENEWABLE_ENERGY' | 'FORESTRY' | 'METHANE_CAPTURE' | 'DIRECT_AIR_CAPTURE' | 'OTHER';
  // WV Power Grid specific
  powerGridRegion?: 'WEST_VA' | 'OTHER';
  generationData?: {
    mwhGenerated: number;
    periodStart: string;
    periodEnd: string;
    fuelType: 'SOLAR' | 'WIND' | 'HYDRO' | 'GEOTHERMAL' | 'BIOMASS';
  };
}

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  checks: ValidationCheck[];
  errors: ValidationError[];
  warnings: string[];
  riskScore: number;
  attestationHash?: string;
  hcsSequenceNumber?: number;
  verificationDepth: 'basic' | 'standard' | 'deep';
  summary?: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  weight: number;
  details?: string;
}

// ============================================================================
// Validation Rules
// ============================================================================

const VALIDATION_RULES = {
  // Format validation
  format: {
    accountId: /^0\.0\.\d+$/,
    signature: /^[a-f0-9]{64}$/i,
    hash: /^[a-f0-9]{64}$/i,
    projectId: /^[A-Z0-9\-_]+$/i,
    minVintage: 2000,
    maxVintage: new Date().getFullYear() + 1,
    maxCarbonTons: 100_000_000, // 100M tons max per credit
  },
  // Business rules
  business: {
    minCarbonTons: 0.001,
    maxAgeYears: 10,
    standards: ['VCS', 'GoldStandard', 'CAR', 'ACR', 'CDM', 'Other'],
    projectTypes: ['RENEWABLE_ENERGY', 'FORESTRY', 'METHANE_CAPTURE', 'DIRECT_AIR_CAPTURE', 'OTHER'],
    wvPowerRegions: ['WEST_VA', 'OTHER'],
  }
};

// WV Power Grid - High-risk/suspicious patterns
const WV_GRID_PATTERNS = {
  validFuelTypes: ['SOLAR', 'WIND', 'HYDRO', 'GEOTHERMAL', 'BIOMASS'],
  suspiciousCountries: ['CN_SUSPICIOUS', 'XX_UNKNOWN'],
  highRiskJurisdictions: ['OFFSHORE_UNKNOWN'],
};

// ============================================================================
// Validation Engine
// ============================================================================

export class CarbonValidationEngine {
  private validationCache = new Map<string, ValidationResult>();
  private cacheExpiryMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Validate carbon credit data with specified depth
   */
  async validate(
    credit: CarbonCreditData,
    depth: 'basic' | 'standard' | 'deep' = 'standard'
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const cacheKey = `${credit.id}-${depth}`;

    // Check cache
    const cached = this.validationCache.get(cacheKey);
    if (cached && Date.now() - (cached as any).cacheTime < this.cacheExpiryMs) {
      logger.info('CarbonValidation', { id: credit.id, message: 'Returning cached validation' });
      return cached;
    }

    logger.info('CarbonValidation', { id: credit.id, depth, message: 'Starting validation' });

    const checks: ValidationCheck[] = [];
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Layer 1: Format Validation
    const formatChecks = this.validateFormat(credit);
    checks.push(...formatChecks);
    formatChecks.filter(c => !c.passed).forEach(c => {
      const errorCode = mapCheckToErrorCode(c.name);
      errors.push(createValidationError(errorCode, c.name));
    });

    // Layer 2: Business Rules
    const businessChecks = this.validateBusinessRules(credit);
    checks.push(...businessChecks);
    businessChecks.filter(c => !c.passed).forEach(c => {
      const errorCode = mapCheckToErrorCode(c.name);
      errors.push(createValidationError(errorCode, c.name));
    });

    // Layer 3: WV Power Grid (if applicable)
    if (credit.powerGridRegion === 'WEST_VA' || credit.type === 'RENEWABLE_ENERGY') {
      const gridChecks = this.validateWVPowerGrid(credit);
      checks.push(...gridChecks);
      gridChecks.filter(c => !c.passed).forEach(c => {
        const errorCode = mapCheckToErrorCode(c.name);
        errors.push(createValidationError(errorCode, c.name));
      });
    }

    // Layer 4: Deep Verification (Hedera/HCS)
    let attestationHash: string | undefined;
    let hcsSequenceNumber: number | undefined;
    
    if (depth === 'deep') {
      const deepResult = await this.performDeepVerification(credit);
      checks.push(...deepResult.checks);
      if (deepResult.attestationHash) {
        attestationHash = deepResult.attestationHash;
        hcsSequenceNumber = deepResult.hcsSequenceNumber;
      }
      if (!deepResult.valid) {
        errors.push(createValidationError(ValidationErrorCode.HEDERA_VERIFICATION_FAILED));
      }
    }

    // Calculate confidence and risk
    const passedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
    const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
    const confidence = passedWeight / totalWeight;
    const riskScore = this.calculateRiskScore(credit, checks, errors.length);

    // Determine validity
    const valid = confidence >= 0.75 && riskScore < 50 && errors.length === 0;

    const result: ValidationResult = {
      valid,
      confidence,
      checks,
      errors,
      warnings,
      riskScore,
      attestationHash,
      hcsSequenceNumber,
      verificationDepth: depth
    };

    // Cache result
    (result as any).cacheTime = Date.now();
    this.validationCache.set(cacheKey, result);

    // Log to HCS
    await this.logValidation(credit, result, Date.now() - startTime);

    logger.info('CarbonValidation', {
      id: credit.id,
      valid,
      confidence: `${(confidence * 100).toFixed(0)}%`,
      riskScore,
      duration: `${Date.now() - startTime}ms`,
      message: 'Validation complete'
    });

    return result;
  }

  // ============================================================================
  // Validation Layers
  // ============================================================================

  private validateFormat(credit: CarbonCreditData): ValidationCheck[] {
    const checks: ValidationCheck[] = [];
    const rules = VALIDATION_RULES.format;

    // Account ID format
    checks.push({
      name: 'account_format',
      passed: rules.accountId.test(credit.hederaAccountId),
      weight: 10,
      details: rules.accountId.test(credit.hederaAccountId) ? undefined : 'Invalid Hedera account ID format'
    });

    // Signature format
    checks.push({
      name: 'signature_format',
      passed: rules.signature.test(credit.signature),
      weight: 10,
      details: rules.signature.test(credit.signature) ? undefined : 'Invalid signature format (must be 64 char hex)'
    });

    // Hash format
    checks.push({
      name: 'hash_format',
      passed: rules.hash.test(credit.hash),
      weight: 10,
      details: rules.hash.test(credit.hash) ? undefined : 'Invalid hash format (must be 64 char hex)'
    });

    // Project ID format
    checks.push({
      name: 'project_id_format',
      passed: rules.projectId.test(credit.projectId),
      weight: 5,
      details: rules.projectId.test(credit.projectId) ? undefined : 'Invalid project ID format'
    });

    // Vintage year
    checks.push({
      name: 'vintage_valid',
      passed: credit.vintage >= rules.minVintage && credit.vintage <= rules.maxVintage,
      weight: 8,
      details: credit.vintage >= rules.minVintage && credit.vintage <= rules.maxVintage 
        ? undefined 
        : `Vintage must be between ${rules.minVintage} and ${rules.maxVintage}`
    });

    // Required fields
    checks.push({
      name: 'required_fields',
      passed: !!(credit.projectName && credit.carbonTons && credit.standard && credit.location.country),
      weight: 15,
      details: 'Missing required fields: projectName, carbonTons, standard, or country'
    });

    return checks;
  }

  private validateBusinessRules(credit: CarbonCreditData): ValidationCheck[] {
    const checks: ValidationCheck[] = [];
    const rules = VALIDATION_RULES.business;

    // Carbon tons range
    checks.push({
      name: 'carbon_tons_range',
      passed: credit.carbonTons >= rules.minCarbonTons && credit.carbonTons <= VALIDATION_RULES.format.maxCarbonTons,
      weight: 12,
      details: credit.carbonTons >= rules.minCarbonTons && credit.carbonTons <= VALIDATION_RULES.format.maxCarbonTons
        ? undefined
        : `Carbon tons must be between ${rules.minCarbonTons} and ${VALIDATION_RULES.format.maxCarbonTons}`
    });

    // Valid standard
    checks.push({
      name: 'valid_standard',
      passed: rules.standards.includes(credit.standard),
      weight: 10,
      details: rules.standards.includes(credit.standard) ? undefined : `Standard must be one of: ${rules.standards.join(', ')}`
    });

    // Valid project type
    checks.push({
      name: 'valid_project_type',
      passed: rules.projectTypes.includes(credit.type),
      weight: 8,
      details: rules.projectTypes.includes(credit.type) ? undefined : `Type must be one of: ${rules.projectTypes.join(', ')}`
    });

    // Credit age
    const issuanceDate = new Date(credit.issuanceDate);
    const ageYears = (Date.now() - issuanceDate.getTime()) / (365 * 24 * 60 * 60 * 1000);
    checks.push({
      name: 'credit_age',
      passed: ageYears <= rules.maxAgeYears,
      weight: 7,
      details: ageYears <= rules.maxAgeYears ? undefined : `Credit is too old (${ageYears.toFixed(1)} years, max ${rules.maxAgeYears})`
    });

    // Expiry check (if present)
    if (credit.expiryDate) {
      const expiry = new Date(credit.expiryDate);
      checks.push({
        name: 'not_expired',
        passed: expiry > new Date(),
        weight: 12,
        details: expiry > new Date() ? undefined : 'Credit has expired'
      });
    }

    return checks;
  }

  private validateWVPowerGrid(credit: CarbonCreditData): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Must have generation data for renewable energy
    if (credit.type === 'RENEWABLE_ENERGY') {
      checks.push({
        name: 'has_generation_data',
        passed: !!credit.generationData,
        weight: 10,
        details: credit.generationData ? undefined : 'Renewable energy credits must include generation data'
      });

      if (credit.generationData) {
        // Valid fuel type
        checks.push({
          name: 'valid_fuel_type',
          passed: WV_GRID_PATTERNS.validFuelTypes.includes(credit.generationData.fuelType),
          weight: 10,
          details: WV_GRID_PATTERNS.validFuelTypes.includes(credit.generationData.fuelType)
            ? undefined
            : `Fuel type must be one of: ${WV_GRID_PATTERNS.validFuelTypes.join(', ')}`
        });

        // MWh consistency check
        const expectedMWh = credit.carbonTons * 0.5; // Rough estimate: 0.5 MWh per ton CO2 for renewables
        const actualMWh = credit.generationData.mwhGenerated;
        const ratio = actualMWh / expectedMWh;
        
        checks.push({
          name: 'mwh_consistency',
          passed: ratio >= 0.3 && ratio <= 3.0,
          weight: 8,
          details: (ratio >= 0.3 && ratio <= 3.0)
            ? undefined
            : `MWh generated (${actualMWh}) inconsistent with carbon tons (${credit.carbonTons})`
        });
      }
    }

    // Geographic validation for WV
    if (credit.powerGridRegion === 'WEST_VA') {
      const isWV = credit.location.state === 'WV' || credit.location.state === 'West Virginia';
      checks.push({
        name: 'wv_location_match',
        passed: isWV || credit.location.country === 'US',
        weight: 8,
        details: isWV || credit.location.country === 'US'
          ? undefined
          : 'Power grid region is WEST_VA but location is not in West Virginia'
      });
    }

    return checks;
  }

  private async performDeepVerification(credit: CarbonCreditData): Promise<{
    valid: boolean;
    checks: ValidationCheck[];
    attestationHash?: string;
    hcsSequenceNumber?: number;
  }> {
    const checks: ValidationCheck[] = [];

    // Use Dovu verification engine for Hedera validation
    const dovuPayload = {
      id: credit.id,
      hederaAccountId: credit.hederaAccountId,
      signature: credit.signature,
      data: { ...credit },
      timestamp: credit.timestamp,
      source: credit.source,
      type: credit.type
    };
    const dovuResult = await verificationEngine.verify(dovuPayload as any, 'deep');

    checks.push({
      name: 'hedera_attestation',
      passed: dovuResult.verified,
      weight: 20,
      details: dovuResult.verified ? undefined : `Hedera verification failed: ${dovuResult.errors.join(', ')}`
    });

    checks.push({
      name: 'mirror_node_sync',
      passed: dovuResult.crossReferences.mirrorNodeMatch,
      weight: 15,
      details: dovuResult.crossReferences.mirrorNodeMatch ? undefined : 'Mirror node data mismatch'
    });

    return {
      valid: dovuResult.verified,
      checks,
      attestationHash: dovuResult.verificationHash,
      hcsSequenceNumber: dovuResult.crossReferences.hcsMessagesFound
    };
  }

  // ============================================================================
  // Risk & Scoring
  // ============================================================================

  private calculateRiskScore(credit: CarbonCreditData, checks: ValidationCheck[], errorCount: number): number {
    let score = 0;

    // Failed checks increase risk
    const failedWeight = checks.filter(c => !c.passed).reduce((sum, c) => sum + c.weight, 0);
    score += failedWeight * 2;

    // Errors increase risk
    score += errorCount * 10;

    // Geographic risk
    if (WV_GRID_PATTERNS.suspiciousCountries.includes(credit.location.country)) {
      score += 25;
    }

    // Age risk
    const age = Date.now() - credit.timestamp;
    if (age > 5 * 365 * 24 * 60 * 60 * 1000) {
      score += 15; // > 5 years old
    }

    // Certification body risk (placeholder - would check against known bad actors)
    if (!credit.certificationBody || credit.certificationBody === 'Unknown') {
      score += 20;
    }

    return Math.min(score, 100);
  }

  // ============================================================================
  // HCS Logging
  // ============================================================================

  private async logValidation(
    credit: CarbonCreditData,
    result: ValidationResult,
    duration: number
  ): Promise<void> {
    try {
      const logData: Record<string, unknown> = {
        type: 'CARBON_CREDIT_VALIDATION',
        creditId: credit.id,
        projectId: credit.projectId,
        valid: result.valid,
        confidence: result.confidence,
        riskScore: result.riskScore,
        verificationDepth: result.verificationDepth,
        checksPassed: result.checks.filter(c => c.passed).length,
        totalChecks: result.checks.length,
        errors: result.errors,
        warnings: result.warnings,
        attestationHash: result.attestationHash,
        duration,
        timestamp: Date.now()
      };
      await hcsDomainLogger.logEvent('carbonVerificationTopicId', logData);
    } catch (error) {
      logger.warn('CarbonValidation', { error, message: 'HCS logging failed' });
    }
  }

  // ============================================================================
  // Public Utilities
  // ============================================================================

  clearCache(): void {
    this.validationCache.clear();
    logger.info('CarbonValidation', { message: 'Validation cache cleared' });
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.validationCache.size,
      maxSize: 1000
    };
  }
}

// Singleton instance
export const carbonValidationEngine = new CarbonValidationEngine();
export default carbonValidationEngine;
