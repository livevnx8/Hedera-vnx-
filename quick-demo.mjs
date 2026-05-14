import { veraLatticeSwarm } from './src/swarm/latticeSwarm.js';
import { abftConsensus } from './src/swarm/abftConsensus.js';
import { hcsGossip } from './src/swarm/hcsGossip.js';

console.log('🚀 ABFT Demo Starting...\n');

await veraLatticeSwarm.initialize();
console.log('✓ Swarm initialized');

await veraLatticeSwarm.initializeABFTConsensus();
console.log('✓ ABFT initialized');

await veraLatticeSwarm.initializeGossipProtocol('guardian-0');
console.log('✓ Gossip initialized\n');

const proposalId = await veraLatticeSwarm.createConsensusProposal(
  'PAYMENT_BATCH',
  { batchId: 'demo-001', amount: 500000, recipients: ['0.0.1234'] },
  'guardian-0'
);
console.log(`✓ Proposal: ${proposalId}\n`);

const guardians = abftConsensus.getGuardians();
for (const g of guardians.slice(0, 3)) {
  await veraLatticeSwarm.castConsensusVote(proposalId, g.agentId, 'YES');
  console.log(`✓ ${g.agentId} voted YES`);
}

await new Promise(r => setTimeout(r, 2000));
const proposal = abftConsensus.getProposal(proposalId);
console.log(`\n📊 Status: ${proposal?.status}`);
console.log(`📊 Votes: ${proposal?.votes.size}/${proposal?.requiredVotes}`);

const stats = hcsGossip.getStats();
console.log(`📊 Gossip beacons: ${stats.beaconsSent}`);

console.log('\n✅ ABFT Demo Complete!');
console.log('🔗 Check Hashscan:');
console.log('   https://hashscan.io/mainnet/topic/0.0.10416185');

hcsGossip.stop();
process.exit(0);
