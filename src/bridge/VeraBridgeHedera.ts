/**
 * VeraBridge Hedera Service
 * HTS integration for trustless cross-chain transfers
 */

import {
  Client,
  TransferTransaction,
  TopicMessageSubmitTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  AccountId,
  PrivateKey,
  Hbar,
  TransactionReceipt,
  ContractId,
  TopicId,
} from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';

interface BridgeConfig {
  hederaBridgeContract: string; // 0.0.xxxxx
  hcsTopicId: string;
  operatorId: string;
  operatorKey: string;
  network: 'mainnet' | 'testnet';
}

interface HTLCData {
  htlcId: string;
  hashLock: string;
  sender: string; // Ethereum address
  recipient: string; // Hedera account 0.0.x
  tokenId: string; // 0.0.x or 'HBAR'
  amount: number;
  expiry: number;
}

interface ValidatorSignature {
  validator: string;
  signature: string;
  timestamp: number;
}

export class VeraBridgeHedera {
  private client: Client;
  private bridgeContract: ContractId;
  private hcsTopic: TopicId;
  private operatorId: AccountId;

  constructor(config: BridgeConfig) {
    this.client = config.network === 'mainnet' 
      ? Client.forMainnet() 
      : Client.forTestnet();
    
    const operatorPrivateKey = PrivateKey.fromStringECDSA(config.operatorKey);
    this.operatorId = AccountId.fromString(config.operatorId);
    this.client.setOperator(this.operatorId, operatorPrivateKey);
    
    this.bridgeContract = ContractId.fromString(config.hederaBridgeContract);
    this.hcsTopic = TopicId.fromString(config.hcsTopicId);
  }

  /**
   * Create HTLC on Hedera side (when receiving from Ethereum)
   */
  async createHTLC(htlcData: HTLCData): Promise<{
    txHash: string;
    status: string;
  }> {
    logger.info('VeraBridgeHedera', {
      message: 'Creating HTLC',
      htlcId: htlcData.htlcId,
      amount: htlcData.amount,
      recipient: htlcData.recipient,
    });

    try {
      // Lock tokens in bridge contract
      const tx = new ContractExecuteTransaction()
        .setContractId(this.bridgeContract)
        .setGas(200000)
        .setFunction(
          'createHTLC',
          new ContractFunctionParameters()
            .addString(htlcData.htlcId)
            .addString(htlcData.hashLock)
            .addString(htlcData.sender)
            .addString(htlcData.recipient)
            .addString(htlcData.tokenId)
            .addUint64(htlcData.amount)
            .addUint64(htlcData.expiry)
        );

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const txHash = response.transactionId.toString();

      // Log to HCS for transparency
      await this.logToHCS({
        type: 'HTLC_CREATED',
        htlcId: htlcData.htlcId,
        sender: htlcData.sender,
        recipient: htlcData.recipient,
        token: htlcData.tokenId,
        amount: htlcData.amount,
        hashLock: htlcData.hashLock,
        expiry: htlcData.expiry,
        txHash,
        timestamp: Date.now(),
      });

      return {
        txHash,
        status: 'SUCCESS',
      };
    } catch (error) {
      logger.error('VeraBridgeHedera', {
        message: 'Failed to create HTLC',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Claim HTLC on Hedera side (when user reveals secret)
   */
  async claimHTLC(
    htlcId: string,
    secret: string,
    validatorSignatures: ValidatorSignature[]
  ): Promise<{
    txHash: string;
    status: string;
  }> {
    logger.info('VeraBridgeHedera', {
      message: 'Claiming HTLC',
      htlcId,
      signatures: validatorSignatures.length,
    });

    try {
      // Serialize validator signatures
      const signaturesData = JSON.stringify(validatorSignatures);

      const tx = new ContractExecuteTransaction()
        .setContractId(this.bridgeContract)
        .setGas(150000)
        .setFunction(
          'claimHTLC',
          new ContractFunctionParameters()
            .addString(htlcId)
            .addString(secret)
            .addString(signaturesData)
        );

      const response = await tx.execute(this.client);
      const txHash = response.transactionId.toString();

      // Log to HCS
      await this.logToHCS({
        type: 'HTLC_CLAIMED',
        htlcId,
        secret: secret.substring(0, 10) + '...', // Log partial for audit
        signatures: validatorSignatures.map(s => s.validator),
        txHash,
        timestamp: Date.now(),
      });

      return {
        txHash,
        status: 'SUCCESS',
      };
    } catch (error) {
      logger.error('VeraBridgeHedera', {
        message: 'Failed to claim HTLC',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Refund expired HTLC
   */
  async refundHTLC(htlcId: string): Promise<{
    txHash: string;
    status: string;
  }> {
    logger.info('VeraBridgeHedera', {
      message: 'Refunding HTLC',
      htlcId,
    });

    try {
      const tx = new ContractExecuteTransaction()
        .setContractId(this.bridgeContract)
        .setGas(100000)
        .setFunction(
          'refundHTLC',
          new ContractFunctionParameters().addString(htlcId)
        );

      const response = await tx.execute(this.client);
      const txHash = response.transactionId.toString();

      await this.logToHCS({
        type: 'HTLC_REFUNDED',
        htlcId,
        txHash,
        timestamp: Date.now(),
      });

      return {
        txHash,
        status: 'SUCCESS',
      };
    } catch (error) {
      logger.error('VeraBridgeHedera', {
        message: 'Failed to refund HTLC',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Log bridge operation to HCS for transparency
   */
  private async logToHCS(message: object): Promise<void> {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(this.hcsTopic)
        .setMessage(JSON.stringify({
          ...message,
          _verabridge: {
            version: '1.0',
            network: this.client.networkName,
            attestor: this.operatorId.toString(),
          },
        }));

      await tx.execute(this.client);
    } catch (error) {
      logger.warn('VeraBridgeHedera', {
        message: 'HCS logging failed (non-critical)',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get bridge balance for a token
   */
  async getBridgeBalance(tokenId: string): Promise<{
    token: string;
    balance: number;
    locked: number;
    available: number;
  }> {
    // Query contract state
    // In production, this would call the contract's getBalance function
    
    return {
      token: tokenId,
      balance: 0,
      locked: 0,
      available: 0,
    };
  }

  /**
   * Close client connection
   */
  close(): void {
    this.client.close();
  }
}

export default VeraBridgeHedera;
