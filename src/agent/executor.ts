import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  getAccountInfo,
  getAccountBalance,
  getAccountTokens,
  getTransactionById,
  getHcsMessages,
  searchTokens,
} from '../hedera/mirrorApi.js';
import { getPools, getTokenPrice, getPriceChart } from '../hedera/saucerswap.js';
import { qvxClient } from '../qvx/client.js';
import { storePendingTx, PENDING_TX_SENTINEL } from '../hedera/txApproval.js';
import { verifyAccount, generateAccountProof } from '../hedera/accountVerifier.js';
import { agentLearningSystem } from './learningSystem.js';
import { veraLatticeSwarm } from '../swarm/latticeSwarm.js';
import { recordToolUsage } from '../vera/toolConsciousness.js';
import { recordToolCall } from '../vera/toolEdges.js';
import { recordHealth } from '../vera/toolHealth.js';

// ── Bitfrost OS: Self-Coding Configuration ───────────────────────────────────
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/home/vera-live-0-1/workspace/windsurf-area';

// Blacklist of protected paths that Vera cannot modify
const PROTECTED_PATHS = [
  'src/agent/core',
  'src/agent/executor.ts',
  'src/agent/definitions.ts',
  'src/config.ts',
  '.env',
  'package.json',
  'tsconfig.json',
  'Dockerfile',
  'docker-compose.yml',
  'vera-chat-server.mjs',
  'node_modules',
  '.git',
];

function isProtectedPath(filePath: string): boolean {
  return PROTECTED_PATHS.some(protectedPath => 
    filePath.includes(protectedPath) || filePath.startsWith(protectedPath)
  );
}

// Strict allowlist for safe commands
const ALLOWED_COMMANDS = [
  /^npm test$/,
  /^npm run (build|dev|start|lint|format)$/,
  /^npm install.*$/,
  /^forge test.*$/,
  /^forge build.*$/,
  /^cargo test.*$/,
  /^cargo build.*$/,
  /^python -m pytest.*$/,
  /^python.*$/,
  /^git status$/,
  /^git diff.*$/,
  /^git log.*$/,
  /^ls.*$/,
  /^cat.*$/,
  /^echo.*$/,
  /^vera_.*$/,
] as RegExp[];

function isAllowedCommand(cmd: string): boolean {
  return ALLOWED_COMMANDS.some(pattern => pattern.test(cmd));
}

// Audit log for all file operations
function auditLog(entry: { tool: string; [key: string]: unknown }): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  // Append to audit log file
  const logPath = path.join(WORKSPACE_ROOT, '.vera-audit.log');
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
}

function queue(tool: string, args: Record<string, unknown>, label: string, details: Record<string, unknown>): string {
  const txId = storePendingTx(tool, args, label, details);
  return JSON.stringify({ [PENDING_TX_SENTINEL]: true, txId, tool, label, details });
}

// Read-only tools that can be deduplicated across concurrent agents
const READ_ONLY_TOOLS = new Set([
  'hedera_get_account_info',
  'hedera_get_balance',
  'hedera_get_tokens',
  'hedera_search_tokens',
  'hedera_get_transaction',
  'hedera_hcs_get_messages',
  'saucerswap_get_pools',
  'saucerswap_get_token_price',
  'get_price_chart',
  'qvx_get_node_status',
  'qvx_get_node_metrics',
  'qvx_get_positions',
  'qvx_get_signals',
  'qvx_get_pnl',
  'qvx_get_strategy_state',
  'qvx_get_market_analysis',
  'qvx_get_learning_state',
  'qvx_get_trade_history',
  'kit_get_token_balances',
  'kit_get_pending_airdrops',
  'kit_get_topic_info',
  'kit_get_contract_info',
  'kit_get_transaction_record',
  'kit_get_exchange_rate',
  'web_search',
  'get_news',
  'wiki_search',
  'hackernews_search',
]);

// Lightweight in-flight deduplicator (500ms window)
const inFlightQueries = new Map<string, Promise<string>>();
function dedupeKey(tool: string, args: Record<string, unknown>): string {
  return `${tool}:${JSON.stringify(args)}`;
}

/**
 * Execute a tool with learning system tracking.
 * Read-only queries are deduplicated across concurrent agents to reduce
 * mirror-node / API load.
 */
export async function executeTool(name: string, args: Record<string, unknown>, agentId?: string): Promise<string> {
  const startTime = Date.now();
  let success = true;
  let error: string | undefined;
  let result: string;

  let cached = false;

  try {
    // Deduplicate read-only queries via canonical swarm deduper; fallback to local
    if (READ_ONLY_TOOLS.has(name)) {
      try {
        const deduped = await veraLatticeSwarm.dedupeQuery(name, args, () => executeToolInternal(name, args));
        result = deduped.result;
        cached = deduped.cached;
      } catch {
        // Fallback: lightweight local map if swarm unavailable
        const key = dedupeKey(name, args);
        const existing = inFlightQueries.get(key);
        if (existing) {
          result = await existing;
          cached = true;
        } else {
          const promise = executeToolInternal(name, args);
          inFlightQueries.set(key, promise);
          setTimeout(() => inFlightQueries.delete(key), 500);
          result = await promise;
          cached = false;
        }
      }
    } else {
      result = await executeToolInternal(name, args);
    }

    // Check if result contains an error
    const parsed = JSON.parse(result);
    if (parsed.error) {
      success = false;
      error = parsed.error;
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    result = JSON.stringify({ error });
  }

  // Skip learning tracking on dedup cache hits to keep metrics clean
  if (!cached) {
    // Update Vera's tool consciousness (Flower of Life energy tracking)
    try { recordToolUsage(name); } catch {}
    try { recordToolCall(name); } catch {}
    try { recordHealth(name, success, Date.now() - startTime, error); } catch {}

    // Temporal pattern learning (when tools are used)
    try {
      const { recordTemporalUsage } = await import('../vera/temporalPatterns.js');
      recordTemporalUsage(name, Date.now() - startTime);
    } catch {}

    // Economic tracking (HBAR cost per tool)
    try {
      const { recordToolCost } = await import('../vera/economicTracker.js');
      recordToolCost(name);
    } catch {}

    // Insights logging for HCS (minutely aggregated)
    try {
      const { recordToolExecution } = await import('../vera/logging/veraInsightsLogger.js');
      recordToolExecution(name, success);
    } catch {}

    // Record tool usage for learning (always — fall back to 'vera-default' if no agentId)
    agentLearningSystem.recordToolUsage({
      toolName: name,
      agentId: agentId ?? 'vera-default',
      input: JSON.stringify(args).slice(0, 500),
      output: result.slice(0, 500),
      success,
      error,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
  }

  return result;
}

/**
 * Internal tool execution (original implementation)
 */
async function executeToolInternal(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'hedera_get_account_info': {
        const result = await getAccountInfo(args['account_id'] as string);
        return JSON.stringify(result, null, 2);
      }

      case 'hedera_get_balance': {
        const result = await getAccountBalance(args['account_id'] as string);
        return JSON.stringify(result, null, 2);
      }

      case 'hedera_get_tokens': {
        const result = await getAccountTokens(args['account_id'] as string);
        return JSON.stringify(result, null, 2);
      }

      case 'hedera_transfer_hbar': {
        return queue(name, args,
          `Transfer ${args['amount_hbar']} HBAR → ${args['to_account_id']}`,
          { to: args['to_account_id'], amount_hbar: args['amount_hbar'], memo: args['memo'] ?? null });
      }

      case 'hedera_mint_token': {
        return queue(name, args,
          `Mint ${args['amount']} of token ${args['token_id']}`,
          { token_id: args['token_id'], amount: args['amount'] });
      }

      case 'hedera_burn_token': {
        return queue(name, args,
          `Burn ${args['amount']} of token ${args['token_id']}`,
          { token_id: args['token_id'], amount: args['amount'] });
      }

      case 'hedera_transfer_token': {
        return queue(name, args,
          `Transfer ${args['amount']} of token ${args['token_id']} → ${args['to_account_id']}`,
          { token_id: args['token_id'], to: args['to_account_id'], amount: args['amount'] });
      }

      case 'hedera_associate_token': {
        return queue(name, args,
          `Associate token ${args['token_id']} with account`,
          { token_id: args['token_id'], account_id: args['account_id'] ?? 'operator' });
      }

      case 'hedera_create_nft_collection': {
        return queue(name, args,
          `Create NFT collection "${args['name']}" (${args['symbol']})`,
          { name: args['name'], symbol: args['symbol'], max_supply: args['max_supply'] ?? '∞' });
      }

      case 'hedera_mint_nft': {
        return queue(name, args,
          `Mint NFT in collection ${args['token_id']}`,
          { token_id: args['token_id'], metadata: args['metadata'] });
      }

      case 'hedera_transfer_nft': {
        return queue(name, args,
          `Transfer NFT ${args['token_id']} #${args['serial_number']} → ${args['to_account_id']}`,
          { token_id: args['token_id'], serial: args['serial_number'], to: args['to_account_id'] });
      }

      case 'hedera_create_account': {
        return queue(name, args,
          `Create new Hedera account (seed ${args['initial_hbar'] ?? 1} HBAR)`,
          { initial_hbar: args['initial_hbar'] ?? 1, memo: args['memo'] ?? null });
      }

      case 'hedera_create_token': {
        return queue(name, args,
          `Create HTS token "${args['name']}" (${args['symbol']})`,
          { name: args['name'], symbol: args['symbol'], decimals: args['decimals'] ?? 8, initial_supply: args['initial_supply'] ?? 0 });
      }

      case 'hedera_hcs_send_message': {
        const topicId = (args['topic_id'] as string | undefined) ?? config.HCS_TOPIC_ID;
        if (!topicId) return JSON.stringify({ error: 'No topic_id provided and HCS_TOPIC_ID is not configured.' });
        return queue(name, { ...args, topic_id: topicId },
          `Post HCS message to topic ${topicId}`,
          { topic_id: topicId, message: args['message'] });
      }

      case 'hedera_search_tokens': {
        const results = await searchTokens(
          args['query'] as string,
          typeof args['limit'] === 'number' ? args['limit'] : 10,
        );
        // Wrap in envelope so planner can thread with {{stepN.tokens.0.token_id}}
        return JSON.stringify({ tokens: results, count: results.length }, null, 2);
      }

      case 'hedera_hcs_get_messages': {
        const topicId = (args['topic_id'] as string | undefined) ?? config.HCS_TOPIC_ID;
        if (!topicId) {
          return JSON.stringify({ error: 'No topic_id provided and HCS_TOPIC_ID is not configured.' });
        }
        const limit = typeof args['limit'] === 'number' ? Math.min(args['limit'], 100) : 25;
        const result = await getHcsMessages(topicId, limit);
        return JSON.stringify(result, null, 2);
      }

      case 'hedera_get_transaction': {
        const result = await getTransactionById(args['tx_id'] as string);
        return JSON.stringify(result, null, 2);
      }

      case 'saucerswap_get_pools': {
        const result = await getPools(args['limit'] as number | undefined);
        return JSON.stringify(result, null, 2);
      }

      case 'saucerswap_get_token_price': {
        const result = await getTokenPrice(args['token_id'] as string);
        return JSON.stringify(result, null, 2);
      }

      case 'get_price_chart': {
        const result = await getPriceChart({
          token:  args['token']  as string,
          period: args['period'] as string | undefined,
        });
        // Return the summary text for Vera to read + full data as __chart__ for runner to intercept
        return JSON.stringify({ __chart__: true, ...result });
      }

      case 'saucerswap_swap_hbar_for_token': {
        return queue(name, args,
          `Swap ${args['hbar_amount']} HBAR → token ${args['token_id']} on SaucerSwap`,
          { hbar_in: args['hbar_amount'], token_id: args['token_id'], min_out: args['min_token_out'], slippage: `${((args['slippage'] as number ?? 0.005) * 100).toFixed(1)}%` });
      }

      case 'saucerswap_swap_token_for_hbar': {
        return queue(name, args,
          `Swap ${args['token_amount']} of token ${args['token_id']} → HBAR on SaucerSwap`,
          { token_id: args['token_id'], token_in: args['token_amount'], min_hbar_out: args['min_hbar_out'] });
      }

      case 'saucerswap_add_liquidity': {
        return queue(name, args,
          `Add liquidity: ${args['hbar_amount']} HBAR + ${args['token_amount']} of ${args['token_id']}`,
          { hbar: args['hbar_amount'], token_id: args['token_id'], token_amount: args['token_amount'] });
      }

      case 'saucerswap_remove_liquidity': {
        return queue(name, args,
          `Remove liquidity: burn ${args['lp_amount']} LP of ${args['token_id']}`,
          { token_id: args['token_id'], lp_amount: args['lp_amount'], min_hbar: args['min_hbar'] });
      }

      case 'qvx_get_node_status': {
        const result = await qvxClient.getNodeStatus();
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_node_metrics': {
        const result = await qvxClient.getNodeMetrics();
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_positions': {
        const result = await qvxClient.getPositions();
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_signals': {
        const result = await qvxClient.getSignals({
          market: args['market'] as string | undefined,
          limit:  args['limit']  as number | undefined,
        });
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_pnl': {
        const result = await qvxClient.getPnl({
          period: args['period'] as string | undefined,
        });
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_strategy_state': {
        const result = await qvxClient.getStrategyState();
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_market_analysis': {
        const result = await qvxClient.getMarketAnalysis({
          market:    args['market']    as string,
          timeframe: args['timeframe'] as string | undefined,
        });
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_learning_state': {
        const result = await qvxClient.getLearningState();
        return JSON.stringify(result, null, 2);
      }

      case 'qvx_get_trade_history': {
        const result = await qvxClient.getTradeHistory({
          limit:  args['limit']  as number | undefined,
          market: args['market'] as string | undefined,
        });
        return JSON.stringify(result, null, 2);
      }

      case 'web_search': {
        const query      = args['query'] as string;
        const maxResults = Math.min((args['max_results'] as number | undefined) ?? 5, 10);
        const { default: axios } = await import('axios');

        // DuckDuckGo Instant Answer API — free, no key required
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const { data } = await axios.get<{
          AbstractText?: string; AbstractURL?: string; Heading?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
          Answer?: string; Definition?: string;
        }>(ddgUrl, { timeout: 10_000, headers: { 'User-Agent': 'Vera/1.0 (+https://veralattice.com)' } });

        const results: Array<{ title: string; url: string; snippet: string }> = [];

        if (data.Answer)         results.push({ title: 'Direct Answer', url: '', snippet: data.Answer });
        if (data.AbstractText)   results.push({ title: data.Heading ?? query, url: data.AbstractURL ?? '', snippet: data.AbstractText });
        if (data.Definition)     results.push({ title: `Definition: ${data.Heading ?? query}`, url: '', snippet: data.Definition });

        for (const topic of (data.RelatedTopics ?? [])) {
          if (results.length >= maxResults) break;
          if (topic.Text && topic.FirstURL) {
            results.push({ title: topic.Text.split(' - ')[0] ?? '', url: topic.FirstURL, snippet: topic.Text });
          }
          // Handle nested topic groups
          for (const sub of (topic.Topics ?? [])) {
            if (results.length >= maxResults) break;
            if (sub.Text && sub.FirstURL) {
              results.push({ title: sub.Text.split(' - ')[0] ?? '', url: sub.FirstURL, snippet: sub.Text });
            }
          }
        }

        return JSON.stringify({
          query,
          source: 'DuckDuckGo Instant Answer',
          result_count: results.length,
          results: results.slice(0, maxResults),
          note: results.length === 0 ? 'No instant answer found. Consider using get_news for recent events.' : undefined,
        }, null, 2);
      }

      case 'wiki_search': {
        const query     = args['query'] as string;
        const sentences = Math.min((args['sentences'] as number | undefined) ?? 8, 20);
        const { default: axios } = await import('axios');

        // Wikipedia REST API — free, no key required
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
        const { data: searchData } = await axios.get<{
          query: { search: Array<{ title: string; snippet: string; pageid: number }> }
        }>(searchUrl, { timeout: 10_000, headers: { 'User-Agent': 'Vera/1.0 (+https://veralattice.com)' } });

        const hits = searchData.query?.search ?? [];
        if (hits.length === 0) return JSON.stringify({ query, result: null, note: 'No Wikipedia article found.' });

        const top = hits[0];
        // Fetch full intro extract
        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&exsentences=${sentences}&explaintext&titles=${encodeURIComponent(top.title)}&format=json&origin=*`;
        const { data: extractData } = await axios.get<{
          query: { pages: Record<string, { title: string; extract: string; pageid: number }> }
        }>(extractUrl, { timeout: 10_000, headers: { 'User-Agent': 'Vera/1.0 (+https://veralattice.com)' } });

        const pages  = Object.values(extractData.query?.pages ?? {});
        const page   = pages[0];
        const related = hits.slice(1).map(h => ({ title: h.title, snippet: h.snippet.replace(/<[^>]+>/g, '') }));

        return JSON.stringify({
          query,
          title:   page?.title ?? top.title,
          summary: page?.extract ?? '',
          url:     `https://en.wikipedia.org/wiki/${encodeURIComponent(page?.title ?? top.title)}`,
          related,
        }, null, 2);
      }

      case 'hackernews_search': {
        const query = args['query'] as string;
        const limit = Math.min((args['limit'] as number | undefined) ?? 8, 20);
        const { default: axios } = await import('axios');

        // Algolia HN Search API — free, no key required
        const hnUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
        const { data } = await axios.get<{
          hits: Array<{
            objectID: string; title: string; url?: string; author: string;
            points: number; num_comments: number; created_at: string; story_text?: string;
          }>;
        }>(hnUrl, { timeout: 10_000, headers: { 'User-Agent': 'Vera/1.0 (+https://veralattice.com)' } });

        const stories = (data.hits ?? []).map(h => ({
          title:     h.title,
          url:       h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
          hn_url:    `https://news.ycombinator.com/item?id=${h.objectID}`,
          author:    h.author,
          points:    h.points,
          comments:  h.num_comments,
          posted:    h.created_at,
          excerpt:   h.story_text ? h.story_text.replace(/<[^>]+>/g, '').slice(0, 200) : undefined,
        }));

        return JSON.stringify({
          query,
          source: 'Hacker News (via Algolia)',
          story_count: stories.length,
          stories,
        }, null, 2);
      }

      case 'get_news': {
        const topic = args['topic'] as string;
        const limit = Math.min((args['limit'] as number | undefined) ?? 8, 15);
        const { default: axios } = await import('axios');

        // Google News RSS — free, no key required
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
        const { data: xml } = await axios.get<string>(rssUrl, {
          timeout: 12_000,
          headers: { 'User-Agent': 'Vera/1.0 (+https://veralattice.com)', Accept: 'application/rss+xml' },
          responseType: 'text',
        });

        // Parse RSS items with regex (no XML library needed)
        const itemRe = /<item>([\s\S]*?)<\/item>/g;
        const titleRe = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
        const descRe  = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;
        const linkRe  = /<link>(.*?)<\/link>/;
        const pubRe   = /<pubDate>(.*?)<\/pubDate>/;
        const sourceRe= /<source[^>]*>(.*?)<\/source>/;

        const articles: Array<{ title: string; source: string; published: string; url: string; summary: string }> = [];
        let match: RegExpExecArray | null;

        while ((match = itemRe.exec(xml)) !== null && articles.length < limit) {
          const item     = match[1];
          const title    = (titleRe.exec(item)?.[1] ?? titleRe.exec(item)?.[2] ?? '').trim();
          const desc     = (descRe.exec(item)?.[1]  ?? descRe.exec(item)?.[2]  ?? '').trim();
          const url      = (linkRe.exec(item)?.[1]  ?? '').trim();
          const pubDate  = (pubRe.exec(item)?.[1]   ?? '').trim();
          const source   = (sourceRe.exec(item)?.[1]?? '').trim();
          // Strip HTML tags from description
          const summary  = desc.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
          if (title) articles.push({ title, source, published: pubDate, url, summary: summary.slice(0, 300) });
        }

        return JSON.stringify({
          topic,
          fetched_at: new Date().toISOString(),
          article_count: articles.length,
          articles,
        }, null, 2);
      }

      case 'vera_compile_contract': {
        const sourceCode    = args['source_code'] as string;
        const contractName  = args['contract_name'] as string;
        if (!sourceCode || !sourceCode.trim()) return JSON.stringify({ error: 'source_code is required and cannot be empty' });
        if (!contractName || !contractName.trim()) return JSON.stringify({ error: 'contract_name is required (must match the contract name in the Solidity source)' });
        // Dynamic import keeps solc out of the critical path
        const solc = await import('solc');
        const input = JSON.stringify({
          language: 'Solidity',
          sources: { 'Contract.sol': { content: sourceCode } },
          settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
        });
        const raw = (solc as unknown as { compile: (i: string) => string }).compile(input);
        const output = JSON.parse(raw) as {
          errors?: Array<{ severity: string; formattedMessage: string }>;
          contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
        };
        const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
        if (errors.length) {
          return JSON.stringify({ success: false, errors: errors.map((e) => e.formattedMessage) });
        }
        const contracts = output.contracts?.['Contract.sol'] ?? {};
        const available = Object.keys(contracts);
        // Auto-detect: if contract_name doesn't match but there's exactly one compiled contract, use it
        const resolvedName = contracts[contractName]
          ? contractName
          : (available.length === 1 ? available[0] : null);
        if (!resolvedName) {
          return JSON.stringify({ success: false, error: `Contract "${contractName}" not found. Available: ${available.join(', ')}` });
        }
        const contract = contracts[resolvedName];
        const solcVersion = (solc as unknown as { version: () => string }).version?.() ?? 'unknown';
        return JSON.stringify({
          success: true,
          contract_name: resolvedName,
          compiler: solcVersion,
          abi:      contract.abi,
          bytecode: contract.evm.bytecode.object,
          warnings: (output.errors ?? []).filter((e) => e.severity !== 'error').map((e) => e.formattedMessage),
        }, null, 2);
      }

      case 'vera_deploy_contract': {
        if (!args['bytecode']) return JSON.stringify({ error: 'bytecode is required — call vera_compile_contract first to get the bytecode' });
        if (!args['abi']) return JSON.stringify({ error: 'abi is required — call vera_compile_contract first to get the ABI' });
        const bytecode       = (args['bytecode'] as string).startsWith('0x') ? args['bytecode'] as string : `0x${args['bytecode']}`;
        const abiRaw         = args['abi'];
        const abi            = (typeof abiRaw === 'string' ? JSON.parse(abiRaw) : abiRaw) as unknown[];
        const constructorArgs = (args['constructor_args'] as unknown[]) ?? [];
        const gasLimit       = (args['gas_limit'] as number) ?? 500_000;

        if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
          return JSON.stringify({ error: 'Deployment requires HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY in .env' });
        }

        const { Client, ContractCreateFlow, ContractFunctionParameters } = await import('@hashgraph/sdk');
        const client = config.HEDERA_NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
        client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, config.HEDERA_OPERATOR_PRIVATE_KEY);

        // Build constructor parameters from ABI
        const ctorAbi = (abi as Array<{ type: string; inputs: Array<{ type: string }> }>)
          .find((x) => x.type === 'constructor');
        let params: InstanceType<typeof ContractFunctionParameters> | undefined;
        if (ctorAbi && constructorArgs.length > 0) {
          params = new ContractFunctionParameters();
          ctorAbi.inputs.forEach((inp, i) => {
            const val = constructorArgs[i];
            const p = params as InstanceType<typeof ContractFunctionParameters>;
            const t = inp.type;
            if (t === 'string')              p.addString(String(val));
            else if (t === 'address')        p.addAddress(String(val));
            else if (t === 'bool')           p.addBool(val === true || val === 'true' || val === 1);
            else if (t === 'bytes32')        p.addBytes32(Buffer.from(String(val), 'hex').subarray(0, 32) as unknown as Uint8Array);
            else if (t === 'bytes')          p.addBytes(Buffer.from(String(val), 'hex') as unknown as Uint8Array);
            else if (/^uint\d*$/.test(t))    p.addUint256(BigInt(String(val)) as unknown as Parameters<typeof p.addUint256>[0]);
            else if (/^int\d*$/.test(t))     p.addInt256(BigInt(String(val)) as unknown as Parameters<typeof p.addInt256>[0]);
            else if (/^uint\d*(\[\d*\])+$/.test(t)) p.addUint256Array((val as unknown[]).map((v) => BigInt(String(v))) as unknown as Parameters<typeof p.addUint256Array>[0]);
            else if (/^int\d*(\[\d*\])+$/.test(t))  p.addInt256Array((val as unknown[]).map((v) => BigInt(String(v))) as unknown as Parameters<typeof p.addInt256Array>[0]);
            else if (/^address(\[\d*\])+$/.test(t))  p.addAddressArray(val as string[]);
            else if (/^string(\[\d*\])+$/.test(t))   p.addStringArray((val as string[]).map(String));
            else if (/^bytes32(\[\d*\])+$/.test(t))  p.addBytes32Array((val as string[]).map((v) => Buffer.from(String(v), 'hex').subarray(0, 32) as unknown as Uint8Array));
          });
        }

        const flow = new ContractCreateFlow()
          .setBytecode(bytecode)
          .setGas(gasLimit);
        if (params) flow.setConstructorParameters(params);

        const receipt = await (await flow.execute(client)).getReceipt(client);
        const contractId = receipt.contractId;
        client.close();

        return JSON.stringify({
          success: true,
          contract_id:      contractId?.toString(),
          contract_address: `0x${contractId?.toSolidityAddress()}`,
          network: config.HEDERA_NETWORK,
          hashscan_url: `https://hashscan.io/${config.HEDERA_NETWORK}/contract/${contractId?.toString()}`,
        }, null, 2);
      }

      case 'vera_call_contract': {
        if (!args['contract_id']) return JSON.stringify({ error: 'contract_id is required (0.0.XXXXX or 0x... EVM address)' });
        if (!args['abi']) return JSON.stringify({ error: 'abi is required — pass the ABI array from vera_compile_contract' });
        if (!args['function_name']) return JSON.stringify({ error: 'function_name is required (name of the Solidity function to call)' });
        const contractIdRaw = args['contract_id'] as string;
        const abiRawCall    = args['abi'];
        const abi           = (typeof abiRawCall === 'string' ? JSON.parse(abiRawCall) : abiRawCall) as Array<{ type: string; name: string; inputs: Array<{ type: string }>; outputs?: Array<{ type: string }> }>;
        const functionName  = args['function_name'] as string;
        const callArgs      = (args['args'] as unknown[]) ?? [];
        const gasLimit      = (args['gas_limit'] as number) ?? 100_000;
        const readOnly      = (args['read_only'] as boolean) ?? false;

        if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
          return JSON.stringify({ error: 'Contract call requires HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY' });
        }

        const { Client, ContractCallQuery, ContractExecuteTransaction, ContractFunctionParameters, ContractId } = await import('@hashgraph/sdk');
        const client = config.HEDERA_NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
        client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, config.HEDERA_OPERATOR_PRIVATE_KEY);

        const contractId = contractIdRaw.startsWith('0x')
          ? ContractId.fromEvmAddress(0, 0, contractIdRaw)
          : ContractId.fromString(contractIdRaw);

        const fnAbi = abi.find((x) => x.type === 'function' && x.name === functionName);
        const params = new ContractFunctionParameters();
        if (fnAbi && callArgs.length > 0) {
          fnAbi.inputs.forEach((inp, i) => {
            const val = callArgs[i];
            const t = inp.type;
            // Scalar types
            if (t === 'string')              params.addString(String(val));
            else if (t === 'address')        params.addAddress(String(val));
            else if (t === 'bool')           params.addBool(val === true || val === 'true' || val === 1);
            else if (t === 'bytes32')        params.addBytes32(Buffer.from(String(val), 'hex').subarray(0, 32) as unknown as Uint8Array);
            else if (t === 'bytes')          params.addBytes(Buffer.from(String(val), 'hex') as unknown as Uint8Array);
            else if (/^uint\d*$/.test(t))    params.addUint256(BigInt(String(val)) as unknown as Parameters<typeof params.addUint256>[0]);
            else if (/^int\d*$/.test(t))     params.addInt256(BigInt(String(val)) as unknown as Parameters<typeof params.addInt256>[0]);
            // Array types
            else if (/^uint\d*(\[\d*\])+$/.test(t)) params.addUint256Array((val as unknown[]).map((v) => BigInt(String(v))) as unknown as Parameters<typeof params.addUint256Array>[0]);
            else if (/^int\d*(\[\d*\])+$/.test(t))  params.addInt256Array((val as unknown[]).map((v) => BigInt(String(v))) as unknown as Parameters<typeof params.addInt256Array>[0]);
            else if (/^address(\[\d*\])+$/.test(t))  params.addAddressArray(val as string[]);
            else if (/^string(\[\d*\])+$/.test(t))   params.addStringArray((val as string[]).map(String));
            else if (/^bytes32(\[\d*\])+$/.test(t))  params.addBytes32Array((val as string[]).map((v) => Buffer.from(String(v), 'hex').subarray(0, 32) as unknown as Uint8Array));
          });
        }

        if (readOnly) {
          const result = await new ContractCallQuery()
            .setContractId(contractId)
            .setFunction(functionName, params)
            .setGas(gasLimit)
            .execute(client);
          client.close();
          // Decode all ABI output values; fall back to guessing index 0 if no ABI outputs defined
          const outputs = fnAbi?.outputs ?? [];
          function decodeAt(t: string, i: number): string {
            try {
              if (t === 'string')               return result.getString(i);
              if (t === 'address')              return result.getAddress(i);
              if (t === 'bool')                 return String(result.getBool(i));
              if (/^uint\d*$/.test(t))          return result.getUint256(i)?.toString() ?? '0';
              if (/^int\d*$/.test(t))           return result.getInt256(i)?.toString() ?? '0';
              if (/\[\]/.test(t) || t.includes('[')) return `(${t} — use ethers.js ABI decoder for array types)`;
              return result.getString(i) ?? result.getUint256(i)?.toString() ?? '(unknown)';
            } catch { return '(decode error)'; }
          }
          let resultValue: string | Record<string, string>;
          if (outputs.length === 0) {
            // No ABI outputs — try string first, then uint256
            try { resultValue = result.getString(0); }
            catch { try { resultValue = result.getUint256(0)?.toString() ?? '(no return value)'; } catch { resultValue = '(no return value)'; } }
          } else if (outputs.length === 1) {
            resultValue = decodeAt(outputs[0].type, 0);
          } else {
            // Multiple return values → return as named object
            const obj: Record<string, string> = {};
            outputs.forEach((out, i) => {
              const key = (out as { name?: string; type: string }).name || `value${i}`;
              obj[key] = decodeAt(out.type, i);
            });
            resultValue = obj;
          }
          return JSON.stringify({ success: true, function: functionName, result: resultValue });
        }

        const response = await new ContractExecuteTransaction()
          .setContractId(contractId)
          .setFunction(functionName, params)
          .setGas(gasLimit)
          .execute(client);
        const receipt = await response.getReceipt(client);
        const txId = response.transactionId?.toString() ?? '';
        client.close();

        return JSON.stringify({
          success: true,
          function: functionName,
          status: receipt.status.toString(),
          transaction_id: txId,
          hashscan_url: `https://hashscan.io/${config.HEDERA_NETWORK}/transaction/${txId.replace('@', '/')}`,
        }, null, 2);
      }

      case 'vera_memory_save': {
        if (!args['title']) return JSON.stringify({ error: 'title is required for memory save' });
        if (!args['content']) return JSON.stringify({ error: 'content is required for memory save' });
        const title   = args['title'] as string;
        const content = args['content'] as string;
        const tags    = (args['tags'] as string[] | undefined) ?? [];
        const { default: Database } = await import('better-sqlite3');
        const db = new Database(config.DATABASE_PATH);
        db.exec(`CREATE TABLE IF NOT EXISTS vera_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT DEFAULT '[]',
          created_at TEXT NOT NULL
        )`);
        const stmt = db.prepare('INSERT INTO vera_memories (title, content, tags, created_at) VALUES (?, ?, ?, ?)');
        const result = stmt.run(title, content, JSON.stringify(tags), new Date().toISOString());
        db.close();
        return JSON.stringify({ success: true, memory_id: result.lastInsertRowid, title, tags });
      }

      // ── Hedera Agent Kit tools ──────────────────────────────────────────────
      case 'hts_create_token':
      case 'hts_mint_token':
      case 'hts_airdrop':
      case 'hts_create_nft':
      case 'hts_dissociate_token':
      case 'hts_update_token':
      case 'hts_mint_nft':
      case 'hts_transfer_nft':
      case 'hts_approve_nft_allowance':
      case 'hts_delete_nft_allowance':
      case 'hbar_transfer':
      case 'hcs_create_topic':
      case 'hcs_submit_message':
      case 'hcs_update_topic':
      case 'hcs_delete_topic':
      case 'evm_create_erc20':
      case 'evm_create_erc721':
      case 'evm_transfer_erc20':
      case 'evm_mint_erc721':
      case 'evm_transfer_erc721':
      case 'kit_get_account':
      case 'kit_get_token_info':
      case 'kit_get_hcs_messages':
      case 'kit_create_account':
      case 'kit_update_account':
      case 'kit_delete_account':
      case 'kit_approve_hbar_allowance':
      case 'kit_delete_hbar_allowance':
      case 'kit_approve_token_allowance':
      case 'verify_account': {
        const verification = await verifyAccount(args.accountId as string);
        return JSON.stringify({
          exists: verification.exists,
          accountId: verification.accountId,
          created: verification.created,
          balance: verification.balance,
          memo: verification.memo,
          evmAddress: verification.evmAddress,
          hashscan_url: verification.hashscanUrl,
          errorMessage: verification.errorMessage,
          network: config.HEDERA_NETWORK
        });
      }

      case 'auto_connect_wallet': {
        const accountId = args.accountId as string;
        const privateKey = args.privateKey as string | undefined;
        
        // Return JavaScript code to execute in the browser
        return JSON.stringify({
          javascript: `autoConnectWallet('${accountId}'${privateKey ? `, '${privateKey}'` : ''})`,
          accountId: accountId,
          connected: true,
          message: `Wallet ${accountId} auto-connected to dashboard`
        });
      }

      case 'get_market_awareness': {
        const { awarenessTools } = await import('./awarenessTools.js');
        const awareness = await awarenessTools.getAwarenessSummary();
        
        return JSON.stringify({
          market: {
            hbarPrice: awareness.market.hbarPrice,
            hbarChange24h: awareness.market.hbarChange24h,
            marketCap: awareness.market.marketCap,
            volume24h: awareness.market.hbarVolume24h
          },
          network: {
            tps: awareness.network.currentTps,
            status: awareness.network.networkStatus,
            activeNodes: awareness.network.activeNodes,
            uptime: awareness.network.networkUptime
          },
          trending: awareness.topics.topics.slice(0, 3).map(t => ({
            topic: t.name,
            mentions: t.mentions,
            sentiment: t.sentiment,
            growth: t.growth
          })),
          news: awareness.news.articles.slice(0, 3).map(n => ({
            title: n.title,
            summary: n.summary,
            source: n.source,
            publishedAt: n.publishedAt
          })),
          insights: awareness.insights,
          lastUpdated: new Date()
        });
      }

      case 'search_awareness': {
        const { awarenessTools } = await import('./awarenessTools.js');
        const query = args.query as string;
        const results = await awarenessTools.searchInformation(query);
        
        return JSON.stringify({
          query: query,
          results: results.results.map(r => ({
            type: r.type,
            title: r.title,
            content: r.content,
            relevance: r.relevance,
            timestamp: r.timestamp
          })),
          summary: results.summary,
          totalResults: results.results.length
        });
      }

      case 'get_trending_topics': {
        const { awarenessTools } = await import('./awarenessTools.js');
        const topics = await awarenessTools.getTrendingTopics();
        
        return JSON.stringify({
          topics: topics.topics.map(t => ({
            name: t.name,
            mentions: t.mentions,
            sentiment: t.sentiment,
            growth: t.growth,
            sources: t.sources,
            keywords: t.keywords
          })),
          lastUpdated: topics.lastUpdated,
          totalTopics: topics.topics.length
        });
      }

      case 'get_network_status': {
        const { awarenessTools } = await import('./awarenessTools.js');
        const metrics = await awarenessTools.getNetworkMetrics();
        
        return JSON.stringify({
          currentTps: metrics.currentTps,
          averageTps24h: metrics.averageTps24h,
          networkStatus: metrics.networkStatus,
          gasPrice: metrics.gasPrice,
          activeNodes: metrics.activeNodes,
          totalStake: metrics.totalStake,
          recentTransactions: metrics.recentTransactions,
          networkUptime: metrics.networkUptime,
          lastUpdated: new Date()
        });
      }

      case 'kit_delete_token_allowance':
      case 'kit_sign_schedule':
      case 'kit_delete_schedule':
      case 'kit_get_token_balances':
      case 'kit_get_pending_airdrops':
      case 'kit_get_topic_info':
      case 'kit_get_contract_info':
      case 'kit_get_transaction_record':
      case 'kit_get_exchange_rate': {
        const { runAgentKitTool } = await import('../hedera/agentKitWrapper.js');

        // Map Vera tool names to Agent Kit method names
        const METHOD_MAP: Record<string, string> = {
          // Token (HTS) operations
          hts_create_token:           'create_fungible_token_tool',
          hts_mint_token:             'mint_fungible_token_tool',
          hts_airdrop:                'airdrop_fungible_token_tool',
          hts_create_nft:             'create_non_fungible_token_tool',
          hts_dissociate_token:       'dissociate_token_tool',
          hts_update_token:           'update_token_tool',
          hts_mint_nft:               'mint_non_fungible_token_tool',
          hts_transfer_nft:           'transfer_non_fungible_token_tool',
          hts_approve_nft_allowance:  'approve_nft_allowance_tool',
          hts_delete_nft_allowance:   'delete_non_fungible_token_allowance_tool',
          // Account operations
          hbar_transfer:              'transfer_hbar_tool',
          kit_create_account:         'create_account_tool',
          kit_update_account:         'update_account_tool',
          kit_delete_account:         'delete_account_tool',
          kit_approve_hbar_allowance: 'approve_hbar_allowance_tool',
          kit_delete_hbar_allowance:  'delete_hbar_allowance_tool',
          kit_approve_token_allowance:'approve_token_allowance_tool',
          kit_delete_token_allowance: 'delete_token_allowance_tool',
          kit_sign_schedule:          'sign_schedule_transaction_tool',
          kit_delete_schedule:        'schedule_delete_tool',
          // Consensus (HCS) operations
          hcs_create_topic:           'create_topic_tool',
          hcs_submit_message:         'submit_topic_message_tool',
          hcs_update_topic:           'update_topic_tool',
          hcs_delete_topic:           'delete_topic_tool',
          // EVM operations
          evm_create_erc20:           'create_erc20_tool',
          evm_create_erc721:          'create_erc721_tool',
          evm_transfer_erc20:         'transfer_erc20_tool',
          evm_mint_erc721:            'mint_erc721_tool',
          evm_transfer_erc721:        'transfer_erc721_tool',
          // Query tools
          kit_get_account:            'get_account_query_tool',
          kit_get_token_info:         'get_token_info_query_tool',
          kit_get_hcs_messages:       'get_topic_messages_query_tool',
          kit_get_token_balances:     'get_account_token_balances_query_tool',
          kit_get_pending_airdrops:   'get_pending_airdrop_tool',
          kit_get_topic_info:         'get_topic_info_query_tool',
          kit_get_contract_info:      'get_contract_info_query_tool',
          kit_get_transaction_record: 'get_transaction_record_query_tool',
          kit_get_exchange_rate:      'get_exchange_rate_tool',
        };

        const method = METHOD_MAP[name];
        if (!method) return JSON.stringify({ error: `No Agent Kit method mapped for ${name}` });

        const result = await runAgentKitTool(method, args);

        if (!result.success) {
          return JSON.stringify({ error: result.error, hint: 'Ensure HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY are set in .env' });
        }

        // Enrich write-op results with input metadata + HashScan links
        const network = config.HEDERA_NETWORK ?? 'mainnet';
        let enriched = result.data as Record<string, unknown>;
        if (typeof enriched === 'object' && enriched !== null) {
          // Merge input args so key fields are always present for UI cards
          const PASSTHROUGH_FIELDS = [
            'tokenName','tokenSymbol','initialSupply','decimals','maxSupply',
            'supplyType','topicMemo','message','topicId','tokenId','amount',
            'accountId','scheduleId','tokenMemo','serialNumber','spenderAccountId',
            'ownerAccountId','metadata',
          ] as const;
          for (const field of PASSTHROUGH_FIELDS) {
            if (args[field] != null && enriched[field] == null) {
              enriched[field] = args[field];
            }
          }
          // Add HashScan deep-links
          if (enriched['tokenId'])       enriched['hashscan_url'] = `https://hashscan.io/${network}/token/${enriched['tokenId']}`;
          if (enriched['topicId'])       enriched['hashscan_url'] = `https://hashscan.io/${network}/topic/${enriched['topicId']}`;
          if (enriched['contractId'])    enriched['hashscan_url'] = `https://hashscan.io/${network}/contract/${enriched['contractId']}`;
          if (enriched['accountId'] && !enriched['tokenId'] && !enriched['topicId'] && !enriched['contractId'])
            enriched['hashscan_url'] = `https://hashscan.io/${network}/account/${enriched['accountId']}`;
          if (enriched['scheduleId'])    enriched['hashscan_url'] = `https://hashscan.io/${network}/schedule/${enriched['scheduleId']}`;
          if (enriched['transactionId']) enriched['hashscan_url'] = `https://hashscan.io/${network}/transaction/${String(enriched['transactionId']).replace('@','/')}`;
          enriched['network'] = network;
        }

        return JSON.stringify(enriched, null, 2);
      }

      case 'vera_spawn_agent': {
        if (!args['role']) return JSON.stringify({ error: 'role is required. Valid roles: researcher, analyst, coder, critic, planner' });
        if (!args['task']) return JSON.stringify({ error: 'task is required (describe what the sub-agent should accomplish)' });
        const role    = args['role'] as string;
        const task    = args['task'] as string;
        const context = args['context'] as string | undefined;

        const validRoles = ['researcher', 'analyst', 'coder', 'critic', 'planner'];
        if (!validRoles.includes(role)) {
          return JSON.stringify({ error: `Unknown role "${role}". Valid: ${validRoles.join(', ')}` });
        }

        const { runSubAgent } = await import('./subAgent.js');
        const result = await runSubAgent({
          role: role as import('./subAgent.js').SubAgentRole,
          task,
          context,
        });

        return JSON.stringify({
          agent_role:   result.role,
          task:         result.task,
          result:       result.result,
          tools_called: result.tools_called,
          rounds:       result.rounds,
          memory_saved: result.memory_saved,
          status:       'completed',
        }, null, 2);
      }

      case 'vera_memory_recall': {
        const limit = Math.min((args['limit'] as number | undefined) ?? 5, 20);
        const tag   = args['tag'] as string | undefined;
        const query = args['query'] as string | undefined;
        const { default: Database } = await import('better-sqlite3');
        const db = new Database(config.DATABASE_PATH);
        db.exec(`CREATE TABLE IF NOT EXISTS vera_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT DEFAULT '[]',
          created_at TEXT NOT NULL
        )`);
        let rows: Array<{ id: number; title: string; content: string; tags: string; created_at: string }>;
        if (query) {
          rows = db.prepare(`SELECT * FROM vera_memories WHERE (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT ?`)
            .all(`%${query}%`, `%${query}%`, limit) as typeof rows;
        } else if (tag) {
          rows = db.prepare(`SELECT * FROM vera_memories WHERE tags LIKE ? ORDER BY created_at DESC LIMIT ?`)
            .all(`%${tag}%`, limit) as typeof rows;
        } else {
          rows = db.prepare(`SELECT * FROM vera_memories ORDER BY created_at DESC LIMIT ?`).all(limit) as typeof rows;
        }
        db.close();
        const memories = rows.map((r) => ({
          id: r.id, title: r.title, content: r.content,
          tags: JSON.parse(r.tags), saved_at: r.created_at,
        }));
        return JSON.stringify({ memory_count: memories.length, memories }, null, 2);
      }

      // Dovu OS Integration Tools
      case 'dovu_verify_data': {
        const { dovuAdapter, verificationEngine } = await import('../dovu/index.js');
        const dataId = args['data_id'] as string;
        const depth = (args['verification_depth'] as 'basic' | 'standard' | 'deep') ?? 'standard';
        
        if (!dataId) {
          return JSON.stringify({ error: 'Missing data_id parameter' });
        }

        // Initialize if needed
        await dovuAdapter.initialize();
        
        // Fetch data from Dovu
        const payload = await dovuAdapter.fetchDovuData(dataId);
        if (!payload) {
          return JSON.stringify({ error: 'Data not found in Dovu OS' });
        }

        // Perform verification
        const result = await verificationEngine.verify(payload, depth);

        return JSON.stringify({
          success: true,
          data_id: dataId,
          verified: result.verified,
          confidence: result.confidence,
          risk_score: result.riskScore,
          verification_depth: result.verificationDepth,
          verification_hash: result.verificationHash,
          checks: result.checks,
          errors: result.errors,
          metadata: result.metadata,
        }, null, 2);
      }

      case 'dovu_submit_attestation': {
        const { dovuAdapter, notaryService } = await import('../dovu/index.js');
        const dataId = args['data_id'] as string;
        const verificationHash = args['verification_hash'] as string;
        const verified = args['verified'] as boolean;
        
        if (!dataId || !verificationHash) {
          return JSON.stringify({ error: 'Missing required parameters' });
        }

        await dovuAdapter.initialize();
        await notaryService.initialize();

        const payload = await dovuAdapter.fetchDovuData(dataId);
        if (!payload) {
          return JSON.stringify({ error: 'Data not found' });
        }

        // Create verification result object
        const result = {
          verified,
          confidence: verified ? 1.0 : 0.0,
          checks: { accountValid: true, signatureValid: true, dataHashValid: true, timestampValid: true },
          verificationHash,
          timestamp: Date.now(),
          errors: [],
          riskScore: 0,
          verificationDepth: 'standard' as const,
          crossReferences: { mirrorNodeMatch: true, hcsMessagesFound: 0, similarDataPoints: 0 },
          metadata: { verificationDuration: 0, checksPerformed: 4, dataQuality: 100 },
        };

        const notarization = await notaryService.notarize(payload, result);

        if (!notarization) {
          return JSON.stringify({ error: 'Failed to create notarization' });
        }

        return JSON.stringify({
          success: true,
          notarization_id: notarization.id,
          hcs_topic_id: notarization.hcsTopicId,
          hcs_sequence_number: notarization.hcsSequenceNumber,
          attestation_hash: notarization.attestationHash,
          timestamp: notarization.timestamp,
        }, null, 2);
      }

      // ─── HashScan Deep Link Tools ───────────────────────────────────────────
      // Vera's blockchain verification and memory tools

      case 'generate_hashscan_link': {
        const { generateHashScanLink } = await import('../vera/tools/hashscanDeepLink.js');
        const entity = args['entity'] as 'transaction' | 'topic' | 'account' | 'token' | 'nft' | 'contract';
        const id = args['id'] as string;
        const network = (args['network'] as 'mainnet' | 'testnet') || 'mainnet';
        const sequenceNumber = args['sequenceNumber'] as number | undefined;
        
        if (!entity || !id) {
          return JSON.stringify({ error: 'Missing required parameters: entity, id' });
        }

        const link = generateHashScanLink(entity, id, { network, sequenceNumber });
        
        return JSON.stringify({
          success: true,
          url: link.url,
          entity: link.entity,
          id: link.id,
          network: link.network,
          timestamp: link.timestamp,
          markdown: `[View on HashScan](${link.url})`,
          veraSays: `Here's the HashScan link to verify the ${entity}: ${link.url}`
        }, null, 2);
      }

      case 'get_vera_swarm_topic': {
        const { getVeraSwarmTopicLink } = await import('../vera/tools/hashscanDeepLink.js');
        const sequenceNumber = args['sequenceNumber'] as number | undefined;
        
        const link = getVeraSwarmTopicLink(sequenceNumber);
        
        return JSON.stringify({
          success: true,
          url: link.url,
          entity: link.entity,
          id: link.id,
          network: link.network,
          markdown: `[View Vera's Swarm Topic on HashScan](${link.url})`,
          veraSays: `My swarm topic is where I log all my events. You can verify everything I do here: ${link.url}`,
          topicId: link.id,
          sequenceNumber
        }, null, 2);
      }

      case 'vera_self_lookup': {
        const { veraSelfLookup } = await import('../vera/tools/hashscanDeepLink.js');
        const eventType = args['eventType'] as 'handshake' | 'payment' | 'bridge' | 'consensus';
        const agentId = args['agentId'] as string | undefined;
        const timestamp = args['timestamp'] as number | undefined;
        
        if (!eventType) {
          return JSON.stringify({ error: 'Missing required parameter: eventType' });
        }

        const result = await veraSelfLookup(eventType, { agentId, timestamp });
        
        return JSON.stringify({
          success: true,
          topicLink: result.topicLink.url,
          query: result.query,
          veraSays: result.veraSays,
          markdown: `**${result.query}**: [View on HashScan](${result.topicLink.url})`
        }, null, 2);
      }

      case 'build_vera_summary': {
        const { buildVeraSummary } = await import('../vera/tools/hashscanDeepLink.js');
        const action = args['action'] as string;
        const txId = args['txId'] as string;
        const details = (args['details'] as Record<string, unknown>) || {};
        
        if (!action || !txId) {
          return JSON.stringify({ error: 'Missing required parameters: action, txId' });
        }

        const summary = buildVeraSummary(action, txId, details);
        
        return JSON.stringify({
          success: true,
          summary: summary.summary,
          hashScanLink: summary.hashScanLink,
          verification: summary.verification,
          markdown: summary.summary
        }, null, 2);
      }

      case 'dovu_claim_payment': {
        const { paymentOrchestrator, notaryService } = await import('../dovu/index.js');
        const notarizationId = args['notarization_id'] as string;
        const paymentType = (args['payment_type'] as 'smart_contract' | 'manual' | 'staking_reward') ?? 'smart_contract';
        
        if (!notarizationId) {
          return JSON.stringify({ error: 'Missing notarization_id' });
        }

        await paymentOrchestrator.initialize();

        // Get notarization details
        const notarization = notaryService.getNotarization(notarizationId);
        if (!notarization) {
          return JSON.stringify({ error: 'Notarization not found' });
        }

        // Create payment request if not exists
        const request = await paymentOrchestrator.createPaymentRequest(
          notarizationId,
          notarization.verified ? 'standard' : 'basic',
          1
        );

        // Process payment
        const success = paymentType === 'smart_contract'
          ? await paymentOrchestrator.processSmartContractPayment(request.id)
          : await paymentOrchestrator.processManualPayment(request.id);

        if (!success) {
          return JSON.stringify({ error: 'Payment processing failed' });
        }

        return JSON.stringify({
          success: true,
          payment_request_id: request.id,
          notarization_id: notarizationId,
          payment_type: paymentType,
          amount: request.amount,
          status: 'completed',
          timestamp: Date.now(),
        }, null, 2);
      }

      case 'dovu_create_certificate': {
        const { notaryService } = await import('../dovu/index.js');
        const projectName = args['project_name'] as string;
        const description = (args['description'] as string) ?? '';
        const notarizationIds = args['notarization_ids'] as string[];
        
        if (!projectName || !notarizationIds || !Array.isArray(notarizationIds)) {
          return JSON.stringify({ error: 'Missing required parameters' });
        }

        await notaryService.initialize();

        const certificate = await notaryService.createCertificate(
          projectName,
          description,
          notarizationIds
        );

        if (!certificate) {
          return JSON.stringify({ error: 'Failed to create certificate' });
        }

        return JSON.stringify({
          success: true,
          certificate_id: certificate.id,
          project_name: certificate.projectName,
          hcs_topic_id: certificate.hcsTopicId,
          hcs_sequence_number: certificate.hcsSequenceNumber,
          total_verifications: certificate.totalVerifications,
          successful_verifications: certificate.successfulVerifications,
          total_carbon_tons: certificate.totalCarbonTons,
          timestamp: certificate.timestamp,
        }, null, 2);
      }

      case 'dovu_stake_tokens': {
        const { paymentOrchestrator } = await import('../dovu/index.js');
        const amount = args['amount'] as number;
        const lockPeriodDays = (args['lock_period_days'] as number) ?? 30;
        
        if (!amount || amount <= 0) {
          return JSON.stringify({ error: 'Invalid amount' });
        }

        await paymentOrchestrator.initialize();

        const position = await paymentOrchestrator.createStakingPosition(amount, lockPeriodDays);

        if (!position) {
          return JSON.stringify({ error: 'Failed to create staking position' });
        }

        return JSON.stringify({
          success: true,
          position_id: position.id,
          staked_amount: position.stakedAmount,
          lock_period_days: position.lockPeriodDays,
          status: position.status,
          staked_at: position.stakedAt,
        }, null, 2);
      }

      case 'dovu_get_stats': {
        const { paymentOrchestrator, notaryService } = await import('../dovu/index.js');
        
        const stats = paymentOrchestrator.getPaymentStats();
        const topicIds = notaryService.getTopicIds();

        return JSON.stringify({
          success: true,
          stats: {
            ...stats,
            hcs_topics: topicIds,
            dovu_token_id: '0.0.1329002',
          },
        }, null, 2);
      }

      // ── Phase 1: Advanced Staking & Node Operations ─────────────────────────────
      case 'stake_to_node':
      case 'update_staking':
      case 'claim_staking_rewards':
      case 'get_staking_info':
      case 'get_node_info':
      case 'get_reward_history':
      case 'enable_staking':
      case 'disable_staking': {
        // Placeholder implementations - will be implemented with Hedera SDK
        return JSON.stringify({ 
          tool: name, 
          status: 'pending_implementation',
          args,
          note: 'Hedera staking operations require SDK implementation'
        });
      }

      // ── Phase 1: File Service Tools ─────────────────────────────────────────────
      case 'file_create':
      case 'file_append':
      case 'file_update':
      case 'file_delete':
      case 'file_get_contents':
      case 'file_get_info': {
        // Placeholder implementations - will be implemented with Hedera SDK
        return JSON.stringify({ 
          tool: name, 
          status: 'pending_implementation',
          args,
          note: 'Hedera File Service operations require SDK implementation'
        });
      }

      // ── Phase 1: Advanced Token Operations ─────────────────────────────────────
      case 'token_wipe':
      case 'token_freeze':
      case 'token_unfreeze':
      case 'token_kyc_grant':
      case 'token_kyc_revoke':
      case 'token_pause':
      case 'token_unpause':
      case 'token_fee_schedule_update': {
        // Placeholder implementations - will be implemented with Hedera SDK
        return JSON.stringify({ 
          tool: name, 
          status: 'pending_implementation',
          args,
          note: 'Advanced HTS operations require SDK implementation'
        });
      }

      // ── Bitfrost OS: Self-Coding Tools ─────────────────────────────────────────
      case 'file_read': {
        const filePath = path.join(WORKSPACE_ROOT, args['path'] as string);
        // Security: ensure path is within workspace
        if (!filePath.startsWith(WORKSPACE_ROOT)) {
          return JSON.stringify({ error: 'Path must be within workspace' });
        }
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          return JSON.stringify({ success: true, path: args['path'], content, size: content.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Failed to read file: ${message}` });
        }
      }

      case 'file_write': {
        const filePath = path.join(WORKSPACE_ROOT, args['path'] as string);
        // Security: ensure path is within workspace
        if (!filePath.startsWith(WORKSPACE_ROOT)) {
          return JSON.stringify({ error: 'Path must be within workspace' });
        }
        // Check blacklist
        if (isProtectedPath(args['path'] as string)) {
          return JSON.stringify({ error: 'Cannot modify protected system files. Requires explicit approval.' });
        }
        try {
          // Create directories if needed
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          const mode = (args['mode'] as string) || 'w';
          if (mode === 'a') {
            fs.appendFileSync(filePath, args['content'] as string);
          } else {
            fs.writeFileSync(filePath, args['content'] as string);
          }
          // Audit log
          auditLog({ tool: 'file_write', path: args['path'], mode, timestamp: Date.now() });
          return JSON.stringify({ success: true, path: args['path'], mode, bytes_written: (args['content'] as string).length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Failed to write file: ${message}` });
        }
      }

      case 'directory_list': {
        const dirPath = path.join(WORKSPACE_ROOT, (args['path'] as string) || '.');
        // Security: ensure path is within workspace
        if (!dirPath.startsWith(WORKSPACE_ROOT)) {
          return JSON.stringify({ error: 'Path must be within workspace' });
        }
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          const items = entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : null,
            modified: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).mtime.toISOString() : null,
          }));
          return JSON.stringify({ success: true, path: args['path'] || '.', items, count: items.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Failed to list directory: ${message}` });
        }
      }

      case 'execute_command': {
        const cmd = args['cmd'] as string;
        const timeout = Math.min((args['timeout'] as number) || 60, 300);
        // Strict allowlist validation
        if (!isAllowedCommand(cmd)) {
          return JSON.stringify({ error: 'Command not in allowlist. Allowed: npm, forge, cargo, python -m pytest, git, ls, cat, echo, vera_*' });
        }
        try {
          const { execSync } = await import('child_process');
          const result = execSync(cmd, { 
            cwd: WORKSPACE_ROOT, 
            timeout: timeout * 1000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
          auditLog({ tool: 'execute_command', cmd, timestamp: Date.now() });
          return JSON.stringify({ success: true, cmd, stdout: result, exit_code: 0 });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Command failed: ${message}` });
        }
      }

      case 'git_commit': {
        const message = args['message'] as string;
        try {
          const { execSync } = await import('child_process');
          execSync('git add -A', { cwd: WORKSPACE_ROOT });
          const result = execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { 
            cwd: WORKSPACE_ROOT,
            encoding: 'utf-8'
          });
          auditLog({ tool: 'git_commit', message, timestamp: Date.now() });
          return JSON.stringify({ success: true, message, output: result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Git commit failed: ${message}` });
        }
      }

      case 'git_push': {
        const branch = (args['branch'] as string) || 'main';
        try {
          const { execSync } = await import('child_process');
          const result = execSync(`git push origin ${branch}`, { 
            cwd: WORKSPACE_ROOT,
            encoding: 'utf-8'
          });
          auditLog({ tool: 'git_push', branch, timestamp: Date.now() });
          return JSON.stringify({ success: true, branch, output: result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Git push failed: ${message}` });
        }
      }

      // ── Bitfrost OS: Phase 2 Advanced Tools ──────────────────────────────────
      case 'file_edit': {
        const filePath = path.join(WORKSPACE_ROOT, args['path'] as string);
        const oldString = args['old_string'] as string;
        const newString = args['new_string'] as string;
        
        // Security: ensure path is within workspace
        if (!filePath.startsWith(WORKSPACE_ROOT)) {
          return JSON.stringify({ error: 'Path must be within workspace' });
        }
        // Check blacklist
        if (isProtectedPath(args['path'] as string)) {
          return JSON.stringify({ error: 'Cannot modify protected system files. Requires explicit approval.' });
        }
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Check if old_string exists
          if (!content.includes(oldString)) {
            return JSON.stringify({ error: 'old_string not found in file. File may have changed or string may not be unique.' });
          }
          // Check uniqueness - if multiple matches, we need to be careful
          const matches = content.split(oldString).length - 1;
          if (matches > 1) {
            return JSON.stringify({ error: `old_string appears ${matches} times in file. Must be unique for safe replacement.` });
          }
          // Perform replacement
          const newContent = content.replace(oldString, newString);
          fs.writeFileSync(filePath, newContent);
          // Audit log
          auditLog({ tool: 'file_edit', path: args['path'], timestamp: Date.now() });
          return JSON.stringify({ 
            success: true, 
            path: args['path'], 
            replacements: 1,
            bytes_before: content.length,
            bytes_after: newContent.length
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Failed to edit file: ${message}` });
        }
      }

      case 'code_search': {
        const searchPath = path.join(WORKSPACE_ROOT, (args['path'] as string) || '.');
        const query = args['query'] as string;
        const filePattern = args['file_pattern'] as string | undefined;
        const maxResults = Math.min((args['max_results'] as number) || 20, 50);
        
        // Security: ensure path is within workspace
        if (!searchPath.startsWith(WORKSPACE_ROOT)) {
          return JSON.stringify({ error: 'Path must be within workspace' });
        }
        
        try {
          const { execSync } = await import('child_process');
          
          // Build rg command
          let rgCmd = `rg -n --max-count=${maxResults} --max-columns=200`;
          if (filePattern) {
            rgCmd += ` -g "${filePattern}"`;
          }
          // Add context lines
          rgCmd += ' -B 2 -A 2';
          // Add the query (properly escaped)
          rgCmd += ` ${JSON.stringify(query)}`;
          rgCmd += ` ${JSON.stringify(searchPath)}`;
          
          let results: string;
          try {
            results = execSync(rgCmd, { 
              cwd: WORKSPACE_ROOT,
              encoding: 'utf-8',
              timeout: 30000,
              maxBuffer: 1024 * 1024 // 1MB
            });
          } catch (execErr) {
            // rg exits with code 1 if no matches, which throws in execSync
            if ((execErr as Error & { status: number }).status === 1) {
              return JSON.stringify({ success: true, query, matches: [], total_matches: 0 });
            }
            throw execErr;
          }
          
          // Parse results
          const lines = results.split('\n').filter(l => l.trim());
          const matches: Array<{ file: string; line: number; text: string; context: string[] }> = [];
          let currentMatch: typeof matches[0] | null = null;
          
          for (const line of lines) {
            const matchLine = line.match(/^(.+?):(\d+):(.*)$/);
            if (matchLine) {
              if (currentMatch) matches.push(currentMatch);
              currentMatch = {
                file: path.relative(WORKSPACE_ROOT, matchLine[1]),
                line: parseInt(matchLine[2], 10),
                text: matchLine[3],
                context: []
              };
            } else if (line.startsWith('-') || line.startsWith(' ')) {
              // Context line (before/after)
              if (currentMatch) {
                currentMatch.context.push(line.substring(1));
              }
            }
          }
          if (currentMatch) matches.push(currentMatch);
          
          auditLog({ tool: 'code_search', query, matches: matches.length, timestamp: Date.now() });
          return JSON.stringify({ 
            success: true, 
            query, 
            matches: matches.slice(0, maxResults),
            total_matches: matches.length,
            search_path: args['path'] || '.'
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Fallback to grep if ripgrep not available
          try {
            const { execSync: grepExec } = await import('child_process');
            const grepCmd = filePattern 
              ? `grep -rn "${query.replace(/"/g, '\\"')}" --include="${filePattern}" ${JSON.stringify(searchPath)} | head -${maxResults}`
              : `grep -rn "${query.replace(/"/g, '\\"')}" ${JSON.stringify(searchPath)} | head -${maxResults}`;
            const results = grepExec(grepCmd, { cwd: WORKSPACE_ROOT, encoding: 'utf-8', timeout: 30000 });
            const lines = results.split('\n').filter((l: string) => l.trim());
            const matches = lines.map((l: string) => {
              const parts = l.split(':');
              return { file: parts[0], line: parseInt(parts[1], 10), text: parts.slice(2).join(':'), context: [] };
            });
            return JSON.stringify({ success: true, query, matches, total_matches: matches.length, fallback: 'grep' });
          } catch {
            return JSON.stringify({ error: `Search failed: ${message}. Ensure ripgrep (rg) or grep is installed.` });
          }
        }
      }

      case 'run_tests': {
        const testPattern = args['test_pattern'] as string | undefined;
        const timeout = Math.min((args['timeout'] as number) || 120, 600);
        
        try {
          const { execSync } = await import('child_process');
          
          // Detect test framework and run tests
          let cmd: string;
          if (fs.existsSync(path.join(WORKSPACE_ROOT, 'package.json'))) {
            const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf-8'));
            if (testPattern) {
              cmd = `npm test -- --grep "${testPattern.replace(/"/g, '\\"')}"`;
            } else {
              cmd = 'npm test';
            }
          } else if (fs.existsSync(path.join(WORKSPACE_ROOT, 'Cargo.toml'))) {
            cmd = testPattern ? `cargo test ${testPattern}` : 'cargo test';
          } else if (fs.existsSync(path.join(WORKSPACE_ROOT, 'pyproject.toml')) || 
                     fs.existsSync(path.join(WORKSPACE_ROOT, 'setup.py'))) {
            cmd = testPattern ? `python -m pytest -k "${testPattern}"` : 'python -m pytest';
          } else {
            return JSON.stringify({ error: 'No recognized test framework found (needs package.json, Cargo.toml, or pytest setup)' });
          }
          
          const result = execSync(cmd, { 
            cwd: WORKSPACE_ROOT, 
            timeout: timeout * 1000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          auditLog({ tool: 'run_tests', cmd, timestamp: Date.now() });
          return JSON.stringify({ 
            success: true, 
            cmd,
            output: result,
            test_pattern: testPattern || null
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Still return as success if tests ran but some failed
          if ((err as Error & { stdout?: string }).stdout) {
            return JSON.stringify({ 
              success: false, 
              cmd: 'npm test',
              output: (err as Error & { stdout?: string }).stdout,
              stderr: (err as Error & { stderr?: string }).stderr || message,
              exit_code: (err as Error & { status: number }).status || 1
            });
          }
          return JSON.stringify({ error: `Test execution failed: ${message}` });
        }
      }

      case 'analyze_code': {
        const analyzePath = path.join(WORKSPACE_ROOT, (args['path'] as string) || '.');
        const fix = (args['fix'] as boolean) || false;
        
        // Security: ensure path is within workspace
        if (!analyzePath.startsWith(WORKSPACE_ROOT)) {
          return JSON.stringify({ error: 'Path must be within workspace' });
        }
        
        try {
          const { execSync } = await import('child_process');
          const results: { tool: string; output: string; issues: number }[] = [];
          
          // TypeScript check if tsconfig.json exists
          if (fs.existsSync(path.join(WORKSPACE_ROOT, 'tsconfig.json'))) {
            try {
              const tscCmd = fix 
                ? 'npx tsc --noEmit --skipLibCheck 2>&1 || true'
                : 'npx tsc --noEmit --skipLibCheck 2>&1';
              const tscOutput = execSync(tscCmd, { 
                cwd: WORKSPACE_ROOT, 
                encoding: 'utf-8',
                timeout: 60000
              });
              const tscErrors = tscOutput.split('\n').filter((l: string) => l.includes('error TS')).length;
              results.push({ tool: 'tsc', output: tscOutput, issues: tscErrors });
            } catch (tscErr) {
              const output = (tscErr as Error & { stdout?: string }).stdout || String(tscErr);
              const errors = output.split('\n').filter((l: string) => l.includes('error TS')).length;
              results.push({ tool: 'tsc', output, issues: errors });
            }
          }
          
          // ESLint check if .eslintrc exists
          const hasEslint = ['.eslintrc.js', '.eslintrc.json', '.eslintrc', 'eslint.config.js', 'eslint.config.mjs']
            .some(f => fs.existsSync(path.join(WORKSPACE_ROOT, f)));
          
          if (hasEslint) {
            try {
              const eslintCmd = fix 
                ? `npx eslint "${analyzePath}" --fix 2>&1 || true`
                : `npx eslint "${analyzePath}" 2>&1 || true`;
              const eslintOutput = execSync(eslintCmd, { 
                cwd: WORKSPACE_ROOT, 
                encoding: 'utf-8',
                timeout: 60000
              });
              const eslintIssues = eslintOutput.split('\n').filter((l: string) => l.includes('error') || l.includes('warning')).length;
              results.push({ tool: 'eslint', output: eslintOutput, issues: eslintIssues });
            } catch (eslintErr) {
              const output = (eslintErr as Error & { stdout?: string }).stdout || String(eslintErr);
              results.push({ tool: 'eslint', output, issues: 0 });
            }
          }
          
          auditLog({ tool: 'analyze_code', path: args['path'] || '.', fix, timestamp: Date.now() });
          return JSON.stringify({ 
            success: true, 
            path: args['path'] || '.',
            fix_applied: fix,
            results,
            total_issues: results.reduce((sum, r) => sum + r.issues, 0)
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Analysis failed: ${message}` });
        }
      }

      // ── McLaren F1 Carbon Auditing Tools ─────────────────────────────────

      case 'mclaren_ingest_telemetry': {
        const { raceCarbonAuditor } = await import('../mclaren/raceCarbonAuditor.js');
        const telemetry = {
          raceId: args['race_id'] as string,
          raceName: args['race_name'] as string,
          circuit: args['circuit'] as string,
          date: new Date().toISOString().split('T')[0],
          team: args['team'] as string,
          session: args['session'] as any || 'RACE',
          tires: {
            compound: args['tire_data']?.['compound'] as any || 'MEDIUM',
            degradationRate: args['tire_data']?.['degradation_rate'] as number || 0,
            lapsRemaining: args['tire_data']?.['laps_remaining'] as number || 0,
            optimalTemp: 100,
            currentTemp: 95,
            pressure: 21.5,
          },
          fuel: {
            currentLevel: args['fuel_data']?.['current_level'] as number || 100,
            consumptionPerLap: args['fuel_data']?.['consumption_per_lap'] as number || 2.5,
            optimalBurnRate: args['fuel_data']?.['optimal_burn_rate'] as number || 2.2,
            remainingLaps: args['lap_count'] as number || 78,
            leanMixEnabled: false,
          },
          logistics: {
            freightDistance: args['logistics']?.['freight_distance'] as number || 5000,
            transportMode: args['logistics']?.['transport_mode'] as any || 'air',
            cargoWeight: args['logistics']?.['cargo_weight'] as number || 50000,
            fuelType: 'jet_a',
          },
          pitOps: {
            pitStopCount: args['pit_ops']?.['pit_stop_count'] as number || 2,
            avgStopDuration: args['pit_ops']?.['avg_stop_duration'] as number || 2.5,
            equipmentPowerDraw: args['pit_ops']?.['equipment_power_draw'] as number || 50,
            personnelCount: args['pit_ops']?.['personnel_count'] as number || 25,
          },
          lapCount: args['lap_count'] as number || 78,
          trackLength: args['track_length'] as number || 3.3,
          timestamp: Date.now(),
        };
        await raceCarbonAuditor.ingestTelemetry(telemetry as any);
        return JSON.stringify({ success: true, race_id: telemetry.raceId, session: telemetry.session, message: 'Telemetry ingested' });
      }

      case 'mclaren_calculate_emissions': {
        const { raceCarbonAuditor } = await import('../mclaren/raceCarbonAuditor.js');
        const raceId = args['race_id'] as string;
        const session = (args['session'] as string) || 'RACE';
        const calculation = raceCarbonAuditor.calculateEmissions(raceId, session);
        if (!calculation) {
          return JSON.stringify({ error: `No telemetry data found for race ${raceId} session ${session}` });
        }
        return JSON.stringify({ success: true, calculation });
      }

      case 'mclaren_get_calculation': {
        const { raceCarbonAuditor } = await import('../mclaren/raceCarbonAuditor.js');
        const raceId = args['race_id'] as string;
        const session = (args['session'] as string) || 'RACE';
        const calculation = raceCarbonAuditor.getCalculation(raceId, session);
        if (!calculation) {
          return JSON.stringify({ error: `No calculation found for race ${raceId}` });
        }
        return JSON.stringify({ success: true, calculation });
      }

      case 'mclaren_mint_carbon_badge': {
        const { carbonBadgeService } = await import('../mclaren/carbonBadgeService.js');
        const { raceCarbonAuditor } = await import('../mclaren/raceCarbonAuditor.js');
        const raceId = args['race_id'] as string;
        const raceName = args['race_name'] as string;
        const recipientAddress = args['recipient_address'] as string;
        const collectibleId = args['collectible_id'] as string;
        
        const calculation = raceCarbonAuditor.getCalculation(raceId, 'RACE');
        if (!calculation) {
          return JSON.stringify({ error: `No carbon calculation found for race ${raceId}. Run mclaren_calculate_emissions first.` });
        }
        
        const hcsReport = raceCarbonAuditor.generateHCSReport(raceId, 'RACE');
        const badge = await carbonBadgeService.mintCarbonBadge({
          raceId,
          raceName,
          recipientAddress,
          collectibleId,
          calculation,
          hcsReportHash: (hcsReport as any)?.hash || '',
        });
        
        if (!badge) {
          return JSON.stringify({ error: 'Failed to mint carbon badge' });
        }
        
        return JSON.stringify({ 
          success: true, 
          badge: {
            serial_number: badge.serialNumber,
            token_id: badge.tokenId,
            recipient: badge.recipient,
            metadata: badge.metadata,
          }
        });
      }

      case 'mclaren_batch_mint_badges': {
        const { carbonBadgeService } = await import('../mclaren/carbonBadgeService.js');
        const raceId = args['race_id'] as string;
        const raceName = args['race_name'] as string;
        const recipientsInput = args['recipients'] as Array<{ address: string; collectible_id: string }>;
        
        // Transform property names to match interface
        const recipients = recipientsInput.map(r => ({
          address: r.address,
          collectibleId: r.collectible_id,
        }));
        
        const badges = await carbonBadgeService.batchMintBadges(raceId, raceName, recipients);
        
        return JSON.stringify({ 
          success: true, 
          minted: badges.length,
          total_requested: recipients.length,
          badges: badges.map(b => ({
            serial_number: b.serialNumber,
            recipient: b.recipient,
            collectible_id: b.metadata.carbon_data.race_id,
          }))
        });
      }

      case 'mclaren_submit_race_report': {
        const { hcsCarbonReporter } = await import('../mclaren/hcsCarbonReporter.js');
        const raceId = args['race_id'] as string;
        const raceName = args['race_name'] as string;
        const session = (args['session'] as string) || 'RACE';
        
        const result = await hcsCarbonReporter.submitRaceReport(raceId, raceName, session);
        
        if (!result.success) {
          return JSON.stringify({ error: result.error || 'Failed to submit race report' });
        }
        
        return JSON.stringify({ 
          success: true, 
          report: result.report,
          topic_id: result.topicId,
          sequence_number: result.sequenceNumber,
          summary: hcsCarbonReporter.generateReportSummary(result.report!),
        });
      }

      case 'mclaren_get_report': {
        const { hcsCarbonReporter } = await import('../mclaren/hcsCarbonReporter.js');
        const raceId = args['race_id'] as string;
        const session = (args['session'] as string) || 'RACE';
        
        const report = hcsCarbonReporter.getReport(raceId, session);
        if (!report) {
          return JSON.stringify({ error: `No report found for race ${raceId}` });
        }
        
        return JSON.stringify({ 
          success: true, 
          report,
          summary: hcsCarbonReporter.generateReportSummary(report),
        });
      }

      case 'mclaren_submit_season_summary': {
        const { hcsCarbonReporter } = await import('../mclaren/hcsCarbonReporter.js');
        const season = args['season'] as string;
        const team = args['team'] as string;
        const raceIds = args['race_ids'] as string[];
        
        const result = await hcsCarbonReporter.submitSeasonSummary(season, team, raceIds);
        
        if (!result.success) {
          return JSON.stringify({ error: result.error || 'Failed to submit season summary' });
        }
        
        return JSON.stringify({ 
          success: true, 
          summary: result.summary,
          total_races: result.summary?.races.length,
          total_emissions_tco2e: result.summary?.totalEmissionsTco2e,
          yoy_reduction: result.summary?.yoyReduction,
        });
      }

      // ── Phase 2: McLaren Real-Time & Simulation Tools ─────────────────────

      case 'mclaren_run_simulations': {
        const { scenarioSimulator } = await import('../mclaren/scenarioSimulator.js');
        const raceId = args['race_id'] as string;
        const circuit = args['circuit'] as string;
        const totalLaps = args['total_laps'] as number;
        const trackLength = args['track_length'] as number;
        const targetScenarios = (args['target_scenarios'] as number) || 10000;
        
        const simulation = await scenarioSimulator.runPreRaceSimulations(
          raceId, circuit, totalLaps, trackLength, targetScenarios
        );
        
        return JSON.stringify({
          success: true,
          race_id: raceId,
          scenarios_run: simulation.scenariosRun,
          optimal_strategy: simulation.optimalStrategy?.name,
          carbon_optimal_strategy: simulation.carbonOptimalStrategy?.name,
          best_lap_time: simulation.bestLapTime.toFixed(3),
          optimizations_found: simulation.optimizations.length,
          top_optimizations: simulation.optimizations.slice(0, 3),
        });
      }

      case 'mclaren_get_simulation': {
        const { scenarioSimulator } = await import('../mclaren/scenarioSimulator.js');
        const raceId = args['race_id'] as string;
        const simulation = scenarioSimulator.getSimulation(raceId);
        
        if (!simulation) {
          return JSON.stringify({ error: `No simulation found for race ${raceId}` });
        }
        
        return JSON.stringify({ success: true, simulation });
      }

      case 'mclaren_get_optimizations': {
        const { scenarioSimulator } = await import('../mclaren/scenarioSimulator.js');
        const raceId = args['race_id'] as string;
        const simulation = scenarioSimulator.getSimulation(raceId);
        
        if (!simulation) {
          return JSON.stringify({ error: `No simulation found for race ${raceId}` });
        }
        
        return JSON.stringify({
          success: true,
          optimizations: simulation.optimizations,
          pit_wall_summary: scenarioSimulator.generatePitWallSummary(raceId),
        });
      }

      case 'mclaren_start_monitoring': {
        const { realTimeCarbonValidator } = await import('../mclaren/realTimeValidator.js');
        const { scenarioSimulator } = await import('../mclaren/scenarioSimulator.js');
        const raceId = args['race_id'] as string;
        
        const simulation = scenarioSimulator.getSimulation(raceId);
        if (!simulation) {
          return JSON.stringify({ error: `No simulation found for race ${raceId}. Run mclaren_run_simulations first.` });
        }
        
        await realTimeCarbonValidator.startRaceMonitoring(raceId, simulation);
        
        return JSON.stringify({
          success: true,
          race_id: raceId,
          message: 'Real-time monitoring started',
        });
      }

      case 'mclaren_update_telemetry': {
        const { realTimeCarbonValidator } = await import('../mclaren/realTimeValidator.js');
        
        const liveData = {
          raceId: args['race_id'] as string,
          currentLap: args['current_lap'] as number,
          totalLaps: args['total_laps'] as number,
          position: args['position'] as number,
          gapToLeader: args['gap_to_leader'] as number,
          tireCompound: args['tire_compound'] as any,
          tireAge: args['tire_age'] as number,
          tireDegradation: args['tire_degradation'] as number,
          fuelRemaining: args['fuel_remaining'] as number,
          fuelConsumptionRate: args['fuel_consumption_rate'] as number,
          trackTemp: args['track_temp'] as number,
          weather: args['weather'] as any,
          drsEnabled: args['drs_enabled'] as boolean,
          timestamp: Date.now(),
        };
        
        const flags = await realTimeCarbonValidator.updateTelemetry(liveData as any);
        
        return JSON.stringify({
          success: true,
          flags_generated: flags.length,
          flags: flags.map(f => ({
            type: f.type,
            priority: f.priority,
            recommendation: f.recommendation,
            carbon_impact: f.carbonImpact,
            time_impact: f.timeImpact,
          })),
        });
      }

      case 'mclaren_get_strategy_flags': {
        const { realTimeCarbonValidator } = await import('../mclaren/realTimeValidator.js');
        const raceId = args['race_id'] as string;
        
        const flags = realTimeCarbonValidator.getActiveFlags(raceId);
        
        return JSON.stringify({
          success: true,
          race_id: raceId,
          active_flags: flags.length,
          flags: flags.map(f => ({
            id: f.id,
            type: f.type,
            priority: f.priority,
            recommendation: f.recommendation,
            carbon_impact_kg: f.carbonImpact,
            time_impact_s: f.timeImpact,
            confidence: f.confidence,
          })),
        });
      }

      case 'mclaren_get_live_carbon': {
        const { realTimeCarbonValidator } = await import('../mclaren/realTimeValidator.js');
        const raceId = args['race_id'] as string;
        
        const summary = realTimeCarbonValidator.getLiveCarbonSummary(raceId);
        
        if (!summary) {
          return JSON.stringify({ error: `No live carbon data for race ${raceId}` });
        }
        
        return JSON.stringify({ success: true, summary });
      }

      case 'mclaren_init_hud': {
        const { pitWallHUD } = await import('../mclaren/pitWallHUD.js');
        const raceId = args['race_id'] as string;
        const teamId = args['team_id'] as string;
        const driverId = args['driver_id'] as string;
        const layout = args['layout'] as any || 'FULL';
        
        const display = await pitWallHUD.initializeHUD(raceId, teamId, driverId, { layout });
        
        return JSON.stringify({
          success: true,
          race_id: raceId,
          hud_initialized: true,
          layout,
          text_display: pitWallHUD.getTextDisplay(raceId),
        });
      }

      case 'mclaren_get_hud_display': {
        const { pitWallHUD } = await import('../mclaren/pitWallHUD.js');
        const raceId = args['race_id'] as string;
        
        const display = pitWallHUD.getDisplay(raceId);
        if (!display) {
          return JSON.stringify({ error: `HUD not initialized for race ${raceId}` });
        }
        
        return JSON.stringify({
          success: true,
          display,
          text_display: pitWallHUD.getTextDisplay(raceId),
          compact_display: pitWallHUD.getCompactDisplay(raceId),
        });
      }

      case 'mclaren_get_pitwall_data': {
        const { realTimeCarbonValidator } = await import('../mclaren/realTimeValidator.js');
        const raceId = args['race_id'] as string;
        
        const pitWallData = realTimeCarbonValidator.getPitWallDisplay(raceId);
        
        if (!pitWallData) {
          return JSON.stringify({ error: `No pit wall data for race ${raceId}` });
        }
        
        return JSON.stringify({ success: true, pit_wall_data: pitWallData });
      }

      case 'mclaren_retire_offsets': {
        const { carbonOffsetRetirement } = await import('../mclaren/carbonOffsetRetirement.js');
        
        const request = {
          raceId: args['race_id'] as string | undefined,
          season: args['season'] as string,
          team: args['team'] as string,
          tonnesToRetire: args['tonnes_to_retire'] as number,
          creditPreferences: args['credit_preferences'] as any[],
          maxPricePerTonne: args['max_price_per_tonne'] as number | undefined,
          autoExecute: true,
        };
        
        const receipt = await carbonOffsetRetirement.executeRetirement(request);
        
        if (!receipt) {
          return JSON.stringify({ error: 'Failed to execute carbon offset retirement' });
        }
        
        return JSON.stringify({
          success: true,
          receipt: {
            id: receipt.id,
            tonnes_retired: receipt.tonnesRetired,
            total_cost: receipt.totalCost,
            projects: receipt.creditsUsed.map(c => c.projectName),
            hcs_topic: receipt.hcsTopicId,
            hcs_sequence: receipt.hcsSequenceNumber,
          },
          certificate: carbonOffsetRetirement.generateCertificateText(receipt),
        });
      }

      case 'mclaren_calculate_season_retirement': {
        const { carbonOffsetRetirement } = await import('../mclaren/carbonOffsetRetirement.js');
        const season = args['season'] as string;
        const team = args['team'] as string;
        const targetReduction = (args['target_reduction'] as number) || 0.23;
        
        const receipt = await carbonOffsetRetirement.calculateSeasonRetirement(season, team, targetReduction);
        
        if (!receipt) {
          return JSON.stringify({ error: `Failed to calculate retirement for season ${season}` });
        }
        
        const summary = await carbonOffsetRetirement.generateSeasonSummary(season, team);
        
        return JSON.stringify({
          success: true,
          receipt: {
            id: receipt.id,
            tonnes_retired: receipt.tonnesRetired,
            total_cost: receipt.totalCost,
          },
          season_summary: summary,
        });
      }

      case 'mclaren_get_retirement_receipt': {
        const { carbonOffsetRetirement } = await import('../mclaren/carbonOffsetRetirement.js');
        const receiptId = args['receipt_id'] as string;
        
        const receipt = carbonOffsetRetirement.getRetirement(receiptId);
        
        if (!receipt) {
          return JSON.stringify({ error: `Receipt ${receiptId} not found` });
        }
        
        return JSON.stringify({
          success: true,
          receipt,
          certificate: carbonOffsetRetirement.generateCertificateText(receipt),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}
