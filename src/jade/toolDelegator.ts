/**
 * Jade Tool Delegation System
 * 
 * Advanced tool delegation for Hedera operations with intelligent routing,
 * parallel execution, and result aggregation.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '../monitoring/logger.js';
import { executeTool } from '../agent/executor.js';
import { jadeOrchestrator } from './orchestrator.js';
import { jadeMessaging } from './messaging.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ToolBatchRequest {
  id: string;
  tools: Array<{
    name: string;
    args: Record<string, unknown>;
    dependsOn?: string[];
    parallel?: boolean;
  }>;
  options?: {
    timeoutMs?: number;
    continueOnError?: boolean;
    aggregateResults?: boolean;
  };
}

export interface ToolBatchResult {
  id: string;
  status: 'completed' | 'partial' | 'failed';
  results: Array<{
    tool: string;
    success: boolean;
    result: unknown;
    durationMs: number;
    error?: string;
  }>;
  aggregate?: Record<string, unknown>;
  totalDurationMs: number;
}

export interface HederaCapability {
  category: 'hts' | 'hcs' | 'account' | 'evm' | 'query' | 'swap';
  actions: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  requiresConfirmation: boolean;
  estimatedGas?: number;
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

export const HEDERA_CAPABILITIES: Record<string, HederaCapability> = {
  // HTS Tokens
  'hts_create_token': { category: 'hts', actions: ['create'], complexity: 'moderate', requiresConfirmation: true },
  'hts_mint_token': { category: 'hts', actions: ['mint'], complexity: 'simple', requiresConfirmation: true },
  'hts_airdrop': { category: 'hts', actions: ['transfer', 'batch'], complexity: 'complex', requiresConfirmation: true },
  'hts_create_nft': { category: 'hts', actions: ['create', 'nft'], complexity: 'moderate', requiresConfirmation: true },
  'hts_dissociate_token': { category: 'hts', actions: ['dissociate'], complexity: 'simple', requiresConfirmation: true },
  'hts_update_token': { category: 'hts', actions: ['update'], complexity: 'moderate', requiresConfirmation: true },
  'hts_mint_nft': { category: 'hts', actions: ['mint', 'nft'], complexity: 'simple', requiresConfirmation: true },
  'hts_transfer_nft': { category: 'hts', actions: ['transfer', 'nft'], complexity: 'simple', requiresConfirmation: true },
  
  // HCS Consensus
  'hcs_create_topic': { category: 'hcs', actions: ['create', 'topic'], complexity: 'simple', requiresConfirmation: false },
  'hcs_submit_message': { category: 'hcs', actions: ['submit'], complexity: 'simple', requiresConfirmation: false },
  'hcs_update_topic': { category: 'hcs', actions: ['update'], complexity: 'moderate', requiresConfirmation: true },
  'hcs_delete_topic': { category: 'hcs', actions: ['delete'], complexity: 'moderate', requiresConfirmation: true },
  
  // Account Management
  'hbar_transfer': { category: 'account', actions: ['transfer'], complexity: 'simple', requiresConfirmation: true },
  'kit_create_account': { category: 'account', actions: ['create'], complexity: 'moderate', requiresConfirmation: true },
  'kit_update_account': { category: 'account', actions: ['update'], complexity: 'moderate', requiresConfirmation: true },
  'kit_delete_account': { category: 'account', actions: ['delete'], complexity: 'complex', requiresConfirmation: true },
  
  // EVM Contracts
  'evm_create_erc20': { category: 'evm', actions: ['create', 'deploy'], complexity: 'complex', requiresConfirmation: true },
  'evm_create_erc721': { category: 'evm', actions: ['create', 'deploy', 'nft'], complexity: 'complex', requiresConfirmation: true },
  'evm_transfer_erc20': { category: 'evm', actions: ['transfer'], complexity: 'simple', requiresConfirmation: true },
  'evm_mint_erc721': { category: 'evm', actions: ['mint', 'nft'], complexity: 'moderate', requiresConfirmation: true },
  'evm_transfer_erc721': { category: 'evm', actions: ['transfer', 'nft'], complexity: 'moderate', requiresConfirmation: true },
  
  // Queries (Read-only)
  'kit_get_account': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_token_info': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_token_balances': { category: 'query', actions: ['query', 'batch'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_pending_airdrops': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_topic_info': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_contract_info': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_transaction_record': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_exchange_rate': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'kit_get_hcs_messages': { category: 'query', actions: ['query'], complexity: 'simple', requiresConfirmation: false },
  'saucerswap_get_token_price': { category: 'query', actions: ['query', 'price'], complexity: 'simple', requiresConfirmation: false },
  'saucerswap_get_pools': { category: 'query', actions: ['query', 'pools'], complexity: 'simple', requiresConfirmation: false },
  'get_price_chart': { category: 'query', actions: ['query', 'chart'], complexity: 'simple', requiresConfirmation: false },
  
  // SaucerSwap (DeFi)
  'saucerswap_swap_hbar_for_token': { category: 'swap', actions: ['swap'], complexity: 'moderate', requiresConfirmation: true },
  'saucerswap_swap_token_for_hbar': { category: 'swap', actions: ['swap'], complexity: 'moderate', requiresConfirmation: true },
  'saucerswap_add_liquidity': { category: 'swap', actions: ['liquidity', 'add'], complexity: 'complex', requiresConfirmation: true },
  'saucerswap_remove_liquidity': { category: 'swap', actions: ['liquidity', 'remove'], complexity: 'complex', requiresConfirmation: true },
};

// ─── Tool Delegator ─────────────────────────────────────────────────────────

export class JadeToolDelegator {
  private activeBatches = new Map<string, ToolBatchResult>();
  
  /**
   * Execute a batch of tools with intelligent delegation
   */
  async executeBatch(request: ToolBatchRequest): Promise<ToolBatchResult> {
    const startTime = Date.now();
    const results: ToolBatchResult['results'] = [];
    
    // Separate parallel and sequential tools
    const parallelTools = request.tools.filter(t => t.parallel !== false);
    const sequentialTools = request.tools.filter(t => t.parallel === false);
    
    // Execute parallel tools first
    if (parallelTools.length > 0) {
      const parallelResults = await Promise.all(
        parallelTools.map(tool => this.executeSingleTool(tool.name, tool.args))
      );
      results.push(...parallelResults);
    }
    
    // Execute sequential tools
    for (const tool of sequentialTools) {
      // Check dependencies
      if (tool.dependsOn && tool.dependsOn.length > 0) {
        const depsMet = tool.dependsOn.every(dep => 
          results.some(r => r.tool === dep && r.success)
        );
        if (!depsMet) {
          results.push({
            tool: tool.name,
            success: false,
            result: null,
            durationMs: 0,
            error: 'Dependencies not met',
          });
          continue;
        }
      }
      
      const result = await this.executeSingleTool(tool.name, tool.args);
      results.push(result);
      
      // Stop on error if not continuing
      if (!result.success && !request.options?.continueOnError) {
        break;
      }
    }
    
    const batchResult: ToolBatchResult = {
      id: request.id,
      status: results.every(r => r.success) ? 'completed' : 
              results.some(r => r.success) ? 'partial' : 'failed',
      results,
      totalDurationMs: Date.now() - startTime,
    };
    
    // Aggregate results if requested
    if (request.options?.aggregateResults) {
      batchResult.aggregate = this.aggregateResults(results);
    }
    
    this.activeBatches.set(request.id, batchResult);
    
    // Broadcast completion
    await jadeMessaging.broadcast('jade-tool-delegator', {
      type: 'batch_complete',
      batchId: request.id,
      status: batchResult.status,
      toolCount: results.length,
      successCount: results.filter(r => r.success).length,
    });
    
    return batchResult;
  }
  
  /**
   * Execute a single tool with error handling
   */
  private async executeSingleTool(
    name: string, 
    args: Record<string, unknown>
  ): Promise<ToolBatchResult['results'][0]> {
    const startTime = Date.now();
    
    try {
      // Check if tool needs confirmation
      const capability = HEDERA_CAPABILITIES[name];
      if (capability?.requiresConfirmation) {
        logger.info('JadeToolDelegator', { 
          tool: name, 
          message: 'Executing confirmation-required tool' 
        });
      }
      
      // Execute through orchestrator for circuit breaker protection
      const result = await jadeOrchestrator.executeTool(name, args);
      
      return {
        tool: name,
        success: result.success,
        result: result.result,
        durationMs: Date.now() - startTime,
        error: result.errors[0],
      };
    } catch (error) {
      return {
        tool: name,
        success: false,
        result: null,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Aggregate results from multiple tools
   */
  private aggregateResults(results: ToolBatchResult['results']): Record<string, unknown> {
    const aggregate: Record<string, unknown> = {
      totalTools: results.length,
      successfulTools: results.filter(r => r.success).length,
      failedTools: results.filter(r => !r.success).length,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      averageDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
    };
    
    // Extract key data based on tool types
    const tokenIds: string[] = [];
    const transactionIds: string[] = [];
    const balances: Record<string, number> = {};
    
    for (const result of results) {
      if (result.success && result.result) {
        try {
          const parsed = JSON.parse(result.result as string);
          if (parsed.tokenId) tokenIds.push(parsed.tokenId);
          if (parsed.transactionId) transactionIds.push(parsed.transactionId);
          if (parsed.hbarBalance) balances[result.tool] = parsed.hbarBalance;
        } catch {
          // Not JSON, skip
        }
      }
    }
    
    if (tokenIds.length > 0) aggregate['createdTokenIds'] = tokenIds;
    if (transactionIds.length > 0) aggregate['transactionIds'] = transactionIds;
    if (Object.keys(balances).length > 0) aggregate['balances'] = balances;
    
    return aggregate;
  }
  
  /**
   * Get capabilities for a tool
   */
  getToolCapabilities(toolName: string): HederaCapability | undefined {
    return HEDERA_CAPABILITIES[toolName];
  }
  
  /**
   * Get all tools by category
   */
  getToolsByCategory(category: HederaCapability['category']): string[] {
    return Object.entries(HEDERA_CAPABILITIES)
      .filter(([_, cap]) => cap.category === category)
      .map(([name, _]) => name);
  }
  
  /**
   * Check if batch is complete
   */
  getBatchStatus(batchId: string): ToolBatchResult | undefined {
    return this.activeBatches.get(batchId);
  }
  
  /**
   * Create a workflow for common Hedera operations
   */
  createWorkflow(type: 'token_launch' | 'nft_collection' | 'defi_setup' | 'account_setup'): ToolBatchRequest {
    const id = `workflow-${type}-${Date.now()}`;
    
    switch (type) {
      case 'token_launch':
        return {
          id,
          tools: [
            { name: 'kit_get_account', args: {}, parallel: true },
            { name: 'hts_create_token', args: {}, parallel: false },
            { name: 'hts_mint_token', args: {}, parallel: false, dependsOn: ['hts_create_token'] },
            { name: 'kit_get_token_info', args: {}, parallel: false, dependsOn: ['hts_create_token'] },
          ],
          options: { continueOnError: false, aggregateResults: true },
        };
        
      case 'nft_collection':
        return {
          id,
          tools: [
            { name: 'hts_create_nft', args: {}, parallel: false },
            { name: 'hts_mint_nft', args: {}, parallel: false, dependsOn: ['hts_create_nft'] },
            { name: 'hcs_create_topic', args: { topicMemo: 'NFT collection events' }, parallel: true },
          ],
          options: { continueOnError: true, aggregateResults: true },
        };
        
      case 'defi_setup':
        return {
          id,
          tools: [
            { name: 'hts_create_token', args: {}, parallel: false },
            { name: 'saucerswap_get_pools', args: {}, parallel: true },
            { name: 'hcs_create_topic', args: { topicMemo: 'DeFi events' }, parallel: true },
          ],
          options: { continueOnError: false, aggregateResults: true },
        };
        
      case 'account_setup':
        return {
          id,
          tools: [
            { name: 'kit_create_account', args: {}, parallel: false },
            { name: 'hbar_transfer', args: {}, parallel: false, dependsOn: ['kit_create_account'] },
            { name: 'kit_get_account', args: {}, parallel: false, dependsOn: ['kit_create_account'] },
          ],
          options: { continueOnError: false, aggregateResults: true },
        };
        
      default:
        return { id, tools: [] };
    }
  }
}

// Singleton instance
export const jadeToolDelegator = new JadeToolDelegator();

// ─── Fastify Routes ────────────────────────────────────────────────────────

export async function registerToolDelegationRoutes(app: FastifyInstance) {
  /**
   * POST /jade/tools/batch
   * Execute a batch of tools
   */
  app.post('/jade/tools/batch', async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      tools: z.array(z.object({
        name: z.string(),
        args: z.record(z.any()).default({}),
        dependsOn: z.array(z.string()).optional(),
        parallel: z.boolean().default(true),
      })),
      options: z.object({
        timeoutMs: z.number().optional(),
        continueOnError: z.boolean().default(true),
        aggregateResults: z.boolean().default(true),
      }).optional(),
    });
    
    try {
      const body = schema.parse(req.body);
      const request: ToolBatchRequest = {
        id: `batch-${Date.now()}`,
        tools: body.tools.map(t => ({
          name: t.name,
          args: t.args,
          dependsOn: t.dependsOn,
          parallel: t.parallel
        })),
        options: body.options,
      };
      
      const result = await jadeToolDelegator.executeBatch(request);
      return reply.send(result);
    } catch (error) {
      logger.error('JadeToolDelegator', { error, message: 'Batch execution failed' });
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * POST /jade/tools/workflow/:type
   * Execute a predefined workflow
   */
  app.post('/jade/tools/workflow/:type', async (req: FastifyRequest, reply: FastifyReply) => {
    const { type } = req.params as { type: string };
    const validTypes = ['token_launch', 'nft_collection', 'defi_setup', 'account_setup'];
    
    if (!validTypes.includes(type)) {
      return reply.code(400).send({
        success: false,
        error: `Invalid workflow type. Valid: ${validTypes.join(', ')}`,
      });
    }
    
    try {
      const workflow = jadeToolDelegator.createWorkflow(type as any);
      // Merge with request body args if provided
      const body = req.body as Record<string, any>;
      if (body?.tools) {
        workflow.tools = workflow.tools.map((t, i) => ({
          ...t,
          args: body.tools[i]?.args || t.args,
        }));
      }
      
      const result = await jadeToolDelegator.executeBatch(workflow);
      return reply.send(result);
    } catch (error) {
      logger.error('JadeToolDelegator', { error, message: 'Workflow execution failed' });
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  /**
   * GET /jade/tools/capabilities
   * Get all tool capabilities
   */
  app.get('/jade/tools/capabilities', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      capabilities: HEDERA_CAPABILITIES,
      categories: {
        hts: jadeToolDelegator.getToolsByCategory('hts'),
        hcs: jadeToolDelegator.getToolsByCategory('hcs'),
        account: jadeToolDelegator.getToolsByCategory('account'),
        evm: jadeToolDelegator.getToolsByCategory('evm'),
        query: jadeToolDelegator.getToolsByCategory('query'),
        swap: jadeToolDelegator.getToolsByCategory('swap'),
      },
    });
  });
  
  /**
   * GET /jade/tools/batch/:id
   * Get batch status
   */
  app.get('/jade/tools/batch/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = jadeToolDelegator.getBatchStatus(id);
    
    if (!result) {
      return reply.code(404).send({ success: false, error: 'Batch not found' });
    }
    
    return reply.send({ success: true, result });
  });
  
  logger.info('JadeToolDelegator', { message: 'Tool delegation routes registered' });
}
