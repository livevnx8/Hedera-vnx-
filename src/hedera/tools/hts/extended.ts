/**
 * Extended HTS Tools
 * Additional Hedera Token Service operations for complete functionality
 */

import {
  Client,
  TokenDissociateTransaction,
  TokenDeleteTransaction,
  TokenUpdateTransaction,
  TokenFreezeTransaction,
  TokenUnfreezeTransaction,
  TokenGrantKycTransaction,
  TokenRevokeKycTransaction,
  TokenWipeTransaction,
  AccountId,
  PrivateKey
} from '@hashgraph/sdk';
import type { HederaTool, ToolResult } from '../index.js';
import { getClient } from '../client.js';

// ============================================================================
// Tool: Dissociate Token
// ============================================================================

export const dissociateTokenTool: HederaTool = {
  name: 'hts_dissociate_token',
  category: 'hts',
  description: 'Dissociate a token from an account (removes ability to hold/send).',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (params.accountId && !params.accountId.match(/^0\.0\.\d+$/)) {
      return { valid: false, error: 'Invalid account ID format' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const accountId = params.accountId 
        ? AccountId.fromString(params.accountId)
        : client.operatorAccountId!;

      const transaction = new TokenDissociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([params.tokenId]);

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: accountId.toString(),
          status: 'Dissociated'
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to dissociate token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Delete Token
// ============================================================================

export const deleteTokenTool: HederaTool = {
  name: 'hts_delete_token',
  category: 'hts',
  description: 'Delete a token permanently (requires admin key). All tokens must be burned first.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenDeleteTransaction()
        .setTokenId(params.tokenId);

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          deleted: true,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/token/${params.tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Update Token
// ============================================================================

export const updateTokenTool: HederaTool = {
  name: 'hts_update_token',
  category: 'hts',
  description: 'Update token properties like name, symbol, keys, etc. (requires admin key).',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenUpdateTransaction()
        .setTokenId(params.tokenId);

      // Set optional fields if provided
      if (params.name) transaction.setTokenName(params.name);
      if (params.symbol) transaction.setTokenSymbol(params.symbol);
      if (params.memo) transaction.setTokenMemo(params.memo);
      if (params.treasuryId) transaction.setTreasuryAccountId(AccountId.fromString(params.treasuryId));
      if (params.autoRenewAccount) transaction.setAutoRenewAccountId(AccountId.fromString(params.autoRenewAccount));

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          updates: Object.keys(params).filter(k => k !== 'tokenId'),
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/token/${params.tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Freeze Token
// ============================================================================

export const freezeTokenTool: HederaTool = {
  name: 'hts_freeze_token',
  category: 'hts',
  description: 'Freeze an account from transferring a token (requires freeze key).',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (!params.accountId) {
      return { valid: false, error: 'Account ID to freeze is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenFreezeTransaction()
        .setTokenId(params.tokenId)
        .setAccountId(AccountId.fromString(params.accountId));

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: params.accountId,
          frozen: true,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to freeze token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Unfreeze Token
// ============================================================================

export const unfreezeTokenTool: HederaTool = {
  name: 'hts_unfreeze_token',
  category: 'hts',
  description: 'Unfreeze an account to allow token transfers again (requires freeze key).',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (!params.accountId) {
      return { valid: false, error: 'Account ID to unfreeze is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenUnfreezeTransaction()
        .setTokenId(params.tokenId)
        .setAccountId(AccountId.fromString(params.accountId));

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: params.accountId,
          frozen: false,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to unfreeze token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Grant KYC
// ============================================================================

export const grantKycTool: HederaTool = {
  name: 'hts_grant_kyc',
  category: 'hts',
  description: 'Grant KYC to an account for a token (requires KYC key).',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (!params.accountId) {
      return { valid: false, error: 'Account ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenGrantKycTransaction()
        .setTokenId(params.tokenId)
        .setAccountId(AccountId.fromString(params.accountId));

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: params.accountId,
          kycGranted: true,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to grant KYC: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Revoke KYC
// ============================================================================

export const revokeKycTool: HederaTool = {
  name: 'hts_revoke_kyc',
  category: 'hts',
  description: 'Revoke KYC from an account for a token (requires KYC key).',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (!params.accountId) {
      return { valid: false, error: 'Account ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenRevokeKycTransaction()
        .setTokenId(params.tokenId)
        .setAccountId(AccountId.fromString(params.accountId));

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: params.accountId,
          kycGranted: false,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to revoke KYC: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Wipe Token
// ============================================================================

export const wipeTokenTool: HederaTool = {
  name: 'hts_wipe_token',
  category: 'hts',
  description: 'Wipe (confiscate) tokens from an account (requires wipe key). For NFTs, destroys the token.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (!params.accountId) {
      return { valid: false, error: 'Account ID to wipe from is required' };
    }
    if (!params.isNFT && (!params.amount || params.amount <= 0)) {
      return { valid: false, error: 'Amount required for fungible tokens' };
    }
    if (params.isNFT && !params.serialNumber) {
      return { valid: false, error: 'Serial number required for NFT' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenWipeTransaction()
        .setTokenId(params.tokenId)
        .setAccountId(AccountId.fromString(params.accountId));

      if (params.isNFT) {
        transaction.setSerials([params.serialNumber]);
      } else {
        transaction.setAmount(params.amount);
      }

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: params.accountId,
          wiped: params.isNFT ? `NFT #${params.serialNumber}` : `${params.amount} tokens`,
          status: receipt.status.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${params.accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to wipe tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Export Extended HTS Tools
// ============================================================================

export const extendedHtsTools: HederaTool[] = [
  dissociateTokenTool,
  deleteTokenTool,
  updateTokenTool,
  freezeTokenTool,
  unfreezeTokenTool,
  grantKycTool,
  revokeKycTool,
  wipeTokenTool
];

export default extendedHtsTools;
