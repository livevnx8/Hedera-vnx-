/**
 * ABFT Consensus Demo Script
 * 
 * Demonstrates Byzantine fault tolerant consensus with HCS-backed voting.
 * Run with: node --loader ts-node/esm src/swarm/abftDemo.ts
 */

import { veraLatticeSwarm } from './latticeSwarm.js';
import { abftConsensus } from './abftConsensus.js';
import { hcsGossip } from './hcsGossip.js';
import { logger } from '../monitoring/logger.js';

async function runDemo() {
  console.log('🚀 Vera Lattice ABFT Consensus Demo');
  console.log('=====================================\n');

  try {
    // 1. Initialize swarm with performance optimizations
    console.log('1️⃣  Initializing lattice swarm...');
    await veraLatticeSwarm.initialize();
    console.log('   ✓ Swarm initialized\n');

    // 2. Bootstrap ABFT consensus (min 3 guardians)
    console.log('2️⃣  Bootstrapping ABFT consensus...');
    await veraLatticeSwarm.initializeABFTConsensus();
    const guardians = abftConsensus.getGuardians();
    console.log(`   ✓ ${guardians.length} guardians registered for voting\n`);

    // 3. Start gossip beacons
    console.log('3️⃣  Starting HCS gossip protocol...');
    await veraLatticeSwarm.initializeGossipProtocol('guardian-0');
    console.log('   ✓ Gossip beacons active (5s interval)\n');

    // 4. Create proposal requiring consensus
    console.log('4️⃣  Creating payment batch proposal...');
    const proposalId = await veraLatticeSwarm.createConsensusProposal(
      'PAYMENT_BATCH',
      { 
        batchId: 'demo-batch-001',
        amount: 500000,
        recipients: ['0.0.1234', '0.0.5678'],
        memo: 'ABFT demo payment'
      },
      'guardian-0'
    );

    if (!proposalId) {
      console.error('   ✗ Failed to create proposal');
      return;
    }
    console.log(`   ✓ Proposal created: ${proposalId}\n`);

    // 5. Guardians cast votes
    console.log('5️⃣  Guardians casting votes via HCS...');
    const guardianAgents = guardians.map(g => g.agentId);
    
    // Simulate votes from each guardian
    for (let i = 0; i < Math.min(3, guardianAgents.length); i++) {
      const vote = i === 0 ? 'YES' : i === 1 ? 'YES' : 'YES'; // All yes for demo
      const success = await veraLatticeSwarm.castConsensusVote(proposalId, guardianAgents[i], vote);
      console.log(`   ${success ? '✓' : '✗'} Guardian ${guardianAgents[i]} voted ${vote}`);
      
      // Small delay between votes
      await new Promise(r => setTimeout(r, 500));
    }
    console.log();

    // 6. Check consensus status
    console.log('6️⃣  Checking consensus status...');
    await new Promise(r => setTimeout(r, 2000)); // Wait for HCS propagation
    
    const proposal = abftConsensus.getProposal(proposalId);
    if (proposal) {
      console.log(`   Status: ${proposal.status}`);
      console.log(`   Votes: ${proposal.votes.size}/${proposal.requiredVotes}`);
      console.log(`   Quorum: ${proposal.quorum} stake required`);
      
      const yesStake = Array.from(proposal.votes.values())
        .filter(v => v.value === 'YES')
        .reduce((sum, v) => sum + v.stake, 0);
      console.log(`   YES stake: ${yesStake}/${proposal.quorum}\n`);
    }

    // 7. Get stats
    console.log('7️⃣  ABFT Statistics:');
    const stats = abftConsensus.getStats();
    console.log(`   Total proposals: ${stats.totalProposals}`);
    console.log(`   Accepted: ${stats.acceptedProposals}`);
    console.log(`   Rejected: ${stats.rejectedProposals}`);
    console.log(`   Rogue agents detected: ${stats.rogueAgentsDetected}\n`);

    // 8. Gossip stats
    console.log('8️⃣  Gossip Protocol Statistics:');
    const gossipStats = hcsGossip.getStats();
    console.log(`   Beacons sent: ${gossipStats.beaconsSent}`);
    console.log(`   Beacons received: ${gossipStats.beaconsReceived}`);
    console.log(`   Events propagated: ${gossipStats.eventsPropagated}\n`);

    // 9. POPULATE ALL HCS TOPICS
    console.log('9️⃣  Populating ALL HCS topics with messages...');
    const { hcsSwarmMessenger } = await import('./hcsMessenger.js');
    
    const topicMessages = [
      { type: 'HEARTBEAT' as const, name: 'Heartbeat' },
      { type: 'STATE_SYNC' as const, name: 'State Sync' },
      { type: 'MEET_REQUEST' as const, name: 'Meet Request' },
      { type: 'JOIN_REQUEST' as const, name: 'Join Request' },
      { type: 'TASK_OFFER' as const, name: 'Task Routing' },
      { type: 'CAPABILITY_ANNOUNCE' as const, name: 'Federation' },
      { type: 'FED_HEARTBEAT' as const, name: 'Fed Heartbeat' },
      { type: 'PAYMENT' as const, name: 'Payments' },
      { type: 'DEFI_INTEL' as const, name: 'DeFi Intel' },
      { type: 'CARBON' as const, name: 'Carbon' },
      { type: 'COMPLIANCE' as const, name: 'Compliance' },
      { type: 'LEARNING' as const, name: 'Learning' },
      { type: 'REGISTRY' as const, name: 'Registry' },
      { type: 'AUDIT' as const, name: 'Audit' },
      { type: 'BEACON' as const, name: 'Beacon' },
    ];

    for (const { type, name } of topicMessages) {
      try {
        await hcsSwarmMessenger.broadcast(
          'vera-lattice-1',
          'guardian-0',
          type,
          { message: `Test ${name} message`, timestamp: Date.now() }
        );
        console.log(`   ✓ ${name} message sent`);
      } catch (err) {
        console.log(`   ✗ ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log();

    console.log('✅ Demo complete! ABFT consensus is operational.');
    console.log('\nNext steps:');
    console.log('- Add more guardians: await veraLatticeSwarm.createAgentLazy("guardian", 2, "guardian-3", "security")');
    console.log('- Test rogue detection: await veraLatticeSwarm.castConsensusVote(proposalId, "rogue-agent", "NO")');
    console.log('- Check rogue agents: await veraLatticeSwarm.getRogueAgents()');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    hcsGossip.stop();
    process.exit(0);
  }
}

runDemo();
