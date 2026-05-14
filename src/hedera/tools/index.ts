/**
 * Comprehensive Hedera Tools for Vera
 * Production-ready tools for Hedera Hashgraph integration
 * 
 * Services:
 * - HTS: Hedera Token Service (tokens, NFTs)
 * - HCS: Hedera Consensus Service (messaging, topics)
 * - Account: Account management and queries
 * - Staking: HBAR staking operations
 * - EVM: Ethereum-compatible operations
 * - Queries: Data retrieval and analytics
 */

import { Client, PrivateKey, AccountId, TopicId, TokenId } from '@hashgraph/sdk';
import { getClient } from './client.js';
import { logger } from '../../monitoring/logger.js';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  transactionId?: string;
  hashscanUrl?: string;
}

export interface ToolContext {
  client: Client;
  operatorId: string;
  operatorKey: PrivateKey;
}

// ============================================================================
// HTS - HEDERA TOKEN SERVICE
// ============================================================================

export * from './hts/index.js';
export * from './hcs/index.js';
export * from './account/index.js';
export * from './queries/index.js';

// ============================================================================
// Tool Registry
// ============================================================================

export interface HederaTool {
  name: string;
  category: 'hts' | 'hcs' | 'account' | 'staking' | 'evm' | 'query';
  description: string;
  execute: (params: any) => Promise<ToolResult>;
  validateParams: (params: any) => { valid: boolean; error?: string };
}

export class HederaToolRegistry {
  private tools: Map<string, HederaTool> = new Map();
  private client: Client;

  constructor() {
    this.client = getClient();
    this.registerAllTools();
  }

  private registerAllTools(): void {
    // HTS Tools
    this.registerHTSTools();
    // HCS Tools  
    this.registerHCSTools();
    // Account Tools
    this.registerAccountTools();
    // Staking Tools
    this.registerStakingTools();
    // Query Tools
    this.registerQueryTools();
  }

  private registerHTSTools(): void {
    const { htsTools } = require('./hts/index.js');
    const { extendedHtsTools } = require('./hts/index.js');
    htsTools.forEach((tool: HederaTool) => this.register(tool));
    extendedHtsTools?.forEach((tool: HederaTool) => this.register(tool));
  }

  private registerHCSTools(): void {
    const { hcsTools } = require('./hcs/index.js');
    hcsTools.forEach((tool: HederaTool) => this.register(tool));
  }

  private registerAccountTools(): void {
    const { accountTools } = require('./account/index.js');
    accountTools.forEach((tool: HederaTool) => this.register(tool));
  }

  private registerStakingTools(): void {
    // Staking tools to be added in future PR
    logger.info('HederaTools', { message: 'Staking tools placeholder - not yet implemented' });
  }

  private registerQueryTools(): void {
    const { queryTools } = require('./queries/index.js');
    queryTools.forEach((tool: HederaTool) => this.register(tool));
  }

  register(tool: HederaTool): void {
    this.tools.set(tool.name, tool);
    logger.info('HederaTools', { name: tool.name, category: tool.category, message: 'Tool registered' });
  }

  getTool(name: string): HederaTool | undefined {
    return this.tools.get(name);
  }

  getToolsByCategory(category: string): HederaTool[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  getAllTools(): HederaTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getCategories(): string[] {
    return [...new Set(Array.from(this.tools.values()).map(t => t.category))];
  }

  async executeTool(name: string, params: any): Promise<ToolResult> {
    const tool = this.tools.get(name);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found in registry`
      };
    }

    // Validate parameters
    const validation = tool.validateParams(params);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || 'Invalid parameters'
      };
    }

    try {
      logger.info('HederaTools', { name, params, message: 'Executing tool' });
      const result = await tool.execute(params);
      logger.info('HederaTools', { name, success: result.success, message: 'Tool execution complete' });
      return result;
    } catch (error) {
      logger.error('HederaTools', { name, error, message: 'Tool execution failed' });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const hederaToolRegistry = new HederaToolRegistry();
