import { FastifyRequest, FastifyReply } from 'fastify';
import { reasoningEngine, ReasoningResult } from '../reasoning/reasoningEngine.js';

/**
 * Reasoning API Routes
 * 
 * Provides endpoints for Vera's reasoning capabilities
 * Replaces template-based responses with actual cognitive processing
 */

export async function reasoningRoutes(app: any) {
  
  // Main reasoning endpoint
  app.post('/api/reasoning/reason', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { question, context, explainSteps } = request.body as {
        question: string;
        context?: string;
        explainSteps?: boolean;
      };

      if (!question || typeof question !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Question is required and must be a string'
        });
      }

      // Configure reasoning engine
      if (explainSteps !== undefined) {
        reasoningEngine.config.explainReasoning = explainSteps;
      }

      // Perform reasoning
      const startTime = Date.now();
      const result = await reasoningEngine.reason(question, context);
      const endTime = Date.now();

      // Format response
      const response = {
        success: true,
        data: {
          question,
          result: reasoningEngine.formatReasoningResult(result),
          metadata: {
            reasoningType: result.reasoningType,
            confidence: result.confidence,
            stepsCount: result.steps.length,
            processingTime: endTime - startTime,
            hasExplanation: reasoningEngine.config.explainReasoning
          }
        }
      };

      return reply.send(response);

    } catch (error) {
      console.error('Reasoning error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal reasoning error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Quick reasoning endpoint (simplified response)
  app.post('/api/reasoning/quick', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { question } = request.body as { question: string };

      if (!question || typeof question !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'Question is required'
        });
      }

      // Quick reasoning without detailed steps
      reasoningEngine.config.explainReasoning = false;
      const result = await reasoningEngine.reason(question);

      return reply.send({
        success: true,
        data: {
          question,
          answer: result.conclusion,
          confidence: result.confidence,
          reasoningType: result.reasoningType
        }
      });

    } catch (error) {
      console.error('Quick reasoning error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Quick reasoning failed'
      });
    }
  });

  // Logical reasoning specific endpoint
  app.post('/api/reasoning/logical', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { premises, question } = request.body as {
        premises: string[];
        question: string;
      };

      if (!premises || !Array.isArray(premises) || !question) {
        return reply.status(400).send({
          success: false,
          error: 'Premises array and question are required'
        });
      }

      // Combine premises into context for logical reasoning
      const context = premises.join('. ');
      const fullQuestion = `Given the premises: ${context}. Question: ${question}`;

      const result = await reasoningEngine.reason(fullQuestion, context);

      return reply.send({
        success: true,
        data: {
          premises,
          question,
          conclusion: result.conclusion,
          reasoning: reasoningEngine.formatReasoningResult(result),
          confidence: result.confidence
        }
      });

    } catch (error) {
      console.error('Logical reasoning error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Logical reasoning failed'
      });
    }
  });

  // Problem solving endpoint
  app.post('/api/reasoning/solve', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { problem, constraints, requirements } = request.body as {
        problem: string;
        constraints?: string[];
        requirements?: string[];
      };

      if (!problem) {
        return reply.status(400).send({
          success: false,
          error: 'Problem statement is required'
        });
      }

      // Build context from constraints and requirements
      let context = '';
      if (constraints && constraints.length > 0) {
        context += `Constraints: ${constraints.join(', ')}. `;
      }
      if (requirements && requirements.length > 0) {
        context += `Requirements: ${requirements.join(', ')}. `;
      }

      const fullProblem = context ? `${context} Problem: ${problem}` : problem;

      const result = await reasoningEngine.reason(fullProblem, context);

      return reply.send({
        success: true,
        data: {
          problem,
          constraints: constraints || [],
          requirements: requirements || [],
          solution: result.conclusion,
          reasoning: reasoningEngine.formatReasoningResult(result),
          confidence: result.confidence
        }
      });

    } catch (error) {
      console.error('Problem solving error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Problem solving failed'
      });
    }
  });

  // Mathematical reasoning endpoint
  app.post('/api/reasoning/mathematical', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { problem, variables, given } = request.body as {
        problem: string;
        variables?: Record<string, number>;
        given?: Record<string, any>;
      };

      if (!problem) {
        return reply.status(400).send({
          success: false,
          error: 'Mathematical problem is required'
        });
      }

      // Build context from variables and given information
      let context = '';
      if (variables && Object.keys(variables).length > 0) {
        context += `Variables: ${JSON.stringify(variables)}. `;
      }
      if (given && Object.keys(given).length > 0) {
        context += `Given: ${JSON.stringify(given)}. `;
      }

      const fullProblem = context ? `${context} Mathematical problem: ${problem}` : problem;

      const result = await reasoningEngine.reason(fullProblem, context);

      return reply.send({
        success: true,
        data: {
          problem,
          variables: variables || {},
          given: given || {},
          solution: result.conclusion,
          steps: result.steps.map(step => ({
            step: step.step,
            description: step.description,
            result: step.result
          })),
          confidence: result.confidence
        }
      });

    } catch (error) {
      console.error('Mathematical reasoning error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Mathematical reasoning failed'
      });
    }
  });

  // Ethical reasoning endpoint
  app.post('/api/reasoning/ethical', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { dilemma, stakeholders, framework } = request.body as {
        dilemma: string;
        stakeholders?: string[];
        framework?: string;
      };

      if (!dilemma) {
        return reply.status(400).send({
          success: false,
          error: 'Ethical dilemma is required'
        });
      }

      // Build context for ethical reasoning
      let context = '';
      if (stakeholders && stakeholders.length > 0) {
        context += `Stakeholders: ${stakeholders.join(', ')}. `;
      }
      if (framework) {
        context += `Ethical framework: ${framework}. `;
      }

      const fullDilemma = context ? `${context} Ethical dilemma: ${dilemma}` : dilemma;

      const result = await reasoningEngine.reason(fullDilemma, context);

      return reply.send({
        success: true,
        data: {
          dilemma,
          stakeholders: stakeholders || [],
          framework: framework || 'auto-detected',
          recommendation: result.conclusion,
          reasoning: reasoningEngine.formatReasoningResult(result),
          confidence: result.confidence
        }
      });

    } catch (error) {
      console.error('Ethical reasoning error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Ethical reasoning failed'
      });
    }
  });

  // Reasoning capabilities info endpoint
  app.get('/api/reasoning/capabilities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const capabilities = {
        reasoningTypes: [
          {
            type: 'logical',
            description: 'Deductive reasoning using logical rules and syllogisms',
            examples: ['If-then statements', 'All A are B patterns', 'Logical conclusions']
          },
          {
            type: 'problem-solving',
            description: 'Systematic problem breakdown and solution development',
            examples: ['Step-by-step solutions', 'Constraint analysis', 'Strategy development']
          },
          {
            type: 'analytical',
            description: 'Data analysis and pattern recognition',
            examples: ['Trend analysis', 'Component breakdown', 'Relationship analysis']
          },
          {
            type: 'mathematical',
            description: 'Mathematical problem solving and calculations',
            examples: ['Algebraic equations', 'Geometric proofs', 'Statistical analysis']
          },
          {
            type: 'ethical',
            description: 'Ethical framework application and moral reasoning',
            examples: ['Utilitarian analysis', 'Deontological reasoning', 'Virtue ethics']
          },
          {
            type: 'general',
            description: 'Mixed reasoning approaches for complex problems',
            examples: ['Multi-method analysis', 'Creative problem solving', 'Synthesis']
          }
        ],
        features: [
          'Step-by-step reasoning explanation',
          'Confidence scoring',
          'Evidence and assumption tracking',
          'Multiple reasoning frameworks',
          'Real-time processing'
        ],
        endpoints: [
          {
            path: '/api/reasoning/reason',
            method: 'POST',
            description: 'Main reasoning endpoint with full explanation',
            parameters: ['question (required)', 'context (optional)', 'explainSteps (optional)']
          },
          {
            path: '/api/reasoning/quick',
            method: 'POST',
            description: 'Quick reasoning with just conclusion',
            parameters: ['question (required)']
          },
          {
            path: '/api/reasoning/logical',
            method: 'POST',
            description: 'Logical reasoning with premises',
            parameters: ['premises (required)', 'question (required)']
          },
          {
            path: '/api/reasoning/solve',
            method: 'POST',
            description: 'Problem solving with constraints',
            parameters: ['problem (required)', 'constraints (optional)', 'requirements (optional)']
          },
          {
            path: '/api/reasoning/mathematical',
            method: 'POST',
            description: 'Mathematical problem solving',
            parameters: ['problem (required)', 'variables (optional)', 'given (optional)']
          },
          {
            path: '/api/reasoning/ethical',
            method: 'POST',
            description: 'Ethical reasoning and analysis',
            parameters: ['dilemma (required)', 'stakeholders (optional)', 'framework (optional)']
          }
        ]
      };

      return reply.send({
        success: true,
        data: capabilities
      });

    } catch (error) {
      console.error('Capabilities error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get capabilities'
      });
    }
  });

  // Health check for reasoning engine
  app.get('/api/reasoning/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Test reasoning engine with a simple logical problem
      const testResult = await reasoningEngine.reason(
        "If all humans are mortal and Socrates is human, is Socrates mortal?"
      );

      return reply.send({
        success: true,
        data: {
          status: 'healthy',
          reasoningEngine: 'operational',
          testConfidence: testResult.confidence,
          testSteps: testResult.steps.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Health check error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Reasoning engine health check failed'
      });
    }
  });
}
