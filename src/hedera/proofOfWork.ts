/**
 * Vera Proof of Work & Completion Attestation System
 * 
 * Records immutable proof of Vera's work on Hedera Consensus Service (HCS):
 * - Task completions with cryptographic signatures
 * - Sub-agent work attestations
 * - Tool execution logs
 * - Performance metrics
 * 
 * This creates an auditable trail of Vera's capabilities and reliability.
 */

import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';

export interface WorkRecord {
  id: string;
  timestamp: number;
  taskType: 'sub_agent' | 'tool_execution' | 'planning' | 'analysis' | 'contract_deployment';
  description: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  toolsUsed: string[];
  durationMs: number;
  success: boolean;
  error?: string;
  signature?: string;
}

export interface CompletionCertificate {
  id: string;
  workRecordIds: string[];
  timestamp: number;
  projectName: string;
  description: string;
  deliverables: string[];
  metrics: {
    totalTasks: number;
    successfulTasks: number;
    totalDurationMs: number;
    toolsUsed: string[];
    uniqueCapabilities: string[];
  };
  signature: string;
}

export interface AgentCapabilityProof {
  agentId: string;
  capabilities: string[];
  proofRecords: WorkRecord[];
  totalTasksCompleted: number;
  successRate: number;
  registeredAt: number;
  lastActiveAt: number;
}

class ProofOfWorkRegistry {
  private client: Client;
  private powTopicId: string | null = null;
  private certificateTopicId: string | null = null;
  private workRecords: Map<string, WorkRecord> = new Map();
  private certificates: Map<string, CompletionCertificate> = new Map();

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      const privateKey = this.parsePrivateKey(config.HEDERA_OPERATOR_PRIVATE_KEY);
      this.client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
    }
    
    // Load existing topic IDs from environment if available
    if (process.env.POW_TOPIC_ID) {
      this.powTopicId = process.env.POW_TOPIC_ID;
    }
    if (process.env.CERT_TOPIC_ID) {
      this.certificateTopicId = process.env.CERT_TOPIC_ID;
    }
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
   * Initialize proof of work topics on HCS
   */
  async initialize(): Promise<{ powTopicId: string; certificateTopicId: string }> {
    logger.info('PoW', { message: 'Initializing Proof of Work registry...' });

    // Create topic for work records
    const powTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera Proof of Work Records')
      .setSubmitKey(this.client.operatorPublicKey!)
      .execute(this.client);
    const powReceipt = await powTx.getReceipt(this.client);
    this.powTopicId = powReceipt.topicId?.toString() ?? '';

    // Create topic for completion certificates
    const certTx = await new TopicCreateTransaction()
      .setTopicMemo('Vera Completion Certificates')
      .setSubmitKey(this.client.operatorPublicKey!)
      .execute(this.client);
    const certReceipt = await certTx.getReceipt(this.client);
    this.certificateTopicId = certReceipt.topicId?.toString() ?? '';

    logger.info('PoW', { 
      powTopicId: this.powTopicId, 
      certTopicId: this.certificateTopicId,
      message: 'Proof of Work topics created' 
    });

    return {
      powTopicId: this.powTopicId,
      certificateTopicId: this.certificateTopicId,
    };
  }

  /**
   * Record a work completion with cryptographic proof
   */
  async recordWork(record: Omit<WorkRecord, 'id' | 'timestamp' | 'signature'>): Promise<WorkRecord> {
    if (!this.powTopicId) {
      throw new Error('Proof of Work not initialized - call initialize() first');
    }

    const fullRecord: WorkRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...record,
    };

    // Create cryptographic signature of the work
    const signature = this.signWorkRecord(fullRecord);
    fullRecord.signature = signature;

    // Store locally
    this.workRecords.set(fullRecord.id, fullRecord);

    // Submit to HCS for immutable record
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.powTopicId)
      .setMessage(JSON.stringify(fullRecord))
      .execute(this.client);

    logger.info('PoW', { 
      workId: fullRecord.id, 
      type: fullRecord.taskType,
      success: fullRecord.success,
      message: 'Work recorded' 
    });

    return fullRecord;
  }

  /**
   * Create a completion certificate for a project
   */
  async createCompletionCertificate(
    projectName: string,
    description: string,
    workRecordIds: string[]
  ): Promise<CompletionCertificate> {
    if (!this.certificateTopicId) {
      throw new Error('Proof of Work not initialized');
    }

    // Gather work records
    const records = workRecordIds.map(id => this.workRecords.get(id)).filter(Boolean) as WorkRecord[];
    
    if (records.length === 0) {
      throw new Error('No valid work records found for certificate');
    }

    // Calculate metrics
    const successfulRecords = records.filter(r => r.success);
    const allTools = records.flatMap(r => r.toolsUsed);
    const uniqueTools = [...new Set(allTools)];
    const uniqueCapabilities = [...new Set(records.map(r => r.taskType))];

    const certificate: CompletionCertificate = {
      id: crypto.randomUUID(),
      workRecordIds,
      timestamp: Date.now(),
      projectName,
      description,
      deliverables: records.map(r => r.description),
      metrics: {
        totalTasks: records.length,
        successfulTasks: successfulRecords.length,
        totalDurationMs: records.reduce((sum, r) => sum + r.durationMs, 0),
        toolsUsed: uniqueTools,
        uniqueCapabilities,
      },
      signature: '', // Will be set below
    };

    // Sign the certificate
    certificate.signature = this.signCertificate(certificate);

    // Store locally
    this.certificates.set(certificate.id, certificate);

    // Submit to HCS
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.certificateTopicId)
      .setMessage(JSON.stringify(certificate))
      .execute(this.client);

    logger.info('PoW', { 
      certId: certificate.id, 
      project: projectName,
      tasks: records.length,
      message: 'Completion certificate issued' 
    });

    return certificate;
  }

  /**
   * Generate proof of capabilities for agent registration
   */
  async generateCapabilityProof(agentId: string): Promise<AgentCapabilityProof> {
    const records = Array.from(this.workRecords.values());
    const successfulRecords = records.filter(r => r.success);
    
    const capabilities = [...new Set(records.map(r => r.taskType))];
    const recentRecords = records
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10); // Last 10 records as proof

    return {
      agentId,
      capabilities,
      proofRecords: recentRecords,
      totalTasksCompleted: records.length,
      successRate: records.length > 0 ? successfulRecords.length / records.length : 0,
      registeredAt: records.length > 0 ? Math.min(...records.map(r => r.timestamp)) : Date.now(),
      lastActiveAt: records.length > 0 ? Math.max(...records.map(r => r.timestamp)) : Date.now(),
    };
  }

  /**
   * Verify a work record signature
   */
  verifyWorkRecord(record: WorkRecord): boolean {
    if (!record.signature) return false;
    
    const data = JSON.stringify({
      id: record.id,
      timestamp: record.timestamp,
      taskType: record.taskType,
      description: record.description,
      inputs: record.inputs,
      outputs: record.outputs,
      toolsUsed: record.toolsUsed,
      durationMs: record.durationMs,
      success: record.success,
    });

    // In production, this would use proper cryptographic verification
    // For now, we verify the signature matches our expected format
    const expectedSignature = crypto
      .createHmac('sha256', config.HEDERA_OPERATOR_PRIVATE_KEY || 'vera-secret')
      .update(data)
      .digest('hex');

    return record.signature === expectedSignature;
  }

  /**
   * Get work history with verification
   */
  async getVerifiedWorkHistory(limit: number = 50): Promise<{
    records: WorkRecord[];
    verified: number;
    failed: number;
  }> {
    const records = Array.from(this.workRecords.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    let verified = 0;
    let failed = 0;

    for (const record of records) {
      if (this.verifyWorkRecord(record)) {
        verified++;
      } else {
        failed++;
      }
    }

    return { records, verified, failed };
  }

  /**
   * Get all completion certificates
   */
  getCompletionCertificates(): CompletionCertificate[] {
    return Array.from(this.certificates.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Private: Sign a work record
   */
  private signWorkRecord(record: WorkRecord): string {
    const data = JSON.stringify({
      id: record.id,
      timestamp: record.timestamp,
      taskType: record.taskType,
      description: record.description,
      inputs: record.inputs,
      outputs: record.outputs,
      toolsUsed: record.toolsUsed,
      durationMs: record.durationMs,
      success: record.success,
    });

    return crypto
      .createHmac('sha256', config.HEDERA_OPERATOR_PRIVATE_KEY || 'vera-secret')
      .update(data)
      .digest('hex');
  }

  /**
   * Private: Sign a certificate
   */
  private signCertificate(cert: CompletionCertificate): string {
    const data = JSON.stringify({
      id: cert.id,
      workRecordIds: cert.workRecordIds,
      timestamp: cert.timestamp,
      projectName: cert.projectName,
      description: cert.description,
      metrics: cert.metrics,
    });

    return crypto
      .createHmac('sha256', config.HEDERA_OPERATOR_PRIVATE_KEY || 'vera-secret')
      .update(data)
      .digest('hex');
  }

  /**
   * Get topic IDs for external reference
   */
  getTopicIds(): { powTopicId: string | null; certificateTopicId: string | null } {
    return {
      powTopicId: this.powTopicId,
      certificateTopicId: this.certificateTopicId,
    };
  }
}

// Singleton instance
let powRegistry: ProofOfWorkRegistry | null = null;

export function getProofOfWorkRegistry(): ProofOfWorkRegistry {
  if (!powRegistry) {
    powRegistry = new ProofOfWorkRegistry();
  }
  return powRegistry;
}

export function resetProofOfWorkRegistry(): void {
  powRegistry = null;
}

export { ProofOfWorkRegistry };
