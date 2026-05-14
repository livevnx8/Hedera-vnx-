/**
 * Unified Tool Registry
 * 
 * Central registry for all VeraLattice tools. Provides:
 * - Tool registration and discovery
 * - Category management
 * - Version tracking
 * - Metadata storage
 * - Search functionality
 */

import { logger } from '../monitoring/logger.js';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  parameters: ToolParameter[];
  requiresAuth: boolean;
  rateLimit?: {
    requests: number;
    window: number; // milliseconds
  };
  exampleResponse?: any;
  errorCodes?: Array<{
    code: string;
    description: string;
  }>;
  relatedTools?: string[];
  tags?: string[];
  deprecated?: boolean;
  deprecationReason?: string;
}

export type ToolCategory = 
  | 'token' 
  | 'nft' 
  | 'hcs' 
  | 'account' 
  | 'evm' 
  | 'staking'
  | 'file'
  | 'governance'
  | 'query'
  | 'awareness'
  | 'defi'
  | 'bridge'
  | 'system';

export interface ToolVersion {
  version: string;
  date: number;
  changes: string[];
  breaking: boolean;
}

export interface ToolManifest {
  version: string;
  totalTools: number;
  categories: string[];
  tools: Array<{
    name: string;
    description: string;
    category: ToolCategory;
    version: string;
    parameters: ToolParameter[];
    requiresAuth: boolean;
    rateLimit?: { requests: number; window: number };
  }>;
}

export interface ToolStats {
  name: string;
  executions: number;
  errors: number;
  avgExecutionTime: number;
  cacheHitRate: number;
  lastUsed: number;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private categories = new Map<ToolCategory, string[]>();
  private versions = new Map<string, ToolVersion[]>();
  private stats = new Map<string, ToolStats>();
  private tags = new Map<string, string[]>();

  /**
   * Register a new tool
   */
  register(tool: ToolDefinition): void {
    // Validation
    this.validateTool(tool);

    // Check for duplicate
    if (this.tools.has(tool.name)) {
      logger.warn('ToolRegistry', { 
        message: 'Tool already exists, updating', 
        name: tool.name,
        oldVersion: this.tools.get(tool.name)?.version,
        newVersion: tool.version 
      });
      
      // Track version change
      this.trackVersion(tool);
    }

    // Register
    this.tools.set(tool.name, tool);

    // Categorize
    const cat = this.categories.get(tool.category) || [];
    if (!cat.includes(tool.name)) {
      cat.push(tool.name);
      this.categories.set(tool.category, cat);
    }

    // Tag indexing
    for (const tag of tool.tags || []) {
      const tagged = this.tags.get(tag) || [];
      if (!tagged.includes(tool.name)) {
        tagged.push(tool.name);
        this.tags.set(tag, tagged);
      }
    }

    // Initialize stats
    if (!this.stats.has(tool.name)) {
      this.stats.set(tool.name, {
        name: tool.name,
        executions: 0,
        errors: 0,
        avgExecutionTime: 0,
        cacheHitRate: 0,
        lastUsed: 0,
      });
    }

    logger.info('ToolRegistry', { 
      message: 'Tool registered', 
      name: tool.name, 
      version: tool.version,
      category: tool.category 
    });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);

    // Remove from category
    const cat = this.categories.get(tool.category);
    if (cat) {
      const idx = cat.indexOf(name);
      if (idx > -1) cat.splice(idx, 1);
    }

    // Remove from tags
    for (const tag of tool.tags || []) {
      const tagged = this.tags.get(tag);
      if (tagged) {
        const idx = tagged.indexOf(name);
        if (idx > -1) tagged.splice(idx, 1);
      }
    }

    logger.info('ToolRegistry', { message: 'Tool unregistered', name });
    return true;
  }

  /**
   * Get a tool definition
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all tools in a category
   */
  listByCategory(category: ToolCategory): ToolDefinition[] {
    const names = this.categories.get(category) || [];
    return names
      .map(n => this.tools.get(n))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  /**
   * Search tools by query string
   */
  search(query: string): ToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    const results: ToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      // Search in name
      if (tool.name.toLowerCase().includes(lowerQuery)) {
        results.push(tool);
        continue;
      }

      // Search in description
      if (tool.description.toLowerCase().includes(lowerQuery)) {
        results.push(tool);
        continue;
      }

      // Search in tags
      if (tool.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
        results.push(tool);
        continue;
      }
    }

    return results;
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): ToolDefinition[] {
    const names = this.tags.get(tag) || [];
    return names
      .map(n => this.tools.get(n))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  /**
   * Get all tool names
   */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get discovery manifest for external consumers
   */
  getDiscoveryManifest(): ToolManifest {
    return {
      version: '2.0',
      totalTools: this.tools.size,
      categories: Array.from(this.categories.keys()),
      tools: Array.from(this.tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        version: t.version,
        parameters: t.parameters,
        requiresAuth: t.requiresAuth,
        rateLimit: t.rateLimit,
      })),
    };
  }

  /**
   * Get OpenAPI-compatible specification
   */
  getOpenAPISpec(): object {
    const paths: Record<string, any> = {};
    const schemas: Record<string, any> = {};

    for (const tool of this.tools.values()) {
      // Build path
      paths[`/tools/${tool.name}`] = {
        post: {
          summary: tool.description,
          tags: [tool.category],
          requestBody: {
            content: {
              'application/json': {
                schema: this.buildRequestSchema(tool),
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful execution',
              content: {
                'application/json': {
                  schema: this.buildResponseSchema(tool),
                },
              },
            },
          },
        },
      };

      // Build schema
      schemas[tool.name] = this.buildRequestSchema(tool);
    }

    return {
      openapi: '3.0.0',
      info: {
        title: 'VeraLattice Tool API',
        version: '2.0.0',
        description: 'Comprehensive Hedera tool suite',
      },
      paths,
      components: { schemas },
    };
  }

  /**
   * Update tool statistics
   */
  updateStats(
    name: string,
    execution: {
      success: boolean;
      executionTime: number;
      fromCache?: boolean;
    }
  ): void {
    const stats = this.stats.get(name);
    if (!stats) return;

    stats.executions++;
    if (!execution.success) stats.errors++;
    if (execution.fromCache) {
      stats.cacheHitRate = 
        (stats.cacheHitRate * (stats.executions - 1) + 1) / stats.executions;
    }
    stats.avgExecutionTime = 
      (stats.avgExecutionTime * (stats.executions - 1) + execution.executionTime) / 
      stats.executions;
    stats.lastUsed = Date.now();

    this.stats.set(name, stats);
  }

  /**
   * Get tool statistics
   */
  getStats(name?: string): ToolStats | Map<string, ToolStats> {
    if (name) {
      return this.stats.get(name) || {
        name,
        executions: 0,
        errors: 0,
        avgExecutionTime: 0,
        cacheHitRate: 0,
        lastUsed: 0,
      };
    }
    return new Map(this.stats);
  }

  /**
   * Get version history for a tool
   */
  getVersionHistory(name: string): ToolVersion[] {
    return this.versions.get(name) || [];
  }

  /**
   * Validate tool definition
   */
  private validateTool(tool: ToolDefinition): void {
    if (!tool.name || tool.name.length < 1) {
      throw new Error('Tool name is required');
    }
    if (!tool.description) {
      throw new Error(`Tool ${tool.name}: description is required`);
    }
    if (!tool.category) {
      throw new Error(`Tool ${tool.name}: category is required`);
    }
    if (!tool.version) {
      throw new Error(`Tool ${tool.name}: version is required`);
    }
    if (!Array.isArray(tool.parameters)) {
      throw new Error(`Tool ${tool.name}: parameters must be an array`);
    }
  }

  /**
   * Track version change
   */
  private trackVersion(tool: ToolDefinition): void {
    const existing = this.tools.get(tool.name);
    if (!existing) return;

    const versions = this.versions.get(tool.name) || [];
    versions.push({
      version: existing.version,
      date: Date.now(),
      changes: ['Replaced by newer version'],
      breaking: tool.version.split('.')[0] !== existing.version.split('.')[0],
    });
    this.versions.set(tool.name, versions);
  }

  /**
   * Build JSON schema for tool request
   */
  private buildRequestSchema(tool: ToolDefinition): object {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
        ...(param.enum && { enum: param.enum }),
        ...(param.min !== undefined && { minimum: param.min }),
        ...(param.max !== undefined && { maximum: param.max }),
      };

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * Build JSON schema for tool response
   */
  private buildResponseSchema(tool: ToolDefinition): object {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: tool.exampleResponse ? { example: tool.exampleResponse } : { type: 'object' },
        error: { type: 'string' },
        fromCache: { type: 'boolean' },
        executionTime: { type: 'number' },
      },
    };
  }

  /**
   * Get registry statistics
   */
  getRegistryStats(): {
    totalTools: number;
    categories: number;
    tags: number;
    totalExecutions: number;
    totalErrors: number;
  } {
    let totalExecutions = 0;
    let totalErrors = 0;

    for (const stats of this.stats.values()) {
      totalExecutions += stats.executions;
      totalErrors += stats.errors;
    }

    return {
      totalTools: this.tools.size,
      categories: this.categories.size,
      tags: this.tags.size,
      totalExecutions,
      totalErrors,
    };
  }
}

// Singleton instance
let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}

export function resetToolRegistry(): void {
  registryInstance = null;
}
