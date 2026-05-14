import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentReputation {
  agentId: string;
  totalTasks: number;
  accepted: number;
  rejected: number;
  expired: number;
  totalHbarEarned: number;
  averageResponseMs: number;
  averageConfidence: number;
  successRate: number;       // 0.0–1.0
  reputationScore: number;   // 0.0–1.0 composite
  lastUpdated: number;
}

interface TaskOutcome {
  taskId: string;
  agentId: string;
  outcome: 'accepted' | 'rejected' | 'expired';
  responseMs: number;
  confidence: number;
  amountHbar: number;
  timestamp: number;
}

// ─── Reputation Engine ───────────────────────────────────────────────────────

const WEIGHTS = {
  successRate: 0.40,
  avgConfidence: 0.25,
  responsiveness: 0.20,
  volume: 0.15,
};

export class ReputationEngine {
  private reputations = new Map<string, AgentReputation>();
  private outcomes: TaskOutcome[] = [];

  /**
   * Record a task outcome for an agent and recalculate reputation.
   */
  recordOutcome(
    agentId: string,
    taskId: string,
    outcome: 'accepted' | 'rejected' | 'expired',
    responseMs: number,
    confidence: number,
    amountHbar: number,
  ): AgentReputation {
    this.outcomes.push({
      taskId,
      agentId,
      outcome,
      responseMs,
      confidence,
      amountHbar,
      timestamp: Date.now(),
    });

    const reputation = this.recalculate(agentId);
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordReputation(reputation, taskId, outcome))
      .catch((error) => logger.debug('ReputationEngine', { message: 'Workflow reputation evidence failed', error: String(error) }));
    return reputation;
  }

  /**
   * Recalculate an agent's reputation from all recorded outcomes.
   */
  private recalculate(agentId: string): AgentReputation {
    const agentOutcomes = this.outcomes.filter((o) => o.agentId === agentId);

    const totalTasks = agentOutcomes.length;
    const accepted = agentOutcomes.filter((o) => o.outcome === 'accepted').length;
    const rejected = agentOutcomes.filter((o) => o.outcome === 'rejected').length;
    const expired = agentOutcomes.filter((o) => o.outcome === 'expired').length;
    const totalHbarEarned = agentOutcomes
      .filter((o) => o.outcome === 'accepted')
      .reduce((s, o) => s + o.amountHbar, 0);

    const averageResponseMs = totalTasks > 0
      ? agentOutcomes.reduce((s, o) => s + o.responseMs, 0) / totalTasks
      : 0;

    const averageConfidence = totalTasks > 0
      ? agentOutcomes.reduce((s, o) => s + o.confidence, 0) / totalTasks
      : 0;

    const successRate = totalTasks > 0 ? accepted / totalTasks : 0;

    // Responsiveness score: faster is better, cap at 60s
    const maxResponseMs = 60_000;
    const responsivenessScore = averageResponseMs > 0
      ? Math.max(0, 1 - averageResponseMs / maxResponseMs)
      : 0.5; // neutral if no data

    // Volume score: logarithmic — 10 tasks = ~0.7, 100 tasks = ~1.0
    const volumeScore = totalTasks > 0
      ? Math.min(1, Math.log10(totalTasks + 1) / 2)
      : 0;

    const reputationScore =
      WEIGHTS.successRate * successRate +
      WEIGHTS.avgConfidence * averageConfidence +
      WEIGHTS.responsiveness * responsivenessScore +
      WEIGHTS.volume * volumeScore;

    const reputation: AgentReputation = {
      agentId,
      totalTasks,
      accepted,
      rejected,
      expired,
      totalHbarEarned,
      averageResponseMs,
      averageConfidence,
      successRate,
      reputationScore: Math.round(reputationScore * 1000) / 1000,
      lastUpdated: Date.now(),
    };

    this.reputations.set(agentId, reputation);

    logger.debug('ReputationEngine', {
      message: 'Reputation recalculated',
      agentId,
      score: reputation.reputationScore,
      successRate: reputation.successRate,
      totalTasks: reputation.totalTasks,
    });

    return reputation;
  }

  /**
   * Get an agent's reputation. Returns a default neutral score if unknown.
   */
  getReputation(agentId: string): AgentReputation {
    const existing = this.reputations.get(agentId);
    if (existing) return existing;

    // Default reputation for unknown agents
    return {
      agentId,
      totalTasks: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
      totalHbarEarned: 0,
      averageResponseMs: 0,
      averageConfidence: 0,
      successRate: 0,
      reputationScore: 0.5, // neutral default
      lastUpdated: Date.now(),
    };
  }

  /**
   * Score a bid using reputation. Higher is better.
   * Combines: fee efficiency, confidence, and reputation.
   */
  scoreBid(
    agentId: string,
    fee: number,
    confidence: number,
    budget: number,
  ): number {
    const rep = this.getReputation(agentId);

    // Fee efficiency: lower fee relative to budget is better
    const feeScore = budget > 0 ? Math.max(0, 1 - fee / budget) : 0.5;

    // Composite bid score
    return (
      0.30 * feeScore +
      0.25 * confidence +
      0.45 * rep.reputationScore
    );
  }

  /**
   * Rank multiple bids by composite score (descending).
   */
  rankBids(
    bids: Array<{ agentId: string; fee: number; confidence: number }>,
    budget: number,
  ): Array<{ agentId: string; fee: number; confidence: number; score: number }> {
    return bids
      .map((bid) => ({
        ...bid,
        score: this.scoreBid(bid.agentId, bid.fee, bid.confidence, budget),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getAllReputations(): AgentReputation[] {
    return Array.from(this.reputations.values());
  }

  getTopAgents(limit = 10): AgentReputation[] {
    return this.getAllReputations()
      .sort((a, b) => b.reputationScore - a.reputationScore)
      .slice(0, limit);
  }

  getStats() {
    const all = this.getAllReputations();
    return {
      trackedAgents: all.length,
      totalOutcomes: this.outcomes.length,
      averageReputation: all.length > 0
        ? all.reduce((s, r) => s + r.reputationScore, 0) / all.length
        : 0,
      topAgent: all.length > 0
        ? all.sort((a, b) => b.reputationScore - a.reputationScore)[0]
        : null,
    };
  }
}

export const reputationEngine = new ReputationEngine();
