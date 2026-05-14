/**
 * Lattice Event Bridge
 *
 * Subscribes to FlowerOfLifeOS events and dispatches them to the webhook engine.
 * Also bridges orchestrator marketplace events (task submitted, agent registered,
 * payment settled) to webhook subscribers.
 *
 * Events bridged:
 *   - lattice.pulse          → pulse
 *   - lattice.decision       → decision
 *   - lattice.message_routed → message_routed
 *   - lattice.node_spawned   → node_spawned
 *   - lattice.node_hibernated → node_hibernated
 *   - marketplace.task_submitted → task.submitted
 *   - marketplace.agent_registered → agent.registered
 *   - marketplace.payment_settled → payment.settled
 *   - marketplace.carbon_verified → carbon.verified
 */

import { dispatchEvent } from './webhookEngine.js';
import { logger } from '../monitoring/logger.js';

let bridgeActive = false;

export async function startLatticeEventBridge(): Promise<void> {
  if (bridgeActive) return;

  // Wire into FlowerOfLifeOS via the global livingLattice instance
  const { livingLattice } = await getLatticeRef();
  if (!livingLattice) {
    logger.warn('LatticeEventBridge', { message: 'livingLattice not available — bridge deferred' });
    setTimeout(() => startLatticeEventBridge().catch(() => {}), 5000);
    return;
  }
  bridgeActive = true;

  livingLattice.on('pulse', (pulse) => {
    dispatchEvent('lattice.pulse', {
      id: pulse.id,
      type: pulse.type,
      layer: pulse.layer,
      energy: pulse.energy,
      origin: pulse.origin,
    });
  });

  livingLattice.on('center_routed', (decision) => {
    dispatchEvent('lattice.decision', {
      type: decision.type,
      hops: decision.hops,
      energyCost: decision.energyCost,
      centerEnergy: decision.centerEnergy,
    });
  });

  livingLattice.on('message_routed', (evt) => {
    dispatchEvent('lattice.message_routed', {
      from: evt.from,
      to: evt.to,
      pathLength: evt.route?.path?.length ?? 0,
    });
  });

  livingLattice.on('node_spawned', (evt) => {
    dispatchEvent('lattice.node_spawned', {
      nodeId: evt.id ?? evt.nodeId,
      layer: evt.layer,
      role: evt.role,
    });
  });

  livingLattice.on('node:hibernated', (evt) => {
    dispatchEvent('lattice.node_hibernated', {
      nodeId: evt.nodeId,
      layer: evt.layer,
    });
  });

  livingLattice.on('layer:expanded', (evt) => {
    dispatchEvent('lattice.layer_expanded', {
      layer: evt.layer,
      nodesSpawned: evt.nodesSpawned,
    });
  });

  logger.info('LatticeEventBridge', { message: 'Flower of Life events wired to webhooks' });
}

export async function startMarketplaceEventBridge(): Promise<void> {
  const { veraOrchestrator } = await getOrchestratorRef();
  if (!veraOrchestrator) {
    logger.warn('MarketplaceEventBridge', { message: 'orchestrator not available — bridge deferred' });
    setTimeout(() => startMarketplaceEventBridge().catch(() => {}), 5000);
    return;
  }

  const origSubmit = veraOrchestrator.submitTask.bind(veraOrchestrator);
  veraOrchestrator.submitTask = async function (description, serviceType, budget, options) {
    const result = await origSubmit(description, serviceType, budget, options);
    dispatchEvent('marketplace.task_submitted', {
      taskId: result.intent.taskId,
      serviceType,
      budget,
      description,
    });
    return result;
  };

  const origSettle = veraOrchestrator.settleTask?.bind(veraOrchestrator);
  if (origSettle) {
    veraOrchestrator.settleTask = async function (...args) {
      const result = await origSettle(...args);
      dispatchEvent('marketplace.payment_settled', {
        taskId: args[0],
        settlement: result,
      });
      return result;
    };
  }

  logger.info('MarketplaceEventBridge', { message: 'Marketplace events wired to webhooks' });
}

async function getLatticeRef() {
  try {
    const mod = await import('../vera/orchestrator/hierarchicalCoordinator.js');
    return { livingLattice: (mod as any).livingLattice };
  } catch {
    return { livingLattice: undefined };
  }
}

async function getOrchestratorRef() {
  try {
    const mod = await import('../vera/orchestrator/orchestratorLoop.js');
    return { veraOrchestrator: (mod as any).veraOrchestrator };
  } catch {
    return { veraOrchestrator: undefined };
  }
}
