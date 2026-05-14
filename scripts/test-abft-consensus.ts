#!/usr/bin/env node
/**
 * Quick ABFT Consensus Test - Populate HCS Topics
 * Run: node --loader ts-node/esm scripts/test-abft-consensus.ts
 */

import { veraLatticeSwarm } from '../src/swarm/latticeSwarm.js';
import { abftConsensus } from '../src/swarm/abftConsensus.js';
import { hcsGossip } from '../src/swarm/hcsGossip.js';

async function testABFT() {
  console.log('🚀 Testing ABFT Consensus & HCS Logging...\n');

  try {
    // 1. Initialize swarm
    console.log('1️⃣ Initializing lattice swarm...');
    await veraLatticeSwarm.initialize();
    console.log('   ✓ Swarm initialized\n');

    // 2. Initialize ABFT
    console.log('2️⃣ Initializing ABFT consensus...');
    await veraLatticeSwarm.initializeABFTConsensus();
    console.log('   ✓ ABFT initialized\n');

    // 3. Initialize gossip
    console.log('3️⃣ Initializing HCS gossip...');
    await veraLatticeSwarm.initializeGossipProtocol('guardian-0');
    console.log('   ✓ Gossip initialized\n');

    // 4. Create proposal
    console.log('4️⃣ Creating payment proposal...');
    const proposalId = await veraLatticeSwarm.createConsensusProposal(
      'PAYMENT_BATCH',
      { batchId: 'test-001', amount: 1000000, recipients: ['0.0.1234'] },
      'guardian-0'
    );
    if (!proposalId) {
      console.error('   ✗ Failed to create proposal');
      process.exit(1);
    }
    console.log(`   ✓ Proposal: ${proposalId}\n`);

    // 5. Cast votes
    console.log('5️⃣ Casting votes...');
    const guardians = abftConsensus.getGuardians();
    for (const g of guardians.slice(0, 3)) {
      await veraLatticeSwarm.castConsensusVote(proposalId!, g.agentId, 'YES');
      console.log(`   ✓ ${g.agentId} voted YES`);
    }
    console.log();

    // 6. Wait and check
    await new Promise(r => setTimeout(r, 3000));
    const proposal = abftConsensus.getProposal(proposalId);
    console.log('6️⃣ Consensus Status:');
    console.log(`   Status: ${proposal?.status}`);
    console.log(`   Votes: ${proposal?.votes.size}/${proposal?.requiredVotes}`);
    console.log(`   YES stake: ${Array.from(proposal?.votes.values() || []).filter(v => v.value === 'YES').reduce((s, v) => s + v.stake, 0)}\n`);

    // 7. Gossip stats
    const stats = hcsGossip.getStats();
    console.log('7️⃣ Gossip Stats:');
    console.log(`   Beacons sent: ${stats.beaconsSent}`);
    console.log(`   Events: ${stats.eventsPropagated}\n`);

    // 8. Check rogue agents
    const rogues = await veraLatticeSwarm.getRogueAgents();
    console.log('8️⃣ Rogue Agents:', rogues.length > 0 ? rogues : 'None detected\n');

    console.log('✅ ABFT test complete! Check Hashscan for HCS messages.');
    console.log('🔗 Topics: 0.0.10416185 (consensus), 0.0.10416192 (heartbeat)');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    hcsGossip.stop();
    process.exit(0);
  }
}

testABFT();
