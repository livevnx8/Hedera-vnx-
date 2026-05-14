/**
 * Agent Factory
 * Smart contract interface for spawning autonomous agents
 * 
 * Responsibilities:
 * - Deploy agent factory contract on Hedera
 * - Spawn new agents with capabilities and stake
 * - Manage agent lifecycle (register, stake, slash, remove)
 * - Anti-sybil through VERA staking
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import { veraToken } from '../token/veraToken.js';
import {
  Client,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractCallQuery,
  Hbar,
  ContractFunctionParameters,
} from '@hashgraph/sdk';

export interface AgentCapabilities {
  skills: string[];           // e.g., ['defi', 'carbon', 'analysis']
  computeProfile: 'cpu' | 'gpu' | 'memory';
  maxTasks: number;           // Concurrent task limit
  sla: 'basic' | 'pro' | 'enterprise';
}

export interface AgentIdentity {
  agentId: string;
  accountId: string;
  publicKey: string;
  capabilities: AgentCapabilities;
  stakeAmount: number;          // VERA staked
  reputation: number;         // 0-1 initial reputation
  status: 'probation' | 'active' | 'slashed' | 'retired';
  createdAt: number;
  factoryContractId: string;
}

export interface SpawnRequest {
  ownerAccount: string;
  capabilities: AgentCapabilities;
  stakeAmount: number;
  metadata?: Record<string, unknown>;
}

export class AgentFactory extends EventEmitter {
  private client: Client;
  private factoryContractId: string | null = null;
  private agents = new Map<string, AgentIdentity>();
  private minStake = 100;      // Minimum VERA to spawn agent
  private probationTasks = 10; // Tasks before full activation

  constructor() {
    super();
    
    // Initialize Hedera client
    this.client = Client.forName(config.HEDERA_NETWORK || 'mainnet');
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      this.client.setOperator(
        config.HEDERA_OPERATOR_ACCOUNT_ID,
        config.HEDERA_OPERATOR_PRIVATE_KEY
      );
    }

    this.factoryContractId = config.AGENT_FACTORY_CONTRACT_ID || null;
  }

  /**
   * Deploy agent factory contract (one-time operation)
   */
  async deployFactory(): Promise<string> {
    if (this.factoryContractId) {
      throw new Error(`Factory already deployed: ${this.factoryContractId}`);
    }

    logger.info('AgentFactory', { message: 'Deploying agent factory contract' });

    try {
      // In production, this would deploy a Solidity contract
      // For now, simulate with a mock contract ID
      this.factoryContractId = `0.0.${Math.floor(Math.random() * 10000000) + 1000000}`;

      this.emit('factory_deployed', { contractId: this.factoryContractId });

      logger.info('AgentFactory', {
        message: 'Factory deployed',
        contractId: this.factoryContractId,
      });

      return this.factoryContractId;
    } catch (error) {
      logger.error('AgentFactory', {
        message: 'Factory deployment failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Spawn a new agent
   */
  async spawnAgent(request: SpawnRequest): Promise<AgentIdentity> {
    if (!this.factoryContractId) {
      throw new Error('Factory not deployed');
    }

    if (request.stakeAmount < this.minStake) {
      throw new Error(`Minimum stake is ${this.minStake} VERA`);
    }

    logger.info('AgentFactory', {
      message: 'Spawning agent',
      owner: request.ownerAccount,
      stake: request.stakeAmount,
      skills: request.capabilities.skills,
    });

    try {
      // 1. Collect stake from owner
      await this.collectStake(request.ownerAccount, request.stakeAmount);

      // 2. Generate agent identity
      const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const agentAccount = `0.0.${Math.floor(Math.random() * 10000000) + 1000000}`;
      const publicKey = `0x${Buffer.from(agentId).toString('hex').slice(0, 64)}`;

      // 3. Create agent identity
      const agent: AgentIdentity = {
        agentId,
        accountId: agentAccount,
        publicKey,
        capabilities: request.capabilities,
        stakeAmount: request.stakeAmount,
        reputation: 0.5, // Start with neutral reputation
        status: 'probation',
        createdAt: Date.now(),
        factoryContractId: this.factoryContractId,
      };

      this.agents.set(agentId, agent);

      // 4. Register to HCS registry
      await this.registerToHcs(agent);

      // 5. Emit event
      this.emit('agent_spawned', agent);

      logger.info('AgentFactory', {
        message: 'Agent spawned',
        agentId,
        accountId: agentAccount,
        status: 'probation',
      });

      return agent;
    } catch (error) {
      logger.error('AgentFactory', {
        message: 'Agent spawn failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Activate agent from probation to full status
   */
  async activateAgent(agentId: string, completedTasks: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.status !== 'probation') {
      throw new Error(`Agent ${agentId} is not in probation`);
    }

    if (completedTasks < this.probationTasks) {
      logger.warn('AgentFactory', {
        message: 'Agent not ready for activation',
        agentId,
        completedTasks,
        required: this.probationTasks,
      });
      return;
    }

    agent.status = 'active';
    agent.reputation = 0.7; // Good standing after probation

    this.agents.set(agentId, agent);

    this.emit('agent_activated', agent);

    logger.info('AgentFactory', {
      message: 'Agent activated',
      agentId,
      reputation: agent.reputation,
    });
  }

  /**
   * Slash agent stake for bad behavior
   */
  async slashAgent(agentId: string, reason: string, percentage: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const slashAmount = agent.stakeAmount * (percentage / 100);
    agent.stakeAmount -= slashAmount;
    agent.reputation = Math.max(0, agent.reputation - (percentage / 100));

    if (agent.reputation < 0.2 || agent.stakeAmount < this.minStake * 0.5) {
      agent.status = 'slashed';
    }

    this.agents.set(agentId, agent);

    // Transfer slashed amount to treasury
    await this.transferToTreasury(agent.accountId, slashAmount);

    this.emit('agent_slashed', { agentId, reason, amount: slashAmount });

    logger.warn('AgentFactory', {
      message: 'Agent slashed',
      agentId,
      reason,
      amount: slashAmount.toFixed(2),
      remainingStake: agent.stakeAmount.toFixed(2),
    });
  }

  /**
   * Retire an agent (voluntary exit)
   */
  async retireAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.status === 'slashed') {
      throw new Error('Cannot retire slashed agent');
    }

    // Return stake minus fee
    const returnAmount = agent.stakeAmount * 0.95; // 5% exit fee
    agent.stakeAmount = 0;
    agent.status = 'retired';

    this.agents.set(agentId, agent);

    await this.returnStake(agent.accountId, returnAmount);

    this.emit('agent_retired', agent);

    logger.info('AgentFactory', {
      message: 'Agent retired',
      agentId,
      returned: returnAmount.toFixed(2),
    });
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentIdentity | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentIdentity[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get active agents
   */
  getActiveAgents(): AgentIdentity[] {
    return this.getAllAgents().filter(a => a.status === 'active');
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(skill: string): AgentIdentity[] {
    return this.getActiveAgents()
      .filter(a => a.capabilities.skills.includes(skill));
  }

  /**
   * Get factory statistics
   */
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    probationAgents: number;
    slashedAgents: number;
    totalStaked: number;
    factoryContractId: string | null;
    minStake: number;
  } {
    const agents = this.getAllAgents();
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      probationAgents: agents.filter(a => a.status === 'probation').length,
      slashedAgents: agents.filter(a => a.status === 'slashed').length,
      totalStaked: agents.reduce((sum, a) => sum + a.stakeAmount, 0),
      factoryContractId: this.factoryContractId,
      minStake: this.minStake,
    };
  }

  /**
   * Collect stake from agent owner
   */
  private async collectStake(ownerAccount: string, amount: number): Promise<void> {
    // In production: use VERA token contract to transfer stake
    // For now, simulate
    logger.debug('AgentFactory', {
      message: 'Stake collected',
      owner: ownerAccount,
      amount,
    });
  }

  /**
   * Return stake to agent owner
   */
  private async returnStake(ownerAccount: string, amount: number): Promise<void> {
    // In production: transfer VERA back to owner
    logger.debug('AgentFactory', {
      message: 'Stake returned',
      owner: ownerAccount,
      amount,
    });
  }

  /**
   * Transfer slashed amount to treasury
   */
  private async transferToTreasury(fromAccount: string, amount: number): Promise<void> {
    // In production: transfer to treasury account
    logger.debug('AgentFactory', {
      message: 'Slashed amount to treasury',
      from: fromAccount,
      amount,
    });
  }

  /**
   * Register agent to HCS
   */
  private async registerToHcs(agent: AgentIdentity): Promise<void> {
    // In production: submit to registry topic
    logger.debug('AgentFactory', {
      message: 'Agent registered to HCS',
      agentId: agent.agentId,
    });
  }
}

// Singleton
export const agentFactory = new AgentFactory();
export default agentFactory;
