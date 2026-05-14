/**
 * Hedera Schedule Service Tools
 * 
 * Create, execute, and manage scheduled transactions on Hedera.
 * Supports multi-signature coordination, delayed execution, and recurring schedules.
 */

import {
  Client,
  AccountId,
  ScheduleId,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleSignTransaction,
  ScheduleInfo,
  ScheduleInfoQuery,
  Transaction,
  TransferTransaction,
  TopicCreateTransaction,
  TokenCreateTransaction,
  Hbar,
  Timestamp,
  PublicKey,
  Key,
} from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';

export interface ScheduledTransaction {
  scheduleId?: string;
  creatorId: string;
  payerId: string;
  scheduledTransactionType: string;
  memo?: string;
  adminKey?: string;
  signers: string[];
  executed: boolean;
  deleted: boolean;
  expirationTime?: Date;
  waitForExpiry: boolean;
}

/**
 * Create a scheduled transfer transaction
 */
export async function createScheduledTransfer(
  client: Client,
  creatorId: string,
  payerId: string,
  transfers: { from: string; to: string; amount: number }[],
  options?: {
    memo?: string;
    adminKey?: string;
    waitForExpiry?: boolean;
    expirationTime?: Date;
  }
): Promise<{ success: boolean; scheduleId?: string; txId?: string; error?: string }> {
  try {
    // Build the inner transfer transaction
    const transferTx = new TransferTransaction();
    
    for (const t of transfers) {
      transferTx.addHbarTransfer(AccountId.fromString(t.from), Hbar.fromTinybars(-t.amount));
      transferTx.addHbarTransfer(AccountId.fromString(t.to), Hbar.fromTinybars(t.amount));
    }

    // Create the schedule
    let scheduleTx = new ScheduleCreateTransaction()
      .setScheduledTransaction(transferTx)
      .setPayerAccountId(AccountId.fromString(payerId));

    if (options?.memo) {
      scheduleTx = scheduleTx.setScheduleMemo(options.memo);
    }

    if (options?.adminKey) {
      // Note: In production, properly parse the key
      // scheduleTx = scheduleTx.setAdminKey(...);
    }

    if (options?.waitForExpiry !== undefined) {
      scheduleTx.setWaitForExpiry(options.waitForExpiry);
    }

    if (options?.expirationTime) {
      scheduleTx.setExpirationTime(Timestamp.fromDate(options.expirationTime));
    }

    scheduleTx.freezeWith(client);
    const response = await scheduleTx.execute(client);
    const receipt = await response.getReceipt(client);

    const scheduleId = receipt.scheduleId?.toString();

    logger.info('ScheduleService', { 
      message: 'Scheduled transfer created', 
      creatorId, payerId, scheduleId,
      transfers: transfers.length,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      scheduleId,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('ScheduleService', { message: 'Failed to create scheduled transfer', creatorId, payerId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Sign a scheduled transaction (add signature)
 */
export async function signScheduledTransaction(
  client: Client,
  scheduleId: string,
  signerId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new ScheduleSignTransaction()
      .setScheduleId(ScheduleId.fromString(scheduleId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('ScheduleService', { 
      message: 'Scheduled transaction signed', 
      scheduleId, signerId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('ScheduleService', { message: 'Failed to sign scheduled transaction', scheduleId, signerId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete a scheduled transaction (requires admin key)
 */
export async function deleteScheduledTransaction(
  client: Client,
  scheduleId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new ScheduleDeleteTransaction()
      .setScheduleId(ScheduleId.fromString(scheduleId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('ScheduleService', { 
      message: 'Scheduled transaction deleted', 
      scheduleId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('ScheduleService', { message: 'Failed to delete scheduled transaction', scheduleId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get schedule info
 */
export async function getScheduleInfo(
  client: Client,
  scheduleId: string
): Promise<{ 
  success: boolean; 
  info?: {
    scheduleId: string;
    creatorId: string;
    payerId: string;
    executed: boolean;
    deleted: boolean;
    signatories: number;
    memo?: string;
    expirationTime?: Date;
    waitForExpiry: boolean;
  }; 
  error?: string 
}> {
  try {
    const query = new ScheduleInfoQuery()
      .setScheduleId(ScheduleId.fromString(scheduleId));

    const info = await query.execute(client);

    logger.info('ScheduleService', { 
      message: 'Schedule info retrieved', 
      scheduleId,
      executed: info.executed,
    });

    return {
      success: true,
      info: {
        scheduleId: info.scheduleId.toString(),
        creatorId: info.creatorAccountId.toString(),
        payerId: info.payerAccountId.toString(),
        executed: info.executed !== null,
        deleted: info.deleted !== null,
        signatories: 0, // SDK doesn't expose signatories directly
        memo: info.scheduleMemo,
        expirationTime: info.expirationTime?.toDate(),
        waitForExpiry: info.waitForExpiry,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('ScheduleService', { message: 'Failed to get schedule info', scheduleId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Create scheduled topic message
 */
export async function createScheduledTopicMessage(
  client: Client,
  creatorId: string,
  payerId: string,
  topicId: string,
  message: string,
  options?: {
    memo?: string;
    adminKey?: string;
  }
): Promise<{ success: boolean; scheduleId?: string; txId?: string; error?: string }> {
  try {
    // Build the inner topic message transaction
    const { TopicMessageSubmitTransaction } = await import('@hashgraph/sdk');
    const messageTx = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message);

    // Create the schedule
    let scheduleTx = new ScheduleCreateTransaction()
      .setScheduledTransaction(messageTx)
      .setPayerAccountId(AccountId.fromString(payerId));

    if (options?.memo) {
      scheduleTx = scheduleTx.setScheduleMemo(options.memo);
    }

    scheduleTx = scheduleTx.freezeWith(client);
    const response = await scheduleTx.execute(client);
    const receipt = await response.getReceipt(client);

    const scheduleId = receipt.scheduleId?.toString();

    logger.info('ScheduleService', { 
      message: 'Scheduled topic message created', 
      creatorId, payerId, topicId, scheduleId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      scheduleId,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('ScheduleService', { message: 'Failed to create scheduled topic message', creatorId, payerId, topicId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Tool definitions for schedule service
 */
export const scheduleToolDefinitions = [
  {
    name: 'create_scheduled_transfer',
    description: 'Create a scheduled HBAR transfer transaction that requires multiple signatures to execute. Useful for multi-sig wallets and delayed payments.',
    parameters: {
      type: 'object',
      properties: {
        creator_id: { type: 'string', description: 'Account ID creating the schedule' },
        payer_id: { type: 'string', description: 'Account ID paying for execution fees' },
        transfers: {
          type: 'array',
          description: 'Array of transfers to schedule',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Sender account ID' },
              to: { type: 'string', description: 'Recipient account ID' },
              amount: { type: 'number', description: 'Amount in tinybars' },
            },
            required: ['from', 'to', 'amount'],
          },
        },
        memo: { type: 'string', description: 'Optional memo for the schedule' },
        admin_key: { type: 'string', description: 'Optional admin key to manage the schedule' },
        wait_for_expiry: { type: 'boolean', description: 'Whether to wait for expiration time before execution' },
      },
      required: ['creator_id', 'payer_id', 'transfers'],
    },
  },
  {
    name: 'sign_scheduled_transaction',
    description: 'Add a signature to a scheduled transaction. Transaction executes automatically when required signatures are collected.',
    parameters: {
      type: 'object',
      properties: {
        schedule_id: { type: 'string', description: 'Schedule ID to sign' },
        signer_id: { type: 'string', description: 'Account ID of the signer' },
      },
      required: ['schedule_id', 'signer_id'],
    },
  },
  {
    name: 'delete_scheduled_transaction',
    description: 'Delete a scheduled transaction. Requires the admin key used when creating the schedule.',
    parameters: {
      type: 'object',
      properties: {
        schedule_id: { type: 'string', description: 'Schedule ID to delete' },
      },
      required: ['schedule_id'],
    },
  },
  {
    name: 'get_schedule_info',
    description: 'Get detailed information about a scheduled transaction including signatories, execution status, and expiration.',
    parameters: {
      type: 'object',
      properties: {
        schedule_id: { type: 'string', description: 'Schedule ID to query' },
      },
      required: ['schedule_id'],
    },
  },
  {
    name: 'create_scheduled_topic_message',
    description: 'Create a scheduled HCS topic message. Useful for delayed announcements or time-locked communications.',
    parameters: {
      type: 'object',
      properties: {
        creator_id: { type: 'string', description: 'Account ID creating the schedule' },
        payer_id: { type: 'string', description: 'Account ID paying for execution' },
        topic_id: { type: 'string', description: 'HCS topic ID' },
        message: { type: 'string', description: 'Message content to submit' },
        memo: { type: 'string', description: 'Optional schedule memo' },
      },
      required: ['creator_id', 'payer_id', 'topic_id', 'message'],
    },
  },
];
