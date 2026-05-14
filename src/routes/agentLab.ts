/**
 * HCS-10 and Sub-Agent API Routes
 * 
 * Provides HTTP endpoints for:
 * - HCS-10 agent registration and communication
 * - Sub-agent spawning and management
 * - Tool execution via API
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { getHCS10AgentKit, type HCS10AgentProfile } from '../hedera/hcs10Agent.js';
import { runSubAgent, type SubAgentRole } from '../agent/subAgent.js';
import { executeTool } from '../agent/executor.js';
import { logger } from '../monitoring/logger.js';
import { getProofOfWorkRegistry } from '../hedera/proofOfWork.js';
import { getAgentPaymentSystem } from '../hedera/agentPayment.js';

const RegisterAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  capabilities: z.array(z.string()),
  endpoint: z.string().url().optional(),
});

const SendMessageSchema = z.object({
  toAgentId: z.string(),
  type: z.enum(['REQUEST', 'RESPONSE', 'BROADCAST', 'DELEGATION']),
  payload: z.object({
    task: z.string().optional(),
    role: z.enum(['researcher', 'analyst', 'coder', 'critic', 'planner']).optional(),
    context: z.string().optional(),
    result: z.any().optional(),
    error: z.string().optional(),
  }),
});

const SpawnSubAgentSchema = z.object({
  role: z.enum(['researcher', 'analyst', 'coder', 'critic', 'planner']),
  task: z.string().min(1),
  context: z.string().optional(),
});

const ExecuteToolSchema = z.object({
  tool: z.string(),
  args: z.record(z.any()).default({}),
});

export async function registerAgentLabRoutes(app: FastifyInstance) {
  
  // ==================== HCS-10 AGENT REGISTRY ====================
  
  /**
   * POST /hcs10/register
   * Register Vera as an HCS-10 compliant agent
   */
  app.post('/hcs10/register', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = RegisterAgentSchema.parse(req.body);
      const hcs10 = getHCS10AgentKit();
      
      const profile = await hcs10.registerAgent({
        name: body.name,
        description: body.description,
        capabilities: body.capabilities,
        endpoint: body.endpoint
      });
      
      logger.info('AgentLab', { 
        agentId: profile.id, 
        inbound: profile.inboundTopicId,
        message: 'HCS-10 agent registered' 
      });
      
      return reply.code(201).send({
        success: true,
        profile,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AgentLab', { error: errorMsg, message: 'HCS-10 registration failed' });
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /hcs10/profile
   * Get current agent profile
   */
  app.get('/hcs10/profile', async (_req: FastifyRequest, reply: FastifyReply) => {
    const hcs10 = getHCS10AgentKit();
    const profile = hcs10.getProfile();
    
    if (!profile) {
      return reply.code(404).send({ success: false, error: 'Agent not registered' });
    }
    
    return reply.send({ success: true, profile });
  });

  /**
   * POST /hcs10/start
   * Start listening for incoming HCS-10 messages
   */
  app.post('/hcs10/start', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const hcs10 = getHCS10AgentKit();
      
      if (!hcs10.isRegistered()) {
        return reply.code(400).send({ 
          success: false, 
          error: 'Agent not registered - call /hcs10/register first' 
        });
      }
      
      await hcs10.startListening();
      
      return reply.send({ 
        success: true, 
        message: 'Started listening for HCS-10 messages' 
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * POST /hcs10/stop
   * Stop listening for HCS-10 messages
   */
  app.post('/hcs10/stop', async (_req: FastifyRequest, reply: FastifyReply) => {
    const hcs10 = getHCS10AgentKit();
    hcs10.stopListening();
    return reply.send({ success: true, message: 'Stopped listening' });
  });

  /**
   * POST /hcs10/send
   * Send a message to another agent
   */
  app.post('/hcs10/send', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = SendMessageSchema.parse(req.body);
      const hcs10 = getHCS10AgentKit();
      
      if (!hcs10.isRegistered()) {
        return reply.code(400).send({ 
          success: false, 
          error: 'Agent not registered' 
        });
      }
      
      await hcs10.sendMessage(body.toAgentId, {
        type: body.type,
        payload: body.payload,
      });
      
      return reply.send({ success: true, message: 'Message sent' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * POST /hcs10/broadcast
   * Broadcast a message to all agents
   */
  app.post('/hcs10/broadcast', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { payload } = SendMessageSchema.parse(req.body);
      const hcs10 = getHCS10AgentKit();
      
      if (!hcs10.isRegistered()) {
        return reply.code(400).send({ success: false, error: 'Agent not registered' });
      }
      
      await hcs10.broadcast(payload);
      
      return reply.send({ success: true, message: 'Broadcast sent' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  // ==================== SUB-AGENT ENDPOINTS ====================

  /**
   * POST /agent/subagent
   * Spawn a specialized sub-agent
   */
  app.post('/agent/subagent', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = SpawnSubAgentSchema.parse(req.body);
      
      logger.info('AgentLab', { role: body.role, message: 'Spawning sub-agent' });
      
      const result = await runSubAgent({
        role: body.role,
        task: body.task,
        context: body.context,
      });
      
      return reply.send({
        success: true,
        role: result.role,
        result: result.result,
        tools_called: result.tools_called,
        rounds: result.rounds,
        memory_saved: result.memory_saved,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AgentLab', { error: errorMsg, message: 'Sub-agent spawn failed' });
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /agent/subagent/roles
   * List available sub-agent roles
   */
  app.get('/agent/subagent/roles', async (_req: FastifyRequest, reply: FastifyReply) => {
    const roles: Array<{ id: SubAgentRole; name: string; description: string }> = [
      {
        id: 'researcher',
        name: 'Research Sub-Agent',
        description: 'Web intelligence gathering - news, wiki, Hacker News search',
      },
      {
        id: 'analyst',
        name: 'On-Chain Analyst',
        description: 'Hedera blockchain data analysis - balances, tokens, DEX prices',
      },
      {
        id: 'coder',
        name: 'Code Sub-Agent',
        description: 'Solidity/TypeScript development and smart contract compilation',
      },
      {
        id: 'critic',
        name: 'Critic Sub-Agent',
        description: 'Adversarial review - finds flaws, risks, blind spots in plans',
      },
      {
        id: 'planner',
        name: 'Planning Sub-Agent',
        description: 'Structured project planning - architecture, phases, tokenomics',
      },
    ];
    
    return reply.send({ success: true, roles });
  });

  // ==================== TOOL EXECUTION ENDPOINTS ====================

  /**
   * POST /agent/tool
   * Execute a specific tool directly
   */
  app.post('/agent/tool', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = ExecuteToolSchema.parse(req.body);
      
      logger.info('AgentLab', { tool: body.tool, message: 'Executing tool' });
      
      const result = await executeTool(body.tool, body.args);
      
      return reply.send({
        success: true,
        tool: body.tool,
        result,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AgentLab', { tool: (req.body as any)?.tool, error: errorMsg });
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /agent/tools
   * List all available tools
   */
  app.get('/agent/tools', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { ALL_TOOL_DEFINITIONS } = await import('../agent/definitions.js');
    
    const tools = ALL_TOOL_DEFINITIONS.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
    
    return reply.send({ 
      success: true, 
      count: tools.length,
      tools 
    });
  });

  /**
   * POST /payment/initialize
   * Initialize payment tracking on HCS
   */
  app.post('/payment/initialize', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payment = getAgentPaymentSystem();
      const result = await payment.initialize();
      
      logger.info('AgentLab', { 
        topicId: result.paymentTopicId,
        message: 'Payment system initialized'
      });
      
      return reply.send({
        success: true,
        topicId: result.paymentTopicId,
        message: 'Payment tracking initialized on HCS',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /payment/rates
   * Get service rates for different task types
   */
  app.get('/payment/rates', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payment = getAgentPaymentSystem();
      const rates = payment.getAllServiceRates();
      
      return reply.send({
        success: true,
        rates,
        message: 'Service rates retrieved',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * POST /payment/calculate
   * Calculate payment for a work record
   */
  app.post('/payment/calculate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const CalculateSchema = z.object({
        workRecordId: z.string(),
      });
      
      const body = CalculateSchema.parse(req.body);
      const pow = getProofOfWorkRegistry();
      const payment = getAgentPaymentSystem();
      
      // Get work record (in real impl, would fetch from registry)
      // For now, return rate info
      const rates = payment.getAllServiceRates();
      
      return reply.send({
        success: true,
        rates,
        message: 'Payment calculation based on task type, tools used, and duration',
        example: {
          sub_agent: {
            base: 5,
            per_tool: 1,
            per_minute: 0.5,
            minimum: 5,
          },
          planning: {
            base: 10,
            per_tool: 1,
            per_minute: 1,
            minimum: 10,
          },
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /payment/earnings
   * Get earnings report
   */
  app.get('/payment/earnings', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const days = parseInt((req.query as any)?.days || '30');
      const payment = getAgentPaymentSystem();
      
      const now = Date.now();
      const periodStart = now - (days * 24 * 60 * 60 * 1000);
      
      const report = await payment.getEarningsReport(
        config.HEDERA_OPERATOR_ACCOUNT_ID || 'unknown',
        periodStart,
        now
      );
      
      return reply.send({
        success: true,
        report,
        period: `${days} days`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /payment/status
   * Get payment system status
   */
  app.get('/payment/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payment = getAgentPaymentSystem();
      const pending = payment.getPendingPayments();
      const history = payment.getPaymentHistory(10);
      const topicId = payment.getPaymentTopicId();
      
      return reply.send({
        success: true,
        initialized: !!topicId,
        topicId,
        pendingCount: pending.length,
        pendingPayments: pending,
        recentPayments: history,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  // ==================== PROOF OF WORK & COMPLETION ====================

  /**
   * POST /pow/initialize
   * Initialize Proof of Work registry (creates HCS topics)
   */
  app.post('/pow/initialize', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const pow = getProofOfWorkRegistry();
      const topics = await pow.initialize();
      
      logger.info('AgentLab', { 
        powTopic: topics.powTopicId,
        certTopic: topics.certificateTopicId,
        message: 'Proof of Work initialized'
      });
      
      return reply.send({
        success: true,
        topics,
        message: 'Proof of Work registry initialized on HCS',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AgentLab', { error: errorMsg, message: 'PoW initialization failed' });
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * POST /pow/record
   * Record a work completion with proof
   */
  app.post('/pow/record', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const RecordWorkSchema = z.object({
        taskType: z.enum(['sub_agent', 'tool_execution', 'planning', 'analysis', 'contract_deployment']),
        description: z.string(),
        inputs: z.record(z.any()).default({}),
        outputs: z.record(z.any()).default({}),
        toolsUsed: z.array(z.string()).default([]),
        durationMs: z.number().default(0),
        success: z.boolean(),
        error: z.string().optional(),
      });
      
      const body = RecordWorkSchema.parse(req.body);
      const pow = getProofOfWorkRegistry();
      
      const record = await pow.recordWork({
        taskType: body.taskType,
        description: body.description,
        inputs: body.inputs,
        outputs: body.outputs,
        toolsUsed: body.toolsUsed,
        durationMs: body.durationMs,
        success: body.success,
        error: body.error
      });
      
      return reply.send({
        success: true,
        workRecord: record,
        verified: true,
        message: 'Work recorded with cryptographic proof',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * POST /pow/certificate
   * Create a completion certificate
   */
  app.post('/pow/certificate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const CertificateSchema = z.object({
        projectName: z.string(),
        description: z.string(),
        workRecordIds: z.array(z.string()),
      });
      
      const body = CertificateSchema.parse(req.body);
      const pow = getProofOfWorkRegistry();
      
      const certificate = await pow.createCompletionCertificate(
        body.projectName,
        body.description,
        body.workRecordIds
      );
      
      return reply.send({
        success: true,
        certificate,
        message: 'Completion certificate issued and recorded on HCS',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /pow/history
   * Get verified work history
   */
  app.get('/pow/history', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const limit = parseInt((req.query as any)?.limit || '50');
      const pow = getProofOfWorkRegistry();
      
      const history = await pow.getVerifiedWorkHistory(limit);
      
      return reply.send({
        success: true,
        ...history,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /pow/certificates
   * Get all completion certificates
   */
  app.get('/pow/certificates', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const pow = getProofOfWorkRegistry();
      const certificates = pow.getCompletionCertificates();
      
      return reply.send({
        success: true,
        count: certificates.length,
        certificates,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * POST /pow/register-and-prove
   * Full registration flow: Register HCS-10 agent + submit capability proof
   */
  app.post('/pow/register-and-prove', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const RegisterProveSchema = z.object({
        name: z.string(),
        description: z.string(),
        capabilities: z.array(z.string()),
        generateProof: z.boolean().default(true),
      });
      
      const body = RegisterProveSchema.parse(req.body);
      
      // Step 1: Register as HCS-10 agent
      const hcs10 = getHCS10AgentKit();
      const profile = await hcs10.registerAgent({
        name: body.name,
        description: body.description,
        capabilities: body.capabilities,
      });
      
      logger.info('AgentLab', { 
        agentId: profile.id,
        message: 'HCS-10 registration complete'
      });
      
      let capabilityProof = null;
      
      // Step 2: Generate capability proof if requested
      if (body.generateProof) {
        const pow = getProofOfWorkRegistry();
        capabilityProof = await pow.generateCapabilityProof(profile.id);
        
        logger.info('AgentLab', {
          agentId: profile.id,
          totalTasks: capabilityProof.totalTasksCompleted,
          successRate: capabilityProof.successRate,
          message: 'Capability proof generated'
        });
      }
      
      return reply.send({
        success: true,
        profile,
        capabilityProof,
        message: 'Registration complete with proof of capabilities',
        hcs10Verified: true,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AgentLab', { error: errorMsg, message: 'Registration and proof failed' });
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  /**
   * GET /pow/status
   * Get proof of work status
   */
  app.get('/pow/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const pow = getProofOfWorkRegistry();
      const topics = pow.getTopicIds();
      const certificates = pow.getCompletionCertificates();
      
      return reply.send({
        success: true,
        initialized: !!topics.powTopicId,
        topics,
        totalCertificates: certificates.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ success: false, error: errorMsg });
    }
  });

  logger.info('AgentLab', { message: 'Agent Lab routes registered' });
}
