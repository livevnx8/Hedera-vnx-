/**
 * Information Fusion Engine for Vera
 * 
 * Synthesizes information from multiple sources with quality assessment,
 * conflict resolution, and credibility scoring.
 */

import { ReasoningGraph, getReasoningGraph } from '../reasoning/reasoningGraph.js';
import { ReasoningNode, NodeType } from '../reasoning/graphNode.js';
import { ReasoningEdge, EdgeType, ReasoningEdgeFactory } from '../reasoning/graphEdge.js';
import { logger } from '../../monitoring/logger.js';

export interface InformationSource {
  id: string;
  url: string;
  type: SourceType;
  credibility: number;
  bias: number;
  freshness: number;
  relevance: number;
  lastAccessed: Date;
  accessCount: number;
}

export type SourceType = 'news' | 'wiki' | 'web' | 'social' | 'academic' | 'official' | 'forum';

export interface InformationItem {
  id: string;
  content: string;
  sourceId: string;
  timestamp: Date;
  confidence: number;
  topics: string[];
  entities: string[];
  sentiment: number;
  verified: boolean;
}

export interface SynthesizedInformation {
  id: string;
  topic: string;
  claims: Claim[];
  evidence: Evidence[];
  contradictions: Contradiction[];
  confidence: number;
  sources: string[];
  lastUpdated: Date;
  summary: string;
}

export interface Claim {
  id: string;
  content: string;
  confidence: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  sourceCount: number;
  temporalTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface Evidence {
  id: string;
  content: string;
  sourceId: string;
  credibility: number;
  relevance: number;
  timestamp: Date;
  evidenceType: 'direct' | 'indirect' | 'circumstantial';
}

export interface Contradiction {
  id: string;
  claim1: string;
  claim2: string;
  severity: 'minor' | 'moderate' | 'major';
  detectedAt: Date;
  resolutionStatus: 'unresolved' | 'resolved' | 'deferred';
}

export interface FusionConfig {
  maxSources: number;
  minCredibility: number;
  maxBias: number;
  freshnessThreshold: number; // hours
  contradictionThreshold: number;
  evidenceThreshold: number;
}

export class InformationFusionEngine {
  private reasoningGraph: ReasoningGraph;
  private config: FusionConfig;
  private sourceCache: Map<string, InformationSource> = new Map();
  private fusionCache: Map<string, SynthesizedInformation> = new Map();

  constructor(config?: Partial<FusionConfig>) {
    this.reasoningGraph = getReasoningGraph();
    this.config = {
      maxSources: 10,
      minCredibility: 0.3,
      maxBias: 0.8,
      freshnessThreshold: 24, // 24 hours
      contradictionThreshold: 0.7,
      evidenceThreshold: 2,
      ...config
    };
  }

  // Main fusion method
  async synthesizeInformation(topic: string, options?: {
    sourceTypes?: SourceType[];
    maxSources?: number;
    timeRange?: { start: Date; end: Date };
  }): Promise<SynthesizedInformation> {
    try {
      const startTime = Date.now();
      
      // Check cache first
      const cacheKey = this.generateCacheKey(topic, options);
      const cached = this.fusionCache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        logger.debug('Returning cached synthesis', { topic });
        return cached;
      }

      // Gather information from multiple sources
      const sources = await this.gatherSources(topic, options);
      const information = await this.extractInformation(sources, topic);
      
      // Assess quality and credibility
      const assessedInfo = await this.assessInformationQuality(information);
      
      // Detect and resolve contradictions
      const resolvedInfo = await this.resolveContradictions(assessedInfo);
      
      // Synthesize final result
      const synthesis = await this.performSynthesis(topic, resolvedInfo);
      
      // Cache result
      this.fusionCache.set(cacheKey, synthesis);
      
      const duration = Date.now() - startTime;
      logger.info('Information synthesis completed', { 
        topic, 
        duration, 
        sourceCount: sources.length,
        claimCount: synthesis.claims.length,
        contradictions: synthesis.contradictions.length
      });

      return synthesis;

    } catch (error) {
      logger.error('Error synthesizing information', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        topic 
      });
      throw error;
    }
  }

  // Quality assessment
  async assessSourceCredibility(source: InformationSource): Promise<number> {
    try {
      let credibility = source.credibility;

      // Adjust based on source type
      const typeWeights: Record<SourceType, number> = {
        'academic': 0.9,
        'official': 0.85,
        'news': 0.7,
        'wiki': 0.6,
        'web': 0.5,
        'forum': 0.4,
        'social': 0.3
      };

      credibility *= typeWeights[source.type] || 0.5;

      // Adjust based on bias
      credibility *= (1 - source.bias);

      // Adjust based on freshness
      const ageInHours = (Date.now() - source.lastAccessed.getTime()) / (1000 * 60 * 60);
      const freshnessFactor = Math.max(0.1, 1 - (ageInHours / (this.config.freshnessThreshold * 2)));
      credibility *= freshnessFactor;

      // Adjust based on access frequency (popular sources might be more reliable)
      const popularityFactor = Math.min(1.2, 1 + (source.accessCount / 100));
      credibility *= popularityFactor;

      return Math.max(0, Math.min(1, credibility));

    } catch (error) {
      logger.error('Error assessing source credibility', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        sourceId: source.id 
      });
      return 0.5; // Default credibility
    }
  }

  // Contradiction detection and resolution
  async detectContradictions(information: InformationItem[]): Promise<Contradiction[]> {
    const contradictions: Contradiction[] = [];

    try {
      // Compare all pairs of information items
      for (let i = 0; i < information.length; i++) {
        for (let j = i + 1; j < information.length; j++) {
          const item1 = information[i];
          const item2 = information[j];

          const contradiction = await this.compareForContradiction(item1, item2);
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      }

      logger.debug('Contradictions detected', { count: contradictions.length });
      return contradictions;

    } catch (error) {
      logger.error('Error detecting contradictions', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return [];
    }
  }

  // Fact verification
  async verifyClaims(claims: Claim[]): Promise<{
    verified: Claim[];
    unverified: Claim[];
    disputed: Claim[];
  }> {
    const verified: Claim[] = [];
    const unverified: Claim[] = [];
    const disputed: Claim[] = [];

    try {
      for (const claim of claims) {
        const verification = await this.verifyClaim(claim);
        
        if (verification.verified) {
          verified.push(claim);
        } else if (verification.disputed) {
          disputed.push(claim);
        } else {
          unverified.push(claim);
        }
      }

      logger.info('Claim verification completed', { 
        verified: verified.length,
        disputed: disputed.length,
        unverified: unverified.length
      });

      return { verified, unverified, disputed };

    } catch (error) {
      logger.error('Error verifying claims', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { verified: [], unverified: claims, disputed: [] };
    }
  }

  // Trend analysis
  async analyzeTrends(topic: string, timeWindow: number = 7): Promise<{
    trend: 'increasing' | 'decreasing' | 'stable';
    velocity: number;
    acceleration: number;
    confidence: number;
  }> {
    try {
      // Get historical information for the topic
      const historicalInfo = await this.getHistoricalInformation(topic, timeWindow);
      
      if (historicalInfo.length < 3) {
        return { trend: 'stable', velocity: 0, acceleration: 0, confidence: 0 };
      }

      // Calculate trend metrics
      const timestamps = historicalInfo.map(info => info.timestamp.getTime());
      const confidences = historicalInfo.map(info => info.confidence);

      // Simple linear regression for trend
      const n = timestamps.length;
      const sumX = timestamps.reduce((sum, x) => sum + x, 0);
      const sumY = confidences.reduce((sum, y) => sum + y, 0);
      const sumXY = timestamps.reduce((sum, x, i) => sum + x * confidences[i], 0);
      const sumX2 = timestamps.reduce((sum, x) => sum + x * x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Determine trend
      let trend: 'increasing' | 'decreasing' | 'stable';
      if (Math.abs(slope) < 0.01) {
        trend = 'stable';
      } else if (slope > 0) {
        trend = 'increasing';
      } else {
        trend = 'decreasing';
      }

      // Calculate confidence based on R²
      const yMean = sumY / n;
      const ssTotal = confidences.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
      const ssResidual = confidences.reduce((sum, y, i) => {
        const predicted = slope * timestamps[i] + intercept;
        return sum + Math.pow(y - predicted, 2);
      }, 0);
      const rSquared = 1 - (ssResidual / ssTotal);

      return {
        trend,
        velocity: slope,
        acceleration: 0, // Would need more data for acceleration
        confidence: Math.max(0, rSquared)
      };

    } catch (error) {
      logger.error('Error analyzing trends', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        topic 
      });
      return { trend: 'stable', velocity: 0, acceleration: 0, confidence: 0 };
    }
  }

  // Private helper methods
  private async gatherSources(topic: string, options?: {
    sourceTypes?: SourceType[];
    maxSources?: number;
    timeRange?: { start: Date; end: Date };
  }): Promise<InformationSource[]> {
    // This would integrate with actual search APIs
    // For now, simulate source gathering
    const sources: InformationSource[] = [];
    const maxSources = options?.maxSources || this.config.maxSources;
    const sourceTypes = options?.sourceTypes || ['news', 'wiki', 'web'];

    for (let i = 0; i < maxSources; i++) {
      const sourceType = sourceTypes[i % sourceTypes.length];
      const source: InformationSource = {
        id: `source_${i}`,
        url: `https://example-${i}.com`,
        type: sourceType,
        credibility: 0.5 + Math.random() * 0.5,
        bias: Math.random() * 0.5,
        freshness: Math.random(),
        relevance: 0.5 + Math.random() * 0.5,
        lastAccessed: new Date(),
        accessCount: Math.floor(Math.random() * 100)
      };

      // Filter by credibility and bias
      if (source.credibility >= this.config.minCredibility && 
          source.bias <= this.config.maxBias) {
        sources.push(source);
      }
    }

    return sources;
  }

  private async extractInformation(sources: InformationSource[], topic: string): Promise<InformationItem[]> {
    const information: InformationItem[] = [];

    for (const source of sources) {
      // Simulate information extraction
      const item: InformationItem = {
        id: `info_${source.id}`,
        content: `Information about ${topic} from ${source.type} source`,
        sourceId: source.id,
        timestamp: new Date(),
        confidence: source.credibility * source.relevance,
        topics: [topic],
        entities: this.extractEntities(topic),
        sentiment: (Math.random() - 0.5) * 2, // -1 to 1
        verified: source.type === 'academic' || source.type === 'official'
      };

      information.push(item);
    }

    return information;
  }

  private extractEntities(text: string): string[] {
    // Simple entity extraction - can be enhanced with NLP
    const entities: string[] = [];
    const words = text.split(/\s+/);
    
    for (const word of words) {
      if (word.length > 2 && word[0] === word[0].toUpperCase()) {
        entities.push(word);
      }
    }
    
    return entities.slice(0, 5); // Limit to top 5 entities
  }

  private async assessInformationQuality(information: InformationItem[]): Promise<InformationItem[]> {
    // Filter and sort by quality
    return information
      .filter(item => item.confidence >= this.config.minCredibility)
      .sort((a, b) => b.confidence - a.confidence);
  }

  private async resolveContradictions(information: InformationItem[]): Promise<InformationItem[]> {
    const contradictions = await this.detectContradictions(information);
    
    // For now, just log contradictions - in practice would implement resolution logic
    for (const contradiction of contradictions) {
      logger.warn('Information contradiction detected', {
        claim1: contradiction.claim1,
        claim2: contradiction.claim2,
        severity: contradiction.severity
      });
    }

    return information;
  }

  private async performSynthesis(topic: string, information: InformationItem[]): Promise<SynthesizedInformation> {
    // Group information by content similarity
    const claims = await this.extractClaims(information);
    const evidence = await this.extractEvidence(information);
    const contradictions = await this.detectContradictions(information);

    // Calculate overall confidence
    const overallConfidence = information.length > 0
      ? information.reduce((sum, item) => sum + item.confidence, 0) / information.length
      : 0;

    // Generate summary
    const summary = this.generateSummary(topic, claims, evidence);

    const synthesis: SynthesizedInformation = {
      id: `synthesis_${Date.now()}`,
      topic,
      claims,
      evidence,
      contradictions,
      confidence: overallConfidence,
      sources: information.map(item => item.sourceId),
      lastUpdated: new Date(),
      summary
    };

    return synthesis;
  }

  private async extractClaims(information: InformationItem[]): Promise<Claim[]> {
    const claims: Claim[] = [];
    const claimGroups = new Map<string, InformationItem[]>();

    // Group similar information
    for (const item of information) {
      const key = this.generateClaimKey(item.content);
      if (!claimGroups.has(key)) {
        claimGroups.set(key, []);
      }
      claimGroups.get(key)!.push(item);
    }

    // Create claims from groups
    for (const [key, items] of claimGroups.entries()) {
      const claim: Claim = {
        id: `claim_${claims.length}`,
        content: items[0].content,
        confidence: items.reduce((sum, item) => sum + item.confidence, 0) / items.length,
        supportingEvidence: items.map(item => item.id),
        contradictingEvidence: [],
        sourceCount: items.length,
        temporalTrend: 'stable'
      };

      claims.push(claim);
    }

    return claims;
  }

  private generateClaimKey(content: string): string {
    // Simple content normalization for grouping
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async extractEvidence(information: InformationItem[]): Promise<Evidence[]> {
    return information.map(item => ({
      id: `evidence_${item.id}`,
      content: item.content,
      sourceId: item.sourceId,
      credibility: item.confidence,
      relevance: 0.8, // Simplified
      timestamp: item.timestamp,
      evidenceType: 'direct' as const
    }));
  }

  private generateSummary(topic: string, claims: Claim[], evidence: Evidence[]): string {
    const claimCount = claims.length;
    const evidenceCount = evidence.length;
    const avgConfidence = claims.length > 0 
      ? claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length 
      : 0;

    return `Analysis of "${topic}" based on ${claimCount} claims from ${evidenceCount} sources. ` +
           `Overall confidence: ${(avgConfidence * 100).toFixed(1)}%. ` +
           `Key findings: ${claims.slice(0, 3).map(claim => claim.content.substring(0, 50) + '...').join('; ')}`;
  }

  private async compareForContradiction(item1: InformationItem, item2: InformationItem): Promise<Contradiction | null> {
    // Simple contradiction detection - can be enhanced with NLP
    const content1 = item1.content.toLowerCase();
    const content2 = item2.content.toLowerCase();

    // Check for negation words
    const negationWords = ['not', 'never', 'no', 'none', 'nothing', 'neither', 'nor'];
    const hasNegation1 = negationWords.some(word => content1.includes(word));
    const hasNegation2 = negationWords.some(word => content2.includes(word));

    if (hasNegation1 !== hasNegation2 && content1.includes(content2.substring(0, 20))) {
      return {
        id: `contr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        claim1: item1.content,
        claim2: item2.content,
        severity: 'moderate',
        detectedAt: new Date(),
        resolutionStatus: 'unresolved'
      };
    }

    return null;
  }

  private async verifyClaim(claim: Claim): Promise<{ verified: boolean; disputed: boolean }> {
    // Simplified verification - in practice would use fact-checking APIs
    const verified = claim.sourceCount >= this.config.evidenceThreshold && claim.confidence >= 0.7;
    const disputed = claim.contradictingEvidence.length > 0;

    return { verified, disputed };
  }

  private async getHistoricalInformation(topic: string, days: number): Promise<InformationItem[]> {
    // Simulate historical data retrieval
    const historical: InformationItem[] = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      historical.push({
        id: `historical_${i}`,
        content: `Historical information about ${topic} from ${i} days ago`,
        sourceId: `historical_source_${i}`,
        timestamp: date,
        confidence: 0.5 + Math.random() * 0.3,
        topics: [topic],
        entities: [topic],
        sentiment: (Math.random() - 0.5) * 2,
        verified: false
      });
    }

    return historical.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private generateCacheKey(topic: string, options?: any): string {
    return `${topic}_${JSON.stringify(options || {})}`;
  }

  private isCacheValid(synthesis: SynthesizedInformation): boolean {
    const ageInHours = (Date.now() - synthesis.lastUpdated.getTime()) / (1000 * 60 * 60);
    return ageInHours < this.config.freshnessThreshold;
  }

  // Public API methods
  async getSourceCredibility(sourceId: string): Promise<number> {
    const source = this.sourceCache.get(sourceId);
    if (!source) {
      return 0.5; // Default credibility
    }
    return await this.assessSourceCredibility(source);
  }

  async updateSourceCredibility(sourceId: string, feedback: 'positive' | 'negative'): Promise<void> {
    const source = this.sourceCache.get(sourceId);
    if (!source) return;

    // Update credibility based on feedback
    const adjustment = feedback === 'positive' ? 0.1 : -0.1;
    source.credibility = Math.max(0, Math.min(1, source.credibility + adjustment));
    source.accessCount += 1;
    source.lastAccessed = new Date();
  }

  clearCache(): void {
    this.fusionCache.clear();
    this.sourceCache.clear();
  }
}
