/**
 * Vera Cross-Agent Messenger
 * Enables communication between agents via BRIDGE topic
 */

export class CrossAgentMessenger {
  constructor(logger, bridgeTopicKey = 'BRIDGE') {
    this.logger = logger;
    this.bridgeTopicKey = bridgeTopicKey;
    this.pendingAcks = new Map();
    this.messageHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Send alert to specific agents
   */
  async alert(fromAgent, targetAgents, alertType, message, priority = 'NORMAL') {
    const msg = {
      fromAgent,
      targetAgents: Array.isArray(targetAgents) ? targetAgents : [targetAgents],
      alertType,
      message,
      priority,
      requiresAck: priority === 'HIGH' || priority === 'CRITICAL',
      timestamp: Date.now(),
      messageId: crypto.randomUUID()
    };

    // Track if acknowledgment required
    if (msg.requiresAck) {
      this.pendingAcks.set(msg.messageId, {
        ...msg,
        acksReceived: [],
        timeout: setTimeout(() => this.handleTimeout(msg.messageId), 30000)
      });
    }

    // Log to history
    this.addToHistory(msg);

    // Send via HCS
    return await this.logger.enqueue(
      this.bridgeTopicKey,
      'CROSS_AGENT_ALERT',
      msg,
      priority.toLowerCase()
    );
  }

  /**
   * Request consensus from multiple agents
   */
  async requestConsensus(fromAgent, agents, proposal, timeout = 30000) {
    const consensusId = crypto.randomUUID();
    
    const msg = {
      fromAgent,
      targetAgents: agents,
      type: 'CONSENSUS_REQUEST',
      proposal,
      consensusId,
      timeout,
      timestamp: Date.now(),
      votes: {},
      status: 'PENDING'
    };

    // Track consensus
    this.pendingAcks.set(consensusId, {
      ...msg,
      votesReceived: 0,
      votesRequired: agents.length,
      timer: setTimeout(() => this.finalizeConsensus(consensusId), timeout)
    });

    this.addToHistory(msg);

    return await this.logger.enqueue(
      this.bridgeTopicKey,
      'CONSENSUS_REQUEST',
      msg,
      'high'
    );
  }

  /**
   * Submit vote for consensus
   */
  async submitVote(agentId, consensusId, vote, reasoning = '') {
    return await this.logger.enqueue(
      this.bridgeTopicKey,
      'CONSENSUS_VOTE',
      {
        agentId,
        consensusId,
        vote, // 'APPROVE', 'REJECT', 'ABSTAIN'
        reasoning,
        timestamp: Date.now()
      },
      'high'
    );
  }

  /**
   * Acknowledge receipt of alert
   */
  async acknowledge(agentId, messageId) {
    // Check if we have this message pending
    const pending = this.pendingAcks.get(messageId);
    if (pending) {
      pending.acksReceived.push({
        agentId,
        timestamp: Date.now()
      });

      // Check if all acks received
      if (pending.acksReceived.length >= pending.targetAgents.length) {
        clearTimeout(pending.timeout);
        pending.status = 'ACKNOWLEDGED';
        this.pendingAcks.delete(messageId);
      }
    }

    // Log acknowledgment
    return await this.logger.enqueue(
      this.bridgeTopicKey,
      'ACKNOWLEDGMENT',
      {
        agentId,
        messageId,
        timestamp: Date.now()
      }
    );
  }

  /**
   * Broadcast to all agents
   */
  async broadcast(fromAgent, messageType, data, priority = 'normal') {
    return await this.logger.enqueue(
      this.bridgeTopicKey,
      'BROADCAST',
      {
        fromAgent,
        messageType,
        data,
        timestamp: Date.now()
      },
      priority
    );
  }

  /**
   * Handle acknowledgment timeout
   */
  handleTimeout(messageId) {
    const pending = this.pendingAcks.get(messageId);
    if (pending) {
      console.warn(`⚠️ Message ${messageId} not fully acknowledged`);
      pending.status = 'TIMEOUT';
      this.pendingAcks.delete(messageId);
    }
  }

  /**
   * Finalize consensus after timeout
   */
  finalizeConsensus(consensusId) {
    const consensus = this.pendingAcks.get(consensusId);
    if (consensus) {
      // Count votes
      const votes = Object.values(consensus.votes);
      const approved = votes.filter(v => v.vote === 'APPROVE').length;
      const rejected = votes.filter(v => v.vote === 'REJECT').length;
      
      const result = {
        consensusId,
        status: approved > rejected ? 'APPROVED' : 'REJECTED',
        approved,
        rejected,
        totalVotes: votes.length,
        timestamp: Date.now()
      };

      // Log result
      this.logger.enqueue(
        this.bridgeTopicKey,
        'CONSENSUS_RESULT',
        result,
        'high'
      );

      this.pendingAcks.delete(consensusId);
    }
  }

  /**
   * Add message to history
   */
  addToHistory(msg) {
    this.messageHistory.push(msg);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    }
  }

  /**
   * Get recent message history
   */
  getHistory(limit = 50) {
    return this.messageHistory.slice(-limit);
  }

  /**
   * Get pending messages awaiting acknowledgment
   */
  getPendingAcks() {
    return Array.from(this.pendingAcks.values());
  }

  /**
   * Get messenger statistics
   */
  getStats() {
    return {
      historySize: this.messageHistory.length,
      pendingAcks: this.pendingAcks.size,
      maxHistory: this.maxHistory
    };
  }
}

export default CrossAgentMessenger;
