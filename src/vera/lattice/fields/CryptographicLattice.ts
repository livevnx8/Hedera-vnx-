/**
 * Cryptographic Lattice Field
 * 6D: key-validity, signature, hash, consensus, latency, cost
 * For HCS/HTS optimization and cryptographic decision-making
 */

import { ReasoningFieldImpl } from '../core/LatticeField.js';

export interface CryptographicData {
  keyValidity: number;    // 0-1: Is the key valid?
  signature: number;      // 0-1: Signature verification strength
  hash: number;           // 0-1: Hash integrity
  consensus: number;      // 0-1: Network consensus level
  latency: number;        // 0-1: Response time (1 = fast)
  cost: number;           // 0-1: Cost efficiency (1 = cheap)
}

export class CryptographicLattice extends ReasoningFieldImpl {
  constructor() {
    super(
      'cryptographic',
      'Cryptographic Operations Optimization',
      ['key-validity', 'signature', 'hash', 'consensus', 'latency', 'cost']
    );
  }

  /**
   * Analyze transaction parameters for optimal execution
   */
  analyzeTransaction(txId: string, data: Partial<CryptographicData>): void {
    const hypothesis = `Transaction ${txId} can be executed with optimal parameters`;
    
    const metadata = {
      txId,
      type: 'TRANSACTION_ANALYSIS',
      cryptoScores: {
        keyValidity: data.keyValidity ?? 1.0,
        signature: data.signature ?? 1.0,
        hash: data.hash ?? 1.0,
        consensus: data.consensus ?? 0.95,
        latency: data.latency ?? 0.8,
        cost: data.cost ?? 0.9,
      }
    };

    const node = this.superpose(hypothesis, metadata);
    
    // Add evidence
    if (data.keyValidity !== undefined) {
      this.addEvidenceToNode(node.id, `Key validity: ${(data.keyValidity * 100).toFixed(0)}%`, data.keyValidity);
    }
    if (data.signature !== undefined) {
      this.addEvidenceToNode(node.id, `Signature strength: ${(data.signature * 100).toFixed(0)}%`, data.signature);
    }
    if (data.latency !== undefined) {
      this.addEvidenceToNode(node.id, `Latency acceptable`, data.latency);
    }
    if (data.cost !== undefined) {
      this.addEvidenceToNode(node.id, `Cost efficient`, data.cost);
    }
  }

  /**
   * Calculate optimal execution confidence
   */
  calculateExecutionConfidence(nodeId: string): number | null {
    const node = this.nodes.get(nodeId) as any;
    if (!node) return null;

    const scores = node.metadata?.cryptoScores as CryptographicData;
    if (!scores) return node.confidence;

    // Weight by importance for transaction execution
    const weights = {
      keyValidity: 0.25,
      signature: 0.20,
      hash: 0.15,
      consensus: 0.20,
      latency: 0.10,
      cost: 0.10,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [dimension, score] of Object.entries(scores)) {
      const weight = weights[dimension as keyof typeof weights] || 0.15;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get optimal transaction parameters
   */
  getOptimalParams(txId: string): {
    canExecute: boolean;
    confidence: number;
    recommendedGas: number;
    expectedLatency: number;
  } {
    for (const node of this.nodes.values()) {
      if (node.metadata?.txId === txId) {
        const confidence = this.calculateExecutionConfidence(node.id) || node.confidence;
        const scores = node.metadata?.cryptoScores as CryptographicData;
        
        return {
          canExecute: confidence > 0.75,
          confidence,
          recommendedGas: scores ? this.calculateGas(scores) : 100000,
          expectedLatency: scores ? this.calculateLatency(scores) : 3000,
        };
      }
    }

    return { canExecute: false, confidence: 0, recommendedGas: 0, expectedLatency: 0 };
  }

  private calculateGas(scores: CryptographicData): number {
    // Base gas on network conditions
    const baseGas = 50000;
    const congestionFactor = (1 - scores.consensus) * 2;
    return Math.round(baseGas * (1 + congestionFactor));
  }

  private calculateLatency(scores: CryptographicData): number {
    // Expected latency in ms
    const baseLatency = 2000;
    return Math.round(baseLatency / scores.latency);
  }

  private addEvidenceToNode(nodeId: string, evidence: string, weight: number): void {
    const node = this.nodes.get(nodeId) as any;
    if (node && node.addEvidence) {
      node.addEvidence(evidence, weight);
    }
  }
}

export default CryptographicLattice;
