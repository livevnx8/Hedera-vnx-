/**
 * Vera Workflow Engine - Phase 2 Implementation
 * Orchestrates multi-tool autonomous workflows with state management
 */

import { EventEmitter } from 'events';
import { executeTool } from './executor.js';

export interface WorkflowStep {
  id: string;
  tool: string;
  input: Record<string, unknown> | ((context: WorkflowContext) => Record<string, unknown>);
  outputKey: string;
  condition?: (context: WorkflowContext) => boolean;
  retries: number;
  timeoutMs: number;
  onError: 'retry' | 'skip' | 'fail' | 'rollback';
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  rollbackSteps?: WorkflowStep[];
  onError: 'retry' | 'rollback' | 'alert' | 'pause';
  timeout: number;
  maxRetries: number;
  category: 'defi' | 'nft' | 'governance' | 'treasury' | 'enterprise' | 'custom';
}

export interface WorkflowContext {
  workflowId: string;
  stepResults: Map<string, any>;
  variables: Map<string, any>;
  metadata: {
    startedAt: number;
    lastStepAt: number;
    retryCount: number;
    rollbackCount: number;
  };
}

export interface WorkflowResult {
  success: boolean;
  workflowId: string;
  completedSteps: string[];
  failedSteps: Array<{ stepId: string; error: string }>;
  outputs: Map<string, any>;
  duration: number;
  error?: string;
}

export interface WorkflowStatus {
  id: string;
  state: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'rolling_back';
  currentStep: string | null;
  progress: number; // 0-100
  message: string;
  startedAt: number;
  estimatedCompletion?: number;
}

class WorkflowOrchestrator extends EventEmitter {
  private activeWorkflows: Map<string, WorkflowStatus> = new Map();
  private workflowResults: Map<string, WorkflowResult> = new Map();
  private workflowDefinitions: Map<string, WorkflowDefinition> = new Map();

  constructor() {
    super();
    this.registerBuiltInWorkflows();
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(definition: WorkflowDefinition): void {
    this.workflowDefinitions.set(definition.id, definition);
    console.log(`✅ Registered workflow: ${definition.name} (${definition.id})`);
  }

  /**
   * Execute a workflow by ID
   */
  async execute(workflowId: string, initialVariables: Record<string, any> = {}): Promise<WorkflowResult> {
    const definition = this.workflowDefinitions.get(workflowId);
    if (!definition) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    return this.executeWorkflow(definition, initialVariables);
  }
  
  /**
   * Execute a workflow with full definition
   */
  private async executeWorkflow(definition: WorkflowDefinition, initialVariables: Record<string, any>): Promise<WorkflowResult> {
    const runId = `${definition.id}-${Date.now()}`;
    const context: WorkflowContext = {
      workflowId: runId,
      stepResults: new Map(),
      variables: new Map(Object.entries(initialVariables)),
      metadata: {
        startedAt: Date.now(),
        lastStepAt: Date.now(),
        retryCount: 0,
        rollbackCount: 0,
      },
    };

    // Initialize status
    const status: WorkflowStatus = {
      id: runId,
      state: 'running',
      currentStep: null,
      progress: 0,
      message: `Starting workflow: ${definition.name}`,
      startedAt: Date.now(),
    };
    this.activeWorkflows.set(runId, status);

    this.emit('workflow_started', { runId, definition: definition.id, name: definition.name });

    const completedSteps: string[] = [];
    const failedSteps: Array<{ stepId: string; error: string }> = [];

    try {
      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        status.currentStep = step.id;
        status.progress = Math.round((i / definition.steps.length) * 100);
        status.message = `Executing step ${i + 1}/${definition.steps.length}: ${step.tool}`;

        this.emit('step_started', { runId, stepId: step.id, tool: step.tool });

        // Check condition
        if (step.condition && !step.condition(context)) {
          console.log(`⏭️  Skipping step ${step.id} - condition not met`);
          continue;
        }

        // Execute step with retries
        let stepResult: any = null;
        let stepError: string | null = null;
        let attempts = 0;

        while (attempts <= step.retries) {
          try {
            const input = typeof step.input === 'function' 
              ? step.input(context) 
              : step.input;

            stepResult = await this.executeStepWithTimeout(step.tool, input, step.timeoutMs);
            break;
          } catch (error) {
            attempts++;
            stepError = error instanceof Error ? error.message : String(error);
            
            if (attempts > step.retries) {
              throw new Error(`Step ${step.id} failed after ${attempts} attempts: ${stepError}`);
            }

            console.log(`🔄 Retrying step ${step.id} (attempt ${attempts + 1}/${step.retries + 1})`);
            await this.delay(1000 * attempts);
          }
        }

        // Store result
        context.stepResults.set(step.outputKey, stepResult);
        context.metadata.lastStepAt = Date.now();
        completedSteps.push(step.id);

        this.emit('step_completed', { runId, stepId: step.id, result: stepResult });
      }

      // Workflow completed successfully
      status.state = 'completed';
      status.progress = 100;
      status.message = 'Workflow completed successfully';

      const result: WorkflowResult = {
        success: true,
        workflowId: runId,
        completedSteps,
        failedSteps,
        outputs: context.stepResults,
        duration: Date.now() - context.metadata.startedAt,
      };

      this.workflowResults.set(runId, result);
      this.emit('workflow_completed', { runId, result });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      status.state = 'failed';
      status.message = `Workflow failed: ${errorMessage}`;

      // Handle rollback if needed
      if (definition.onError === 'rollback' && definition.rollbackSteps) {
        status.state = 'rolling_back';
        await this.rollbackWorkflow(definition, context, completedSteps);
      }

      const result: WorkflowResult = {
        success: false,
        workflowId: runId,
        completedSteps,
        failedSteps: [...failedSteps, { stepId: status.currentStep || 'unknown', error: errorMessage }],
        outputs: context.stepResults,
        duration: Date.now() - context.metadata.startedAt,
        error: errorMessage,
      };

      this.workflowResults.set(runId, result);
      this.emit('workflow_failed', { runId, error: errorMessage });

      return result;
    } finally {
      this.activeWorkflows.delete(runId);
    }
  }

  /**
   * Execute a single step with timeout
   */
  private async executeStepWithTimeout(tool: string, input: Record<string, unknown>, timeoutMs: number): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Step timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    const executionPromise = executeTool(tool, input);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Rollback workflow steps in reverse order
   */
  private async rollbackWorkflow(definition: WorkflowDefinition, context: WorkflowContext, completedSteps: string[]): Promise<void> {
    if (!definition.rollbackSteps) return;

    console.log(`⏪ Rolling back workflow ${definition.id}`);

    const rollbackSteps = definition.rollbackSteps
      .filter(step => completedSteps.includes(step.id))
      .reverse();

    for (const step of rollbackSteps) {
      try {
        const input = typeof step.input === 'function' 
          ? step.input(context) 
          : step.input;

        await executeTool(step.tool, input);
        context.metadata.rollbackCount++;
        console.log(`✅ Rolled back step: ${step.id}`);
      } catch (error) {
        console.error(`❌ Rollback failed for step ${step.id}:`, error);
      }
    }
  }

  /**
   * Get workflow status
   */
  getStatus(runId: string): WorkflowStatus | undefined {
    return this.activeWorkflows.get(runId);
  }

  /**
   * Get workflow result
   */
  getResult(runId: string): WorkflowResult | undefined {
    return this.workflowResults.get(runId);
  }

  /**
   * List all registered workflows
   */
  listWorkflows(): Array<{ id: string; name: string; category: string; version: string }> {
    return Array.from(this.workflowDefinitions.values()).map(w => ({
      id: w.id,
      name: w.name,
      category: w.category,
      version: w.version,
    }));
  }

  /**
   * Get workflow template
   */
  getWorkflowTemplate(workflowId: string): WorkflowDefinition | undefined {
    return this.workflowDefinitions.get(workflowId);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register built-in workflow templates
   */
  private registerBuiltInWorkflows(): void {
    // DeFi Token Launch Workflow
    this.registerWorkflow({
      id: 'defi-token-launch',
      name: 'DeFi Token Launch',
      description: 'Complete workflow for launching a new DeFi token with liquidity pool',
      version: '1.0.0',
      category: 'defi',
      steps: [
        {
          id: 'create-token',
          tool: 'hts_create_token',
          input: {
            tokenName: '{{tokenName}}',
            tokenSymbol: '{{tokenSymbol}}',
            initialSupply: '{{initialSupply}}',
            decimals: 8,
            supplyType: 'FINITE',
            maxSupply: '{{maxSupply}}',
          },
          outputKey: 'token',
          retries: 2,
          timeoutMs: 30000,
          onError: 'fail',
        },
        {
          id: 'create-nft-collection',
          tool: 'hts_create_nft',
          input: {
            tokenName: '{{tokenName}} NFT Collection',
            tokenSymbol: '{{tokenSymbol}}NFT',
            maxSupply: 10000,
          },
          outputKey: 'nftCollection',
          retries: 2,
          timeoutMs: 30000,
          onError: 'skip',
        },
        {
          id: 'create-governance-topic',
          tool: 'hcs_create_topic',
          input: {
            topicMemo: 'Governance: {{tokenName}}',
          },
          outputKey: 'governanceTopic',
          retries: 1,
          timeoutMs: 20000,
          onError: 'skip',
        },
        {
          id: 'submit-launch-announcement',
          tool: 'hcs_submit_message',
          input: (ctx) => ({
            topicId: ctx.stepResults.get('governanceTopic')?.topicId,
            message: JSON.stringify({
              type: 'token_launch',
              tokenId: ctx.stepResults.get('token')?.tokenId,
              tokenName: ctx.variables.get('tokenName'),
              timestamp: Date.now(),
            }),
          }),
          outputKey: 'announcement',
          condition: (ctx) => !!ctx.stepResults.get('governanceTopic'),
          retries: 1,
          timeoutMs: 15000,
          onError: 'skip',
        },
      ],
      onError: 'rollback',
      timeout: 120000,
      maxRetries: 3,
    });

    // NFT Drop Workflow
    this.registerWorkflow({
      id: 'nft-drop',
      name: 'NFT Collection Drop',
      description: 'Launch an NFT collection with batch minting and airdrop',
      version: '1.0.0',
      category: 'nft',
      steps: [
        {
          id: 'create-collection',
          tool: 'hts_create_nft',
          input: {
            tokenName: '{{collectionName}}',
            tokenSymbol: '{{collectionSymbol}}',
            maxSupply: '{{maxSupply}}',
          },
          outputKey: 'collection',
          retries: 2,
          timeoutMs: 30000,
          onError: 'fail',
        },
        {
          id: 'mint-batch',
          tool: 'hts_mint_nft',
          input: (ctx) => ({
            tokenId: ctx.stepResults.get('collection')?.tokenId,
            metadata: JSON.stringify({ 
              name: ctx.variables.get('collectionName') + ' #1', 
              image: ctx.variables.get('baseImageUri') + '/1.png'
            }),
          }),
          outputKey: 'firstMint',
          retries: 1,
          timeoutMs: 20000,
          onError: 'fail',
        },
        {
          id: 'create-airdrop-topic',
          tool: 'hcs_create_topic',
          input: {
            topicMemo: 'Airdrop: {{collectionName}}',
          },
          outputKey: 'airdropTopic',
          retries: 1,
          timeoutMs: 15000,
          onError: 'skip',
        },
      ],
      onError: 'rollback',
      timeout: 90000,
      maxRetries: 2,
    });

    // Treasury Rebalancing Workflow
    this.registerWorkflow({
      id: 'treasury-rebalance',
      name: 'Treasury Rebalancing',
      description: 'Rebalance treasury holdings and stake excess HBAR',
      version: '1.0.0',
      category: 'treasury',
      steps: [
        {
          id: 'get-balances',
          tool: 'kit_get_token_balances',
          input: {
            accountId: '{{treasuryAccount}}',
          },
          outputKey: 'balances',
          retries: 1,
          timeoutMs: 10000,
          onError: 'fail',
        },
        {
          id: 'stake-excess',
          tool: 'enable_staking',
          input: {
            accountId: '{{treasuryAccount}}',
            nodeId: 0,
          },
          outputKey: 'staking',
          condition: (ctx) => {
            const balances = ctx.stepResults.get('balances');
            return balances?.hbarBalance > 1000; // Only stake if > 1000 HBAR
          },
          retries: 1,
          timeoutMs: 20000,
          onError: 'skip',
        },
      ],
      onError: 'alert',
      timeout: 60000,
      maxRetries: 2,
    });

    console.log(`📋 Registered ${this.workflowDefinitions.size} built-in workflows`);
  }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();

// Also export class for custom instantiation
export { WorkflowOrchestrator };
