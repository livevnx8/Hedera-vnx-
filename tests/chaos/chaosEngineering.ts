/**
 * Chaos Engineering Test Suite
 * Simulates failures to validate system resilience
 */

import { EventEmitter } from 'events';

export type ChaosEventType = 
  | 'NETWORK_PARTITION'
  | 'SERVICE_CRASH'
  | 'HIGH_LATENCY'
  | 'HCS_FAILURE'
  | 'TOPIC_UNAVAILABLE'
  | 'AGENT_CRASH'
  | 'MEMORY_PRESSURE'
  | 'CPU_SPIKE';

export interface ChaosEvent {
  id: string;
  type: ChaosEventType;
  target: string;
  durationMs: number;
  intensity: number; // 0-1
  startTime: number;
  endTime?: number;
}

export interface ChaosTestConfig {
  durationMinutes: number;
  eventsPerMinute: number;
  recoveryTimeoutMs: number;
  autoRollbackOnFailure: boolean;
}

export class ChaosEngineering extends EventEmitter {
  private events: ChaosEvent[] = [];
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private activeEvents = new Map<string, ChaosEvent>();

  constructor(private config: ChaosTestConfig) {
    super();
  }

  /**
   * Start chaos testing
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.emit('chaos_started', { timestamp: Date.now(), config: this.config });

    const intervalMs = 60000 / this.config.eventsPerMinute;

    this.timer = setInterval(() => {
      this.injectRandomChaos();
    }, intervalMs);

    // Stop after duration
    setTimeout(() => {
      this.stop();
    }, this.config.durationMinutes * 60000);
  }

  /**
   * Stop chaos testing
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Clean up active events
    for (const event of this.activeEvents.values()) {
      this.recoverFromEvent(event);
    }
    this.activeEvents.clear();

    this.emit('chaos_stopped', { 
      timestamp: Date.now(),
      totalEvents: this.events.length 
    });
  }

  /**
   * Inject a random chaos event
   */
  private injectRandomChaos(): void {
    const eventTypes: ChaosEventType[] = [
      'NETWORK_PARTITION',
      'SERVICE_CRASH',
      'HIGH_LATENCY',
      'HCS_FAILURE',
      'TOPIC_UNAVAILABLE',
      'AGENT_CRASH',
      'MEMORY_PRESSURE',
      'CPU_SPIKE',
    ];

    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const targets = ['orchestrator', 'settlement', 'lattice', 'agent-1', 'agent-2'];
    const target = targets[Math.floor(Math.random() * targets.length)];

    const event: ChaosEvent = {
      id: `chaos-${Date.now()}`,
      type,
      target,
      durationMs: 30000 + Math.random() * 120000, // 30s - 2.5m
      intensity: 0.3 + Math.random() * 0.7,
      startTime: Date.now(),
    };

    this.events.push(event);
    this.activeEvents.set(event.id, event);

    this.applyChaosEvent(event);

    // Schedule recovery
    setTimeout(() => {
      this.recoverFromEvent(event);
      this.activeEvents.delete(event.id);
      event.endTime = Date.now();
    }, event.durationMs);

    this.emit('chaos_injected', event);
  }

  /**
   * Apply chaos event effects
   */
  private applyChaosEvent(event: ChaosEvent): void {
    switch (event.type) {
      case 'NETWORK_PARTITION':
        this.emit('network_partition', { target: event.target, duration: event.durationMs });
        break;
      case 'SERVICE_CRASH':
        this.emit('service_crash', { target: event.target });
        break;
      case 'HIGH_LATENCY':
        this.emit('high_latency', { target: event.target, latency: 2000 + event.intensity * 8000 });
        break;
      case 'HCS_FAILURE':
        this.emit('hcs_failure', { target: event.target, rate: event.intensity });
        break;
      case 'TOPIC_UNAVAILABLE':
        this.emit('topic_unavailable', { target: event.target, duration: event.durationMs });
        break;
      case 'AGENT_CRASH':
        this.emit('agent_crash', { target: event.target });
        break;
      case 'MEMORY_PRESSURE':
        this.emit('memory_pressure', { target: event.target, usage: 0.8 + event.intensity * 0.19 });
        break;
      case 'CPU_SPIKE':
        this.emit('cpu_spike', { target: event.target, usage: 0.7 + event.intensity * 0.3 });
        break;
    }
  }

  /**
   * Recover from chaos event
   */
  private recoverFromEvent(event: ChaosEvent): void {
    this.emit('chaos_recovered', { 
      eventId: event.id, 
      type: event.type,
      target: event.target,
      duration: Date.now() - event.startTime,
    });
  }

  /**
   * Manually inject specific chaos
   */
  injectChaos(type: ChaosEventType, target: string, durationMs: number): ChaosEvent {
    const event: ChaosEvent = {
      id: `manual-${Date.now()}`,
      type,
      target,
      durationMs,
      intensity: 1.0,
      startTime: Date.now(),
    };

    this.events.push(event);
    this.activeEvents.set(event.id, event);
    this.applyChaosEvent(event);

    setTimeout(() => {
      this.recoverFromEvent(event);
      this.activeEvents.delete(event.id);
      event.endTime = Date.now();
    }, durationMs);

    this.emit('chaos_injected', event);
    return event;
  }

  /**
   * Get chaos report
   */
  getReport(): {
    totalEvents: number;
    eventsByType: Record<ChaosEventType, number>;
    activeEvents: number;
    averageRecoveryTime: number;
  } {
    const completed = this.events.filter(e => e.endTime);
    const recoveryTimes = completed.map(e => (e.endTime! - e.startTime));
    
    const eventsByType = this.events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<ChaosEventType, number>);

    return {
      totalEvents: this.events.length,
      eventsByType,
      activeEvents: this.activeEvents.size,
      averageRecoveryTime: recoveryTimes.length > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        : 0,
    };
  }
}

export default ChaosEngineering;
