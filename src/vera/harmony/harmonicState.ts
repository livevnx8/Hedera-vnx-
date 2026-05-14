import { enterpriseServiceManager } from '../enterprise/serviceManager.js';
import { latticeHealthMonitor } from '../monitoring/latticeHealthMonitor.js';
import { veraOrchestrator } from '../orchestrator/orchestratorLoop.js';
import { rigState } from '../rig/rigState.js';
import { rigAdaptiveScheduler } from '../scaling/adaptiveScheduler.js';
import { rigTopology } from '../../swarm/rigTopology.js';
import { config } from '../../config.js';

export type HarmonicStatus = 'aligned' | 'warm' | 'strained' | 'critical';

type ComponentHealth = {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
};

export interface HarmonicState {
  timestamp: number;
  status: HarmonicStatus;
  signals: {
    orchestratorRunning: boolean;
    orchestratorSkipped: boolean;
    rigHealth: string | null;
    schedulerLoad: number;
    queueDepth: number;
    latticeCritical: number;
    latticeDegraded: number;
  };
  rig: {
    snapshot: ReturnType<typeof rigState.getSnapshot>;
    pressure: ReturnType<typeof rigState.getPressureMetrics>;
    topology: ReturnType<typeof rigTopology.getStats>;
  };
  scheduler: ReturnType<typeof rigAdaptiveScheduler.getMetrics>;
  orchestrator: {
    running: boolean;
    stats: ReturnType<typeof veraOrchestrator.getStats> | null;
  };
  enterprise: ReturnType<typeof enterpriseServiceManager.getDashboard> | null;
  latticeHealth: ReturnType<typeof latticeHealthMonitor.getStatus> | null;
  guidance: string[];
}

function safeRead<T>(reader: () => T, fallback: T): T {
  try {
    return reader();
  } catch {
    return fallback;
  }
}

function getQueueDepth(stats: ReturnType<typeof veraOrchestrator.getStats> | null): number {
  if (!stats?.tasks || typeof stats.tasks !== 'object') return 0;
  const taskStats = stats.tasks as Record<string, unknown>;
  const posted = Number(taskStats.posted ?? 0);
  const bidding = Number(taskStats.bidding ?? 0);
  const inProgress = Number(taskStats.in_progress ?? taskStats.inProgress ?? 0);
  return posted + bidding + inProgress;
}

function countComponents(
  components: ComponentHealth[],
  statuses: Array<ComponentHealth['status']>,
): number {
  return components.filter((component) => statuses.includes(component.status)).length;
}

function deriveStatus(signals: HarmonicState['signals']): HarmonicStatus {
  if ((!signals.orchestratorRunning && !signals.orchestratorSkipped) || signals.rigHealth === 'critical' || signals.latticeCritical > 0) {
    return 'critical';
  }

  if (
    signals.orchestratorSkipped ||
    signals.rigHealth === 'pressured' ||
    signals.rigHealth === 'degraded' ||
    signals.schedulerLoad >= 0.75 ||
    signals.latticeDegraded > 0
  ) {
    return 'strained';
  }

  if (signals.schedulerLoad >= 0.4 || signals.queueDepth > 0) {
    return 'warm';
  }

  return 'aligned';
}

function getGuidance(status: HarmonicStatus, signals: HarmonicState['signals']): string[] {
  const guidance: string[] = [];

  if (signals.orchestratorSkipped) {
    guidance.push('Orchestrator is parked for operator-dashboard mode; production marketplace intake is paused.');
  } else if (!signals.orchestratorRunning) {
    guidance.push('Start the Vera orchestrator before accepting marketplace traffic.');
  }
  if (signals.rigHealth === 'pressured' || signals.rigHealth === 'degraded') {
    guidance.push('Keep new work on balanced or deferred lanes until rig pressure clears.');
  }
  if (signals.schedulerLoad >= 0.75) {
    guidance.push('Reduce task cadence or expand worker capacity before promoting new flows.');
  }
  if (signals.latticeCritical > 0 || signals.latticeDegraded > 0) {
    guidance.push('Let lattice health recovery settle before treating receipts as production-grade.');
  }
  if (status === 'aligned') {
    guidance.push('System is aligned; prioritize the flagship marketplace proof loop.');
  }

  return guidance;
}

export function getHarmonicState(): HarmonicState {
  const snapshot = rigState.getSnapshot();
  const pressure = rigState.getPressureMetrics(snapshot);
  const scheduler = safeRead(() => rigAdaptiveScheduler.getMetrics(), rigAdaptiveScheduler.getMetrics());
  const orchestratorRunning = safeRead(() => veraOrchestrator.isRunning(), false);
  const orchestratorSkipped = config.VERA_SKIP_ORCHESTRATOR_START === 'true';
  const orchestratorStats = safeRead(() => veraOrchestrator.getStats(), null);
  const enterprise = safeRead(() => enterpriseServiceManager.getDashboard(), null);
  const latticeHealth = safeRead(() => latticeHealthMonitor.getStatus(), null);
  const topology = safeRead(() => rigTopology.getStats(), rigTopology.getStats());
  const components = (latticeHealth?.components ?? []) as ComponentHealth[];

  const signals = {
    orchestratorRunning,
    orchestratorSkipped,
    rigHealth: pressure?.health ?? snapshot?.health ?? null,
    schedulerLoad: scheduler.loadFactor,
    queueDepth: getQueueDepth(orchestratorStats),
    latticeCritical: countComponents(components, ['critical']),
    latticeDegraded: countComponents(components, ['degraded', 'unhealthy']),
  };
  const status = deriveStatus(signals);

  return {
    timestamp: Date.now(),
    status,
    signals,
    rig: { snapshot, pressure, topology },
    scheduler,
    orchestrator: {
      running: orchestratorRunning,
      stats: orchestratorStats,
    },
    enterprise,
    latticeHealth,
    guidance: getGuidance(status, signals),
  };
}
