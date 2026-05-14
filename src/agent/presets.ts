/**
 * Vera Presets System
 * 
 * Provides fast, pre-configured tool templates for common Hedera operations.
 * Presets bypass complex planning and execute tools directly with smart defaults.
 */

export interface VeraPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'token' | 'nft' | 'defi' | 'account' | 'hcs' | 'data';
  toolName: string;
  defaultParams: Record<string, unknown>;
  requiredParams: string[];
  promptTemplate: string;
  confirmations: string[];
}

/**
 * Token Creation Presets
 */
export const TOKEN_PRESETS: VeraPreset[] = [
  {
    id: 'create_meme_token',
    name: 'Create Meme Token',
    description: 'Launch a meme coin with 0 decimals and 1B supply',
    icon: '🚀',
    category: 'token',
    toolName: 'hts_create_token',
    defaultParams: {
      initialSupply: 1000000000,
      decimals: 0,
      supplyType: 'FINITE',
      isSupplyKey: true
    },
    requiredParams: ['tokenName', 'tokenSymbol'],
    promptTemplate: 'Create a meme token called "{tokenName}" with symbol {tokenSymbol}. 1 billion total supply, no decimals.',
    confirmations: ['Confirm token name and symbol are correct', 'Check the supply amount']
  },
  {
    id: 'create_utility_token',
    name: 'Create Utility Token',
    description: 'Launch a standard token with 8 decimals for DeFi use',
    icon: '⚙️',
    category: 'token',
    toolName: 'hts_create_token',
    defaultParams: {
      decimals: 8,
      supplyType: 'FINITE',
      isSupplyKey: true
    },
    requiredParams: ['tokenName', 'tokenSymbol', 'initialSupply'],
    promptTemplate: 'Create a utility token "{tokenName}" ({tokenSymbol}) with {initialSupply} tokens and 8 decimals.',
    confirmations: ['Verify token configuration', 'Confirm supply amount']
  },
  {
    id: 'mint_more_tokens',
    name: 'Mint More Tokens',
    description: 'Mint additional supply to an existing token',
    icon: '➕',
    category: 'token',
    toolName: 'hts_mint_token',
    defaultParams: {},
    requiredParams: ['tokenId', 'amount'],
    promptTemplate: 'Mint {amount} more tokens for token {tokenId}.',
    confirmations: ['Verify token ID', 'Confirm mint amount']
  },
  {
    id: 'transfer_tokens',
    name: 'Transfer Tokens',
    description: 'Send tokens to another Hedera account',
    icon: '💸',
    category: 'token',
    toolName: 'hbar_transfer', // Note: this uses hbar_transfer for HBAR or token transfer
    defaultParams: {},
    requiredParams: ['transfers'],
    promptTemplate: 'Transfer tokens to the specified account.',
    confirmations: ['Confirm recipient account ID', 'Verify transfer amount']
  }
];

/**
 * NFT Collection Presets
 */
export const NFT_PRESETS: VeraPreset[] = [
  {
    id: 'create_nft_collection',
    name: 'Create NFT Collection',
    description: 'Launch a new NFT collection with max supply',
    icon: '🎨',
    category: 'nft',
    toolName: 'hts_create_nft',
    defaultParams: {},
    requiredParams: ['tokenName', 'tokenSymbol', 'maxSupply'],
    promptTemplate: 'Create an NFT collection called "{tokenName}" with symbol {tokenSymbol} and max supply of {maxSupply}.',
    confirmations: ['Confirm collection name and symbol', 'Verify max supply limit']
  }
];

/**
 * DeFi & Trading Presets
 */
export const DEFI_PRESETS: VeraPreset[] = [
  {
    id: 'swap_hbar_for_token',
    name: 'Swap HBAR for Token',
    description: 'Buy tokens on SaucerSwap with HBAR',
    icon: '💱',
    category: 'defi',
    toolName: 'saucerswap_swap_hbar_for_token',
    defaultParams: {
      slippage: 0.005
    },
    requiredParams: ['token_id', 'hbar_amount', 'min_token_out'],
    promptTemplate: 'Swap {hbar_amount} HBAR for {token_id} tokens.',
    confirmations: ['Confirm token to buy', 'Verify HBAR amount', 'Check minimum output']
  },
  {
    id: 'check_token_price',
    name: 'Check Token Price',
    description: 'Get current USD and HBAR price for a token',
    icon: '📊',
    category: 'defi',
    toolName: 'saucerswap_get_token_price',
    defaultParams: {},
    requiredParams: ['token_id'],
    promptTemplate: 'What is the current price of {token_id}?',
    confirmations: []
  },
  {
    id: 'show_price_chart',
    name: 'Show Price Chart',
    description: 'Display price chart for any token',
    icon: '📈',
    category: 'defi',
    toolName: 'get_price_chart',
    defaultParams: {
      period: '7d'
    },
    requiredParams: ['token'],
    promptTemplate: 'Show me the price chart for {token}.',
    confirmations: []
  }
];

/**
 * Account Management Presets
 */
export const ACCOUNT_PRESETS: VeraPreset[] = [
  {
    id: 'create_account',
    name: 'Create New Account',
    description: 'Create a new Hedera account with 1 HBAR',
    icon: '👤',
    category: 'account',
    toolName: 'hedera_create_account',
    defaultParams: {
      initial_hbar: 1
    },
    requiredParams: [],
    promptTemplate: 'Create a new Hedera account with 1 HBAR.',
    confirmations: ['Confirm you want to fund a new account with 1 HBAR']
  },
  {
    id: 'check_balance',
    name: 'Check Balance',
    description: 'Check HBAR and token balances',
    icon: '💰',
    category: 'account',
    toolName: 'hedera_get_balance',
    defaultParams: {},
    requiredParams: ['account_id'],
    promptTemplate: 'What is the balance for account {account_id}?',
    confirmations: []
  },
  {
    id: 'send_hbar',
    name: 'Send HBAR',
    description: 'Transfer HBAR to another account',
    icon: '💳',
    category: 'account',
    toolName: 'hedera_transfer_hbar',
    defaultParams: {},
    requiredParams: ['to_account_id', 'amount_hbar'],
    promptTemplate: 'Send {amount_hbar} HBAR to account {to_account_id}.',
    confirmations: ['Confirm recipient account', 'Verify HBAR amount']
  }
];

/**
 * HCS (Consensus) Presets
 */
export const HCS_PRESETS: VeraPreset[] = [
  {
    id: 'create_topic',
    name: 'Create Topic',
    description: 'Create a new HCS topic for messaging',
    icon: '📝',
    category: 'hcs',
    toolName: 'hcs_create_topic',
    defaultParams: {
      isSubmitKey: false
    },
    requiredParams: ['topicMemo'],
    promptTemplate: 'Create a new HCS topic with memo: "{topicMemo}".',
    confirmations: ['Confirm topic memo']
  },
  {
    id: 'send_message',
    name: 'Send Message',
    description: 'Send a message to an HCS topic',
    icon: '💬',
    category: 'hcs',
    toolName: 'hedera_hcs_send_message',
    defaultParams: {},
    requiredParams: ['message'],
    promptTemplate: 'Send the message: "{message}" to the HCS topic.',
    confirmations: ['Confirm message content']
  }
];

/**
 * Data & Research Presets
 */
export const DATA_PRESETS: VeraPreset[] = [
  {
    id: 'search_web',
    name: 'Search Web',
    description: 'Search the web for current information',
    icon: '🔍',
    category: 'data',
    toolName: 'web_search',
    defaultParams: {
      max_results: 5
    },
    requiredParams: ['query'],
    promptTemplate: 'Search the web for: "{query}".',
    confirmations: []
  },
  {
    id: 'get_crypto_news',
    name: 'Crypto News',
    description: 'Get latest crypto and Hedera news',
    icon: '📰',
    category: 'data',
    toolName: 'get_news',
    defaultParams: {
      limit: 8
    },
    requiredParams: ['topic'],
    promptTemplate: 'Get the latest news about {topic}.',
    confirmations: []
  },
  {
    id: 'search_tokens',
    name: 'Search Tokens',
    description: 'Find HTS tokens on Hedera',
    icon: '🔎',
    category: 'data',
    toolName: 'hedera_search_tokens',
    defaultParams: {
      limit: 10
    },
    requiredParams: ['query'],
    promptTemplate: 'Search for tokens matching "{query}" on Hedera.',
    confirmations: []
  }
];

/**
 * All presets combined
 */
export const ALL_PRESETS: VeraPreset[] = [
  ...TOKEN_PRESETS,
  ...NFT_PRESETS,
  ...DEFI_PRESETS,
  ...ACCOUNT_PRESETS,
  ...HCS_PRESETS,
  ...DATA_PRESETS
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: VeraPreset['category']): VeraPreset[] {
  return ALL_PRESETS.filter(p => p.category === category);
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): VeraPreset | undefined {
  return ALL_PRESETS.find(p => p.id === id);
}

/**
 * Build tool parameters from preset with user overrides
 */
export function buildPresetParams(
  preset: VeraPreset,
  userOverrides: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...preset.defaultParams,
    ...userOverrides
  };
}

/**
 * Generate chat prompt from preset template
 */
export function generatePresetPrompt(
  preset: VeraPreset,
  params: Record<string, unknown>
): string {
  let prompt = preset.promptTemplate;
  
  // Replace template variables with actual values
  Object.entries(params).forEach(([key, value]) => {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  });
  
  return prompt;
}

/**
 * Preset execution result
 */
export interface PresetExecutionResult {
  success: boolean;
  toolName: string;
  params: Record<string, unknown>;
  prompt: string;
  confirmations: string[];
  error?: string;
}

/**
 * Prepare a preset for execution
 */
export function preparePreset(
  presetId: string,
  userParams: Record<string, unknown>
): PresetExecutionResult {
  const preset = getPresetById(presetId);
  
  if (!preset) {
    return {
      success: false,
      toolName: '',
      params: {},
      prompt: '',
      confirmations: [],
      error: `Preset "${presetId}" not found`
    };
  }
  
  // Check required params
  const missing = preset.requiredParams.filter(p => !(p in userParams));
  if (missing.length > 0) {
    return {
      success: false,
      toolName: preset.toolName,
      params: {},
      prompt: '',
      confirmations: preset.confirmations,
      error: `Missing required parameters: ${missing.join(', ')}`
    };
  }
  
  const params = buildPresetParams(preset, userParams);
  const prompt = generatePresetPrompt(preset, params);
  
  return {
    success: true,
    toolName: preset.toolName,
    params,
    prompt,
    confirmations: preset.confirmations
  };
}
