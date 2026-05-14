/**
 * Vera Redis Cache Layer
 * High-performance caching for API responses
 */

import { createClient } from 'redis';

class VeraCache {
  constructor() {
    this.client = null;
    this.defaultTTL = 300; // 5 minutes
    this.enabled = false;
  }

  async connect() {
    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        },
        retryStrategy: (times) => Math.min(times * 50, 2000)
      });

      this.client.on('error', (err) => {
        console.warn('Redis error:', err.message);
        this.enabled = false;
      });

      await this.client.connect();
      this.enabled = true;
      console.log('✅ Redis cache connected');
    } catch (err) {
      console.warn('Redis not available, using memory cache');
      this.memoryCache = new Map();
    }
  }

  async get(key) {
    if (!this.enabled) {
      const entry = this.memoryCache?.get(key);
      if (entry && Date.now() < entry.expiry) {
        return entry.value;
      }
      this.memoryCache?.delete(key);
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled) {
      this.memoryCache?.set(key, {
        value,
        expiry: Date.now() + (ttl * 1000)
      });
      return;
    }

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch {
      // Silent fail
    }
  }

  generateKey(prefix, params) {
    const hash = Buffer.from(JSON.stringify(params)).toString('base64').slice(0, 32);
    return `${prefix}:${hash}`;
  }

  async disconnect() {
    if (this.enabled && this.client) {
      await this.client.disconnect();
    }
  }
}

export { VeraCache };
