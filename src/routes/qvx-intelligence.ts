/**
 * Vera QVX Intelligence API Routes
 * 
 * Real-time blockchain intelligence powered by Hedera's QVX mirror node.
 * These endpoints provide access to Vera's unique real-time blockchain
 * analysis capabilities that no other AI system can offer.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { qvxIntelligenceEngine } from '../superintelligence/qvx/QVXIntelligenceEngine.js';
import { logger } from '../security/secureLogger.js';

export function registerQVXIntelligenceRoutes(fastify: FastifyInstance): void {
  
  // Get real-time network metrics
  fastify.get('/api/qvx/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = qvxIntelligenceEngine.getCurrentMetrics();
      
      return reply.send({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX metrics', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX metrics'
      });
    }
  });

  // Get network health status
  fastify.get('/api/qvx/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = qvxIntelligenceEngine.getNetworkHealth();
      
      return reply.send({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX health', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX health'
      });
    }
  });

  // Get recent patterns detected
  fastify.get('/api/qvx/patterns', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 10 } = request.query as { limit?: string };
      const patterns = qvxIntelligenceEngine.getRecentPatterns(Number(limit) || 10);
      
      return reply.send({
        success: true,
        data: patterns,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX patterns', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX patterns'
      });
    }
  });

  // Get predictive insights
  fastify.get('/api/qvx/predictions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 10 } = request.query as { limit?: string };
      const predictions = qvxIntelligenceEngine.getPredictions(Number(limit) || 10);
      
      return reply.send({
        success: true,
        data: predictions,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX predictions', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX predictions'
      });
    }
  });

  // Get recent timeline entries
  fastify.get('/api/qvx/timeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 100 } = request.query as { limit?: string };
      const timeline = qvxIntelligenceEngine.getTimelineCache(Number(limit) || 100);
      
      return reply.send({
        success: true,
        data: timeline,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX timeline', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX timeline'
      });
    }
  });

  // Search transactions
  fastify.post('/api/qvx/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const searchParams = request.body as {
        account?: string;
        type?: string;
        from?: string;
        to?: string;
        limit?: number;
      };
      
      const results = await qvxIntelligenceEngine.searchTransactions(searchParams);
      
      return reply.send({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error searching QVX transactions', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to search QVX transactions'
      });
    }
  });

  // Analyze specific account
  fastify.post('/api/qvx/analyze-account', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { accountId, timeframe = 3600000 } = request.body as {
        accountId: string;
        timeframe?: number;
      };
      
      const analysis = await qvxIntelligenceEngine.analyzeAccount(accountId, timeframe);
      
      return reply.send({
        success: true,
        data: analysis,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error analyzing QVX account', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to analyze QVX account'
      });
    }
  });

  // Get real-time intelligence summary
  fastify.get('/api/qvx/intelligence-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = qvxIntelligenceEngine.getCurrentMetrics();
      const health = qvxIntelligenceEngine.getNetworkHealth();
      const patterns = qvxIntelligenceEngine.getRecentPatterns(5);
      const predictions = qvxIntelligenceEngine.getPredictions(5);
      
      const summary = {
        network: {
          health: health.status,
          tps: health.tps,
          utilization: health.utilization,
          averageFee: health.averageFee,
          activeAccounts: health.activeAccounts
        },
        intelligence: {
          recentPatterns: patterns.length,
          activePredictions: predictions.length,
          totalTransactions: metrics?.totalTransactions || 0,
          recentTransactions: metrics?.transactionsPerSecond || 0
        },
        alerts: {
          critical: patterns.filter(p => p.severity === 'critical').length,
          high: patterns.filter(p => p.severity === 'high').length,
          medium: patterns.filter(p => p.severity === 'medium').length
        },
        predictions: predictions.slice(0, 3),
        patterns: patterns.slice(0, 3)
      };
      
      return reply.send({
        success: true,
        data: summary,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX intelligence summary', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX intelligence summary'
      });
    }
  });

  // Get real-time market intelligence
  fastify.get('/api/qvx/market-intelligence', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = qvxIntelligenceEngine.getCurrentMetrics();
      const patterns = qvxIntelligenceEngine.getRecentPatterns(10);
      const predictions = qvxIntelligenceEngine.getPredictions(10);
      
      const marketIntelligence = {
        currentActivity: {
          tps: metrics?.transactionsPerSecond || 0,
          utilization: metrics?.networkUtilization || 0,
          averageFee: metrics?.averageFee || 0,
          activeAccounts: metrics?.activeAccounts || 0
        },
        tokenActivity: {
          transfers: metrics?.tokenTransfers || 0,
          smartContracts: metrics?.smartContractCalls || 0,
          staking: metrics?.stakingActivity || 0
        },
        patterns: patterns.filter(p => 
          p.patternType === 'volume_spike' || 
          p.patternType === 'token_momentum' ||
          p.patternType === 'fee_anomaly'
        ),
        predictions: predictions.filter(p => 
          p.type === 'price_movement' || 
          p.type === 'token_performance' ||
          p.type === 'market_sentiment'
        ),
        opportunities: identifyOpportunities(patterns, predictions),
        risks: identifyRisks(patterns, predictions)
      };
      
      return reply.send({
        success: true,
        data: marketIntelligence,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX market intelligence', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX market intelligence'
      });
    }
  });

  // Get real-time network analysis
  fastify.get('/api/qvx/network-analysis', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = qvxIntelligenceEngine.getCurrentMetrics();
      const health = qvxIntelligenceEngine.getNetworkHealth();
      const patterns = qvxIntelligenceEngine.getRecentPatterns(20);
      
      const networkAnalysis = {
        performance: {
          currentTPS: metrics?.transactionsPerSecond || 0,
          maxCapacity: 200,
          utilization: health.utilization,
          status: health.status
        },
        economics: {
          averageFee: metrics?.averageFee || 0,
          totalFees: (metrics?.transactionsPerSecond || 0) * (metrics?.averageFee || 0),
          feeTrend: calculateFeeTrend(metrics),
          efficiency: calculateNetworkEfficiency(metrics)
        },
        activity: {
          activeAccounts: metrics?.activeAccounts || 0,
          tokenTransfers: metrics?.tokenTransfers || 0,
          smartContracts: metrics?.smartContractCalls || 0,
          newAccounts: metrics?.stakingActivity || 0
        },
        patterns: patterns.filter(p => 
          p.patternType === 'volume_spike' || 
          p.patternType === 'network_congestion'
        ),
        forecast: {
          nextHourTPS: predictTPS(metrics),
          congestionRisk: predictCongestionRisk(metrics, patterns),
          feeTrend: predictFeeTrend(metrics, patterns)
        }
      };
      
      return reply.send({
        success: true,
        data: networkAnalysis,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting QVX network analysis', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get QVX network analysis'
      });
    }
  });

  // Note: WebSocket endpoint removed due to Fastify version compatibility
  // Can be added back with proper WebSocket library integration

  function identifyOpportunities(patterns: any[], predictions: any[]): any[] {
    const opportunities: any[] = [];
    
    // Volume spike opportunities
    const volumeSpikes = patterns.filter((p: any) => p.patternType === 'volume_spike');
    volumeSpikes.forEach((spike: any) => {
      opportunities.push({
        type: 'trading_opportunity',
        description: `High volume detected: ${spike.description}`,
        confidence: spike.confidence,
        timeframe: spike.timeframe,
        affectedEntities: spike.affectedEntities
      });
    });
    
    // Token momentum opportunities
    const tokenMomentum = predictions.filter((p: any) => p.type === 'token_performance');
    tokenMomentum.forEach((momentum: any) => {
      if (momentum.confidence > 0.7) {
        opportunities.push({
          type: 'token_opportunity',
          description: momentum.prediction,
          confidence: momentum.confidence,
          timeframe: momentum.timeframe,
          riskLevel: momentum.riskLevel
        });
      }
    });
    
    return opportunities;
  }

  function identifyRisks(patterns: any[], predictions: any[]): any[] {
    const risks: any[] = [];
    
    // Network congestion risks
    const congestion = patterns.filter((p: any) => p.patternType === 'network_congestion');
    congestion.forEach((congestion: any) => {
      risks.push({
        type: 'network_congestion',
        description: congestion.description,
        severity: congestion.severity,
        timeframe: congestion.timeframe,
        confidence: congestion.confidence
      });
    });
    
    // Fee anomaly risks
    const feeAnomalies = patterns.filter((p: any) => p.patternType === 'fee_anomaly');
    feeAnomalies.forEach((anomaly: any) => {
      if (anomaly.severity === 'critical') {
        risks.push({
          type: 'fee_anomaly',
          description: anomaly.description,
          severity: anomaly.severity,
          timeframe: anomaly.timeframe,
          confidence: anomaly.confidence
        });
      }
    });
    
    return risks;
  }

  function calculateFeeTrend(metrics?: any): 'increasing' | 'decreasing' | 'stable' {
    if (!metrics) return 'stable';
    
    // Simple trend calculation based on recent data
    const currentFee = metrics.averageFee;
    const historicalAverage = 100000; // 0.001 HBAR
    
    if (currentFee > historicalAverage * 1.2) return 'increasing';
    if (currentFee < historicalAverage * 0.8) return 'decreasing';
    return 'stable';
  }

  function calculateNetworkEfficiency(metrics?: any): number {
    if (!metrics) return 0;
    
    // Efficiency based on TPS vs utilization
    const tps = metrics.transactionsPerSecond;
    const utilization = metrics.networkUtilization;
    
    if (utilization === 0) return 0;
    
    // Higher efficiency = higher TPS with lower utilization
    return Math.min(tps / (utilization * 200), 1);
  }

  function predictTPS(metrics?: any): number {
    if (!metrics) return 50; // Default prediction
    
    const currentTPS = metrics.transactionsPerSecond;
    const utilization = metrics.networkUtilization;
    
    // Simple prediction based on current utilization
    if (utilization > 0.8) {
      return currentTPS * 0.9; // Expect decrease if congested
    } else if (utilization < 0.3) {
      return currentTPS * 1.1; // Expect increase if underutilized
    }
    
    return currentTPS; // Expect stable
  }

  function predictCongestionRisk(metrics?: any, patterns?: any[]): 'low' | 'medium' | 'high' {
    if (!metrics) return 'low';
    
    const utilization = metrics.networkUtilization;
    const congestionPatterns = patterns?.filter((p: any) => p.patternType === 'network_congestion') || [];
    
    if (utilization > 0.9 || congestionPatterns.length > 0) return 'high';
    if (utilization > 0.7) return 'medium';
    return 'low';
  }

  function predictFeeTrend(metrics?: any, patterns?: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (!metrics) return 'stable';
    
    const feeAnomalies = patterns?.filter((p: any) => p.patternType === 'fee_anomaly') || [];
    const currentFee = metrics.averageFee;
    
    if (feeAnomalies.length > 0 || currentFee > 200000) return 'increasing';
    if (currentFee < 50000) return 'decreasing';
    return 'stable';
  }

  logger.info('QVX Intelligence routes registered');
}
