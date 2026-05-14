#!/usr/bin/env node
/**
 * SwarmConsensus - Multi-agent voting and decision system
 * Phase 5 Implementation
 */

export class SwarmConsensus {
  constructor(config = {}) {
    this.id = config.id || `swarm-${Date.now()}`;
    this.threshold = config.threshold || 0.6; // 60% agreement needed
    this.timeout = config.timeout || 30000; // 30 seconds
    this.activeProposals = new Map();
    this.history = [];
  }
  
  /**
   * Create a new proposal for swarm vote
   * @param {string} type - Proposal type
   * @param {Object} data - Proposal data
   * @param {Array<string>} participants - Agent IDs eligible to vote
   */
  async propose(type, data, participants) {
    const proposal = {
      id: Math.random().toString(36).substring(7),
      type,
      data,
      participants,
      votes: new Map(),
      status: 'PENDING',
      createdAt: Date.now(),
      deadline: Date.now() + this.timeout
    };
    
    this.activeProposals.set(proposal.id, proposal);
    
    // Auto-close after timeout
    setTimeout(() => this._closeProposal(proposal.id), this.timeout);
    
    return {
      proposalId: proposal.id,
      type,
      participants: participants.length,
      deadline: proposal.deadeline,
      status: 'PENDING'
    };
  }
  
  /**
   * Cast a vote on an active proposal
   * @param {string} proposalId - Proposal ID
   * @param {string} agentId - Agent casting vote
   * @param {string} vote - 'YES', 'NO', or 'ABSTAIN'
   * @param {Object} reasoning - Optional reasoning
   */
  async vote(proposalId, agentId, vote, reasoning = {}) {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found or expired' };
    }
    
    if (proposal.status !== 'PENDING') {
      return { success: false, error: 'Proposal already closed' };
    }
    
    if (!proposal.participants.includes(agentId)) {
      return { success: false, error: 'Agent not eligible to vote' };
    }
    
    proposal.votes.set(agentId, {
      vote,
      timestamp: Date.now(),
      reasoning
    });
    
    // Check if threshold reached
    const result = this._checkConsensus(proposal);
    
    return {
      success: true,
      proposalId,
      vote,
      currentStatus: result
    };
  }
  
  /**
   * Get current proposal status
   */
  getStatus(proposalId) {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return null;
    
    return this._checkConsensus(proposal);
  }
  
  _checkConsensus(proposal) {
    const total = proposal.participants.length;
    const votes = Array.from(proposal.votes.values());
    const yes = votes.filter(v => v.vote === 'YES').length;
    const no = votes.filter(v => v.vote === 'NO').length;
    const abstain = votes.filter(v => v.vote === 'ABSTAIN').length;
    
    const yesRatio = yes / total;
    const noRatio = no / total;
    const participation = votes.length / total;
    
    // Determine status
    let status = proposal.status;
    let passed = null;
    
    if (yesRatio >= this.threshold) {
      status = 'PASSED';
      passed = true;
    } else if (noRatio > (1 - this.threshold)) {
      status = 'REJECTED';
      passed = false;
    } else if (Date.now() > proposal.deadline) {
      status = 'EXPIRED';
      passed = false;
    }
    
    return {
      proposalId: proposal.id,
      type: proposal.type,
      status,
      passed,
      yes,
      no,
      abstain,
      participation: Math.round(participation * 100),
      yesRatio: Math.round(yesRatio * 100),
      deadline: proposal.deadeline
    };
  }
  
  _closeProposal(proposalId) {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return;
    
    const result = this._checkConsensus(proposal);
    proposal.status = result.status;
    
    // Archive
    this.history.push({
      ...result,
      data: proposal.data,
      closedAt: Date.now()
    });
    
    this.activeProposals.delete(proposalId);
    
    return result;
  }
  
  /**
   * Get consensus history
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit).reverse();
  }
  
  /**
   * Get active proposals
   */
  getActive() {
    return Array.from(this.activeProposals.values()).map(p => ({
      id: p.id,
      type: p.type,
      status: p.status,
      participants: p.participants.length,
      votes: p.votes.size,
      deadline: p.deadeline
    }));
  }
}

/**
 * AutonomousCoordinator - Self-governing agent decisions
 */
export class AutonomousCoordinator {
  constructor(config = {}) {
    this.swarm = new SwarmConsensus(config);
    this.decisionLog = [];
    this.autoApproveThreshold = config.autoApproveThreshold || 0.8;
  }
  
  /**
   * Autonomous decision without human input
   * @param {string} decisionType - Type of decision
   * @param {Object} context - Decision context
   * @param {Array<string>} agents - Agents to participate
   */
  async decide(decisionType, context, agents) {
    // Create proposal
    const proposal = await this.swarm.propose(decisionType, context, agents);
    
    // Simulate agent votes (in real scenario, agents would vote independently)
    const votes = await this._simulateAgentVotes(decisionType, context, agents);
    
    for (const [agentId, vote] of Object.entries(votes)) {
      await this.swarm.vote(proposal.proposalId, agentId, vote.vote, vote.reasoning);
    }
    
    // Get result
    const result = this.swarm.getStatus(proposal.proposalId);
    
    // Log decision
    this.decisionLog.push({
      timestamp: Date.now(),
      type: decisionType,
      context,
      result,
      autonomous: true
    });
    
    return result;
  }
  
  async _simulateAgentVotes(decisionType, context, agents) {
    const votes = {};
    
    agents.forEach(agent => {
      // Domain-specific logic
      let vote = 'YES';
      let reasoning = {};
      
      switch (decisionType) {
        case 'EMERGENCY_SHUTDOWN':
          // Security guardian more cautious
          vote = agent.includes('security') ? 'NO' : 'YES';
          reasoning = { risk: context.threatLevel };
          break;
          
        case 'SCALE_UP_MONITORING':
          // Energy auditor prefers scaling up on anomalies
          vote = context.anomalyCount > 0 ? 'YES' : 'NO';
          reasoning = { anomalies: context.anomalyCount };
          break;
          
        case 'CROSS_AGENT_ALERT':
          // All agents cooperate on alerts
          vote = 'YES';
          reasoning = { severity: context.severity };
          break;
          
        default:
          vote = Math.random() > 0.3 ? 'YES' : 'NO';
          reasoning = { confidence: Math.random() };
      }
      
      votes[agent] = { vote, reasoning };
    });
    
    return votes;
  }
  
  getDecisionHistory() {
    return this.decisionLog.slice(-10).reverse();
  }
}

/**
 * TaskDelegator - Cross-agent task distribution
 */
export class TaskDelegator {
  constructor() {
    this.pendingTasks = [];
    this.completedTasks = [];
  }
  
  /**
   * Delegate task to best-suited agent
   * @param {Object} task - Task to delegate
   * @param {Array<Object>} agents - Available agents with capabilities
   */
  async delegate(task, agents) {
    // Score each agent for this task
    const scored = agents.map(agent => ({
      ...agent,
      score: this._scoreAgentForTask(agent, task)
    })).sort((a, b) => b.score - a.score);
    
    const best = scored[0];
    
    const delegation = {
      taskId: Math.random().toString(36).substring(7),
      task: task.type,
      assignedTo: best.id,
      score: best.score,
      status: 'DELEGATED',
      timestamp: Date.now()
    };
    
    this.pendingTasks.push(delegation);
    
    return delegation;
  }
  
  _scoreAgentForTask(agent, task) {
    let score = 0;
    
    // Capability match
    if (agent.capabilities?.includes(task.type)) score += 50;
    
    // Load balancing (prefer less busy agents)
    const loadFactor = Math.max(0, 30 - (agent.load || 0));
    score += loadFactor;
    
    // Historical performance
    if (agent.successRate) score += agent.successRate * 20;
    
    // Domain affinity
    if (task.domain && agent.domain === task.domain) score += 10;
    
    return score;
  }
  
  completeTask(taskId, result) {
    const idx = this.pendingTasks.findIndex(t => t.taskId === taskId);
    if (idx === -1) return null;
    
    const task = this.pendingTasks.splice(idx, 1)[0];
    task.status = 'COMPLETED';
    task.result = result;
    task.completedAt = Date.now();
    
    this.completedTasks.push(task);
    return task;
  }
  
  getPending() {
    return this.pendingTasks;
  }
  
  getCompleted(limit = 10) {
    return this.completedTasks.slice(-limit).reverse();
  }
}

// Export all
export default {
  SwarmConsensus,
  AutonomousCoordinator,
  TaskDelegator
};
