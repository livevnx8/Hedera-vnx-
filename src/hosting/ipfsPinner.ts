/**
 * IPFS Pinner Module
 * Pins Vera code and state to IPFS for content-addressed, immutable storage
 * 
 * Responsibilities:
 * - Pin code directories to IPFS
 * - Retrieve content by CID
 * - Manage pinning service integration
 * - Content versioning and updates
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import { createHash } from 'crypto';

export interface IpfsPin {
  cid: string;
  name: string;
  size: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ContentVersion {
  version: string;
  cid: string;
  timestamp: number;
  changes: string[];
  signature?: string;  // Vera's signature of the CID
}

export class IpfsPinner extends EventEmitter {
  private apiUrl: string;
  private pinningService: string | null;
  private pinnedContent = new Map<string, IpfsPin>();
  private versionHistory: ContentVersion[] = [];

  constructor() {
    super();
    this.apiUrl = config.IPFS_API_URL || 'http://localhost:5001';
    this.pinningService = config.IPFS_PINNING_SERVICE || null;
  }

  /**
   * Pin a directory to IPFS
   */
  async pinDirectory(path: string, metadata?: Record<string, unknown>): Promise<string> {
    logger.info('IpfsPinner', { message: 'Pinning directory', path });

    try {
      // Use IPFS API to add directory
      const formData = new FormData();
      
      // In production, this would recursively add all files in the directory
      // For now, simulate with a hash of the path
      const simulatedCid = this.simulateCid(path);

      const pin: IpfsPin = {
        cid: simulatedCid,
        name: path.split('/').pop() || 'unknown',
        size: 0, // Would be calculated from actual files
        timestamp: Date.now(),
        metadata,
      };

      this.pinnedContent.set(simulatedCid, pin);

      // Also pin to external pinning service if configured
      if (this.pinningService) {
        await this.pinToExternalService(simulatedCid);
      }

      this.emit('pinned', pin);

      logger.info('IpfsPinner', {
        message: 'Directory pinned',
        cid: simulatedCid,
        path,
      });

      return simulatedCid;
    } catch (error) {
      logger.error('IpfsPinner', {
        message: 'Failed to pin directory',
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Pin Vera code as a new version
   */
  async pinVeraVersion(version: string, codePath: string, changes: string[]): Promise<ContentVersion> {
    logger.info('IpfsPinner', { message: 'Pinning Vera version', version });

    // Pin the code directory
    const cid = await this.pinDirectory(codePath, {
      type: 'vera-code',
      version,
      timestamp: Date.now(),
    });

    // Sign the CID (in production, use Vera's actual signing key)
    const signature = this.signCid(cid);

    const contentVersion: ContentVersion = {
      version,
      cid,
      timestamp: Date.now(),
      changes,
      signature,
    };

    this.versionHistory.push(contentVersion);

    // Log to HCS for immutability
    await this.logVersionToHcs(contentVersion);

    this.emit('version_pinned', contentVersion);

    logger.info('IpfsPinner', {
      message: 'Vera version pinned',
      version,
      cid,
      changes: changes.length,
    });

    return contentVersion;
  }

  /**
   * Retrieve content by CID
   */
  async retrieve(cid: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/cat?arg=${cid}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`IPFS retrieval failed: ${response.status}`);
      }

      const data = await response.arrayBuffer();
      return new Uint8Array(data);
    } catch (error) {
      logger.error('IpfsPinner', {
        message: 'Failed to retrieve content',
        cid,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get latest pinned version
   */
  getLatestVersion(): ContentVersion | null {
    if (this.versionHistory.length === 0) return null;
    return this.versionHistory[this.versionHistory.length - 1];
  }

  /**
   * Get version by CID
   */
  getVersionByCid(cid: string): ContentVersion | undefined {
    return this.versionHistory.find(v => v.cid === cid);
  }

  /**
   * Get all version history
   */
  getVersionHistory(): ContentVersion[] {
    return [...this.versionHistory];
  }

  /**
   * Verify content signature
   */
  verifySignature(cid: string, signature: string): boolean {
    // In production: use actual cryptographic verification
    // For now, simple hash comparison
    const expected = this.signCid(cid);
    return signature === expected;
  }

  /**
   * Unpin content to free up space
   */
  async unpin(cid: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v0/pin/rm?arg=${cid}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Unpin failed: ${response.status}`);
      }

      this.pinnedContent.delete(cid);
      
      logger.info('IpfsPinner', { message: 'Content unpinned', cid });
    } catch (error) {
      logger.error('IpfsPinner', {
        message: 'Failed to unpin content',
        cid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all pinned content
   */
  getPinnedContent(): IpfsPin[] {
    return Array.from(this.pinnedContent.values());
  }

  /**
   * Get pinning statistics
   */
  getStats(): {
    totalPinned: number;
    totalSize: number;
    versionCount: number;
    pinningService: boolean;
  } {
    const pins = this.getPinnedContent();
    return {
      totalPinned: pins.length,
      totalSize: pins.reduce((sum, p) => sum + p.size, 0),
      versionCount: this.versionHistory.length,
      pinningService: this.pinningService !== null,
    };
  }

  /**
   * Simulate CID generation (in production, use actual IPFS)
   */
  private simulateCid(content: string): string {
    const hash = createHash('sha256').update(content).digest('hex');
    return `Qm${hash.slice(0, 44)}`;
  }

  /**
   * Sign CID (mock implementation)
   */
  private signCid(cid: string): string {
    const hash = createHash('sha256').update(`vera:${cid}`).digest('hex');
    return `sig-${hash.slice(0, 32)}`;
  }

  /**
   * Pin to external pinning service
   */
  private async pinToExternalService(cid: string): Promise<void> {
    if (!this.pinningService) return;

    try {
      const response = await fetch(`${this.pinningService}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid }),
      });

      if (!response.ok) {
        logger.warn('IpfsPinner', {
          message: 'External pinning failed',
          cid,
          status: response.status,
        });
      }
    } catch (error) {
      logger.warn('IpfsPinner', {
        message: 'External pinning error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log version to HCS for immutability
   */
  private async logVersionToHcs(version: ContentVersion): Promise<void> {
    // In production: submit to HCS audit topic
    logger.debug('IpfsPinner', {
      message: 'Version logged to HCS',
      version: version.version,
      cid: version.cid,
    });
  }
}

// Singleton
export const ipfsPinner = new IpfsPinner();
export default ipfsPinner;
