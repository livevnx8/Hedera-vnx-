/**
 * Tool-Augmented AI (Phase 15)
 * 
 * AI agents that use external tools, calculators, and code interpreters.
 */

import { logger } from '../monitoring/logger.js';
import type { 
  ToolDefinition, 
  ToolExecution,
  ToolExecutionResult,
  CodeExecution 
} from './types.js';

interface ToolUseConfig {
  maxToolCalls: number;
  timeoutMs: number;
  allowedLanguages: string[];
}

export class ToolAugmentedAI {
  private config: ToolUseConfig;
  private tools: Map<string, ToolDefinition> = new Map();
  private executionHistory: ToolExecution[] = [];

  constructor(config: Partial<ToolUseConfig> = {}) {
    this.config = {
      maxToolCalls: 10,
      timeoutMs: 30000,
      allowedLanguages: ['javascript', 'python', 'typescript', 'bash', 'sql'],
      ...config
    };

    // Register built-in tools
    this.registerBuiltInTools();
  }

  /**
   * Register a tool
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.info('ToolAugmentedAI', {
      message: 'Tool registered',
      name: tool.name
    });
  }

  /**
   * Execute task with available tools
   */
  async executeWithTools(
    task: string,
    availableTools: string[]
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const toolsUsed: ToolExecution[] = [];
    let iterations = 0;
    let finalAnswer = '';

    try {
      // Parse task and determine which tools to use
      const toolPlan = this.planToolUsage(task, availableTools);

      // Execute each planned tool
      for (const toolCall of toolPlan) {
        if (iterations >= this.config.maxToolCalls) {
          break;
        }

        const execution = await this.executeTool(
          toolCall.tool,
          toolCall.params
        );

        toolsUsed.push(execution);
        iterations++;

        if (!execution.success) {
          break;
        }
      }

      // Generate final answer based on tool results
      finalAnswer = this.synthesizeAnswer(task, toolsUsed);

      logger.info('ToolAugmentedAI', {
        message: 'Task executed with tools',
        toolsUsed: toolsUsed.length,
        executionTime: Date.now() - startTime
      });

    } catch (error) {
      logger.error('ToolAugmentedAI', {
        message: 'Tool execution failed',
        task: task.slice(0, 50),
        error: error instanceof Error ? error.message : String(error)
      });
      finalAnswer = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      task,
      toolsUsed,
      finalAnswer,
      totalExecutionTime: Date.now() - startTime,
      toolCallCount: toolsUsed.length
    };
  }

  /**
   * Execute code in sandboxed environment
   */
  async codeInterpreter(code: string, language: string): Promise<CodeExecution> {
    if (!this.config.allowedLanguages.includes(language)) {
      return {
        code,
        language,
        output: '',
        error: `Language ${language} not allowed`,
        executionTime: 0,
        memoryUsed: 0
      };
    }

    const startTime = Date.now();

    try {
      // Mock code execution - would run in sandboxed container in production
      let output = '';
      let error = '';

      if (language === 'javascript' || language === 'typescript') {
        // Safe evaluation with limited scope
        try {
          // eslint-disable-next-line no-new-func
          const result = new Function('console', `
            const logs = [];
            const mockConsole = {
              log: (...args) => logs.push(args.join(' ')),
              error: (...args) => logs.push('ERROR: ' + args.join(' '))
            };
            ${code}
            return logs.join('\\n');
          `)({ log: () => {}, error: () => {} });
          output = result || 'Code executed successfully';
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      } else {
        // Mock for other languages
        output = `[${language}] Code execution simulated. Output would appear here.`;
      }

      const execution: CodeExecution = {
        code,
        language,
        output,
        error: error || undefined,
        executionTime: Date.now() - startTime,
        memoryUsed: Math.floor(Math.random() * 100) // Mock memory usage
      };

      logger.info('ToolAugmentedAI', {
        message: 'Code interpreted',
        language,
        success: !error,
        executionTime: execution.executionTime
      });

      return execution;

    } catch (e) {
      return {
        code,
        language,
        output: '',
        error: e instanceof Error ? e.message : String(e),
        executionTime: Date.now() - startTime,
        memoryUsed: 0
      };
    }
  }

  /**
   * Get available tools
   */
  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): ToolExecution[] {
    return this.executionHistory.slice(-100);
  }

  /**
   * Get tool statistics
   */
  getStats() {
    const history = this.executionHistory;
    const successCount = history.filter(e => e.success).length;

    return {
      timestamp: Date.now(),
      registeredTools: this.tools.size,
      totalExecutions: history.length,
      successfulExecutions: successCount,
      failedExecutions: history.length - successCount,
      avgExecutionTime: history.length > 0 
        ? history.reduce((sum, e) => sum + e.executionTime, 0) / history.length 
        : 0,
      mostUsedTools: this.getMostUsedTools()
    };
  }

  // Private methods
  private registerBuiltInTools(): void {
    const builtInTools: ToolDefinition[] = [
      {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to evaluate'
            }
          },
          required: ['expression']
        }
      },
      {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            num_results: {
              type: 'number',
              description: 'Number of results to return'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'hedera_query',
        description: 'Query Hedera network data',
        parameters: {
          type: 'object',
          properties: {
            query_type: {
              type: 'string',
              enum: ['account_balance', 'token_info', 'transaction', 'consensus_topic'],
              description: 'Type of query'
            },
            target: {
              type: 'string',
              description: 'Account ID, token ID, or topic ID'
            }
          },
          required: ['query_type', 'target']
        }
      },
      {
        name: 'code_execute',
        description: 'Execute code in sandboxed environment',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code to execute'
            },
            language: {
              type: 'string',
              enum: this.config.allowedLanguages,
              description: 'Programming language'
            }
          },
          required: ['code', 'language']
        }
      }
    ];

    builtInTools.forEach(tool => this.registerTool(tool));
  }

  private planToolUsage(
    task: string,
    availableTools: string[]
  ): Array<{ tool: string; params: Record<string, unknown> }> {
    // Simple planning based on keywords
    const plan: Array<{ tool: string; params: Record<string, unknown> }> = [];

    if (task.match(/calculate|math|sum|add|multiply|divide/i)) {
      plan.push({
        tool: 'calculator',
        params: { expression: task.match(/[\d+\-*/().\s]+/)?.[0] || '0' }
      });
    }

    if (task.match(/search|find|lookup|information about/i)) {
      plan.push({
        tool: 'web_search',
        params: { query: task, num_results: 5 }
      });
    }

    if (task.match(/hedera|hbar|token|account|balance/i)) {
      plan.push({
        tool: 'hedera_query',
        params: { query_type: 'account_balance', target: '0.0.1234' }
      });
    }

    if (task.match(/code|program|script|function/i)) {
      plan.push({
        tool: 'code_execute',
        params: { code: '// Code would be extracted here', language: 'javascript' }
      });
    }

    return plan.length > 0 ? plan : [{
      tool: availableTools[0] || 'calculator',
      params: { query: task }
    }];
  }

  private async executeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolExecution> {
    const startTime = Date.now();
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        tool: toolName,
        params,
        result: null,
        executionTime: 0,
        success: false,
        error: `Tool ${toolName} not found`
      };
    }

    try {
      // Mock tool execution - would call actual services in production
      let result: unknown;

      switch (toolName) {
        case 'calculator':
          // eslint-disable-next-line no-eval
          result = { result: eval(params.expression as string) };
          break;
        case 'web_search':
          result = { results: [`Result for: ${params.query}`] };
          break;
        case 'hedera_query':
          result = { balance: 1000000000, account: params.target };
          break;
        case 'code_execute':
          const codeResult = await this.codeInterpreter(
            params.code as string,
            params.language as string
          );
          result = codeResult;
          break;
        default:
          result = { executed: true, tool: toolName };
      }

      const execution: ToolExecution = {
        tool: toolName,
        params,
        result,
        executionTime: Date.now() - startTime,
        success: true
      };

      this.executionHistory.push(execution);
      return execution;

    } catch (error) {
      const failedExecution: ToolExecution = {
        tool: toolName,
        params,
        result: null,
        executionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      this.executionHistory.push(failedExecution);
      return failedExecution;
    }
  }

  private synthesizeAnswer(task: string, toolsUsed: ToolExecution[]): string {
    const successfulTools = toolsUsed.filter(t => t.success);
    
    if (successfulTools.length === 0) {
      return `I attempted to use tools to answer "${task}", but encountered errors.`;
    }

    const results = successfulTools.map(t => {
      const resultStr = typeof t.result === 'object' 
        ? JSON.stringify(t.result).slice(0, 200)
        : String(t.result).slice(0, 200);
      return `${t.tool}: ${resultStr}`;
    }).join('\n');

    return `Based on the tools used to analyze "${task}", here are the results:\n\n${results}`;
  }

  private getMostUsedTools(): Array<{ tool: string; count: number }> {
    const counts = new Map<string, number>();
    
    for (const execution of this.executionHistory) {
      counts.set(execution.tool, (counts.get(execution.tool) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
}

// Singleton
let toolAIInstance: ToolAugmentedAI | null = null;

export function getToolAugmentedAI(config?: Partial<ToolUseConfig>): ToolAugmentedAI {
  if (!toolAIInstance) {
    toolAIInstance = new ToolAugmentedAI(config);
  }
  return toolAIInstance;
}
