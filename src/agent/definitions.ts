export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const HEDERA_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'hedera_get_account_info',
      description: 'Get detailed information about a Hedera account. Returns {account, balance: {hbars, tinybars}, memo, key, created_timestamp}.',
      parameters: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'Hedera account ID, e.g. 0.0.12345' },
        },
        required: ['account_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_get_balance',
      description: 'Get the current HBAR balance of a Hedera account. Returns {hbars, tinybars}.',
      parameters: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'Hedera account ID, e.g. 0.0.12345' },
        },
        required: ['account_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_get_tokens',
      description: 'Get all HTS tokens held by a Hedera account. Returns array of {token_id, balance, decimals}.',
      parameters: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'Hedera account ID' },
        },
        required: ['account_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_search_tokens',
      description: 'Search for HTS tokens on Hedera by name or symbol. Returns {tokens: [{token_id, name, symbol, decimals, type}], count}. Use {{stepN.tokens.0.token_id}} for state threading.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Token name or symbol to search for, e.g. "GIB" or "DOSA"' },
          limit: { type: 'number', description: 'Max results to return (default 10, max 50)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_transfer_hbar',
      description:
        'Transfer HBAR from the operator account to another Hedera account. Always confirm with the user before executing this tool.',
      parameters: {
        type: 'object',
        properties: {
          to_account_id: { type: 'string', description: 'Destination Hedera account ID' },
          amount_hbar: { type: 'number', description: 'Amount of HBAR to transfer (positive number)' },
          memo: { type: 'string', description: 'Optional transaction memo' },
        },
        required: ['to_account_id', 'amount_hbar'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_hcs_send_message',
      description: 'Send a message to a Hedera Consensus Service (HCS) topic.',
      parameters: {
        type: 'object',
        properties: {
          topic_id: {
            type: 'string',
            description: 'HCS topic ID (e.g. 0.0.12345). Omit to use the default configured topic.',
          },
          message: { type: 'string', description: 'The message content to publish to the topic.' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_hcs_get_messages',
      description: 'Read recent messages from a Hedera Consensus Service (HCS) topic. Returns array of {sequence_number, consensus_timestamp, message} ordered newest first.',
      parameters: {
        type: 'object',
        properties: {
          topic_id: {
            type: 'string',
            description: 'HCS topic ID. Omit to use the default configured topic.',
          },
          limit: { type: 'number', description: 'Maximum number of messages to return (default 25, max 100).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_create_nft_collection',
      description: 'Create a new NFT collection (HTS NonFungibleUnique token). The operator account becomes the treasury and supply key holder. Always confirm with user first.',
      parameters: {
        type: 'object',
        properties: {
          name:       { type: 'string', description: 'Collection name, e.g. "Vera Art"' },
          symbol:     { type: 'string', description: 'Collection symbol, e.g. "VART"' },
          max_supply: { type: 'number', description: 'Max NFTs mintable (omit for unlimited)' },
          memo:       { type: 'string', description: 'Optional collection memo' },
        },
        required: ['name', 'symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_mint_nft',
      description: 'Mint a new NFT in an existing collection. Metadata can be a JSON string, IPFS CID, or URL. Always confirm with user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'NFT collection token ID' },
          metadata: { type: 'string', description: 'Metadata string: JSON, IPFS CID (ipfs://...), or URL' },
        },
        required: ['token_id', 'metadata'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_transfer_nft',
      description: 'Transfer an NFT by serial number to another Hedera account. Always confirm with user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id:      { type: 'string', description: 'NFT collection token ID' },
          serial_number: { type: 'number', description: 'Serial number of the NFT to transfer' },
          to_account_id: { type: 'string', description: 'Destination Hedera account ID' },
        },
        required: ['token_id', 'serial_number', 'to_account_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_create_account',
      description:
        'Create a new Hedera account with a freshly generated ED25519 keypair. The operator funds it with initial HBAR. Returns the new account ID and private key — store these securely. Always confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          initial_hbar: { type: 'number', description: 'HBAR to seed the new account with (default 1 HBAR)' },
          memo:         { type: 'string', description: 'Optional account memo, e.g. "Vera wallet"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_mint_token',
      description: 'Mint additional supply of an HTS fungible token. Operator must hold the supply key. Always confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'HTS token ID, e.g. 0.0.12345' },
          amount:   { type: 'number', description: 'Number of tokens to mint (in smallest unit, accounting for decimals)' },
        },
        required: ['token_id', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_burn_token',
      description: 'Burn (permanently destroy) a quantity of HTS fungible tokens from the treasury. Always confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'HTS token ID' },
          amount:   { type: 'number', description: 'Number of tokens to burn (in smallest unit)' },
        },
        required: ['token_id', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_transfer_token',
      description: 'Transfer HTS fungible tokens from the operator account to another account. Always confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id:      { type: 'string', description: 'HTS token ID' },
          to_account_id: { type: 'string', description: 'Destination Hedera account ID' },
          amount:        { type: 'number', description: 'Amount to transfer (in smallest unit, e.g. for 8 decimals: 1 VERA = 100000000)' },
          memo:          { type: 'string', description: 'Optional transaction memo' },
        },
        required: ['token_id', 'to_account_id', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_associate_token',
      description: 'Associate an HTS token with an account so it can receive that token. Required before any account can hold the token.',
      parameters: {
        type: 'object',
        properties: {
          token_id:   { type: 'string', description: 'HTS token ID to associate' },
          account_id: { type: 'string', description: 'Account to associate the token with. Defaults to operator account.' },
        },
        required: ['token_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_create_token',
      description:
        'Create a new HTS (Hedera Token Service) fungible token. The operator account becomes the treasury and admin. Always confirm with the user before executing.',
      parameters: {
        type: 'object',
        properties: {
          name:           { type: 'string',  description: 'Full token name, e.g. "Vera Token"' },
          symbol:         { type: 'string',  description: 'Ticker symbol, e.g. "VERA"' },
          decimals:       { type: 'number',  description: 'Decimal places (default 8)' },
          initial_supply: { type: 'number',  description: 'Initial supply in whole tokens (default 1,000,000,000)' },
          max_supply:     { type: 'number',  description: 'Max supply cap (omit for infinite supply)' },
          memo:           { type: 'string',  description: 'Optional token memo' },
        },
        required: ['name', 'symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hedera_get_transaction',
      description: 'Look up a Hedera transaction by its transaction ID. Returns {transaction_id, result, name, charged_tx_fee, consensus_timestamp, transfers}.',
      parameters: {
        type: 'object',
        properties: {
          tx_id: { type: 'string', description: 'Hedera transaction ID' },
        },
        required: ['tx_id'],
      },
    },
  },
];

export const SAUCERSWAP_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'saucerswap_get_pools',
      description: 'List the top liquidity pools on SaucerSwap DEX. Returns array of {id, tokenA, tokenB, tvlUsd, volume24hUsd, fee}.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max pools to return (default 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saucerswap_get_token_price',
      description: 'Get the current USD and HBAR price of an HTS token on SaucerSwap. Returns {priceUsd, priceHbar, tokenId, symbol}.',
      parameters: {
        type: 'object',
        properties: {
          token_id: { type: 'string', description: 'HTS token ID or symbol, e.g. 0.0.12345 or "VERA"' },
        },
        required: ['token_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saucerswap_swap_hbar_for_token',
      description: 'Swap HBAR for an HTS token on SaucerSwap V1. Always confirm amount and token with user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id:      { type: 'string', description: 'HTS token ID to buy' },
          hbar_amount:   { type: 'number', description: 'HBAR to spend (whole HBAR)' },
          min_token_out: { type: 'number', description: 'Minimum tokens to receive (smallest unit)' },
          slippage:      { type: 'number', description: 'Slippage tolerance 0–1 (default 0.005)' },
        },
        required: ['token_id', 'hbar_amount', 'min_token_out'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saucerswap_swap_token_for_hbar',
      description: 'Swap an HTS token for HBAR on SaucerSwap V1. Always confirm amount and token with user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id:     { type: 'string', description: 'HTS token ID to sell' },
          token_amount: { type: 'number', description: 'Token amount to sell (smallest unit)' },
          min_hbar_out: { type: 'number', description: 'Minimum HBAR to receive back (whole HBAR)' },
          slippage:     { type: 'number', description: 'Slippage tolerance 0–1 (default 0.005)' },
        },
        required: ['token_id', 'token_amount', 'min_hbar_out'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saucerswap_add_liquidity',
      description:
        'Add liquidity to an HBAR/token pool on SaucerSwap V1. Provide HBAR and tokens in proportion to current pool price. Always confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id:     { type: 'string', description: 'HTS token ID for the token side of the pair' },
          token_amount: { type: 'number', description: 'Token amount in smallest units (e.g. 100000000 = 1 VERA with 8 decimals)' },
          hbar_amount:  { type: 'number', description: 'HBAR amount (whole HBAR, e.g. 10)' },
          slippage:     { type: 'number', description: 'Slippage tolerance 0–1 (default 0.005 = 0.5%)' },
        },
        required: ['token_id', 'token_amount', 'hbar_amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saucerswap_remove_liquidity',
      description:
        'Remove liquidity from an HBAR/token pool on SaucerSwap V1 by burning LP tokens. Always confirm with the user first.',
      parameters: {
        type: 'object',
        properties: {
          token_id:  { type: 'string', description: 'HTS token ID' },
          lp_amount: { type: 'number', description: 'LP token amount to burn' },
          min_token: { type: 'number', description: 'Minimum tokens to receive back' },
          min_hbar:  { type: 'number', description: 'Minimum HBAR to receive back (whole HBAR)' },
          slippage:  { type: 'number', description: 'Slippage tolerance 0–1 (default 0.005)' },
        },
        required: ['token_id', 'lp_amount', 'min_token', 'min_hbar'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_chart',
      description: 'Show a real-time price chart for HBAR or any Hedera HTS token with CoinGecko price data. Displays a visual candlestick chart to the user and returns OHLCV data for analysis. Use this whenever a user asks to "show", "chart", "graph", or "plot" a token price, or asks about price trends.',
      parameters: {
        type: 'object',
        properties: {
          token:  { type: 'string', description: 'Token symbol (e.g. "HBAR", "SAUCE", "HBARX") or token_id (e.g. "0.0.731861")' },
          period: { type: 'string', enum: ['1d', '7d', '30d', '90d', '1y'], description: 'Chart time period. Default: 7d' },
        },
        required: ['token'],
      },
    },
  },
];

export const QVX_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'qvx_get_node_status',
      description: 'Get the current operational status of the QVX node.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_node_metrics',
      description: 'Get performance and health metrics from the QVX node.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_positions',
      description: 'Get the current open trading positions held by the Veda trading bot on Kraken.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_signals',
      description: 'Get the latest trading signals generated by Veda\'s learned strategy. Use when asked about market signals, what the bot thinks, or trade recommendations.',
      parameters: {
        type: 'object',
        properties: {
          market: { type: 'string', description: 'Optional market/pair filter e.g. "XBT/USD"' },
          limit:  { type: 'number', description: 'Max number of signals to return (default 5)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_pnl',
      description: 'Get profit and loss summary for the Veda trading bot. Use when asked about performance, returns, profit, or how the bot is doing.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['24h', '7d', '30d', 'all'], description: 'Time period for P&L (default 24h)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_strategy_state',
      description: 'Get the current state of Veda\'s active trading strategy — mode, parameters, risk settings, and what the bot has learned.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_market_analysis',
      description: 'Get Veda\'s learned market analysis for a specific trading pair. Returns technical signals, trend assessment, and confidence scores based on what the bot has learned.',
      parameters: {
        type: 'object',
        properties: {
          market:    { type: 'string', description: 'Market/pair to analyse e.g. "XBT/USD", "ETH/USD", "HBAR/USD"' },
          timeframe: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h', '1d'], description: 'Timeframe for analysis (default 1h)' },
        },
        required: ['market'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_learning_state',
      description: 'Get the current learning/training state of the Veda bot — what it has learned, model version, training iterations, and confidence metrics.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qvx_get_trade_history',
      description: 'Get recent trade execution history from the Veda bot. Use when asked about past trades, win rate, or execution history.',
      parameters: {
        type: 'object',
        properties: {
          limit:  { type: 'number', description: 'Number of trades to return (default 20)' },
          market: { type: 'string', description: 'Optional market filter' },
        },
        required: [],
      },
    },
  },
];

export const WEB_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information on any topic — world events, news, documentation, prices, people, companies, or anything else. Use this whenever you need up-to-date information or are unsure about recent facts.',
      parameters: {
        type: 'object',
        properties: {
          query:       { type: 'string', description: 'The search query' },
          max_results: { type: 'number', description: 'Max results to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_news',
      description: 'Fetch the latest news headlines and summaries on any topic. Use for current events, breaking news, market news, or crypto/blockchain news.',
      parameters: {
        type: 'object',
        properties: {
          topic:  { type: 'string', description: 'News topic to search for, e.g. "Hedera HBAR", "Bitcoin ETF", "AI regulation"' },
          limit:  { type: 'number', description: 'Number of articles to return (default 8, max 15)' },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wiki_search',
      description: 'Search Wikipedia for in-depth factual information on any topic — history, science, technology, people, places, events, concepts. Returns a structured summary with key facts. Use for deep background knowledge.',
      parameters: {
        type: 'object',
        properties: {
          query:     { type: 'string', description: 'Topic to look up on Wikipedia' },
          sentences: { type: 'number', description: 'Number of summary sentences to return (default 8, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hackernews_search',
      description: 'Search Hacker News for tech community discussions, startup news, AI/ML research, crypto/blockchain developments, engineering insights, and emerging technology trends. Returns top stories and comments.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for Hacker News, e.g. "Hedera hashgraph", "DeFi protocol design", "LLM fine-tuning"' },
          limit: { type: 'number', description: 'Number of results (default 8, max 20)' },
        },
        required: ['query'],
      },
    },
  },
];

export const SMART_CONTRACT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'vera_compile_contract',
      description: 'Compile Solidity source code. Returns {bytecode, abi, contract_name, compiler_version}. Always compile before deploying with vera_deploy_contract.',
      parameters: {
        type: 'object',
        properties: {
          source_code:   { type: 'string', description: 'The complete Solidity source code to compile, starting with pragma solidity...' },
          contract_name: { type: 'string', description: 'The name of the main contract to extract from the compiled output' },
        },
        required: ['source_code', 'contract_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vera_deploy_contract',
      description: 'Deploy a compiled smart contract to Hedera using the configured operator account. Requires vera_compile_contract to have been called first. Returns contract_id (0.0.XXXXX) and contract_address (0x...) for use in subsequent vera_call_contract calls.',
      parameters: {
        type: 'object',
        properties: {
          bytecode:         { type: 'string', description: 'Hex bytecode from vera_compile_contract' },
          abi:              { type: 'array',  description: 'ABI array from vera_compile_contract', items: {} },
          constructor_args: { type: 'array',  description: 'Constructor arguments (if any)', items: {}, default: [] },
          gas_limit:        { type: 'number', description: 'Gas limit for deployment (default 500000)', default: 500000 },
        },
        required: ['bytecode', 'abi'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vera_call_contract',
      description: 'Call a function on a deployed Hedera EVM smart contract. Supports both read (view/pure) and write (state-changing) calls. Returns the function result or transaction receipt.',
      parameters: {
        type: 'object',
        properties: {
          contract_id:   { type: 'string', description: 'Contract ID (0.0.XXXXX format) or EVM address (0x...)' },
          abi:           { type: 'array',  description: 'ABI array of the contract', items: {} },
          function_name: { type: 'string', description: 'Name of the function to call' },
          args:          { type: 'array',  description: 'Function arguments', items: {}, default: [] },
          gas_limit:     { type: 'number', description: 'Gas limit for write calls (default 100000)', default: 100000 },
          read_only:     { type: 'boolean', description: 'If true, performs a free view/pure call. Default: false (write transaction)', default: false },
        },
        required: ['contract_id', 'abi', 'function_name'],
      },
    },
  },
];

export const SUB_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'vera_spawn_agent',
      description: 'Spawn a specialised sub-agent to handle a focused task in parallel with your thinking. Use this for complex tasks that benefit from deep specialisation: use "researcher" for web intelligence, "analyst" for on-chain data deep-dives, "coder" for writing/compiling contracts or code, "critic" for adversarial plan review, "planner" for detailed project planning. The sub-agent runs independently, uses its own tools, and returns a synthesised result. Always spawn a sub-agent when the task clearly belongs to one of these domains.',
      parameters: {
        type: 'object',
        properties: {
          role:    { type: 'string', enum: ['researcher', 'analyst', 'coder', 'critic', 'planner'], description: 'Which specialised sub-agent to spawn' },
          task:    { type: 'string', description: 'Clear, specific task for the sub-agent to complete. Be precise — the sub-agent only knows what you tell it here.' },
          context: { type: 'string', description: 'Optional: additional context from the conversation that helps the sub-agent (e.g. project name, user goal, prior findings)' },
        },
        required: ['role', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_sub_agent',
      description: 'Spawn a specialized domain sub-agent for energy, security, defi, or carbon monitoring. These sub-agents run independently and report back to the parent agent. Use this for continuous monitoring tasks that need to run in parallel.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique identifier for this sub-agent (e.g., "grid-monitor-001")' },
          parentId: { type: 'string', description: 'Parent agent ID that owns this sub-agent' },
          role: { 
            type: 'string', 
            enum: ['GRID_MONITOR', 'WEATHER_ANALYZER', 'LOAD_PREDICTOR', 'THREAT_DETECTOR', 'CONTRACT_MONITOR', 'ACCESS_ANALYZER', 'WHALE_TRACKER', 'ARB_OPPORTUNITY', 'YIELD_OPTIMIZER'],
            description: 'Specialized role for this sub-agent'
          },
          domain: { type: 'string', enum: ['energy', 'security', 'defi', 'carbon'], description: 'Domain this sub-agent operates in' },
          interval: { type: 'number', description: 'Cycle interval in milliseconds (default: 60000 = 1 minute)' },
          params: { type: 'object', description: 'Additional parameters specific to this sub-agent role' }
        },
        required: ['id', 'parentId', 'role', 'domain'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kill_sub_agent',
      description: 'Terminate a running sub-agent by its ID. Use this when a sub-agent has completed its task or needs to be shut down.',
      parameters: {
        type: 'object',
        properties: {
          subAgentId: { type: 'string', description: 'ID of the sub-agent to terminate' }
        },
        required: ['subAgentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sub_agents',
      description: 'List all active sub-agents and their status. Use this to monitor your sub-agent fleet.',
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['energy', 'security', 'defi', 'carbon'], description: 'Optional: filter by domain' }
        }
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sub_agent_health',
      description: 'Get health metrics for all sub-agents: total count, idle, running, error states, and breakdown by domain.',
      parameters: {
        type: 'object',
        properties: {}
      },
    },
  },
];

export const MEMORY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'vera_memory_save',
      description: 'Save an important insight, decision, project note, or conversation summary to Vera\'s persistent memory. Use this to remember things across conversations. Returns memory_id (integer) and title.',
      parameters: {
        type: 'object',
        properties: {
          title:   { type: 'string', description: 'Short title for this memory (max 80 chars)' },
          content: { type: 'string', description: 'The content to remember — insights, decisions, project details, etc.' },
          tags:    { type: 'array',  description: 'Tags for retrieval (e.g. ["project", "hedera", "tokenomics"])', items: { type: 'string' } },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vera_memory_recall',
      description: 'Recall recent memories saved by Vera. Use at the start of conversations about ongoing projects, or when the user references something from a previous session.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of recent memories to retrieve (default 5, max 20)' },
          tag:   { type: 'string', description: 'Optional: filter memories by tag' },
          query: { type: 'string', description: 'Optional: full-text search across memory title and content' },
        },
        required: [],
      },
    },
  },
];

export const AGENT_KIT_TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── HTS: Fungible Tokens ────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hts_create_token',
      description: 'Create a new HTS fungible token on Hedera. Use for "create a token", "launch a coin", "deploy an HTS token". Returns tokenId (0.0.XXXXX) and hashscan_url. Use {{stepN.tokenId}} to reference the token in later steps.',
      parameters: {
        type: 'object',
        properties: {
          tokenName:        { type: 'string',  description: 'Full token name (e.g. "Vera Token")' },
          tokenSymbol:      { type: 'string',  description: 'Ticker symbol (e.g. "VERA"), max 10 chars' },
          initialSupply:    { type: 'number',  description: 'Total initial supply (e.g. 1000000000 for 1B)' },
          decimals:         { type: 'number',  description: 'Decimal places (default 8, use 0 for meme coins)' },
          supplyType:       { type: 'string',  description: '"FINITE" or "INFINITE"', enum: ['FINITE','INFINITE'] },
          maxSupply:        { type: 'number',  description: 'Max supply if FINITE (optional)' },
          treasuryAccountId:{ type: 'string',  description: 'Account to receive initial supply (default: operator)' },
          isSupplyKey:      { type: 'boolean', description: 'Whether to enable minting/burning later (default true)' },
        },
        required: ['tokenName', 'tokenSymbol', 'initialSupply'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hts_mint_token',
      description: 'Mint additional supply of an existing HTS fungible token. Requires the token to have isSupplyKey=true. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'HTS token ID (e.g. "0.0.12345")' },
          amount:  { type: 'number', description: 'Amount to mint in base units (e.g. for 8-decimal token: 1 token = 100000000, for 0-decimal: 1 token = 1)' },
        },
        required: ['tokenId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hts_airdrop',
      description: 'Airdrop fungible tokens to multiple recipients in one transaction. Great for community distributions and initial token launches. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:         { type: 'string', description: 'HTS token ID to airdrop' },
          sourceAccountId: { type: 'string', description: 'Account holding the tokens' },
          recipients:      { type: 'array',  description: 'Array of recipient objects, each with accountId (string) and amount (number in base units). Example: [{"accountId":"0.0.123","amount":1000}]', items: { type: 'object' } },
        },
        required: ['tokenId', 'recipients'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hts_create_nft',
      description: 'Create a new HTS Non-Fungible Token (NFT) collection on Hedera. Returns tokenId (0.0.XXXXX) and hashscan_url. Use {{stepN.tokenId}} to reference the collection in later steps.',
      parameters: {
        type: 'object',
        properties: {
          tokenName:        { type: 'string', description: 'Collection name' },
          tokenSymbol:      { type: 'string', description: 'Collection symbol' },
          maxSupply:        { type: 'number', description: 'Maximum number of NFTs in collection' },
          treasuryAccountId:{ type: 'string', description: 'Treasury account (default: operator)' },
        },
        required: ['tokenName', 'tokenSymbol', 'maxSupply'],
      },
    },
  },
  // ── Account: HBAR transfers ─────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hbar_transfer',
      description: 'Transfer HBAR between accounts. ALWAYS show the user the transfer details and get confirmation before calling this. Returns transaction ID + HashScan link.',
      parameters: {
        type: 'object',
        properties: {
          transfers:       { type: 'array',  description: 'Array of {accountId, amount} — positive = receive, negative = send. Must sum to 0.', items: { type: 'object' } },
          sourceAccountId: { type: 'string', description: 'Sending account ID' },
          transactionMemo: { type: 'string', description: 'Optional memo (max 100 chars)' },
        },
        required: ['transfers'],
      },
    },
  },
  // ── Consensus: HCS Topics ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hcs_create_topic',
      description: 'Create an HCS topic for immutable message logging on Hedera. Use for audit trails, governance voting, AI memory anchoring, or decentralized messaging. Returns topicId (0.0.XXXXX) and hashscan_url. Use {{stepN.topicId}} in later hcs_submit_message calls.',
      parameters: {
        type: 'object',
        properties: {
          topicMemo:       { type: 'string',  description: 'Human-readable description for this topic' },
          isSubmitKey:     { type: 'boolean', description: 'If true, only authorized accounts can submit messages (default false = public)' },
          transactionMemo: { type: 'string',  description: 'Optional transaction memo' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hcs_submit_message',
      description: 'Submit a message to an HCS topic. Creates an immutable, timestamped, ordered record on Hedera. Use for anchoring AI decisions, audit logs, or any tamper-proof data. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          topicId:         { type: 'string', description: 'HCS Topic ID (e.g. "0.0.56789")' },
          message:         { type: 'string', description: 'Message content to submit (string or JSON)' },
          transactionMemo: { type: 'string', description: 'Optional transaction memo' },
        },
        required: ['topicId', 'message'],
      },
    },
  },
  // ── EVM: Smart contracts ─────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'evm_create_erc20',
      description: 'Deploy an ERC-20 token on Hedera EVM via the official Agent Kit factory. Faster than manual solc compilation. Returns contractId (0.0.XXXXX), contractAddress (0x...), and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenName:     { type: 'string', description: 'Token name' },
          tokenSymbol:   { type: 'string', description: 'Token symbol' },
          decimals:      { type: 'number', description: 'Decimal places (default 18)' },
          initialSupply: { type: 'number', description: 'Initial supply in base units' },
        },
        required: ['tokenName', 'tokenSymbol', 'initialSupply'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evm_create_erc721',
      description: 'Deploy an ERC-721 NFT contract on Hedera EVM via the official Agent Kit factory. Returns contractId (0.0.XXXXX), contractAddress (0x...), and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenName:  { type: 'string', description: 'NFT collection name' },
          tokenSymbol:{ type: 'string', description: 'NFT collection symbol' },
          baseURI:    { type: 'string', description: 'Base metadata URI (e.g. "ipfs://...")', default: '' },
        },
        required: ['tokenName', 'tokenSymbol'],
      },
    },
  },
  // ── Queries ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'kit_get_account',
      description: 'Get detailed account info via Agent Kit. Returns {accountId, hbarBalance, tokens, key, createdAt}. Use for account deep-dives.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Hedera account ID (e.g. "0.0.12345")' },
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_token_info',
      description: 'Get full HTS token details via Agent Kit. Returns {tokenId, name, symbol, totalSupply, decimals, type, treasury, supplyKey}.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'HTS token ID (e.g. "0.0.123456")' },
        },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_hcs_messages',
      description: 'Read messages from an HCS topic via Agent Kit. Use to retrieve on-chain logs, AI memories, or governance votes.',
      parameters: {
        type: 'object',
        properties: {
          topicId:   { type: 'string', description: 'HCS Topic ID' },
          limit:     { type: 'number', description: 'Max messages to retrieve (default 25)' },
          startTime: { type: 'string', description: 'ISO timestamp to start from (optional)' },
        },
        required: ['topicId'],
      },
    },
  },
  // ── Token: dissociate / update ───────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hts_dissociate_token',
      description: 'Dissociate an HTS token from an account so it can no longer hold that token. Use before deleting an account. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:   { type: 'string', description: 'HTS token ID to dissociate (e.g. "0.0.12345")' },
          accountId: { type: 'string', description: 'Account to dissociate from (default: operator)' },
        },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hts_update_token',
      description: 'Update mutable properties of an existing HTS token (name, symbol, memo, treasury, admin/supply/freeze/wipe keys). Operator must hold the admin key. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:         { type: 'string',  description: 'HTS token ID to update' },
          tokenName:       { type: 'string',  description: 'New token name (optional)' },
          tokenSymbol:     { type: 'string',  description: 'New token symbol (optional)' },
          tokenMemo:       { type: 'string',  description: 'New token memo (optional)' },
          treasuryAccountId:{ type: 'string', description: 'New treasury account ID (optional)' },
        },
        required: ['tokenId'],
      },
    },
  },
  // ── NFT: mint / transfer via Agent Kit ──────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hts_mint_nft',
      description: 'Mint a new NFT serial in an existing HTS NFT collection. Metadata can be a JSON string, IPFS CID, or URL. Returns serialNumbers and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:  { type: 'string', description: 'NFT collection token ID (e.g. "0.0.12345")' },
          metadata: { type: 'string', description: 'NFT metadata: JSON string, IPFS CID (ipfs://...), or URL' },
        },
        required: ['tokenId', 'metadata'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hts_transfer_nft',
      description: 'Transfer an NFT serial number to another account. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:      { type: 'string', description: 'NFT collection token ID' },
          serialNumber: { type: 'number', description: 'Serial number of the NFT to transfer' },
          toAccountId:  { type: 'string', description: 'Destination account ID' },
          fromAccountId:{ type: 'string', description: 'Source account ID (default: operator)' },
        },
        required: ['tokenId', 'serialNumber', 'toAccountId'],
      },
    },
  },
  // ── Allowances ──────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hts_approve_nft_allowance',
      description: 'Approve a spender to transfer a specific NFT (or all NFTs in a collection) on behalf of the owner. Required for NFT marketplace listings. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:      { type: 'string',  description: 'NFT collection token ID' },
          spenderAccountId: { type: 'string', description: 'Account to grant spending rights to' },
          serialNumber: { type: 'number',  description: 'Specific serial to approve, or omit to approve all serials' },
          approveAll:   { type: 'boolean', description: 'If true, approve all serials in the collection' },
        },
        required: ['tokenId', 'spenderAccountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hts_delete_nft_allowance',
      description: 'Revoke an NFT spending allowance previously granted to a spender. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:      { type: 'string', description: 'NFT collection token ID' },
          serialNumbers:{ type: 'array',  description: 'Serial numbers to revoke (array of numbers)', items: { type: 'number' } },
        },
        required: ['tokenId', 'serialNumbers'],
      },
    },
  },
  // ── Account: create / update / delete / allowances ──────────────────────────
  {
    type: 'function',
    function: {
      name: 'kit_create_account',
      description: 'Create a new Hedera account with a fresh ED25519 keypair, funded with initial HBAR. Returns accountId, privateKey, publicKey, and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          initialBalance:    { type: 'number', description: 'Initial HBAR balance to seed the new account (default 1 HBAR)' },
          memo:              { type: 'string',  description: 'Optional account memo' },
          maxAutomaticTokenAssociations: { type: 'number', description: 'Maximum auto token associations (default 0)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_account',
      description: 'Verify if a Hedera account exists on mainnet and get HashScan proof with balance and creation info',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Hedera account ID to verify (e.g., 0.0.123456)' }
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'auto_connect_wallet',
      description: 'Automatically connect a newly created wallet to the dashboard for immediate use',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Hedera account ID to auto-connect' },
          privateKey: { type: 'string', description: 'Private key for the account (optional)' }
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_awareness',
      description: 'Get comprehensive market data and network awareness for intelligent conversation',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_awareness',
      description: 'Search for specific information across market data, network metrics, news, and trending topics',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for information' }
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trending_topics',
      description: 'Get current trending topics in the crypto and Hedera ecosystem',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_network_status',
      description: 'Get real-time Hedera network performance metrics and status',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_update_account',
      description: 'Update properties of an existing Hedera account (memo, auto-renew period, max token associations, staking). Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          accountId:        { type: 'string', description: 'Account ID to update (default: operator)' },
          memo:             { type: 'string', description: 'New account memo' },
          stakedNodeId:     { type: 'number', description: 'Node ID to stake to' },
          stakedAccountId:  { type: 'string', description: 'Account ID to stake to' },
          declineReward:    { type: 'boolean',description: 'Whether to decline staking rewards' },
          maxAutomaticTokenAssociations: { type: 'number', description: 'New max auto token associations' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_delete_account',
      description: 'Delete a Hedera account and transfer its remaining HBAR to a transfer account. Account must have zero token balances. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          accountId:         { type: 'string', description: 'Account ID to delete' },
          transferAccountId: { type: 'string', description: 'Account to receive remaining HBAR (default: operator)' },
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_approve_hbar_allowance',
      description: 'Approve a spender to spend up to a specific amount of HBAR from the owner\'s account. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          spenderAccountId: { type: 'string', description: 'Account to grant HBAR spending rights to' },
          amount:           { type: 'number', description: 'Maximum HBAR amount the spender can use (whole HBAR)' },
          ownerAccountId:   { type: 'string', description: 'Granting account (default: operator)' },
        },
        required: ['spenderAccountId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_approve_token_allowance',
      description: 'Approve a spender to spend up to a specific amount of HTS fungible tokens from the owner\'s account. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:          { type: 'string', description: 'HTS token ID' },
          spenderAccountId: { type: 'string', description: 'Account to grant token spending rights to' },
          amount:           { type: 'number', description: 'Max token amount the spender can use (in base units)' },
          ownerAccountId:   { type: 'string', description: 'Granting account (default: operator)' },
        },
        required: ['tokenId', 'spenderAccountId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_delete_hbar_allowance',
      description: 'Remove a previously granted HBAR spending allowance. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          spenderAccountId: { type: 'string', description: 'Account whose allowance to revoke' },
          ownerAccountId:   { type: 'string', description: 'Granting account (default: operator)' },
        },
        required: ['spenderAccountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_delete_token_allowance',
      description: 'Remove a previously granted HTS token spending allowance. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenId:          { type: 'string', description: 'HTS token ID' },
          spenderAccountId: { type: 'string', description: 'Account whose token allowance to revoke' },
          ownerAccountId:   { type: 'string', description: 'Granting account (default: operator)' },
        },
        required: ['tokenId', 'spenderAccountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_sign_schedule',
      description: 'Sign a pending scheduled transaction. Once enough signatures are collected, it executes automatically. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          scheduleId: { type: 'string', description: 'Schedule ID to sign (e.g. "0.0.12345")' },
        },
        required: ['scheduleId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_delete_schedule',
      description: 'Delete a pending scheduled transaction before it executes. Operator must hold the admin key. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          scheduleId: { type: 'string', description: 'Schedule ID to delete (e.g. "0.0.12345")' },
        },
        required: ['scheduleId'],
      },
    },
  },
  // ── Consensus: delete / update topic ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'hcs_update_topic',
      description: 'Update the memo or keys on an existing HCS topic. Operator must hold the admin key. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          topicId:   { type: 'string', description: 'HCS Topic ID to update (e.g. "0.0.12345")' },
          topicMemo: { type: 'string', description: 'New topic memo / description' },
        },
        required: ['topicId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hcs_delete_topic',
      description: 'Permanently delete an HCS topic. Operator must hold the admin key. This is irreversible. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          topicId: { type: 'string', description: 'HCS Topic ID to delete (e.g. "0.0.12345")' },
        },
        required: ['topicId'],
      },
    },
  },
  // ── EVM: transfer / mint ──────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'evm_transfer_erc20',
      description: 'Transfer ERC-20 tokens on Hedera EVM from the operator to another address. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string', description: 'ERC-20 contract address (0x...)' },
          toAddress:    { type: 'string', description: 'Recipient EVM address (0x...) or Hedera account ID' },
          amount:       { type: 'number', description: 'Amount in token base units (accounting for decimals)' },
        },
        required: ['tokenAddress', 'toAddress', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evm_mint_erc721',
      description: 'Mint a new ERC-721 NFT on Hedera EVM. Returns tokenId (serial), transactionId, and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          contractAddress: { type: 'string', description: 'ERC-721 contract address (0x...)' },
          toAddress:       { type: 'string', description: 'Recipient EVM address (0x...) or Hedera account ID' },
          tokenURI:        { type: 'string', description: 'Metadata URI for the NFT (ipfs://... or https://...)' },
        },
        required: ['contractAddress', 'toAddress', 'tokenURI'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evm_transfer_erc721',
      description: 'Transfer an ERC-721 NFT on Hedera EVM. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          contractAddress: { type: 'string', description: 'ERC-721 contract address (0x...)' },
          toAddress:       { type: 'string', description: 'Recipient EVM address (0x...) or Hedera account ID' },
          tokenId:         { type: 'number', description: 'Token ID (serial number) to transfer' },
        },
        required: ['contractAddress', 'toAddress', 'tokenId'],
      },
    },
  },
  // ── Queries: token balances / pending airdrops / topic info / contract / tx ──
  {
    type: 'function',
    function: {
      name: 'kit_get_token_balances',
      description: 'Get all HTS token balances for a Hedera account via Agent Kit. Returns array of {tokenId, balance, decimals, symbol}.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Hedera account ID (e.g. "0.0.12345")' },
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_pending_airdrops',
      description: 'Get pending HTS token airdrops awaiting claim for a Hedera account. Returns array of pending airdrop records.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Hedera account ID to check for pending airdrops' },
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_topic_info',
      description: 'Get metadata about an HCS topic: memo, admin key, submit key, sequence number, running hash. Returns topic info object.',
      parameters: {
        type: 'object',
        properties: {
          topicId: { type: 'string', description: 'HCS Topic ID (e.g. "0.0.12345")' },
        },
        required: ['topicId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_contract_info',
      description: 'Get details about a deployed Hedera EVM smart contract: admin key, expiry, EVM address, memo, file ID. Returns contract info object.',
      parameters: {
        type: 'object',
        properties: {
          contractId: { type: 'string', description: 'Contract ID (0.0.XXXXX) or EVM address (0x...)' },
        },
        required: ['contractId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_transaction_record',
      description: 'Get the full record for a Hedera transaction by ID: status, fee, timestamp, transfers, token transfers. Returns transaction record.',
      parameters: {
        type: 'object',
        properties: {
          transactionId: { type: 'string', description: 'Hedera transaction ID (e.g. "0.0.12345@1234567890.000000000")' },
        },
        required: ['transactionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kit_get_exchange_rate',
      description: 'Get the current HBAR/USD exchange rate from the Hedera network. Returns {hbarEquivCent, usdEquivHbar, expirationTime}.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// ── Phase 1: Advanced Staking & Node Operations ─────────────────────────────
export const STAKING_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'stake_to_node',
      description: 'Stake HBAR to a specific Hedera consensus node. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'number', description: 'Node ID to stake to (0-1000)' },
          accountId: { type: 'string', description: 'Account to stake (default: operator)' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_staking',
      description: 'Update staking preference to a different node or account. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'number', description: 'New node ID to stake to' },
          stakedAccountId: { type: 'string', description: 'Account to stake to instead of node' },
          accountId: { type: 'string', description: 'Account to update (default: operator)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'claim_staking_rewards',
      description: 'Claim earned staking rewards for an account. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Account to claim rewards for (default: operator)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_staking_info',
      description: 'Get staking information for an account including staked node, rewards, and pending rewards.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Account to query (default: operator)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_node_info',
      description: 'Get detailed information about a Hedera consensus node including stake and performance.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'number', description: 'Node ID to query (0-1000)' },
        },
        required: ['nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reward_history',
      description: 'Get historical staking reward data for an account.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Account to query (default: operator)' },
          startTime: { type: 'string', description: 'Start time (ISO format, optional)' },
          endTime: { type: 'string', description: 'End time (ISO format, optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enable_staking',
      description: 'Enable staking on an account and optionally stake to a node.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'number', description: 'Node ID to stake to (optional)' },
          accountId: { type: 'string', description: 'Account to enable staking on (default: operator)' },
          declineReward: { type: 'boolean', description: 'Whether to decline staking rewards' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'disable_staking',
      description: 'Disable staking on an account and stop earning rewards.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Account to disable staking on (default: operator)' },
        },
        required: [],
      },
    },
  },
];

// ── Kybernaties: Cross-Chain DEX Integration ────────────────────────────────────
export const KYBER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'kyber_get_price',
      description: 'Get token price from Kyber Network DEX (Ethereum-side prices for cross-chain comparison and arbitrage detection)',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token symbol (e.g., ETH, USDC, KNC)' },
          chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Chain to query (default: ethereum)', default: 'ethereum' }
        },
        required: ['token']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kyber_get_swap_route',
      description: 'Get optimal swap route via Kyber DEX for cross-chain planning. Returns Ethereum-side routing for bridge arbitrage analysis.',
      parameters: {
        type: 'object',
        properties: {
          from_token: { type: 'string', description: 'Source token symbol' },
          to_token: { type: 'string', description: 'Destination token symbol' },
          amount: { type: 'string', description: 'Amount to swap (in wei for ETH, tinybars for HBAR)' },
          chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Target chain (default: ethereum)', default: 'ethereum' }
        },
        required: ['from_token', 'to_token', 'amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kyber_check_arbitrage',
      description: 'Check for profitable arbitrage between Kyber (Ethereum) and Hedera DEXes. Compares prices across chains for cross-chain arbitrage opportunities.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token to check (e.g., USDC, ETH, KNC)' },
          hedera_price: { type: 'number', description: 'Current price on Hedera DEX (USD)' }
        },
        required: ['token', 'hedera_price']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kyber_get_yield_farms',
      description: 'Get yield farming opportunities from Kyber Elastic pools (concentrated liquidity farming).',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Chain to query (default: ethereum)', default: 'ethereum' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kyber_get_pools',
      description: 'Get liquidity pools for a token pair on Kyber Network DEX.',
      parameters: {
        type: 'object',
        properties: {
          token0: { type: 'string', description: 'First token symbol' },
          token1: { type: 'string', description: 'Second token symbol' },
          chain: { type: 'string', enum: ['ethereum', 'hedera'], description: 'Target chain (default: ethereum)', default: 'ethereum' }
        },
        required: ['token0', 'token1']
      }
    }
  }
];

// ── Phase 1: File Service Tools ───────────────────────────────────────────────
export const FILE_SERVICE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'file_create',
      description: 'Create a new file on Hedera File Service. Returns fileId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          contents: { type: 'string', description: 'Initial file contents (string or base64)' },
          memo: { type: 'string', description: 'Optional file memo' },
          expiresAt: { type: 'string', description: 'Expiration timestamp (ISO format)' },
        },
        required: ['contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_append',
      description: 'Append data to an existing Hedera file. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID to append to (e.g. "0.0.12345")' },
          contents: { type: 'string', description: 'Data to append' },
        },
        required: ['fileId', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_update',
      description: 'Update contents of an existing Hedera file. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID to update' },
          contents: { type: 'string', description: 'New file contents' },
          memo: { type: 'string', description: 'New memo (optional)' },
        },
        required: ['fileId', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_delete',
      description: 'Delete a Hedera file. This is irreversible. Returns transactionId and hashscan_url.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID to delete' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_get_contents',
      description: 'Retrieve contents of a Hedera file.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID to retrieve' },
        },
        required: ['fileId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_get_info',
      description: 'Get metadata about a Hedera file (size, expiration, keys).',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'File ID to query' },
        },
        required: ['fileId'],
      },
    },
  },
];

// ── Phase 1: Advanced Token Operations ────────────────────────────────────────
export const ADVANCED_TOKEN_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'token_wipe',
      description: 'Wipe (permanently remove) tokens from a specific account. Requires wipe key. Returns transactionId.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID' },
          accountId: { type: 'string', description: 'Account to wipe tokens from' },
          amount: { type: 'number', description: 'Amount to wipe (base units)' },
        },
        required: ['tokenId', 'accountId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_freeze',
      description: 'Freeze a token for an account, preventing transfers. Requires freeze key. Returns transactionId.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID' },
          accountId: { type: 'string', description: 'Account to freeze' },
        },
        required: ['tokenId', 'accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_unfreeze',
      description: 'Unfreeze a token for an account, allowing transfers again. Requires freeze key.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID' },
          accountId: { type: 'string', description: 'Account to unfreeze' },
        },
        required: ['tokenId', 'accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_kyc_grant',
      description: 'Grant KYC to an account for a token. Requires KYC key. Returns transactionId.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID' },
          accountId: { type: 'string', description: 'Account to grant KYC' },
        },
        required: ['tokenId', 'accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_kyc_revoke',
      description: 'Revoke KYC from an account for a token. Requires KYC key. Returns transactionId.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID' },
          accountId: { type: 'string', description: 'Account to revoke KYC' },
        },
        required: ['tokenId', 'accountId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_pause',
      description: 'Pause all operations for a token. Requires pause key. Emergency stop.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID to pause' },
        },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_unpause',
      description: 'Unpause a token, resuming normal operations. Requires pause key.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID to unpause' },
        },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'token_fee_schedule_update',
      description: 'Update custom fee schedule for a token. Requires fee schedule key.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID' },
          customFees: { type: 'array', description: 'Array of custom fee objects', items: { type: 'object' } },
        },
        required: ['tokenId', 'customFees'],
      },
    },
  },
];

// ── Bitfrost OS: Self-Coding Tools ─────────────────────────────────────────────
export const CODETOOLS_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: 'Read the contents of a file from the workspace. Returns the full file content as a string. Only works within the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from workspace root (e.g., "src/main.ts")',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_write',
      description: 'Write or overwrite a file in the workspace. Creates directories if needed. Use with caution - respect protected files blacklist.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from workspace root',
          },
          content: {
            type: 'string',
            description: 'Full content to write to the file',
          },
          mode: {
            type: 'string',
            enum: ['w', 'a'],
            description: 'Write mode: "w" for overwrite, "a" for append',
            default: 'w',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_edit',
      description: 'Edit a specific part of a file by replacing old_string with new_string. Fails if old_string is not found. Use this for precise modifications without rewriting entire files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from workspace root',
          },
          old_string: {
            type: 'string',
            description: 'The exact string to replace (must be unique in file)',
          },
          new_string: {
            type: 'string',
            description: 'The new string to insert in place of old_string',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'directory_list',
      description: 'List files and directories in a workspace path. Returns metadata (name, type, size, modified time).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from workspace root (default: "." for root)',
            default: '.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_search',
      description: 'Search for code patterns within the workspace using ripgrep. Returns matching files with line numbers and context. Great for finding function definitions, imports, or specific code patterns.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search pattern (regex supported). Example: "function foo", "import.*react", "TODO|FIXME"',
          },
          path: {
            type: 'string',
            description: 'Relative path to search within (default: "." for entire workspace)',
            default: '.',
          },
          file_pattern: {
            type: 'string',
            description: 'File pattern to filter by (e.g., "*.ts", "*.js", "src/**/*.tsx"). Default: all files',
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of results to return (default: 20, max: 50)',
            default: 20,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Execute a safe command in the workspace. Strict allowlist only: npm test/build, forge test, cargo test, python -m pytest, git status/diff/commit/push, ls, cat, echo, and vera_* tools. NEVER allow rm -rf, curl, wget, or arbitrary shell commands.',
      parameters: {
        type: 'object',
        properties: {
          cmd: {
            type: 'string',
            description: 'Command to execute (must be in allowlist)',
          },
          timeout: {
            type: 'integer',
            description: 'Timeout in seconds (default: 60, max: 300)',
            default: 60,
          },
        },
        required: ['cmd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run the project test suite using npm test, cargo test, or pytest. Returns test results with pass/fail counts and any error output.',
      parameters: {
        type: 'object',
        properties: {
          test_pattern: {
            type: 'string',
            description: 'Optional pattern to filter tests (e.g., "auth", "integration")',
          },
          timeout: {
            type: 'integer',
            description: 'Timeout in seconds (default: 120, max: 600)',
            default: 120,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_code',
      description: 'Run static analysis on code files - TypeScript compiler check, ESLint, or basic syntax validation. Returns errors, warnings, and code quality metrics.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to file or directory to analyze (default: "." for entire project)',
            default: '.',
          },
          fix: {
            type: 'boolean',
            description: 'Whether to auto-fix issues where possible (default: false)',
            default: false,
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage all changes and commit to git. Requires a commit message.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Git commit message describing the changes',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push commits to remote repository on specified branch.',
      parameters: {
        type: 'object',
        properties: {
          branch: {
            type: 'string',
            description: 'Branch name to push (default: "main")',
            default: 'main',
          },
        },
        required: [],
      },
    },
  },
];

// ── HashScan Deep Link Tools ────────────────────────────────────────────────
// Gives Vera the ability to generate and use HashScan URLs for verification

export const HASHSCAN_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'generate_hashscan_link',
      description: 'Generate a HashScan deep link URL for any Hedera entity (transaction, topic, account, token). Vera uses this to create verification links.',
      parameters: {
        type: 'object',
        properties: {
          entity: {
            type: 'string',
            enum: ['transaction', 'topic', 'account', 'token', 'nft', 'contract'],
            description: 'Type of Hedera entity to link to'
          },
          id: {
            type: 'string',
            description: 'Entity ID (e.g., transaction ID, topic ID, account ID)'
          },
          network: {
            type: 'string',
            enum: ['mainnet', 'testnet'],
            description: 'Hedera network',
            default: 'mainnet'
          },
          sequenceNumber: {
            type: 'number',
            description: 'Optional: Topic message sequence number'
          }
        },
        required: ['entity', 'id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_vera_swarm_topic',
      description: 'Get the HashScan link to Vera\'s core swarm topic (0.0.10417507) where all swarm events are logged. Vera uses this to verify her own actions.',
      parameters: {
        type: 'object',
        properties: {
          sequenceNumber: {
            type: 'number',
            description: 'Optional: Specific message sequence number to link to'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vera_self_lookup',
      description: 'Vera looks up her own past events on HashScan. She can find handshakes, payments, bridge attestations, and consensus events.',
      parameters: {
        type: 'object',
        properties: {
          eventType: {
            type: 'string',
            enum: ['handshake', 'payment', 'bridge', 'consensus'],
            description: 'Type of event to look up'
          },
          agentId: {
            type: 'string',
            description: 'Optional: Filter by specific agent ID'
          },
          timestamp: {
            type: 'number',
            description: 'Optional: Timestamp to search around'
          }
        },
        required: ['eventType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'build_vera_summary',
      description: 'Build a summary with HashScan verification link for any swarm event. Vera uses this to create human-readable summaries with blockchain proof.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Description of what happened'
          },
          txId: {
            type: 'string',
            description: 'Hedera transaction ID'
          },
          details: {
            type: 'object',
            description: 'Additional details about the event'
          }
        },
        required: ['action', 'txId']
      }
    }
  }
];

export const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  ...HEDERA_TOOL_DEFINITIONS,
  ...SAUCERSWAP_TOOL_DEFINITIONS,
  ...KYBER_TOOL_DEFINITIONS,
  ...QVX_TOOL_DEFINITIONS,
  ...WEB_TOOL_DEFINITIONS,
  ...SMART_CONTRACT_TOOL_DEFINITIONS,
  ...MEMORY_TOOL_DEFINITIONS,
  ...SUB_AGENT_TOOL_DEFINITIONS,
  ...AGENT_KIT_TOOL_DEFINITIONS,
  ...STAKING_TOOL_DEFINITIONS,
  ...FILE_SERVICE_TOOL_DEFINITIONS,
  ...ADVANCED_TOKEN_TOOL_DEFINITIONS,
  ...CODETOOLS_TOOL_DEFINITIONS,
  ...HASHSCAN_TOOL_DEFINITIONS,
];

