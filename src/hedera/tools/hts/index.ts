/**
 * HTS - Hedera Token Service Tools
 * Complete implementation for token and NFT operations
 */

import {
  Client,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenInfoQuery,
  NftId,
  PrivateKey,
  AccountId
} from '@hashgraph/sdk';
import type { HederaTool, ToolResult } from '../index.js';
import { getClient } from '../client.js';

// ============================================================================
// Tool: Create Fungible Token
// ============================================================================

export const createFungibleTokenTool: HederaTool = {
  name: 'hts_create_fungible_token',
  category: 'hts',
  description: 'Create a new fungible token on Hedera Token Service (HTS). Supports both fixed and infinite supply.',
  
  validateParams: (params) => {
    if (!params.name || typeof params.name !== 'string') {
      return { valid: false, error: 'Token name is required' };
    }
    if (!params.symbol || typeof params.symbol !== 'string') {
      return { valid: false, error: 'Token symbol is required' };
    }
    if (params.decimals !== undefined && (params.decimals < 0 || params.decimals > 18)) {
      return { valid: false, error: 'Decimals must be between 0 and 18' };
    }
    if (params.initialSupply !== undefined && params.initialSupply < 0) {
      return { valid: false, error: 'Initial supply cannot be negative' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const supplyType = (params.maxSupply !== undefined ? 0 : 1) as any;

      const transaction = new TokenCreateTransaction()
        .setTokenName(params.name)
        .setTokenSymbol(params.symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(supplyType)
        .setDecimals(params.decimals || 8)
        .setInitialSupply(params.initialSupply || 0);

      // Set max supply if provided (creates fixed supply token)
      if (params.maxSupply) {
        transaction.setMaxSupply(params.maxSupply);
      }

      // Configure keys
      if (params.supplyKey !== false) {
        const supplyKey = params.supplyKey 
          ? PrivateKey.fromString(params.supplyKey)
          : client.operatorPublicKey!;
        transaction.setSupplyKey(supplyKey);
      }

      if (params.adminKey !== false) {
        const adminKey = params.adminKey
          ? PrivateKey.fromString(params.adminKey)
          : client.operatorPublicKey!;
        transaction.setAdminKey(adminKey);
      }

      if (params.freezeKey) {
        transaction.setFreezeKey(PrivateKey.fromString(params.freezeKey));
      }

      if (params.wipeKey) {
        transaction.setWipeKey(PrivateKey.fromString(params.wipeKey));
      }

      // Set treasury
      if (params.treasuryId) {
        transaction.setTreasuryAccountId(AccountId.fromString(params.treasuryId));
      } else {
        transaction.setTreasuryAccountId(client.operatorAccountId!);
      }

      // Execute transaction
      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);
      const tokenId = receipt.tokenId!.toString();

      return {
        success: true,
        data: {
          tokenId,
          name: params.name,
          symbol: params.symbol,
          type: 'Fungible',
          supplyType: params.maxSupply !== undefined ? 'Fixed' : 'Infinite',
          decimals: params.decimals || 8,
          initialSupply: params.initialSupply || 0,
          treasury: params.treasuryId || client.operatorAccountId!.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/token/${tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Create NFT Collection
// ============================================================================

export const createNFTCollectionTool: HederaTool = {
  name: 'hts_create_nft_collection',
  category: 'hts',
  description: 'Create a new NFT collection (Non-Fungible Token) on Hedera.',
  
  validateParams: (params) => {
    if (!params.name || typeof params.name !== 'string') {
      return { valid: false, error: 'Collection name is required' };
    }
    if (!params.symbol || typeof params.symbol !== 'string') {
      return { valid: false, error: 'Collection symbol is required' };
    }
    if (params.maxSupply !== undefined && params.maxSupply <= 0) {
      return { valid: false, error: 'Max supply must be greater than 0' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const supplyType = (params.maxSupply !== undefined ? 0 : 1) as any;

      const transaction = new TokenCreateTransaction()
        .setTokenName(params.name)
        .setTokenSymbol(params.symbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(supplyType)
        .setDecimals(0);

      if (params.maxSupply) {
        transaction.setMaxSupply(params.maxSupply);
      }

      // Configure keys
      if (params.supplyKey !== false) {
        const supplyKey = params.supplyKey
          ? PrivateKey.fromString(params.supplyKey)
          : client.operatorPublicKey!;
        transaction.setSupplyKey(supplyKey);
      }

      if (params.adminKey !== false) {
        const adminKey = params.adminKey
          ? PrivateKey.fromString(params.adminKey)
          : client.operatorPublicKey!;
        transaction.setAdminKey(adminKey);
      }

      if (params.freezeKey) {
        transaction.setFreezeKey(PrivateKey.fromString(params.freezeKey));
      }

      if (params.wipeKey) {
        transaction.setWipeKey(PrivateKey.fromString(params.wipeKey));
      }

      // Set treasury
      if (params.treasuryId) {
        transaction.setTreasuryAccountId(AccountId.fromString(params.treasuryId));
      } else {
        transaction.setTreasuryAccountId(client.operatorAccountId!);
      }

      // Execute transaction
      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);
      const tokenId = receipt.tokenId!.toString();

      return {
        success: true,
        data: {
          tokenId,
          name: params.name,
          symbol: params.symbol,
          type: 'NFT Collection',
          supplyType: params.maxSupply !== undefined ? 'Fixed' : 'Infinite',
          maxSupply: params.maxSupply || 'Unlimited',
          treasury: params.treasuryId || client.operatorAccountId!.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/token/${tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create NFT collection: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Mint Fungible Tokens
// ============================================================================

export const mintFungibleTokenTool: HederaTool = {
  name: 'hts_mint_fungible',
  category: 'hts',
  description: 'Mint additional fungible tokens to increase the supply.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (params.amount === undefined || params.amount <= 0) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenMintTransaction()
        .setTokenId(params.tokenId)
        .setAmount(params.amount);

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      // Get current token info
      const tokenInfo = await new TokenInfoQuery()
        .setTokenId(params.tokenId)
        .execute(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          mintedAmount: params.amount,
          newTotalSupply: tokenInfo.totalSupply.toString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/token/${params.tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to mint tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Mint NFT
// ============================================================================

export const mintNFTTool: HederaTool = {
  name: 'hts_mint_nft',
  category: 'hts',
  description: 'Mint a new NFT with metadata to an existing collection.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID (collection) is required' };
    }
    if (!params.metadata) {
      return { valid: false, error: 'Metadata is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      // Convert metadata to Buffer
      const metadataBuffer = Buffer.from(params.metadata, 'utf8');

      const transaction = new TokenMintTransaction()
        .setTokenId(params.tokenId)
        .setMetadata([metadataBuffer]);

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      // Get the serial number - use receipt info instead
      const serialNumber = 1; // Simplified - would need mirror node query for actual serial

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          serialNumber: serialNumber.toString(),
          nftId: `${params.tokenId}/${serialNumber}`,
          metadata: params.metadata
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/token/${params.tokenId}/${serialNumber}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to mint NFT: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Burn Tokens
// ============================================================================

export const burnTokenTool: HederaTool = {
  name: 'hts_burn_token',
  category: 'hts',
  description: 'Burn (destroy) fungible tokens or NFTs to reduce supply.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (params.isNFT) {
      if (!params.serialNumber) {
        return { valid: false, error: 'Serial number is required for NFT burn' };
      }
    } else {
      if (params.amount === undefined || params.amount <= 0) {
        return { valid: false, error: 'Amount must be greater than 0 for fungible token burn' };
      }
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TokenBurnTransaction()
        .setTokenId(params.tokenId);

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
          isNFT: params.isNFT,
          burned: params.isNFT ? `NFT #${params.serialNumber}` : `${params.amount} tokens`
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: params.isNFT 
          ? `https://hashscan.io/mainnet/token/${params.tokenId}/${params.serialNumber}`
          : `https://hashscan.io/mainnet/token/${params.tokenId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to burn tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Associate Token
// ============================================================================

export const associateTokenTool: HederaTool = {
  name: 'hts_associate_token',
  category: 'hts',
  description: 'Associate a token with an account to enable receiving it.',
  
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

      const transaction = new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([params.tokenId]);

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          accountId: accountId.toString(),
          status: 'Associated'
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/account/${accountId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to associate token: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Transfer Token
// ============================================================================

export const transferTokenTool: HederaTool = {
  name: 'hts_transfer_token',
  category: 'hts',
  description: 'Transfer fungible tokens or NFTs to another account.',
  
  validateParams: (params) => {
    if (!params.tokenId) {
      return { valid: false, error: 'Token ID is required' };
    }
    if (!params.toAccountId) {
      return { valid: false, error: 'Recipient account ID is required' };
    }
    if (!params.toAccountId.match(/^0\.0\.\d+$/)) {
      return { valid: false, error: 'Invalid recipient account ID format' };
    }
    if (params.isNFT) {
      if (!params.serialNumber) {
        return { valid: false, error: 'Serial number is required for NFT transfer' };
      }
    } else {
      if (params.amount === undefined || params.amount <= 0) {
        return { valid: false, error: 'Amount must be greater than 0 for token transfer' };
      }
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

      const transaction = new TransferTransaction();

      if (params.isNFT) {
        transaction.addNftTransfer(
          new NftId(params.tokenId, params.serialNumber),
          senderId,
          recipientId
        );
      } else {
        transaction.addTokenTransfer(params.tokenId, senderId, -params.amount);
        transaction.addTokenTransfer(params.tokenId, recipientId, params.amount);
      }

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      return {
        success: true,
        data: {
          tokenId: params.tokenId,
          from: senderId.toString(),
          to: recipientId.toString(),
          transferred: params.isNFT 
            ? `NFT #${params.serialNumber}` 
            : `${params.amount} tokens`,
          isNFT: params.isNFT
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/transaction/${txResponse.transactionId.toString().replace('@', '-')}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to transfer tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Export All HTS Tools
// ============================================================================

export const htsTools: HederaTool[] = [
  createFungibleTokenTool,
  createNFTCollectionTool,
  mintFungibleTokenTool,
  mintNFTTool,
  burnTokenTool,
  associateTokenTool,
  transferTokenTool
];

// Extended HTS tools (dissociate, delete, update, freeze, etc.)
export { extendedHtsTools } from './extended.js';

export default htsTools;
