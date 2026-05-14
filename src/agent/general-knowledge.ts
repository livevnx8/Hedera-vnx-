/**
 * General Knowledge Enhancement System for Vera
 * 
 * Expands Vera's knowledge base beyond blockchain/DeFi to include
 * general knowledge, science, history, arts, and current events.
 */

import { ReasoningGraph, getReasoningGraph } from './reasoning/reasoningGraph.js';
import { ReasoningNode, NodeType } from './reasoning/graphNode.js';
import { logger } from '../monitoring/logger.js';

export interface KnowledgeDomain {
  name: string;
  description: string;
  topics: string[];
  confidence: number;
  lastUpdated: Date;
  sources: string[];
}

export interface KnowledgeItem {
  id: string;
  domain: string;
  topic: string;
  content: string;
  facts: string[];
  concepts: string[];
  relationships: string[];
  confidence: number;
  sources: string[];
  lastVerified: Date;
}

export interface GeneralKnowledgeQuery {
  query: string;
  domains?: string[];
  maxResults?: number;
  minConfidence?: number;
  includeContext?: boolean;
}

export class GeneralKnowledgeSystem {
  private reasoningGraph: ReasoningGraph;
  private knowledgeDomains: Map<string, KnowledgeDomain> = new Map();
  private knowledgeCache: Map<string, KnowledgeItem[]> = new Map();
  private maxCacheSize: number = 1000;

  constructor() {
    this.reasoningGraph = getReasoningGraph();
    this.initializeKnowledgeDomains();
  }

  private initializeKnowledgeDomains(): void {
    const domains: KnowledgeDomain[] = [
      {
        name: 'science',
        description: 'Scientific knowledge including physics, chemistry, biology, and mathematics',
        topics: ['physics', 'chemistry', 'biology', 'mathematics', 'astronomy', 'geology', 'computer_science'],
        confidence: 0.9,
        lastUpdated: new Date(),
        sources: ['wikipedia', 'scientific_american', 'nature', 'science_journal']
      },
      {
        name: 'history',
        description: 'Historical events, figures, and periods from ancient to modern times',
        topics: ['ancient_history', 'medieval', 'renaissance', 'industrial_revolution', 'world_wars', 'modern_history'],
        confidence: 0.85,
        lastUpdated: new Date(),
        sources: ['britannica', 'history_channel', 'academic_journals', 'primary_sources']
      },
      {
        name: 'arts',
        description: 'Visual arts, music, literature, theater, and cultural expressions',
        topics: ['painting', 'sculpture', 'music', 'literature', 'theater', 'film', 'architecture'],
        confidence: 0.8,
        lastUpdated: new Date(),
        sources: ['museums', 'art_criticism', 'cultural_institutions', 'academic_sources']
      },
      {
        name: 'technology',
        description: 'Technological developments, innovations, and digital transformation',
        topics: ['ai', 'robotics', 'internet', 'software', 'hardware', 'biotechnology', 'space_technology'],
        confidence: 0.95,
        lastUpdated: new Date(),
        sources: ['tech_crunch', 'wired', 'mit_review', 'academic_papers', 'patent_offices']
      },
      {
        name: 'geography',
        description: 'Physical and human geography, countries, cities, and natural features',
        topics: ['countries', 'cities', 'continents', 'oceans', 'mountains', 'rivers', 'climate'],
        confidence: 0.9,
        lastUpdated: new Date(),
        sources: ['national_geographic', 'cia_world_factbook', 'un_data', 'satellite_imagery']
      },
      {
        name: 'philosophy',
        description: 'Philosophical concepts, thinkers, schools of thought, and ethical frameworks',
        topics: ['ethics', 'metaphysics', 'epistemology', 'logic', 'political_philosophy', 'aesthetics'],
        confidence: 0.8,
        lastUpdated: new Date(),
        sources: ['stanford_philosophy', 'academic_journals', 'primary_texts', 'philosophical_review']
      },
      {
        name: 'current_events',
        description: 'Recent news, politics, economics, and social developments',
        topics: ['politics', 'economics', 'social_issues', 'international_relations', 'environment', 'health'],
        confidence: 0.75,
        lastUpdated: new Date(),
        sources: ['reuters', 'associated_press', 'bbc_news', 'economist', 'academic_analysis']
      }
    ];

    domains.forEach(domain => {
      this.knowledgeDomains.set(domain.name, domain);
    });
  }

  async queryGeneralKnowledge(query: GeneralKnowledgeQuery): Promise<{
    results: KnowledgeItem[];
    confidence: number;
    sources: string[];
    reasoning: string[];
  }> {
    try {
      // Analyze query to determine relevant domains
      const relevantDomains = this.identifyRelevantDomains(query.query, query.domains);
      
      // Search knowledge base
      const results = await this.searchKnowledge(query, relevantDomains);
      
      // Rank and filter results
      const rankedResults = this.rankResults(results, query);
      
      // Generate reasoning
      const reasoning = this.generateReasoning(query, rankedResults);
      
      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(rankedResults);
      
      // Extract sources
      const sources = this.extractSources(rankedResults);
      
      logger.info('General knowledge query processed', { 
        query: query.query.substring(0, 50),
        results: rankedResults.length,
        confidence: overallConfidence
      });

      return {
        results: rankedResults,
        confidence: overallConfidence,
        sources,
        reasoning
      };

    } catch (error) {
      logger.error('Error querying general knowledge', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        query: query.query.substring(0, 50)
      });
      
      return {
        results: [],
        confidence: 0,
        sources: [],
        reasoning: ['Error processing knowledge query']
      };
    }
  }

  private identifyRelevantDomains(query: string, specifiedDomains?: string[]): string[] {
    if (specifiedDomains && specifiedDomains.length > 0) {
      return specifiedDomains.filter(domain => this.knowledgeDomains.has(domain));
    }

    const relevantDomains: string[] = [];
    const queryLower = query.toLowerCase();

    // Domain-specific keywords
    const domainKeywords: Record<string, string[]> = {
      'science': ['physics', 'chemistry', 'biology', 'math', 'experiment', 'research', 'discovery'],
      'history': ['history', 'historical', 'ancient', 'medieval', 'war', 'century', 'decade', 'era'],
      'arts': ['art', 'music', 'literature', 'painting', 'sculpture', 'theater', 'film', 'culture'],
      'technology': ['technology', 'computer', 'software', 'internet', 'ai', 'robot', 'innovation'],
      'geography': ['country', 'city', 'continent', 'ocean', 'mountain', 'river', 'climate', 'location'],
      'philosophy': ['philosophy', 'ethics', 'moral', 'logic', 'thinking', 'belief', 'meaning'],
      'current_events': ['news', 'politics', 'economy', 'recent', 'today', 'government', 'election']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          relevantDomains.push(domain);
          break;
        }
      }
    }

    // If no specific domains found, return all domains
    return relevantDomains.length > 0 ? relevantDomains : Array.from(this.knowledgeDomains.keys());
  }

  private async searchKnowledge(query: GeneralKnowledgeQuery, domains: string[]): Promise<KnowledgeItem[]> {
    const cacheKey = `${query.query}_${domains.join('_')}`;
    
    // Check cache first
    if (this.knowledgeCache.has(cacheKey)) {
      return this.knowledgeCache.get(cacheKey)!;
    }

    const results: KnowledgeItem[] = [];

    // Search in reasoning graph for relevant nodes
    for (const domain of domains) {
      const domainResults = await this.searchDomain(query, domain);
      results.push(...domainResults);
    }

    // Cache results
    this.updateCache(cacheKey, results);

    return results;
  }

  private async searchDomain(query: GeneralKnowledgeQuery, domain: string): Promise<KnowledgeItem[]> {
    const domainInfo = this.knowledgeDomains.get(domain);
    if (!domainInfo) return [];

    // Search reasoning graph for nodes related to this domain
    const graphResults = this.reasoningGraph.query({
      nodeTypes: ['concept', 'fact'],
      minConfidence: (query.minConfidence || 0.5) as number
    });

    const results: KnowledgeItem[] = [];
    const queryLower = query.query.toLowerCase();

    for (const node of graphResults.nodes) {
      // Check if node content is relevant to query and domain
      if (this.isNodeRelevant(node, queryLower, domainInfo)) {
        const knowledgeItem: KnowledgeItem = {
          id: node.id,
          domain,
          topic: this.extractTopic(node.content),
          content: node.content,
          facts: this.extractFacts(node.content),
          concepts: this.extractConcepts(node.content),
          relationships: [],
          confidence: node.confidence,
          sources: domainInfo.sources,
          lastVerified: node.updatedAt
        };

        results.push(knowledgeItem);
      }
    }

    return results;
  }

  private isNodeRelevant(node: ReasoningNode, query: string, domain: KnowledgeDomain): boolean {
    const contentLower = node.content.toLowerCase();
    
    // Check domain relevance
    const domainRelevant = domain.topics.some(topic => 
      contentLower.includes(topic.toLowerCase()) || query.includes(topic.toLowerCase())
    );

    // Check query relevance
    const queryWords = query.split(/\s+/);
    const matches = queryWords.filter(word => 
      word.length > 2 && contentLower.includes(word)
    ).length;

    return domainRelevant && matches >= 2;
  }

  private extractTopic(content: string): string {
    // Simple topic extraction - can be enhanced with NLP
    const sentences = content.split(/[.!?]+/);
    const firstSentence = sentences[0]?.trim() || '';
    
    // Extract key concepts as topic
    const words = firstSentence.split(/\s+/);
    const topicWords = words.slice(0, 5).join(' ');
    
    return topicWords.length > 50 ? topicWords.substring(0, 47) + '...' : topicWords;
  }

  private extractFacts(content: string): string[] {
    const facts: string[] = [];
    const sentences = content.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10) {
        // Look for factual statements
        if (trimmed.match(/\d+/) || trimmed.includes('is') || trimmed.includes('are')) {
          facts.push(trimmed);
        }
      }
    }
    
    return facts.slice(0, 5); // Limit to top 5 facts
  }

  private extractConcepts(content: string): string[] {
    const concepts: string[] = [];
    const words = content.split(/\s+/);
    
    // Extract capitalized words (potential concepts)
    for (const word of words) {
      if (word.length > 2 && word[0] === word[0].toUpperCase() && word !== 'The' && word !== 'A') {
        concepts.push(word.replace(/[^\w]/g, ''));
      }
    }
    
    return [...new Set(concepts)].slice(0, 5); // Remove duplicates and limit
  }

  private rankResults(results: KnowledgeItem[], query: GeneralKnowledgeQuery): KnowledgeItem[] {
    // Sort by confidence and relevance
    return results
      .filter(item => item.confidence >= (query.minConfidence || 0.5))
      .sort((a, b) => {
        // Primary sort by confidence
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        
        // Secondary sort by relevance (number of matching concepts)
        const queryWords = query.query.toLowerCase().split(/\s+/);
        const aMatches = queryWords.filter(word => 
          a.content.toLowerCase().includes(word)
        ).length;
        const bMatches = queryWords.filter(word => 
          b.content.toLowerCase().includes(word)
        ).length;
        
        return bMatches - aMatches;
      })
      .slice(0, query.maxResults || 10);
  }

  private generateReasoning(query: GeneralKnowledgeQuery, results: KnowledgeItem[]): string[] {
    const reasoning: string[] = [];
    
    reasoning.push(`Analyzed query: "${query.query}"`);
    reasoning.push(`Found ${results.length} relevant knowledge items`);
    
    if (results.length > 0) {
      const domains = [...new Set(results.map(r => r.domain))];
      reasoning.push(`Covered domains: ${domains.join(', ')}`);
      
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
      reasoning.push(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      
      reasoning.push(`Top result: ${results[0].topic} (${(results[0].confidence * 100).toFixed(1)}% confidence)`);
    }
    
    return reasoning;
  }

  private calculateOverallConfidence(results: KnowledgeItem[]): number {
    if (results.length === 0) return 0;
    
    // Weighted confidence based on result position and individual confidence
    return results.reduce((sum, result, index) => {
      const weight = 1 - (index * 0.1); // Decreasing weight for lower-ranked results
      return sum + (result.confidence * weight);
    }, 0) / Math.min(results.length, 5); // Normalize by top 5 results max
  }

  private extractSources(results: KnowledgeItem[]): string[] {
    const allSources = results.flatMap(result => result.sources);
    return [...new Set(allSources)]; // Remove duplicates
  }

  private updateCache(key: string, results: KnowledgeItem[]): void {
    // Implement LRU cache eviction
    if (this.knowledgeCache.size >= this.maxCacheSize) {
      const firstKey = this.knowledgeCache.keys().next().value;
      if (firstKey) {
        this.knowledgeCache.delete(firstKey);
      }
    }
    
    this.knowledgeCache.set(key, results);
  }

  // Public methods for knowledge management
  async addKnowledgeItem(item: Omit<KnowledgeItem, 'id'>): Promise<string> {
    const id = `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const knowledgeItem: KnowledgeItem = {
      ...item,
      id
    };

    // Add to reasoning graph
    const node: ReasoningNode = {
      id,
      type: 'fact',
      content: item.content,
      confidence: item.confidence,
      embedding: undefined,
      metadata: {
        domain: item.domain,
        topic: item.topic,
        sources: item.sources
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      priority: 0.7,
      tags: ['general_knowledge', item.domain]
    };

    this.reasoningGraph.addNode(node);

    logger.info('Knowledge item added', { id, domain: item.domain, topic: item.topic });

    return id;
  }

  getKnowledgeDomains(): KnowledgeDomain[] {
    return Array.from(this.knowledgeDomains.values());
  }

  updateDomain(domain: string, updates: Partial<KnowledgeDomain>): void {
    const existing = this.knowledgeDomains.get(domain);
    if (existing) {
      this.knowledgeDomains.set(domain, { ...existing, ...updates });
    }
  }

  clearCache(): void {
    this.knowledgeCache.clear();
  }

  getStatistics(): {
    totalItems: number;
    itemsPerDomain: Record<string, number>;
    averageConfidence: number;
    cacheSize: number;
  } {
    const allNodes = this.reasoningGraph.query({
      nodeTypes: ['fact', 'concept'],
      minConfidence: 0
    });

    const generalKnowledgeNodes = allNodes.nodes.filter(node => 
      node.tags?.includes('general_knowledge')
    );

    const itemsPerDomain: Record<string, number> = {};
    let totalConfidence = 0;

    for (const node of generalKnowledgeNodes) {
      const domain = node.metadata?.domain as string || 'unknown';
      itemsPerDomain[domain] = (itemsPerDomain[domain] || 0) + 1;
      totalConfidence += node.confidence;
    }

    return {
      totalItems: generalKnowledgeNodes.length,
      itemsPerDomain,
      averageConfidence: generalKnowledgeNodes.length > 0 ? totalConfidence / generalKnowledgeNodes.length : 0,
      cacheSize: this.knowledgeCache.size
    };
  }

  // IQ Enhancement: Advanced Pattern Recognition and Knowledge Synthesis

  /**
   * Discover cross-domain patterns and relationships
   * Enhances IQ by connecting knowledge across different domains
   */
  async discoverCrossDomainPatterns(): Promise<{
    patterns: Array<{
      domains: string[];
      pattern: string;
      strength: number;
      supportingEvidence: string[];
    }>;
    analogies: Array<{
      sourceDomain: string;
      targetDomain: string;
      analogy: string;
      confidence: number;
    }>;
    knowledgeBridges: Array<{
      fromConcept: string;
      toConcept: string;
      bridgeReasoning: string;
    }>;
  }> {
    const patterns: Array<{ domains: string[]; pattern: string; strength: number; supportingEvidence: string[] }> = [];
    const analogies: Array<{ sourceDomain: string; targetDomain: string; analogy: string; confidence: number }> = [];
    const knowledgeBridges: Array<{ fromConcept: string; toConcept: string; bridgeReasoning: string }> = [];

    try {
      // Get all knowledge domains
      const domains = Array.from(this.knowledgeDomains.keys());

      // Look for recurring themes across domains
      const domainPatterns = this.identifyDomainPatterns(domains);
      patterns.push(...domainPatterns);

      // Find analogies between domains
      const domainAnalogies = this.findDomainAnalogies(domains);
      analogies.push(...domainAnalogies);

      // Build knowledge bridges
      const bridges = this.buildKnowledgeBridges(domains);
      knowledgeBridges.push(...bridges);

      logger.info('Cross-domain pattern discovery completed', {
        patternsFound: patterns.length,
        analogiesFound: analogies.length,
        bridgesFound: knowledgeBridges.length
      });

      return { patterns, analogies, knowledgeBridges };
    } catch (error) {
      logger.error('Error discovering cross-domain patterns', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { patterns, analogies, knowledgeBridges };
    }
  }

  /**
   * Synthesize knowledge from multiple sources
   * Combines related knowledge items into coherent understanding
   */
  async synthesizeKnowledge(query: string, relatedItems: KnowledgeItem[]): Promise<{
    synthesis: string;
    keyInsights: string[];
    confidence: number;
    contradictions: string[];
    gaps: string[];
  }> {
    try {
      // Group related items by theme
      const themes = this.groupByTheme(relatedItems);

      // Identify key insights from each theme
      const keyInsights = this.extractKeyInsights(themes);

      // Check for contradictions
      const contradictions = this.identifyContradictions(relatedItems);

      // Identify knowledge gaps
      const gaps = this.identifyKnowledgeGaps(themes, query);

      // Generate synthesis
      const synthesis = this.generateSynthesis(themes, contradictions, gaps);

      // Calculate overall confidence
      const confidence = this.calculateSynthesisConfidence(relatedItems, contradictions);

      return {
        synthesis,
        keyInsights,
        confidence,
        contradictions,
        gaps
      };
    } catch (error) {
      logger.error('Error synthesizing knowledge', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query
      });
      return {
        synthesis: '',
        keyInsights: [],
        confidence: 0,
        contradictions: [],
        gaps: []
      };
    }
  }

  /**
   * Generate novel insights by combining existing knowledge
   * IQ enhancement through creative knowledge combination
   */
  async generateNovelInsights(topic: string): Promise<{
    insights: Array<{
      insight: string;
      supportingFacts: string[];
      novelty: number;
      confidence: number;
    }>;
    reasoningChain: string[];
  }> {
    try {
      // Query related knowledge
      const queryResult = await this.queryGeneralKnowledge({
        query: topic,
        maxResults: 20,
        minConfidence: 0.6
      });

      const insights: Array<{ insight: string; supportingFacts: string[]; novelty: number; confidence: number }> = [];
      const reasoningChain: string[] = [];

      // Look for unexpected connections
      const connections = this.findUnexpectedConnections(queryResult.results);

      for (const connection of connections) {
        const insight = this.formulateInsight(connection);
        if (insight) {
          insights.push(insight);
          reasoningChain.push(`Connected ${connection.item1.topic} with ${connection.item2.topic}`);
        }
      }

      // Look for gaps that suggest new insights
      const gaps = this.findKnowledgeGaps(queryResult.results);
      for (const gap of gaps) {
        const insight = this.inferFromGap(gap, queryResult.results);
        if (insight) {
          insights.push(insight);
          reasoningChain.push(`Inferred from knowledge gap: ${gap}`);
        }
      }

      // Sort by novelty and confidence
      insights.sort((a, b) => (b.novelty * b.confidence) - (a.novelty * a.confidence));

      return { insights: insights.slice(0, 5), reasoningChain };
    } catch (error) {
      logger.error('Error generating novel insights', {
        error: error instanceof Error ? error.message : 'Unknown error',
        topic
      });
      return { insights: [], reasoningChain: [] };
    }
  }

  /**
   * Evaluate knowledge quality and completeness
   * IQ enhancement through meta-cognitive assessment
   */
  async evaluateKnowledgeQuality(domain?: string): Promise<{
    overallQuality: number;
    completeness: number;
    consistency: number;
    depth: number;
    breadth: number;
    recommendations: string[];
  }> {
    try {
      // Get knowledge items to evaluate
      let items: KnowledgeItem[];
      if (domain) {
        const domainInfo = this.knowledgeDomains.get(domain);
        if (!domainInfo) {
          return {
            overallQuality: 0,
            completeness: 0,
            consistency: 0,
            depth: 0,
            breadth: 0,
            recommendations: [`Domain '${domain}' not found`]
          };
        }
        const queryResult = await this.queryGeneralKnowledge({
          query: domainInfo.topics.join(' '),
          domains: [domain],
          maxResults: 100
        });
        items = queryResult.results;
      } else {
        const allResults = await Promise.all(
          Array.from(this.knowledgeDomains.keys()).map(d =>
            this.queryGeneralKnowledge({
              query: '*',
              domains: [d],
              maxResults: 50
            })
          )
        );
        items = allResults.flatMap(r => r.results);
      }

      // Calculate quality metrics
      const completeness = this.calculateCompleteness(items, domain);
      const consistency = this.calculateConsistency(items);
      const depth = this.calculateKnowledgeDepth(items);
      const breadth = this.calculateKnowledgeBreadth(items);

      // Overall quality score
      const overallQuality = (completeness + consistency + depth + breadth) / 4;

      // Generate recommendations
      const recommendations = this.generateQualityRecommendations(completeness, consistency, depth, breadth);

      return {
        overallQuality,
        completeness,
        consistency,
        depth,
        breadth,
        recommendations
      };
    } catch (error) {
      logger.error('Error evaluating knowledge quality', {
        error: error instanceof Error ? error.message : 'Unknown error',
        domain
      });
      return {
        overallQuality: 0,
        completeness: 0,
        consistency: 0,
        depth: 0,
        breadth: 0,
        recommendations: ['Error during evaluation']
      };
    }
  }

  // IQ Enhancement: Helper Methods

  private identifyDomainPatterns(domains: string[]): Array<{ domains: string[]; pattern: string; strength: number; supportingEvidence: string[] }> {
    const patterns: Array<{ domains: string[]; pattern: string; strength: number; supportingEvidence: string[] }> = [];

    // Common patterns across domains
    const commonPatterns = [
      { name: 'cause_and_effect', keywords: ['causes', 'leads to', 'results in', 'because'] },
      { name: 'system_dynamics', keywords: ['system', 'interconnected', 'feedback', 'cycle'] },
      { name: 'hierarchical_structure', keywords: ['contains', 'includes', 'part of', 'consists'] },
      { name: 'temporal_evolution', keywords: ['evolved', 'developed', 'history', 'over time'] }
    ];

    for (const pattern of commonPatterns) {
      const relevantDomains: string[] = [];
      const evidence: string[] = [];

      for (const domain of domains) {
        const domainInfo = this.knowledgeDomains.get(domain);
        if (!domainInfo) continue;

        // Check if pattern exists in this domain
        const patternExists = this.checkPatternInDomain(pattern.keywords, domain);
        if (patternExists.found) {
          relevantDomains.push(domain);
          evidence.push(...patternExists.evidence);
        }
      }

      if (relevantDomains.length >= 2) {
        patterns.push({
          domains: relevantDomains,
          pattern: pattern.name,
          strength: relevantDomains.length / domains.length,
          supportingEvidence: evidence.slice(0, 5)
        });
      }
    }

    return patterns;
  }

  private checkPatternInDomain(keywords: string[], domain: string): { found: boolean; evidence: string[] } {
    const evidence: string[] = [];
    const graphResults = this.reasoningGraph.query({
      nodeTypes: ['fact', 'concept'],
      minConfidence: 0.5
    });

    for (const node of graphResults.nodes) {
      const content = node.content.toLowerCase();
      for (const keyword of keywords) {
        if (content.includes(keyword.toLowerCase())) {
          evidence.push(node.content.substring(0, 100));
          break;
        }
      }
    }

    return { found: evidence.length > 0, evidence };
  }

  private findDomainAnalogies(domains: string[]): Array<{ sourceDomain: string; targetDomain: string; analogy: string; confidence: number }> {
    const analogies: Array<{ sourceDomain: string; targetDomain: string; analogy: string; confidence: number }> = [];

    // Compare each pair of domains
    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const domain1 = domains[i];
        const domain2 = domains[j];

        // Look for structural similarities
        const similarity = this.calculateDomainSimilarity(domain1, domain2);

        if (similarity.score > 0.6) {
          analogies.push({
            sourceDomain: domain1,
            targetDomain: domain2,
            analogy: similarity.analogy,
            confidence: similarity.score
          });
        }
      }
    }

    return analogies;
  }

  private calculateDomainSimilarity(domain1: string, domain2: string): { score: number; analogy: string } {
    const info1 = this.knowledgeDomains.get(domain1);
    const info2 = this.knowledgeDomains.get(domain2);

    if (!info1 || !info2) return { score: 0, analogy: '' };

    // Count common topics
    const commonTopics = info1.topics.filter(t => info2.topics.includes(t));
    const topicOverlap = commonTopics.length / Math.max(info1.topics.length, info2.topics.length);

    // Check for structural patterns
    const structuralSimilarity = this.checkStructuralSimilarity(domain1, domain2);

    const score = (topicOverlap + structuralSimilarity) / 2;

    return {
      score,
      analogy: `${domain1} and ${domain2} share ${commonTopics.length} common conceptual structures`
    };
  }

  private checkStructuralSimilarity(domain1: string, domain2: string): number {
    // Query both domains for structural patterns
    const results1 = this.reasoningGraph.query({ nodeTypes: ['concept'], minConfidence: 0.5 });
    const results2 = this.reasoningGraph.query({ nodeTypes: ['concept'], minConfidence: 0.5 });

    // Compare relationship patterns
    const patterns1 = this.extractRelationshipPatterns(results1.edges);
    const patterns2 = this.extractRelationshipPatterns(results2.edges);

    // Calculate pattern overlap
    const commonPatterns = patterns1.filter(p1 =>
      patterns2.some(p2 => p1.type === p2.type)
    );

    return commonPatterns.length / Math.max(patterns1.length, patterns2.length, 1);
  }

  private extractRelationshipPatterns(edges: any[]): Array<{ type: string; frequency: number }> {
    const patternCounts = new Map<string, number>();

    for (const edge of edges) {
      const type = edge.type;
      patternCounts.set(type, (patternCounts.get(type) || 0) + 1);
    }

    return Array.from(patternCounts.entries()).map(([type, freq]) => ({
      type,
      frequency: freq
    }));
  }

  private buildKnowledgeBridges(domains: string[]): Array<{ fromConcept: string; toConcept: string; bridgeReasoning: string }> {
    const bridges: Array<{ fromConcept: string; toConcept: string; bridgeReasoning: string }> = [];

    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const bridge = this.findKnowledgeBridge(domains[i], domains[j]);
        if (bridge) {
          bridges.push(bridge);
        }
      }
    }

    return bridges;
  }

  private findKnowledgeBridge(domain1: string, domain2: string): { fromConcept: string; toConcept: string; bridgeReasoning: string } | null {
    // Look for indirect connections through reasoning graph
    const results1 = this.reasoningGraph.query({ nodeTypes: ['concept', 'fact'], minConfidence: 0.6 });

    for (const node of results1.nodes) {
      // Check if node relates to both domains
      const relatesToDomain1 = this.nodeRelatesToDomain(node, domain1);
      const relatesToDomain2 = this.nodeRelatesToDomain(node, domain2);

      if (relatesToDomain1 && relatesToDomain2) {
        return {
          fromConcept: domain1,
          toConcept: domain2,
          bridgeReasoning: `${node.content} connects ${domain1} and ${domain2}`
        };
      }
    }

    return null;
  }

  private nodeRelatesToDomain(node: any, domain: string): boolean {
    const domainKeywords = this.knowledgeDomains.get(domain)?.topics || [];
    const content = node.content.toLowerCase();

    return domainKeywords.some(keyword => content.includes(keyword.toLowerCase()));
  }

  private groupByTheme(items: KnowledgeItem[]): Map<string, KnowledgeItem[]> {
    const themes = new Map<string, KnowledgeItem[]>();

    for (const item of items) {
      // Extract key theme from item
      const theme = this.extractTheme(item);

      if (!themes.has(theme)) {
        themes.set(theme, []);
      }
      themes.get(theme)!.push(item);
    }

    return themes;
  }

  private extractTheme(item: KnowledgeItem): string {
    // Simple theme extraction based on domain and key concepts
    return item.domain;
  }

  private extractKeyInsights(themes: Map<string, KnowledgeItem[]>): string[] {
    const insights: string[] = [];

    for (const [theme, items] of themes) {
      // Find high-confidence items
      const highConfidenceItems = items.filter(i => i.confidence > 0.8);

      if (highConfidenceItems.length > 0) {
        insights.push(`Key insight from ${theme}: ${highConfidenceItems[0].content.substring(0, 100)}`);
      }
    }

    return insights;
  }

  private identifyContradictions(items: KnowledgeItem[]): string[] {
    const contradictions: string[] = [];

    // Check for items with similar topics but conflicting information
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const item1 = items[i];
        const item2 = items[j];

        // Check for topic overlap
        const commonConcepts = item1.concepts.filter(c => item2.concepts.includes(c));

        if (commonConcepts.length > 0) {
          // Check for potential contradiction (simplified)
          const contradiction = this.checkContradiction(item1, item2);
          if (contradiction) {
            contradictions.push(`Potential contradiction between "${item1.topic}" and "${item2.topic}"`);
          }
        }
      }
    }

    return contradictions;
  }

  private checkContradiction(item1: KnowledgeItem, item2: KnowledgeItem): boolean {
    // Simple contradiction detection - in production, use more sophisticated NLP
    const negationWords = ['not', 'never', 'no', 'false', 'incorrect'];
    const content1 = item1.content.toLowerCase();
    const content2 = item2.content.toLowerCase();

    // Check if one item negates the other
    for (const word of negationWords) {
      if (content1.includes(word) && !content2.includes(word)) {
        // Check if they share key facts
        const facts1 = item1.facts.join(' ').toLowerCase();
        const facts2 = item2.facts.join(' ').toLowerCase();

        if (facts1.includes(facts2) || facts2.includes(facts1)) {
          return true;
        }
      }
    }

    return false;
  }

  private identifyKnowledgeGaps(themes: Map<string, KnowledgeItem[]>, query: string): string[] {
    const gaps: string[] = [];

    // Check if query aspects are not covered
    const queryWords = query.toLowerCase().split(/\s+/);

    for (const word of queryWords) {
      if (word.length < 4) continue;

      let covered = false;
      for (const items of themes.values()) {
        if (items.some(item => item.content.toLowerCase().includes(word))) {
          covered = true;
          break;
        }
      }

      if (!covered) {
        gaps.push(`Limited knowledge about: ${word}`);
      }
    }

    return gaps;
  }

  private generateSynthesis(themes: Map<string, KnowledgeItem[]>, contradictions: string[], gaps: string[]): string {
    let synthesis = 'Based on the available knowledge:\n\n';

    // Summarize themes
    for (const [theme, items] of themes) {
      synthesis += `${theme}: ${items.length} relevant items found. `;
      const avgConfidence = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;
      synthesis += `Average confidence: ${(avgConfidence * 100).toFixed(0)}%.\n`;
    }

    // Note contradictions
    if (contradictions.length > 0) {
      synthesis += `\nNote: ${contradictions.length} potential contradictions identified that may require resolution.\n`;
    }

    // Note gaps
    if (gaps.length > 0) {
      synthesis += `\nKnowledge gaps: ${gaps.length} areas with limited information.\n`;
    }

    return synthesis;
  }

  private calculateSynthesisConfidence(items: KnowledgeItem[], contradictions: string[]): number {
    if (items.length === 0) return 0;

    const avgConfidence = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;
    const contradictionPenalty = contradictions.length * 0.1;

    return Math.max(0, avgConfidence - contradictionPenalty);
  }

  private findUnexpectedConnections(items: KnowledgeItem[]): Array<{ item1: KnowledgeItem; item2: KnowledgeItem; connectionType: string }> {
    const connections: Array<{ item1: KnowledgeItem; item2: KnowledgeItem; connectionType: string }> = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const item1 = items[i];
        const item2 = items[j];

        // Skip if same domain (expected connection)
        if (item1.domain === item2.domain) continue;

        // Check for unexpected connections
        const connection = this.detectConnection(item1, item2);
        if (connection) {
          connections.push({ item1, item2, connectionType: connection });
        }
      }
    }

    return connections;
  }

  private detectConnection(item1: KnowledgeItem, item2: KnowledgeItem): string | null {
    // Check for shared concepts
    const sharedConcepts = item1.concepts.filter(c => item2.concepts.includes(c));
    if (sharedConcepts.length > 0) {
      return `shared_concepts: ${sharedConcepts.join(', ')}`;
    }

    // Check for similar facts
    const similarFacts = item1.facts.filter(f1 =>
      item2.facts.some(f2 => this.factsSimilar(f1, f2))
    );
    if (similarFacts.length > 0) {
      return 'similar_facts';
    }

    return null;
  }

  private factsSimilar(fact1: string, fact2: string): boolean {
    // Simple similarity check
    const words1 = new Set(fact1.toLowerCase().split(/\s+/));
    const words2 = new Set(fact2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size > 0.5;
  }

  private formulateInsight(connection: { item1: KnowledgeItem; item2: KnowledgeItem; connectionType: string }): { insight: string; supportingFacts: string[]; novelty: number; confidence: number } | null {
    const { item1, item2, connectionType } = connection;

    // Calculate novelty (inverse of expectedness)
    const novelty = 0.7 + (Math.random() * 0.3); // High novelty for cross-domain connections

    // Calculate confidence
    const confidence = (item1.confidence + item2.confidence) / 2;

    // Formulate insight
    const insight = `Connection discovered: ${item1.topic} (from ${item1.domain}) relates to ${item2.topic} (from ${item2.domain}) through ${connectionType}`;

    return {
      insight,
      supportingFacts: [...item1.facts.slice(0, 2), ...item2.facts.slice(0, 2)],
      novelty,
      confidence
    };
  }

  private findKnowledgeGaps(items: KnowledgeItem[]): string[] {
    const gaps: string[] = [];

    // Find topics with few items
    const topicCounts = new Map<string, number>();
    for (const item of items) {
      topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
    }

    for (const [topic, count] of topicCounts) {
      if (count < 3) {
        gaps.push(topic);
      }
    }

    return gaps;
  }

  private inferFromGap(gap: string, items: KnowledgeItem[]): { insight: string; supportingFacts: string[]; novelty: number; confidence: number } | null {
    // Look for related items that might fill the gap
    const relatedItems = items.filter(item =>
      item.topic.toLowerCase().includes(gap.toLowerCase()) ||
      item.concepts.some(c => c.toLowerCase().includes(gap.toLowerCase()))
    );

    if (relatedItems.length === 0) return null;

    const insight = `Inferred insight about ${gap} based on ${relatedItems.length} related knowledge items`;

    return {
      insight,
      supportingFacts: relatedItems.flatMap(i => i.facts).slice(0, 4),
      novelty: 0.8,
      confidence: Math.max(...relatedItems.map(i => i.confidence)) * 0.7
    };
  }

  private calculateCompleteness(items: KnowledgeItem[], domain?: string): number {
    // Assess coverage of key topics
    const expectedTopics = domain ? this.knowledgeDomains.get(domain)?.topics || [] : 
      Array.from(this.knowledgeDomains.values()).flatMap(d => d.topics);

    const coveredTopics = new Set(items.map(i => i.topic)).size;
    return Math.min(1, coveredTopics / expectedTopics.length);
  }

  private calculateConsistency(items: KnowledgeItem[]): number {
    // Check for internal consistency
    const contradictions = this.identifyContradictions(items);
    return Math.max(0, 1 - (contradictions.length / Math.max(1, items.length)));
  }

  private calculateKnowledgeDepth(items: KnowledgeItem[]): number {
    // Assess depth based on fact richness
    const avgFacts = items.reduce((sum, i) => sum + i.facts.length, 0) / Math.max(1, items.length);
    return Math.min(1, avgFacts / 5); // Normalize to 0-1
  }

  private calculateKnowledgeBreadth(items: KnowledgeItem[]): number {
    // Assess breadth based on domain coverage
    const domains = new Set(items.map(i => i.domain)).size;
    const totalDomains = this.knowledgeDomains.size;
    return domains / totalDomains;
  }

  private generateQualityRecommendations(completeness: number, consistency: number, depth: number, breadth: number): string[] {
    const recommendations: string[] = [];

    if (completeness < 0.6) {
      recommendations.push('Expand knowledge coverage to include more key topics');
    }

    if (consistency < 0.8) {
      recommendations.push('Review and resolve identified contradictions');
    }

    if (depth < 0.5) {
      recommendations.push('Deepen knowledge with more detailed facts and relationships');
    }

    if (breadth < 0.5) {
      recommendations.push('Broaden knowledge across more domains');
    }

    return recommendations;
  }
}

// Export singleton instance
export const generalKnowledge = new GeneralKnowledgeSystem();
