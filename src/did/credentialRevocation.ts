/**
 * Credential Revocation
 * 
 * Manages credential revocation status using
 * W3C Status List 2021 and Hedera Consensus Service.
 */

import { logger } from '../monitoring/logger.js';
import type { RevocationStatus } from './types.js';

interface RevocationConfig {
  statusListSize: number;
  hcsTopicId?: string;
  publishIntervalMinutes: number;
}

interface RevocationEntry {
  credentialId: string;
  statusListIndex: number;
  revoked: boolean;
  revokedAt?: number;
  reason?: string;
  revokedBy: string;
}

export class CredentialRevocation {
  private config: RevocationConfig;
  private statusList: Map<number, RevocationEntry> = new Map();
  private credentialIndex: Map<string, number> = new Map(); // credentialId -> index
  private nextIndex: number = 0;
  private pendingUpdates: Set<number> = new Set();

  constructor(config: Partial<RevocationConfig> = {}) {
    this.config = {
      statusListSize: 131072, // 16KB bitstring
      publishIntervalMinutes: 60,
      ...config
    };
  }

  /**
   * Revoke a credential
   */
  async revokeCredential(
    credentialId: string,
    revokedBy: string,
    reason?: string
  ): Promise<RevocationStatus> {
    try {
      let index = this.credentialIndex.get(credentialId);

      if (index === undefined) {
        // Assign new index
        index = this.nextIndex++;
        if (index >= this.config.statusListSize) {
          throw new Error('Status list full');
        }
        this.credentialIndex.set(credentialId, index);
      }

      const entry: RevocationEntry = {
        credentialId,
        statusListIndex: index,
        revoked: true,
        revokedAt: Date.now(),
        reason,
        revokedBy
      };

      this.statusList.set(index, entry);
      this.pendingUpdates.add(index);

      const status: RevocationStatus = {
        id: `urn:uuid:${credentialId}`,
        type: 'BitstringStatusListEntry',
        statusListIndex: index.toString(),
        statusListCredential: this.getStatusListCredentialId(),
        revoked: true,
        revokedAt: entry.revokedAt,
        reason
      };

      logger.info('CredentialRevocation', {
        message: 'Credential revoked',
        credentialId,
        index,
        revokedBy,
        reason
      });

      return status;

    } catch (error) {
      logger.error('CredentialRevocation', {
        message: 'Revocation failed',
        credentialId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Un-revoke a credential (reinstate)
   */
  async reinstateCredential(
    credentialId: string,
    reinstatedBy: string
  ): Promise<RevocationStatus> {
    const index = this.credentialIndex.get(credentialId);
    if (index === undefined) {
      throw new Error('Credential not found in status list');
    }

    const entry = this.statusList.get(index);
    if (!entry) {
      throw new Error('Status entry not found');
    }

    entry.revoked = false;
    entry.revokedAt = undefined;
    entry.reason = undefined;
    entry.revokedBy = reinstatedBy;

    this.pendingUpdates.add(index);

    const status: RevocationStatus = {
      id: `urn:uuid:${credentialId}`,
      type: 'BitstringStatusListEntry',
      statusListIndex: index.toString(),
      statusListCredential: this.getStatusListCredentialId(),
      revoked: false
    };

    logger.info('CredentialRevocation', {
      message: 'Credential reinstated',
      credentialId,
      index,
      reinstatedBy
    });

    return status;
  }

  /**
   * Check revocation status
   */
  async checkStatus(credentialId: string): Promise<RevocationStatus> {
    const index = this.credentialIndex.get(credentialId);
    if (index === undefined) {
      // Not in status list = not revoked
      return {
        id: `urn:uuid:${credentialId}`,
        type: 'BitstringStatusListEntry',
        statusListIndex: '-1',
        statusListCredential: this.getStatusListCredentialId(),
        revoked: false
      };
    }

    const entry = this.statusList.get(index);
    if (!entry) {
      return {
        id: `urn:uuid:${credentialId}`,
        type: 'BitstringStatusListEntry',
        statusListIndex: index.toString(),
        statusListCredential: this.getStatusListCredentialId(),
        revoked: false
      };
    }

    return {
      id: `urn:uuid:${credentialId}`,
      type: 'BitstringStatusListEntry',
      statusListIndex: index.toString(),
      statusListCredential: this.getStatusListCredentialId(),
      revoked: entry.revoked,
      revokedAt: entry.revokedAt,
      reason: entry.reason
    };
  }

  /**
   * Get the status list credential (compressed bitstring)
   */
  async getStatusListCredential(): Promise<{
    id: string;
    type: string[];
    statusPurpose: string;
    encodedList: string;
    validFrom: string;
    validUntil?: string;
  }> {
    // Build bitstring
    const bitstring = new Array(this.config.statusListSize).fill(0);
    for (const [index, entry] of this.statusList) {
      bitstring[index] = entry.revoked ? 1 : 0;
    }

    // Compress (mock - would use GZIP or similar in production)
    const encodedList = Buffer.from(bitstring.join('')).toString('base64');

    return {
      id: this.getStatusListCredentialId(),
      type: ['VerifiableCredential', 'BitstringStatusListCredential'],
      statusPurpose: 'revocation',
      encodedList,
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  /**
   * Publish status list to Hedera
   */
  async publishStatusList(): Promise<string> {
    try {
      const credential = await this.getStatusListCredential();

      // Mock HCS publication
      const txId = `hcs-${Date.now()}`;
      this.pendingUpdates.clear();

      logger.info('CredentialRevocation', {
        message: 'Status list published',
        txId,
        topicId: this.config.hcsTopicId || 'mock-topic',
        revokedCount: this.getRevokedCount()
      });

      return txId;

    } catch (error) {
      logger.error('CredentialRevocation', {
        message: 'Publish failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Batch revoke multiple credentials
   */
  async batchRevoke(
    credentials: Array<{ credentialId: string; reason?: string }>,
    revokedBy: string
  ): Promise<RevocationStatus[]> {
    const results: RevocationStatus[] = [];

    for (const { credentialId, reason } of credentials) {
      try {
        const status = await this.revokeCredential(credentialId, revokedBy, reason);
        results.push(status);
      } catch (error) {
        logger.error('CredentialRevocation', {
          message: 'Batch revoke failed for credential',
          credentialId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * Get revocation statistics
   */
  getStats() {
    return {
      timestamp: Date.now(),
      totalEntries: this.statusList.size,
      revokedCount: this.getRevokedCount(),
      activeCount: this.statusList.size - this.getRevokedCount(),
      pendingUpdates: this.pendingUpdates.size,
      utilization: (this.statusList.size / this.config.statusListSize) * 100,
      config: this.config
    };
  }

  /**
   * Get revoked credential IDs
   */
  getRevokedCredentials(): string[] {
    const revoked: string[] = [];
    for (const entry of this.statusList.values()) {
      if (entry.revoked) {
        revoked.push(entry.credentialId);
      }
    }
    return revoked;
  }

  // Private methods
  private getRevokedCount(): number {
    let count = 0;
    for (const entry of this.statusList.values()) {
      if (entry.revoked) count++;
    }
    return count;
  }

  private getStatusListCredentialId(): string {
    return `urn:uuid:status-list-${this.config.hcsTopicId || 'default'}`;
  }
}

// Singleton
let revocationInstance: CredentialRevocation | null = null;

export function getCredentialRevocation(config?: Partial<RevocationConfig>): CredentialRevocation {
  if (!revocationInstance) {
    revocationInstance = new CredentialRevocation(config);
  }
  return revocationInstance;
}
