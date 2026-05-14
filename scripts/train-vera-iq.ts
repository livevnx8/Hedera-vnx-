/**
 * Vera IQ Training Script
 * 
 * Improves weak areas identified in IQ test:
 * - Pattern Recognition (40% → target 80%+)
 * - Cross-domain connections
 * - Causal chain detection
 * - Knowledge base enrichment
 */

import { getReasoningGraph } from '../src/agent/reasoning/reasoningGraph.js';
import { generalKnowledge } from '../src/agent/general-knowledge.js';
import { logger } from '../src/monitoring/logger.js';

class VeraIQTrainer {
  private reasoningGraph = getReasoningGraph();
  
  async runTraining(): Promise<void> {
    console.log('🎓 Starting Vera IQ Training...\n');
    
    // Phase 1: Enrich knowledge base
    await this.enrichKnowledgeBase();
    
    // Phase 2: Build causal chains
    await this.buildCausalChains();
    
    // Phase 3: Create cross-domain patterns
    await this.createCrossDomainPatterns();
    
    // Phase 4: Strengthen pattern recognition
    await this.strengthenPatternRecognition();
    
    console.log('\n✅ Training Complete!');
    console.log('Run "node dist/scripts/test-vera-iq.js" to see improved scores.\n');
  }
  
  private async enrichKnowledgeBase(): Promise<void> {
    console.log('📚 Phase 1: Enriching Knowledge Base...');
    
      const knowledgeItems = [
      // Blockchain domain
      {
        domain: 'technology',
        topic: 'blockchain',
        content: 'Blockchain is a distributed ledger technology that maintains a continuously growing list of records called blocks',
        facts: ['Distributed across many nodes', 'Uses cryptographic hashing', 'Immutable once recorded'],
        concepts: ['distributed systems', 'cryptography', 'consensus'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.95
      },
      {
        domain: 'technology',
        topic: 'consensus',
        content: 'Consensus mechanisms ensure all nodes agree on the state of the blockchain',
        facts: ['Proof of Work uses computational power', 'Proof of Stake uses token ownership', 'Byzantine Fault Tolerance handles malicious nodes'],
        concepts: ['proof of work', 'proof of stake', 'bft'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.92
      },
      {
        domain: 'technology',
        topic: 'hedera',
        content: 'Hedera Hashgraph uses the hashgraph consensus algorithm instead of blockchain',
        facts: ['Uses gossip about gossip', 'Virtual voting mechanism', 'Asynchronous Byzantine Fault Tolerant'],
        concepts: ['hashgraph', 'gossip protocol', 'abft'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.94
      },
      {
        domain: 'technology',
        topic: 'hts',
        content: 'Hedera Token Service (HTS) allows creation and management of native tokens',
        facts: ['Native to Hedera', 'Low fees', 'Built-in compliance features'],
        concepts: ['tokenization', 'compliance', 'native tokens'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.93
      },
      // Science domain
      {
        domain: 'science',
        topic: 'quantum mechanics',
        content: 'Quantum mechanics describes physics at the atomic and subatomic scales',
        facts: ['Wave-particle duality', 'Uncertainty principle', 'Quantum entanglement'],
        concepts: ['superposition', 'entanglement', 'wave function'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.90
      },
      // Mathematics domain  
      {
        domain: 'science',
        topic: 'graph theory',
        content: 'Graph theory studies relationships between objects using nodes and edges',
        facts: ['Nodes represent entities', 'Edges represent relationships', 'Paths connect nodes'],
        concepts: ['vertices', 'edges', 'paths', 'cycles'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.91
      },
      // Economics domain
      {
        domain: 'current_events',
        topic: 'tokenomics',
        content: 'Tokenomics studies the economics of cryptocurrency tokens',
        facts: ['Supply mechanics', 'Demand drivers', 'Incentive structures'],
        concepts: ['supply and demand', 'scarcity', 'utility'],
        relationships: [],
        sources: ['training'],
        lastVerified: new Date(),
        confidence: 0.88
      }
    ];
    
    let added = 0;
    for (const item of knowledgeItems) {
      try {
        await generalKnowledge.addKnowledgeItem(item);
        added++;
      } catch (e) {
        // Item may already exist
      }
    }
    
    console.log(`   ✓ Added ${added} knowledge items to general knowledge\n`);
    
    // Also add to reasoning graph with connections
    const nodeIds = ['kb-blockchain-1', 'kb-blockchain-2', 'kb-hedera-1', 'kb-hts-1', 'kb-physics-1', 'kb-math-1', 'kb-econ-1'];
    let nodeIndex = 0;
    for (const item of knowledgeItems) {
      this.reasoningGraph.addNode({
        id: nodeIds[nodeIndex++],
        type: 'fact',
        content: item.content,
        confidence: item.confidence,
        embedding: undefined,
        metadata: { 
          domain: item.domain, 
          topic: item.topic,
          concepts: item.concepts 
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 0.8,
        tags: ['training', item.domain, item.topic]
      });
    }
    
    console.log(`   ✓ Added ${knowledgeItems.length} nodes to reasoning graph\n`);
  }
  
  private async buildCausalChains(): Promise<void> {
    console.log('🔗 Phase 2: Building Causal Chains...');
    
    // Create causal relationships
    const causalEdges = [
      // Blockchain → Consensus mechanisms
      { from: 'kb-blockchain-1', to: 'kb-blockchain-2', type: 'causes', strength: 0.9 },
      // Blockchain requires distributed systems
      { from: 'kb-blockchain-1', to: 'kb-math-1', type: 'related', strength: 0.7 },
      // Hedera improves on blockchain
      { from: 'kb-blockchain-1', to: 'kb-hedera-1', type: 'related', strength: 0.8 },
      // HTS enables tokenomics
      { from: 'kb-hts-1', to: 'kb-econ-1', type: 'causes', strength: 0.85 },
      // Consensus enables distributed systems
      { from: 'kb-blockchain-2', to: 'kb-math-1', type: 'supports', strength: 0.75 },
      // Hashgraph is a type of consensus
      { from: 'kb-hedera-1', to: 'kb-blockchain-2', type: 'exemplifies', strength: 0.9 },
      // Quantum physics relates to cryptography
      { from: 'kb-physics-1', to: 'kb-blockchain-1', type: 'related', strength: 0.6 }
    ];
    
    let added = 0;
    for (const edge of causalEdges) {
      try {
        this.reasoningGraph.addEdge({
          id: `training-edge-${added}`,
          fromNode: edge.from,
          toNode: edge.to,
          type: edge.type as any,
          strength: edge.strength,
          evidence: [],
          bidirectional: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        });
        added++;
      } catch (e) {
        // Edge may already exist
      }
    }
    
    console.log(`   ✓ Created ${added} causal relationships\n`);
  }
  
  private async createCrossDomainPatterns(): Promise<void> {
    console.log('🌐 Phase 3: Creating Cross-Domain Patterns...');
    
    // Create explicit cross-domain analogies
    const crossDomainPatterns = [
      {
        domains: ['technology', 'mathematics'],
        pattern: 'network_topology',
        description: 'Blockchain networks follow graph theory principles',
        nodes: ['kb-blockchain-1', 'kb-math-1']
      },
      {
        domains: ['science', 'technology'],
        pattern: 'distributed_systems',
        description: 'Quantum entanglement and distributed ledgers both involve distributed state',
        nodes: ['kb-physics-1', 'kb-blockchain-1']
      },
      {
        domains: ['technology', 'economics'],
        pattern: 'value_transfer',
        description: 'Tokenomics and consensus both manage value and incentives',
        nodes: ['kb-blockchain-2', 'kb-econ-1']
      }
    ];
    
    // Add pattern recognition nodes
    for (let i = 0; i < crossDomainPatterns.length; i++) {
      const pattern = crossDomainPatterns[i];
      
      this.reasoningGraph.addNode({
        id: `pattern-${i}`,
        type: 'concept',
        content: `Pattern: ${pattern.pattern} - ${pattern.description}`,
        confidence: 0.85,
        embedding: undefined,
        metadata: { 
          pattern_type: 'cross_domain',
          domains: pattern.domains 
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 0.9,
        tags: ['pattern', 'cross-domain', ...pattern.domains]
      });
      
      // Connect pattern to its constituent nodes
      for (const nodeId of pattern.nodes) {
        this.reasoningGraph.addEdge({
          id: `pattern-edge-${i}-${nodeId}`,
          fromNode: `pattern-${i}`,
          toNode: nodeId,
          type: 'related',
          strength: 0.8,
          evidence: [],
          bidirectional: true,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    console.log(`   ✓ Created ${crossDomainPatterns.length} cross-domain patterns\n`);
  }
  
  private async strengthenPatternRecognition(): Promise<void> {
    console.log('🧠 Phase 4: Strengthening Pattern Recognition...');
    
    // Create longer causal chains for better pattern detection
    const chainData = [
      // Chain 1: Technology stack
      ['kb-blockchain-1', 'kb-blockchain-2', 'kb-hedera-1', 'kb-hts-1'],
      // Chain 2: Economic value
      ['kb-hts-1', 'kb-econ-1'],
      // Chain 3: Mathematical foundations
      ['kb-math-1', 'kb-blockchain-1', 'kb-blockchain-2']
    ];
    
    let chainEdges = 0;
    for (const chain of chainData) {
      for (let i = 0; i < chain.length - 1; i++) {
        try {
          this.reasoningGraph.addEdge({
            id: `chain-${chainEdges}`,
            fromNode: chain[i],
            toNode: chain[i + 1],
            type: 'implies',
            strength: 0.85,
            evidence: [],
            bidirectional: false,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date()
          });
          chainEdges++;
        } catch (e) {
          // Edge exists
        }
      }
    }
    
    console.log(`   ✓ Added ${chainEdges} chain edges for pattern detection\n`);
    
    // Run confidence propagation to strengthen the network
    console.log('⚡ Running confidence propagation...');
    this.reasoningGraph.propagateConfidence(5);
    console.log('   ✓ Confidence propagated through network\n');
  }
}

// Run training
const trainer = new VeraIQTrainer();
trainer.runTraining().catch(console.error);

export { VeraIQTrainer };
