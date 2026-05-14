/**
 * HCS Gossip Worker - Production Background Process
 * 
 * Dedicated worker for HCS gossip protocol operations.
 * Broadcasts agent beacons and propagates events across the swarm.
 */

import { veraLatticeSwarm } from './latticeSwarm.js';
import { hcsGossip } from './hcsGossip.js';
import { logger } from '../monitoring/logger.js';

const WORKER_ID = process.env.WORKER_ID || `gossip-worker-${Date.now()}`;
const AGENT_ID = process.env.GOSSIP_AGENT_ID || 'guardian-0';
const START_TIME = Date.now();

async function initializeGossipWorker() {
  logger.info('GossipWorker', {
    workerId: WORKER_ID,
    agentId: AGENT_ID,
    message: 'Starting HCS gossip worker'
  });

  try {
    // Initialize lattice swarm (lightweight)
    await veraLatticeSwarm.initialize();
    logger.info('GossipWorker', { message: 'Lattice swarm initialized' });

    // Initialize gossip protocol
    await veraLatticeSwarm.initializeGossipProtocol(AGENT_ID);
    logger.info('GossipWorker', { 
      agentId: AGENT_ID,
      message: 'HCS gossip protocol initialized' 
    });

    // Set up event handlers
    hcsGossip.on('threat_detected', (payload) => {
      logger.warn('GossipWorker', {
        threat: payload,
        message: 'Threat detected via gossip network'
      });
    });

    hcsGossip.on('consensus_requested', (payload) => {
      logger.info('GossipWorker', {
        request: payload,
        message: 'Consensus requested via gossip'
      });
    });

    hcsGossip.on('event_published', (event) => {
      logger.debug('GossipWorker', {
        eventId: event.id,
        type: event.type,
        message: 'Event published to gossip network'
      });
    });

    hcsGossip.on('event_received', (event) => {
      logger.debug('GossipWorker', {
        eventId: event.id,
        type: event.type,
        sender: event.sender,
        message: 'Event received from gossip network'
      });
    });

    // Periodic stats logging
    setInterval(() => {
      const stats = hcsGossip.getStats();
      const uptime = Math.floor((Date.now() - START_TIME) / 1000);
      
      logger.info('GossipWorker', {
        uptime,
        beaconsSent: stats.beaconsSent,
        beaconsReceived: stats.beaconsReceived,
        eventsPropagated: stats.eventsPropagated,
        rogueBeacons: stats.rogueBeaconsDetected,
        message: 'Gossip worker stats'
      });
    }, 60000); // Every minute

    // Periodic rogue agent check
    setInterval(async () => {
      const rogues = await veraLatticeSwarm.getRogueAgents();
      if (rogues.length > 0) {
        logger.warn('GossipWorker', {
          rogueAgents: rogues,
          count: rogues.length,
          message: 'Rogue agents detected'
        });
      }
    }, 30000); // Every 30 seconds

    logger.info('GossipWorker', {
      workerId: WORKER_ID,
      agentId: AGENT_ID,
      uptime: 0,
      message: 'HCS gossip worker ready'
    });

  } catch (error) {
    logger.error('GossipWorker', {
      error: error instanceof Error ? error.message : String(error),
      message: 'Failed to initialize gossip worker'
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('GossipWorker', { message: 'SIGTERM received, shutting down' });
  hcsGossip.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('GossipWorker', { message: 'SIGINT received, shutting down' });
  hcsGossip.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('GossipWorker', {
    error: error.message,
    stack: error.stack,
    message: 'Uncaught exception'
  });
  hcsGossip.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('GossipWorker', {
    reason: String(reason),
    message: 'Unhandled rejection'
  });
});

// Start worker
initializeGossipWorker();
