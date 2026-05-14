/**
 * Hedera Voice Command Handler
 * Processes voice commands for Hedera Token Service, Consensus Service, and queries
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { getClient } from '../hedera/tools/client.js';
import { 
  AccountBalanceQuery, 
  AccountInfoQuery,
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TokenDissociateTransaction,
  TransferTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  TransactionReceiptQuery,
  TransactionRecordQuery,
} from '@hashgraph/sdk';

export interface HederaCommand {
  type: 'hts_create' | 'hts_transfer' | 'hts_balance' | 'hcs_create_topic' | 'hcs_submit' | 'query_balance' | 'query_account';
  intent: string;
  entities: {
    tokenName?: string;
    tokenSymbol?: string;
    amount?: number;
    sender?: string;
    receiver?: string;
    accountId?: string;
    topicId?: string;
    message?: string;
  };
  rawCommand: string;
}

export interface HederaCommandResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  transactionId?: string;
  error?: string;
}

export class HederaVoiceHandler extends EventEmitter {
  private client = getClient();

  /**
   * Parse voice command for Hedera intent
   */
  parseCommand(input: string): HederaCommand | null {
    const lower = input.toLowerCase();

    // HTS: Create token
    if (lower.match(/create token|mint token|new token/)) {
      const nameMatch = input.match(/(?:called|named)\s+["']?([^"']+)["']?/i);
      const symbolMatch = input.match(/(?:symbol|ticker)\s+["']?([^"']+)["']?/i);
      const supplyMatch = input.match(/(?:supply|amount)\s+(\d+)/);
      
      return {
        type: 'hts_create',
        intent: 'create_token',
        entities: {
          tokenName: nameMatch?.[1] || 'VeraToken',
          tokenSymbol: symbolMatch?.[1] || 'VRA',
          amount: supplyMatch ? parseInt(supplyMatch[1]) : 1000000,
        },
        rawCommand: input,
      };
    }

    // HTS: Transfer tokens
    if (lower.match(/transfer|send.*token|send.*hbar/)) {
      const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:hbars?|tokens?)?/i);
      const receiverMatch = input.match(/(?:to|for)\s+["']?([^"']+)["']?/i);
      
      return {
        type: 'hts_transfer',
        intent: 'transfer',
        entities: {
          amount: amountMatch ? parseFloat(amountMatch[1]) : 10,
          receiver: receiverMatch?.[1] || '',
        },
        rawCommand: input,
      };
    }

    // Query: Check balance
    if (lower.match(/balance|how much|check.*account/)) {
      const accountMatch = input.match(/(?:account|for|of)\s+["']?([^"']+)["']?/i);
      
      return {
        type: 'query_balance',
        intent: 'check_balance',
        entities: {
          accountId: accountMatch?.[1] || '',
        },
        rawCommand: input,
      };
    }

    // HCS: Create topic
    if (lower.match(/create topic|new topic|start topic/)) {
      const memoMatch = input.match(/(?:called|named|for)\s+["']?([^"']+)["']?/i);
      
      return {
        type: 'hcs_create_topic',
        intent: 'create_topic',
        entities: {
          message: memoMatch?.[1] || 'Vera Consensus Topic',
        },
        rawCommand: input,
      };
    }

    // HCS: Submit message
    if (lower.match(/submit.*message|post.*message|send.*message/)) {
      const topicMatch = input.match(/(?:to|on)\s+(?:topic\s+)?["']?([^"']+)["']?/i);
      const messageMatch = input.match(/(?:saying|message|content)\s+["']?([^"']+)["']?/i);
      
      return {
        type: 'hcs_submit',
        intent: 'submit_message',
        entities: {
          topicId: topicMatch?.[1] || '',
          message: messageMatch?.[1] || '',
        },
        rawCommand: input,
      };
    }

    return null;
  }

  /**
   * Execute parsed Hedera command
   */
  async execute(command: HederaCommand): Promise<HederaCommandResult> {
    try {
      switch (command.type) {
        case 'hts_create':
          return await this.createToken(command);
        case 'hts_transfer':
          return await this.transferHbar(command);
        case 'query_balance':
          return await this.queryBalance(command);
        case 'hcs_create_topic':
          return await this.createTopic(command);
        case 'hcs_submit':
          return await this.submitMessage(command);
        default:
          return { success: false, message: 'Unknown command type' };
      }
    } catch (error) {
      logger.error('HederaVoiceHandler', {
        message: 'Command execution failed',
        command: command.type,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        success: false,
        message: 'Command failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create HTS token
   */
  private async createToken(command: HederaCommand): Promise<HederaCommandResult> {
    const { tokenName, tokenSymbol, amount } = command.entities;
    
    const tx = await new TokenCreateTransaction()
      .setTokenName(tokenName || 'VeraToken')
      .setTokenSymbol(tokenSymbol || 'VRA')
      .setDecimals(2)
      .setInitialSupply(amount || 1000000)
      .setTreasuryAccountId(this.client.operatorAccountId!)
      .setAdminKey(this.client.operatorPublicKey!)
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);
    const tokenId = receipt.tokenId;

    logger.info('HederaVoiceHandler', {
      message: 'Token created via voice command',
      tokenId: tokenId?.toString(),
      name: tokenName,
    });

    return {
      success: true,
      message: `Created token ${tokenName} (${tokenSymbol}) with ID ${tokenId}. Initial supply: ${amount} tokens.`,
      data: { tokenId: tokenId?.toString(), name: tokenName, symbol: tokenSymbol, supply: amount },
      transactionId: tx.transactionId.toString(),
    };
  }

  /**
   * Transfer HBAR
   */
  private async transferHbar(command: HederaCommand): Promise<HederaCommandResult> {
    const { amount, receiver } = command.entities;
    
    if (!receiver) {
      return { success: false, message: 'Receiver account ID required' };
    }

    const tx = await new TransferTransaction()
      .addHbarTransfer(this.client.operatorAccountId!, -1 * (amount || 10))
      .addHbarTransfer(receiver, amount || 10)
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);

    logger.info('HederaVoiceHandler', {
      message: 'HBAR transferred via voice command',
      amount,
      receiver,
    });

    return {
      success: true,
      message: `Transferred ${amount || 10} HBAR to account ${receiver}. Status: ${receipt.status.toString()}.`,
      data: { amount, receiver, status: receipt.status.toString() },
      transactionId: tx.transactionId.toString(),
    };
  }

  /**
   * Query account balance
   */
  private async queryBalance(command: HederaCommand): Promise<HederaCommandResult> {
    const { accountId } = command.entities;
    const targetAccount = accountId || this.client.operatorAccountId?.toString();
    
    if (!targetAccount) {
      return { success: false, message: 'No account specified' };
    }

    const balance = await new AccountBalanceQuery()
      .setAccountId(targetAccount)
      .execute(this.client);

    const hbarBalance = balance.hbars.toString();
    const tokenBalances = Object.entries(balance.tokens?._map || {}).map(([tokenId, balance]) => ({
      tokenId,
      balance: balance.toString(),
    }));

    return {
      success: true,
      message: `Account ${targetAccount} has ${hbarBalance} HBAR${tokenBalances.length > 0 ? ` and ${tokenBalances.length} token types` : ''}.`,
      data: { 
        accountId: targetAccount,
        hbarBalance,
        tokenBalances,
      },
    };
  }

  /**
   * Create HCS topic
   */
  private async createTopic(command: HederaCommand): Promise<HederaCommandResult> {
    const { message } = command.entities;
    
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(message || 'Vera Voice Topic')
      .setSubmitKey(this.client.operatorPublicKey!)
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);
    const topicId = receipt.topicId;

    logger.info('HederaVoiceHandler', {
      message: 'Topic created via voice command',
      topicId: topicId?.toString(),
      memo: message,
    });

    return {
      success: true,
      message: `Created consensus topic with ID ${topicId}. Memo: ${message || 'Vera Voice Topic'}`,
      data: { topicId: topicId?.toString(), memo: message },
      transactionId: tx.transactionId.toString(),
    };
  }

  /**
   * Submit message to HCS topic
   */
  private async submitMessage(command: HederaCommand): Promise<HederaCommandResult> {
    const { topicId, message } = command.entities;
    
    if (!topicId) {
      return { success: false, message: 'Topic ID required' };
    }

    if (!message) {
      return { success: false, message: 'Message content required' };
    }

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);

    logger.info('HederaVoiceHandler', {
      message: 'Message submitted via voice command',
      topicId,
      sequence: receipt.topicSequenceNumber?.toString(),
    });

    return {
      success: true,
      message: `Message submitted to topic ${topicId}. Sequence number: ${receipt.topicSequenceNumber}.`,
      data: { 
        topicId, 
        message,
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
      },
      transactionId: tx.transactionId.toString(),
    };
  }

  /**
   * Get available voice commands help
   */
  getHelpText(): string {
    return `Hedera Voice Commands:

Token Service (HTS):
• "Create token called MyToken with symbol MTK and supply 1000000"
• "Transfer 50 HBAR to account 0.0.1234"
• "Check balance for account 0.0.5678"

Consensus Service (HCS):
• "Create topic called Project Updates"
• "Submit message to topic 0.0.9876 saying Project milestone reached"

Queries:
• "What's my balance"
• "Check account 0.0.1234 balance"`;
  }
}

// Singleton
export const hederaVoiceHandler = new HederaVoiceHandler();
export default hederaVoiceHandler;
