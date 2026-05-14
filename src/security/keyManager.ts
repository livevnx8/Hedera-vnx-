/**
 * Secure Key Management System
 * 
 * Provides secure storage and retrieval of sensitive keys and secrets.
 * In production, this should integrate with HSM or cloud key management.
 */

import crypto from 'node:crypto';
import { secureConfig } from '../config/secureConfig.js';

export interface KeyMetadata {
  id: string;
  name: string;
  type: 'hedera_private_key' | 'jwt_secret' | 'encryption_key' | 'api_key';
  created: Date;
  lastAccessed?: Date;
  accessCount: number;
  version: number;
}

export interface KeyStorage {
  encryptedKey: string;
  iv: string;
  tag: string;
  algorithm: string;
  keyMetadata: KeyMetadata;
}

export class KeyManager {
  private static instance: KeyManager;
  private masterKey: string;
  private keyStore: Map<string, KeyStorage> = new Map();
  private encryptionAlgorithm = 'aes-256-gcm';

  private constructor() {
    this.masterKey = this.getOrCreateMasterKey();
    this.loadKeys();
  }

  public static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  private getOrCreateMasterKey(): string {
    // In production, this should come from HSM or secure environment
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    
    if (!masterKey) {
      if (secureConfig.isProductionMode()) {
        throw new Error('MASTER_ENCRYPTION_KEY is required in production');
      }
      
      // For development, generate a temporary key
      console.warn('⚠️ Using temporary master key for development only');
      return crypto.randomBytes(32).toString('hex');
    }
    
    return masterKey;
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  private encryptKey(keyData: string, masterKey: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const derivedKey = this.deriveKey(masterKey, iv);
    
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, derivedKey, iv) as any;
    
    let encrypted = cipher.update(keyData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = (cipher.getAuthTag as () => Buffer)();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  private decryptKey(encryptedData: string, iv: string, tag: string, masterKey: string): string {
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');
    const derivedKey = this.deriveKey(masterKey, ivBuffer);
    
    const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, derivedKey, ivBuffer) as any;
    (decipher.setAuthTag as (tag: Buffer) => void)(tagBuffer);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  public storeKey(
    keyId: string,
    keyValue: string,
    keyType: KeyMetadata['type'],
    keyName: string
  ): void {
    try {
      const keyMetadata: KeyMetadata = {
        id: keyId,
        name: keyName,
        type: keyType,
        created: new Date(),
        accessCount: 0,
        version: 1
      };

      const { encrypted, iv, tag } = this.encryptKey(keyValue, this.masterKey);

      const keyStorage: KeyStorage = {
        encryptedKey: encrypted,
        iv,
        tag,
        algorithm: this.encryptionAlgorithm,
        keyMetadata
      };

      this.keyStore.set(keyId, keyStorage);
      
      if (!secureConfig.isProductionMode()) {
        console.log(`🔐 Key stored: ${keyId} (${keyType})`);
      }
    } catch (error) {
      throw new Error(`Failed to store key ${keyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public getKey(keyId: string): string {
    try {
      const keyStorage = this.keyStore.get(keyId);
      
      if (!keyStorage) {
        throw new Error(`Key not found: ${keyId}`);
      }

      const decrypted = this.decryptKey(
        keyStorage.encryptedKey,
        keyStorage.iv,
        keyStorage.tag,
        this.masterKey
      );

      // Update access metadata
      keyStorage.keyMetadata.lastAccessed = new Date();
      keyStorage.keyMetadata.accessCount++;

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to retrieve key ${keyId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public deleteKey(keyId: string): boolean {
    const deleted = this.keyStore.delete(keyId);
    
    if (deleted && !secureConfig.isProductionMode()) {
      console.log(`🗑️ Key deleted: ${keyId}`);
    }
    
    return deleted;
  }

  public listKeys(): KeyMetadata[] {
    return Array.from(this.keyStore.values()).map(storage => storage.keyMetadata);
  }

  public rotateKey(keyId: string, newKeyValue: string): void {
    const existingKey = this.keyStore.get(keyId);
    if (!existingKey) {
      throw new Error(`Key not found for rotation: ${keyId}`);
    }

    // Store new version
    const keyMetadata: KeyMetadata = {
      ...existingKey.keyMetadata,
      version: existingKey.keyMetadata.version + 1,
      lastAccessed: new Date(),
      accessCount: 0
    };

    const { encrypted, iv, tag } = this.encryptKey(newKeyValue, this.masterKey);

    const keyStorage: KeyStorage = {
      encryptedKey: encrypted,
      iv,
      tag,
      algorithm: this.encryptionAlgorithm,
      keyMetadata
    };

    this.keyStore.set(keyId, keyStorage);
    
    if (!secureConfig.isProductionMode()) {
      console.log(`🔄 Key rotated: ${keyId} (version ${keyMetadata.version})`);
    }
  }

  public validateKey(keyId: string, expectedValue?: string): boolean {
    try {
      const keyValue = this.getKey(keyId);
      
      if (expectedValue) {
        return keyValue === expectedValue;
      }
      
      // Basic validation based on key type
      const keyMetadata = this.keyStore.get(keyId)?.keyMetadata;
      if (!keyMetadata) return false;

      switch (keyMetadata.type) {
        case 'hedera_private_key':
          return /^[0-9a-fA-F]{64}$/.test(keyValue);
        case 'jwt_secret':
        case 'encryption_key':
          return keyValue.length >= 32;
        case 'api_key':
          return keyValue.length >= 16;
        default:
          return keyValue.length > 0;
      }
    } catch {
      return false;
    }
  }

  // Convenience methods for common key types
  public getHederaPrivateKey(accountId: string): string {
    const keyId = `hedera_private_key_${accountId}`;
    return this.getKey(keyId);
  }

  public storeHederaPrivateKey(accountId: string, privateKey: string): void {
    this.validatePrivateKey(privateKey);
    const keyId = `hedera_private_key_${accountId}`;
    this.storeKey(keyId, privateKey, 'hedera_private_key', `Hedera Private Key for ${accountId}`);
  }

  public getJwtSecret(): string {
    return this.getKey('jwt_secret');
  }

  public storeJwtSecret(secret: string): void {
    if (secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }
    this.storeKey('jwt_secret', secret, 'jwt_secret', 'JWT Secret');
  }

  public getEncryptionKey(): string {
    return this.getKey('encryption_key');
  }

  public storeEncryptionKey(key: string): void {
    if (key.length < 32) {
      throw new Error('Encryption key must be at least 32 characters');
    }
    this.storeKey('encryption_key', key, 'encryption_key', 'Encryption Key');
  }

  public validatePrivateKey(privateKey: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('Invalid private key format. Must be 64 hexadecimal characters.');
    }
  }

  // Key rotation for all keys of a type
  public rotateKeysByType(keyType: KeyMetadata['type']): number {
    let rotatedCount = 0;
    
    for (const [keyId, storage] of this.keyStore.entries()) {
      if (storage.keyMetadata.type === keyType) {
        const currentValue = this.getKey(keyId);
        this.rotateKey(keyId, currentValue);
        rotatedCount++;
      }
    }
    
    return rotatedCount;
  }

  // Security audit
  public auditReport(): {
    totalKeys: number;
    keysByType: Record<string, number>;
    oldKeys: KeyMetadata[];
    frequentlyAccessedKeys: KeyMetadata[];
    recommendations: string[];
  } {
    const keys = this.listKeys();
    const keysByType: Record<string, number> = {};
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    for (const key of keys) {
      keysByType[key.type] = (keysByType[key.type] || 0) + 1;
    }

    const oldKeys = keys.filter(key => key.created < thirtyDaysAgo);
    const frequentlyAccessedKeys = keys.filter(key => key.accessCount > 100);
    
    const recommendations: string[] = [];
    
    if (oldKeys.length > 0) {
      recommendations.push(`Consider rotating ${oldKeys.length} keys older than 30 days`);
    }
    
    if (frequentlyAccessedKeys.length > 0) {
      recommendations.push(`Monitor ${frequentlyAccessedKeys.length} frequently accessed keys for security`);
    }
    
    if (keysByType['hedera_private_key'] > 5) {
      recommendations.push('Consider consolidating Hedera private keys or using account management');
    }

    return {
      totalKeys: keys.length,
      keysByType,
      oldKeys,
      frequentlyAccessedKeys,
      recommendations
    };
  }

  private loadKeys(): void {
    // In production, this would load from secure storage
    // For now, we'll initialize with environment variables if available
    
    if (!secureConfig.isProductionMode()) {
      // Load development keys from environment
      const hederaPrivateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
      const hederaAccountId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
      
      if (hederaPrivateKey && hederaAccountId && hederaPrivateKey !== 'USE_SECURE_KEY_MANAGEMENT') {
        try {
          this.storeHederaPrivateKey(hederaAccountId, hederaPrivateKey);
        } catch (error) {
          console.warn('⚠️ Failed to load Hedera private key from environment:', error);
        }
      }
    }
  }

  // Health check
  public healthCheck(): {
    status: 'healthy' | 'warning' | 'critical';
    totalKeys: number;
    issues: string[];
  } {
    const keys = this.listKeys();
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (keys.length === 0) {
      issues.push('No keys stored');
      status = 'warning';
    }

    if (!this.masterKey || this.masterKey.length < 32) {
      issues.push('Master key is weak or missing');
      status = 'critical';
    }

    const oldKeys = keys.filter(key => 
      new Date(key.created.getTime() + 90 * 24 * 60 * 60 * 1000) < new Date()
    );
    
    if (oldKeys.length > 0) {
      issues.push(`${oldKeys.length} keys are older than 90 days`);
      status = 'warning';
    }

    return {
      status,
      totalKeys: keys.length,
      issues
    };
  }
}

// Export singleton instance
export const keyManager = KeyManager.getInstance();

// Export convenience functions
export function getHederaPrivateKey(accountId: string): string {
  return keyManager.getHederaPrivateKey(accountId);
}

export function storeHederaPrivateKey(accountId: string, privateKey: string): void {
  keyManager.storeHederaPrivateKey(accountId, privateKey);
}

export function getJwtSecret(): string {
  return keyManager.getJwtSecret();
}

export function getEncryptionKey(): string {
  return keyManager.getEncryptionKey();
}
