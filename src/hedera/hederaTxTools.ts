import {
  TransferTransaction,
  Hbar,
  TopicMessageSubmitTransaction,
  TopicId,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenAssociateTransaction,
  TokenDissociateTransaction,
  NftId,
  TokenId,
  AccountId,
  AccountCreateTransaction,
  TokenType,
  TokenSupplyType,
  PrivateKey,
} from '@hashgraph/sdk';
import { config } from '../config.js';
import { getHederaClient } from './hcs.js';

function explorerUrl(txId: string): string {
  const net = config.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/transaction/${txId}`;
}

export async function transferHbar(params: {
  toAccountId: string;
  amountHbar: number;
  memo?: string;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const tx = new TransferTransaction()
    .addHbarTransfer(config.HEDERA_OPERATOR_ACCOUNT_ID, new Hbar(-params.amountHbar))
    .addHbarTransfer(params.toAccountId, new Hbar(params.amountHbar));

  if (params.memo) tx.setTransactionMemo(params.memo);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  const txId = response.transactionId.toString();

  return {
    txId,
    status: receipt.status.toString(),
    explorerUrl: explorerUrl(txId),
  };
}

export async function sendHcsMessage(params: {
  topicId: string;
  message: string;
}): Promise<{ txId: string; status: string; sequenceNumber: number | null }> {
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const tx = await new TopicMessageSubmitTransaction({
    topicId: TopicId.fromString(params.topicId),
    message: params.message,
  }).execute(client);

  const receipt = await tx.getReceipt(client);

  return {
    txId: tx.transactionId.toString(),
    status: receipt.status.toString(),
    sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : null,
  };
}

export async function mintHtsToken(params: {
  tokenId: string;
  amount: number;
  memo?: string;
}): Promise<{ txId: string; status: string; newTotalSupply: string; explorerUrl: string }> {
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const tokenIdObj = TokenId.fromString(params.tokenId);
  const tx = new TokenMintTransaction()
    .setTokenId(tokenIdObj)
    .setAmount(params.amount);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return {
    txId,
    status: receipt.status.toString(),
    newTotalSupply: receipt.totalSupply?.toString() ?? 'unknown',
    explorerUrl: explorerUrl(txId),
  };
}

export async function burnHtsToken(params: {
  tokenId: string;
  amount: number;
}): Promise<{ txId: string; status: string; newTotalSupply: string; explorerUrl: string }> {
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const tx = new TokenBurnTransaction()
    .setTokenId(TokenId.fromString(params.tokenId))
    .setAmount(params.amount);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return {
    txId,
    status: receipt.status.toString(),
    newTotalSupply: receipt.totalSupply?.toString() ?? 'unknown',
    explorerUrl: explorerUrl(txId),
  };
}

export async function transferHtsToken(params: {
  tokenId: string;
  toAccountId: string;
  amount: number;
  memo?: string;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const tx = new TransferTransaction()
    .addTokenTransfer(params.tokenId, config.HEDERA_OPERATOR_ACCOUNT_ID, -params.amount)
    .addTokenTransfer(params.tokenId, params.toAccountId, params.amount);

  if (params.memo) tx.setTransactionMemo(params.memo);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerUrl(txId) };
}

export async function associateHtsToken(params: {
  tokenId: string;
  accountId?: string;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const targetAccount = params.accountId ?? config.HEDERA_OPERATOR_ACCOUNT_ID;

  const tx = new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(targetAccount))
    .setTokenIds([TokenId.fromString(params.tokenId)]);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerUrl(txId) };
}

export async function createHtsToken(params: {
  name: string;
  symbol: string;
  decimals?: number;
  initialSupply?: number;
  memo?: string;
  maxSupply?: number;
}): Promise<{ tokenId: string; txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY must be configured');
  }

  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const adminKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY);
  const decimals = params.decimals ?? 8;
  const initialSupply = params.initialSupply ?? 1_000_000_000;

  const tx = new TokenCreateTransaction()
    .setTokenName(params.name)
    .setTokenSymbol(params.symbol)
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(decimals)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID)
    .setAdminKey(adminKey.publicKey)
    .setSupplyKey(adminKey.publicKey)
    .setSupplyType(params.maxSupply ? TokenSupplyType.Finite : TokenSupplyType.Infinite)
    .setFreezeDefault(false);

  if (params.memo)      tx.setTokenMemo(params.memo);
  if (params.maxSupply) tx.setMaxSupply(params.maxSupply);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const tokenId  = receipt.tokenId!.toString();
  const txId     = response.transactionId.toString();

  return {
    tokenId,
    txId,
    status: receipt.status.toString(),
    explorerUrl: `https://hashscan.io/${config.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}/token/${tokenId}`,
  };
}

export async function createNftCollection(params: {
  name: string;
  symbol: string;
  memo?: string;
  maxSupply?: number;
}): Promise<{ tokenId: string; txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY must be configured');
  }
  const client   = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const adminKey = PrivateKey.fromString(config.HEDERA_OPERATOR_PRIVATE_KEY);

  const tx = new TokenCreateTransaction()
    .setTokenName(params.name)
    .setTokenSymbol(params.symbol)
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(config.HEDERA_OPERATOR_ACCOUNT_ID)
    .setAdminKey(adminKey.publicKey)
    .setSupplyKey(adminKey.publicKey)
    .setSupplyType(params.maxSupply ? TokenSupplyType.Finite : TokenSupplyType.Infinite)
    .setFreezeDefault(false);

  if (params.memo)      tx.setTokenMemo(params.memo);
  if (params.maxSupply) tx.setMaxSupply(params.maxSupply);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const tokenId  = receipt.tokenId!.toString();
  const txId     = response.transactionId.toString();

  return {
    tokenId,
    txId,
    status: receipt.status.toString(),
    explorerUrl: `https://hashscan.io/${config.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}/token/${tokenId}`,
  };
}

export async function mintNft(params: {
  tokenId: string;
  metadata: string;
}): Promise<{ txId: string; status: string; serialNumbers: number[]; explorerUrl: string }> {
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const metadataBytes = Buffer.from(params.metadata, 'utf-8');

  const tx = new TokenMintTransaction()
    .setTokenId(TokenId.fromString(params.tokenId))
    .addMetadata(metadataBytes);

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();
  const serials  = receipt.serials?.map(s => Number(s)) ?? [];

  return {
    txId,
    status: receipt.status.toString(),
    serialNumbers: serials,
    explorerUrl: explorerUrl(txId),
  };
}

export async function transferNft(params: {
  tokenId: string;
  serialNumber: number;
  toAccountId: string;
}): Promise<{ txId: string; status: string; explorerUrl: string }> {
  if (!config.HEDERA_OPERATOR_ACCOUNT_ID) {
    throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
  }
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available');

  const tx = new TransferTransaction()
    .addNftTransfer(
      new NftId(TokenId.fromString(params.tokenId), params.serialNumber),
      AccountId.fromString(config.HEDERA_OPERATOR_ACCOUNT_ID),
      AccountId.fromString(params.toAccountId)
    );

  const response = await tx.execute(client);
  const receipt  = await response.getReceipt(client);
  const txId     = response.transactionId.toString();

  return { txId, status: receipt.status.toString(), explorerUrl: explorerUrl(txId) };
}

export async function createHederaAccount(params: {
  initialHbar?: number;
  memo?: string;
}): Promise<{
  accountId: string;
  privateKey: string;
  publicKey: string;
  txId: string;
  status: string;
  explorerUrl: string;
}> {
  const client = getHederaClient();
  if (!client) throw new Error('Hedera client not available — check operator credentials');

  const newKey = PrivateKey.generateED25519();

  const tx = new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(params.initialHbar ?? 1));

  if (params.memo) tx.setAccountMemo(params.memo);

  const response  = await tx.execute(client);
  const receipt   = await response.getReceipt(client);
  const accountId = receipt.accountId!.toString();
  const txId      = response.transactionId.toString();

  return {
    accountId,
    privateKey: newKey.toString(),
    publicKey:  newKey.publicKey.toString(),
    txId,
    status: receipt.status.toString(),
    explorerUrl: explorerUrl(txId),
  };
}
