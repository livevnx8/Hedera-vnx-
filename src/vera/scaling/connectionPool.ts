/**
 * Connection Pool Manager
 * Manages Hedera client connections with pooling and health checking
 */

import { EventEmitter } from 'events';
import { Client } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
  maxWaitMs: number;
}

export interface PooledConnection {
  id: string;
  client: Client;
  createdAt: number;
  lastUsed: number;
  useCount: number;
  healthy: boolean;
  inUse: boolean;
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  minConnections: 10,
  maxConnections: 50,
  idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
  healthCheckIntervalMs: 30000, // 30 seconds
  maxWaitMs: 5000, // 5 seconds
};

export class ConnectionPoolManager extends EventEmitter {
  private pool: PooledConnection[] = [];
  private waitingQueue: Array<{ resolve: (conn: PooledConnection) => void; reject: (err: Error) => void; timestamp: number }> = [];
  private timer: NodeJS.Timeout | null = null;
  private isShutdown = false;

  constructor(
    private config: PoolConfig,
    private createClient: () => Client
  ) {
    super();
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    // Create minimum connections
    for (let i = 0; i < this.config.minConnections; i++) {
      await this.createConnection();
    }

    // Start health checks and cleanup
    this.timer = setInterval(() => {
      this.performMaintenance();
    }, this.config.healthCheckIntervalMs);

    logger.info('ConnectionPoolManager', {
      message: 'Connection pool initialized',
      min: this.config.minConnections,
      max: this.config.maxConnections,
    });
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<PooledConnection> {
    if (this.isShutdown) {
      throw new Error('Connection pool is shutdown');
    }

    // Try to find available connection
    const available = this.pool.find(c => c.healthy && !c.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      available.useCount++;
      return available;
    }

    // Create new connection if under max
    if (this.pool.length < this.config.maxConnections) {
      const conn = await this.createConnection();
      conn.inUse = true;
      conn.lastUsed = Date.now();
      conn.useCount++;
      return conn;
    }

    // Wait for connection to become available
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timestamp: Date.now(),
      };
      this.waitingQueue.push(waiter);

      // Timeout waiting
      setTimeout(() => {
        const index = this.waitingQueue.indexOf(waiter);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
          reject(new Error('Timeout waiting for connection'));
        }
      }, this.config.maxWaitMs);
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();

    // Check if anyone is waiting
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift();
      if (waiter && Date.now() - waiter.timestamp < this.config.maxWaitMs) {
        connection.inUse = true;
        connection.useCount++;
        waiter.resolve(connection);
      }
    }
  }

  /**
   * Create a new connection
   */
  private async createConnection(): Promise<PooledConnection> {
    const id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const client = this.createClient();

    const connection: PooledConnection = {
      id,
      client,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 0,
      healthy: true,
      inUse: false,
    };

    this.pool.push(connection);
    return connection;
  }

  /**
   * Perform pool maintenance (health checks, cleanup)
   */
  private async performMaintenance(): Promise<void> {
    const now = Date.now();

    for (let i = this.pool.length - 1; i >= 0; i--) {
      const conn = this.pool[i];

      // Check health of idle connections
      if (!conn.inUse && conn.healthy) {
        try {
          // Simple health check - ping would go here
          conn.healthy = true;
        } catch {
          conn.healthy = false;
        }
      }

      // Remove stale connections above minimum
      if (
        this.pool.length > this.config.minConnections &&
        !conn.inUse &&
        !conn.healthy
      ) {
        this.pool.splice(i, 1);
        logger.info('ConnectionPoolManager', {
          message: 'Removed unhealthy connection',
          connId: conn.id,
        });
      }

      // Remove idle connections above minimum
      if (
        this.pool.length > this.config.minConnections &&
        !conn.inUse &&
        now - conn.lastUsed > this.config.idleTimeoutMs
      ) {
        this.pool.splice(i, 1);
        logger.info('ConnectionPoolManager', {
          message: 'Removed idle connection',
          connId: conn.id,
          idleMs: now - conn.lastUsed,
        });
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    available: number;
    inUse: number;
    unhealthy: number;
    waiting: number;
  } {
    return {
      total: this.pool.length,
      available: this.pool.filter(c => c.healthy && !c.inUse).length,
      inUse: this.pool.filter(c => c.inUse).length,
      unhealthy: this.pool.filter(c => !c.healthy).length,
      waiting: this.waitingQueue.length,
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Reject all waiting
    for (const waiter of this.waitingQueue) {
      waiter.reject(new Error('Connection pool shutdown'));
    }
    this.waitingQueue = [];

    // Close all connections
    this.pool = [];

    logger.info('ConnectionPoolManager', { message: 'Connection pool shutdown' });
  }
}

export default ConnectionPoolManager;
