import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { veraAgentSystem, agentRegistry, workflowOrchestrator, agentLearningSystem } from '../agent/index.js';
import { submitReceiptMessage } from '../hedera/hcs.js';
import { config } from '../config.js';

const TOPIC_ID = '0.0.10409351';

/**
 * Register HBAR Agent System routes
 * Deploys the enhanced agent system with 109 tools, 6 domain agents, and 3 workflows
 */
export async function registerHBARAgentRoutes(app: FastifyInstance) {
  
  // Health check - System status
  app.get('/api/v2/agents/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const status = veraAgentSystem.getStatus();
    reply.send({
      status: 'operational',
      ...status,
      timestamp: Date.now()
    });
  });

  // List all domain agents
  app.get('/api/v2/agents', async (req: FastifyRequest, reply: FastifyReply) => {
    const agents = agentRegistry.listAgents();
    reply.send({
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        tools: a.tools
      })),
      total: agents.length
    });
  });

  // Get specific agent details
  app.get('/api/v2/agents/:agentId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { agentId } = req.params as { agentId: string };
    const agent = agentRegistry.getAgent(agentId);
    
    if (!agent) {
      reply.code(404).send({ error: 'Agent not found' });
      return;
    }

    reply.send({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tools: agent.tools
    });
  });

  // Execute task with specific agent
  const ExecuteTaskSchema = z.object({
    agentId: z.string().default('agent-defi'),
    tool: z.string(),
    input: z.record(z.any()).default({}),
    trackLearning: z.boolean().default(true)
  });

  app.post('/api/v2/agents/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = ExecuteTaskSchema.parse(req.body);
      const agent = agentRegistry.getAgent(body.agentId);
      
      if (!agent) {
        reply.code(404).send({ success: false, error: 'Agent not found' });
        return;
      }

      const result = await agent.executeTool(body.tool, body.input);
      
      // Log to HCS
      await submitReceiptMessage(JSON.stringify({
        type: 'agent_tool_execution',
        agent: body.agentId,
        tool: body.tool,
        timestamp: Date.now()
      }));

      reply.send({ success: true, result });
    } catch (error) {
      reply.code(500).send({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Execution failed' 
      });
    }
  });

  // List all workflows
  app.get('/api/v2/workflows', async (req: FastifyRequest, reply: FastifyReply) => {
    const workflows = workflowOrchestrator.listWorkflows();
    reply.send({
      workflows: workflows.map(w => ({
        id: w.id,
        name: w.name,
        category: w.category,
        version: w.version
      })),
      total: workflows.length
    });
  });

  // Get workflow template
  app.get('/api/v2/workflows/:workflowId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { workflowId } = req.params as { workflowId: string };
    const template = workflowOrchestrator.getWorkflowTemplate(workflowId);
    
    if (!template) {
      reply.code(404).send({ error: 'Workflow not found' });
      return;
    }

    reply.send({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      steps: template.steps.length
    });
  });

  // Execute workflow
  const ExecuteWorkflowSchema = z.object({
    workflowId: z.string(),
    variables: z.record(z.any()).default({}),
    agentId: z.string().optional()
  });

  app.post('/api/v2/workflows/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = ExecuteWorkflowSchema.parse(req.body);
      const result = await workflowOrchestrator.execute(body.workflowId, body.variables);

      // Log to HCS
      await submitReceiptMessage(JSON.stringify({
        type: 'workflow_execution',
        workflow: body.workflowId,
        agent: body.agentId,
        success: result.success,
        timestamp: Date.now()
      }));

      reply.send({ success: true, result });
    } catch (error) {
      reply.code(500).send({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Workflow execution failed' 
      });
    }
  });

  // Get learning analytics
  app.get('/api/v2/agents/:agentId/analytics', async (req: FastifyRequest, reply: FastifyReply) => {
    const { agentId } = req.params as { agentId: string };
    const days = parseInt((req.query as { days?: string }).days || '7');
    
    const analytics = agentLearningSystem.getToolAnalytics(agentId, days);

    reply.send({
      agentId,
      analytics
    });
  });

  // Get all tools by category
  app.get('/api/v2/tools', async (req: FastifyRequest, reply: FastifyReply) => {
    const categories = veraAgentSystem.listToolsByCategory();
    reply.send({
      categories,
      total: Object.values(categories).reduce((sum, arr) => sum + arr.length, 0)
    });
  });

  // Generate system report
  app.get('/api/v2/agents/report', async (req: FastifyRequest, reply: FastifyReply) => {
    const report = veraAgentSystem.generateReport();
    reply.type('text/plain').send(report);
  });

  // Deployment webhook - Initialize system
  app.post('/api/v2/agents/deploy', async (req: FastifyRequest, reply: FastifyReply) => {
    const status = veraAgentSystem.getStatus();
    
    // Log deployment to HCS
    await submitReceiptMessage(JSON.stringify({
      type: 'hbar_agent_system_deployed',
      status: 'operational',
      agents: status.agents,
      workflows: status.workflows,
      tools: status.tools,
      timestamp: Date.now()
    }));

    reply.send({
      deployed: true,
      status: 'operational',
      ...status,
      message: 'HBAR Agent System deployed and integrated'
    });
  });

  console.log('✅ HBAR Agent System routes registered');
  console.log(`   - 6 domain agents available`);
  console.log(`   - 3 workflows available`);
  console.log(`   - 109 tools available`);
  console.log(`   - Learning system active`);
}
