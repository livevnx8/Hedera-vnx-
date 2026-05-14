import { Client } from '@hashgraph/sdk';

/**
 * Hedera Client Connection Pool
 * 
 * Maintains a pool of Hedera client connections to eliminate
 * connection overhead per request. Reduces latency and improves
 * throughput for high-frequency operations.
 * 
 * Benefits:
 * - Eliminates connection setup overhead
 * - Handles connection failures gracefully
 * - Enforces max connection limits
 * - Automatic connection health checks
 */

interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
}

interface PooledClient {
  client: Client;
  id: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  healthy: boolean;
}

interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalRequests: number;
  failedRequests: number;
  avgWaitTimeMs: number;
}

export class HederaClientPool {
  private pool: PooledClient[] = [];
  private waitingQueue: Array<{
    resolve: (client: Client) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    requestedAt: number;
  }> = [];
  private config: PoolConfig;
  private network: string;
  private operatorId: string;
  private operatorKey: string;
  private stats: PoolStats;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    network: string,
    operatorId: string,
    operatorKey: string,
    config: Partial<PoolConfig> = {}
  ) {
    this.network = network;
    this.operatorId = operatorId;
    this.operatorKey = operatorKey;
    
    this.config = {
      minConnections: config.minConnections || 5,
      maxConnections: config.maxConnections || 20,
      acquireTimeoutMs: config.acquireTimeoutMs || 5000,
      idleTimeoutMs: config.idleTimeoutMs || 300000, // 5 minutes
      healthCheckIntervalMs: config.healthCheckIntervalMs || 60000 // 1 minute
    };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalRequests: 0,
      failedRequests: 0,
      avgWaitTimeMs: 0
    };

    // Start with minimum connections
    this.initializeMinConnections();
    
    // Start health check interval
    this.startHealthChecks();
  }

  /**
   * Acquire a client from the pool
   * Waits if no clients are available (up to acquireTimeoutMs)
   */
  async acquire(): Promise<Client> {
    if (this.closed) {
      throw new Error('Pool is closed');
    }

    // Try to get an available client immediately
    const available = this.getAvailableClient();
    if (available) {
      return this.markClientActive(available);
    }

    // Create new connection if under max
    if (this.pool.length < this.config.maxConnections) {
      const newClient = await this.createClient();
      return this.markClientActive(newClient);
    }

    // Wait for a client to become available
    return this.waitForClient();
  }

  /**
   * Release a client back to the pool
   */
  release(client: Client): void {
    const pooledClient = this.pool.find(c => c.client === client);
    if (!pooledClient) {
      return;
    }

    pooledClient.lastUsedAt = Date.now();
    
    // Check if there are waiting requests
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift();
      if (waiter) {
        this.stats.waitingRequests = this.waitingQueue.length;
        const waitTime = Date.now() - waiter.requestedAt;
        this.updateAvgWaitTime(waitTime);
        waiter.resolve(client);
        return;
      }
    }

    // Mark as idle
    this.updateStats();
  }

  /**
   * Execute a function with an auto-acquired client
   * Automatically releases the client when done
   */
  async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    try {
      return await fn(client);
    } finally {
      this.release(client);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Close the pool and all connections
   */
  async close(): Promise<void> {
    this.closed = true;

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Reject all waiting requests
    while (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift();
      if (waiter) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error('Pool is closing'));
      }
    }

    // Clear pool (Hedera clients don't have explicit close, but we clear references)
    this.pool = [];
    this.stats.totalConnections = 0;
    this.stats.activeConnections = 0;
    this.stats.idleConnections = 0;
  }

  /**
   * Initialize minimum connections
   */
  private async initializeMinConnections(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < this.config.minConnections; i++) {
      promises.push(
        this.createClient().then(client => {
          this.pool.push(client);
        }).catch(error => {
          console.error('Failed to create initial connection:', error);
        })
      );
    }

    await Promise.all(promises);
    this.updateStats();
  }

  /**
   * Create a new Hedera client
   */
  private async createClient(): Promise<PooledClient> {
    try {
      const client = this.network === 'mainnet' 
        ? Client.forMainnet() 
        : Client.forTestnet();

      // Parse and set operator
      const { PrivateKey } = await import('@hashgraph/sdk');
      let privateKey;
      
      if (this.operatorKey.length === 64) {
        try {
          privateKey = PrivateKey.fromStringECDSA(this.operatorKey);
        } catch {
          privateKey = PrivateKey.fromStringED25519(this.operatorKey);
        }
      } else {
        privateKey = PrivateKey.fromString(this.operatorKey);
      }

      client.setOperator(this.operatorId, privateKey);

      const pooledClient: PooledClient = {
        client,
        id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        useCount: 0,
        healthy: true
      };

      return pooledClient;
    } catch (error) {
      throw new Error(`Failed to create Hedera client: ${error}`);
    }
  }

  /**
   * Get an available (idle) client from the pool
   */
  private getAvailableClient(): PooledClient | null {
    // Find oldest idle client (LRU)
    let oldest: PooledClient | null = null;
    
    for (const client of this.pool) {
      if (client.healthy && (!oldest || client.lastUsedAt < oldest.lastUsedAt)) {
        oldest = client;
      }
    }

    return oldest;
  }

  /**
   * Mark a client as active and update stats
   */
  private markClientActive(pooledClient: PooledClient): Client {
    pooledClient.useCount++;
    pooledClient.lastUsedAt = Date.now();
    this.updateStats();
    return pooledClient.client;
  }

  /**
   * Wait for a client to become available
   */
  private async waitForClient(): Promise<Client> {
    return new Promise((resolve, reject) => {
      const requestedAt = Date.now();
      
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.requestedAt === requestedAt);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
          this.stats.waitingRequests = this.waitingQueue.length;
        }
        reject(new Error(`Timeout waiting for client (${this.config.acquireTimeoutMs}ms)`));
      }, this.config.acquireTimeoutMs);

      this.waitingQueue.push({ resolve, reject, timeout, requestedAt });
      this.stats.waitingRequests = this.waitingQueue.length;
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health checks on all connections
   */
  private async performHealthChecks(): Promise<void> {
    const { AccountBalanceQuery } = await import('@hashgraph/sdk');
    
    for (const pooledClient of this.pool) {
      try {
        // Simple health check: query operator balance
        const query = new AccountBalanceQuery()
          .setAccountId(this.operatorId);
        
        await query.execute(pooledClient.client);
        pooledClient.healthy = true;
      } catch (error) {
        console.warn(`Connection ${pooledClient.id} failed health check:`, error);
        pooledClient.healthy = false;
        
        // Remove unhealthy connection
        const index = this.pool.indexOf(pooledClient);
        if (index !== -1) {
          this.pool.splice(index, 1);
        }
      }
    }

    // Replenish if below minimum
    const healthy = this.pool.filter(c => c.healthy).length;
    if (healthy < this.config.minConnections) {
      await this.initializeMinConnections();
    }

    this.updateStats();
  }

  /**
   * Update pool statistics
   */
  private updateStats(): void {
    const inUse = this.pool.filter(c => 
      Date.now() - c.lastUsedAt < 1000 // Recently used
    ).length;

    this.stats.totalConnections = this.pool.length;
    this.stats.activeConnections = inUse;
    this.stats.idleConnections = this.pool.length - inUse;
  }

  /**
   * Update average wait time
   */
  private updateAvgWaitTime(waitTimeMs: number): void {
    const total = this.stats.totalRequests;
    this.stats.avgWaitTimeMs = 
      (this.stats.avgWaitTimeMs * total + waitTimeMs) / (total + 1);
    this.stats.totalRequests++;
  }
}

// Singleton instance
let poolInstance: HederaClientPool | null = null;

export function getHederaPool(
  network?: string,
  operatorId?: string,
  operatorKey?: string
): HederaClientPool {
  if (!poolInstance && network && operatorId && operatorKey) {
    poolInstance = new HederaClientPool(network, operatorId, operatorKey);
  }
  
  if (!poolInstance) {
    throw new Error('Pool not initialized. Provide credentials first.');
  }
  
  return poolInstance;
}

export function resetHederaPool(): void {
  poolInstance = null;
}
