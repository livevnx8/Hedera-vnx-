/**
 * Wallet Dashboard API
 * 
 * Provides manual wallet management UI endpoints:
 * - Account overview (balance, tokens, transactions)
 * - Quick send/receive forms
 * - Transaction history
 * - Token management
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { 
  transferHbar,
  transferHtsToken,
  associateHtsToken
} from '../hedera/hederaTxTools.js';
import { 
  getAccountInfo,
  getAccountBalance,
  getAccountTokens
} from '../hedera/mirrorApi.js';
import { config } from '../config.js';

const wallet: FastifyPluginAsync = async (fastify) => {
  // Get wallet overview
  fastify.get('/wallet/overview', async (request, reply) => {
    const accountId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!accountId) {
      return reply.code(400).send({ error: 'No operator account configured' });
    }

    try {
      const [info, balance, tokens] = await Promise.all([
        getAccountInfo(accountId),
        getAccountBalance(accountId),
        getAccountTokens(accountId)
      ]);

      return {
        account: {
          id: accountId,
          balance: balance,
          tokenCount: tokens.length,
          created: info.created_timestamp,
          memo: info.memo
        },
        tokens: tokens.map((t: any) => ({
          tokenId: t.token_id,
          symbol: t.symbol || 'Unknown',
          name: t.name || 'Token ' + t.token_id,
          balance: t.balance,
          decimals: t.decimals,
          url: `https://hashscan.io/${config.HEDERA_NETWORK}/token/${t.token_id}`
        })),
        network: config.HEDERA_NETWORK,
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/account/${accountId}`
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch wallet data' });
    }
  });

  // Send HBAR
  fastify.post('/wallet/send/hbar', async (request, reply) => {
    const SendHbarSchema = z.object({
      toAccountId: z.string().regex(/^0\.0\.\d+$/, 'Invalid account ID format'),
      amount: z.number().positive('Amount must be positive'),
      memo: z.string().optional()
    });

    try {
      const parsed = SendHbarSchema.parse(request.body);
      
      const result = await transferHbar({
        toAccountId: parsed.toAccountId,
        amountHbar: parsed.amount,
        memo: parsed.memo
      });

      return {
        success: true,
        transactionId: result.txId,
        status: result.status,
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/tx/${result.txId}`
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Transfer failed' });
    }
  });

  // Send Token
  fastify.post('/wallet/send/token', async (request, reply) => {
    const SendTokenSchema = z.object({
      tokenId: z.string().regex(/^0\.0\.\d+$/, 'Invalid token ID format'),
      toAccountId: z.string().regex(/^0\.0\.\d+$/, 'Invalid account ID format'),
      amount: z.number().positive('Amount must be positive'),
      decimals: z.number().int().min(0).max(50).default(8)
    });

    try {
      const parsed = SendTokenSchema.parse(request.body);
      
      const result = await transferHtsToken({
        tokenId: parsed.tokenId,
        toAccountId: parsed.toAccountId,
        amount: parsed.amount
      });

      return {
        success: true,
        transactionId: result.txId,
        status: result.status,
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/tx/${result.txId}`
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Transfer failed' });
    }
  });

  // Associate Token
  fastify.post('/wallet/associate', async (request, reply) => {
    const AssociateSchema = z.object({
      tokenId: z.string().regex(/^0\.0\.\d+$/, 'Invalid token ID format')
    });

    try {
      const parsed = AssociateSchema.parse(request.body);
      
      const result = await associateHtsToken({
        tokenId: parsed.tokenId
      });

      return {
        success: true,
        transactionId: result.txId,
        status: result.status,
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/tx/${result.txId}`
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Association failed' });
    }
  });

  // Transaction History
  fastify.get('/wallet/transactions', async (request, reply) => {
    const accountId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!accountId) {
      return reply.code(400).send({ error: 'No operator account configured' });
    }

    try {
      // Get recent transactions from Mirror Node
      const response = await fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/transactions?account.id=${accountId}&limit=20&order=desc`);
      const data = await response.json();

      const transactions = data.transactions?.map((tx: any) => ({
        transactionId: tx.transaction_id,
        consensusTimestamp: tx.consensus_timestamp,
        type: tx.name,
        result: tx.result,
        memo: tx.memo || '',
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/tx/${tx.transaction_id}`
      })) || [];

      return { transactions };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch transactions' });
    }
  });

  // Token Details
  fastify.get('/wallet/token/:tokenId', async (request, reply) => {
    const TokenIdSchema = z.object({
      tokenId: z.string().regex(/^0\.0\.\d+$/, 'Invalid token ID format')
    });

    try {
      const { tokenId } = TokenIdSchema.parse(request.params);

      // Get token info from Mirror Node
      const [tokenResponse, balanceResponse] = await Promise.all([
        fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/tokens/${tokenId}`),
        fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/tokens/${tokenId}/balances`)
      ]);

      const tokenInfo = await tokenResponse.json();
      const balances = await balanceResponse.json();

      return {
        tokenId,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        totalSupply: tokenInfo.total_supply,
        type: tokenInfo.type,
        supplyType: tokenInfo.supply_type,
        created: tokenInfo.created_timestamp,
        holders: balances.balances?.slice(0, 10).map((b: any) => ({
          accountId: b.account,
          balance: b.balance
        })) || [],
        hashscan: `https://hashscan.io/${config.HEDERA_NETWORK}/token/${tokenId}`
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch token details' });
    }
  });
};

export default wallet;
