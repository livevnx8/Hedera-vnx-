/**
 * Advanced Token Operations
 * 
 * Token allowance management, advanced metadata operations, and key management.
 */

import {
  Client,
  AccountId,
  TokenId,
  AccountAllowanceApproveTransaction,
  TokenAssociateTransaction,
  TokenDissociateTransaction,
  TokenFreezeTransaction,
  TokenUnfreezeTransaction,
  TokenWipeTransaction,
  TokenPauseTransaction,
  TokenUnpauseTransaction,
  NftId,
} from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';

export interface AllowanceInfo {
  spenderId: string;
  tokenId?: string; // undefined for HBAR
  amount: number;
  ownerId: string;
}

export interface TokenKeyInfo {
  adminKey?: string;
  supplyKey?: string;
  freezeKey?: string;
  wipeKey?: string;
  pauseKey?: string;
  kycKey?: string;
  feeScheduleKey?: string;
}

/**
 * Approve HBAR allowance for spender
 */
export async function approveHbarAllowance(
  client: Client,
  ownerId: string,
  spenderId: string,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(
        AccountId.fromString(ownerId),
        AccountId.fromString(spenderId),
        amount
      )
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenAllowance', { 
      message: 'HBAR allowance approved', 
      ownerId, spenderId, amount,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenAllowance', { message: 'Failed to approve HBAR allowance', ownerId, spenderId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Approve token allowance for spender
 */
export async function approveTokenAllowance(
  client: Client,
  ownerId: string,
  tokenId: string,
  spenderId: string,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(
        TokenId.fromString(tokenId),
        AccountId.fromString(ownerId),
        AccountId.fromString(spenderId),
        amount
      )
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenAllowance', { 
      message: 'Token allowance approved', 
      ownerId, tokenId, spenderId, amount,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenAllowance', { message: 'Failed to approve token allowance', ownerId, tokenId, spenderId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Approve NFT allowance for spender (all serials)
 */
export async function approveNftAllowance(
  client: Client,
  ownerId: string,
  tokenId: string,
  spenderId: string,
  serialNumbers?: number[]
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new AccountAllowanceApproveTransaction();

    if (serialNumbers && serialNumbers.length > 0) {
      // Approve specific serials
      for (const serial of serialNumbers) {
        const nftId = new NftId(TokenId.fromString(tokenId), serial);
        transaction.approveTokenNftAllowance(
          nftId,
          AccountId.fromString(ownerId),
          AccountId.fromString(spenderId)
        );
      }
    } else {
      // Approve all serials
      transaction.approveTokenNftAllowanceAllSerials(
        TokenId.fromString(tokenId),
        AccountId.fromString(ownerId),
        AccountId.fromString(spenderId)
      );
    }

    transaction.freezeWith(client);
    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenAllowance', { 
      message: 'NFT allowance approved', 
      ownerId, tokenId, spenderId, serialNumbers,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenAllowance', { message: 'Failed to approve NFT allowance', ownerId, tokenId, spenderId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete HBAR allowance
 */
export async function deleteHbarAllowance(
  client: Client,
  ownerId: string,
  spenderId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    // To delete allowance, approve with 0 amount
    const transaction = new AccountAllowanceApproveTransaction()
      .approveHbarAllowance(AccountId.fromString(ownerId), AccountId.fromString(spenderId), 0)
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenAllowance', { 
      message: 'HBAR allowance deleted', 
      ownerId, spenderId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenAllowance', { message: 'Failed to delete HBAR allowance', ownerId, spenderId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete token allowance
 */
export async function deleteTokenAllowance(
  client: Client,
  ownerId: string,
  tokenId: string,
  spenderId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    // To delete allowance, approve with 0 amount
    const transaction = new AccountAllowanceApproveTransaction()
      .approveTokenAllowance(TokenId.fromString(tokenId), AccountId.fromString(ownerId), AccountId.fromString(spenderId), 0)
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenAllowance', { 
      message: 'Token allowance deleted', 
      ownerId, tokenId, spenderId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenAllowance', { message: 'Failed to delete token allowance', ownerId, tokenId, spenderId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Associate token with account
 */
export async function associateToken(
  client: Client,
  accountId: string,
  tokenId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(tokenId)])
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Token associated', 
      accountId, tokenId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to associate token', accountId, tokenId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Dissociate token from account
 */
export async function dissociateToken(
  client: Client,
  accountId: string,
  tokenId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenDissociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(tokenId)])
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Token dissociated', 
      accountId, tokenId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to dissociate token', accountId, tokenId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Freeze token for account
 */
export async function freezeToken(
  client: Client,
  tokenId: string,
  accountId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenFreezeTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Token frozen', 
      tokenId, accountId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to freeze token', tokenId, accountId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Unfreeze token for account
 */
export async function unfreezeToken(
  client: Client,
  tokenId: string,
  accountId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenUnfreezeTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Token unfrozen', 
      tokenId, accountId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to unfreeze token', tokenId, accountId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Wipe tokens from account
 */
export async function wipeTokens(
  client: Client,
  tokenId: string,
  accountId: string,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenWipeTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAccountId(AccountId.fromString(accountId))
      .setAmount(amount)
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Tokens wiped', 
      tokenId, accountId, amount,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to wipe tokens', tokenId, accountId, amount, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Pause token operations
 */
export async function pauseToken(
  client: Client,
  tokenId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenPauseTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Token paused', 
      tokenId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to pause token', tokenId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Unpause token operations
 */
export async function unpauseToken(
  client: Client,
  tokenId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new TokenUnpauseTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    logger.info('TokenMetadata', { 
      message: 'Token unpaused', 
      tokenId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('TokenMetadata', { message: 'Failed to unpause token', tokenId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Tool definitions for advanced token operations
 */
export const advancedTokenToolDefinitions = [
  {
    name: 'approve_hbar_allowance',
    description: 'Approve HBAR spending allowance for a spender account. Allows spender to transfer HBAR on behalf of owner.',
    parameters: {
      type: 'object',
      properties: {
        owner_id: { type: 'string', description: 'Account ID granting allowance' },
        spender_id: { type: 'string', description: 'Account ID receiving allowance' },
        amount: { type: 'number', description: 'Amount of HBAR to approve (in tinybars)' },
      },
      required: ['owner_id', 'spender_id', 'amount'],
    },
  },
  {
    name: 'approve_token_allowance',
    description: 'Approve token spending allowance for a spender. Spender can transfer tokens on behalf of owner.',
    parameters: {
      type: 'object',
      properties: {
        owner_id: { type: 'string', description: 'Account ID granting allowance' },
        token_id: { type: 'string', description: 'Token ID to approve' },
        spender_id: { type: 'string', description: 'Account ID receiving allowance' },
        amount: { type: 'number', description: 'Token amount to approve' },
      },
      required: ['owner_id', 'token_id', 'spender_id', 'amount'],
    },
  },
  {
    name: 'approve_nft_allowance',
    description: 'Approve NFT spending for spender. Can approve specific serials or all serials in collection.',
    parameters: {
      type: 'object',
      properties: {
        owner_id: { type: 'string', description: 'Account ID granting allowance' },
        token_id: { type: 'string', description: 'NFT collection token ID' },
        spender_id: { type: 'string', description: 'Account ID receiving allowance' },
        serial_numbers: { 
          type: 'array', 
          description: 'Specific serial numbers to approve (omit for all)',
          items: { type: 'number' }
        },
      },
      required: ['owner_id', 'token_id', 'spender_id'],
    },
  },
  {
    name: 'delete_hbar_allowance',
    description: 'Revoke all HBAR allowances for owner. Removes all spender approvals.',
    parameters: {
      type: 'object',
      properties: {
        owner_id: { type: 'string', description: 'Account ID revoking allowances' },
      },
      required: ['owner_id'],
    },
  },
  {
    name: 'delete_token_allowance',
    description: 'Revoke token allowance for a specific spender.',
    parameters: {
      type: 'object',
      properties: {
        owner_id: { type: 'string', description: 'Account ID revoking allowance' },
        token_id: { type: 'string', description: 'Token ID' },
        spender_id: { type: 'string', description: 'Spender account ID' },
      },
      required: ['owner_id', 'token_id', 'spender_id'],
    },
  },
  {
    name: 'associate_token',
    description: 'Associate a token with an account. Required before account can receive the token.',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account to associate token with' },
        token_id: { type: 'string', description: 'Token ID to associate' },
      },
      required: ['account_id', 'token_id'],
    },
  },
  {
    name: 'dissociate_token',
    description: 'Dissociate a token from an account. Token balance must be zero.',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account to dissociate token from' },
        token_id: { type: 'string', description: 'Token ID to dissociate' },
      },
      required: ['account_id', 'token_id'],
    },
  },
  {
    name: 'freeze_token',
    description: 'Freeze token transfers for an account. Account cannot send/receive frozen token.',
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to freeze' },
        account_id: { type: 'string', description: 'Account to freeze' },
      },
      required: ['token_id', 'account_id'],
    },
  },
  {
    name: 'unfreeze_token',
    description: 'Unfreeze token transfers for an account. Requires freeze key.',
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to unfreeze' },
        account_id: { type: 'string', description: 'Account to unfreeze' },
      },
      required: ['token_id', 'account_id'],
    },
  },
  {
    name: 'wipe_tokens',
    description: 'Wipe (burn) tokens from an account. Tokens are removed from circulation. Requires wipe key.',
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to wipe' },
        account_id: { type: 'string', description: 'Account to wipe from' },
        amount: { type: 'number', description: 'Amount to wipe' },
      },
      required: ['token_id', 'account_id', 'amount'],
    },
  },
  {
    name: 'pause_token',
    description: 'Pause all token operations. No transfers, mints, or burns allowed. Requires pause key.',
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to pause' },
      },
      required: ['token_id'],
    },
  },
  {
    name: 'unpause_token',
    description: 'Unpause token operations. Requires pause key.',
    parameters: {
      type: 'object',
      properties: {
        token_id: { type: 'string', description: 'Token ID to unpause' },
      },
      required: ['token_id'],
    },
  },
];
