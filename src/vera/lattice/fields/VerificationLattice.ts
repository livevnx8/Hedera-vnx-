/**
 * Vera Verification Lattice
 * 5D reasoning field for carbon credit verification
 * Dimensions: authenticity, certification, timestamp, geography, standards
 */

import { ReasoningFieldImpl } from '../core/LatticeField.js';
import type { LatticeNode } from '../../types/index.js';
import { logger } from '../../../monitoring/logger.js';

export interface CarbonCreditData {
  projectId: string;
  projectName: string;
  vintage: number;
  standard: 'VCS' | 'GoldStandard' | 'CAR' | 'CDM';
  certificationBody: string;
  location: {
    country: string;
    latitude: number;
    longitude: number;
  };
  carbonTons: number;
  issuanceDate: string;
  expiryDate?: string;
  hash: string;
}

export interface VerificationResult {
  decision: 'APPROVE' | 'REVIEW' | 'REJECT';
  confidence: number;
  requiresHumanReview: boolean;
  reasoning: string[];
  riskFactors: string[];
  dimensionScores: Record<string, number>;
}

export class VerificationLattice extends ReasoningFieldImpl {
  constructor() {
    super('verification', 'Carbon Credit Verification', [
      'authenticity',      // Dimension 1: Project data authenticity
      'certification',     // Dimension 2: Certification validity
      'timestamp',         // Dimension 3: Timestamp/vintage freshness
      'geography',         // Dimension 4: Geographic consistency
      'standards',         // Dimension 5: Standard compliance
    ]);
  }

  /**
   * Verify a carbon credit using multi-dimensional lattice reasoning
   */
  async verifyCredit(credit: CarbonCreditData): Promise<VerificationResult> {
    // Superpose verification hypotheses
    const hypotheses = [
      'Credit is legitimate based on project data',
      'Credit has been double-counted',
      'Project is certified but credit expired',
      'Verification data is incomplete',
      'Credit meets all standards',
      'Geographic location is suspicious',
      'Certification body has reputation issues',
    ];

    const nodes = this.superposeHypotheses(hypotheses);

    // Evaluate evidence across all dimensions
    await this.evaluateEvidence(credit, nodes);

    // Calculate dimension scores
    const dimensionScores = this.calculateDimensionScores(nodes, credit);

    // Make decision based on collapsed nodes
    const result = this.makeDecision(nodes, dimensionScores);

    // Log verification to HCS
    logger.info('VerificationLattice', {
      message: 'Credit verification complete',
      projectId: credit.projectId,
      decision: result.decision,
      confidence: result.confidence,
    });

    return result;
  }

  private async evaluateEvidence(credit: CarbonCreditData, nodes: LatticeNode[]): Promise<void> {
    // Evidence for each hypothesis
    const evidence: Record<string, string[]> = {
      'Credit is legitimate based on project data': [
        credit.projectName ? 'Project name provided' : 'Missing project name',
        credit.carbonTons > 0 ? 'Valid carbon tonnage' : 'Invalid tonnage',
        credit.vintage > 2000 ? 'Valid vintage year' : 'Suspicious vintage',
      ],
      'Credit has been double-counted': [
        `Project ID: ${credit.projectId}`,
        'Checking for duplicate claims...',
      ],
      'Project is certified but credit expired': [
        credit.expiryDate ? `Expires: ${credit.expiryDate}` : 'No expiry date',
        `Issued: ${credit.issuanceDate}`,
      ],
      'Verification data is incomplete': [
        credit.location.latitude ? 'Location data present' : 'Missing coordinates',
        credit.hash ? 'Hash provided' : 'Missing verification hash',
      ],
      'Credit meets all standards': [
        `Standard: ${credit.standard}`,
        ['VCS', 'GoldStandard', 'CAR'].includes(credit.standard) 
          ? 'Recognized standard' 
          : 'Non-standard certification',
      ],
      'Geographic location is suspicious': [
        `Location: ${credit.location.country}`,
        this.isHighRiskCountry(credit.location.country) 
          ? 'High-risk jurisdiction' 
          : 'Standard jurisdiction',
      ],
      'Certification body has reputation issues': [
        `Certifier: ${credit.certificationBody}`,
      ],
    };

    // Add evidence to nodes and trigger collapse
    for (const node of nodes) {
      const nodeEvidence = evidence[node.hypothesis] || [];
      
      // Filter only positive evidence
      const positiveEvidence = nodeEvidence.filter(e => !e.includes('Missing') && !e.includes('Suspicious'));
      
      if (positiveEvidence.length > 0) {
        (node as any).addEvidence(positiveEvidence.join(', '), 0.15 * positiveEvidence.length);
      }

      // Negative evidence
      const negativeEvidence = nodeEvidence.filter(e => e.includes('Missing') || e.includes('Suspicious'));
      if (negativeEvidence.length > 0) {
        (node as any).addEvidence(negativeEvidence.join(', '), -0.1 * negativeEvidence.length);
      }
    }
  }

  private calculateDimensionScores(nodes: LatticeNode[], credit: CarbonCreditData): Record<string, number> {
    // Map nodes to dimensions
    const dimensionMap: Record<string, number[]> = {
      authenticity: [],
      certification: [],
      timestamp: [],
      geography: [],
      standards: [],
    };

    // Score based on node confidences
    dimensionMap.authenticity.push(nodes[0].confidence); // Legitimate
    dimensionMap.authenticity.push(1 - nodes[1].confidence); // Not double-counted (inverse)

    dimensionMap.certification.push(nodes[2].confidence < 0.3 ? 1 : 0.5); // Not expired
    dimensionMap.certification.push(1 - nodes[6].confidence); // No certifier issues (inverse)

    dimensionMap.timestamp.push(nodes[2].confidence); // Freshness

    dimensionMap.geography.push(1 - nodes[5].confidence); // Not suspicious (inverse)

    dimensionMap.standards.push(nodes[4].confidence); // Meets standards
    dimensionMap.standards.push(nodes[3].confidence); // Data complete

    // Calculate averages
    return {
      authenticity: this.average(dimensionMap.authenticity),
      certification: this.average(dimensionMap.certification),
      timestamp: this.average(dimensionMap.timestamp),
      geography: this.average(dimensionMap.geography),
      standards: this.average(dimensionMap.standards),
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private makeDecision(nodes: LatticeNode[], dimensionScores: Record<string, number>): VerificationResult {
    // Calculate overall confidence
    const avgConfidence = Object.values(dimensionScores).reduce((a, b) => a + b, 0) / 5;

    // Identify risk factors
    const riskFactors: string[] = [];
    
    if (dimensionScores.authenticity < 0.7) {
      riskFactors.push('Project authenticity concerns');
    }
    if (dimensionScores.certification < 0.7) {
      riskFactors.push('Certification issues detected');
    }
    if (dimensionScores.timestamp < 0.7) {
      riskFactors.push('Vintage/timestamp concerns');
    }
    if (dimensionScores.geography < 0.7) {
      riskFactors.push('Geographic risk factors present');
    }
    if (dimensionScores.standards < 0.7) {
      riskFactors.push('Standards compliance concerns');
    }

    // Check for specific red flags
    const doubleCounted = nodes[1].confidence > 0.6;
    const expired = nodes[2].confidence < 0.3;
    const incomplete = nodes[3].confidence < 0.5;

    if (doubleCounted) {
      riskFactors.push('Possible double-counting detected');
    }
    if (expired) {
      riskFactors.push('Credit may be expired');
    }
    if (incomplete) {
      riskFactors.push('Incomplete verification data');
    }

    // Build reasoning
    const reasoning: string[] = [];
    
    if (avgConfidence > 0.8) {
      reasoning.push(`Project appears valid (${Math.round(dimensionScores.authenticity * 100)}% authenticity)`);
      reasoning.push(`Certification checks passed (${Math.round(dimensionScores.certification * 100)}%)`);
      reasoning.push(`Standards compliance confirmed (${Math.round(dimensionScores.standards * 100)}%)`);
    } else if (avgConfidence > 0.5) {
      reasoning.push(`Project partially validated (${Math.round(avgConfidence * 100)}% overall confidence)`);
      reasoning.push('Some concerns identified requiring review');
    } else {
      reasoning.push('Multiple validation failures detected');
      reasoning.push('Recommend rejection pending clarification');
    }

    // Determine decision
    let decision: VerificationResult['decision'];
    
    if (avgConfidence > 0.85 && riskFactors.length === 0) {
      decision = 'APPROVE';
    } else if (avgConfidence < 0.4 || riskFactors.length > 3) {
      decision = 'REJECT';
    } else {
      decision = 'REVIEW';
    }

    return {
      decision,
      confidence: avgConfidence,
      requiresHumanReview: decision === 'REVIEW' || riskFactors.length > 0,
      reasoning,
      riskFactors,
      dimensionScores,
    };
  }

  private isHighRiskCountry(country: string): boolean {
    const highRiskCountries = [
      'high_risk_jurisdiction_1',
      'high_risk_jurisdiction_2',
      // Add actual high-risk countries as needed
    ];
    return highRiskCountries.includes(country.toLowerCase());
  }
}

// Singleton instance
export const verificationLattice = new VerificationLattice();
export default verificationLattice;
