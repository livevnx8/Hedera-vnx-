/**
 * Enhanced Capabilities API Routes
 * 
 * Provides endpoints for Vera's enhanced general knowledge,
 * context management, and natural language capabilities.
 */

import { FastifyInstance } from 'fastify';
import { enhancedIntegration, EnhancedQuery } from '../agent/enhanced-integration.js';
import { generalKnowledge, GeneralKnowledgeQuery } from '../agent/general-knowledge.js';
import { enhancedContext } from '../agent/enhanced-context.js';
import { naturalLanguageEnhancer } from '../agent/natural-language.js';

export function registerEnhancedRoutes(fastify: FastifyInstance): void {
  // Enhanced query processing
  fastify.post('/api/enhanced/query', async (request, reply) => {
    try {
      const query = request.body as EnhancedQuery;
      
      if (!query.query || typeof query.query !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Query is required and must be a string'
        });
      }

      const response = await enhancedIntegration.processEnhancedQuery(query);
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error processing enhanced query:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process enhanced query'
      });
    }
  });

  // General knowledge query
  fastify.post('/api/enhanced/knowledge', async (request, reply) => {
    try {
      const query = request.body as GeneralKnowledgeQuery;
      
      if (!query.query || typeof query.query !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Query is required and must be a string'
        });
      }

      const response = await generalKnowledge.queryGeneralKnowledge(query);
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error querying general knowledge:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to query general knowledge'
      });
    }
  });

  // Natural language enhancement
  fastify.post('/api/enhanced/language', async (request, reply) => {
    try {
      const { text, context } = request.body as { text: string; context?: string };
      
      if (!text || typeof text !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Text is required and must be a string'
        });
      }

      const response = await naturalLanguageEnhancer.enhanceResponse(text, context);
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error enhancing natural language:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to enhance natural language'
      });
    }
  });

  // Add personality to text
  fastify.post('/api/enhanced/personality', async (request, reply) => {
    try {
      const { text, style } = request.body as { text: string; style?: any };
      
      if (!text || typeof text !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Text is required and must be a string'
        });
      }

      const response = await naturalLanguageEnhancer.addPersonality(text, style);
      
      return reply.send({
        success: true,
        data: { enhanced: response },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error adding personality:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to add personality'
      });
    }
  });

  // Generate conversational flow
  fastify.post('/api/enhanced/conversation', async (request, reply) => {
    try {
      const { userMessage, conversationHistory } = request.body as { 
        userMessage: string; 
        conversationHistory: string[] 
      };
      
      if (!userMessage || typeof userMessage !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'User message is required and must be a string'
        });
      }

      if (!Array.isArray(conversationHistory)) {
        return reply.status(400).send({
          success: false,
          error: 'Conversation history must be an array'
        });
      }

      const response = await naturalLanguageEnhancer.generateConversationalFlow(userMessage, conversationHistory);
      
      return reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error generating conversational flow:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate conversational flow'
      });
    }
  });

  // Context management
  fastify.get('/api/enhanced/context', async (request, reply) => {
    try {
      const maxTokens = (request.query as any).maxTokens ? 
        parseInt((request.query as any).maxTokens) : undefined;
      
      const context = enhancedContext.getContextWindow(maxTokens);
      const stats = enhancedContext.getContextStats();
      
      return reply.send({
        success: true,
        data: {
          context,
          stats
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting context:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get context'
      });
    }
  });

  // Add item to context
  fastify.post('/api/enhanced/context', async (request, reply) => {
    try {
      const item = request.body as any;
      
      if (!item.content || typeof item.content !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Content is required and must be a string'
        });
      }

      const id = enhancedContext.addItem({
        type: item.type || 'user_message',
        content: item.content,
        timestamp: new Date(),
        priority: item.priority || 0.5,
        metadata: item.metadata
      });
      
      return reply.send({
        success: true,
        data: { id },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error adding context item:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to add context item'
      });
    }
  });

  // Clear old context items
  fastify.delete('/api/enhanced/context', async (request, reply) => {
    try {
      const olderThanHours = (request.query as any).olderThanHours ? 
        parseInt((request.query as any).olderThanHours) : 24;
      
      enhancedContext.clearOldItems(olderThanHours);
      
      return reply.send({
        success: true,
        message: `Context items older than ${olderThanHours} hours cleared`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error clearing context:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to clear context'
      });
    }
  });

  // Get capabilities
  fastify.get('/api/enhanced/capabilities', async (request, reply) => {
    try {
      const capabilities = enhancedIntegration.getCapabilities();
      const gapAnalysis = enhancedIntegration.analyzeGap();
      const performance = enhancedIntegration.getPerformanceMetrics();
      
      return reply.send({
        success: true,
        data: {
          capabilities,
          gapAnalysis,
          performance
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting capabilities:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get capabilities'
      });
    }
  });

  // Enable/disable capabilities
  fastify.post('/api/enhanced/capabilities/:capability', async (request, reply) => {
    try {
      const { capability } = request.params as { capability: string };
      const { enabled } = request.body as { enabled: boolean };
      
      if (!['generalKnowledge', 'enhancedContext', 'naturalLanguage', 'reasoning', 'synthesis'].includes(capability)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid capability'
        });
      }

      if (enabled) {
        enhancedIntegration.enableCapability(capability as any);
      } else {
        enhancedIntegration.disableCapability(capability as any);
      }
      
      return reply.send({
        success: true,
        message: `Capability ${capability} ${enabled ? 'enabled' : 'disabled'}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating capability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update capability'
      });
    }
  });

  // Benchmark against general AI
  fastify.post('/api/enhanced/benchmark', async (request, reply) => {
    try {
      const results = await enhancedIntegration.benchmarkAgainstGeneralAI();
      
      return reply.send({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error running benchmark:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to run benchmark'
      });
    }
  });

  // Generate creative analogies
  fastify.post('/api/enhanced/analogies', async (request, reply) => {
    try {
      const { concept, context } = request.body as { concept: string; context?: string };
      
      if (!concept || typeof concept !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Concept is required and must be a string'
        });
      }

      const analogies = naturalLanguageEnhancer.generateCreativeAnalogies(concept, context);
      
      return reply.send({
        success: true,
        data: { analogies },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error generating analogies:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate analogies'
      });
    }
  });

  // Get knowledge domains
  fastify.get('/api/enhanced/knowledge/domains', async (request, reply) => {
    try {
      const domains = generalKnowledge.getKnowledgeDomains();
      
      return reply.send({
        success: true,
        data: { domains },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting knowledge domains:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get knowledge domains'
      });
    }
  });

  // Add knowledge item
  fastify.post('/api/enhanced/knowledge/items', async (request, reply) => {
    try {
      const item = request.body as any;
      
      if (!item.content || typeof item.content !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Content is required and must be a string'
        });
      }

      if (!item.domain || typeof item.domain !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Domain is required and must be a string'
        });
      }

      const id = await generalKnowledge.addKnowledgeItem({
        domain: item.domain,
        topic: item.topic || 'General',
        content: item.content,
        facts: item.facts || [],
        concepts: item.concepts || [],
        relationships: item.relationships || [],
        confidence: item.confidence || 0.8,
        sources: item.sources || [],
        lastVerified: new Date()
      });
      
      return reply.send({
        success: true,
        data: { id },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error adding knowledge item:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to add knowledge item'
      });
    }
  });
}
