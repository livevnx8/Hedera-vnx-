/**
 * Enterprise Service Manager
 * Integrates SLA, Priority Queue, and Resource Isolation
 */

import { SLAManager, ServiceTier } from './slaManager.js';
import { PriorityQueueManager } from './priorityQueue.js';
import { logger } from '../../monitoring/logger.js';
import { rigState, type RigSnapshot } from '../rig/rigState.js';

export class EnterpriseServiceManager {
  private slaManager: SLAManager;
  private priorityQueue: PriorityQueueManager;
  private resourceAllocation: Map<ServiceTier, { cpu: number; memory: number; hcsQuota: number }> = new Map();
  private timers: NodeJS.Timeout[] = [];
  private initialized = false;
  private lastRigSnapshot: RigSnapshot | null = null;

  constructor() {
    this.slaManager = new SLAManager();
    this.priorityQueue = new PriorityQueueManager(100);
    
    // Initialize resource quotas
    this.resourceAllocation.set('basic', { cpu: 20, memory: 512, hcsQuota: 100 });
    this.resourceAllocation.set('pro', { cpu: 50, memory: 1024, hcsQuota: 500 });
    this.resourceAllocation.set('enterprise', { cpu: 100, memory: 2048, hcsQuota: 2000 });

    rigState.on('snapshot', (snapshot: RigSnapshot) => {
      this.lastRigSnapshot = snapshot;
    });
  }

  /**
   * Initialize enterprise services
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    logger.info('EnterpriseService', { message: 'Initializing enterprise services...' });

    // Start SLA monitoring
    this.startSLAMonitoring();

    // Start priority queue processing
    this.startQueueProcessing();
    this.initialized = true;
    this.lastRigSnapshot = rigState.getSnapshot();

    logger.info('EnterpriseService', { message: 'Enterprise services ready' });
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.initialized = false;
    logger.info('EnterpriseService', { message: 'Enterprise services stopped' });
  }

  isRunning(): boolean {
    return this.initialized;
  }

  /**
   * Submit enterprise request
   */
  async submitRequest(
    payload: any,
    tier: ServiceTier,
    priority: 'emergency' | 'high' | 'normal' | 'background' = 'normal'
  ): Promise<{ id: string; estimatedTime: number }> {
    // Map priority levels
    const priorityMap: Record<string, number> = {
      emergency: 0, // P0
      high: 1,      // P1
      normal: 2,    // P2
      background: 3, // P3
    };

    const priorityLevel = priorityMap[priority] as 0 | 1 | 2 | 3;

    // Queue the message
    const id = this.priorityQueue.queueMessage(payload, priorityLevel, tier);

    // Estimate processing time based on queue depth
    const stats = this.priorityQueue.getStats();
    const estimatedTime = stats.avgWaitTimeMs * (1 + stats.currentDepth / 100);

    logger.info('EnterpriseService', {
      message: 'Enterprise request queued',
      id,
      tier,
      priority,
      estimatedTimeMs: Math.round(estimatedTime),
    });

    return { id, estimatedTime };
  }

  /**
   * Get enterprise dashboard data
   */
  getDashboard(): {
    sla: ReturnType<SLAManager['getStatus']>;
    queue: ReturnType<PriorityQueueManager['getStats']>;
    resources: Record<ServiceTier, { allocated: { cpu: number; memory: number; hcsQuota: number }; usage: number }>;
  } {
    const sla = this.slaManager.getStatus();
    const queue = this.priorityQueue.getStats();

    const resources: Record<ServiceTier, any> = {} as any;
    const snapshot = this.lastRigSnapshot;
    const baseUsage = snapshot
      ? Math.max(
          snapshot.cpu.normalizedLoad1m,
          snapshot.memory.utilization,
          ...snapshot.disks
            .map((disk) => disk.utilization ?? 0)
        )
      : 0;
    for (const tier of ['basic', 'pro', 'enterprise'] as ServiceTier[]) {
      const allocated = this.resourceAllocation.get(tier)!;
      resources[tier] = {
        allocated,
        usage: Math.min(1, Number(baseUsage.toFixed(3))),
      };
    }

    return { sla, queue, resources };
  }

  private startSLAMonitoring(): void {
    // Update SLA metrics every minute
    this.timers.push(setInterval(() => {
      const snapshot = this.lastRigSnapshot;
      const cpuLatencyBias = snapshot ? snapshot.cpu.normalizedLoad1m * 250 : 0;
      const memoryLatencyBias = snapshot ? snapshot.memory.utilization * 200 : 0;
      const errorBias = snapshot?.health === 'critical' ? 0.005 : snapshot?.health === 'pressured' ? 0.001 : 0;

      for (const tier of ['basic', 'pro', 'enterprise'] as ServiceTier[]) {
        this.slaManager.updateMetrics(tier, {
          uptimePercent: snapshot?.health === 'critical' ? 0.985 : 0.999,
          avgLatencyMs: 100 + cpuLatencyBias + memoryLatencyBias,
          p99LatencyMs: 200 + cpuLatencyBias + memoryLatencyBias * 1.2,
          errorRate: errorBias,
        });
      }
    }, 60000));

    // Listen for violations
    this.slaManager.on('violation', (violation) => {
      logger.error('EnterpriseService', {
        message: 'SLA violation detected',
        tier: violation.tier,
        metric: violation.metric,
        severity: violation.severity,
      });
    });
  }

  private startQueueProcessing(): void {
    // Apply backpressure check every 10 seconds
    this.timers.push(setInterval(() => {
      this.priorityQueue.applyBackpressure();
    }, 10000));

    // Log queue stats every minute
    this.timers.push(setInterval(() => {
      const stats = this.priorityQueue.getStats();
      const depthByPriority = this.priorityQueue.getDepthByPriority();
      
      logger.info('EnterpriseService', {
        message: 'Queue stats',
        totalQueued: stats.totalQueued,
        totalProcessed: stats.totalProcessed,
        currentDepth: stats.currentDepth,
        processing: stats.processing,
        byPriority: depthByPriority,
      });
    }, 60000));
  }
}

export const enterpriseServiceManager = new EnterpriseServiceManager();
export default EnterpriseServiceManager;
