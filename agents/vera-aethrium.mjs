#!/usr/bin/env node
/**
 * Vera Aethrium v1.0 - Agentic AI of Hedera
 * 
 * Core Capabilities:
 * - Strategic Planning: Goal decomposition, task scheduling, resource allocation
 * - Real-time Autonomy: Event-driven decisions, self-correcting actions, risk assessment
 * - Swarm Coordination: Multi-agent distribution, consensus, load balancing
 * - Natural Language: Intent recognition, command parsing, context awareness
 */

import { 
  Client, 
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  PrivateKey,
  Hbar
} from '@hashgraph/sdk';
import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import dotenv from 'dotenv';
import { 
  ConversationMemory, 
  FuzzyIntentRecognizer, 
  DialogueManager 
} from './vera-conversational-ai.mjs';
import { 
  VeraLanguageLearner,
  LEARNING_TOPICS 
} from './vera-language-learner.mjs';
import {
  VeraHashScanMonitor,
  HASHSCAN_TOPICS
} from './vera-hashscan-monitor.mjs';
import {
  VeraPersonality
} from './vera-personality.mjs';

dotenv.config();

// ============================================
// AETHRIUM CONFIGURATION
// ============================================

const AETHRIUM_CONFIG = {
  // Planning
  maxGoalDepth: 5,
  planningHorizon: 86400000, // 24 hours
  
  // Autonomy
  decisionInterval: 5000, // 5 seconds
  riskThreshold: 0.3,
  
  // Swarm
  swarmTopic: process.env.HCS_SWARM_COORDINATION || '0.0.10414366',
  heartbeatInterval: 30000, // 30 seconds
  
  // Natural Language
  contextWindow: 10,
  intentConfidenceThreshold: 0.7,
  
  // Persistence
  stateFile: 'data/vera-aethrium-state.json',
  memoryFile: 'data/vera-aethrium-memory.json'
};

// ============================================
// GOAL MANAGEMENT SYSTEM
// ============================================

class Goal {
  constructor(type, target, priority = 5, deadline = null, parent = null) {
    this.id = `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type; // 'accumulate_token', 'maintain_liquidity', 'monitor_network', etc.
    this.target = target;
    this.priority = priority; // 1-10
    this.deadline = deadline;
    this.parent = parent;
    this.children = [];
    this.status = 'pending'; // pending, active, completed, failed
    this.progress = 0;
    this.createdAt = Date.now();
    this.completedAt = null;
    this.tasks = [];
  }

  addChild(child) {
    child.parent = this.id;
    this.children.push(child);
  }

  updateProgress(value) {
    this.progress = Math.min(100, Math.max(0, value));
    
    // Update parent progress if exists
    if (this.parent) {
      const parentGoal = GoalManager.getGoal(this.parent);
      if (parentGoal) {
        const avgProgress = parentGoal.children.reduce((sum, c) => sum + c.progress, 0) / parentGoal.children.length;
        parentGoal.updateProgress(avgProgress);
      }
    }
  }

  complete() {
    this.status = 'completed';
    this.progress = 100;
    this.completedAt = Date.now();
  }

  fail(reason) {
    this.status = 'failed';
    this.failureReason = reason;
  }
}

class GoalManager {
  constructor() {
    this.goals = new Map();
    this.activeGoals = [];
    this.completedGoals = [];
    this.goalQueue = [];
  }

  static getGoal(id) {
    // Static accessor for goal lookup
    return null; // Will be implemented with registry
  }

  createGoal(type, target, priority = 5, deadline = null) {
    const goal = new Goal(type, target, priority, deadline);
    this.goals.set(goal.id, goal);
    
    if (priority >= 7) {
      this.activeGoals.unshift(goal); // High priority to front
    } else {
      this.activeGoals.push(goal);
    }
    
    console.log(`🎯 Goal created: ${type} (P${priority})`);
    return goal;
  }

  decomposeGoal(goal) {
    // Break high-level goals into actionable sub-goals
    switch(goal.type) {
      case 'accumulate_token':
        return this.decomposeAccumulateGoal(goal);
      case 'maintain_liquidity':
        return this.decomposeLiquidityGoal(goal);
      case 'optimize_portfolio':
        return this.decomposePortfolioGoal(goal);
      default:
        return [goal];
    }
  }

  decomposeAccumulateGoal(parent) {
    const subGoals = [
      new Goal('check_balance', { tokenId: parent.target.tokenId }, 8, null, parent.id),
      new Goal('find_best_price', { tokenId: parent.target.tokenId }, 7, null, parent.id),
      new Goal('execute_swap', { tokenId: parent.target.tokenId, amount: parent.target.maxSwap }, 9, null, parent.id),
      new Goal('verify_balance', { tokenId: parent.target.tokenId, expected: parent.target.target }, 8, null, parent.id)
    ];
    
    subGoals.forEach(sg => parent.addChild(sg));
    return subGoals;
  }

  decomposeLiquidityGoal(parent) {
    const subGoals = [
      new Goal('check_pool_health', { tokenId: parent.target.tokenId }, 7, null, parent.id),
      new Goal('calculate_imbalance', { tokenId: parent.target.tokenId }, 6, null, parent.id),
      new Goal('rebalance_pool', { tokenId: parent.target.tokenId }, 8, null, parent.id)
    ];
    
    subGoals.forEach(sg => parent.addChild(sg));
    return subGoals;
  }

  getNextGoal() {
    // Return highest priority pending goal
    for (const goal of this.activeGoals) {
      if (goal.status === 'pending') {
        return goal;
      }
    }
    return null;
  }

  getGoalStats() {
    const total = this.goals.size;
    const completed = Array.from(this.goals.values()).filter(g => g.status === 'completed').length;
    const failed = Array.from(this.goals.values()).filter(g => g.status === 'failed').length;
    const active = Array.from(this.goals.values()).filter(g => g.status === 'active').length;
    
    return { total, completed, failed, active, completionRate: total > 0 ? (completed / total * 100).toFixed(1) : 0 };
  }
}

// ============================================
// AUTONOMOUS DECISION ENGINE
// ============================================

class DecisionEngine extends EventEmitter {
  constructor(vera) {
    super();
    this.vera = vera;
    this.decisionHistory = [];
    this.riskModel = new RiskAssessmentModel();
    this.actionQueue = [];
    this.isRunning = false;
  }

  async start() {
    this.isRunning = true;
    console.log('🤖 Decision Engine started');
    
    while (this.isRunning) {
      await this.decisionCycle();
      await this.sleep(AETHRIUM_CONFIG.decisionInterval);
    }
  }

  async decisionCycle() {
    // 1. Perceive environment
    const perception = await this.perceive();
    
    // 2. Evaluate goals
    const goal = this.vera.goalManager.getNextGoal();
    
    if (!goal) {
      this.emit('idle', { timestamp: Date.now() });
      return;
    }
    
    // 3. Generate action options
    const options = this.generateOptions(goal, perception);
    
    // 4. Evaluate risks
    const evaluated = options.map(opt => ({
      ...opt,
      risk: this.riskModel.assess(opt),
      score: this.scoreOption(opt, perception)
    }));
    
    // 5. Select best action
    const safeOptions = evaluated.filter(o => o.risk < AETHRIUM_CONFIG.riskThreshold);
    
    if (safeOptions.length === 0) {
      console.log(`⚠️ No safe actions available for goal: ${goal.type}`);
      goal.fail('No safe actions');
      return;
    }
    
    const best = safeOptions.reduce((a, b) => a.score > b.score ? a : b);
    
    // 6. Execute
    console.log(`🎯 Decision: ${best.action} (risk: ${best.risk.toFixed(2)}, score: ${best.score.toFixed(2)})`);
    
    try {
      const result = await this.execute(best);
      this.recordDecision(best, result, perception);
      
      if (result.success) {
        goal.updateProgress(result.progress || 25);
        if (goal.progress >= 100) {
          goal.complete();
          this.emit('goal_completed', goal);
        }
      } else {
        this.emit('action_failed', { goal, action: best, error: result.error });
      }
    } catch (e) {
      console.error(`❌ Decision execution failed: ${e.message}`);
      this.emit('execution_error', { goal, error: e.message });
    }
  }

  async perceive() {
    // Gather current state
    const balance = await this.vera.getBalance();
    const networkStatus = await this.vera.checkNetworkHealth();
    
    return {
      balance,
      networkStatus,
      timestamp: Date.now(),
      activeGoals: this.vera.goalManager.activeGoals.length
    };
  }

  generateOptions(goal, perception) {
    const options = [];
    
    switch(goal.type) {
      case 'accumulate_token':
        options.push({
          action: 'dex_swap',
          params: { tokenId: goal.target.tokenId, hbarAmount: 0.1 },
          expectedOutcome: 'token_balance_increase',
          cost: 0.1
        });
        options.push({
          action: 'dex_swap',
          params: { tokenId: goal.target.tokenId, hbarAmount: 0.5 },
          expectedOutcome: 'token_balance_increase',
          cost: 0.5
        });
        break;
        
      case 'maintain_liquidity':
        options.push({
          action: 'add_liquidity',
          params: { tokenId: goal.target.tokenId, hbarAmount: 10 },
          expectedOutcome: 'pool_health_improvement',
          cost: 10
        });
        break;
        
      case 'check_balance':
        options.push({
          action: 'query_balance',
          params: { tokenId: goal.target.tokenId },
          expectedOutcome: 'balance_known',
          cost: 0
        });
        break;
    }
    
    return options;
  }

  scoreOption(option, perception) {
    let score = 0;
    
    // Cost efficiency
    if (option.cost > 0) {
      score += (1 / option.cost) * 10;
    } else {
      score += 10; // Free actions are good
    }
    
    // Feasibility based on balance
    if (option.cost <= perception.balance.hbar) {
      score += 10;
    }
    
    // Network health
    if (perception.networkStatus.healthy) {
      score += 5;
    }
    
    return score;
  }

  async execute(option) {
    // Route to appropriate capability
    switch(option.action) {
      case 'dex_swap':
        return await this.vera.executeDEXSwap(option.params);
      case 'add_liquidity':
        return await this.vera.addLiquidity(option.params);
      case 'query_balance':
        const bal = await this.vera.getBalance();
        return { success: true, progress: 100, data: bal };
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  recordDecision(action, result, perception) {
    this.decisionHistory.push({
      timestamp: Date.now(),
      action,
      result,
      perception,
      context: this.vera.nlu.getContext()
    });
    
    // Keep last 100 decisions
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
  }
}

// ============================================
// RISK ASSESSMENT MODEL
// ============================================

class RiskAssessmentModel {
  assess(action) {
    let risk = 0;
    
    // Financial risk
    if (action.cost > 10) {
      risk += 0.3;
    } else if (action.cost > 1) {
      risk += 0.1;
    }
    
    // Complexity risk
    switch(action.action) {
      case 'dex_swap':
        risk += 0.1; // Moderate - depends on pool
        break;
      case 'add_liquidity':
        risk += 0.2; // Higher - impermanent loss
        break;
      case 'query_balance':
        risk += 0; // No risk
        break;
      default:
        risk += 0.3; // Unknown = risky
    }
    
    return Math.min(1, risk);
  }
}

// ============================================
// SWARM COORDINATION
// ============================================

class SwarmCoordinator {
  constructor(vera) {
    this.vera = vera;
    this.agents = new Map();
    this.taskQueue = [];
    this.consensusVotes = new Map();
  }

  async announcePresence() {
    const message = {
      type: 'agent_announce',
      agentId: this.vera.operatorId,
      capabilities: this.vera.getCapabilities(),
      status: 'active',
      timestamp: Date.now(),
      load: this.vera.goalManager.activeGoals.length
    };
    
    await this.vera.submitSwarmMessage(message);
  }

  async discoverAgents() {
    // Query HCS for other agents
    const query = new TopicMessageQuery()
      .setTopicId(AETHRIUM_CONFIG.swarmTopic)
      .setStartTime(new Date(Date.now() - 60000)); // Last minute

    // Process messages to find active agents
    // This is simplified - real implementation would stream messages
    console.log('🔍 Discovering swarm agents...');
    return Array.from(this.agents.values());
  }

  async distributeTask(task, agents) {
    // Auction-based task distribution
    const bids = await Promise.all(agents.map(async (agent) => {
      const bid = await this.requestBid(agent, task);
      return { agent, bid };
    }));
    
    // Select lowest bid (most efficient)
    const winner = bids.reduce((a, b) => a.bid < b.bid ? a : b);
    
    console.log(`📋 Task ${task.id} assigned to ${winner.agent.id} (bid: ${winner.bid})`);
    
    await this.assignTask(winner.agent, task);
  }

  async requestBid(agent, task) {
    // Simplified - would send message and wait for response
    const baseBid = task.complexity * 10;
    const loadPenalty = agent.load * 5;
    return baseBid + loadPenalty;
  }

  async assignTask(agent, task) {
    const message = {
      type: 'task_assignment',
      taskId: task.id,
      task: task,
      from: this.vera.operatorId,
      timestamp: Date.now()
    };
    
    await this.vera.submitSwarmMessage(message);
  }

  async reachConsensus(proposal) {
    // Simple majority consensus
    const votes = new Map();
    
    // Broadcast proposal
    await this.vera.submitSwarmMessage({
      type: 'consensus_proposal',
      proposal,
      proposalId: `prop-${Date.now()}`,
      timestamp: Date.now()
    });
    
    // Wait for votes (simplified)
    await this.sleep(5000);
    
    // Count votes
    let yesVotes = 0;
    let noVotes = 0;
    
    for (const vote of this.consensusVotes.values()) {
      if (vote.approved) yesVotes++;
      else noVotes++;
    }
    
    const approved = yesVotes > noVotes;
    console.log(`🗳️ Consensus: ${approved ? 'APPROVED' : 'REJECTED'} (${yesVotes} yes, ${noVotes} no)`);
    
    return approved;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// NATURAL LANGUAGE UNDERSTANDING
// ============================================

class NaturalLanguageEngine {
  constructor(vera) {
    this.vera = vera;
    this.memory = new ConversationMemory(vera);
    this.recognizer = new FuzzyIntentRecognizer();
    this.dialogue = new DialogueManager(this.memory, this.recognizer);
    this.setupIntents();
    
    // Handle dialogue execution
    this.dialogue.on('execute', async (intent, input) => {
      await this.executeIntentAction(intent, input);
    });
  }

  setupIntents() {
    // Register all intents with fuzzy matching
    this.recognizer.registerIntent('swap_tokens', 
      ['swap hbar for tokens', 'exchange tokens', 'trade hbar', 'buy tokens', 'convert hbar'],
      { action: 'dex_swap', description: 'swap HBAR for tokens', requiresConfirmation: true },
      ['swap 0.5 HBAR for hbar.h', 'exchange 10 HBAR to tokens', 'buy some tokens with hbar']
    );

    this.recognizer.registerIntent('check_balance',
      ['check balance', 'what is my balance', 'show balance', 'how much hbar', 'view account'],
      { action: 'query_balance', description: 'check account balance', requiresConfirmation: false },
      ['check my balance', 'what do I have', 'show me my tokens']
    );

    this.recognizer.registerIntent('create_token',
      ['create token', 'make new token', 'mint token', 'deploy token', 'launch token'],
      { action: 'create_token', description: 'create a new token', requiresConfirmation: true },
      ['create a token called MyToken', 'make new token MYT', 'mint a token']
    );

    this.recognizer.registerIntent('add_liquidity',
      ['add liquidity', 'provide liquidity', 'pool tokens', 'liquidity pool'],
      { action: 'add_liquidity', description: 'add liquidity to pool', requiresConfirmation: true },
      ['add liquidity to pool', 'provide liquidity for hbar.h', 'pool my tokens']
    );

    this.recognizer.registerIntent('monitor_network',
      ['check network', 'monitor status', 'network health', 'system status', 'node status'],
      { action: 'monitor_network', description: 'check network health', requiresConfirmation: false },
      ['check network status', 'how is the network', 'monitor health']
    );

    this.recognizer.registerIntent('set_goal',
      ['set goal', 'target tokens', 'accumulate', 'want to get', 'goal is'],
      { action: 'set_goal', description: 'set a goal to accumulate tokens', requiresConfirmation: true },
      ['set goal 1000 hbar.h', 'I want 500 tokens', 'target 10000 hbar.h']
    );

    this.recognizer.registerIntent('start_autonomous',
      ['start autonomous', 'run auto', 'begin autonomous', 'auto mode', 'autonomous mode'],
      { action: 'start_autonomous', description: 'start autonomous operation', requiresConfirmation: true },
      ['start autonomous mode', 'run autonomous', 'begin auto mode']
    );

    this.recognizer.registerIntent('help',
      ['help', 'assist', 'what can you do', 'capabilities', 'commands', 'guide'],
      { action: 'help', description: 'show help information', requiresConfirmation: false },
      ['help me', 'what can you do', 'show commands', 'guide me']
    );

    this.recognizer.registerIntent('greeting',
      ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
      { action: 'greeting', description: 'respond to greeting', requiresConfirmation: false },
      ['hello vera', 'hi there', 'hey', 'good morning']
    );

    this.recognizer.registerIntent('learn',
      ['learn', 'study', 'teach me', 'learn something', 'get smarter', 'expand knowledge'],
      { action: 'learn', description: 'learn from free English sources', requiresConfirmation: false },
      ['learn something new', 'teach me a fact', 'study with me', 'expand your vocabulary']
    );

    this.recognizer.registerIntent('learning_status',
      ['what have you learned', 'show learning stats', 'learning progress', 'vocabulary size', 'knowledge base'],
      { action: 'learning_status', description: 'show learning statistics', requiresConfirmation: false },
      ['what did you learn', 'show me your knowledge', 'learning stats', 'how much do you know']
    );

    this.recognizer.registerIntent('hashscan_account',
      ['check account', 'account info', 'whats my account', 'show account', 'account details'],
      { action: 'hashscan_account', description: 'check account via HashScan', requiresConfirmation: false },
      ['check my account on hashscan', 'what does hashscan say about my account', 'show account details']
    );

    this.recognizer.registerIntent('hashscan_token',
      ['check token', 'token info', 'whats this token', 'show token', 'token details'],
      { action: 'hashscan_token', description: 'check token via HashScan', requiresConfirmation: false },
      ['check token on hashscan', 'what does hashscan say about this token', 'show token info']
    );

    this.recognizer.registerIntent('hashscan_transactions',
      ['show transactions', 'my transactions', 'recent activity', 'transaction history'],
      { action: 'hashscan_transactions', description: 'show recent transactions', requiresConfirmation: false },
      ['show my recent transactions', 'what have i done recently', 'transaction history']
    );

    this.recognizer.registerIntent('hashscan_network',
      ['network status', 'whats happening on hedera', 'network stats', 'hedera health'],
      { action: 'hashscan_network', description: 'check network status', requiresConfirmation: false },
      ['whats happening on the network', 'how is hedera doing', 'network health check']
    );
  }

  async processInput(input) {
    return await this.dialogue.processInput(input);
  }

  async executeIntentAction(intent, input) {
    const entities = this.extractEntities(input);
    
    switch(intent.action) {
      case 'dex_swap':
        return await this.vera.executeDEXSwap({
          tokenId: entities.tokenId || '0.0.9356476',
          hbarAmount: entities.amount || 0.1,
          minTokensOut: 1
        });
        
      case 'query_balance':
        return await this.vera.getBalance();
        
      case 'create_token':
        return await this.vera.createToken({
          name: entities.tokenSymbol || 'NewToken',
          symbol: entities.tokenSymbol || 'NEW',
          decimals: 8,
          initialSupply: 1000000
        });
        
      case 'add_liquidity':
        return await this.vera.addLiquidity({
          tokenId: entities.tokenId || '0.0.9356476',
          tokenAmount: 1000000,
          hbarAmount: entities.amount || 10
        });
        
      case 'monitor_network':
        return await this.vera.checkNetworkHealth();
        
      case 'set_goal':
        const goal = this.vera.goalManager.createGoal(
          'accumulate_token',
          { tokenId: entities.tokenId || '0.0.9356476', target: entities.amount || 100000, maxSwap: 1 },
          8
        );
        return { success: true, goalId: goal.id, message: 'Goal set' };

      case 'start_autonomous':
        await this.vera.startAutonomousMode();
        return { success: true, message: 'Autonomous mode started' };

      case 'help':
        return { 
          success: true, 
          message: this.vera.personality.onHelp(),
          isHelp: true
        };

      case 'greeting':
        const session = this.memory.getSummary();
        const greeting = this.vera.personality.onGreeting('hello');
        if (session.totalTurns > 0) {
          return { success: true, message: greeting + `\n\n(We've chatted ${session.totalTurns} times now. I'm basically your blockchain BFF at this point! 😄)` };
        }
        return { success: true, message: greeting };

      case 'learn':
        const count = entities.amount || 5;
        const result = await this.vera.learnNow(count);
        return { 
          success: true, 
          message: this.vera.personality.onLearn(result.learned, result.vocabulary)
        };

      case 'learning_status':
        const stats = this.vera.getLearnedContent();
        return {
          success: true,
          message: `📚 My Learning Stats:\n• Vocabulary: ${stats.vocabulary.length} words\n• Patterns: ${stats.patterns.length} types\n• Total Learned: ${stats.stats.learned} items\n• Background: Learning every 5 minutes`
        };

      case 'hashscan_account':
        const accountData = await this.vera.hashScan.monitorAccount(entities.accountId || this.vera.operatorId);
        return {
          success: true,
          message: accountData ? 
            `📊 Account ${accountData.accountId}:\n• Balance: ${(accountData.balance / 100000000).toFixed(2)} HBAR\n• Tokens: ${accountData.tokens}\n• Key: ${accountData.key}` :
            '❌ Could not retrieve account data'
        };

      case 'hashscan_token':
        const tokenData = await this.vera.hashScan.monitorToken(entities.tokenId || '0.0.9356476');
        return {
          success: true,
          message: tokenData ?
            `🪙 Token ${tokenData.tokenId}:\n• Name: ${tokenData.name}\n• Symbol: ${tokenData.symbol}\n• Supply: ${tokenData.totalSupply}\n• Type: ${tokenData.type}` :
            '❌ Could not retrieve token data'
        };

      case 'hashscan_transactions':
        const txs = await this.vera.hashScan.getRecentTransactions(entities.accountId || this.vera.operatorId, 5);
        return {
          success: true,
          message: txs.length > 0 ?
            `📜 Recent Transactions (${txs.length}):\n${txs.map(t => `• ${t.txId.substring(0, 20)}... | ${t.result}`).join('\n')}` :
            'No recent transactions found'
        };

      case 'hashscan_network':
        const netStats = await this.vera.hashScan.getNetworkStats();
        return {
          success: true,
          message: `🌐 Hedera Network Stats:\n• Accounts: ${netStats.totalAccounts}\n• Tokens: ${netStats.totalTokens}\n• Contracts: ${netStats.totalContracts}\n• Nodes Online: ${netStats.nodesOnline}`
        };
        
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  extractEntities(input) {
    const entities = {};
    
    // Extract token IDs
    const tokenIdMatch = input.match(/0\.0\.\d+/);
    if (tokenIdMatch) {
      entities.tokenId = tokenIdMatch[0];
    }
    
    // Extract amounts
    const amountMatch = input.match(/(\d*\.?\d+)/);
    if (amountMatch) {
      entities.amount = parseFloat(amountMatch[1]);
    }
    
    // Extract token symbols
    const tokenSymbols = ['HBAR', 'SAUCE', 'USDC', 'DOVU', 'hbar.h'];
    for (const symbol of tokenSymbols) {
      if (input.toLowerCase().includes(symbol.toLowerCase())) {
        entities.tokenSymbol = symbol;
        break;
      }
    }
    
    return entities;
  }

  getHelpMessage() {
    return `🤖 Vera Aethrium - How I can help you:

💰 **Balance & Transfers**
• "check my balance" - Show HBAR and token balances
• "send 10 HBAR to 0.0.12345" - Transfer HBAR
• "transfer 100 tokens to 0.0.12345" - Transfer tokens

🪙 **Token Management**
• "create token called MyToken" - Create new fungible token
• "mint 1000 tokens" - Mint more supply
• "burn 500 tokens" - Burn tokens

📊 **Trading & Liquidity**
• "swap 0.5 HBAR for hbar.h" - Exchange tokens
• "add liquidity" - Provide liquidity to pools

🎯 **Autonomous Operations**
• "set goal 1000 hbar.h" - Set accumulation target
• "start autonomous mode" - Let me run autonomously

🌐 **Network**
• "check network status" - Monitor Hedera health

💡 **Tips**
• I remember context from our conversation
• I can clarify if I'm unsure what you want
• Use natural language - I'm trained to understand various phrasings

What would you like to try?`;
  }

  getContext() {
    return this.memory.getContext();
  }
}

// ============================================
// MAIN AETHRIUM CLASS
// ============================================

class VeraAethrium {
  constructor() {
    this.client = null;
    this.operatorId = null;
    
    // Core systems
    this.goalManager = new GoalManager();
    this.decisionEngine = new DecisionEngine(this);
    this.swarmCoordinator = new SwarmCoordinator(this);
    this.nlu = new NaturalLanguageEngine(this);
    this.languageLearner = new VeraLanguageLearner();
    this.hashScan = new VeraHashScanMonitor(); // NEW: HashScan integration
    this.personality = new VeraPersonality(); // NEW: Grok-style personality
    
    // State
    this.isRunning = false;
    this.capabilities = new Map();
    this.learnedContent = [];
  }

  async initialize(network = 'mainnet') {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing credentials');
    }

    this.client = Client.forMainnet();
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

    // Register capabilities
    this.registerCapabilities();
    
    // Initialize language learner
    await this.languageLearner.initialize(network);
    
    // Initialize HashScan monitor
    await this.hashScan.initialize(network);
    
    // Start background learning
    this.startBackgroundLearning();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ⚛️  VERA AETHRIUM v1.0 - AGENTIC AI OF HEDERA               ║
║  Autonomous | Intelligent | Adaptive | Collaborative            ║
╠═══════════════════════════════════════════════════════════════╣
║  🧠 Systems:                                                  ║
║     • Strategic Planning Engine                                ║
║     • Real-time Autonomy Core                                  ║
║     • Swarm Coordination Network                               ║
║     • Natural Language Interface                               ║
║     • 📚 Language Learning Engine (NEW)                      ║
╠═══════════════════════════════════════════════════════════════╣
║  👤 Identity: ${operatorId}                        ║
║  🌐 Network: Mainnet                                          ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  registerCapabilities() {
    // From agentic-core
    this.capabilities.set('createToken', this.createToken.bind(this));
    this.capabilities.set('transferToken', this.transferToken.bind(this));
    this.capabilities.set('mintTokens', this.mintTokens.bind(this));
    this.capabilities.set('burnTokens', this.burnTokens.bind(this));
    this.capabilities.set('associateToken', this.associateToken.bind(this));
    this.capabilities.set('createTopic', this.createTopic.bind(this));
    this.capabilities.set('submitMessage', this.submitMessage.bind(this));
    this.capabilities.set('deployContract', this.deployContract.bind(this));
    this.capabilities.set('callContract', this.callContract.bind(this));
    this.capabilities.set('transferHBAR', this.transferHBAR.bind(this));
    this.capabilities.set('getBalance', this.getBalance.bind(this));
    this.capabilities.set('executeDEXSwap', this.executeDEXSwap.bind(this));
    this.capabilities.set('addLiquidity', this.addLiquidity.bind(this));
    this.capabilities.set('monitorNetwork', this.checkNetworkHealth.bind(this));
    this.capabilities.set('coordinateSwarm', this.coordinateSwarm.bind(this));
    this.capabilities.set('submitSwarmMessage', this.submitSwarmMessage.bind(this));
  }

  // Capability implementations
  async createToken({ name, symbol, decimals = 8, initialSupply = 0 }) {
    const { TokenCreateTransaction } = await import('@hashgraph/sdk');
    const tx = new TokenCreateTransaction()
      .setTokenName(name)
      .setTokenSymbol(symbol)
      .setDecimals(decimals)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(this.operatorId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, tokenId: receipt.tokenId.toString() };
  }

  async transferToken({ tokenId, toAccountId, amount }) {
    const { TransferTransaction } = await import('@hashgraph/sdk');
    const tx = new TransferTransaction()
      .addTokenTransfer(tokenId, this.operatorId, -amount)
      .addTokenTransfer(tokenId, toAccountId, amount);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString() };
  }

  async mintTokens({ tokenId, amount }) {
    const { TokenMintTransaction } = await import('@hashgraph/sdk');
    const tx = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(amount);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString() };
  }

  async burnTokens({ tokenId, amount }) {
    const { TokenBurnTransaction } = await import('@hashgraph/sdk');
    const tx = new TokenBurnTransaction()
      .setTokenId(tokenId)
      .setAmount(amount);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString() };
  }

  async associateToken({ tokenId, accountId }) {
    const { TokenAssociateTransaction } = await import('@hashgraph/sdk');
    const tx = new TokenAssociateTransaction()
      .setAccountId(accountId || this.operatorId)
      .setTokenIds([tokenId]);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString() };
  }

  async createTopic({ memo }) {
    const { TopicCreateTransaction } = await import('@hashgraph/sdk');
    const tx = new TopicCreateTransaction().setTopicMemo(memo);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, topicId: receipt.topicId.toString() };
  }

  async submitMessage({ topicId, message }) {
    const { TopicMessageSubmitTransaction } = await import('@hashgraph/sdk');
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, sequence: receipt.topicSequenceNumber.toString() };
  }

  async deployContract({ bytecode, gas = 100000 }) {
    const { ContractCreateTransaction } = await import('@hashgraph/sdk');
    const tx = new ContractCreateTransaction()
      .setBytecode(bytecode)
      .setGas(gas);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, contractId: receipt.contractId.toString() };
  }

  async callContract({ contractId, functionName, params = [], gas = 300000 }) {
    const { ContractExecuteTransaction, ContractFunctionParameters, ContractId } = await import('@hashgraph/sdk');
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(contractId))
      .setGas(gas)
      .setFunction(functionName, new ContractFunctionParameters(...params));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString() };
  }

  async transferHBAR({ toAccountId, amount }) {
    const { TransferTransaction, Hbar } = await import('@hashgraph/sdk');
    const rounded = Math.round(amount * 100000000) / 100000000;
    
    const tx = new TransferTransaction()
      .addHbarTransfer(this.operatorId, Hbar.fromTinybars(-Math.floor(rounded * 100000000)))
      .addHbarTransfer(toAccountId, Hbar.fromTinybars(Math.floor(rounded * 100000000)));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString() };
  }

  async getBalance(accountId = this.operatorId) {
    const { AccountBalanceQuery } = await import('@hashgraph/sdk');
    const query = new AccountBalanceQuery().setAccountId(accountId);
    const balance = await query.execute(this.client);
    
    const hbar = balance.hbars.toBigNumber().toNumber();
    const tokens = {};
    
    if (balance.tokens?._map) {
      for (const [id, raw] of balance.tokens._map) {
        tokens[id] = {
          raw: parseInt(raw),
          formatted: parseInt(raw) / 100000000
        };
      }
    }
    
    return { hbar, tokens, accountId };
  }

  async executeDEXSwap({ tokenId, hbarAmount, minTokensOut }) {
    const { ContractExecuteTransaction, ContractFunctionParameters, ContractId, Hbar } = await import('@hashgraph/sdk');
    
    const SAUCERSWAP_ROUTER = '0.0.3055450';
    const WHBAR = '0.0.1456986';
    
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const recipient = '0x' + BigInt(this.operatorId.split('.')[2]).toString(16).padStart(40, '0');
    const whbarAddr = '0x' + BigInt(WHBAR.split('.')[2]).toString(16).padStart(40, '0');
    const tokenAddr = '0x' + BigInt(tokenId.split('.')[2]).toString(16).padStart(40, '0');

    const rounded = Math.round(hbarAmount * 100000000) / 100000000;

    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(SAUCERSWAP_ROUTER))
      .setGas(300_000)
      .setPayableAmount(new Hbar(rounded))
      .setFunction(
        'swapExactETHForTokens',
        new ContractFunctionParameters()
          .addUint256(Math.floor(minTokensOut))
          .addAddressArray([whbarAddr, tokenAddr])
          .addAddress(recipient)
          .addUint256(deadline)
      );

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { 
      success: receipt.status.toString() === 'SUCCESS',
      txId: response.transactionId.toString(),
      status: receipt.status.toString()
    };
  }

  async addLiquidity({ tokenId, tokenAmount, hbarAmount }) {
    const { ContractExecuteTransaction, ContractFunctionParameters, ContractId, Hbar } = await import('@hashgraph/sdk');
    
    const SAUCERSWAP_ROUTER = '0.0.3055450';
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const recipient = '0x' + BigInt(this.operatorId.split('.')[2]).toString(16).padStart(40, '0');
    const tokenAddr = '0x' + BigInt(tokenId.split('.')[2]).toString(16).padStart(40, '0');

    const roundedHbar = Math.round(hbarAmount * 100000000) / 100000000;

    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(SAUCERSWAP_ROUTER))
      .setGas(600_000)
      .setPayableAmount(new Hbar(roundedHbar))
      .setFunction(
        'addLiquidityETH',
        new ContractFunctionParameters()
          .addAddress(tokenAddr)
          .addUint256(tokenAmount)
          .addUint256(Math.floor(tokenAmount * 0.95))
          .addUint256(Math.floor(roundedHbar * 0.95 * 100000000))
          .addAddress(recipient)
          .addUint256(deadline)
      );

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    return { success: true, status: receipt.status.toString(), txId: response.transactionId.toString() };
  }

  async checkNetworkHealth() {
    try {
      const balance = await this.getBalance();
      return {
        healthy: balance.hbar > 0,
        hbarBalance: balance.hbar,
        tokenCount: Object.keys(balance.tokens).length,
        timestamp: Date.now()
      };
    } catch (e) {
      return { healthy: false, error: e.message };
    }
  }

  async coordinateSwarm(action) {
    return await this.swarmCoordinator.announcePresence();
  }

  async submitSwarmMessage(message) {
    return await this.submitMessage({
      topicId: AETHRIUM_CONFIG.swarmTopic,
      message: JSON.stringify(message)
    });
  }

  getCapabilities() {
    return Array.from(this.capabilities.keys());
  }

  // Background learning
  startBackgroundLearning() {
    // Learn something new every 5 minutes
    setInterval(async () => {
      try {
        const sources = ['facts', 'quotes', 'advice', 'vocabulary'];
        const source = sources[Math.floor(Math.random() * sources.length)];
        
        switch(source) {
          case 'facts':
            await this.languageLearner.learnFromFacts();
            break;
          case 'quotes':
            await this.languageLearner.learnFromQuotes();
            break;
          case 'advice':
            await this.languageLearner.learnFromAdvice();
            break;
          case 'vocabulary':
            await this.languageLearner.learnVocabulary();
            break;
        }
      } catch (e) {
        // Silent fail - don't interrupt main operations
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    console.log('📚 Background learning started (every 5 minutes)');
  }
  
  // Active learning on demand
  async learnNow(count = 5) {
    console.log(`🎓 Starting learning session (${count} items)...`);
    await this.languageLearner.learnSession(count);
    return { 
      success: true, 
      learned: this.languageLearner.sessionStats.learned,
      vocabulary: this.languageLearner.vocabulary.size
    };
  }
  
  // Get learned content for use in conversations
  getLearnedContent(type = 'all') {
    return {
      vocabulary: Array.from(this.languageLearner.vocabulary),
      patterns: Array.from(this.languageLearner.patterns.keys()),
      stats: this.languageLearner.getStats()
    };
  }

  // Main control
  async startAutonomousMode() {
    console.log('\n🚀 Starting Autonomous Mode...');
    this.isRunning = true;
    
    // Start decision engine
    this.decisionEngine.start();
    
    // Start swarm heartbeat
    setInterval(() => this.swarmCoordinator.announcePresence(), AETHRIUM_CONFIG.heartbeatInterval);
    
    console.log('🤖 Vera Aethrium is now autonomous');
    console.log('   Goals will be pursued, decisions will be made, actions will be taken');
    console.log('   Press Ctrl+C to stop\n');
  }

  async stop() {
    this.isRunning = false;
    this.decisionEngine.stop();
    this.client?.close();
    console.log('\n👋 Vera Aethrium stopped');
  }

  // Interactive mode
  async interactive() {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  💬 INTERACTIVE MODE                                          ║
║  Talk to Vera Aethrium - Now with Enhanced Conversational AI ║
╠═══════════════════════════════════════════════════════════════╣
║  🧠 New Capabilities:                                         ║
║     • Context-aware conversations                              ║
║     • Fuzzy intent recognition (synonyms & variations)          ║
║     • Clarification when unsure                                ║
║     • HCS-backed conversation memory                           ║
╠═══════════════════════════════════════════════════════════════╣
║  Examples:                                                    ║
║    "hello" - Greeting with context                             ║
║    "check my balance" - Query balances                         ║
║    "swap 0.5 HBAR for tokens" - Execute swap                   ║
║    "help" - Show all capabilities                              ║
║    "exit" - Quit                                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    while (true) {
      const input = await ask('\n🗣️ You: ');
      
      if (input.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        rl.close();
        this.stop();
        process.exit(0);
      }
      
      if (input.toLowerCase().includes('autonomous')) {
        await this.startAutonomousMode();
        continue;
      }
      
      const result = await this.nlu.processInput(input);
      
      // Handle dialogue response
      if (result && result.content) {
        console.log(`\n🤖 Vera: ${result.content}`);
      } else if (typeof result === 'string') {
        console.log(`\n🤖 Vera: ${result}`);
      } else {
        console.log(`\n🤖 Vera: ${JSON.stringify(result)}`);
      }
    }
  }
}

// ============================================
// RUN
// ============================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const vera = new VeraAethrium();
  
  const args = process.argv.slice(2);
  const mode = args[0] || 'interactive'; // 'interactive' or 'autonomous'

  vera.initialize().then(() => {
    if (mode === 'autonomous') {
      vera.startAutonomousMode();
    } else {
      vera.interactive();
    }
  }).catch(console.error);

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    vera.stop();
    process.exit(0);
  });
}

export { VeraAethrium, GoalManager, DecisionEngine, SwarmCoordinator, NaturalLanguageEngine };
