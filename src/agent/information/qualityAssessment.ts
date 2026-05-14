/**
 * Information Quality Assessment System for Vera
 * 
 * Evaluates source credibility, bias detection, and information quality
 * using multiple metrics and heuristics.
 */

import { InformationSource, SourceType, InformationItem } from './fusionEngine.js';
import { logger } from '../../monitoring/logger.js';

export interface QualityMetrics {
  credibility: number;
  reliability: number;
  objectivity: number;
  completeness: number;
  timeliness: number;
  accuracy: number;
  overall: number;
}

export interface BiasAnalysis {
  politicalBias: number; // -1 (left) to 1 (right)
  commercialBias: number; // 0 to 1
  emotionalBias: number; // 0 to 1
  confirmationBias: number; // 0 to 1
  overallBias: number; // 0 to 1
}

export interface SourceReputation {
  domainAuthority: number;
  citationCount: number;
  peerReviewStatus: boolean;
  editorialStandards: number;
  factCheckRecord: number;
  correctionPolicy: boolean;
  reliability: number;
}

export interface ContentAnalysis {
  factualDensity: number;
  sourceCitation: number;
  logicalCoherence: number;
  evidenceQuality: number;
  expertiseLevel: number;
  technicalAccuracy: number;
}

export class QualityAssessment {
  private sourceReputations: Map<string, SourceReputation> = new Map();
  private qualityThresholds: QualityMetrics = {
    credibility: 0.7,
    reliability: 0.7,
    objectivity: 0.6,
    completeness: 0.5,
    timeliness: 0.8,
    accuracy: 0.8,
    overall: 0.7
  };

  // Main assessment method
  async assessInformationQuality(item: InformationItem, source?: InformationSource): Promise<QualityMetrics> {
    try {
      const contentAnalysis = await this.analyzeContent(item);
      const biasAnalysis = await this.analyzeBias(item, source);
      const sourceReputation = source ? await this.getSourceReputation(source.url) : null;

      const metrics: QualityMetrics = {
        credibility: this.calculateCredibility(contentAnalysis, biasAnalysis, sourceReputation),
        reliability: this.calculateReliability(contentAnalysis, sourceReputation),
        objectivity: this.calculateObjectivity(biasAnalysis),
        completeness: this.calculateCompleteness(contentAnalysis),
        timeliness: this.calculateTimeliness(item),
        accuracy: this.calculateAccuracy(contentAnalysis, sourceReputation),
        overall: 0 // Will be calculated below
      };

      // Calculate overall quality as weighted average
      metrics.overall = this.calculateOverallQuality(metrics);

      logger.debug('Quality assessment completed', { 
        itemId: item.id, 
        overall: metrics.overall 
      });

      return metrics;

    } catch (error) {
      logger.error('Error assessing information quality', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        itemId: item.id 
      });
      
      // Return default metrics on error
      return {
        credibility: 0.5,
        reliability: 0.5,
        objectivity: 0.5,
        completeness: 0.5,
        timeliness: 0.5,
        accuracy: 0.5,
        overall: 0.5
      };
    }
  }

  // Source credibility assessment
  async assessSourceCredibility(source: InformationSource): Promise<QualityMetrics> {
    try {
      const reputation = await this.getSourceReputation(source.url);
      const domainAnalysis = await this.analyzeDomain(source.url);
      const historicalPerformance = await this.getHistoricalPerformance(source.id);

      const metrics: QualityMetrics = {
        credibility: this.calculateSourceCredibility(source, reputation, domainAnalysis),
        reliability: this.calculateSourceReliability(source, historicalPerformance),
        objectivity: this.calculateSourceObjectivity(source, reputation),
        completeness: this.calculateSourceCompleteness(source, domainAnalysis),
        timeliness: this.calculateSourceTimeliness(source),
        accuracy: this.calculateSourceAccuracy(source, reputation),
        overall: 0
      };

      metrics.overall = this.calculateOverallQuality(metrics);

      return metrics;

    } catch (error) {
      logger.error('Error assessing source credibility', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        sourceId: source.id 
      });
      
      return {
        credibility: source.credibility,
        reliability: source.credibility,
        objectivity: 1 - source.bias,
        completeness: 0.5,
        timeliness: source.freshness,
        accuracy: source.credibility,
        overall: source.credibility
      };
    }
  }

  // Bias detection
  async detectBias(content: string, source?: InformationSource): Promise<BiasAnalysis> {
    try {
      const politicalBias = this.detectPoliticalBias(content);
      const commercialBias = this.detectCommercialBias(content);
      const emotionalBias = this.detectEmotionalBias(content);
      const confirmationBias = this.detectConfirmationBias(content);

      const overallBias = Math.max(
        Math.abs(politicalBias),
        commercialBias,
        emotionalBias,
        confirmationBias
      );

      return {
        politicalBias,
        commercialBias,
        emotionalBias,
        confirmationBias,
        overallBias
      };

    } catch (error) {
      logger.error('Error detecting bias', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        politicalBias: 0,
        commercialBias: 0,
        emotionalBias: 0,
        confirmationBias: 0,
        overallBias: 0
      };
    }
  }

  // Fact checking integration
  async factCheckClaim(claim: string, sources: string[] = []): Promise<{
    isVerified: boolean;
    confidence: number;
    supportingSources: string[];
    contradictingSources: string[];
    rating: 'true' | 'mostly_true' | 'half_true' | 'mostly_false' | 'false' | 'unverified';
  }> {
    try {
      // This would integrate with actual fact-checking APIs
      // For now, simulate fact checking
      
      const supportingSources: string[] = [];
      const contradictingSources: string[] = [];
      
      // Simulate source analysis
      for (const source of sources) {
        const random = Math.random();
        if (random > 0.7) {
          supportingSources.push(source);
        } else if (random < 0.3) {
          contradictingSources.push(source);
        }
      }

      const totalSources = supportingSources.length + contradictingSources.length;
      const confidence = totalSources > 0 ? supportingSources.length / totalSources : 0.5;
      
      let rating: 'true' | 'mostly_true' | 'half_true' | 'mostly_false' | 'false' | 'unverified';
      if (confidence >= 0.9) rating = 'true';
      else if (confidence >= 0.7) rating = 'mostly_true';
      else if (confidence >= 0.5) rating = 'half_true';
      else if (confidence >= 0.3) rating = 'mostly_false';
      else if (confidence >= 0.1) rating = 'false';
      else rating = 'unverified';

      return {
        isVerified: confidence >= 0.5,
        confidence,
        supportingSources,
        contradictingSources,
        rating
      };

    } catch (error) {
      logger.error('Error fact checking claim', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        claim: claim.substring(0, 100) 
      });
      
      return {
        isVerified: false,
        confidence: 0,
        supportingSources: [],
        contradictingSources: [],
        rating: 'unverified'
      };
    }
  }

  // Content analysis
  private async analyzeContent(item: InformationItem): Promise<ContentAnalysis> {
    const content = item.content;
    
    return {
      factualDensity: this.calculateFactualDensity(content),
      sourceCitation: this.calculateSourceCitation(content),
      logicalCoherence: this.calculateLogicalCoherence(content),
      evidenceQuality: this.calculateEvidenceQuality(content),
      expertiseLevel: this.calculateExpertiseLevel(content),
      technicalAccuracy: this.calculateTechnicalAccuracy(content)
    };
  }

  private calculateFactualDensity(content: string): number {
    // Count factual statements vs. opinions
    const words = content.split(/\s+/);
    const sentences = content.split(/[.!?]+/);
    
    // Look for patterns indicating facts (numbers, dates, specific entities)
    const factualPatterns = [
      /\d+/, // Numbers
      /\b\d{4}\b/, // Years
      /\$\d+/, // Money
      /\d+%/, // Percentages
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/ // Proper names
    ];

    let factualCount = 0;
    for (const pattern of factualPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        factualCount += matches.length;
      }
    }

    return Math.min(1, factualCount / Math.max(1, words.length / 20));
  }

  private calculateSourceCitation(content: string): number {
    // Look for citations and references
    const citationPatterns = [
      /\[.*?\]/, // [1], [Smith, 2023]
      /\(.*?\d{4}.*?\)/, // (Smith, 2023)
      /according to/i,
      /research shows/i,
      /studies indicate/i
    ];

    let citationCount = 0;
    for (const pattern of citationPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        citationCount += matches.length;
      }
    }

    const sentences = content.split(/[.!?]+/);
    return Math.min(1, citationCount / Math.max(1, sentences.length));
  }

  private calculateLogicalCoherence(content: string): number {
    // Simple coherence check based on transition words and structure
    const transitionWords = [
      'therefore', 'however', 'furthermore', 'moreover', 'consequently',
      'because', 'since', 'although', 'while', 'whereas', 'nevertheless'
    ];

    const sentences = content.split(/[.!?]+/);
    let transitionCount = 0;
    
    for (const sentence of sentences) {
      for (const word of transitionWords) {
        if (sentence.toLowerCase().includes(word)) {
          transitionCount++;
          break;
        }
      }
    }

    return Math.min(1, transitionCount / Math.max(1, sentences.length - 1));
  }

  private calculateEvidenceQuality(content: string): number {
    // Look for evidence indicators
    const evidenceIndicators = [
      /data shows/i,
      /evidence suggests/i,
      /research indicates/i,
      /studies found/i,
      /according to/i,
      /statistics show/i
    ];

    let evidenceCount = 0;
    for (const indicator of evidenceIndicators) {
      if (content.toLowerCase().match(indicator)) {
        evidenceCount++;
      }
    }

    return Math.min(1, evidenceCount / evidenceIndicators.length);
  }

  private calculateExpertiseLevel(content: string): number {
    // Look for technical terms and domain-specific language
    const technicalTerms = [
      'algorithm', 'methodology', 'analysis', 'hypothesis', 'empirical',
      'theoretical', 'quantitative', 'qualitative', 'statistical', 'experimental'
    ];

    let technicalCount = 0;
    for (const term of technicalTerms) {
      if (content.toLowerCase().includes(term)) {
        technicalCount++;
      }
    }

    return Math.min(1, technicalCount / 5); // Normalize to 5 terms max
  }

  private calculateTechnicalAccuracy(content: string): number {
    // Simplified accuracy check - would need domain-specific validation
    const accuracyIndicators = [
      'precisely', 'exactly', 'accurately', 'correctly', 'specifically'
    ];

    let accuracyCount = 0;
    for (const indicator of accuracyIndicators) {
      if (content.toLowerCase().includes(indicator)) {
        accuracyCount++;
      }
    }

    return Math.min(1, accuracyCount / accuracyIndicators.length);
  }

  // Bias analysis methods
  private async analyzeBias(item: InformationItem, source?: InformationSource): Promise<BiasAnalysis> {
    return this.detectBias(item.content, source);
  }

  private detectPoliticalBias(content: string): number {
    // Simple political bias detection based on keyword analysis
    const leftKeywords = ['progressive', 'liberal', 'social justice', 'equality', 'diversity'];
    const rightKeywords = ['conservative', 'traditional', 'free market', 'individual rights', 'limited government'];
    
    let leftScore = 0;
    let rightScore = 0;
    
    for (const keyword of leftKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        leftScore++;
      }
    }
    
    for (const keyword of rightKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        rightScore++;
      }
    }
    
    const total = leftScore + rightScore;
    if (total === 0) return 0;
    
    return (rightScore - leftScore) / total;
  }

  private detectCommercialBias(content: string): number {
    const commercialIndicators = [
      'buy now', 'limited time', 'special offer', 'discount', 'promotion',
      'product', 'service', 'brand', 'customer', 'purchase'
    ];

    let commercialCount = 0;
    for (const indicator of commercialIndicators) {
      if (content.toLowerCase().includes(indicator)) {
        commercialCount++;
      }
    }

    return Math.min(1, commercialCount / 5);
  }

  private detectEmotionalBias(content: string): number {
    const emotionalWords = [
      'amazing', 'terrible', 'wonderful', 'horrible', 'excellent', 'awful',
      'perfect', 'disaster', 'brilliant', 'catastrophe', 'love', 'hate'
    ];

    let emotionalCount = 0;
    for (const word of emotionalWords) {
      if (content.toLowerCase().includes(word)) {
        emotionalCount++;
      }
    }

    const words = content.split(/\s+/);
    return Math.min(1, emotionalCount / Math.max(1, words.length / 50));
  }

  private detectConfirmationBias(content: string): number {
    const confirmationIndicators = [
      'as expected', 'not surprisingly', 'obviously', 'clearly', 'undoubtedly',
      'of course', 'naturally', 'as anticipated'
    ];

    let confirmationCount = 0;
    for (const indicator of confirmationIndicators) {
      if (content.toLowerCase().includes(indicator)) {
        confirmationCount++;
      }
    }

    return Math.min(1, confirmationCount / confirmationIndicators.length);
  }

  // Source reputation methods
  private async getSourceReputation(url: string): Promise<SourceReputation> {
    // Check cache first
    const cached = this.sourceReputations.get(url);
    if (cached) {
      return cached;
    }

    // Simulate reputation analysis
    const domain = this.extractDomain(url);
    const reputation: SourceReputation = {
      domainAuthority: 0.5 + Math.random() * 0.5,
      citationCount: Math.floor(Math.random() * 1000),
      peerReviewStatus: Math.random() > 0.5,
      editorialStandards: 0.5 + Math.random() * 0.5,
      factCheckRecord: 0.3 + Math.random() * 0.7,
      correctionPolicy: Math.random() > 0.3,
      reliability: 0.6 + Math.random() * 0.4
    };

    this.sourceReputations.set(url, reputation);
    return reputation;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'unknown';
    }
  }

  private async analyzeDomain(url: string): Promise<{
    isNewsSite: boolean;
    isAcademic: boolean;
    isGovernment: boolean;
    ageInYears: number;
    trafficRank: number;
  }> {
    const domain = this.extractDomain(url);
    
    return {
      isNewsSite: domain.includes('news') || domain.includes(' cnn') || domain.includes('bbc'),
      isAcademic: domain.includes('edu') || domain.includes('ac.'),
      isGovernment: domain.includes('gov'),
      ageInYears: Math.floor(Math.random() * 20) + 1,
      trafficRank: Math.floor(Math.random() * 1000000) + 1
    };
  }

  private async getHistoricalPerformance(sourceId: string): Promise<{
    accuracy: number;
    reliability: number;
    updateFrequency: number;
    correctionRate: number;
  }> {
    return {
      accuracy: 0.6 + Math.random() * 0.4,
      reliability: 0.6 + Math.random() * 0.4,
      updateFrequency: Math.random() * 10, // Updates per day
      correctionRate: Math.random() * 0.1 // Corrections per article
    };
  }

  // Metric calculation methods
  private calculateCredibility(content: ContentAnalysis, bias: BiasAnalysis, reputation: SourceReputation | null): number {
    const contentScore = (content.factualDensity + content.evidenceQuality + content.technicalAccuracy) / 3;
    const biasScore = 1 - bias.overallBias;
    const reputationScore = reputation ? (reputation.domainAuthority + reputation.factCheckRecord) / 2 : 0.5;
    
    return (contentScore * 0.4 + biasScore * 0.3 + reputationScore * 0.3);
  }

  private calculateReliability(content: ContentAnalysis, reputation: SourceReputation | null): number {
    const contentScore = (content.logicalCoherence + content.sourceCitation) / 2;
    const reputationScore = reputation ? reputation.reliability : 0.5;
    
    return (contentScore * 0.6 + reputationScore * 0.4);
  }

  private calculateObjectivity(bias: BiasAnalysis): number {
    return 1 - bias.overallBias;
  }

  private calculateCompleteness(content: ContentAnalysis): number {
    return (content.factualDensity + content.sourceCitation) / 2;
  }

  private calculateTimeliness(item: InformationItem): number {
    const ageInHours = (Date.now() - item.timestamp.getTime()) / (1000 * 60 * 60);
    return Math.max(0, 1 - (ageInHours / 168)); // Decay over 1 week
  }

  private calculateAccuracy(content: ContentAnalysis, reputation: SourceReputation | null): number {
    const contentScore = (content.technicalAccuracy + content.evidenceQuality) / 2;
    const reputationScore = reputation ? reputation.factCheckRecord : 0.5;
    
    return (contentScore * 0.7 + reputationScore * 0.3);
  }

  private calculateOverallQuality(metrics: QualityMetrics): number {
    const weights = {
      credibility: 0.25,
      reliability: 0.20,
      objectivity: 0.15,
      completeness: 0.10,
      timeliness: 0.15,
      accuracy: 0.15
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (metrics[key as keyof QualityMetrics] * weight);
    }, 0);
  }

  // Source-specific calculations
  private calculateSourceCredibility(source: InformationSource, reputation: SourceReputation, domain: any): number {
    const baseCredibility = source.credibility;
    const reputationScore = (reputation.domainAuthority + reputation.factCheckRecord) / 2;
    const domainScore = domain.isAcademic ? 0.9 : domain.isGovernment ? 0.85 : domain.isNewsSite ? 0.7 : 0.5;
    
    return (baseCredibility * 0.4 + reputationScore * 0.3 + domainScore * 0.3);
  }

  private calculateSourceReliability(source: InformationSource, performance: any): number {
    return (source.credibility + performance.accuracy + performance.reliability) / 3;
  }

  private calculateSourceObjectivity(source: InformationSource, reputation: SourceReputation): number {
    return 1 - source.bias;
  }

  private calculateSourceCompleteness(source: InformationSource, domain: any): number {
    return domain.isAcademic ? 0.8 : 0.6;
  }

  private calculateSourceTimeliness(source: InformationSource): number {
    return source.freshness;
  }

  private calculateSourceAccuracy(source: InformationSource, reputation: SourceReputation): number {
    return (source.credibility + reputation.factCheckRecord) / 2;
  }

  // Public API
  getQualityThresholds(): QualityMetrics {
    return { ...this.qualityThresholds };
  }

  setQualityThresholds(thresholds: Partial<QualityMetrics>): void {
    this.qualityThresholds = { ...this.qualityThresholds, ...thresholds };
  }

  async updateSourceReputation(url: string, feedback: {
    accurate?: boolean;
    biased?: boolean;
    complete?: boolean;
  }): Promise<void> {
    const reputation = await this.getSourceReputation(url);
    
    if (feedback.accurate !== undefined) {
      reputation.factCheckRecord = feedback.accurate ? 
        Math.min(1, reputation.factCheckRecord + 0.1) : 
        Math.max(0, reputation.factCheckRecord - 0.1);
    }
    
    this.sourceReputations.set(url, reputation);
  }
}
