/**
 * Input Validation Schemas for VeraLattice
 * 
 * Provides comprehensive validation for all API inputs using Zod schemas.
 */

import { z } from 'zod';

// Common validation patterns
const AccountIdSchema = z.string().regex(/^0\.0\.\d+$/, 'Invalid Hedera account ID format (expected 0.0.XXXXX)');
const TokenIdSchema = z.string().regex(/^0\.0\.\d+$/, 'Invalid Hedera token ID format (expected 0.0.XXXXX)');
const TopicIdSchema = z.string().regex(/^0\.0\.\d+$/, 'Invalid Hedera topic ID format (expected 0.0.XXXXX)');
const ContractIdSchema = z.string().regex(/^(0\.0\.\d+|0x[a-fA-F0-9]{40})$/, 'Invalid contract ID format (expected 0.0.XXXXX or 0x...)');
const TransactionIdSchema = z.string().regex(/^0\.0\.\d+@\d+\.\d+$/, 'Invalid transaction ID format (expected 0.0.XXXXX@YYYY.ZZZZZ)');
const EvmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address format (expected 0x...)');
const PrivateKeySchema = z.string().min(1, 'Private key is required');
const AmountSchema = z.number().nonnegative('Amount must be non-negative');
const PositiveAmountSchema = z.number().positive('Amount must be positive');
const PercentageSchema = z.number().min(0).max(100, 'Percentage must be between 0 and 100');

// Token validation schemas
const TokenNameSchema = z.string().min(1, 'Token name is required').max(100, 'Token name too long (max 100 characters)');
const TokenSymbolSchema = z.string().min(1, 'Token symbol is required').max(10, 'Token symbol too long (max 10 characters)');
const DecimalsSchema = z.number().int().min(0).max(18, 'Decimals must be between 0 and 18');
const SupplySchema = z.number().int().nonnegative('Supply must be non-negative');

// Message validation schemas
const MessageSchema = z.string().min(1, 'Message is required').max(1024, 'Message too long (max 1024 characters)');
const MemoSchema = z.string().max(100, 'Memo too long (max 100 characters)').optional();

// Pagination schemas
const LimitSchema = z.number().int().min(1).max(100, 'Limit must be between 1 and 100');
const OffsetSchema = z.number().int().min(0, 'Offset must be non-negative');

// HTS (Hedera Token Service) schemas
export const HtsCreateTokenSchema = z.object({
  tokenName: TokenNameSchema,
  tokenSymbol: TokenSymbolSchema,
  initialSupply: SupplySchema.optional(),
  decimals: DecimalsSchema.default(8),
  treasuryAccountId: AccountIdSchema.optional(),
  adminKey: PrivateKeySchema.optional(),
  supplyKey: PrivateKeySchema.optional(),
  wipeKey: PrivateKeySchema.optional(),
  freezeKey: PrivateKeySchema.optional(),
  pauseKey: PrivateKeySchema.optional(),
  kycKey: PrivateKeySchema.optional(),
  feeScheduleKey: PrivateKeySchema.optional(),
  metadata: z.string().max(100, 'Metadata too long (max 100 characters)').optional(),
  autoRenewAccount: AccountIdSchema.optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional()
});

export const HtsCreateNftSchema = z.object({
  tokenName: TokenNameSchema,
  tokenSymbol: TokenSymbolSchema,
  treasuryAccountId: AccountIdSchema,
  adminKey: PrivateKeySchema.optional(),
  supplyKey: PrivateKeySchema.optional(),
  wipeKey: PrivateKeySchema.optional(),
  freezeKey: PrivateKeySchema.optional(),
  pauseKey: PrivateKeySchema.optional(),
  kycKey: PrivateKeySchema.optional(),
  feeScheduleKey: PrivateKeySchema.optional(),
  metadata: z.string().max(100, 'Metadata too long (max 100 characters)').optional(),
  autoRenewAccount: AccountIdSchema.optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional(),
  maxSupply: SupplySchema.optional(),
  content: z.string().max(100, 'Content too long (max 100 characters)').optional()
});

export const HtsTransferTokenSchema = z.object({
  tokenId: TokenIdSchema,
  fromAccountId: AccountIdSchema,
  toAccountId: AccountIdSchema,
  amount: PositiveAmountSchema
});

export const HtsAssociateTokenSchema = z.object({
  accountId: AccountIdSchema,
  tokenId: TokenIdSchema
});

export const HtsDissociateTokenSchema = z.object({
  accountId: AccountIdSchema,
  tokenId: TokenIdSchema
});

export const HtsMintTokenSchema = z.object({
  tokenId: TokenIdSchema,
  amount: PositiveAmountSchema
});

export const HtsMintNftSchema = z.object({
  tokenId: TokenIdSchema,
  metadata: z.string().max(100, 'Metadata too long (max 100 characters)')
});

export const HtsTransferNftSchema = z.object({
  tokenId: TokenIdSchema,
  fromAccountId: AccountIdSchema,
  toAccountId: AccountIdSchema,
  serialNumber: z.number().int().positive('Serial number must be positive')
});

export const HtsApproveNftAllowanceSchema = z.object({
  tokenId: TokenIdSchema,
  ownerAccountId: AccountIdSchema,
  spenderAccountId: AccountIdSchema,
  serialNumbers: z.array(z.number().int().positive('Serial number must be positive')).min(1, 'At least one serial number required')
});

export const HtsDeleteNftAllowanceSchema = z.object({
  tokenId: TokenIdSchema,
  ownerAccountId: AccountIdSchema,
  spenderAccountId: AccountIdSchema,
  serialNumbers: z.array(z.number().int().positive('Serial number must be positive')).optional()
});

export const HtsUpdateTokenSchema = z.object({
  tokenId: TokenIdSchema,
  name: TokenNameSchema.optional(),
  symbol: TokenSymbolSchema.optional(),
  treasuryAccountId: AccountIdSchema.optional(),
  adminKey: PrivateKeySchema.optional(),
  supplyKey: PrivateKeySchema.optional(),
  wipeKey: PrivateKeySchema.optional(),
  freezeKey: PrivateKeySchema.optional(),
  pauseKey: PrivateKeySchema.optional(),
  kycKey: PrivateKeySchema.optional(),
  feeScheduleKey: PrivateKeySchema.optional(),
  autoRenewAccount: AccountIdSchema.optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional()
});

// HCS (Hedera Consensus Service) schemas
export const HcsCreateTopicSchema = z.object({
  topicMemo: MemoSchema,
  adminKey: PrivateKeySchema.optional(),
  submitKey: PrivateKeySchema.optional(),
  feeScheduleKey: PrivateKeySchema.optional(),
  autoRenewAccount: AccountIdSchema.optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional()
});

export const HcsSubmitMessageSchema = z.object({
  topicId: TopicIdSchema,
  message: MessageSchema
});

export const HcsUpdateTopicSchema = z.object({
  topicId: TopicIdSchema,
  topicMemo: MemoSchema.optional(),
  adminKey: PrivateKeySchema.optional(),
  submitKey: PrivateKeySchema.optional(),
  feeScheduleKey: PrivateKeySchema.optional(),
  autoRenewAccount: AccountIdSchema.optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional()
});

export const HcsDeleteTopicSchema = z.object({
  topicId: TopicIdSchema
});

// Account management schemas
export const KitCreateAccountSchema = z.object({
  initialBalance: AmountSchema.optional(),
  receiverSignatureRequired: z.boolean().optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional(),
  key: PrivateKeySchema.optional(),
  maxAutomaticTokenAssociations: z.number().int().min(0, 'Max automatic token associations must be non-negative').optional(),
  accountMemo: MemoSchema.optional(),
  stakedAccountId: AccountIdSchema.optional(),
  stakedNodeId: z.number().int().positive('Node ID must be positive').optional(),
  declineStakingReward: z.boolean().optional()
});

export const KitUpdateAccountSchema = z.object({
  accountId: AccountIdSchema,
  receiverSignatureRequired: z.boolean().optional(),
  autoRenewPeriod: z.number().int().positive('Auto renew period must be positive').optional(),
  key: PrivateKeySchema.optional(),
  maxAutomaticTokenAssociations: z.number().int().min(0, 'Max automatic token associations must be non-negative').optional(),
  accountMemo: MemoSchema.optional(),
  stakedAccountId: AccountIdSchema.optional(),
  stakedNodeId: z.number().int().positive('Node ID must be positive').optional(),
  declineStakingReward: z.boolean().optional()
});

export const KitDeleteAccountSchema = z.object({
  accountId: AccountIdSchema,
  transferAccountId: AccountIdSchema
});

export const KitApproveHbarAllowanceSchema = z.object({
  ownerAccountId: AccountIdSchema,
  spenderAccountId: AccountIdSchema,
  amount: PositiveAmountSchema
});

export const KitDeleteHbarAllowanceSchema = z.object({
  ownerAccountId: AccountIdSchema,
  spenderAccountId: AccountIdSchema
});

export const KitApproveTokenAllowanceSchema = z.object({
  ownerAccountId: AccountIdSchema,
  spenderAccountId: AccountIdSchema,
  tokenId: TokenIdSchema,
  amount: PositiveAmountSchema
});

export const KitDeleteTokenAllowanceSchema = z.object({
  ownerAccountId: AccountIdSchema,
  spenderAccountId: AccountIdSchema,
  tokenId: TokenIdSchema
});

// EVM schemas
export const EvmCreateErc20Schema = z.object({
  tokenName: TokenNameSchema,
  tokenSymbol: TokenSymbolSchema,
  initialSupply: SupplySchema.optional(),
  decimals: DecimalsSchema.default(18)
});

export const EvmCreateErc721Schema = z.object({
  tokenName: TokenNameSchema,
  tokenSymbol: TokenSymbolSchema,
  baseUri: z.string().url('Invalid base URI format').optional()
});

export const EvmTransferErc20Schema = z.object({
  contractAddress: EvmAddressSchema,
  toAddress: EvmAddressSchema,
  amount: PositiveAmountSchema
});

export const EvmMintErc721Schema = z.object({
  contractAddress: EvmAddressSchema,
  toAddress: EvmAddressSchema,
  tokenId: z.string().min(1, 'Token ID is required'),
  uri: z.string().url('Invalid URI format').optional()
});

export const EvmTransferErc721Schema = z.object({
  contractAddress: EvmAddressSchema,
  fromAddress: EvmAddressSchema,
  toAddress: EvmAddressSchema,
  tokenId: z.string().min(1, 'Token ID is required')
});

// Query schemas
export const KitGetTokenBalancesSchema = z.object({
  accountId: AccountIdSchema
});

export const KitGetAccountSchema = z.object({
  accountId: AccountIdSchema
});

export const KitGetTokenInfoSchema = z.object({
  tokenId: TokenIdSchema
});

export const KitGetTopicInfoSchema = z.object({
  topicId: TopicIdSchema
});

export const KitGetContractInfoSchema = z.object({
  contractId: ContractIdSchema
});

export const KitGetTransactionRecordSchema = z.object({
  transactionId: TransactionIdSchema
});

export const KitGetExchangeRateSchema = z.object({});

export const KitGetPendingAirdropsSchema = z.object({
  accountId: AccountIdSchema
});

// SaucerSwap schemas
export const SaucerSwapGetTokenPriceSchema = z.object({
  tokenId: TokenIdSchema
});

export const SaucerSwapGetPoolsSchema = z.object({
  limit: LimitSchema.optional().default(20),
  offset: OffsetSchema.optional().default(0)
});

export const SaucerSwapSwapHbarForTokenSchema = z.object({
  hbarAmount: PositiveAmountSchema,
  tokenId: TokenIdSchema,
  slippagePercent: PercentageSchema.optional().default(1)
});

export const SaucerSwapSwapTokenForHbarSchema = z.object({
  tokenId: TokenIdSchema,
  tokenAmount: PositiveAmountSchema,
  slippagePercent: PercentageSchema.optional().default(1)
});

// Smart contract schemas
export const VeraCompileContractSchema = z.object({
  sourceCode: z.string().min(1, 'Source code is required'),
  contractName: z.string().min(1, 'Contract name is required').max(100, 'Contract name too long'),
  optimizer: z.boolean().optional().default(true),
  runs: z.number().int().positive('Runs must be positive').optional().default(200)
});

export const VeraDeployContractSchema = z.object({
  bytecode: z.string().min(1, 'Bytecode is required'),
  abi: z.array(z.any()).optional(),
  gasLimit: z.number().int().positive('Gas limit must be positive').optional(),
  constructorArgs: z.array(z.any()).optional()
});

export const VeraCallContractSchema = z.object({
  contractId: ContractIdSchema,
  abi: z.array(z.any()),
  functionName: z.string().min(1, 'Function name is required'),
  args: z.array(z.any()).optional().default([]),
  gasLimit: z.number().int().positive('Gas limit must be positive').optional(),
  value: AmountSchema.optional().default(0)
});

// Web search schemas
export const WebSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200, 'Search query too long'),
  limit: z.number().int().min(1).max(20, 'Limit must be between 1 and 20').optional().default(10)
});

export const GetNewsSchema = z.object({
  query: z.string().max(100, 'Query too long (max 100 characters)').optional(),
  limit: z.number().int().min(1).max(20, 'Limit must be between 1 and 20').optional().default(10)
});

export const WikiSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200, 'Search query too long'),
  limit: z.number().int().min(1).max(10, 'Limit must be between 1 and 10').optional().default(5)
});

export const HackerNewsSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200, 'Search query too long'),
  limit: z.number().int().min(1).max(20, 'Limit must be between 1 and 20').optional().default(8)
});

// Memory schemas
export const VeraMemorySaveSchema = z.object({
  key: z.string().min(1, 'Memory key is required').max(100, 'Memory key too long'),
  value: z.string().min(1, 'Memory value is required').max(1000, 'Memory value too long'),
  category: z.string().max(50, 'Category too long').optional()
});

export const VeraMemoryRecallSchema = z.object({
  key: z.string().min(1, 'Memory key is required').max(100, 'Memory key too long'),
  category: z.string().max(50, 'Category too long').optional()
});

// API key management schemas
export const ApiKeyCreateSchema = z.object({
  name: z.string().max(100, 'Name too long (max 100 characters)').optional(),
  permissions: z.object({
    read: z.boolean().default(true),
    write: z.boolean().default(false),
    admin: z.boolean().default(false),
    tools: z.array(z.string()).default([])
  }).optional(),
  rateLimitPerMinute: z.number().int().positive('Rate limit must be positive').optional(),
  rateLimitPerHour: z.number().int().positive('Rate limit must be positive').optional(),
  rateLimitPerDay: z.number().int().positive('Rate limit must be positive').optional(),
  usageQuotaDaily: z.number().int().positive('Daily quota must be positive').optional(),
  expiresAt: z.string().datetime('Invalid expiration date format').optional()
});

export const ApiKeyUpdateSchema = z.object({
  name: z.string().max(100, 'Name too long (max 100 characters)').optional(),
  permissions: z.object({
    read: z.boolean(),
    write: z.boolean(),
    admin: z.boolean(),
    tools: z.array(z.string())
  }).optional(),
  rateLimitPerMinute: z.number().int().positive('Rate limit must be positive').optional(),
  rateLimitPerHour: z.number().int().positive('Rate limit must be positive').optional(),
  rateLimitPerDay: z.number().int().positive('Rate limit must be positive').optional(),
  usageQuotaDaily: z.number().int().positive('Daily quota must be positive').optional(),
  expiresAt: z.string().datetime('Invalid expiration date format').optional()
});

// Pagination and filtering schemas
export const PaginationSchema = z.object({
  limit: LimitSchema.optional().default(20),
  offset: OffsetSchema.optional().default(0)
});

export const DateRangeSchema = z.object({
  startDate: z.string().datetime('Invalid start date format').optional(),
  endDate: z.string().datetime('Invalid end date format').optional()
});

export const AuditLogFiltersSchema = PaginationSchema.merge(DateRangeSchema).extend({
  customerId: z.string().optional(),
  apiKeyId: z.string().optional(),
  eventType: z.enum(['auth', 'api_call', 'admin_action', 'security_event']).optional()
});

// Chat API schemas
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content is required')
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1, 'At least one message is required'),
  enableTools: z.boolean().optional().default(false),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2, 'Temperature must be between 0 and 2').optional(),
  maxTokens: z.number().int().positive('Max tokens must be positive').optional()
});

// Export all schemas for easy importing
export const ValidationSchemas = {
  // HTS
  HtsCreateToken: HtsCreateTokenSchema,
  HtsCreateNft: HtsCreateNftSchema,
  HtsTransferToken: HtsTransferTokenSchema,
  HtsAssociateToken: HtsAssociateTokenSchema,
  HtsDissociateToken: HtsDissociateTokenSchema,
  HtsMintToken: HtsMintTokenSchema,
  HtsMintNft: HtsMintNftSchema,
  HtsTransferNft: HtsTransferNftSchema,
  HtsApproveNftAllowance: HtsApproveNftAllowanceSchema,
  HtsDeleteNftAllowance: HtsDeleteNftAllowanceSchema,
  HtsUpdateToken: HtsUpdateTokenSchema,
  
  // HCS
  HcsCreateTopic: HcsCreateTopicSchema,
  HcsSubmitMessage: HcsSubmitMessageSchema,
  HcsUpdateTopic: HcsUpdateTopicSchema,
  HcsDeleteTopic: HcsDeleteTopicSchema,
  
  // Account
  KitCreateAccount: KitCreateAccountSchema,
  KitUpdateAccount: KitUpdateAccountSchema,
  KitDeleteAccount: KitDeleteAccountSchema,
  KitApproveHbarAllowance: KitApproveHbarAllowanceSchema,
  KitDeleteHbarAllowance: KitDeleteHbarAllowanceSchema,
  KitApproveTokenAllowance: KitApproveTokenAllowanceSchema,
  KitDeleteTokenAllowance: KitDeleteTokenAllowanceSchema,
  
  // EVM
  EvmCreateErc20: EvmCreateErc20Schema,
  EvmCreateErc721: EvmCreateErc721Schema,
  EvmTransferErc20: EvmTransferErc20Schema,
  EvmMintErc721: EvmMintErc721Schema,
  EvmTransferErc721: EvmTransferErc721Schema,
  
  // Queries
  KitGetTokenBalances: KitGetTokenBalancesSchema,
  KitGetAccount: KitGetAccountSchema,
  KitGetTokenInfo: KitGetTokenInfoSchema,
  KitGetTopicInfo: KitGetTopicInfoSchema,
  KitGetContractInfo: KitGetContractInfoSchema,
  KitGetTransactionRecord: KitGetTransactionRecordSchema,
  KitGetExchangeRate: KitGetExchangeRateSchema,
  KitGetPendingAirdrops: KitGetPendingAirdropsSchema,
  
  // SaucerSwap
  SaucerSwapGetTokenPrice: SaucerSwapGetTokenPriceSchema,
  SaucerSwapGetPools: SaucerSwapGetPoolsSchema,
  SaucerSwapSwapHbarForToken: SaucerSwapSwapHbarForTokenSchema,
  SaucerSwapSwapTokenForHbar: SaucerSwapSwapTokenForHbarSchema,
  
  // Smart Contracts
  VeraCompileContract: VeraCompileContractSchema,
  VeraDeployContract: VeraDeployContractSchema,
  VeraCallContract: VeraCallContractSchema,
  
  // Web Tools
  WebSearch: WebSearchSchema,
  GetNews: GetNewsSchema,
  WikiSearch: WikiSearchSchema,
  HackerNewsSearch: HackerNewsSearchSchema,
  
  // Memory
  VeraMemorySave: VeraMemorySaveSchema,
  VeraMemoryRecall: VeraMemoryRecallSchema,
  
  // API Management
  ApiKeyCreate: ApiKeyCreateSchema,
  ApiKeyUpdate: ApiKeyUpdateSchema,
  
  // Common
  Pagination: PaginationSchema,
  DateRange: DateRangeSchema,
  AuditLogFilters: AuditLogFiltersSchema,
  
  // Chat
  ChatRequest: ChatRequestSchema
};
