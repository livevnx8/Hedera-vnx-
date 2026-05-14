/**
 * Knowledge Health Monitor
 * 
 * Continuously monitors Vera's knowledge systems for:
 * - Orphaned knowledge (unconnected memories)
 * - Knowledge gaps (missing concepts)
 * - Data quality issues (low confidence, stale info)
 * - Contradiction tracking and resolution
 * - Storage efficiency (HCS cost optimization)
 * 
 * Reports health metrics and suggests improvements.
 */

import { hcsBrainRetrieval } from './hcsBrainRetrieval.js';
import { knowledgeGraph } from './knowledgeGraph.js';
import { implementationPatterns } from './implementationPatterns.js';
import { hcsVectorSync } from './hcsVectorSync.js';
import { logger } from '../monitoring/logger.js';

interface HealthCheck {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100
  details: string;
  recommendations: string[];
  lastChecked: number;
}

interface KnowledgeQualityMetrics {
  totalMemories: number;
  avgConfidence: number;
  verifiedRatio: number;
  staleMemories: number; // > 90 days old
  lowConfidenceMemories: number; // < 0.5 confidence
  orphanedMemories: number;
  contradictions: number;
  duplicates: number;
  coverageGaps: string[]; // Missing topic areas
}

interface StorageEfficiency {
  hcsMessagesTotal: number;
  hcsCostUsd: number;
  vectorDbSize: number;
  compressionRatio: number;
  estimatedSavings: number;
}

interface KnowledgeTrend {
  period: string;
  newMemories: number;
  newPatterns: number;
  avgQuality: number;
  hotTopics: string[];
  decliningAreas: string[];
}

interface HealthReport {
  timestamp: number;
  overallHealth: number; // 0-100
  checks: HealthCheck[];
  metrics: KnowledgeQualityMetrics;
  storage: StorageEfficiency;
  trends: KnowledgeTrend[];
  actionItems: string[];
}

interface RemediationPlan {
  priority: 'high' | 'medium' | 'low';
  action: string;
  estimatedImpact: number;
  estimatedCost: number;
  automationPossible: boolean;
}

export class KnowledgeHealthMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private healthHistory: HealthReport[] = [];
  private readonly MAX_HISTORY = 30; // Keep last 30 reports
  private remediationQueue: RemediationPlan[] = [];

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMinutes: number = 60): void {
    if (this.checkInterval) return;

    logger.info('KnowledgeHealthMonitor', {
      interval: intervalMinutes,
      message: 'Starting knowledge health monitoring'
    });

    // Initial check
    this.runHealthCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(
      () => this.runHealthCheck(),
      intervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('KnowledgeHealthMonitor', { message: 'Monitoring stopped' });
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthReport> {
    logger.debug('KnowledgeHealthMonitor', { message: 'Running health check' });

    const checks: HealthCheck[] = await Promise.all([
      this.checkConnectivity(),
      this.checkKnowledgeCoverage(),
      this.checkDataQuality(),
      this.checkStorageEfficiency(),
      this.checkContradictions(),
      this.checkFreshness()
    ]);

    const metrics = await this.calculateQualityMetrics();
    const storage = await this.calculateStorageEfficiency();
    const trends = this.calculateTrends();

    // Calculate overall health
    const overallHealth = Math.round(
      checks.reduce((sum, c) => sum + c.score, 0) / checks.length
    );

    // Generate action items
    const actionItems = this.generateActionItems(checks, metrics);

    const report: HealthReport = {
      timestamp: Date.now(),
      overallHealth,
      checks,
      metrics,
      storage,
      trends,
      actionItems
    };

    // Store history
    this.healthHistory.push(report);
    if (this.healthHistory.length > this.MAX_HISTORY) {
      this.healthHistory.shift();
    }

    // Log critical issues immediately
    const criticalChecks = checks.filter(c => c.status === 'critical');
    if (criticalChecks.length > 0) {
      logger.error('KnowledgeHealthMonitor', {
        criticalCount: criticalChecks.length,
        issues: criticalChecks.map(c => c.name),
        message: 'Critical knowledge health issues detected'
      });
    }

    return report;
  }

  /**
   * Check knowledge graph connectivity
   */
  private async checkConnectivity(): Promise<HealthCheck> {
    const stats = knowledgeGraph.getStats();
    
    const orphanedRatio = stats.orphanedNodes / stats.totalNodes;
    let score = 100;
    let status: HealthCheck['status'] = 'healthy';
    let details = 'Knowledge graph well-connected';
    const recommendations: string[] = [];

    if (orphanedRatio > 0.2) {
      score = 60;
      status = 'warning';
      details = `${stats.orphanedNodes} orphaned nodes (${(orphanedRatio * 100).toFixed(1)}%)`;
      recommendations.push('Connect orphaned memories to related concepts');
      recommendations.push('Run knowledge graph clustering to find connections');
    }

    if (orphanedRatio > 0.5) {
      score = 30;
      status = 'critical';
      recommendations.push('Urgent: Large portion of knowledge is disconnected');
    }

    if (stats.clusteringCoefficient < 0.3) {
      score -= 10;
      recommendations.push('Low clustering - consider adding more cross-references');
    }

    return {
      id: 'connectivity',
      name: 'Knowledge Connectivity',
      status,
      score: Math.max(0, score),
      details,
      recommendations,
      lastChecked: Date.now()
    };
  }

  /**
   * Check knowledge coverage across domains
   */
  private async checkKnowledgeCoverage(): Promise<HealthCheck> {
    const brainStats = await hcsBrainRetrieval.getBrainStats();
    const patterns = implementationPatterns.getStats();
    
    // Define expected knowledge areas
    const expectedAreas = [
      'token_creation', 'token_management', 'consensus_messaging',
      'smart_contracts', 'defi_integration', 'payment_systems',
      'carbon_tracking', 'agent_orchestration'
    ];

    const coverageGaps = expectedAreas.filter(area => 
      !brainStats.knowledgeCategories.includes(area) &&
      !patterns.byCategory[area]
    );

    const coverageRatio = (expectedAreas.length - coverageGaps.length) / expectedAreas.length;
    const score = Math.round(coverageRatio * 100);

    let status: HealthCheck['status'] = 'healthy';
    if (score < 70) status = 'warning';
    if (score < 50) status = 'critical';

    return {
      id: 'coverage',
      name: 'Knowledge Coverage',
      status,
      score,
      details: `Coverage: ${(coverageRatio * 100).toFixed(0)}% (${expectedAreas.length - coverageGaps.length}/${expectedAreas.length} areas)`,
      recommendations: coverageGaps.map(gap => `Add knowledge for: ${gap}`),
      lastChecked: Date.now()
    };
  }

  /**
   * Check data quality metrics
   */
  private async checkDataQuality(): Promise<HealthCheck> {
    const metrics = await this.calculateQualityMetrics();
    
    let score = 100;
    let status: HealthCheck['status'] = 'healthy';
    const recommendations: string[] = [];

    // Deduct for low confidence
    const lowConfidenceRatio = metrics.lowConfidenceMemories / metrics.totalMemories;
    if (lowConfidenceRatio > 0.1) {
      score -= 20;
      status = 'warning';
      recommendations.push(`Review ${metrics.lowConfidenceMemories} low-confidence memories`);
    }

    // Deduct for unverified data
    if (metrics.verifiedRatio < 0.7) {
      score -= 15;
      recommendations.push('Verify more memories to improve trustworthiness');
    }

    // Deduct for duplicates
    if (metrics.duplicates > 10) {
      score -= 10;
      recommendations.push(`Deduplicate ${metrics.duplicates} duplicate memories`);
    }

    if (score < 60) status = 'critical';

    return {
      id: 'quality',
      name: 'Data Quality',
      status,
      score: Math.max(0, score),
      details: `Verified: ${(metrics.verifiedRatio * 100).toFixed(0)}%, Avg Confidence: ${(metrics.avgConfidence * 100).toFixed(0)}%`,
      recommendations,
      lastChecked: Date.now()
    };
  }

  /**
   * Check storage efficiency
   */
  private async checkStorageEfficiency(): Promise<HealthCheck> {
    const storage = await this.calculateStorageEfficiency();
    
    let score = 100;
    let status: HealthCheck['status'] = 'healthy';
    const recommendations: string[] = [];

    // Check compression ratio
    if (storage.compressionRatio < 0.5) {
      score -= 20;
      status = 'warning';
      recommendations.push('Enable message compression for HCS writes');
    }

    // Check for cost optimization opportunities
    if (storage.estimatedSavings > 10) {
      score -= 10;
      recommendations.push(`Potential savings: $${storage.estimatedSavings.toFixed(2)}/month`);
    }

    // Vector DB size warning
    if (storage.vectorDbSize > 1000000) { // 1M vectors
      score -= 15;
      recommendations.push('Large vector DB - consider pruning old embeddings');
    }

    return {
      id: 'storage',
      name: 'Storage Efficiency',
      status,
      score: Math.max(0, score),
      details: `HCS Cost: $${storage.hcsCostUsd.toFixed(2)}, Compression: ${(storage.compressionRatio * 100).toFixed(0)}%`,
      recommendations,
      lastChecked: Date.now()
    };
  }

  /**
   * Check for unresolved contradictions
   */
  private async checkContradictions(): Promise<HealthCheck> {
    const graph = knowledgeGraph.getStats();
    
    let score = 100;
    let status: HealthCheck['status'] = 'healthy';
    const recommendations: string[] = [];

    if (graph.contradictions > 0) {
      score -= Math.min(graph.contradictions * 10, 50);
      status = graph.contradictions > 5 ? 'critical' : 'warning';
      recommendations.push(`${graph.contradictions} contradictions need resolution`);
      recommendations.push('Review conflicting memories and determine correct approach');
    }

    return {
      id: 'contradictions',
      name: 'Contradictions',
      status,
      score: Math.max(0, score),
      details: graph.contradictions === 0 
        ? 'No contradictions detected' 
        : `${graph.contradictions} unresolved contradictions`,
      recommendations,
      lastChecked: Date.now()
    };
  }

  /**
   * Check knowledge freshness
   */
  private async checkFreshness(): Promise<HealthCheck> {
    const metrics = await this.calculateQualityMetrics();
    
    const staleRatio = metrics.staleMemories / metrics.totalMemories;
    let score = 100;
    let status: HealthCheck['status'] = 'healthy';
    const recommendations: string[] = [];

    if (staleRatio > 0.3) {
      score -= 25;
      status = 'warning';
      recommendations.push(`${metrics.staleMemories} memories are >90 days old`);
      recommendations.push('Consider archiving or updating stale knowledge');
    }

    if (staleRatio > 0.6) {
      score -= 25;
      status = 'critical';
      recommendations.push('Majority of knowledge is stale - refresh needed');
    }

    return {
      id: 'freshness',
      name: 'Knowledge Freshness',
      status,
      score: Math.max(0, score),
      details: `${metrics.staleMemories} stale memories (${(staleRatio * 100).toFixed(1)}%)`,
      recommendations,
      lastChecked: Date.now()
    };
  }

  /**
   * Calculate quality metrics
   */
  private async calculateQualityMetrics(): Promise<KnowledgeQualityMetrics> {
    const brainStats = await hcsBrainRetrieval.getBrainStats();
    const graph = knowledgeGraph.getStats();
    
    // Get recent memories to calculate confidence
    const recentMemories = await hcsBrainRetrieval.getRecentMemories(24 * 60 * 90); // 90 days
    
    let totalConfidence = 0;
    let verifiedCount = 0;
    let staleCount = 0;
    let lowConfidenceCount = 0;
    const now = Date.now();

    for (const memory of recentMemories) {
      const confidence = memory.content?.success ? 1 : 
                        memory.content?.user_feedback === 'positive' ? 0.8 : 0.5;
      totalConfidence += confidence;
      
      if (memory.content?.success) verifiedCount++;
      if (confidence < 0.5) lowConfidenceCount++;
      
      const ageDays = (now - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 90) staleCount++;
    }

    return {
      totalMemories: brainStats.totalMessages,
      avgConfidence: recentMemories.length > 0 ? totalConfidence / recentMemories.length : 0,
      verifiedRatio: recentMemories.length > 0 ? verifiedCount / recentMemories.length : 0,
      staleMemories: staleCount,
      lowConfidenceMemories: lowConfidenceCount,
      orphanedMemories: graph.orphanedNodes,
      contradictions: graph.contradictions,
      duplicates: 0, // Would need deduplication analysis
      coverageGaps: []
    };
  }

  /**
   * Calculate storage efficiency
   */
  private async calculateStorageEfficiency(): Promise<StorageEfficiency> {
    const brainStats = await hcsBrainRetrieval.getBrainStats();
    const vectorStats = await hcsVectorSync.getVectorStats();

    // HCS cost: ~$0.0001 per message
    const hcsCost = brainStats.totalMessages * 0.0001;
    
    // Estimate compression (if using batching)
    const compressionRatio = 0.85; // Assuming 85% with batching
    const uncompressedCost = hcsCost / compressionRatio;
    const savings = uncompressedCost - hcsCost;

    return {
      hcsMessagesTotal: brainStats.totalMessages,
      hcsCostUsd: hcsCost,
      vectorDbSize: vectorStats.totalVectors,
      compressionRatio,
      estimatedSavings: savings
    };
  }

  /**
   * Calculate trends from health history
   */
  private calculateTrends(): KnowledgeTrend[] {
    if (this.healthHistory.length < 2) return [];

    const trends: KnowledgeTrend[] = [];
    
    // Group by week
    const weeklyData = this.groupByWeek(this.healthHistory);
    
    for (const [week, reports] of weeklyData) {
      const newMemories = reports[reports.length - 1].metrics.totalMemories - 
                         reports[0].metrics.totalMemories;
      
      trends.push({
        period: week,
        newMemories,
        newPatterns: 0, // Would need pattern tracking
        avgQuality: reports.reduce((sum, r) => sum + r.overallHealth, 0) / reports.length,
        hotTopics: [], // Would need topic analysis
        decliningAreas: [] // Would need area tracking
      });
    }

    return trends.slice(-4); // Last 4 weeks
  }

  /**
   * Group reports by week
   */
  private groupByWeek(reports: HealthReport[]): Map<string, HealthReport[]> {
    const groups = new Map<string, HealthReport[]>();
    
    for (const report of reports) {
      const date = new Date(report.timestamp);
      const week = `${date.getFullYear()}-W${Math.ceil((date.getDate()) / 7)}`;
      
      if (!groups.has(week)) {
        groups.set(week, []);
      }
      groups.get(week)!.push(report);
    }

    return groups;
  }

  /**
   * Generate action items from health checks
   */
  private generateActionItems(checks: HealthCheck[], metrics: KnowledgeQualityMetrics): string[] {
    const actions: string[] = [];

    for (const check of checks) {
      if (check.status !== 'healthy') {
        actions.push(...check.recommendations);
      }
    }

    // Add general maintenance actions
    if (metrics.staleMemories > 100) {
      actions.push('Archive memories older than 180 days');
    }

    if (metrics.orphanedMemories > 50) {
      actions.push('Run knowledge graph reclustering');
    }

    // Remove duplicates
    return [...new Set(actions)];
  }

  /**
   * Auto-remediate issues where possible
   */
  async autoRemediate(): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
    details: string[];
  }> {
    const report = await this.runHealthCheck();
    let attempted = 0, succeeded = 0, failed = 0;
    const details: string[] = [];

    // 1. Prune stale knowledge
    const staleCheck = report.checks.find(c => c.id === 'freshness');
    if (staleCheck?.status === 'warning' || staleCheck?.status === 'critical') {
      attempted++;
      try {
        const removed = knowledgeGraph.pruneKnowledge(180, 0.1);
        succeeded++;
        details.push(`Pruned ${removed} stale knowledge nodes`);
      } catch (e) {
        failed++;
        details.push('Failed to prune stale knowledge');
      }
    }

    // 2. Cluster orphaned nodes
    const connectivityCheck = report.checks.find(c => c.id === 'connectivity');
    if (connectivityCheck?.status === 'warning') {
      attempted++;
      try {
        knowledgeGraph.clusterKnowledge();
        succeeded++;
        details.push('Reclustered knowledge graph to connect orphans');
      } catch (e) {
        failed++;
        details.push('Failed to recluster knowledge');
      }
    }

    logger.info('KnowledgeHealthMonitor', {
      attempted,
      succeeded,
      failed,
      message: 'Auto-remediation completed'
    });

    return { attempted, succeeded, failed, details };
  }

  /**
   * Get latest health report
   */
  getLatestReport(): HealthReport | null {
    return this.healthHistory[this.healthHistory.length - 1] || null;
  }

  /**
   * Get health history
   */
  getHealthHistory(): HealthReport[] {
    return [...this.healthHistory];
  }

  /**
   * Export health data for external analysis
   */
  exportHealthData(): {
    history: HealthReport[];
    trends: KnowledgeTrend[];
    summary: {
      avgHealth: number;
      criticalEvents: number;
      improvementAreas: string[];
    };
  } {
    const history = this.healthHistory;
    const avgHealth = history.length > 0
      ? history.reduce((sum, h) => sum + h.overallHealth, 0) / history.length
      : 0;

    const criticalEvents = history.filter(h => 
      h.checks.some(c => c.status === 'critical')
    ).length;

    const improvementAreas = [...new Set(
      history.flatMap(h => h.actionItems)
    )].slice(0, 10);

    return {
      history,
      trends: this.calculateTrends(),
      summary: {
        avgHealth: Math.round(avgHealth),
        criticalEvents,
        improvementAreas
      }
    };
  }
}

// Export singleton
export const knowledgeHealth = new KnowledgeHealthMonitor();
export default knowledgeHealth;
