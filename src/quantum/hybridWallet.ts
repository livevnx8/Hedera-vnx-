/**
 * Hybrid Wallet (Phase 17)
 * 
 * Combines classical ECDSA with post-quantum SPHINCS+ signatures.
 * Gradual migration path to quantum-safe cryptography.
 */

import { logger } from '../monitoring/logger.js';
import { getQuantumSafeCrypto } from './pqCrypto.js';
import type { 
  HybridAccount,
  HybridSignature,
  MigrationResult,
  SphincsKeypair
} from './types.js';

interface HybridWalletConfig {
  requireBothSignatures: boolean;
  migrationDelay: number;
  backupRequired: boolean;
}

export class HybridWallet {
  private config: HybridWalletConfig;
  private accounts: Map<string, HybridAccount> = new Map();
  private pendingMigrations: Map<string, MigrationResult> = new Map();

  constructor(config: Partial<HybridWalletConfig> = {}) {
    this.config = {
      requireBothSignatures: true,
      migrationDelay: 86400, // 24 hours
      backupRequired: true,
      ...config
    };
  }

  /**
   * Create new hybrid account (ECDSA + SPHINCS+)
   */
  async createHybridAccount(hederaAccount: string): Promise<HybridAccount> {
    // Generate SPHINCS+ keypair
    const pqCrypto = getQuantumSafeCrypto();
    const sphincsKeypair = await pqCrypto.generateSphincsKeypair();

    const account: HybridAccount = {
      accountId: `hybrid-${Date.now()}`,
      hederaAccount,
      ecdsaPublicKey: `ecdsa-${hederaAccount}`,
      sphincsPublicKey: sphincsKeypair.publicKey,
      kyberPublicKey: undefined, // Optional for encrypted comms
      createdAt: Date.now(),
      isQuantumSafe: true
    };

    this.accounts.set(account.accountId, account);

    logger.info('HybridWallet', {
      message: 'Hybrid account created',
      accountId: account.accountId,
      hederaAccount,
      isQuantumSafe: true
    });

    return account;
  }

  /**
   * Sign transaction with both ECDSA and SPHINCS+
   */
  async hybridSign(
    accountId: string,
    txHash: Buffer
  ): Promise<HybridSignature> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const pqCrypto = getQuantumSafeCrypto();

    // Mock ECDSA signature
    const ecdsaSignature = `0xecdsa-${txHash.toString('base64').slice(0, 32)}`;

    // Generate SPHINCS+ signature
    const sphincsKeypair = await pqCrypto.generateSphincsKeypair();
    const sphincsSignature = await pqCrypto.sphincsSign(
      sphincsKeypair.secretKey,
      txHash
    );

    const signature: HybridSignature = {
      ecdsaSignature,
      sphincsSignature,
      timestamp: Date.now()
    };

    logger.info('HybridWallet', {
      message: 'Hybrid signature created',
      accountId,
      timestamp: signature.timestamp
    });

    return signature;
  }

  /**
   * Verify hybrid signature
   */
  async verifyHybridSig(
    accountId: string,
    txHash: Buffer,
    sig: HybridSignature
  ): Promise<boolean> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    // Verify ECDSA (mock)
    const ecdsaValid = sig.ecdsaSignature.length > 10;

    // Verify SPHINCS+
    const pqCrypto = getQuantumSafeCrypto();
    const sphincsValid = await pqCrypto.sphincsVerify(
      account.sphincsPublicKey,
      txHash,
      sig.sphincsSignature
    );

    const isValid = this.config.requireBothSignatures
      ? ecdsaValid && sphincsValid
      : ecdsaValid || sphincsValid;

    logger.debug('HybridWallet', {
      message: 'Hybrid signature verification',
      accountId,
      ecdsaValid,
      sphincsValid,
      isValid
    });

    return isValid;
  }

  /**
   * Migrate existing account to quantum-safe
   */
  async migrateToQuantumSafe(hederaAccount: string): Promise<MigrationResult> {
    // Check if already migrated
    const existing = Array.from(this.accounts.values())
      .find(a => a.hederaAccount === hederaAccount);

    if (existing?.isQuantumSafe) {
      return {
        accountId: existing.accountId,
        success: true,
        ecdsaKeyRetired: false,
        sphincsKeyActive: true,
        migrationTx: 'already-migrated',
        completedAt: Date.now()
      };
    }

    // Create hybrid account
    const hybrid = await this.createHybridAccount(hederaAccount);

    // Schedule migration
    const migrationId = `migration-${Date.now()}`;
    
    const migration: MigrationResult = {
      accountId: hybrid.accountId,
      success: true,
      ecdsaKeyRetired: false, // Keep for backward compatibility
      sphincsKeyActive: true,
      migrationTx: migrationId,
      completedAt: Date.now()
    };

    this.pendingMigrations.set(migrationId, migration);

    logger.info('HybridWallet', {
      message: 'Account migrated to quantum-safe',
      hederaAccount,
      migrationId,
      accountId: hybrid.accountId
    });

    return migration;
  }

  /**
   * Get account by ID
   */
  getAccount(accountId: string): HybridAccount | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Get account by Hedera ID
   */
  getAccountByHedera(hederaAccount: string): HybridAccount | undefined {
    return Array.from(this.accounts.values())
      .find(a => a.hederaAccount === hederaAccount);
  }

  /**
   * Get all accounts
   */
  getAllAccounts(): HybridAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get migration status
   */
  getMigration(migrationId: string): MigrationResult | undefined {
    return this.pendingMigrations.get(migrationId);
  }

  /**
   * Get wallet statistics
   */
  getStats() {
    const accounts = Array.from(this.accounts.values());
    const migrations = Array.from(this.pendingMigrations.values());

    return {
      timestamp: Date.now(),
      totalAccounts: accounts.length,
      quantumSafeAccounts: accounts.filter(a => a.isQuantumSafe).length,
      pendingMigrations: migrations.filter(m => !m.success).length,
      completedMigrations: migrations.filter(m => m.success).length,
      requireBothSigs: this.config.requireBothSignatures
    };
  }
}

// Singleton
let hybridWalletInstance: HybridWallet | null = null;

export function getHybridWallet(config?: Partial<HybridWalletConfig>): HybridWallet {
  if (!hybridWalletInstance) {
    hybridWalletInstance = new HybridWallet(config);
  }
  return hybridWalletInstance;
}
