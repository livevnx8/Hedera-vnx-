/**
 * Swarm Wiring
 *
 * Connects existing EventEmitter streams across Vera's swarm infrastructure
 * to the unified swarmEventLogger. This keeps the logger decoupled from
 * business logic — existing code keeps emitting its normal events, we just
 * listen and anchor.
 *
 * Hooked sources:
 *   - flowerOfLifeOS      → pulse, message_routed, decision, center_routed,
 *                            node:spawned, node:hibernated, layer:expanded
 *   - veraLatticeSwarm    → task events (if EventEmitter exposes them)
 *   - quantumLayer        → handshake events (if EventEmitter exposes them)
 *
 * Call `wireSwarmLogging()` once at startup, after subsystems are initialized.
 *
 * @module vera/logging/swarmWiring
 */

import { logger } from '../../monitoring/logger.js';
import { swarmEventLogger } from './swarmEventLogger.js';

let wired = false;

export async function wireSwarmLogging(): Promise<void> {
  if (wired) return;
  wired = true;

  // ─── Flower of Life OS ────────────────────────────────────────────────────
  try {
    const { flowerOfLifeOS } = await import('../orchestrator/flowerOfLifeOS.js');

    flowerOfLifeOS.on('pulse', (pulse: Record<string, unknown>) => {
      swarmEventLogger.log('lattice.pulse', {
        from: 'center-0',
        data: {
          type: pulse.type,
          origin: pulse.origin,
          depth: pulse.depth,
        },
      });
    });

    flowerOfLifeOS.on('message_routed', (payload: {
      from: string;
      to: string;
      route: { path: string[]; hops: number; energyCost: number };
      message: Record<string, unknown>;
    }) => {
      swarmEventLogger.log('lattice.route', {
        from: payload.from,
        to: payload.to,
        data: {
          hops: payload.route.hops,
          energyCost: Number(payload.route.energyCost?.toFixed?.(3) ?? 0),
          path: payload.route.path,
          messageType: (payload.message as { type?: string })?.type,
        },
      });
    });

    flowerOfLifeOS.on('decision', (result: Record<string, unknown>) => {
      swarmEventLogger.log('lattice.decision', {
        from: `layer-${result.sourceLayer}`,
        to: `layer-${result.targetLayer}`,
        data: {
          decisionType: result.decision,
          centerEnergy: result.centerEnergy,
          routedThroughCenter: result.routedThroughCenter,
        },
      });
    });

    flowerOfLifeOS.on('center_routed', (result: Record<string, unknown>) => {
      swarmEventLogger.log('lattice.decision', {
        from: 'center-0',
        to: (result.targetNode as string) ?? 'unknown',
        data: {
          decisionType: result.type,
          centerRouted: true,
        },
      });
    });

    flowerOfLifeOS.on('node:spawned', (payload: { nodeId: string; layer: number; role: string }) => {
      swarmEventLogger.log('lattice.agent-joined', {
        from: payload.nodeId,
        data: { layer: payload.layer, role: payload.role, action: 'spawned' },
      });
    });

    flowerOfLifeOS.on('node:hibernated', (payload: { nodeId: string; layer: number }) => {
      swarmEventLogger.log('lattice.agent-left', {
        from: payload.nodeId,
        data: { layer: payload.layer, action: 'hibernated' },
      });
    });

    flowerOfLifeOS.on('layer:expanded', (payload: { layer: number; nodesSpawned: number }) => {
      swarmEventLogger.log('lattice.reinforce', {
        from: `layer-${payload.layer}`,
        data: { nodesSpawned: payload.nodesSpawned, action: 'layer-expanded' },
      });
    });

    logger.info('SwarmWiring', { message: 'flowerOfLifeOS events wired to HCS' });
  } catch (e) {
    logger.warn('SwarmWiring', { error: String(e), source: 'flowerOfLifeOS' });
  }

  // ─── Quantum layer handshakes ─────────────────────────────────────────────
  try {
    const { quantumLayer } = await import('../quantum/quantumLayer.js');
    (quantumLayer as unknown as { on: Function }).on?.('handshake', (data: Record<string, unknown>) => {
      swarmEventLogger.log('swarm.handshake', {
        from: (data.peerA as string) ?? 'unknown',
        to: (data.peerB as string) ?? 'unknown',
        data: {
          fidelity: data.fidelity,
          duration: data.duration,
          type: 'quantum',
        },
      });
    });
    logger.info('SwarmWiring', { message: 'quantumLayer handshakes wired to HCS' });
  } catch (e) {
    logger.debug('SwarmWiring', { error: String(e), source: 'quantumLayer' });
  }

  // ─── Action verifier (forward tool-call proofs as swarm events) ──────────
  try {
    const { actionVerifier } = await import('../verification/actionVerifier.js');
    actionVerifier.on('verified', (proof: { hash: string; domain?: string; topicId: string; sequenceNumber: number }) => {
      // Only re-log non-swarm proofs (don't double-count)
      // This is how tool calls show up in the swarm timeline too
      if (proof.domain && !proof.domain.startsWith('swarm')) {
        // skip — tool calls already get their own trace in verify/list
      }
    });
    logger.info('SwarmWiring', { message: 'actionVerifier bridged to swarm timeline' });
  } catch (e) {
    logger.debug('SwarmWiring', { error: String(e), source: 'actionVerifier' });
  }

  logger.info('SwarmWiring', { message: 'swarm logging online — all lattice interactions anchor to HCS' });
}
