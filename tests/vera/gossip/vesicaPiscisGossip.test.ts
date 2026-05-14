import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VesicaPiscisGossip, GossipMessage, AgentStateSummary } from '../../../src/vera/gossip/vesicaPiscisGossip.js';

describe('VesicaPiscisGossip', () => {
  let gossip: VesicaPiscisGossip;

  beforeEach(() => {
    gossip = new VesicaPiscisGossip(0, 7, { enableSignatures: false });
    vi.useFakeTimers();
  });

  afterEach(() => {
    gossip.stop();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with correct ring neighbors', () => {
      gossip.start();
      const intersection = gossip.getIntersectionState();
      expect(intersection.left).not.toBeNull();
      expect(intersection.right).not.toBeNull();
      expect(intersection.left?.shardId).toBe(6);
      expect(intersection.right?.shardId).toBe(1);
    });

    it('should calculate ring neighbors for middle shards', () => {
      const middleGossip = new VesicaPiscisGossip(3, 7, { enableSignatures: false });
      middleGossip.start();
      const intersection = middleGossip.getIntersectionState();
      expect(intersection.left?.shardId).toBe(2);
      expect(intersection.right?.shardId).toBe(4);
      middleGossip.stop();
    });

    it('should wrap around for last shard', () => {
      const lastGossip = new VesicaPiscisGossip(6, 7, { enableSignatures: false });
      lastGossip.start();
      const intersection = lastGossip.getIntersectionState();
      expect(intersection.left?.shardId).toBe(5);
      expect(intersection.right?.shardId).toBe(0);
      lastGossip.stop();
    });
  });

  describe('state management', () => {
    it('should update agent state', () => {
      const agentState: AgentStateSummary = {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      };

      gossip.updateAgentState('agent-1', agentState);
      const stats = gossip.getStats();
      expect(stats.agentCount).toBe(1);
    });

    it('should calculate merkle root from state', () => {
      gossip.updateAgentState('agent-1', {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      });

      gossip.updateAgentState('agent-2', {
        agentId: 'agent-2',
        status: 'busy',
        load: 0.8,
        capabilities: ['storage'],
        lastHeartbeat: Date.now(),
      });

      const stats = gossip.getStats();
      expect(stats.merkleRoot).toBeDefined();
      expect(stats.merkleRoot.length).toBe(64);
      expect(stats.agentCount).toBe(2);
    });

    it('should track task queue', () => {
      gossip.addTask('task-1');
      gossip.addTask('task-2');

      const stats = gossip.getStats();
      expect(stats.taskCount).toBe(2);
    });

    it('should remove tasks from queue', () => {
      gossip.addTask('task-1');
      gossip.addTask('task-2');
      gossip.removeTask('task-1');

      const stats = gossip.getStats();
      expect(stats.taskCount).toBe(1);
    });
  });

  describe('gossip protocol', () => {
    it('should start and stop gossip timer', () => {
      gossip.start();
      expect(gossip.getStats().syncsCompleted).toBe(0);

      vi.advanceTimersByTime(5000);
      vi.advanceTimersByTime(5000);

      gossip.stop();
      const syncsBefore = gossip.getStats().syncsCompleted;
      vi.advanceTimersByTime(5000);
      expect(gossip.getStats().syncsCompleted).toBe(syncsBefore);
    });

    it('should emit sync_complete event', () => {
      const syncHandler = vi.fn();
      gossip.on('sync_complete', syncHandler);
      gossip.start();

      vi.advanceTimersByTime(5000);

      expect(syncHandler).toHaveBeenCalled();
    });

    it('should handle sync request message', () => {
      gossip.start();
      gossip.updateAgentState('agent-1', {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      });

      const request: GossipMessage = {
        type: 'sync_request',
        sourceShard: 1,
        targetShard: 0,
        sequence: 1,
        payload: {},
        timestamp: Date.now(),
      };

      const response = gossip.handleMessage(request);
      expect(response).not.toBeNull();
      expect(response?.type).toBe('sync_response');
      expect(response?.payload.agentCount).toBe(1);
    });

    it('should ignore messages not targeting this shard', () => {
      const request: GossipMessage = {
        type: 'sync_request',
        sourceShard: 1,
        targetShard: 99,
        sequence: 1,
        payload: {},
        timestamp: Date.now(),
      };

      const response = gossip.handleMessage(request);
      expect(response).toBeNull();
    });

    it('should handle delta request', () => {
      gossip.start();
      gossip.updateAgentState('agent-1', {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      });
      gossip.addTask('task-1');

      const deltaRequest: GossipMessage = {
        type: 'delta',
        sourceShard: 1,
        targetShard: 0,
        sequence: 1,
        payload: { sinceSequence: 0 },
        timestamp: Date.now(),
      };

      const response = gossip.handleMessage(deltaRequest);
      expect(response).not.toBeNull();
      expect(response?.type).toBe('delta');
      expect(response?.payload.agentStates).toBeDefined();
    });

    it('should handle heartbeat messages', () => {
      gossip.start();

      const heartbeat: GossipMessage = {
        type: 'heartbeat',
        sourceShard: 1,
        targetShard: 0,
        sequence: 1,
        payload: {},
        timestamp: Date.now(),
      };

      const response = gossip.handleMessage(heartbeat);
      expect(response).not.toBeNull();
      expect(response?.type).toBe('heartbeat');
      expect(response?.payload.status).toBe('alive');
    });

    it('should update neighbor health on heartbeat', () => {
      gossip.start();
      const initialLeft = gossip.getIntersectionState().left;
      expect(initialLeft?.healthy).toBe(true);

      const heartbeat: GossipMessage = {
        type: 'heartbeat',
        sourceShard: 6,
        targetShard: 0,
        sequence: 1,
        payload: {},
        timestamp: Date.now(),
      };

      gossip.handleMessage(heartbeat);
      const afterHeartbeat = gossip.getIntersectionState().left;
      expect(afterHeartbeat?.lastSeen).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    it('should track sync statistics', () => {
      gossip.start();
      const stats = gossip.getStats();

      expect(stats).toHaveProperty('syncsCompleted');
      expect(stats).toHaveProperty('syncsFailed');
      expect(stats).toHaveProperty('deltasSent');
      expect(stats).toHaveProperty('deltasReceived');
      expect(stats).toHaveProperty('bytesTransferred');
      expect(stats).toHaveProperty('agentCount');
      expect(stats).toHaveProperty('taskCount');
      expect(stats).toHaveProperty('leftNeighborHealthy');
      expect(stats).toHaveProperty('rightNeighborHealthy');
    });

    it('should update local state on agent update', () => {
      gossip.updateAgentState('agent-1', {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      });

      const localState = gossip.getLocalState();
      expect(localState.agentStates.size).toBe(1);
      expect(localState.agentStates.get('agent-1')?.status).toBe('active');
    });

    it('should increment sequence on state changes', () => {
      gossip.updateAgentState('agent-1', {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      });

      const seqAfterAgent = gossip.getStats().localSequence;

      gossip.addTask('task-1');
      const seqAfterTask = gossip.getStats().localSequence;

      expect(seqAfterTask).toBeGreaterThan(seqAfterAgent);
    });
  });

  describe('message signing', () => {
    it('should work without signatures when disabled', () => {
      const unsignedGossip = new VesicaPiscisGossip(0, 7, { enableSignatures: false });
      unsignedGossip.start();

      const message: GossipMessage = {
        type: 'sync_request',
        sourceShard: 1,
        targetShard: 0,
        sequence: 1,
        payload: {},
        timestamp: Date.now(),
      };

      const response = unsignedGossip.handleMessage(message);
      expect(response).not.toBeNull();
      unsignedGossip.stop();
    });

    it('should sign messages when enabled', () => {
      const signedGossip = new VesicaPiscisGossip(0, 7, {
        enableSignatures: true,
        secretKey: 'test-secret-key',
      });
      signedGossip.start();

      signedGossip.updateAgentState('agent-1', {
        agentId: 'agent-1',
        status: 'active',
        load: 0.5,
        capabilities: ['compute'],
        lastHeartbeat: Date.now(),
      });

      const request: GossipMessage = {
        type: 'sync_request',
        sourceShard: 1,
        targetShard: 0,
        sequence: 1,
        payload: {},
        timestamp: Date.now(),
      };

      const response = signedGossip.handleMessage(request);
      expect(response).not.toBeNull();
      signedGossip.stop();
    });
  });
});
