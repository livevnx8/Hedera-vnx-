import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestratorEventStream, type StreamEvent } from '../../../src/vera/orchestrator/eventStream.js';

vi.mock('../../../src/hedera/hederaMasterClass.js', () => ({
  hederaMaster: {
    submitMessage: vi.fn().mockResolvedValue({ success: true, transactionId: 'mock-tx' }),
    queryMirrorNode: vi.fn().mockResolvedValue({}),
    getExplorerUrl: vi.fn().mockReturnValue('https://hashscan.io/testnet/transaction/mock-tx'),
  },
}));

describe('OrchestratorEventStream', () => {
  let stream: OrchestratorEventStream;

  beforeEach(() => {
    stream = new OrchestratorEventStream();
  });

  describe('subscribe', () => {
    it('should register a client and return unsubscribe function', () => {
      const sendFn = vi.fn();
      const unsubscribe = stream.subscribe('client-1', sendFn);

      expect(stream.getClientCount()).toBe(1);

      unsubscribe();
      expect(stream.getClientCount()).toBe(0);
    });

    it('should send events to subscribed clients', () => {
      const sendFn = vi.fn();
      stream.subscribe('client-1', sendFn);

      // Simulate broadcasting an event by emitting locally
      const testEvent: StreamEvent = {
        type: 'test_event',
        timestamp: Date.now(),
        data: { message: 'hello' },
      };

      // Emit the event through the EventEmitter
      (stream as any).broadcast(testEvent);

      expect(sendFn).toHaveBeenCalledWith(testEvent);
    });

    it('should handle multiple clients', () => {
      const sendFn1 = vi.fn();
      const sendFn2 = vi.fn();

      stream.subscribe('client-1', sendFn1);
      stream.subscribe('client-2', sendFn2);

      expect(stream.getClientCount()).toBe(2);

      const testEvent: StreamEvent = {
        type: 'test_event',
        timestamp: Date.now(),
        data: {},
      };

      (stream as any).broadcast(testEvent);

      expect(sendFn1).toHaveBeenCalledWith(testEvent);
      expect(sendFn2).toHaveBeenCalledWith(testEvent);
    });
  });

  describe('getRecentEvents', () => {
    it('should return recent events from log', () => {
      // Wire events and trigger some
      stream.wireEvents();

      // Access the internal event log directly for testing
      const testEvent: StreamEvent = {
        type: 'test_event',
        timestamp: Date.now(),
        data: { test: true },
      };

      (stream as any).broadcast(testEvent);

      const recent = stream.getRecentEvents(10);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[recent.length - 1].type).toBe('test_event');
    });

    it('should respect limit parameter', () => {
      // Add many events
      for (let i = 0; i < 100; i++) {
        const event: StreamEvent = {
          type: `event-${i}`,
          timestamp: Date.now(),
          data: {},
        };
        (stream as any).broadcast(event);
      }

      const recent = stream.getRecentEvents(10);
      expect(recent.length).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return stream statistics', () => {
      stream.subscribe('client-1', vi.fn());

      const stats = stream.getStats();

      expect(stats.connectedClients).toBe(1);
      expect(stats.totalEvents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('wireEvents', () => {
    it('should wire to all orchestrator events', () => {
      // This test verifies wireEvents can be called without error
      expect(() => stream.wireEvents()).not.toThrow();
    });

    it('should not double-wire events', () => {
      stream.wireEvents();
      // Second call should be a no-op
      expect(() => stream.wireEvents()).not.toThrow();
    });
  });

  describe('event types', () => {
    it('should handle task_posted events', () => {
      const sendFn = vi.fn();
      stream.subscribe('client-1', sendFn);
      stream.wireEvents();

      // Emit a task_posted event through the event emitter
      const taskEvent: StreamEvent = {
        type: 'task_posted',
        timestamp: Date.now(),
        data: { taskId: 'task-1', budget: 1.0 },
      };

      (stream as any).broadcast(taskEvent);

      expect(sendFn).toHaveBeenCalled();
    });

    it('should handle bid_received events', () => {
      const sendFn = vi.fn();
      stream.subscribe('client-1', sendFn);

      const bidEvent: StreamEvent = {
        type: 'bid_received',
        timestamp: Date.now(),
        data: { taskId: 'task-1', agentId: 'agent-1', fee: 0.5 },
      };

      (stream as any).broadcast(bidEvent);

      expect(sendFn).toHaveBeenCalledWith(bidEvent);
    });

    it('should handle payment_settled events', () => {
      const sendFn = vi.fn();
      stream.subscribe('client-1', sendFn);

      const paymentEvent: StreamEvent = {
        type: 'payment_settled',
        timestamp: Date.now(),
        data: { settlementId: 'set-1', amountHbar: 1.0, agentId: 'agent-1' },
      };

      (stream as any).broadcast(paymentEvent);

      expect(sendFn).toHaveBeenCalledWith(paymentEvent);
    });
  });

  describe('client error handling', () => {
    it('should remove client on send error', () => {
      const failingSend = vi.fn().mockImplementation(() => {
        throw new Error('Send failed');
      });

      stream.subscribe('client-1', failingSend);

      const testEvent: StreamEvent = {
        type: 'test_event',
        timestamp: Date.now(),
        data: {},
      };

      (stream as any).broadcast(testEvent);

      // Client should be removed after error
      expect(stream.getClientCount()).toBe(0);
    });
  });

  describe('event log ring buffer', () => {
    it('should maintain max log size of 500 events', () => {
      // Add more than 500 events
      for (let i = 0; i < 550; i++) {
        const event: StreamEvent = {
          type: `event-${i}`,
          timestamp: Date.now(),
          data: { index: i },
        };
        (stream as any).broadcast(event);
      }

      const stats = stream.getStats();
      expect(stats.totalEvents).toBeLessThanOrEqual(500);
    });
  });
});
