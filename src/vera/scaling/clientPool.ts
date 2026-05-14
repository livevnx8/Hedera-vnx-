import { Client, PrivateKey } from '@hashgraph/sdk';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PooledClient {
  client: Client;
  inUse: boolean;
  lastUsedAt: number;
  totalUses: number;
}

export interface ClientPoolStats {
  size: number;
  available: number;
  inUse: number;
  totalAcquires: number;
  totalReleases: number;
}

// ─── Pool ────────────────────────────────────────────────────────────────────

export class HederaClientPool {
  private pool: PooledClient[] = [];
  private readonly maxSize: number;
  private totalAcquires = 0;
  private totalReleases = 0;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Acquire a client from the pool. Creates a new one if pool isn't full.
   * Returns the client and a release callback.
   */
  acquire(): { client: Client; release: () => void } {
    // Try to find an idle client
    const idle = this.pool.find((p) => !p.inUse);
    if (idle) {
      idle.inUse = true;
      idle.lastUsedAt = Date.now();
      idle.totalUses++;
      this.totalAcquires++;

      return {
        client: idle.client,
        release: () => this.release(idle),
      };
    }

    // Create a new client if pool isn't full
    if (this.pool.length < this.maxSize) {
      const client = this.createClient();
      const entry: PooledClient = {
        client,
        inUse: true,
        lastUsedAt: Date.now(),
        totalUses: 1,
      };
      this.pool.push(entry);
      this.totalAcquires++;

      logger.debug('HederaClientPool', {
        message: 'New client created',
        poolSize: this.pool.length,
        maxSize: this.maxSize,
      });

      return {
        client: entry.client,
        release: () => this.release(entry),
      };
    }

    // Pool exhausted — wait for first available (blocking fallback)
    // In practice, callers should be throttled by the rate limiter
    logger.warn('HederaClientPool', {
      message: 'Pool exhausted, reusing oldest client',
      poolSize: this.pool.length,
    });

    const oldest = this.pool.reduce((a, b) => (a.lastUsedAt < b.lastUsedAt ? a : b));
    oldest.lastUsedAt = Date.now();
    oldest.totalUses++;
    this.totalAcquires++;

    return {
      client: oldest.client,
      release: () => {}, // no-op since it was already in-use
    };
  }

  private release(entry: PooledClient): void {
    entry.inUse = false;
    this.totalReleases++;
  }

  private createClient(): Client {
    const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
      let privateKey: PrivateKey;

      if (keyStr.length === 64) {
        try {
          privateKey = PrivateKey.fromStringECDSA(keyStr);
        } catch {
          privateKey = PrivateKey.fromStringED25519(keyStr);
        }
      } else {
        privateKey = PrivateKey.fromString(keyStr);
      }

      client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
    }

    return client;
  }

  getStats(): ClientPoolStats {
    return {
      size: this.pool.length,
      available: this.pool.filter((p) => !p.inUse).length,
      inUse: this.pool.filter((p) => p.inUse).length,
      totalAcquires: this.totalAcquires,
      totalReleases: this.totalReleases,
    };
  }

  shutdown(): void {
    for (const entry of this.pool) {
      try {
        entry.client.close();
      } catch {
        // ignore close errors
      }
    }
    this.pool = [];
    logger.info('HederaClientPool', { message: 'Pool shutdown' });
  }
}

export const clientPool = new HederaClientPool();
