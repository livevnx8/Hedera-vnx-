/**
 * Vera Lattice - Security Reasoning Field
 * 
 * Threat assessment, risk scoring, and compliance validation
 * Dimensions: threat_exposure, compliance_score, audit_trail_completeness, reputation_risk,
 *             access_control_integrity, encryption_strength, historical_security_incidents
 */

import { ReasoningFieldImpl, LatticeNodeImpl } from '../core/LatticeField.js';
import type { AgentRegistration } from '../../types/index.js';
import { logger } from '../../../monitoring/logger.js';

export interface SecurityProfile {
  agentId: string;
  threatExposure: number; // 0-1, lower is better
  complianceScore: number; // 0-1, higher is better
  auditTrailCompleteness: number; // 0-1
  accessControlLevel: 'none' | 'basic' | 'enhanced' | 'maximal';
  encryptionStandard: 'none' | 'aes128' | 'aes256' | 'quantum_safe';
  historicalIncidents: SecurityIncident[];
  lastSecurityAudit: number;
  certificateExpiry?: number;
}

export interface SecurityIncident {
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  resolved: boolean;
  resolutionTimeMs?: number;
}

export interface ComplianceFramework {
  name: string;
  version: string;
  requirements: string[];
  agentCompliance: Map<string, boolean>;
}

export interface ThreatAssessment {
  agentId: string;
  overallRisk: number; // 0-1
  threatVector: string[];
  recommendedMitigations: string[];
  requiresIsolation: boolean;
}

export class SecurityField extends ReasoningFieldImpl {
  private securityProfiles: Map<string, SecurityProfile> = new Map();
  private complianceFrameworks: Map<string, ComplianceFramework> = new Map();
  private threatIntelligence: Map<string, number> = new Map(); // threat type -> risk score

  constructor() {
    super('security', 'Security Assessment', [
      'threat_exposure',
      'compliance_score',
      'audit_trail_completeness',
      'reputation_risk',
      'access_control_integrity',
      'encryption_strength',
      'historical_security_incidents'
    ]);

    this.initializeThreatIntelligence();
    this.initializeComplianceFrameworks();
  }

  /**
   * Assess security risk for an agent
   */
  assessAgentRisk(agentId: string): ThreatAssessment {
    const profile = this.securityProfiles.get(agentId);
    
    if (!profile) {
      // Unknown agent - assume medium risk
      return {
        agentId,
        overallRisk: 0.5,
        threatVector: ['unknown_agent', 'no_audit_history'],
        recommendedMitigations: ['require_security_audit', 'limited_access'],
        requiresIsolation: false
      };
    }

    const threatVectors: string[] = [];
    const mitigations: string[] = [];

    // Check compliance
    if (profile.complianceScore < 0.7) {
      threatVectors.push('compliance_gaps');
      mitigations.push('compliance_training');
    }

    // Check historical incidents
    const unresolvedIncidents = profile.historicalIncidents.filter(i => !i.resolved);
    const criticalIncidents = profile.historicalIncidents.filter(i => i.severity === 'critical');
    
    if (unresolvedIncidents.length > 0) {
      threatVectors.push('unresolved_incidents');
      mitigations.push('immediate_incident_resolution');
    }
    
    if (criticalIncidents.length > 0) {
      threatVectors.push('historical_critical_breach');
      mitigations.push('security_audit_required');
    }

    // Check access control
    if (profile.accessControlLevel === 'none' || profile.accessControlLevel === 'basic') {
      threatVectors.push('weak_access_controls');
      mitigations.push('implement_mfa');
    }

    // Check encryption
    if (profile.encryptionStandard === 'none' || profile.encryptionStandard === 'aes128') {
      threatVectors.push('insufficient_encryption');
      mitigations.push('upgrade_encryption');
    }

    // Check audit trail
    if (profile.auditTrailCompleteness < 0.8) {
      threatVectors.push('incomplete_audit_trail');
      mitigations.push('enhance_logging');
    }

    // Check certificate expiry
    if (profile.certificateExpiry && profile.certificateExpiry < Date.now() + 86400000 * 7) {
      threatVectors.push('certificate_expiring');
      mitigations.push('renew_certificate');
    }

    // Calculate overall risk
    const baseRisk = profile.threatExposure;
    const incidentRisk = Math.min(1, unresolvedIncidents.length * 0.2 + criticalIncidents.length * 0.3);
    const complianceRisk = 1 - profile.complianceScore;
    const auditRisk = 1 - profile.auditTrailCompleteness;

    const overallRisk = Math.min(1, 
      baseRisk * 0.3 + 
      incidentRisk * 0.3 + 
      complianceRisk * 0.2 + 
      auditRisk * 0.2
    );

    return {
      agentId,
      overallRisk,
      threatVector: threatVectors,
      recommendedMitigations: mitigations,
      requiresIsolation: overallRisk > 0.8 || unresolvedIncidents.length > 2
    };
  }

  /**
   * Score an agent's compliance against active frameworks
   */
  scoreCompliance(agentId: string): { score: number; violations: string[]; passed: string[] } {
    const profile = this.securityProfiles.get(agentId);
    const violations: string[] = [];
    const passed: string[] = [];

    for (const framework of this.complianceFrameworks.values()) {
      const agentCompliant = framework.agentCompliance.get(agentId);
      
      if (agentCompliant === undefined) {
        violations.push(`not_assessed:${framework.name}`);
      } else if (agentCompliant) {
        passed.push(framework.name);
      } else {
        violations.push(`non_compliant:${framework.name}`);
      }
    }

    // Additional checks
    if (profile) {
      if (profile.accessControlLevel === 'none') {
        violations.push('no_access_control');
      } else {
        passed.push(`access_control:${profile.accessControlLevel}`);
      }

      if (profile.encryptionStandard === 'none') {
        violations.push('no_encryption');
      } else {
        passed.push(`encryption:${profile.encryptionStandard}`);
      }

      if (Date.now() - profile.lastSecurityAudit > 90 * 86400000) { // 90 days
        violations.push('audit_overdue');
      } else {
        passed.push('audit_current');
      }
    }

    const score = passed.length / (passed.length + violations.length);

    return { score, violations, passed };
  }

  /**
   * Calculate reputation risk based on security history
   */
  calculateReputationRisk(agentId: string): number {
    const profile = this.securityProfiles.get(agentId);
    if (!profile) return 0.5;

    const incidentWeights = {
      'low': 0.05,
      'medium': 0.15,
      'high': 0.3,
      'critical': 0.5
    };

    let riskScore = 0;
    let decayFactor = 1;

    // Sort incidents by recency
    const sortedIncidents = [...profile.historicalIncidents]
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const incident of sortedIncidents) {
      const weight = incidentWeights[incident.severity];
      const age = (Date.now() - incident.timestamp) / (365 * 86400000); // Years
      const timeDecay = Math.max(0.1, 1 - age * 0.5); // 50% decay per year

      if (!incident.resolved) {
        riskScore += weight * 1.5 * decayFactor; // 50% penalty for unresolved
      } else if (incident.resolutionTimeMs && incident.resolutionTimeMs > 86400000) {
        riskScore += weight * 0.8 * timeDecay; // Slow resolution penalty
      } else {
        riskScore += weight * 0.5 * timeDecay; // Normal resolved incident
      }

      decayFactor *= 0.9; // Further decay for older incidents
    }

    // Add base risk factors
    if (profile.threatExposure > 0.7) riskScore += 0.1;
    if (profile.complianceScore < 0.5) riskScore += 0.1;

    return Math.min(1, riskScore);
  }

  /**
   * Validate if an agent meets security requirements for a task
   */
  validateTaskSecurityRequirements(
    agentId: string,
    requirements: {
      minComplianceScore?: number;
      maxRiskLevel?: number;
      requiredEncryption?: string;
      requireAuditTrail?: boolean;
    }
  ): { valid: boolean; issues: string[]; score: number } {
    const profile = this.securityProfiles.get(agentId);
    const issues: string[] = [];

    if (!profile) {
      return { valid: false, issues: ['no_security_profile'], score: 0 };
    }

    const assessment = this.assessAgentRisk(agentId);
    const compliance = this.scoreCompliance(agentId);

    // Check compliance score
    if (requirements.minComplianceScore !== undefined) {
      if (compliance.score < requirements.minComplianceScore) {
        issues.push(`compliance_score_${compliance.score.toFixed(2)}_below_${requirements.minComplianceScore}`);
      }
    }

    // Check risk level
    if (requirements.maxRiskLevel !== undefined) {
      if (assessment.overallRisk > requirements.maxRiskLevel) {
        issues.push(`risk_level_${assessment.overallRisk.toFixed(2)}_exceeds_${requirements.maxRiskLevel}`);
      }
    }

    // Check encryption
    if (requirements.requiredEncryption) {
      const encryptionLevels = ['none', 'aes128', 'aes256', 'quantum_safe'];
      const requiredIndex = encryptionLevels.indexOf(requirements.requiredEncryption);
      const actualIndex = encryptionLevels.indexOf(profile.encryptionStandard);
      
      if (actualIndex < requiredIndex) {
        issues.push(`encryption_${profile.encryptionStandard}_below_required_${requirements.requiredEncryption}`);
      }
    }

    // Check audit trail
    if (requirements.requireAuditTrail && profile.auditTrailCompleteness < 0.9) {
      issues.push(`audit_trail_incomplete_${(profile.auditTrailCompleteness * 100).toFixed(0)}%`);
    }

    const score = 1 - (issues.length * 0.1);
    return { valid: issues.length === 0, issues, score };
  }

  /**
   * Record a security incident
   */
  recordIncident(agentId: string, incident: Omit<SecurityIncident, 'timestamp'>): void {
    const profile = this.securityProfiles.get(agentId);
    if (!profile) {
      // Create default profile for unknown agent
      this.securityProfiles.set(agentId, {
        agentId,
        threatExposure: 0.5,
        complianceScore: 0.5,
        auditTrailCompleteness: 0.5,
        accessControlLevel: 'basic',
        encryptionStandard: 'aes128',
        historicalIncidents: [],
        lastSecurityAudit: 0
      });
    }

    const fullIncident: SecurityIncident = {
      ...incident,
      timestamp: Date.now()
    };

    profile!.historicalIncidents.push(fullIncident);

    logger.warn('SecurityField', {
      message: 'Security incident recorded',
      agentId,
      severity: incident.severity,
      type: incident.type
    });

    // If critical, emit event
    if (incident.severity === 'critical') {
      this.emit('critical_incident', { agentId, incident: fullIncident });
    }
  }

  /**
   * Mark an incident as resolved
   */
  resolveIncident(agentId: string, incidentTimestamp: number): void {
    const profile = this.securityProfiles.get(agentId);
    if (!profile) return;

    const incident = profile.historicalIncidents.find(
      i => i.timestamp === incidentTimestamp && !i.resolved
    );

    if (incident) {
      incident.resolved = true;
      incident.resolutionTimeMs = Date.now() - incident.timestamp;

      logger.info('SecurityField', {
        message: 'Incident resolved',
        agentId,
        incidentType: incident.type,
        resolutionTimeMs: incident.resolutionTimeMs
      });
    }
  }

  /**
   * Register or update an agent's security profile
   */
  registerAgentProfile(profile: SecurityProfile): void {
    this.securityProfiles.set(profile.agentId, profile);

    logger.info('SecurityField', {
      message: 'Security profile registered',
      agentId: profile.agentId,
      complianceScore: profile.complianceScore,
      threatExposure: profile.threatExposure
    });
  }

  /**
   * Get agents that meet security criteria
   */
  getSecureAgents(
    minComplianceScore: number = 0.7,
    maxRiskLevel: number = 0.5
  ): string[] {
    const secureAgents: string[] = [];

    for (const [agentId, profile] of this.securityProfiles) {
      const assessment = this.assessAgentRisk(agentId);
      const compliance = this.scoreCompliance(agentId);

      if (compliance.score >= minComplianceScore && assessment.overallRisk <= maxRiskLevel) {
        secureAgents.push(agentId);
      }
    }

    return secureAgents;
  }

  /**
   * Get field-specific statistics
   */
  getSecurityStats(): {
    totalProfiles: number;
    averageComplianceScore: number;
    averageRiskLevel: number;
    totalIncidents: number;
    unresolvedIncidents: number;
    criticalIncidents: number;
  } {
    const profiles = Array.from(this.securityProfiles.values());
    const allIncidents = profiles.flatMap(p => p.historicalIncidents);

    const avgCompliance = profiles.length > 0
      ? profiles.reduce((sum, p) => sum + p.complianceScore, 0) / profiles.length
      : 0;

    const avgRisk = profiles.length > 0
      ? profiles.reduce((sum, p) => sum + this.assessAgentRisk(p.agentId).overallRisk, 0) / profiles.length
      : 0;

    return {
      totalProfiles: profiles.length,
      averageComplianceScore: avgCompliance,
      averageRiskLevel: avgRisk,
      totalIncidents: allIncidents.length,
      unresolvedIncidents: allIncidents.filter(i => !i.resolved).length,
      criticalIncidents: allIncidents.filter(i => i.severity === 'critical').length
    };
  }

  // Private initialization methods

  private initializeThreatIntelligence(): void {
    // Known threat types with base risk scores
    this.threatIntelligence.set('unauthorized_access', 0.8);
    this.threatIntelligence.set('data_exfiltration', 0.9);
    this.threatIntelligence.set('credential_compromise', 0.85);
    this.threatIntelligence.set('malware_infection', 0.75);
    this.threatIntelligence.set('ddos_attack', 0.6);
    this.threatIntelligence.set('api_abuse', 0.5);
    this.threatIntelligence.set('insider_threat', 0.9);
    this.threatIntelligence.set('supply_chain_attack', 0.85);
  }

  private initializeComplianceFrameworks(): void {
    // SOC 2 Type II
    this.complianceFrameworks.set('soc2', {
      name: 'SOC 2 Type II',
      version: '2024',
      requirements: [
        'security_policies',
        'access_controls',
        'system_monitoring',
        'incident_response',
        'change_management',
        'data_backup'
      ],
      agentCompliance: new Map()
    });

    // ISO 27001
    this.complianceFrameworks.set('iso27001', {
      name: 'ISO 27001',
      version: '2022',
      requirements: [
        'risk_assessment',
        'security_controls',
        'management_review',
        'internal_audit',
        'continuous_improvement'
      ],
      agentCompliance: new Map()
    });

    // GDPR
    this.complianceFrameworks.set('gdpr', {
      name: 'GDPR',
      version: '2018',
      requirements: [
        'data_protection',
        'consent_management',
        'right_to_erasure',
        'data_portability',
        'breach_notification'
      ],
      agentCompliance: new Map()
    });
  }
}

// Singleton instance
export const securityField = new SecurityField();
export default securityField;
