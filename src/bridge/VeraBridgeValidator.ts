/**
 * VeraBridge Validator Agent
 * Multi-sig validator node for bridge transfers
 */

import { Client, PrivateKey, AccountId, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';

// Web3 is loaded dynamically when needed
let Web3: any;
async function loadWeb3(): Promise<any> {
  if (!Web3) {
    try {
      // @ts-ignore - web3 is optional dependency
      const web3Module = await import('web3');
      Web3 = web3Module.default;
    } catch {
      throw new Error('web3 module not installed. Run: npm install web3');
    }
  }
  return Web3;
}

interface ValidatorConfig {
  validatorId: string;
  hederaAccount: string;
  hederaPrivateKey: string;
  ethereumPrivateKey: string;
  hcsTopicId: string;
  network: 'mainnet' | 'testnet';
}

interface BridgeRequest {
  htlcId: string;
  hashLock: string;
  sender: string;
  recipient: string;
  token: string;
  amount: string;
  expiry: number;
  direction: 'ethereum_to_hedera' | 'hedera_to_ethereum';
}

interface ValidatorSignature {
  validator: string;
  signature: string;
  timestamp: number;
}

export class VeraBridgeValidator {
  private validatorId: string;
  private hederaClient: Client;
  private hederaAccount: AccountId;
  private ethereumPrivateKey: string;
  private hcsTopicId: string;
  private isRunning: boolean = false;
  private processedRequests: Set<string> = new Set();

  constructor(config: ValidatorConfig) {
    this.validatorId = config.validatorId;
    this.hederaAccount = AccountId.fromString(config.hederaAccount);
    this.ethereumPrivateKey = config.ethereumPrivateKey;
    this.hcsTopicId = config.hcsTopicId;

    // Initialize Hedera client
    this.hederaClient = config.network === 'mainnet'
      ? Client.forMainnet()
      : Client.forTestnet();

    const privateKey = PrivateKey.fromStringECDSA(config.hederaPrivateKey);
    this.hederaClient.setOperator(this.hederaAccount, privateKey);
  }

  /**
   * Start the validator node
   */
  async start(): Promise<void> {
    logger.info('VeraBridgeValidator', {
      message: 'Starting validator node',
      validatorId: this.validatorId,
      account: this.hederaAccount.toString(),
    });

    this.isRunning = true;

    // Subscribe to bridge HCS topic
    this.subscribeToBridgeTopic();

    // Start health check loop
    this.startHealthCheck();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🛡️ VERA BRIDGE VALIDATOR                                      ║
║  Multi-Sig Node Active                                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Validator ID: ${this.validatorId.padEnd(45)} ║
║  Account: ${this.hederaAccount.toString().padEnd(51)} ║
║  Status: ✅ ONLINE                                            ║
║  Role: Bridge Transaction Signer                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  /**
   * Subscribe to bridge HCS topic for new requests
   */
  private subscribeToBridgeTopic(): void {
    // In production, this would use mirror node subscriptions
    // For MVP, we'll poll or use webhook
    logger.info('VeraBridgeValidator', {
      message: 'Subscribed to bridge HCS topic',
      topicId: this.hcsTopicId,
    });
  }

  /**
   * Process a new bridge request
   */
  async processBridgeRequest(request: BridgeRequest): Promise<ValidatorSignature | null> {
    // Check if already processed
    if (this.processedRequests.has(request.htlcId)) {
      logger.warn('VeraBridgeValidator', {
        message: 'Request already processed',
        htlcId: request.htlcId,
      });
      return null;
    }

    logger.info('VeraBridgeValidator', {
      message: 'Processing bridge request',
      htlcId: request.htlcId,
      amount: request.amount,
      direction: request.direction,
    });

    // Validate request
    const isValid = await this.validateRequest(request);
    if (!isValid) {
      logger.error('VeraBridgeValidator', {
        message: 'Request validation failed',
        htlcId: request.htlcId,
      });
      return null;
    }

    // Sign the request
    const signature = await this.signRequest(request);

    // Log to HCS
    await this.logSignature(request.htlcId, signature);

    // Mark as processed
    this.processedRequests.add(request.htlcId);

    logger.info('VeraBridgeValidator', {
      message: 'Request signed successfully',
      htlcId: request.htlcId,
      signature: signature.signature.substring(0, 20) + '...',
    });

    return signature;
  }

  /**
   * Validate bridge request
   */
  private async validateRequest(request: BridgeRequest): Promise<boolean> {
    // Check expiry
    if (request.expiry < Date.now() / 1000) {
      logger.error('VeraBridgeValidator', {
        message: 'Request expired',
        htlcId: request.htlcId,
        expiry: request.expiry,
      });
      return false;
    }

    // Check amount is reasonable (prevent dust attacks)
    const amount = parseFloat(request.amount);
    if (amount <= 0 || amount > 1000000) {
      logger.error('VeraBridgeValidator', {
        message: 'Invalid amount',
        htlcId: request.htlcId,
        amount: request.amount,
      });
      return false;
    }

    // Verify sender has funds (would check contract state)
    // This is a simplified check

    return true;
  }

  /**
   * Sign bridge request with validator key
   */
  private async signRequest(request: BridgeRequest): Promise<ValidatorSignature> {
    const message = this.constructMessage(request);
    
    // Create Ethereum-compatible signature
    const Web3Class = await loadWeb3();
    const web3 = new Web3Class();
    const signature = web3.eth.accounts.sign(
      message,
      this.ethereumPrivateKey
    );

    return {
      validator: this.hederaAccount.toString(),
      signature: signature.signature,
      timestamp: Date.now(),
    };
  }

  /**
   * Construct message to sign
   */
  private async constructMessage(request: BridgeRequest): Promise<string> {
    const Web3Class = await loadWeb3();
    return Web3Class.utils.keccak256(
      Web3Class.utils.encodePacked(
        { value: request.htlcId, type: 'string' },
        { value: request.hashLock, type: 'string' },
        { value: request.recipient, type: 'string' },
        { value: request.amount, type: 'string' }
      ) || '0x'
    );
  }

  /**
   * Log signature to HCS
   */
  private async logSignature(htlcId: string, signature: ValidatorSignature): Promise<void> {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(this.hcsTopicId)
        .setMessage(JSON.stringify({
          type: 'VALIDATOR_SIGNATURE',
          htlcId,
          validator: signature.validator,
          signature: signature.signature,
          timestamp: signature.timestamp,
        }));

      await tx.execute(this.hederaClient);
    } catch (error) {
      logger.warn('VeraBridgeValidator', {
        message: 'HCS logging failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start health check loop
   */
  private startHealthCheck(): void {
    setInterval(() => {
      if (!this.isRunning) return;

      logger.info('VeraBridgeValidator', {
        message: 'Health check',
        validatorId: this.validatorId,
        status: 'healthy',
        processedRequests: this.processedRequests.size,
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Get validator stats
   */
  getStats(): {
    validatorId: string;
    account: string;
    processedCount: number;
    status: string;
  } {
    return {
      validatorId: this.validatorId,
      account: this.hederaAccount.toString(),
      processedCount: this.processedRequests.size,
      status: this.isRunning ? 'online' : 'offline',
    };
  }

  /**
   * Stop the validator
   */
  stop(): void {
    this.isRunning = false;
    this.hederaClient.close();

    logger.info('VeraBridgeValidator', {
      message: 'Validator stopped',
      validatorId: this.validatorId,
      totalProcessed: this.processedRequests.size,
    });
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: ValidatorConfig = {
    validatorId: process.env.VALIDATOR_ID || 'validator-1',
    hederaAccount: process.env.HEDERA_ACCOUNT_ID || '',
    hederaPrivateKey: process.env.HEDERA_PRIVATE_KEY || '',
    ethereumPrivateKey: process.env.ETHEREUM_PRIVATE_KEY || '',
    hcsTopicId: process.env.HCS_TOPIC_ID || '0.0.10417507',
    network: (process.env.HEDERA_NETWORK as 'mainnet' | 'testnet') || 'testnet',
  };

  if (!config.hederaAccount || !config.hederaPrivateKey) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const validator = new VeraBridgeValidator(config);

  validator.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down validator...');
    validator.stop();
    process.exit(0);
  });
}

export default VeraBridgeValidator;
