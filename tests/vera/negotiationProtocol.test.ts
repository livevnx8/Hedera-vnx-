import { describe, it, expect, beforeEach } from 'vitest';
import { NegotiationProtocol } from '../../src/vera/orchestrator/negotiationProtocol.js';

describe('NegotiationProtocol', () => {
  let proto: NegotiationProtocol;

  beforeEach(() => {
    proto = new NegotiationProtocol({ maxRounds: 3, roundTimeoutMs: 60_000, totalTimeoutMs: 120_000 });
  });

  it('should start a negotiation and return pending status', () => {
    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    expect(neg.negotiationId).toMatch(/^neg-/);
    expect(neg.status).toBe('pending');
    expect(neg.taskId).toBe('task-1');
    expect(neg.agentId).toBe('agent-1');
    expect(neg.currentTerms.fee).toBe(5);
    expect(neg.round).toBe(0);
    expect(neg.history).toHaveLength(1);
    expect(neg.history[0].type).toBe('negotiate_start');
  });

  it('should process a counter-offer and increment round', () => {
    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    const updated = proto.counterOffer(neg.negotiationId, 'agent-1', { fee: 3 });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('countering');
    expect(updated!.round).toBe(1);
    expect(updated!.currentTerms.fee).toBe(3);
    expect(updated!.history).toHaveLength(2);
  });

  it('should accept negotiation and emit direct_award', () => {
    const events: string[] = [];
    proto.on('direct_award', () => events.push('direct_award'));

    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    proto.counterOffer(neg.negotiationId, 'agent-1', { fee: 4 });
    const accepted = proto.accept(neg.negotiationId, 'req-1');

    expect(accepted).not.toBeNull();
    expect(accepted!.status).toBe('accepted');
    expect(accepted!.resolvedAt).toBeDefined();
    expect(events).toContain('direct_award');
  });

  it('should reject negotiation and emit fallback_to_bid', () => {
    const events: string[] = [];
    proto.on('fallback_to_bid', () => events.push('fallback'));

    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    const rejected = proto.reject(neg.negotiationId, 'agent-1', 'too expensive');

    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe('rejected');
    expect(events).toContain('fallback');
  });

  it('should expire after max rounds with fallback', () => {
    const events: string[] = [];
    proto.on('fallback_to_bid', () => events.push('fallback'));

    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 10 });
    proto.counterOffer(neg.negotiationId, 'agent-1', { fee: 8 });
    proto.counterOffer(neg.negotiationId, 'req-1', { fee: 6 });
    const expired = proto.counterOffer(neg.negotiationId, 'agent-1', { fee: 5 });

    expect(expired).not.toBeNull();
    expect(expired!.status).toBe('expired');
    expect(events).toContain('fallback');
  });

  it('should return null when accepting an already resolved negotiation', () => {
    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    proto.accept(neg.negotiationId, 'req-1');
    const second = proto.accept(neg.negotiationId, 'agent-1');
    expect(second).toBeNull();
  });

  it('should track active negotiations', () => {
    proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    proto.startNegotiation('task-2', 'req-1', 'agent-2', { fee: 3 });
    expect(proto.getActiveNegotiations()).toHaveLength(2);

    const neg = proto.getNegotiationByTask('task-1');
    expect(neg).toBeDefined();
    proto.accept(neg!.negotiationId, 'req-1');
    expect(proto.getActiveNegotiations()).toHaveLength(1);
  });

  it('should report stats correctly', () => {
    proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    const neg2 = proto.startNegotiation('task-2', 'req-1', 'agent-2', { fee: 3 });
    proto.accept(neg2.negotiationId, 'agent-2');

    const stats = proto.getStats();
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(1);
    expect(stats.accepted).toBe(1);
  });

  it('should handle messages via handleMessage', () => {
    const neg = proto.startNegotiation('task-1', 'req-1', 'agent-1', { fee: 5 });
    proto.handleMessage({
      type: 'counter_offer',
      negotiationId: neg.negotiationId,
      taskId: 'task-1',
      fromId: 'agent-1',
      toId: 'req-1',
      terms: { fee: 4 },
      round: 1,
      timestamp: Date.now(),
    });
    const updated = proto.getNegotiation(neg.negotiationId);
    expect(updated!.round).toBe(1);
    expect(updated!.currentTerms.fee).toBe(4);
  });
});
