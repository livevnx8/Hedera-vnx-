/**
 * Vera Superintelligence API Routes
 * 
 * API endpoints for Vera's advanced superintelligence capabilities
 * including multimodal processing, blockchain intelligence, and conversational AI.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { superintelligenceEngine, ReasoningRequest } from '../superintelligence/core/SuperintelligenceEngine.js';
import { multimodalProcessor, MultimodalInput } from '../superintelligence/multimodal/MultimodalProcessor.js';
import { multiChainIntelligenceHub } from '../superintelligence/blockchain/MultiChainIntelligenceHub.js';
import { conversationalSuperintelligence } from '../superintelligence/conversational/ConversationalSuperintelligence.js';
import { logger } from '../security/secureLogger.js';

export function registerSuperintelligenceRoutes(fastify: FastifyInstance): void {
  // Superintelligence Engine Routes
  
  // Process reasoning request
  fastify.post('/api/superintelligence/reason', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const reasoningRequest = request.body as ReasoningRequest;
      
      const response = await superintelligenceEngine.processRequest(reasoningRequest);
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in superintelligence reasoning', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to process reasoning request'
      });
    }
  });

  // Get superintelligence metrics
  fastify.get('/api/superintelligence/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = superintelligenceEngine.getMetrics();
      
      return reply.send({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting superintelligence metrics', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get metrics'
      });
    }
  });

  // Multimodal Processing Routes
  
  // Process multimodal input
  fastify.post('/api/superintelligence/multimodal/process', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const multimodalInput = request.body as MultimodalInput;
      
      const response = await multimodalProcessor.processInput(multimodalInput);
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error processing multimodal input', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to process multimodal input'
      });
    }
  });

  // Get multimodal capabilities
  fastify.get('/api/superintelligence/multimodal/capabilities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const capabilities = multimodalProcessor.getCapabilities();
      
      return reply.send({
        success: true,
        data: Array.from(capabilities.entries()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting multimodal capabilities', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get capabilities'
      });
    }
  });

  // Get multimodal metrics
  fastify.get('/api/superintelligence/multimodal/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = multimodalProcessor.getMetrics();
      
      return reply.send({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting multimodal metrics', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get metrics'
      });
    }
  });

  // Blockchain Intelligence Routes
  
  // Get all blockchain data
  fastify.get('/api/superintelligence/blockchain/data', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = multiChainIntelligenceHub.getAllChainData();
      
      return reply.send({
        success: true,
        data: Array.from(data.entries()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting blockchain data', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get blockchain data'
      });
    }
  });

  // Get specific chain data
  fastify.get('/api/superintelligence/blockchain/data/:chainId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { chainId } = request.params as { chainId: string };
      const data = multiChainIntelligenceHub.getChainData(chainId);
      
      if (!data) {
        return reply.status(404).send({
          success: false,
          error: 'Chain not found'
        });
      }
      
      return reply.send({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting chain data', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get chain data'
      });
    }
  });

  // Get market intelligence
  fastify.get('/api/superintelligence/blockchain/market-intelligence', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const intelligence = multiChainIntelligenceHub.getAllMarketIntelligence();
      
      return reply.send({
        success: true,
        data: Array.from(intelligence.entries()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting market intelligence', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get market intelligence'
      });
    }
  });

  // Get DeFi opportunities
  fastify.get('/api/superintelligence/blockchain/defi-opportunities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type, chain } = request.query as { type?: string; chain?: string };
      const opportunities = multiChainIntelligenceHub.getDeFiOpportunities(type, chain);
      
      return reply.send({
        success: true,
        data: opportunities,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting DeFi opportunities', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get DeFi opportunities'
      });
    }
  });

  // Get predictive analytics
  fastify.get('/api/superintelligence/blockchain/predictive-analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const analytics = multiChainIntelligenceHub.getAllPredictiveAnalytics();
      
      return reply.send({
        success: true,
        data: Array.from(analytics.entries()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting predictive analytics', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get predictive analytics'
      });
    }
  });

  // Get market overview
  fastify.get('/api/superintelligence/blockchain/market-overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const overview = multiChainIntelligenceHub.getMarketOverview();
      
      return reply.send({
        success: true,
        data: overview,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting market overview', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get market overview'
      });
    }
  });

  // Get top performers
  fastify.get('/api/superintelligence/blockchain/top-performers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { count = '10' } = request.query as { count?: string };
      const performers = multiChainIntelligenceHub.getTopPerformers(parseInt(count));
      
      return reply.send({
        success: true,
        data: performers,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting top performers', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get top performers'
      });
    }
  });

  // Conversational Superintelligence Routes
  
  // Process conversational message
  fastify.post('/api/superintelligence/conversation/process', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, sessionId, content, contentType } = request.body as {
        userId: string;
        sessionId: string;
        content: string;
        contentType?: 'text' | 'voice' | 'image' | 'code' | 'mixed';
      };
      
      const response = await conversationalSuperintelligence.processMessage(
        userId,
        sessionId,
        content,
        contentType || 'text'
      );
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error processing conversational message', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to process conversational message'
      });
    }
  });

  // Get conversation context
  fastify.get('/api/superintelligence/conversation/context/:userId/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, sessionId } = request.params as { userId: string; sessionId: string };
      const context = conversationalSuperintelligence.getConversationContext(userId, sessionId);
      
      if (!context) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation not found'
        });
      }
      
      return reply.send({
        success: true,
        data: context,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting conversation context', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get conversation context'
      });
    }
  });

  // Get user profile
  fastify.get('/api/superintelligence/conversation/profile/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };
      const profile = conversationalSuperintelligence.getUserProfile(userId);
      
      if (!profile) {
        return reply.status(404).send({
          success: false,
          error: 'User profile not found'
        });
      }
      
      return reply.send({
        success: true,
        data: profile,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting user profile', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get user profile'
      });
    }
  });

  // Get conversational metrics
  fastify.get('/api/superintelligence/conversation/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = conversationalSuperintelligence.getMetrics();
      
      return reply.send({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting conversational metrics', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get conversational metrics'
      });
    }
  });

  // Clear conversation
  fastify.delete('/api/superintelligence/conversation/:userId/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, sessionId } = request.params as { userId: string; sessionId: string };
      conversationalSuperintelligence.clearConversation(userId, sessionId);
      
      return reply.send({
        success: true,
        message: 'Conversation cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error clearing conversation', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to clear conversation'
      });
    }
  });

  // Comprehensive Superintelligence Routes
  
  // Get complete system status
  fastify.get('/api/superintelligence/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const superintelligenceMetrics = superintelligenceEngine.getMetrics();
      const multimodalMetrics = multimodalProcessor.getMetrics();
      const blockchainMetrics = multiChainIntelligenceHub.getMetrics();
      const conversationalMetrics = conversationalSuperintelligence.getMetrics();
      
      return reply.send({
        success: true,
        data: {
          superintelligence: superintelligenceMetrics,
          multimodal: multimodalMetrics,
          blockchain: blockchainMetrics,
          conversational: conversationalMetrics,
          systemHealth: {
            status: 'healthy',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting system status', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to get system status'
      });
    }
  });

  // Unified superintelligence query
  fastify.post('/api/superintelligence/query', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query, userId, sessionId, options } = request.body as {
        query: string;
        userId?: string;
        sessionId?: string;
        options?: {
          includeReasoning?: boolean;
          includeBlockchain?: boolean;
          includeMultimodal?: boolean;
          includeConversation?: boolean;
          domains?: string[];
        };
      };
      
      const results: any = {};
      
      // Always include reasoning
      if (options?.includeReasoning !== false) {
        const reasoningRequest: ReasoningRequest = {
          query,
          context: {},
          domains: options?.domains || ['general'],
          priority: 'medium',
          userId,
          sessionId
        };
        
        results.reasoning = await superintelligenceEngine.processRequest(reasoningRequest);
      }
      
      // Include blockchain intelligence if requested
      if (options?.includeBlockchain) {
        results.blockchain = {
          marketOverview: multiChainIntelligenceHub.getMarketOverview(),
          topPerformers: multiChainIntelligenceHub.getTopPerformers(5),
          opportunities: multiChainIntelligenceHub.getDeFiOpportunities()
        };
      }
      
      // Include multimodal processing if content suggests it
      if (options?.includeMultimodal) {
        const multimodalInput: MultimodalInput = {
          type: 'text',
          content: query
        };
        
        results.multimodal = await multimodalProcessor.processInput(multimodalInput);
      }
      
      // Include conversational processing if user context provided
      if (options?.includeConversation && userId && sessionId) {
        results.conversation = await conversationalSuperintelligence.processMessage(
          userId,
          sessionId,
          query
        );
      }
      
      return reply.send({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in unified superintelligence query', error instanceof Error ? error : new Error(String(error)));
      return reply.status(500).send({
        success: false,
        error: 'Failed to process unified query'
      });
    }
  });

  logger.info('Superintelligence routes registered');
}
