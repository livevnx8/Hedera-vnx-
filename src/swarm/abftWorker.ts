/**
 * ABFT Consensus Worker - Production Background Process
 * 
 * Dedicated worker for Byzantine fault tolerant consensus operations.
 * Runs continuously to monitor proposals and coordinate guardian voting.
 */

import { veraLatticeSwarm } from './latticeSwarm.js';
import { abftConsensus } from './abftConsensus.js';
import { logger } from '../monitoring/logger.js';

const WORKER_ID = process.env.WORKER_ID || `abft-worker-${Date.now()}`;
const START_TIME = Date.now();

async function initializeABFTWorker() {
  logger.info('ABFTWorker', {
    workerId: WORKER_ID,
    message: 'Starting ABFT consensus worker'
  });

  try {
    // Initialize lattice swarm (lightweight, no full agent pool)
    await veraLatticeSwarm.initialize();
    logger.info('ABFTWorker', { message: 'Lattice swarm initialized' });

    // Initialize ABFT consensus with guardians
    await veraLatticeSwarm.initializeABFTConsensus();
    logger.info('ABFTWorker', { message: 'ABFT consensus initialized' });

    // Set up event handlers
    abftConsensus.on('proposal_created', (proposal) => {
      logger.info('ABFTWorker', {
        proposalId: proposal.id,
        type: proposal.type,
        message: 'New proposal for consensus'
      });
    });

    abftConsensus.on('proposal_accepted', (proposal) => {
      logger.info('ABFTWorker', {
        proposalId: proposal.id,
        votes: proposal.votes.size,
        message: 'Proposal accepted by consensus'
      });
    });

    abftConsensus.on('proposal_rejected', (proposal) => {
      logger.warn('ABFTWorker', {
        proposalId: proposal.id,
        votes: proposal.votes.size,
        message: 'Proposal rejected by consensus'
      });
    });

    abftConsensus.on('quorum_reached', (data) => {
      logger.info('ABFTWorker', {
        proposalId: data.proposalId,
        yesStake: data.yesStake,
        noStake: data.noStake,
        message: 'Quorum reached'
      });
    });

    // Periodic stats logging
    setInterval(() => {
      const stats = abftConsensus.getStats();
      const uptime = Math.floor((Date.now() - START_TIME) / 1000);
      
      logger.info('ABFTWorker', {
        uptime,
        proposals: stats.totalProposals,
        accepted: stats.acceptedProposals,
        rejected: stats.rejectedProposals,
        rogueAgents: stats.rogueAgentsDetected,
        message: 'ABFT worker stats'
      });
    }, 60000); // Every minute

    logger.info('ABFTWorker', {
      workerId: WORKER_ID,
      uptime: 0,
      message: 'ABFT consensus worker ready'
    });

  } catch (error) {
    logger.error('ABFTWorker', {
      error: error instanceof Error ? error.message : String(error),
      message: 'Failed to initialize ABFT worker'
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('ABFTWorker', { message: 'SIGTERM received, shutting down' });
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('ABFTWorker', { message: 'SIGINT received, shutting down' });
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('ABFTWorker', {
    error: error.message,
    stack: error.stack,
    message: 'Uncaught exception'
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('ABFTWorker', {
    reason: String(reason),
    message: 'Unhandled rejection'
  });
});

// Start worker
initializeABFTWorker();
