/**
 * Query Tools for Hedera
 * Data retrieval and analytics tools
 */

import {
  Client,
  TokenInfoQuery,
  AccountBalanceQuery,
  AccountInfoQuery,
  TopicInfoQuery
} from '@hashgraph/sdk';
import type { HederaTool, ToolResult } from '../index.js';
import { getClient } from '../client.js';

// ============================================================================
// Tool: Get Token Info
// ============================================================================

export const getTokenInfoTool: HederaTool = {
  name: 'query_get_token_info',
  category: 'query',
  description: 'Get detailed information about a token including supply, decimals, and keys.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const tokenInfo = await new TokenInfoQuery()
        .setTokenId(params.tokenId)
        .execute(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          totalSupply: tokenInfo.totalSupply.toString(),
          treasury: tokenInfo.treasuryAccountId?.toString(),
          type: tokenInfo.tokenType.toString(),
          supplyType: tokenInfo.supplyType.toString(),
          maxSupply: tokenInfo.maxSupply?.toString() || null,
          expirationTime: tokenInfo.expirationTime?.toDate().toISOString() || null,
          // Keys
          adminKey: tokenInfo.adminKey ? 'Present' : 'None',
          supplyKey: tokenInfo.supplyKey ? 'Present' : 'None',
          freezeKey: tokenInfo.freezeKey ? 'Present' : 'None',
          wipeKey: tokenInfo.wipeKey ? 'Present' : 'None',
          kycKey: tokenInfo.kycKey ? 'Present' : 'None',
          pauseKey: tokenInfo.pauseKey ? 'Present' : 'None',
          feeScheduleKey: tokenInfo.feeScheduleKey ? 'Present' : 'None'
        },
        hashscanUrl: `https://hashscan.io/mainnet/token/${params.tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get token info: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Get Account Info
// ============================================================================

export const getAccountInfoTool: HederaTool = {
  name: 'query_get_account_info',
  category: 'query',
  description: 'Get detailed information about a Hedera account.',
  
  validateParams: (params) => {
    if (!params.accountId) {
      return { valid: false, error: 'Account ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      // Get account info
      const accountInfo = await new AccountInfoQuery()
        .setAccountId(params.accountId)
        .execute(client);

      // Get balance separately
      const balance = await new AccountBalanceQuery()
        .setAccountId(params.accountId)
        .execute(client);

      return {
        success: true,
        data: {
          accountId: params.accountId,
          balance: balance.hbars.toString(),
          key: accountInfo.key ? 'Present' : 'None',
          expirationTime: accountInfo.expirationTime?.toDate().toISOString() || null,
          autoRenewPeriod: accountInfo.autoRenewPeriod?.toString() || null,
          receiverSigRequired: accountInfo.isReceiverSignatureRequired,
          ownedNfts: accountInfo.ownedNfts?.toString() || '0',
          maxAutomaticTokenAssociations: accountInfo.maxAutomaticTokenAssociations
        },
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Get Exchange Rate
// ============================================================================

export const getExchangeRateTool: HederaTool = {
  name: 'query_get_exchange_rate',
  category: 'query',
  description: 'Get current HBAR to USD exchange rate from Hedera network.',
  
  validateParams: () => {
    return { valid: true };
  },

  execute: async (): Promise<ToolResult> => {
    // Note: Exchange rate requires ExchangeRateQuery which may not be in all SDK versions
    // For now, return static or use mirror node API
    return {
      success: true,
      data: {
        hbarToUsd: 0.05, // This would be dynamic in full implementation
        usdToHbar: 20,
        timestamp: new Date().toISOString(),
        note: 'Using static rate for demo - implement ExchangeRateQuery for live data'
      }
    };
  }
};

// ============================================================================
// Export Query Tools
// ============================================================================

export const queryTools: HederaTool[] = [
  getTokenInfoTool,
  getAccountInfoTool,
  getExchangeRateTool
];

export default queryTools;
