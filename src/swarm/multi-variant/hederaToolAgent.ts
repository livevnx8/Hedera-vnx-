/**
 * Hedera Tool Agent for Multi-Variant Swarm
 * 
 * Specialized agent that executes Hedera tools (HTS, HCS, Account)
 * within the swarm architecture. Can operate at Micro, Normal, or Macro levels.
 */

import { BaseSwarmAgent, AgentConfig, Task } from './baseSwarmAgent.js';
import { logger } from '../../monitoring/logger.js';

// Import Hedera tools
import {
  createFungibleToken,
  createNFTCollection,
  mintFungibleToken,
  createTopic,
  sendMessage,
  getAccountBalance,
  transferHBAR
} from '../../../hedera-tools-working.js';

export interface HederaToolTask {
  toolName: string;
  params: any;
  priority: number;
  retryCount: number;
  maxRetries: number;
}

export interface HederaToolResult {
  success: boolean;
  data?: any;
  error?: string;
  transactionId?: string;
  hashscanUrl?: string;
  executionTime: number;
}

export class HederaToolAgent extends BaseSwarmAgent {
  private toolExecutions: number = 0;
  private toolFailures: number = 0;
  private averageExecutionTime: number = 0;
  private pendingTransactions: Map<string, HederaToolTask> = new Map();

  constructor(config: AgentConfig) {
    super({
      ...config,
      capabilities: [...(config.capabilities || []), 'hedera-tools', 'blockchain-execution'],
      timeoutMs: 30000 // 30s timeout for blockchain operations
    });
  }

  /**
   * Execute Hedera tool task
   */
  protected async executeTask(task: Task): Promise<void> {
    const toolTask = task.payload as HederaToolTask;
    
    if (!toolTask.toolName) {
      throw new Error('No tool name specified');
    }

    const startTime = Date.now();
    
    try {
      const result = await this.executeHederaTool(toolTask);
      
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, result.success);
      
      if (result.success) {
        this.handleTaskCompletion(task, result);
      } else {
        if (toolTask.retryCount < toolTask.maxRetries) {
          // Retry task
          toolTask.retryCount++;
          await this.executeTask(task);
        } else {
          throw new Error(result.error || 'Tool execution failed');
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute specific Hedera tool
   */
  private async executeHederaTool(toolTask: HederaToolTask): Promise<HederaToolResult> {
    const { toolName, params } = toolTask;
    
    logger.info('HederaToolAgent', {
      agentId: this.config.id,
      toolName,
      swarmClass: this.config.swarmClass,
      message: 'Executing Hedera tool'
    });

    let result: any;

    switch (toolName) {
      // HTS Tools
      case 'createFungibleToken':
        result = await createFungibleToken(params);
        break;
      case 'createNFTCollection':
        result = await createNFTCollection(params);
        break;
      case 'mintFungibleToken':
        result = await mintFungibleToken(params);
        break;

      // HCS Tools
      case 'createTopic':
        result = await createTopic(params);
        break;
      case 'sendMessage':
        result = await sendMessage(params);
        break;

      // Account Tools
      case 'getAccountBalance':
        result = await getAccountBalance(params);
        break;
      case 'transferHBAR':
        result = await transferHBAR(params);
        break;

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          executionTime: 0
        };
    }

    return {
      success: result.success,
      data: result.data,
      error: result.error,
      transactionId: result.transactionId,
      hashscanUrl: result.hashscanUrl,
      executionTime: 0 // Will be set by caller
    };
  }

  /**
   * Update execution metrics
   */
  private updateMetrics(executionTime: number, success: boolean): void {
    this.toolExecutions++;
    
    if (!success) {
      this.toolFailures++;
    }

    // Calculate running average
    this.averageExecutionTime = 
      (this.averageExecutionTime * (this.toolExecutions - 1) + executionTime) / 
      this.toolExecutions;
  }

  /**
   * Create a tool execution task
   */
  createToolTask(toolName: string, params: any, priority: number = 0.5): Task {
    return {
      id: `hedera-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'hedera-tool',
      payload: {
        toolName,
        params,
        priority,
        retryCount: 0,
        maxRetries: 3
      } as HederaToolTask,
      priority,
      deadline: Date.now() + 60000 // 1 minute deadline
    };
  }

  /**
   * Execute token creation
   */
  async createToken(name: string, symbol: string, initialSupply: number): Promise<HederaToolResult> {
    const task = this.createToolTask('createFungibleToken', {
      name,
      symbol,
      decimals: 8,
      initialSupply
    }, 0.8);

    await this.executeTask(task);
    return task.payload.result;
  }

  /**
   * Execute NFT collection creation
   */
  async createNFT(name: string, symbol: string, maxSupply?: number): Promise<HederaToolResult> {
    const task = this.createToolTask('createNFTCollection', {
      name,
      symbol,
      maxSupply
    }, 0.8);

    await this.executeTask(task);
    return task.payload.result;
  }

  /**
   * Execute HCS topic creation
   */
  async createHCSTopic(memo?: string): Promise<HederaToolResult> {
    const task = this.createToolTask('createTopic', {
      memo: memo || 'Vera Swarm Topic'
    }, 0.7);

    await this.executeTask(task);
    return task.payload.result;
  }

  /**
   * Send HCS message
   */
  async sendHCSMessage(topicId: string, message: string): Promise<HederaToolResult> {
    const task = this.createToolTask('sendMessage', {
      topicId,
      message
    }, 0.9);

    await this.executeTask(task);
    return task.payload.result;
  }

  /**
   * Get account balance
   */
  async checkBalance(accountId: string): Promise<HederaToolResult> {
    const task = this.createToolTask('getAccountBalance', {
      accountId
    }, 0.5);

    await this.executeTask(task);
    return task.payload.result;
  }

  /**
   * Transfer HBAR
   */
  async transfer(toAccountId: string, amount: number, memo?: string): Promise<HederaToolResult> {
    const task = this.createToolTask('transferHBAR', {
      toAccountId,
      amount,
      memo: memo || 'Vera Swarm Transfer'
    }, 0.8);

    await this.executeTask(task);
    return task.payload.result;
  }

  /**
   * Batch execute multiple tools
   */
  async executeBatch(tools: Array<{ name: string; params: any; priority?: number }>): Promise<HederaToolResult[]> {
    const results: HederaToolResult[] = [];
    
    // Execute based on swarm class
    if (this.config.swarmClass === 'micro') {
      // Micro: Execute in parallel for speed
      const promises = tools.map(t => 
        this.executeHederaTool({
          toolName: t.name,
          params: t.params,
          priority: t.priority || 0.5,
          retryCount: 0,
          maxRetries: 3
        })
      );
      const parallelResults = await Promise.allSettled(promises);
      results.push(...parallelResults.map(r => 
        r.status === 'fulfilled' ? r.value : { success: false, error: 'Failed', executionTime: 0 }
      ));
    } else if (this.config.swarmClass === 'normal') {
      // Normal: Execute sequentially with validation
      for (const tool of tools) {
        const result = await this.executeHederaTool({
          toolName: tool.name,
          params: tool.params,
          priority: tool.priority || 0.5,
          retryCount: 0,
          maxRetries: 3
        });
        results.push(result);
        
        // Stop on failure for workflows
        if (!result.success && tool.priority && tool.priority > 0.8) {
          break;
        }
      }
    } else {
      // Macro: Batch and optimize
      results.push(...await this.executeMacroBatch(tools));
    }

    return results;
  }

  /**
   * Macro-specific batch optimization
   */
  private async executeMacroBatch(tools: Array<{ name: string; params: any; priority?: number }>): Promise<HederaToolResult[]> {
    // Group by tool type for optimization
    const byType: Map<string, typeof tools> = new Map();
    
    for (const tool of tools) {
      const typeTools = byType.get(tool.name) || [];
      typeTools.push(tool);
      byType.set(tool.name, typeTools);
    }

    const results: HederaToolResult[] = [];

    // Execute by type (could optimize further with actual batching)
    for (const typeTools of byType.values()) {
      for (const tool of typeTools) {
        const result = await this.executeHederaTool({
          toolName: tool.name,
          params: tool.params,
          priority: tool.priority || 0.5,
          retryCount: 0,
          maxRetries: 3
        });
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get tool execution metrics
   */
  getToolMetrics() {
    return {
      ...this.metrics,
      toolExecutions: this.toolExecutions,
      toolFailures: this.toolFailures,
      successRate: this.toolExecutions > 0 
        ? ((this.toolExecutions - this.toolFailures) / this.toolExecutions * 100).toFixed(2) + '%'
        : 'N/A',
      averageExecutionTime: Math.round(this.averageExecutionTime),
      pendingTransactions: this.pendingTransactions.size
    };
  }
}
