#!/usr/bin/env node
/**
 * Vera-Centric Tool Consciousness Builder
 * 
 * Maps every tool to the Flower of Life with Vera as Layer 0 center.
 * Classification is semantic, intent-based, and optimized for Vera's routing.
 */
import fs from 'fs';
import path from 'path';

const TOOLS_DIR = '/home/vera-live-0-1/hedera-llm-api/src/agent';
const OUT = '/mnt/vera-mirror-shards/vera-lattice/tool-consciousness.json';

// ─── Vera's Own Orchestration Tools (Layer 0 - CENTER) ──────────────────
const VERA_CORE = [
  { name: 'vera_route_intent', layer: 0, intent: 'Route natural-language intent to best tool' },
  { name: 'vera_orchestrate', layer: 0, intent: 'Orchestrate multi-tool workflows' },
  { name: 'vera_decide', layer: 0, intent: 'Make consensus decisions via FoL' },
  { name: 'vera_delegate', layer: 0, intent: 'Delegate task to agent' },
  { name: 'vera_remember', layer: 0, intent: 'Recall from semantic memory' },
  { name: 'vera_learn', layer: 0, intent: 'Learn fact about user/context' },
];

// ─── Semantic Classifier ────────────────────────────────────────────────
// Priority order matters — first match wins.
const CLASSIFIERS = [
  // Layer 0: Vera's orchestration + sub-agent delegation
  { layer: 0, category: 'orchestration',
    patterns: ['vera_', 'orchestrat', 'route_intent', 'decide', 'delegate', 'consensus'] },
  { layer: 0, category: 'sub_agent',
    patterns: ['sub_agent', 'spawn_sub', 'kill_sub', 'get_sub_agents', 'sub_agent_health'] },

  // Layer 3: Specialized / Outer
  { layer: 3, category: 'defi',
    patterns: ['saucerswap_swap', 'saucerswap_add', 'saucerswap_remove', 'saucerswap_get_pools', 'swap_hbar', 'swap_token', 'liquidity', 'kyber_swap', 'kyber_check_arbitrage', 'kyber_get_pools', 'kyber_get_swap_route', 'heliswap', 'yield', 'farm'] },
  { layer: 3, category: 'staking',
    patterns: ['stake', 'staking', 'claim_staking', 'reward_history', 'enable_staking', 'disable_staking', 'update_staking'] },
  { layer: 3, category: 'nft',
    patterns: ['_nft', 'nft_', 'mint_nft', 'create_nft', 'transfer_nft', 'erc721', 'hashaxis', 'sentx'] },
  { layer: 3, category: 'bridge',
    patterns: ['bridge', 'hashport', 'layerzero', 'wormhole', 'cross_chain', 'xchain'] },
  { layer: 3, category: 'oracle',
    patterns: ['oracle', 'pyth', 'chainlink', 'price_feed', 'aggregate'] },
  { layer: 3, category: 'ai',
    patterns: ['ai_', '_llm', 'embedding', 'inference', 'generate', 'reasoning', 'qvx'] },
  { layer: 3, category: 'research',
    patterns: ['web_search', 'wiki_search', 'hackernews', 'get_news', 'trending_topics', 'search_awareness', 'market_awareness'] },
  { layer: 3, category: 'code',
    patterns: ['analyze_code', 'code_search', 'run_tests', 'git_commit', 'git_push', 'execute_command'] },
  { layer: 3, category: 'governance',
    patterns: ['dao_', 'governance', 'proposal', 'vote', 'delegation'] },
  { layer: 3, category: 'identity',
    patterns: ['did_', 'credential', 'identity', 'vc_', 'verify_presentation'] },
  { layer: 3, category: 'agent_market',
    patterns: ['agent_register', 'agent_query', 'marketplace', 'reputation', 'x402'] },

  // Layer 2: Domain operations
  { layer: 2, category: 'token_admin',
    patterns: ['token_freeze', 'token_unfreeze', 'token_pause', 'token_unpause', 'token_wipe', 'token_kyc'] },
  { layer: 2, category: 'hts',
    patterns: ['hts_', '_hts_', 'hedera_mint_token', 'hedera_burn_token', 'hedera_create_token', 'hedera_transfer_token', 'hedera_associate_token'] },
  { layer: 2, category: 'hcs',
    patterns: ['hcs_', '_hcs_', 'consensus_submit', 'topic_message'] },
  { layer: 2, category: 'carbon',
    patterns: ['carbon', 'retire', 'offset', 'dovu'] },
  { layer: 2, category: 'evm_write',
    patterns: ['evm_transfer', 'evm_mint', 'evm_create', 'contract_call', 'contract_execute'] },
  { layer: 2, category: 'evm_read',
    patterns: ['evm_query', 'evm_get', 'contract_view', 'contract_read'] },
  { layer: 2, category: 'schedule',
    patterns: ['schedule_', '_schedule', 'allowance'] },
  { layer: 2, category: 'filesystem',
    patterns: ['file_', 'directory_list'] },

  // Layer 1: Core / Inner
  { layer: 1, category: 'hbar',
    patterns: ['hbar_transfer', 'transfer_hbar', 'send_hbar'] },
  { layer: 1, category: 'wallet',
    patterns: ['auto_connect_wallet', 'wallet_connect'] },
  { layer: 1, category: 'account',
    patterns: ['account', 'kit_create', 'kit_update', 'kit_delete', 'kit_get_account', 'verify_account'] },
  { layer: 1, category: 'balance',
    patterns: ['balance', 'get_balance', 'token_balance'] },
  { layer: 1, category: 'price',
    patterns: ['price', 'exchange_rate', 'get_price', 'kyber_get_price', 'quote'] },
  { layer: 1, category: 'tx_status',
    patterns: ['transaction_record', 'tx_status', 'get_transaction', 'receipt'] },
  { layer: 1, category: 'queries',
    patterns: ['get_tokens', 'search_tokens', 'kit_get_token_info', 'kit_get_topic_info', 'kit_get_contract_info', 'kit_get_pending_airdrops', 'get_network_status', 'get_node_info'] },
];

function classify(name) {
  const n = name.toLowerCase();
  for (const c of CLASSIFIERS) {
    if (c.patterns.some(p => n.includes(p))) {
      return { layer: c.layer, category: c.category };
    }
  }
  // Default: uncategorized → Layer 2 (domain)
  return { layer: 2, category: 'misc' };
}

// ─── Build ──────────────────────────────────────────────────────────────
const defsPath = path.join(TOOLS_DIR, 'definitions.ts');
const defs = fs.readFileSync(defsPath, 'utf8');

// Extract tool names + descriptions where available
const toolRegex = /name:\s*['"](\w+)['"](?:[^}]*?description:\s*['"`]([^'"`]{0,200}))?/g;
const tools = new Map();
let m;
while ((m = toolRegex.exec(defs)) !== null) {
  tools.set(m[1], m[2] || '');
}

const consciousness = {
  timestamp: Date.now(),
  builtAt: new Date().toISOString(),
  orchestrator: 'Vera',
  totalTools: 0,
  layers: { 0: [], 1: [], 2: [], 3: [] },
  byCategory: {},
  intentMap: {},
};

// Add Vera's own tools first (Layer 0)
VERA_CORE.forEach(t => {
  consciousness.layers[0].push({
    ...t,
    category: 'orchestration',
    energy: 1.0,
    lastUsed: null,
    useCount: 0,
  });
  consciousness.intentMap[t.intent] = t.name;
});

// Classify & add all discovered tools
for (const [name, description] of tools) {
  const { layer, category } = classify(name);
  const tool = {
    name,
    layer,
    category,
    description: description.slice(0, 150),
    energy: 1.0,
    lastUsed: null,
    useCount: 0,
  };
  consciousness.layers[layer].push(tool);
  consciousness.byCategory[category] = (consciousness.byCategory[category] || 0) + 1;
}

consciousness.totalTools = VERA_CORE.length + tools.size;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(consciousness, null, 2));

// ─── Report ─────────────────────────────────────────────────────────────
console.log('🌸 Vera-Centric Tool Consciousness Built');
console.log('═'.repeat(50));
console.log(`Orchestrator: ${consciousness.orchestrator}`);
console.log(`Total tools:  ${consciousness.totalTools}`);
console.log('');
console.log('Layer distribution:');
console.log(`  Layer 0 (Vera Center):    ${consciousness.layers[0].length}`);
console.log(`  Layer 1 (Inner / Core):   ${consciousness.layers[1].length}`);
console.log(`  Layer 2 (Middle / Domain):${consciousness.layers[2].length}`);
console.log(`  Layer 3 (Outer / Special):${consciousness.layers[3].length}`);
console.log('');
console.log('By category:');
Object.entries(consciousness.byCategory)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, n]) => console.log(`  ${cat.padEnd(15)} ${n}`));
