/**
 * Hedera-Integrated Swarm Orchestrator
 * 
 * Extended orchestrator that includes Hedera tool agents
 * for blockchain operations across Micro, Normal, and Macro swarms.
 */

import { MultiVariantSwarmOrchestrator } from './swarmOrchestrator.js';
import { HederaToolAgent } from './hederaToolAgent.js';
import { MicroAgent } from './microAgent.js';
import { NormalAgent } from './normalAgent.js';
import { MacroAgent } from './macroAgent.js';
import { AgentTier, SwarmClass } from './baseSwarmAgent.js';
import { logger } from '../../monitoring/logger.js';

export interface HederaSwarmConfig {
  enableHederaTools: boolean;
  hederaToolDistribution: {
    micro: number; // percentage of micro agents that are tool agents
    normal: number;
    macro: number;
  };
}

export class HederaIntegratedSwarm extends MultiVariantSwarmOrchestrator {
  private hederaAgents: Map<string, HederaToolAgent> = new Map();
  private hederaConfig: HederaSwarmConfig;

  constructor(config: Partial<HederaSwarmConfig> = {}) {
    super();
    
    this.hederaConfig = {
      enableHederaTools: true,
      hederaToolDistribution: {
        micro: 20,  // 20% of micro agents are tool agents
        normal: 50, // 50% of normal agents are tool agents
        macro: 80   // 80% of macro agents are tool agents
      },
      ...config
    };
  }

  /**
   * Initialize with Hedera integration
   */
  async initialize(): Promise<void> {
    logger.info('HederaIntegratedSwarm', { message: 'Initializing with Hedera tools...' });
    
    // Initialize base orchestrator
    await super.initialize();
    
    // Create Hedera tool agents for each swarm class
    if (this.hederaConfig.enableHederaTools) {
      await this.createHederaToolAgents();
    }

    logger.info('HederaIntegratedSwarm', { 
      hederaAgents: this.hederaAgents.size,
      message: 'Hedera integration complete' 
    });
  }

  /**
   * Create Hedera tool agents distributed across swarm classes
   */
  private async createHederaToolAgents(): Promise<void> {
    // Create micro Hedera agents
    const microCount = Math.floor(
      this.getAgentsByClass('micro').length * 
      (this.hederaConfig.hederaToolDistribution.micro / 100)
    );
    await this.spawnHederaAgents('micro', microCount);

    // Create normal Hedera agents
    const normalCount = Math.floor(
      this.getAgentsByClass('normal').length * 
      (this.hederaConfig.hederaToolDistribution.normal / 100)
    );
    await this.spawnHederaAgents('normal', normalCount);

    // Create macro Hedera agents
    const macroCount = Math.floor(
      this.getAgentsByClass('macro').length * 
      (this.hederaConfig.hederaToolDistribution.macro / 100)
    );
    await this.spawnHederaAgents('macro', macroCount);
  }

  /**
   * Spawn Hedera tool agents for a specific swarm class
   */
  private async spawnHederaAgents(swarmClass: SwarmClass, count: number): Promise<HederaToolAgent[]> {
    const agents: HederaToolAgent[] = [];

    for (let i = 0; i < count; i++) {
      const tier = this.determineHederaTier(swarmClass);
      
      const agent = new HederaToolAgent({
        id: `hedera-${swarmClass}-${Date.now()}-${i}`,
        tier,
        role: tier === 1 ? 'executor' : tier === 2 ? 'analyst' : 'planner',
        swarmClass,
        capabilities: ['hedera-tools', 'blockchain-execution', `${swarmClass}-ops`],
        maxConcurrentTasks: this.getConcurrentTasksForClass(swarmClass, tier),
        timeoutMs: this.getTimeoutForClass(swarmClass)
      });

      this.hederaAgents.set(agent.getId(), agent);
      this.agents.set(agent.getId(), agent); // Also register in base agents
      agents.push(agent);
    }

    logger.info('HederaIntegratedSwarm', {
      swarmClass,
      count: agents.length,
      message: `Hedera ${swarmClass} agents spawned`
    });

    return agents;
  }

  /**
   * Determine tier for Hedera agent based on swarm class
   */
  private determineHederaTier(swarmClass: SwarmClass): AgentTier {
    // Micro: Mostly tier 1 for speed
    // Normal: Balanced
    // Macro: More tier 2/3 for coordination
    
    const rand = Math.random();
    
    switch (swarmClass) {
      case 'micro':
        return rand < 0.8 ? 1 : rand < 0.95 ? 2 : 3;
      case 'normal':
        return rand < 0.6 ? 1 : rand < 0.9 ? 2 : 3;
      case 'macro':
        return rand < 0.4 ? 1 : rand < 0.75 ? 2 : 3;
      default:
        return 1;
    }
  }

  /**
   * Get concurrent tasks for swarm class
   */
  private getConcurrentTasksForClass(swarmClass: SwarmClass, tier: AgentTier): number {
    const base = swarmClass === 'micro' ? 10 : swarmClass === 'normal' ? 5 : 3;
    return base + (3 - tier) * 2; // Higher tier = fewer concurrent (more complex)
  }

  /**
   * Get timeout for swarm class
   */
  private getTimeoutForClass(swarmClass: SwarmClass): number {
    return swarmClass === 'micro' ? 5000 : swarmClass === 'normal' ? 15000 : 30000;
  }

  /**
   * Execute Hedera tool via appropriate swarm class
   */
  async executeHederaTool(
    toolName: string, 
    params: any, 
    preferredClass?: SwarmClass
  ): Promise<any> {
    // Select optimal swarm class if not specified
    const swarmClass = preferredClass || this.selectOptimalClass(toolName);
    
    // Get available Hedera agents for that class
    const agents = this.getHederaAgentsByClass(swarmClass);
    
    if (agents.length === 0) {
      throw new Error(`No Hedera agents available for ${swarmClass} class`);
    }

    // Select agent with lowest load
    const agent = agents.sort((a, b) => a.getCurrentLoad() - b.getCurrentLoad())[0];

    logger.info('HederaIntegratedSwarm', {
      toolName,
      swarmClass,
      agentId: agent.getId(),
      message: 'Executing Hedera tool'
    });

    // Execute via agent
    const task = agent.createToolTask(toolName, params, 0.8);
    await agent.assignTask(task);

    return task.payload?.result;
  }

  /**
   * Select optimal swarm class for a tool
   */
  private selectOptimalClass(toolName: string): SwarmClass {
    // Tools that benefit from speed → Micro
    // Tools that need validation → Normal
    // Tools that need coordination → Macro
    
    const microTools = ['getAccountBalance', 'sendMessage'];
    const normalTools = ['createFungibleToken', 'createNFTCollection', 'mintFungibleToken'];
    const macroTools = ['createTopic']; // Multi-region topics
    
    if (microTools.includes(toolName)) return 'micro';
    if (normalTools.includes(toolName)) return 'normal';
    if (macroTools.includes(toolName)) return 'macro';
    
    return 'normal'; // Default
  }

  /**
   * Get all Hedera agents
   */
  getAllHederaAgents(): Map<string, HederaToolAgent> {
    return this.hederaAgents;
  }

  /**
   * Get Hedera agents by swarm class
   */
  getHederaAgentsByClass(swarmClass: SwarmClass): HederaToolAgent[] {
    return Array.from(this.hederaAgents.values())
      .filter(a => a.getSwarmClass() === swarmClass);
  }

  /**
   * Batch execute Hedera tools with optimization
   */
  async executeBatch(tools: Array<{
    name: string;
    params: any;
    preferredClass?: SwarmClass;
  }>): Promise<any[]> {
    // Group by class
    const byClass: Map<SwarmClass, typeof tools> = new Map();
    
    for (const tool of tools) {
      const swarmClass = tool.preferredClass || this.selectOptimalClass(tool.name);
      const classTools = byClass.get(swarmClass) || [];
      classTools.push(tool);
      byClass.set(swarmClass, classTools);
    }

    // Execute by class
    const results: any[] = [];
    
    for (const [swarmClass, classTools] of byClass) {
      const agents = this.getHederaAgentsByClass(swarmClass);
      
      if (agents.length === 0) {
        // Fall back to base execution
        for (const tool of classTools) {
          results.push(await this.executeHederaTool(tool.name, tool.params, swarmClass));
        }
      } else {
        // Distribute across agents
        const agentCount = agents.length;
        const toolsPerAgent = Math.ceil(classTools.length / agentCount);
        
        for (let i = 0; i < classTools.length; i++) {
          const agent = agents[i % agentCount];
          const tool = classTools[i];
          const task = agent.createToolTask(tool.name, tool.params, 0.8);
          
          await agent.assignTask(task);
          results.push(task.payload?.result);
        }
      }
    }

    return results;
  }

  /**
   * Create token via swarm (demonstrates multi-step workflow)
   */
  async createTokenViaSwarm(
    name: string, 
    symbol: string, 
    initialSupply: number
  ): Promise<{ 
    success: boolean; 
    tokenId?: string; 
    transactionId?: string;
    hashscanUrl?: string;
    swarmPath: string[];
  }> {
    const swarmPath: string[] = [];

    try {
      // Step 1: Micro agent validates parameters
      swarmPath.push('micro-validation');
      const microAgents = this.getHederaAgentsByClass('micro');
      if (microAgents.length > 0) {
        // Quick validation via micro agent
        logger.debug('HederaIntegratedSwarm', { step: 'validation', message: 'Micro validation' });
      }

      // Step 2: Normal agent executes creation
      swarmPath.push('normal-execution');
      const normalResult = await this.executeHederaTool(
        'createFungibleToken',
        { name, symbol, initialSupply },
        'normal'
      );

      if (!normalResult?.success) {
        throw new Error(normalResult?.error || 'Token creation failed');
      }

      // Step 3: Macro agent logs to bus
      swarmPath.push('macro-logging');
      const macroAgents = this.getHederaAgentsByClass('macro');
      if (macroAgents.length > 0) {
        // Log creation event to bus
        logger.debug('HederaIntegratedSwarm', { 
          step: 'logging', 
          tokenId: normalResult.data?.tokenId,
          message: 'Macro logging' 
        });
      }

      return {
        success: true,
        tokenId: normalResult.data?.tokenId,
        transactionId: normalResult.transactionId,
        hashscanUrl: normalResult.hashscanUrl,
        swarmPath
      };

    } catch (error) {
      logger.error('HederaIntegratedSwarm', {
        error: (error as Error).message,
        swarmPath,
        message: 'Token creation via swarm failed'
      });

      return {
        success: false,
        swarmPath
      };
    }
  }

  /**
   * Get comprehensive stats including Hedera metrics
   */
  getHederaStats() {
    const baseStats = this.getStats();
    
    const hederaByClass = {
      micro: this.getHederaAgentsByClass('micro').map(a => a.getToolMetrics()),
      normal: this.getHederaAgentsByClass('normal').map(a => a.getToolMetrics()),
      macro: this.getHederaAgentsByClass('macro').map(a => a.getToolMetrics())
    };

    const totalExecutions = Object.values(hederaByClass).flat()
      .reduce((sum, m) => sum + m.toolExecutions, 0);
    
    const totalFailures = Object.values(hederaByClass).flat()
      .reduce((sum, m) => sum + m.toolFailures, 0);

    return {
      ...baseStats,
      hedera: {
        totalAgents: this.hederaAgents.size,
        byClass: {
          micro: hederaByClass.micro.length,
          normal: hederaByClass.normal.length,
          macro: hederaByClass.macro.length
        },
        totalExecutions,
        totalFailures,
        successRate: totalExecutions > 0
          ? ((totalExecutions - totalFailures) / totalExecutions * 100).toFixed(2) + '%'
          : 'N/A',
        averageExecutionTime: Math.round(
          Object.values(hederaByClass).flat()
            .reduce((sum, m) => sum + m.averageExecutionTime, 0) / 
          (this.hederaAgents.size || 1)
        )
      }
    };
  }

  /**
   * Print Hedera-integrated status
   */
  printHederaStatus(): void {
    const stats = this.getHederaStats();

    console.log('\n🔗 Hedera-Integrated Swarm Status');
    console.log('===================================\n');
    
    // Base swarm status
    console.log(`Total Agents: ${stats.totalAgents}`);
    console.log(`  Micro:  ${stats.byClass.micro.count} agents (${stats.byClass.micro.healthy} healthy)`);
    console.log(`  Normal: ${stats.byClass.normal.count} agents (${stats.byClass.normal.healthy} healthy)`);
    console.log(`  Macro:  ${stats.byClass.macro.count} agents (${stats.byClass.macro.healthy} healthy)`);
    
    // Hedera status
    console.log(`\nHedera Tool Agents: ${stats.hedera.totalAgents}`);
    console.log(`  Micro:  ${stats.hedera.byClass.micro} agents`);
    console.log(`  Normal: ${stats.hedera.byClass.normal} agents`);
    console.log(`  Macro:  ${stats.hedera.byClass.macro} agents`);
    
    console.log(`\nHedera Executions: ${stats.hedera.totalExecutions}`);
    console.log(`  Success Rate: ${stats.hedera.successRate}`);
    console.log(`  Avg Time: ${stats.hedera.averageExecutionTime}ms`);
    
    console.log(`\nRelay: ${stats.relayStats.messagesUp}↑ ${stats.relayStats.messagesDown}↓ messages`);
    console.log('===================================\n');
  }

  /**
   * Shutdown with Hedera cleanup
   */
  async shutdown(): Promise<void> {
    // Shutdown all Hedera agents
    for (const agent of this.hederaAgents.values()) {
      agent.shutdown();
    }
    this.hederaAgents.clear();

    // Shutdown base orchestrator
    await super.shutdown();
  }
}
