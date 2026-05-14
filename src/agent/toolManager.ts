/**
 * Dynamic Tool Manager for QVX Memory Optimization
 * 
 * Loads tools on-demand to reduce memory footprint
 */

import { ALL_TOOL_DEFINITIONS } from './definitions.js';
import type { ToolDefinition } from './definitions.js';

export enum ToolCategory {
  SEARCH = 'search',
  HEDERA = 'hedera', 
  WALLET = 'wallet',
  TOKEN = 'token',
  SMART_CONTRACT = 'smart_contract',
  ANALYSIS = 'analysis',
  UTILITIES = 'utilities'
}

// Tool categorization for dynamic loading
const TOOL_CATEGORIES: Record<ToolCategory, string[]> = {
  [ToolCategory.SEARCH]: ['web_search', 'wiki_search', 'hackernews_search'],
  [ToolCategory.HEDERA]: [
    'kit_create_account', 'kit_update_account', 'kit_delete_account',
    'hbar_transfer', 'kit_approve_hbar_allowance', 'kit_delete_hbar_allowance',
    'hcs_create_topic', 'hcs_submit_message', 'hcs_update_topic', 'hcs_delete_topic'
  ],
  [ToolCategory.WALLET]: [
    'verify_account', 'auto_connect_wallet',
    'kit_get_account', 'kit_get_transaction_record'
  ],
  [ToolCategory.TOKEN]: [
    'hts_create_token', 'hts_mint_token', 'hts_airdrop',
    'hts_create_nft', 'hts_mint_nft', 'hts_transfer_nft',
    'hts_update_token', 'hts_dissociate_token',
    'hts_approve_nft_allowance', 'hts_delete_nft_allowance',
    'kit_approve_token_allowance', 'kit_delete_token_allowance',
    'kit_get_token_balances', 'kit_get_token_info'
  ],
  [ToolCategory.SMART_CONTRACT]: [
    'vera_compile_contract', 'vera_deploy_contract', 'vera_call_contract',
    'evm_create_erc20', 'evm_create_erc721', 'evm_transfer_erc20', 
    'evm_mint_erc721', 'evm_transfer_erc721',
    'kit_get_contract_info'
  ],
  [ToolCategory.ANALYSIS]: [
    'get_price_chart', 'saucerswap_get_token_price', 'kit_get_exchange_rate',
    'hedera_search_tokens', 'kit_get_pending_airdrops'
  ],
  [ToolCategory.UTILITIES]: [
    'vera_spawn_agent', 'vera_memory_save', 'vera_memory_recall',
    'kit_sign_schedule', 'kit_delete_schedule', 'kit_get_topic_info'
  ]
};

export class ToolManager {
  private loadedCategories: Set<ToolCategory> = new Set();
  private toolCache: Map<string, ToolDefinition> = new Map();
  
  constructor() {
    // Pre-load essential tools
    this.loadCategory(ToolCategory.SEARCH);
  }

  /**
   * Load tools for a specific category
   */
  loadCategory(category: ToolCategory): ToolDefinition[] {
    if (this.loadedCategories.has(category)) {
      return this.getCategoryTools(category);
    }

    const toolNames = TOOL_CATEGORIES[category] || [];
    const tools: ToolDefinition[] = [];

    for (const toolName of toolNames) {
      const tool = ALL_TOOL_DEFINITIONS.find(t => t.function.name === toolName);
      if (tool) {
        this.toolCache.set(toolName, tool);
        tools.push(tool);
      }
    }

    this.loadedCategories.add(category);
    console.log(`Loaded ${tools.length} tools for category: ${category}`);
    
    return tools;
  }

  /**
   * Get tools for a category (loads if not already loaded)
   */
  getCategoryTools(category: ToolCategory): ToolDefinition[] {
    const toolNames = TOOL_CATEGORIES[category] || [];
    return toolNames
      .map(name => this.toolCache.get(name))
      .filter(Boolean) as ToolDefinition[];
  }

  /**
   * Get all currently loaded tools
   */
  getLoadedTools(): ToolDefinition[] {
    return Array.from(this.toolCache.values());
  }

  /**
   * Determine which categories are needed based on user query
   */
  inferRequiredCategories(query: string): ToolCategory[] {
    const categories: ToolCategory[] = [];
    const lowerQuery = query.toLowerCase();

    // Always include search for vague questions
    if (lowerQuery.includes('what') || lowerQuery.includes('happening') || 
        lowerQuery.includes('news') || lowerQuery.includes('latest')) {
      categories.push(ToolCategory.SEARCH);
    }

    // Hedera operations
    if (lowerQuery.includes('hedera') || lowerQuery.includes('account') || 
        lowerQuery.includes('transfer') || lowerQuery.includes('hbar')) {
      categories.push(ToolCategory.HEDERA);
    }

    // Token operations
    if (lowerQuery.includes('token') || lowerQuery.includes('nft') || 
        lowerQuery.includes('mint') || lowerQuery.includes('create token')) {
      categories.push(ToolCategory.TOKEN);
    }

    // Smart contracts
    if (lowerQuery.includes('contract') || lowerQuery.includes('deploy') || 
        lowerQuery.includes('solidity') || lowerQuery.includes('evm')) {
      categories.push(ToolCategory.SMART_CONTRACT);
    }

    // Wallet operations
    if (lowerQuery.includes('wallet') || lowerQuery.includes('connect') || 
        lowerQuery.includes('verify')) {
      categories.push(ToolCategory.WALLET);
    }

    // Price/analysis
    if (lowerQuery.includes('price') || lowerQuery.includes('chart') || 
        lowerQuery.includes('analyze')) {
      categories.push(ToolCategory.ANALYSIS);
    }

    // Default to search if no specific category detected
    if (categories.length === 0) {
      categories.push(ToolCategory.SEARCH);
    }

    return categories;
  }

  /**
   * Clear tool cache to free memory
   */
  clearCache(): void {
    this.toolCache.clear();
    this.loadedCategories.clear();
    // Reload essential tools
    this.loadCategory(ToolCategory.SEARCH);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    loadedCategories: number;
    totalTools: number;
    cachedTools: number;
  } {
    return {
      loadedCategories: this.loadedCategories.size,
      totalTools: ALL_TOOL_DEFINITIONS.length,
      cachedTools: this.toolCache.size
    };
  }
}

// Global instance
export const toolManager = new ToolManager();
