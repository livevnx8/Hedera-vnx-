/**
 * Account Tools for Hedera
 * Account creation, balance queries, and transfers
 */

import {
  Client,
  AccountCreateTransaction,
  AccountBalanceQuery,
  TransferTransaction,
  Hbar,
  AccountId
} from '@hashgraph/sdk';
import type { HederaTool, ToolResult } from '../index.js';
import { getClient } from '../client.js';

// ============================================================================
// Tool: Get Account Balance
// ============================================================================

export const getAccountBalanceTool: HederaTool = {
  name: 'account_get_balance',
  category: 'account',
  description: 'Get HBAR and token balances for a Hedera account.',
  
  validateParams: (params) => {
    if (!params.accountId) {
      return { valid: false, error: 'Account ID is required' };
    }
    if (!params.accountId.match(/^0\.0\.\d+$/)) {
      return { valid: false, error: 'Invalid account ID format (expected: 0.0.X)' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const query = new AccountBalanceQuery()
        .setAccountId(params.accountId);
      
      const accountBalance = await query.execute(client);

      // Convert tokens map to object
      const tokens: Record<string, string> = {};
      accountBalance.tokens._map.forEach((value: any, key: any) => {
        tokens[key.toString()] = value.toString();
      });

      return {
        success: true,
        data: {
          accountId: params.accountId,
          hbarBalance: accountBalance.hbars.toString(),
          hbarBalanceTinybar: accountBalance.hbars.toTinybars().toString(),
          tokenBalances: tokens,
          timestamp: new Date().toISOString()
        },
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Transfer HBAR
// ============================================================================

export const transferHBARTool: HederaTool = {
  name: 'account_transfer_hbar',
  category: 'account',
  description: 'Transfer HBAR from one account to another.',
  
  validateParams: (params) => {
    if (!params.toAccountId) {
      return { valid: false, error: 'Recipient account ID is required' };
    }
    if (!params.toAccountId.match(/^0\.0\.\d+$/)) {
      return { valid: false, error: 'Invalid recipient account ID format' };
    }
    if (params.amount === undefined || params.amount <= 0) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }
    if (params.fromAccountId && !params.fromAccountId.match(/^0\.0\.\d+$/)) {
      return { valid: false, error: 'Invalid sender account ID format' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const senderId = params.fromAccountId 
        ? AccountId.fromString(params.fromAccountId)
        : client.operatorAccountId!;
      
      const recipientId = AccountId.fromString(params.toAccountId);
      const amount = Hbar.fromTinybars(Math.floor(params.amount * 100_000_000)); // Convert HBAR to tinybars

      const transaction = new TransferTransaction()
        .addHbarTransfer(senderId, amount.negated())
        .addHbarTransfer(recipientId, amount);
      
      if (params.memo) {
        transaction.setTransactionMemo(params.memo);
      }

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          from: senderId.toString(),
          to: recipientId.toString(),
          amount: params.amount,
          memo: params.memo || null,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/transaction/${txResponse.transactionId.toString().replace('@', '-')}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to transfer HBAR: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Export Account Tools
// ============================================================================

export const accountTools: HederaTool[] = [
  getAccountBalanceTool,
  transferHBARTool
];

export default accountTools;
