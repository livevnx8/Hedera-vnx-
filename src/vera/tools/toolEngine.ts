/**
 * Tool Calling Engine for Vera Oasis
 * 
 * Allows Vera to execute code, search web, and use external APIs
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, any>) => Promise<string>;
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
}

export class ToolEngine extends EventEmitter {
  private tools = new Map<string, Tool>();
  private toolHistory: ToolCall[] = [];

  constructor() {
    super();
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    // Execute Python code
    this.registerTool({
      name: 'execute_python',
      description: 'Execute Python code and return the output',
      parameters: {
        code: { type: 'string', description: 'Python code to execute', required: true },
      },
      execute: async (params) => {
        const { code } = params;
        return new Promise((resolve, reject) => {
          const proc = spawn('python3', ['-c', code]);
          let output = '';
          let error = '';

          proc.stdout.on('data', (data) => output += data);
          proc.stderr.on('data', (data) => error += data);

          proc.on('close', (code) => {
            if (code === 0) resolve(output || '(no output)');
            else reject(new Error(error || `Exit code ${code}`));
          });
        });
      },
    });

    // Execute shell command
    this.registerTool({
      name: 'execute_shell',
      description: 'Execute a shell command and return output',
      parameters: {
        command: { type: 'string', description: 'Shell command to execute', required: true },
        timeout: { type: 'number', description: 'Timeout in seconds', required: false },
      },
      execute: async (params) => {
        const { command, timeout = 10 } = params;
        return new Promise((resolve, reject) => {
          const proc = spawn('bash', ['-c', command]);
          let output = '';
          let error = '';
          const timeoutId = setTimeout(() => {
            proc.kill();
            reject(new Error(`Timeout after ${timeout}s`));
          }, timeout * 1000);

          proc.stdout.on('data', (data) => output += data);
          proc.stderr.on('data', (data) => error += data);

          proc.on('close', (code) => {
            clearTimeout(timeoutId);
            if (code === 0) resolve(output || '(no output)');
            else resolve(`Error (exit ${code}): ${error || 'Unknown error'}`);
          });
        });
      },
    });

    // Read file
    this.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        path: { type: 'string', description: 'File path', required: true },
      },
      execute: async (params) => {
        const { path } = params;
        try {
          const content = await fs.readFile(path, 'utf-8');
          return content.slice(0, 10000); // Limit to 10KB
        } catch (error) {
          return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });

    // Write file
    this.registerTool({
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        path: { type: 'string', description: 'File path', required: true },
        content: { type: 'string', description: 'Content to write', required: true },
      },
      execute: async (params) => {
        const { path, content } = params;
        try {
          await fs.writeFile(path, content, 'utf-8');
          return `File written successfully: ${path}`;
        } catch (error) {
          return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });

    // List directory
    this.registerTool({
      name: 'list_directory',
      description: 'List files in a directory',
      parameters: {
        path: { type: 'string', description: 'Directory path', required: true },
      },
      execute: async (params) => {
        const { path } = params;
        try {
          const entries = await fs.readdir(path, { withFileTypes: true });
          return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });

    // Web search (using curl)
    this.registerTool({
      name: 'web_search',
      description: 'Search the web using DuckDuckGo',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
      },
      execute: async (params) => {
        const { query } = params;
        try {
          const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
          const html = await response.text();
          // Extract results (simple parsing)
          const results = html.match(/class="result__a"[^>]*>([^<]+)/g);
          return results ? results.slice(0, 5).join('\n') : 'No results found';
        } catch (error) {
          return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });

    // Get current time
    this.registerTool({
      name: 'get_time',
      description: 'Get current date and time',
      parameters: {},
      execute: async () => {
        return new Date().toISOString();
      },
    });

    // Get system info
    this.registerTool({
      name: 'get_system_info',
      description: 'Get system information',
      parameters: {},
      execute: async () => {
        return `Platform: ${process.platform}
Arch: ${process.arch}
Node: ${process.version}
Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used
Uptime: ${Math.round(process.uptime())}s`;
      },
    });
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.emit('tool_registered', tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDescriptions(): string {
    return this.listTools().map(t => 
      `${t.name}: ${t.description}\nParameters: ${JSON.stringify(t.parameters, null, 2)}`
    ).join('\n\n');
  }

  async executeTool(name: string, parameters: Record<string, any>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const call: ToolCall = { tool: name, parameters };
    this.toolHistory.push(call);
    this.emit('tool_call', call);

    try {
      const result = await tool.execute(parameters);
      this.emit('tool_result', { call, result });
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit('tool_error', { call, error: errorMsg });
      throw error;
    }
  }

  parseToolCall(text: string): ToolCall | null {
    // Parse XML-style tool calls: <tool name="execute_python"><code>print("hello")</code></tool>
    const match = text.match(/<tool name="([^"]+)">([\s\S]*?)<\/tool>/);
    if (!match) return null;

    const toolName = match[1];
    const content = match[2];

    // Parse parameters from XML
    const params: Record<string, any> = {};
    const paramMatches = content.matchAll(/<([^>]+)>([\s\S]*?)<\/\1>/g);
    for (const [, name, value] of paramMatches) {
      params[name] = value.trim();
    }

    return { tool: toolName, parameters: params };
  }

  getHistory(): ToolCall[] {
    return [...this.toolHistory];
  }
}

// Singleton export
export const toolEngine = new ToolEngine();
