/**
 * Interference Calculator
 * Calculates constructive and destructive interference between hypotheses
 */

import { LatticeNode } from './LatticeNode.js';
import { EntanglementGraph } from './EntanglementGraph.js';

export interface InterferenceResult {
  interferenceType: 'constructive' | 'destructive' | 'neutral';
  magnitude: number;  // 0 to 1
  overlap: number;    // Degree of hypothesis overlap
  correlation: number; // -1 to 1
}

export class InterferenceCalculator {
  constructor(private entanglementGraph: EntanglementGraph) {}

  /**
   * Calculate interference between two nodes
   */
  calculate(nodeA: LatticeNode, nodeB: LatticeNode): InterferenceResult {
    // Distance-based interference
    const distance = nodeA.distanceTo(nodeB);
    const maxDistance = Math.sqrt(nodeA.coordinates.length * 100); // Normalized
    const proximityFactor = Math.max(0, 1 - distance / maxDistance);
    
    // Check for explicit entanglement
    const entanglement = this.entanglementGraph.getEntanglement(nodeA.id, nodeB.id);
    
    if (entanglement) {
      const magnitude = proximityFactor * entanglement.strength;
      return {
        interferenceType: entanglement.correlation > 0 ? 'constructive' : 'destructive',
        magnitude,
        overlap: proximityFactor,
        correlation: entanglement.correlation,
      };
    }
    
    // Calculate implicit interference based on hypothesis similarity
    const similarity = this.calculateHypothesisSimilarity(nodeA.hypothesis, nodeB.hypothesis);
    
    // Check if hypotheses support or contradict each other
    const correlation = this.inferCorrelation(nodeA, nodeB, similarity);
    
    const magnitude = proximityFactor * similarity;
    
    return {
      interferenceType: correlation > 0.3 ? 'constructive' : correlation < -0.3 ? 'destructive' : 'neutral',
      magnitude,
      overlap: proximityFactor,
      correlation,
    };
  }

  /**
   * Calculate wave function interference for multiple nodes
   */
  calculateFieldInterference(nodes: LatticeNode[]): Map<string, number> {
    const interferenceScores = new Map<string, number>();
    
    for (const node of nodes) {
      let totalInterference = 0;
      
      for (const other of nodes) {
        if (node.id === other.id) continue;
        
        const result = this.calculate(node, other);
        
        // Constructive interference adds, destructive subtracts
        if (result.interferenceType === 'constructive') {
          totalInterference += result.magnitude * result.correlation;
        } else if (result.interferenceType === 'destructive') {
          totalInterference -= result.magnitude * Math.abs(result.correlation);
        }
      }
      
      interferenceScores.set(node.id, totalInterference);
    }
    
    return interferenceScores;
  }

  /**
   * Find the most coherent set of hypotheses
   */
  findCoherentSet(nodes: LatticeNode[], minCoherence = 0.7): LatticeNode[] {
    // Filter to superposed nodes only
    const superposed = nodes.filter(n => n.isSuperposed());
    
    if (superposed.length === 0) return [];
    
    // Sort by coherence
    const sorted = [...superposed].sort((a, b) => b.getCoherence() - a.getCoherence());
    
    const coherentSet: LatticeNode[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const candidate = sorted[i];
      let totalInterference = 0;
      
      // Check interference with all nodes in the set
      for (const member of coherentSet) {
        const result = this.calculate(candidate, member);
        totalInterference += result.correlation * result.magnitude;
      }
      
      // Add if net interference is positive (constructive)
      if (totalInterference > 0 && candidate.getCoherence() >= minCoherence) {
        coherentSet.push(candidate);
      }
    }
    
    return coherentSet;
  }

  /**
   * Calculate hypothesis similarity using simple keyword overlap
   */
  private calculateHypothesisSimilarity(h1: string, h2: string): number {
    const words1 = new Set(h1.toLowerCase().split(/\s+/));
    const words2 = new Set(h2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Infer correlation between two hypotheses based on content
   */
  private inferCorrelation(nodeA: LatticeNode, nodeB: LatticeNode, similarity: number): number {
    // Positive indicators
    const supporting = [
      'valid', 'true', 'correct', 'verified', 'confirmed', 'authentic',
      'secure', 'safe', 'optimal', 'efficient', 'profitable'
    ];
    
    // Negative indicators
    const contradicting = [
      'invalid', 'false', 'incorrect', 'unverified', 'fake', 'fraud',
      'insecure', 'risky', 'suboptimal', 'inefficient', 'loss'
    ];
    
    const h1 = nodeA.hypothesis.toLowerCase();
    const h2 = nodeB.hypothesis.toLowerCase();
    
    // Check for explicit contradictions
    const h1HasPositive = supporting.some(w => h1.includes(w));
    const h1HasNegative = contradicting.some(w => h1.includes(w));
    const h2HasPositive = supporting.some(w => h2.includes(w));
    const h2HasNegative = contradicting.some(w => h2.includes(w));
    
    if ((h1HasPositive && h2HasNegative) || (h1HasNegative && h2HasPositive)) {
      return -similarity; // Contradictory
    }
    
    if ((h1HasPositive && h2HasPositive) || (h1HasNegative && h2HasNegative)) {
      return similarity; // Supporting
    }
    
    // Default to similarity-based correlation
    return similarity * 0.5;
  }

  /**
   * Calculate field coherence (overall field stability)
   */
  calculateFieldCoherence(nodes: LatticeNode[]): number {
    if (nodes.length === 0) return 1;
    
    const coherenceScores = nodes.map(n => n.getCoherence());
    const avgCoherence = coherenceScores.reduce((a, b) => a + b, 0) / coherenceScores.length;
    
    // Count conflicts (destructive interference pairs)
    let conflicts = 0;
    let totalPairs = 0;
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const result = this.calculate(nodes[i], nodes[j]);
        if (result.interferenceType === 'destructive' && result.magnitude > 0.5) {
          conflicts++;
        }
        totalPairs++;
      }
    }
    
    const conflictRatio = totalPairs > 0 ? conflicts / totalPairs : 0;
    
    // Field coherence = average node coherence * (1 - conflict ratio)
    return avgCoherence * (1 - conflictRatio);
  }
}

export default InterferenceCalculator;
