import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReputationEngine, type AgentReputation } from '../../../src/vera/marketplace/reputation.js';

describe('ReputationEngine', () => {
  let engine: ReputationEngine;

  beforeEach(() => {
    engine = new ReputationEngine();
  });

  describe('recordOutcome', () => {
    it('should record accepted outcome and update reputation', () => {
      const rep = engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.9, 1.0);

      expect(rep.agentId).toBe('agent-1');
      expect(rep.totalTasks).toBe(1);
      expect(rep.accepted).toBe(1);
      expect(rep.successRate).toBe(1);
      expect(rep.totalHbarEarned).toBe(1.0);
    });

    it('should record rejected outcome and update reputation', () => {
      const rep = engine.recordOutcome('agent-1', 'task-1', 'rejected', 3000, 0.5, 0);

      expect(rep.rejected).toBe(1);
      expect(rep.successRate).toBe(0);
      expect(rep.totalHbarEarned).toBe(0);
    });

    it('should record expired outcome', () => {
      const rep = engine.recordOutcome('agent-1', 'task-1', 'expired', 60_000, 0, 0);

      expect(rep.expired).toBe(1);
      expect(rep.successRate).toBe(0);
    });

    it('should recalculate composite reputation score correctly', () => {
      // Record 5 accepted tasks
      for (let i = 0; i < 5; i++) {
        engine.recordOutcome('agent-1', `task-${i}`, 'accepted', 5000, 0.9, 1.0);
      }

      const rep = engine.getReputation('agent-1');
      expect(rep.successRate).toBe(1);
      expect(rep.reputationScore).toBeGreaterThan(0.7);
      expect(rep.reputationScore).toBeLessThanOrEqual(1);
    });

    it('should track multiple agents separately', () => {
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.9, 1.0);
      engine.recordOutcome('agent-2', 'task-2', 'rejected', 3000, 0.5, 0);

      const rep1 = engine.getReputation('agent-1');
      const rep2 = engine.getReputation('agent-2');

      expect(rep1.successRate).toBe(1);
      expect(rep2.successRate).toBe(0);
    });
  });

  describe('getReputation', () => {
    it('should return neutral reputation for unknown agents', () => {
      const rep = engine.getReputation('unknown-agent');

      expect(rep.agentId).toBe('unknown-agent');
      expect(rep.totalTasks).toBe(0);
      expect(rep.reputationScore).toBe(0.5);
      expect(rep.successRate).toBe(0);
    });
  });

  describe('scoreBid', () => {
    it('should score bids higher for agents with better reputation', () => {
      // Give agent-1 good reputation
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.95, 1.0);

      // Give agent-2 bad reputation
      engine.recordOutcome('agent-2', 'task-2', 'rejected', 3000, 0.3, 0);

      const score1 = engine.scoreBid('agent-1', 0.5, 0.9, 1.0);
      const score2 = engine.scoreBid('agent-2', 0.5, 0.9, 1.0);

      expect(score1).toBeGreaterThan(score2);
    });

    it('should score lower fees higher', () => {
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.9, 1.0);

      const lowFeeScore = engine.scoreBid('agent-1', 0.1, 0.9, 1.0);
      const highFeeScore = engine.scoreBid('agent-1', 0.9, 0.9, 1.0);

      expect(lowFeeScore).toBeGreaterThan(highFeeScore);
    });

    it('should score higher confidence higher', () => {
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.9, 1.0);

      const highConfScore = engine.scoreBid('agent-1', 0.5, 0.95, 1.0);
      const lowConfScore = engine.scoreBid('agent-1', 0.5, 0.5, 1.0);

      expect(highConfScore).toBeGreaterThan(lowConfScore);
    });
  });

  describe('rankBids', () => {
    it('should rank bids by composite score descending', () => {
      // Setup: agent-1 has good reputation, agent-2 has bad reputation
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.95, 1.0);
      engine.recordOutcome('agent-2', 'task-2', 'rejected', 3000, 0.3, 0);

      const bids = [
        { agentId: 'agent-2', fee: 0.1, confidence: 0.9 },
        { agentId: 'agent-1', fee: 0.2, confidence: 0.8 },
      ];

      const ranked = engine.rankBids(bids, 1.0);

      expect(ranked[0].agentId).toBe('agent-1'); // Better reputation wins despite higher fee
      expect(ranked[1].agentId).toBe('agent-2');
    });

    it('should include score in ranked output', () => {
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.9, 1.0);

      const bids = [{ agentId: 'agent-1', fee: 0.5, confidence: 0.9 }];
      const ranked = engine.rankBids(bids, 1.0);

      expect(ranked[0].score).toBeDefined();
      expect(ranked[0].score).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return correct aggregate stats', () => {
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.9, 1.0);
      engine.recordOutcome('agent-2', 'task-2', 'accepted', 6000, 0.85, 0.5);

      const stats = engine.getStats();

      expect(stats.trackedAgents).toBe(2);
      expect(stats.totalOutcomes).toBe(2);
      expect(stats.averageReputation).toBeGreaterThan(0);
      expect(stats.topAgent).toBeDefined();
    });

    it('should return null topAgent when no agents tracked', () => {
      const stats = engine.getStats();

      expect(stats.trackedAgents).toBe(0);
      expect(stats.topAgent).toBeNull();
    });
  });

  describe('getTopAgents', () => {
    it('should return agents sorted by reputation score', () => {
      engine.recordOutcome('agent-1', 'task-1', 'accepted', 5000, 0.95, 1.0);
      engine.recordOutcome('agent-1', 'task-2', 'accepted', 5000, 0.95, 1.0);
      engine.recordOutcome('agent-2', 'task-3', 'rejected', 3000, 0.3, 0);

      const top = engine.getTopAgents(2);

      expect(top[0].agentId).toBe('agent-1');
      expect(top[0].reputationScore).toBeGreaterThan(top[1].reputationScore);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordOutcome(`agent-${i}`, `task-${i}`, 'accepted', 5000, 0.9, 1.0);
      }

      const top3 = engine.getTopAgents(3);
      expect(top3.length).toBe(3);
    });
  });
});
