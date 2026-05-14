/**
 * VeraLattice Tools Integration
 * 
 * Main integration module that connects all tools with the intelligent router,
 * registry, and API. Provides a unified interface for tool execution.
 */

import { Client } from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';
import {
  ToolRegistry,
  IntelligentToolRouter,
  ToolFallbacks,
  initializeAllTools,
  getToolRegistry,
  type ToolResult,
} from './index.js';

export interface ToolExecutorConfig {
  hederaClient: Client;
  enableFallbacks?: boolean;
}

export class VeraLatticeToolExecutor {
  private registry = getToolRegistry();
  private router: IntelligentToolRouter;
  private fallbacks?: ToolFallbacks;
  private client: Client;
  private initialized: boolean = false;
  private toolMap = new Map<string, (args: any) => Promise<any>>();

  constructor(config: ToolExecutorConfig) {
    this.client = config.hederaClient;
    
    // Initialize router with executor function
    this.router = new IntelligentToolRouter(async (tool, args) => {
      return await this.executeToolDirectly(tool, args);
    });

    // Initialize fallbacks if enabled
    if (config.enableFallbacks ?? true) {
      this.fallbacks = new ToolFallbacks(async (tool, args) => {
        return await this.executeToolDirectly(tool, args);
      });
    }
  }

  /**
   * Initialize the tool executor - registers all tools
   */
  initialize(): void {
    if (this.initialized) {
      logger.warn('ToolExecutor', { message: 'Already initialized' });
      return;
    }

    // Register all tools with the registry
    initializeAllTools();

    // Register tool handlers
    this.registerToolHandlers();

    this.initialized = true;
    logger.info('ToolExecutor', { 
      message: 'Tool executor initialized',
      tools: this.registry.getAll().length,
    });
  }

  /**
   * Execute a tool by name with intelligent routing
   */
  async execute(
    toolName: string,
    args: any,
    context?: { userId?: string; priority?: 'P0' | 'P1' | 'P2' | 'P3' }
  ): Promise<ToolResult> {
    if (!this.initialized) {
      throw new Error('ToolExecutor not initialized. Call initialize() first.');
    }

    const toolContext = {
      userId: context?.userId || 'anonymous',
      sessionId: `session_${Date.now()}`,
      timestamp: Date.now(),
      priority: context?.priority || 'P2',
    };

    // Try fallback chain if available
    if (this.fallbacks) {
      const fallbackResult = await this.fallbacks.executeWithFallback(toolName, args);
      if (fallbackResult.success) {
        return fallbackResult;
      }
    }

    // Otherwise use the intelligent router
    return await this.router.execute(toolName, args, toolContext);
  }

  /**
   * Register tool handlers - placeholder implementation
   */
  private registerToolHandlers(): void {
    // Tool handlers are registered via the routing system in routeToTool
    logger.debug('ToolExecutor', { message: 'Tool handlers registered' });
  }

  /**
   */
  private async executeToolDirectly(toolName: string, args: any): Promise<ToolResult> {
    const start = Date.now();
    
    try {
      // Import and execute the appropriate tool function
      const result = await this.routeToTool(toolName, args);
      
      return {
        success: true,
        data: result,
        executionTime: Date.now() - start,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        error: errorMsg,
        executionTime: Date.now() - start,
      };
    }
  }

  /**
   * Route tool execution to the appropriate handler
   */
  private async routeToTool(toolName: string, args: any): Promise<any> {
    // Dynamically import and execute tool functions
    switch (toolName) {
      // Staking tools
      case 'get_staking_info': {
        const { getStakingInfo } = await import('./staking.js');
        return await getStakingInfo(this.client, args.account_id);
      }
      case 'update_staked_node': {
        const { updateStakedNode } = await import('./staking.js');
        return await updateStakedNode(this.client, args.account_id, args.node_id);
      }
      case 'claim_staking_rewards': {
        const { claimStakingRewards } = await import('./staking.js');
        return await claimStakingRewards(this.client, args.account_id);
      }
      case 'decline_staking_rewards': {
        const { declineStakingRewards } = await import('./staking.js');
        return await declineStakingRewards(this.client, args.account_id);
      }
      case 'get_staking_nodes': {
        const { getStakingNodes } = await import('./staking.js');
        return await getStakingNodes();
      }

      // File service tools
      case 'create_file': {
        const { createFile } = await import('./fileService.js');
        return await createFile(this.client, {
          content: args.content,
          memo: args.memo,
          expirationDays: args.expiration_days,
        });
      }
      case 'append_file': {
        const { appendFile } = await import('./fileService.js');
        return await appendFile(this.client, args.file_id, args.content);
      }
      case 'get_file_info': {
        const { getFileInfo } = await import('./fileService.js');
        return await getFileInfo(this.client, args.file_id);
      }
      case 'delete_file': {
        const { deleteFile } = await import('./fileService.js');
        return await deleteFile(this.client, args.file_id);
      }

      // Governance tools
      case 'create_proposal': {
        const { createProposal } = await import('./governance.js');
        return await createProposal({
          title: args.title,
          description: args.description,
          creator: args.creator,
          votingToken: args.voting_token,
          votingDuration: args.voting_duration || 168,
          quorum: args.quorum || 10,
          threshold: args.threshold || 50,
          executionData: args.execution_data,
        });
      }
      case 'cast_vote': {
        const { castVote } = await import('./governance.js');
        return await castVote(
          { id: args.proposal_id } as any,
          {
            voter: args.voter_id,
            vote: args.vote,
            votingPower: args.voting_power || 100,
          }
        );
      }
      case 'finalize_proposal': {
        const { finalizeProposal } = await import('./governance.js');
        return await finalizeProposal({ id: args.proposal_id } as any, args.total_supply || 1000000);
      }
      case 'execute_proposal': {
        const { executeProposal } = await import('./governance.js');
        return await executeProposal({ id: args.proposal_id } as any, args.executor_id);
      }
      case 'get_voting_power': {
        const { getVotingPower } = await import('./governance.js');
        return await getVotingPower(args.account_id, args.voting_token);
      }

      // Advanced token tools
      case 'approve_hbar_allowance': {
        const { approveHbarAllowance } = await import('./advancedTokens.js');
        return await approveHbarAllowance(this.client, args.owner_id, args.spender_id, args.amount);
      }
      case 'approve_token_allowance': {
        const { approveTokenAllowance } = await import('./advancedTokens.js');
        return await approveTokenAllowance(this.client, args.owner_id, args.token_id, args.spender_id, args.amount);
      }
      case 'approve_nft_allowance': {
        const { approveNftAllowance } = await import('./advancedTokens.js');
        return await approveNftAllowance(this.client, args.owner_id, args.token_id, args.spender_id, args.serial_numbers);
      }
      case 'delete_hbar_allowance': {
        const { deleteHbarAllowance } = await import('./advancedTokens.js');
        return await deleteHbarAllowance(this.client, args.owner_id, args.spender_id);
      }
      case 'delete_token_allowance': {
        const { deleteTokenAllowance } = await import('./advancedTokens.js');
        return await deleteTokenAllowance(this.client, args.owner_id, args.token_id, args.spender_id);
      }
      case 'associate_token': {
        const { associateToken } = await import('./advancedTokens.js');
        return await associateToken(this.client, args.account_id, args.token_id);
      }
      case 'dissociate_token': {
        const { dissociateToken } = await import('./advancedTokens.js');
        return await dissociateToken(this.client, args.account_id, args.token_id);
      }
      case 'freeze_token': {
        const { freezeToken } = await import('./advancedTokens.js');
        return await freezeToken(this.client, args.token_id, args.account_id);
      }
      case 'unfreeze_token': {
        const { unfreezeToken } = await import('./advancedTokens.js');
        return await unfreezeToken(this.client, args.token_id, args.account_id);
      }
      case 'wipe_tokens': {
        const { wipeTokens } = await import('./advancedTokens.js');
        return await wipeTokens(this.client, args.token_id, args.account_id, args.amount);
      }
      case 'pause_token': {
        const { pauseToken } = await import('./advancedTokens.js');
        return await pauseToken(this.client, args.token_id);
      }
      case 'unpause_token': {
        const { unpauseToken } = await import('./advancedTokens.js');
        return await unpauseToken(this.client, args.token_id);
      }

      // Scheduling tools
      case 'create_scheduled_transfer': {
        const { createScheduledTransfer } = await import('./scheduling.js');
        return await createScheduledTransfer(this.client, args.creator_id, args.payer_id, args.transfers, {
          memo: args.memo,
          adminKey: args.admin_key,
          waitForExpiry: args.wait_for_expiry,
        });
      }
      case 'sign_scheduled_transaction': {
        const { signScheduledTransaction } = await import('./scheduling.js');
        return await signScheduledTransaction(this.client, args.schedule_id, args.signer_id);
      }
      case 'delete_scheduled_transaction': {
        const { deleteScheduledTransaction } = await import('./scheduling.js');
        return await deleteScheduledTransaction(this.client, args.schedule_id);
      }
      case 'get_schedule_info': {
        const { getScheduleInfo } = await import('./scheduling.js');
        return await getScheduleInfo(this.client, args.schedule_id);
      }
      case 'create_scheduled_topic_message': {
        const { createScheduledTopicMessage } = await import('./scheduling.js');
        return await createScheduledTopicMessage(this.client, args.creator_id, args.payer_id, args.topic_id, args.message, {
          memo: args.memo,
        });
      }

      // Kyber Network DEX tools
      case 'kyber_get_price': {
        const { getKyberPrice } = await import('./kyberSwaps.js');
        return await getKyberPrice(this.client, args.token, args.chain);
      }
      case 'kyber_get_swap_route': {
        const { getKyberSwapRoute } = await import('./kyberSwaps.js');
        return await getKyberSwapRoute(this.client, args.from_token, args.to_token, args.amount, args.chain);
      }
      case 'kyber_check_arbitrage': {
        const { checkKyberArbitrage } = await import('./kyberSwaps.js');
        return await checkKyberArbitrage(this.client, args.token, args.hedera_price);
      }
      case 'kyber_get_yield_farms': {
        const { getKyberYieldFarms } = await import('./kyberSwaps.js');
        return await getKyberYieldFarms(this.client, args.chain);
      }
      case 'kyber_get_pools': {
        const { getKyberPools } = await import('./kyberSwaps.js');
        return await getKyberPools(this.client, args.token0, args.token1, args.chain);
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    tools: number;
    categories: number;
    executions: number;
    errors: number;
  } {
    const stats = this.registry.getRegistryStats();
    return {
      tools: stats.totalTools,
      categories: stats.categories,
      executions: stats.totalExecutions,
      errors: stats.totalErrors,
    };
  }

  /**
   * Get list of all available tools
   */
  listTools(): { name: string; description: string; category: string }[] {
    return this.registry.getAll().map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
    }));
  }

  /**
   * Search for tools
   */
  searchTools(query: string): { name: string; description: string; category: string }[] {
    return this.registry.search(query).map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
    }));
  }
}

// Export factory function
export function createToolExecutor(config: ToolExecutorConfig): VeraLatticeToolExecutor {
  return new VeraLatticeToolExecutor(config);
}
