/**
 * VNX-R Validation Workflow
 * 
 * Three-phase validation system:
 * - Ingestion (Nerves): Raw data intake from PJM Grid
 * - Analysis (Lungs): AI processing with veda-qvx model
 * - Attestation (Memory): Verifiable Credential issuance
 */

import { VNXDIDManager, VNXIdentity, DIDDocument } from './didManager.js';
import { logger } from '../monitoring/logger.js';

// VNX Topic IDs
const VNX_TOPICS = {
  BRAINSTEM: '0.0.10409351',  // Identity
  LUNGS: '0.0.10409353',      // Analysis
  NERVES: '0.0.10409354',     // Ingestion
  MEMORY: '0.0.10409355'      // Attestation
};

export interface VNXIngestionData {
  source: string;
  timestamp: string;
  dataHash: string;
  rawData: any;
  metadata: {
    region: string;
    node: string;
    apiVersion: string;
  };
}

export interface VNXAnalysisResult {
  standard: 'VNX-R-2026';
  auditor: string;
  gridIntensityScore: string;
  validation: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  confidence: number;
  timestamp: string;
  analysisDetails: {
    marginalEmissionRate: number;
    fuelMix: Record<string, number>;
    thresholdExceeded: boolean;
    greenWindow: boolean;
  };
}

export interface VNXAttestation {
  type: 'VerifiableCredential';
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    carbonIntensity: string;
    marginalRateSource: string;
    auditStatus: string;
    confidenceScore: number;
    validationStandard: string;
    gridRegion: string;
  };
  proof: {
    type: 'Ed25519Signature2018';
    verificationMethod: string;
    created: string;
    proofPurpose: 'assertionMethod';
    signature: string;
  };
}

export class VNXValidationWorkflow {
  private didManager: VNXDIDManager;
  private identity: VNXIdentity | null = null;
  private isInitialized: boolean = false;

  // Green thresholds for validation
  private thresholds = {
    lowCarbon: 400,      // kg/MWh - wind/solar heavy
    mediumCarbon: 700,   // kg/MWh - mixed grid
    highCarbon: 1000     // kg/MWh - coal heavy (WV typical)
  };

  constructor() {
    this.didManager = new VNXDIDManager();
  }

  /**
   * Initialize Vera's identity and workflow
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('VNXValidationWorkflow', { message: 'Initializing VNX-R workflow...' });

    // Generate or load Vera's DID
    this.identity = await this.didManager.generateVeraDID();
    
    // Publish DID to Brainstem (birth certificate)
    await this.didManager.publishDIDDocument(this.identity.document);
    
    this.isInitialized = true;

    logger.info('VNXValidationWorkflow', {
      did: this.identity.did,
      message: 'VNX-R workflow initialized'
    });
  }

  /**
   * Phase 1: Ingestion (Nerves)
   * 
   * Ingest raw data from PJM Grid API and log to Nerves topic
   */
  async ingestData(rawData: any, metadata: VNXIngestionData['metadata']): Promise<VNXIngestionData> {
    if (!this.isInitialized) {
      throw new Error('VNX workflow not initialized. Call initialize() first.');
    }

    const timestamp = new Date().toISOString();
    const dataHash = this.hashData(rawData);

    const ingestion: VNXIngestionData = {
      source: 'PJM-DataMiner-2',
      timestamp,
      dataHash,
      rawData,
      metadata
    };

    // Log to Nerves topic
    await this.logToNerves(ingestion);

    logger.info('VNXValidationWorkflow', {
      phase: 'INGESTION',
      source: ingestion.source,
      region: metadata.region,
      dataHash: ingestion.dataHash,
      message: 'Data ingested from PJM Grid'
    });

    return ingestion;
  }

  /**
   * Phase 2: Analysis (Lungs)
   * 
   * Analyze grid intensity using veda-qvx logic
   * Returns validation result with confidence score
   */
  async analyzeData(ingestion: VNXIngestionData): Promise<VNXAnalysisResult> {
    if (!this.identity) {
      throw new Error('VNX identity not initialized');
    }

    const rawData = ingestion.rawData;
    
    // Extract marginal emission rate from PJM data
    // PJM DataMiner 2 provides kg CO2/MWh
    const marginalEmissionRate = rawData.marginal_emission_rate || 
                                  rawData.emission_rate || 
                                  this.estimateFromFuelMix(rawData.fuel_mix);

    // Determine grid intensity score
    let gridIntensityScore: string;
    let greenWindow: boolean;
    
    if (marginalEmissionRate < this.thresholds.lowCarbon) {
      gridIntensityScore = 'Low-Carbon (Renewable Dominant)';
      greenWindow = true;
    } else if (marginalEmissionRate < this.thresholds.mediumCarbon) {
      gridIntensityScore = 'Medium-Carbon (Mixed Grid)';
      greenWindow = false;
    } else {
      gridIntensityScore = `High-Carbon (Coal Heavy ${Math.round(marginalEmissionRate/10)}%)`;
      greenWindow = false;
    }

    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(rawData);

    // Determine validation status
    const validation: VNXAnalysisResult['validation'] = 
      greenWindow && confidence > 0.7 ? 'ACTIVE' : 
      confidence > 0.5 ? 'SUSPENDED' : 'INACTIVE';

    const analysis: VNXAnalysisResult = {
      standard: 'VNX-R-2026',
      auditor: 'Vera.h',
      gridIntensityScore,
      validation,
      confidence,
      timestamp: new Date().toISOString(),
      analysisDetails: {
        marginalEmissionRate,
        fuelMix: rawData.fuel_mix || {},
        thresholdExceeded: marginalEmissionRate > this.thresholds.mediumCarbon,
        greenWindow
      }
    };

    // Log analysis to Lungs topic
    await this.logToLungs(analysis, ingestion);

    logger.info('VNXValidationWorkflow', {
      phase: 'ANALYSIS',
      gridIntensity: gridIntensityScore,
      validation: analysis.validation,
      confidence: analysis.confidence,
      greenWindow: analysis.analysisDetails.greenWindow,
      message: 'Grid analysis complete'
    });

    return analysis;
  }

  /**
   * Phase 3: Attestation (Memory)
   * 
   * Issue Verifiable Credential as proof of validation
   */
  async attestValidation(
    analysis: VNXAnalysisResult, 
    ingestion: VNXIngestionData
  ): Promise<VNXAttestation> {
    if (!this.identity) {
      throw new Error('VNX identity not initialized');
    }

    const issuanceDate = new Date().toISOString();
    
    // Create credential subject
    const credentialSubject = {
      id: `${ingestion.metadata.region}-${ingestion.metadata.node}`,
      carbonIntensity: `${Math.round(analysis.analysisDetails.marginalEmissionRate)} kg/MWh`,
      marginalRateSource: 'PJM-DataMiner-2',
      auditStatus: `Verified-By-Vera-${analysis.validation}`,
      confidenceScore: analysis.confidence,
      validationStandard: analysis.standard,
      gridRegion: ingestion.metadata.region
    };

    // Create unsigned credential
    const unsignedCredential = {
      type: 'VerifiableCredential',
      issuer: this.identity.did,
      issuanceDate,
      credentialSubject
    };

    // Sign the credential
    const signature = await this.didManager.signWithDID(unsignedCredential, this.identity);

    const attestation: VNXAttestation = {
      type: 'VerifiableCredential',
      issuer: this.identity.did,
      issuanceDate,
      credentialSubject,
      proof: {
        type: 'Ed25519Signature2018',
        verificationMethod: `${this.identity.did}#key-1`,
        created: issuanceDate,
        proofPurpose: 'assertionMethod',
        signature
      }
    };

    // Issue to Memory topic
    await this.issueToMemory(attestation);

    logger.info('VNXValidationWorkflow', {
      phase: 'ATTESTATION',
      credentialId: credentialSubject.id,
      issuer: attestation.issuer,
      signaturePresent: !!attestation.proof.signature,
      message: 'Verifiable Credential issued'
    });

    return attestation;
  }

  /**
   * Complete VNX-R workflow: Ingest → Analyze → Attest
   */
  async executeCompleteWorkflow(rawData: any, metadata: VNXIngestionData['metadata']): Promise<{
    ingestion: VNXIngestionData;
    analysis: VNXAnalysisResult;
    attestation: VNXAttestation;
  }> {
    const ingestion = await this.ingestData(rawData, metadata);
    const analysis = await this.analyzeData(ingestion);
    const attestation = await this.attestValidation(analysis, ingestion);

    return { ingestion, analysis, attestation };
  }

  /**
   * Log data to Nerves topic (Ingestion)
   */
  private async logToNerves(data: VNXIngestionData): Promise<void> {
    // In production, this submits to HCS topic
    // For now, log to console and file
    logger.info('VNX-NERVES', {
      topic: VNX_TOPICS.NERVES,
      dataHash: data.dataHash,
      timestamp: data.timestamp,
      message: 'Raw data hash logged to Nerves'
    });
  }

  /**
   * Log analysis to Lungs topic (Analysis)
   */
  private async logToLungs(analysis: VNXAnalysisResult, ingestion: VNXIngestionData): Promise<void> {
    const message = {
      type: 'VNX-Analysis-Result',
      version: '1.0.0',
      standard: analysis.standard,
      auditor: analysis.auditor,
      dataHash: ingestion.dataHash,
      analysis,
      timestamp: analysis.timestamp
    };

    logger.info('VNX-LUNGS', {
      topic: VNX_TOPICS.LUNGS,
      standard: analysis.standard,
      gridIntensity: analysis.gridIntensityScore,
      message: 'Analysis logged to Lungs'
    });

    // In production, submit to HCS topic 0.0.10409353
  }

  /**
   * Issue VC to Memory topic (Attestation)
   */
  private async issueToMemory(attestation: VNXAttestation): Promise<void> {
    logger.info('VNX-MEMORY', {
      topic: VNX_TOPICS.MEMORY,
      credentialType: attestation.type,
      issuer: attestation.issuer,
      subject: attestation.credentialSubject.id,
      message: 'Verifiable Credential issued to Memory'
    });

    // In production, submit to HCS topic 0.0.10409355
  }

  /**
   * Hash data for integrity verification
   */
  private hashData(data: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Estimate emission rate from fuel mix
   */
  private estimateFromFuelMix(fuelMix: Record<string, number> | undefined): number {
    if (!fuelMix) return 850; // Default WV coal-heavy estimate

    // Emission factors (kg CO2/MWh)
    const factors: Record<string, number> = {
      coal: 950,
      natural_gas: 450,
      oil: 750,
      nuclear: 0,
      hydro: 0,
      wind: 0,
      solar: 0,
      biomass: 200,
      other: 500
    };

    let totalEmission = 0;
    let totalPercentage = 0;

    for (const [fuel, percentage] of Object.entries(fuelMix)) {
      const factor = factors[fuel.toLowerCase()] || 500;
      totalEmission += (percentage / 100) * factor;
      totalPercentage += percentage;
    }

    return totalPercentage > 0 ? totalEmission : 850;
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(data: any): number {
    let score = 0.5; // Base score

    // Data completeness bonus
    if (data.marginal_emission_rate) score += 0.2;
    if (data.fuel_mix && Object.keys(data.fuel_mix).length > 0) score += 0.15;
    if (data.timestamp) score += 0.1;
    if (data.node && data.region) score += 0.05;

    // Cap at 0.95
    return Math.min(score, 0.95);
  }

  /**
   * Get VNX status
   */
  getStatus(): {
    initialized: boolean;
    did: string | null;
    topics: typeof VNX_TOPICS;
  } {
    return {
      initialized: this.isInitialized,
      did: this.identity?.did || null,
      topics: VNX_TOPICS
    };
  }

  /**
   * Print workflow status
   */
  printStatus(): void {
    const status = this.getStatus();
    
    console.log('\n🌬️ VNX-R VALIDATION WORKFLOW');
    console.log('==============================\n');
    console.log(`Initialized: ${status.initialized ? '✅' : '❌'}`);
    console.log(`Vera DID: ${status.did || 'Not created'}`);
    console.log(`\nTopics:`);
    console.log(`  Brainstem (Identity): ${status.topics.BRAINSTEM}`);
    console.log(`  Nerves (Ingestion):   ${status.topics.NERVES}`);
    console.log(`  Lungs (Analysis):     ${status.topics.LUNGS}`);
    console.log(`  Memory (Attestation): ${status.topics.MEMORY}`);
    console.log(`\nThresholds:`);
    console.log(`  Low Carbon:    < ${this.thresholds.lowCarbon} kg/MWh`);
    console.log(`  Medium Carbon: < ${this.thresholds.mediumCarbon} kg/MWh`);
    console.log(`  High Carbon:   > ${this.thresholds.mediumCarbon} kg/MWh`);
    console.log('\n==============================\n');
  }
}
