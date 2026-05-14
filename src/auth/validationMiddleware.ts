/**
 * Validation Middleware for VeraLattice
 * 
 * Provides request validation using Zod schemas with comprehensive error handling.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { ValidationSchemas } from './validation.js';
import { logger } from '../monitoring/logger.js';
import { enhancedAuth } from './enhanced.js';
import { AuthenticatedRequest } from './middleware.js';

export interface ValidationOptions {
  schema: ZodSchema;
  source?: 'body' | 'query' | 'params';
  stripUnknown?: boolean;
  strict?: boolean;
}

export function createValidationMiddleware(options: ValidationOptions) {
  return async function validationMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const source = options.source || 'body';
    let data: any;

    try {
      // Extract data from the specified source
      switch (source) {
        case 'body':
          data = request.body;
          break;
        case 'query':
          data = request.query;
          break;
        case 'params':
          data = request.params;
          break;
        default:
          data = request.body;
      }

      // Validate the data
      const result = options.schema.parse(data, {
        errorMap: (issue, ctx) => {
          // Custom error messages for better user experience
          if (issue.code === 'invalid_string') {
            if (issue.validation === 'regex') {
              return { message: 'Invalid format' };
            }
            return { message: 'Invalid string' };
          }
          
          if (issue.code === 'too_small') {
            if (issue.type === 'string') {
              return { message: `Field is required and cannot be empty` };
            }
            if (issue.type === 'number') {
              return { message: `Value must be at least ${issue.minimum}` };
            }
            if (issue.type === 'array') {
              return { message: `Array must have at least ${issue.minimum} items` };
            }
          }
          
          if (issue.code === 'too_big') {
            if (issue.type === 'string') {
              return { message: `Value is too long (max ${issue.maximum} characters)` };
            }
            if (issue.type === 'number') {
              return { message: `Value must be at most ${issue.maximum}` };
            }
            if (issue.type === 'array') {
              return { message: `Array must have at most ${issue.maximum} items` };
            }
          }

          return { message: ctx.defaultError };
        }
      });

      // Replace the request data with validated data
      switch (source) {
        case 'body':
          request.body = result;
          break;
        case 'query':
          request.query = result;
          break;
        case 'params':
          request.params = result;
          break;
      }

    } catch (error) {
      if (error instanceof ZodError) {
        // Format validation errors for better response
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        // Log validation failure
        logger.warn('Request validation failed', {
          method: request.method,
          url: request.url,
          ip: request.ip,
          errors: formattedErrors,
          customerId: (request as AuthenticatedRequest).user?.customerId
        });

        // Log audit event for security monitoring
        await enhancedAuth.logAudit({
          customerId: (request as AuthenticatedRequest).user?.customerId,
          apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
          eventType: 'security_event',
          action: 'validation_failed',
          resourceType: 'endpoint',
          resourceId: request.url,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          success: false,
          errorMessage: 'Request validation failed',
          context: {
            method: request.method,
            url: request.url,
            validationErrors: formattedErrors
          }
        });

        // Send validation error response
        reply.code(400).send({
          error: 'Validation failed',
          message: 'Request data is invalid',
          errors: formattedErrors
        });
        return reply.sent;
      }

      // Log unexpected validation errors
      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        method: request.method,
        url: request.url,
        ip: request.ip
      });

      reply.code(500).send({
        error: 'Validation error',
        message: 'An unexpected error occurred during validation'
      });
      return reply.sent;
    }
  };
}

// Predefined validation middleware for common use cases
export const validateHtsCreateToken = createValidationMiddleware({
  schema: ValidationSchemas.HtsCreateToken,
  source: 'body'
});

export const validateHtsCreateNft = createValidationMiddleware({
  schema: ValidationSchemas.HtsCreateNft,
  source: 'body'
});

export const validateHtsTransferToken = createValidationMiddleware({
  schema: ValidationSchemas.HtsTransferToken,
  source: 'body'
});

export const validateHtsAssociateToken = createValidationMiddleware({
  schema: ValidationSchemas.HtsAssociateToken,
  source: 'body'
});

export const validateHcsCreateTopic = createValidationMiddleware({
  schema: ValidationSchemas.HcsCreateTopic,
  source: 'body'
});

export const validateHcsSubmitMessage = createValidationMiddleware({
  schema: ValidationSchemas.HcsSubmitMessage,
  source: 'body'
});

export const validateKitCreateAccount = createValidationMiddleware({
  schema: ValidationSchemas.KitCreateAccount,
  source: 'body'
});

export const validateEvmCreateErc20 = createValidationMiddleware({
  schema: ValidationSchemas.EvmCreateErc20,
  source: 'body'
});

export const validateEvmCreateErc721 = createValidationMiddleware({
  schema: ValidationSchemas.EvmCreateErc721,
  source: 'body'
});

export const validateChatRequest = createValidationMiddleware({
  schema: ValidationSchemas.ChatRequest,
  source: 'body'
});

export const validateApiKeyCreate = createValidationMiddleware({
  schema: ValidationSchemas.ApiKeyCreate,
  source: 'body'
});

export const validateApiKeyUpdate = createValidationMiddleware({
  schema: ValidationSchemas.ApiKeyUpdate,
  source: 'body'
});

export const validateAuditLogFilters = createValidationMiddleware({
  schema: ValidationSchemas.AuditLogFilters,
  source: 'query'
});

export const validatePagination = createValidationMiddleware({
  schema: ValidationSchemas.Pagination,
  source: 'query'
});

// Parameter validation middleware
export const validateAccountIdParam = createValidationMiddleware({
  schema: ValidationSchemas.KitGetAccount,
  source: 'params'
});

export const validateTokenIdParam = createValidationMiddleware({
  schema: ValidationSchemas.KitGetTokenInfo,
  source: 'params'
});

export const validateTopicIdParam = createValidationMiddleware({
  schema: ValidationSchemas.KitGetTopicInfo,
  source: 'params'
});

export const validateContractIdParam = createValidationMiddleware({
  schema: ValidationSchemas.KitGetContractInfo,
  source: 'params'
});

// Query parameter validation
export const validateWebSearch = createValidationMiddleware({
  schema: ValidationSchemas.WebSearch,
  source: 'query'
});

export const validateGetNews = createValidationMiddleware({
  schema: ValidationSchemas.GetNews,
  source: 'query'
});

export const validateWikiSearch = createValidationMiddleware({
  schema: ValidationSchemas.WikiSearch,
  source: 'query'
});

export const validateHackerNewsSearch = createValidationMiddleware({
  schema: ValidationSchemas.HackerNewsSearch,
  source: 'query'
});

// Tool-specific validation middleware factory
export function createToolValidationMiddleware(toolName: string) {
  // Map tool names to their validation schemas
  const toolSchemaMap: Record<string, ZodSchema> = {
    // HTS tools
    'hts_create_token': ValidationSchemas.HtsCreateToken,
    'hts_create_nft': ValidationSchemas.HtsCreateNft,
    'hts_transfer_token': ValidationSchemas.HtsTransferToken,
    'hts_associate_token': ValidationSchemas.HtsAssociateToken,
    'hts_dissociate_token': ValidationSchemas.HtsDissociateToken,
    'hts_mint_token': ValidationSchemas.HtsMintToken,
    'hts_mint_nft': ValidationSchemas.HtsMintNft,
    'hts_transfer_nft': ValidationSchemas.HtsTransferNft,
    'hts_approve_nft_allowance': ValidationSchemas.HtsApproveNftAllowance,
    'hts_delete_nft_allowance': ValidationSchemas.HtsDeleteNftAllowance,
    'hts_update_token': ValidationSchemas.HtsUpdateToken,
    
    // HCS tools
    'hcs_create_topic': ValidationSchemas.HcsCreateTopic,
    'hcs_submit_message': ValidationSchemas.HcsSubmitMessage,
    'hcs_update_topic': ValidationSchemas.HcsUpdateTopic,
    'hcs_delete_topic': ValidationSchemas.HcsDeleteTopic,
    
    // Account tools
    'kit_create_account': ValidationSchemas.KitCreateAccount,
    'kit_update_account': ValidationSchemas.KitUpdateAccount,
    'kit_delete_account': ValidationSchemas.KitDeleteAccount,
    'kit_approve_hbar_allowance': ValidationSchemas.KitApproveHbarAllowance,
    'kit_delete_hbar_allowance': ValidationSchemas.KitDeleteHbarAllowance,
    'kit_approve_token_allowance': ValidationSchemas.KitApproveTokenAllowance,
    'kit_delete_token_allowance': ValidationSchemas.KitDeleteTokenAllowance,
    
    // EVM tools
    'evm_create_erc20': ValidationSchemas.EvmCreateErc20,
    'evm_create_erc721': ValidationSchemas.EvmCreateErc721,
    'evm_transfer_erc20': ValidationSchemas.EvmTransferErc20,
    'evm_mint_erc721': ValidationSchemas.EvmMintErc721,
    'evm_transfer_erc721': ValidationSchemas.EvmTransferErc721,
    
    // Query tools
    'kit_get_token_balances': ValidationSchemas.KitGetTokenBalances,
    'kit_get_account': ValidationSchemas.KitGetAccount,
    'kit_get_token_info': ValidationSchemas.KitGetTokenInfo,
    'kit_get_topic_info': ValidationSchemas.KitGetTopicInfo,
    'kit_get_contract_info': ValidationSchemas.KitGetContractInfo,
    'kit_get_transaction_record': ValidationSchemas.KitGetTransactionRecord,
    'kit_get_exchange_rate': ValidationSchemas.KitGetExchangeRate,
    'kit_get_pending_airdrops': ValidationSchemas.KitGetPendingAirdrops,
    
    // SaucerSwap tools
    'saucerswap_get_token_price': ValidationSchemas.SaucerSwapGetTokenPrice,
    'saucerswap_get_pools': ValidationSchemas.SaucerSwapGetPools,
    'saucerswap_swap_hbar_for_token': ValidationSchemas.SaucerSwapSwapHbarForToken,
    'saucerswap_swap_token_for_hbar': ValidationSchemas.SaucerSwapSwapTokenForHbar,
    
    // Smart contract tools
    'vera_compile_contract': ValidationSchemas.VeraCompileContract,
    'vera_deploy_contract': ValidationSchemas.VeraDeployContract,
    'vera_call_contract': ValidationSchemas.VeraCallContract,
    
    // Web tools
    'web_search': ValidationSchemas.WebSearch,
    'get_news': ValidationSchemas.GetNews,
    'wiki_search': ValidationSchemas.WikiSearch,
    'hackernews_search': ValidationSchemas.HackerNewsSearch,
    
    // Memory tools
    'vera_memory_save': ValidationSchemas.VeraMemorySave,
    'vera_memory_recall': ValidationSchemas.VeraMemoryRecall
  };

  const schema = toolSchemaMap[toolName];
  if (!schema) {
    // Return a no-op middleware if no schema is found
    return (request: FastifyRequest, reply: FastifyReply, done: () => void) => done();
  }

  return createValidationMiddleware({
    schema,
    source: 'body'
  });
}

// Sanitization middleware for additional security
export function createSanitizationMiddleware() {
  return function sanitizationMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    // Sanitize request body to prevent injection attacks
    if (request.body && typeof request.body === 'object') {
      sanitizeObject(request.body);
    }

    // Sanitize query parameters
    if (request.query && typeof request.query === 'object') {
      sanitizeObject(request.query);
    }

    // Sanitize path parameters
    if (request.params && typeof request.params === 'object') {
      sanitizeObject(request.params);
    }

    done();
  };
}

function sanitizeObject(obj: any): void {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  // Remove potentially dangerous properties
  const dangerousProps = ['__proto__', 'constructor', 'prototype'];
  for (const prop of dangerousProps) {
    if (prop in obj) {
      delete obj[prop];
    }
  }

  // Recursively sanitize nested objects
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        // Basic XSS prevention for string values
        obj[key] = value
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      } else if (typeof value === 'object' && value !== null) {
        sanitizeObject(value);
      }
    }
  }
}

// Rate limiting validation middleware
export function createRateLimitValidationMiddleware() {
  return function rateLimitValidationMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    const rateLimitHeader = request.headers['x-rate-limit-remaining'];
    const rateLimit = (request as AuthenticatedRequest).rateLimit;

    // Check if rate limit is exceeded
    if (rateLimit && rateLimit.remaining <= 0) {
      logger.warn('Rate limit exceeded', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        customerId: (request as AuthenticatedRequest).user?.customerId,
        resetTime: rateLimit.resetTime
      });

      reply.code(429).send({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        resetTime: rateLimit.resetTime
      });
      return reply.sent;
    }

    done();
  };
}
