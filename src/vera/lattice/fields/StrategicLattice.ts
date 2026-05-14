/**
 * Strategic Lattice Field
 * 7D: positioning, advantage, partnership, risk, growth, resources, brand
 * For partnership and business strategy decision-making
 */

import { ReasoningFieldImpl } from '../core/LatticeField.js';

export interface StrategicData {
  positioning: number;    // 0-1: Market positioning strength
  advantage: number;      // 0-1: Competitive advantage
  partnership: number;  // 0-1: Partnership fit
  risk: number;           // 0-1: Risk level (1 = low risk)
  growth: number;         // 0-1: Growth potential
  resources: number;      // 0-1: Resource availability
  brand: number;          // 0-1: Brand alignment
}

export class StrategicLattice extends ReasoningFieldImpl {
  constructor() {
    super(
      'strategic',
      'Partnership & Strategy Analysis',
      ['positioning', 'advantage', 'partnership', 'risk', 'growth', 'resources', 'brand']
    );
  }

  /**
   * Analyze partnership opportunity
   */
  analyzePartnership(partnerId: string, data: Partial<StrategicData>): void {
    const hypothesis = `Partnership with ${partnerId} is strategically beneficial`;
    
    const metadata = {
      partnerId,
      type: 'PARTNERSHIP_ANALYSIS',
      strategyScores: {
        positioning: data.positioning ?? 0.5,
        advantage: data.advantage ?? 0.5,
        partnership: data.partnership ?? 0.5,
        risk: data.risk ?? 0.5,
        growth: data.growth ?? 0.5,
        resources: data.resources ?? 0.5,
        brand: data.brand ?? 0.5,
      }
    };

    const node = this.superpose(hypothesis, metadata);
    
    // Add evidence for each dimension
    if (data.positioning !== undefined) {
      this.addEvidenceToNode(node.id, `Market positioning: ${(data.positioning * 100).toFixed(0)}%`, data.positioning);
    }
    if (data.partnership !== undefined) {
      this.addEvidenceToNode(node.id, `Partnership fit: ${(data.partnership * 100).toFixed(0)}%`, data.partnership);
    }
    if (data.risk !== undefined) {
      this.addEvidenceToNode(node.id, `Risk assessment: ${(data.risk * 100).toFixed(0)}%`, data.risk);
    }
    if (data.growth !== undefined) {
      this.addEvidenceToNode(node.id, `Growth potential: ${(data.growth * 100).toFixed(0)}%`, data.growth);
    }
  }

  /**
   * Calculate strategic fit score
   */
  calculateStrategicFit(nodeId: string): number | null {
    const node = this.nodes.get(nodeId) as any;
    if (!node) return null;

    const scores = node.metadata?.strategyScores as StrategicData;
    if (!scores) return node.confidence;

    // Strategic weights - partnership and growth weighted higher
    const weights = {
      positioning: 0.15,
      advantage: 0.15,
      partnership: 0.20,
      risk: 0.15,
      growth: 0.15,
      resources: 0.10,
      brand: 0.10,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [dimension, score] of Object.entries(scores)) {
      const weight = weights[dimension as keyof typeof weights] || 0.1;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get partnership recommendation
   */
  getPartnershipRecommendation(partnerId: string): {
    proceed: boolean;
    confidence: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    reasoning: string[];
  } {
    for (const node of this.nodes.values()) {
      if (node.metadata?.partnerId === partnerId) {
        const fit = this.calculateStrategicFit(node.id) || node.confidence;
        const scores = node.metadata?.strategyScores as StrategicData;
        
        const reasoning: string[] = [];
        if (scores) {
          if (scores.partnership > 0.7) reasoning.push('Strong partnership fit');
          if (scores.risk < 0.3) reasoning.push('High risk detected');
          if (scores.growth > 0.7) reasoning.push('High growth potential');
          if (scores.positioning > 0.7) reasoning.push('Strong market positioning');
        }
        
        return {
          proceed: fit > 0.7 && node.confidence > 0.6,
          confidence: fit,
          riskLevel: scores?.risk > 0.7 ? 'LOW' : scores?.risk > 0.4 ? 'MEDIUM' : 'HIGH',
          reasoning: reasoning.length > 0 ? reasoning : ['Assessment complete'],
        };
      }
    }

    return { proceed: false, confidence: 0, riskLevel: 'HIGH', reasoning: ['No data available'] };
  }

  /**
   * Rank multiple partnership opportunities
   */
  rankPartnerships(): Array<{ partnerId: string; score: number; confidence: number }> {
    const rankings: Array<{ partnerId: string; score: number; confidence: number }> = [];
    
    for (const node of this.nodes.values()) {
      if (node.metadata?.type === 'PARTNERSHIP_ANALYSIS') {
        const score = this.calculateStrategicFit(node.id) || node.confidence;
        rankings.push({
          partnerId: node.metadata?.partnerId as string,
          score,
          confidence: node.confidence,
        });
      }
    }
    
    return rankings.sort((a, b) => b.score - a.score);
  }

  private addEvidenceToNode(nodeId: string, evidence: string, weight: number): void {
    const node = this.nodes.get(nodeId) as any;
    if (node && node.addEvidence) {
      node.addEvidence(evidence, weight);
    }
  }
}

export default StrategicLattice;
