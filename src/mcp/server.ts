/**
 * Vera MCP Server
 * 
 * Implements the Model Context Protocol (MCP) to expose Vera's tools
 * to any MCP-compatible client (Claude Desktop, Cursor, etc.)
 * 
 * Reference: https://modelcontextprotocol.io
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ALL_TOOL_DEFINITIONS } from '../agent/definitions.js';
import { executeTool } from '../agent/executor.js';
import { logger } from '../monitoring/logger.js';

/**
 * Convert Vera tool definitions to MCP format
 */
function convertToMCPTools(): Tool[] {
  return ALL_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: {
      type: 'object' as const,
      properties: tool.function.parameters.properties as Record<string, object>,
      required: tool.function.parameters.required || [],
    },
  }));
}

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: 'vera-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: convertToMCPTools(),
    };
  });

  // Execute tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info('MCP', { tool: name, message: 'Tool execution requested' });

    try {
      const result = await executeTool(name, args as Record<string, unknown>);
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('MCP', { tool: name, error: errorMsg });
      
      return {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${errorMsg}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server on stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  
  logger.info('MCP', { message: 'Starting Vera MCP Server...' });
  
  await server.connect(transport);
  
  logger.info('MCP', { message: 'Vera MCP Server running on stdio' });
}

/**
 * Start the MCP server on HTTP/SSE transport for remote connections
 */
export async function startMCPHTTPServer(port: number = 3001): Promise<void> {
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
  const fastify = (await import('fastify')).default;
  
  const server = createMCPServer();
  const app = fastify();
  
  let transport: typeof SSEServerTransport.prototype;

  app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport('/messages', res.raw);
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    if (!transport) {
      res.status(400).send({ error: 'SSE connection not established' });
      return;
    }
    await transport.handlePostMessage(req.raw, res.raw);
  });

  await app.listen({ port });
  logger.info('MCP', { port, message: 'Vera MCP HTTP Server running' });
}

// If run directly, start the stdio server
if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPServer().catch((error) => {
    logger.error('MCP', { error: String(error), message: 'Fatal error' });
    process.exit(1);
  });
}
