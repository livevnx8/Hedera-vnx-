#!/usr/bin/env node
/**
 * Vera Master Brain v1.0
 * Central coordination system for Hedera Agentic AI
 * 
 * Coordinates workflows across the Lattice Nervous System
 * Leverages external tools through HCS-based communication
 */

import { 
  Client,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  PrivateKey
} from '@hashgraph/sdk';
import EventEmitter from 'events';
import dotenv from 'dotenv';

dotenv.config();

// Import the topic manager
import { VeraTopicManager, LATTICE_TOPICS } from './vera-topic-manager.mjs';

class VeraMasterBrain extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.operatorId = null;
    this.topicManager = null;
    this.activeAgents = new Map();
    this.workflows = new Map();
    this.externalTools = new Map();
    this.isRunning = false;
  }

  async initialize(network = 'mainnet') {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing credentials');
    }

    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    let privateKey;
    if (operatorKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(operatorKey);
      } catch {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      }
    } else {
      privateKey = PrivateKey.fromString(operatorKey);
    }

    this.client.setOperator(operatorId, privateKey);
    this.operatorId = operatorId;

    // Initialize topic manager
    this.topicManager = new VeraTopicManager();
    await this.topicManager.initialize(network);

    // Verify all topics exist
    const stats = await this.topicManager.getTopicStats();
    if (stats.missing > 0) {
      console.warn(`⚠️ ${stats.missing} topics missing - some features may be limited`);
    }

    // Register self as master agent
    this.activeAgents.set('master_brain', {
      id: operatorId,
      role: 'coordinator',
      status: 'active',
      joinedAt: Date.now()
    });

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧠 VERA MASTER BRAIN v1.0                                     ║
║  Central Nervous System for Hedera Agentic AI                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Role: Central Coordinator & Workflow Orchestrator             ║
║  Identity: ${operatorId}                        ║
║  Network: ${network.toUpperCase().padEnd(20)}                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Active Agents: 1 (Master Brain)                              ║
║  Topic Status: ${stats.exists}/${stats.total} topics available               ║
╠═══════════════════════════════════════════════════════════════╣
║  Capabilities:                                                 ║
║     • Multi-agent coordination                                  ║
║     • Advanced workflow orchestration                           ║
║     • External tool integration                                 ║
║     • Sensory-motor processing                                  ║
║     • Memory management                                         ║
║     • Learning & adaptation                                       ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // ============================================
  // AGENT REGISTRY & COORDINATION
  // ============================================

  async registerAgent(agentId, role, capabilities = []) {
    const agent = {
      id: agentId,
      role,
      capabilities,
      status: 'active',
      joinedAt: Date.now(),
      lastHeartbeat: Date.now()
    };

    this.activeAgents.set(agentId, agent);

    // Log to agent registry topic
    await this.publishToTopic(LATTICE_TOPICS.AGENT_REGISTRY.id, {
      type: 'agent_registration',
      agent,
      timestamp: Date.now()
    });

    this.emit('agent_registered', agent);
    console.log(`✅ Agent registered: ${agentId} (${role})`);
    
    return agent;
  }

  async heartbeat(agentId) {
    if (this.activeAgents.has(agentId)) {
      const agent = this.activeAgents.get(agentId);
      agent.lastHeartbeat = Date.now();
      this.activeAgents.set(agentId, agent);
    }
  }

  getActiveAgents() {
    const now = Date.now();
    return Array.from(this.activeAgents.entries())
      .filter(([_, agent]) => now - agent.lastHeartbeat < 60000) // Active within last minute
      .map(([_, agent]) => agent);
  }

  // ============================================
  // WORKFLOW ORCHESTRATION
  // ============================================

  async createWorkflow(name, steps, options = {}) {
    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow = {
      id: workflowId,
      name,
      steps: steps.map((step, index) => ({
        id: `step-${index}`,
        ...step,
        status: 'pending',
        startedAt: null,
        completedAt: null
      })),
      status: 'created',
      createdAt: Date.now(),
      options,
      results: []
    };

    this.workflows.set(workflowId, workflow);

    // Log to workflow orchestration topic
    await this.publishToTopic(LATTICE_TOPICS.WORKFLOW_ORCHESTRATION.id, {
      type: 'workflow_created',
      workflow: { id: workflowId, name, stepCount: steps.length },
      timestamp: Date.now()
    });

    this.emit('workflow_created', workflow);
    console.log(`🔄 Workflow created: ${name} (${workflowId})`);
    
    return workflowId;
  }

  async executeWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    workflow.status = 'running';
    
    console.log(`\n🚀 Executing workflow: ${workflow.name}`);
    console.log(`   Steps: ${workflow.steps.length}`);

    for (const step of workflow.steps) {
      try {
        step.status = 'running';
        step.startedAt = Date.now();

        console.log(`\n  ▶️ Step: ${step.name || step.id}`);
        
        // Execute step based on type
        const result = await this.executeStep(step);
        
        step.status = 'completed';
        step.completedAt = Date.now();
        step.result = result;

        workflow.results.push({
          stepId: step.id,
          result,
          timestamp: Date.now()
        });

        // Log progress
        await this.publishToTopic(LATTICE_TOPICS.WORKFLOW_ORCHESTRATION.id, {
          type: 'workflow_step_completed',
          workflowId,
          stepId: step.id,
          timestamp: Date.now()
        });

      } catch (error) {
        step.status = 'failed';
        step.error = error.message;
        
        console.error(`  ❌ Step failed: ${error.message}`);
        
        await this.publishToTopic(LATTICE_TOPICS.WORKFLOW_ORCHESTRATION.id, {
          type: 'workflow_step_failed',
          workflowId,
          stepId: step.id,
          error: error.message,
          timestamp: Date.now()
        });

        if (!workflow.options.continueOnError) {
          workflow.status = 'failed';
          break;
        }
      }
    }

    workflow.status = workflow.status === 'failed' ? 'failed' : 'completed';
    workflow.completedAt = Date.now();

    console.log(`\n✅ Workflow ${workflowId} ${workflow.status}`);

    await this.publishToTopic(LATTICE_TOPICS.WORKFLOW_ORCHESTRATION.id, {
      type: 'workflow_completed',
      workflowId,
      status: workflow.status,
      timestamp: Date.now()
    });

    return workflow;
  }

  async executeStep(step) {
    switch(step.type) {
      case 'hedera_transaction':
        // Execute Hedera transaction
        return await this.executeHederaTransaction(step.params);
      
      case 'external_tool':
        // Call external tool
        return await this.callExternalTool(step.tool, step.params);
      
      case 'agent_task':
        // Delegate to agent
        return await this.delegateToAgent(step.agentId, step.task);
      
      case 'condition':
        // Evaluate condition
        return await this.evaluateCondition(step.condition, step.params);
      
      case 'memory_read':
        // Read from memory
        return await this.readFromMemory(step.memoryType, step.key);
      
      case 'memory_write':
        // Write to memory
        return await this.writeToMemory(step.memoryType, step.key, step.value);
      
      default:
        return { status: 'unknown_step_type', step };
    }
  }

  // ============================================
  // EXTERNAL TOOL INTEGRATION
  // ============================================

  registerExternalTool(name, handler, capabilities = []) {
    this.externalTools.set(name, {
      name,
      handler,
      capabilities,
      registeredAt: Date.now()
    });

    console.log(`🔧 Tool registered: ${name}`);
  }

  async callExternalTool(toolName, params) {
    const tool = this.externalTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    // Log tool command
    await this.publishToTopic(LATTICE_TOPICS.TOOL_COMMANDS.id, {
      type: 'tool_invocation',
      tool: toolName,
      params,
      timestamp: Date.now()
    });

    try {
      const result = await tool.handler(params);
      
      // Log tool response
      await this.publishToTopic(LATTICE_TOPICS.TOOL_RESPONSES.id, {
        type: 'tool_response',
        tool: toolName,
        result: typeof result === 'object' ? result : { value: result },
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      await this.publishToTopic(LATTICE_TOPICS.TOOL_RESPONSES.id, {
        type: 'tool_error',
        tool: toolName,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  // ============================================
  // MEMORY MANAGEMENT
  // ============================================

  async writeToMemory(memoryType, key, value) {
    let topicId;
    
    switch(memoryType) {
      case 'short_term':
        topicId = LATTICE_TOPICS.SHORT_TERM_MEMORY.id;
        break;
      case 'long_term':
        topicId = LATTICE_TOPICS.LONG_TERM_MEMORY.id;
        break;
      case 'episodic':
        topicId = LATTICE_TOPICS.EPISODIC_MEMORY.id;
        break;
      default:
        throw new Error(`Unknown memory type: ${memoryType}`);
    }

    await this.publishToTopic(topicId, {
      type: 'memory_write',
      key,
      value,
      memoryType,
      timestamp: Date.now()
    });

    return { success: true, stored: true };
  }

  async readFromMemory(memoryType, key) {
    // In a real implementation, this would query the mirror node
    // For now, return a placeholder
    return { key, memoryType, data: null, note: 'Query mirror node for actual data' };
  }

  // ============================================
  // SENSORY-MOTOR PROCESSING
  // ============================================

  async processSensoryInput(inputType, data) {
    // Log sensory input
    await this.publishToTopic(LATTICE_TOPICS.SENSORY_INPUT.id, {
      type: 'sensory_data',
      inputType,
      data,
      timestamp: Date.now()
    });

    // Process based on type
    switch(inputType) {
      case 'hashscan_account':
        return await this.processAccountUpdate(data);
      case 'hashscan_token':
        return await this.processTokenUpdate(data);
      case 'user_command':
        return await this.processUserCommand(data);
      default:
        return { processed: true, inputType };
    }
  }

  async processAccountUpdate(data) {
    // Check for significant changes
    if (data.balanceChange > 100000000) { // > 1 HBAR
      await this.publishToTopic(LATTICE_TOPICS.REFLEX_ACTIONS.id, {
        type: 'significant_balance_change',
        accountId: data.accountId,
        change: data.balanceChange,
        action: 'log_and_alert',
        timestamp: Date.now()
      });
    }

    return { processed: true, alert: data.balanceChange > 100000000 };
  }

  async processTokenUpdate(data) {
    return { processed: true, tokenId: data.tokenId };
  }

  async processUserCommand(command) {
    // Trigger appropriate workflow based on command
    this.emit('user_command', command);
    return { processed: true, command };
  }

  async executeMotorAction(actionType, params) {
    await this.publishToTopic(LATTICE_TOPICS.MOTOR_OUTPUT.id, {
      type: 'motor_action',
      actionType,
      params,
      timestamp: Date.now()
    });

    return { executed: true, actionType };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  async publishToTopic(topicId, message) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify(message));
      
      await tx.execute(this.client);
    } catch (e) {
      console.error(`Failed to publish to ${topicId}: ${e.message}`);
      // Don't throw - allow system to continue
    }
  }

  getSystemStatus() {
    return {
      isRunning: this.isRunning,
      agentCount: this.activeAgents.size,
      workflowCount: this.workflows.size,
      toolCount: this.externalTools.size,
      masterId: this.operatorId
    };
  }

  // Start the master brain
  async start() {
    this.isRunning = true;
    
    // Start heartbeat loop
    this.heartbeatInterval = setInterval(() => {
      this.publishToTopic(LATTICE_TOPICS.MASTER_COORDINATION.id, {
        type: 'master_heartbeat',
        agentCount: this.activeAgents.size,
        timestamp: Date.now()
      });
    }, 30000); // Every 30 seconds

    console.log('\n🧠 Master Brain is now running');
    console.log('   Coordinating agents and workflows');
    console.log('   Press Ctrl+C to stop\n');
  }

  // Stop the master brain
  stop() {
    this.isRunning = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.client?.close();
    console.log('\n👋 Master Brain stopped');
  }
}

// Export
export { VeraMasterBrain };

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = new VeraMasterBrain();
  
  brain.initialize().then(() => {
    brain.start();
    
    // Register some example tools
    brain.registerExternalTool('hashscan_check', async (params) => {
      return { accountId: params.accountId, status: 'checked' };
    });

    brain.registerExternalTool('token_swap', async (params) => {
      return { from: params.from, to: params.to, amount: params.amount, status: 'simulated' };
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      brain.stop();
      process.exit(0);
    });
  }).catch(console.error);
}
