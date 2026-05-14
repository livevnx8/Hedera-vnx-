/**
 * LangGraph-style Planner Runner
 *
 * Four-phase autonomous execution loop:
 *   Phase 1 — PLAN:      LLM generates a structured JSON step-by-step plan
 *   Phase 2 — EXECUTE:   Each step runs tools; results feed into subsequent steps
 *   Phase 3 — CRITIQUE:  Critic LLM reviews completeness and quality
 *   Phase 4 — SYNTHESIZE: Final response with all context, exact IDs, HashScan links
 *
 * State threading: {{stepN.fieldName}} placeholders in plan args are resolved
 * at execution time using actual results from previous steps.
 */

import { callQvxInfer } from '../llm/qvxDirectProvider.js';
import { buildSystemPromptWithVeda } from './system.js';
import { ALL_TOOL_DEFINITIONS } from './definitions.js';
import { executeTool } from './executor.js';
import type { ChatMessage, AgentStreamEvent } from './runner.js';

// Tools included in the planner prompt — excludes: queued legacy hedera/saucerswap-swap tools (return __pending_tx__ sentinel, block autonomous flow), diagnostic QVX tools, vera_spawn_agent
const PLANNER_TOOL_NAMES = new Set([
  // Token (HTS) operations
  'hts_create_token', 'hts_mint_token', 'hts_airdrop', 'hts_create_nft',
  'hts_dissociate_token', 'hts_update_token', 'hts_mint_nft', 'hts_transfer_nft',
  'hts_approve_nft_allowance', 'hts_delete_nft_allowance',
  // Account operations
  'hbar_transfer', 'kit_create_account', 'kit_update_account', 'kit_delete_account',
  'kit_approve_hbar_allowance', 'kit_delete_hbar_allowance',
  'kit_approve_token_allowance', 'kit_delete_token_allowance',
  'kit_sign_schedule', 'kit_delete_schedule',
  // Consensus (HCS) operations
  'hcs_create_topic', 'hcs_submit_message', 'hcs_update_topic', 'hcs_delete_topic',
  // EVM operations
  'evm_create_erc20', 'evm_create_erc721', 'evm_transfer_erc20', 'evm_mint_erc721', 'evm_transfer_erc721',
  // Agent Kit queries
  'kit_get_account', 'kit_get_token_info', 'kit_get_hcs_messages',
  'kit_get_token_balances', 'kit_get_pending_airdrops', 'kit_get_topic_info',
  'kit_get_contract_info', 'kit_get_transaction_record', 'kit_get_exchange_rate',
  // Read-only Hedera Mirror Node queries
  'hedera_get_account_info', 'hedera_get_balance', 'hedera_get_tokens',
  'hedera_search_tokens', 'hedera_get_transaction', 'hedera_hcs_get_messages',
  // Read-only SaucerSwap queries
  'saucerswap_get_pools', 'saucerswap_get_token_price', 'get_price_chart',
  // Smart contract
  'vera_compile_contract', 'vera_deploy_contract', 'vera_call_contract',
  // Memory
  'vera_memory_save', 'vera_memory_recall',
  // Web / research
  'web_search', 'get_news', 'wiki_search', 'hackernews_search',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanStep {
  step: number;
  action: string;
  tool?: string | null;
  args?: Record<string, unknown>;
}

interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  total_steps: number;
}

// ─── Complexity detection ─────────────────────────────────────────────────────

const MULTI_STEP_SIGNALS = [
  /\bthen\b.{5,120}\bthen\b/i,
  /\band then\b/i,
  /\bfollowed by\b/i,
  /\bafter (?:that|creating|deploying|sending|submitting|compiling)\b/i,
  /\bstep by step\b/i,
  /\bworkflow\b/i,
  /\bautonomously\b/i,
  /\bdo all of\b/i,
  /\bdo both\b/i,
  /\bdo the following\b/i,
  /\bexecute.*(?:create|deploy|send|mint|transfer|submit)/i,
  // Contract sequences
  /\bcompile.*(?:and|then).*deploy\b/i,
  /\bdeploy.*(?:and|then).*call\b/i,
  /\bdeploy.*(?:and|then).*(?:mint|transfer|interact)/i,
  // Token + HCS sequences
  /\bcreate.*(?:token|nft).*(?:and|then).*(?:topic|message|hcs|log)/i,
  /\bcreate.*(?:and|then).*(?:airdrop|mint|send|submit)\b/i,
  // Multiple "and" chaining with action verbs
  /\b(?:create|deploy|mint|send)\b.{1,80}\band\b.{1,80}\b(?:then|also|after)\b/i,
  // Bootstrap / full setup language
  /\bbootstrap\b/i,
  /\bfull(?:\s+(?:launch|setup|workflow|flow|deployment))\b/i,
  /\bfrom scratch\b.*(?:token|contract|nft|topic)/i,
  /\bend[- ]to[- ]end\b/i,
  // Initialize after deploy
  /\bdeploy.*(?:and|then).*initializ/i,
  /\binitializ.*(?:and|then).*(?:call|mint|post|transfer)/i,
  // announce / post after create
  /\bcreate.*(?:then|and).*(?:announce|post|broadcast|log)\b/i,
  // memory-coupled workflows
  /\bsave.*(?:and|then).*(?:to memory|remember|recall)\b/i,
  /\b(?:recall|look up).*(?:then|and).*(?:create|deploy|send|post)\b/i,
  // search then act
  /\bsearch.*(?:then|and).*(?:use|call|deploy|send|post)\b/i,
  /\bget (?:the )?(?:price|info|balance|data).*(?:and|then).*(?:post|log|save|send)\b/i,
  // spawn + do more
  /\bspawn.*(?:and|then).*(?:save|post|deploy|send)\b/i,
  // verify/check/confirm after create/deploy
  /\b(?:create|deploy|mint|launch).*(?:then|and).*(?:verify|check|confirm|read|call)\b/i,
  /\bverify.*(?:after|once|when).*(?:deploy|create|mint)\b/i,
  // price + action sequences
  /\bprice.*(?:then|and).*(?:create|deploy|log|save|post|send)\b/i,
  /\bfind.*token.*(?:and|then).*(?:price|swap|buy|sell|get)\b/i,
  // research/news + save patterns
  /\b(?:research|news|search|wiki|find).*(?:then|and).*(?:save|remember|store|log|memory)\b/i,
  /\b(?:get|fetch|pull).*(?:news|article|stories).*(?:then|and).*(?:save|post|submit|log)\b/i,
  // chart + more patterns
  /\b(?:chart|graph|show).*(?:and|then).*(?:price|get|fetch|check)\b/i,
  // compare multiple items
  /\bcompare.*(?:and|then).*(?:save|log|report|write)\b/i,
  /\b(?:get|check|fetch).*(?:both|all|each).*(?:then|and)\b/i,
];

const ACTION_VERB_RE = /\b(create|deploy|send|mint|transfer|submit|swap|build|launch|airdrop|register|post|write|compile|call|initialize|verify|announce|fund|approve|recall|save|search|query)\b/gi;

export function isComplexMultiStepTask(messages: ChatMessage[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last?.content) return false;
  const text = last.content;
  if (MULTI_STEP_SIGNALS.some((re) => re.test(text))) return true;
  const verbs = text.match(ACTION_VERB_RE) ?? [];
  const unique = new Set(verbs.map((v) => v.toLowerCase()));
  return unique.size >= 3;
}

// ─── JSON repair helper ───────────────────────────────────────────────────────

function repairJson(s: string): string {
  let r = s.replace(/,\s*([}\]])/g, '$1');           // trailing commas
  r = r.replace(/:\s*undefined\b/g, ': null');       // undefined values
  r = r.replace(/:\s*NaN\b/g, ': null');             // NaN values
  r = r.replace(/:\s*Infinity\b/g, ': null');        // Infinity values
  r = r.replace(/:\s*'([^']*?)'/g, ': "$1"');        // single-quoted strings
  r = r.replace(/([{,]\s*)([a-zA-Z_][\w]*)\s*:/g, '$1"$2":'); // unquoted keys
  return r;
}

// ─── State threading ──────────────────────────────────────────────────────────

// Resolve a dotted path (e.g. "tokens.0.token_id") from a root object
function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const idx = /^\d+$/.test(part) ? Number(part) : null;
    if (idx != null && Array.isArray(cur)) {
      cur = cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

function resolveArgs(
  args: Record<string, unknown>,
  stepResults: Map<number, Record<string, unknown>>,
): Record<string, unknown> {
  function resolveValue(val: unknown): unknown {
    if (typeof val === 'string') {
      // If the entire string is a single placeholder, preserve the original type
      // (important for abi arrays: {{step1.abi}} must stay as array, not "[object Object]")
      // Also supports nested paths: {{step1.tokens.0.token_id}}
      const singleMatch = /^\{\{step(\d+)\.([^}]+)\}\}$/.exec(val);
      if (singleMatch) {
        const r = stepResults.get(Number(singleMatch[1]));
        const resolved = r != null ? resolvePath(r, singleMatch[2]) : undefined;
        return resolved != null ? resolved : val;
      }
      // Multiple placeholders or mixed string — stringify each resolved value
      return val.replace(
        /\{\{step(\d+)\.([^}]+)\}\}/g,
        (original, n, path) => {
          const r = stepResults.get(Number(n));
          const resolved = r != null ? resolvePath(r, path) : undefined;
          return resolved != null ? String(resolved) : original;
        },
      );
    } else if (Array.isArray(val)) {
      return val.map(resolveValue);
    } else if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = resolveValue(v);
      }
      return out;
    }
    return val;
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(args)) {
    resolved[key] = resolveValue(val);
  }
  return resolved;
}

// ─── Plan extractor ───────────────────────────────────────────────────────────

function extractPlan(raw: string): ExecutionPlan | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < raw.length; j++) {
      if (raw[j] === '{') depth++;
      else if (raw[j] === '}') {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(i, j + 1);
          for (const attempt of [candidate, repairJson(candidate)]) {
            try {
              const obj = JSON.parse(attempt) as unknown;
              if (
                obj &&
                typeof obj === 'object' &&
                'goal' in obj &&
                'steps' in obj &&
                Array.isArray((obj as ExecutionPlan).steps) &&
                (obj as ExecutionPlan).steps.length > 0
              ) {
                const plan = obj as ExecutionPlan;
                plan.total_steps = plan.steps.length;
                return plan;
              }
            } catch { /* keep trying */ }
          }
          break;
        }
      }
    }
  }
  return null;
}

// ─── Planner prompt ───────────────────────────────────────────────────────────

function buildPlannerPrompt(toolList: string): string {
  return `You are Vera's autonomous planning engine. Output a structured JSON execution plan — nothing else.

CRITICAL: Your entire response must be a single valid JSON object. No prose, no markdown, no explanation before or after.

JSON schema:
{"goal":"one-line mission description","steps":[{"step":1,"action":"what this step achieves","tool":"exact_tool_name","args":{"param":"value"}}],"total_steps":N}

State threading: use {{stepN.fieldName}} to pass a result from step N into a later step's args. Nested paths also work: {{stepN.tokens.0.token_id}} traverses arrays and objects.
Key field names returned by tools:
  hts_create_token    → tokenId
  hts_create_nft      → tokenId
  hts_mint_token      → transactionId
  hts_airdrop         → transactionId
  hcs_create_topic    → topicId
  hcs_submit_message  → transactionId
  evm_create_erc20    → contractId, contractAddress
  evm_create_erc721   → contractId, contractAddress
  vera_deploy_contract → contract_id, contract_address
  vera_compile_contract → bytecode, abi
  vera_call_contract  → result (for read_only:true), transaction_id (for read_only:false)
  hbar_transfer       → transactionId
  hedera_search_tokens → tokens (array with token_id, name, symbol, decimals per item), count
  saucerswap_get_token_price → priceUsd, priceHbar, tokenId, symbol
  saucerswap_get_pools → array of {id, tokenA.symbol, tokenB.symbol, tvlUsd, volume24hUsd, fee} (use {{stepN.0.id}} for first item)
  kit_get_account    → accountId, hbarBalance (string), tokens (array)
  kit_get_token_info → tokenId, name, symbol, totalSupply, decimals, type
  hedera_get_balance → hbars (number), tinybars (string)
  hedera_get_tokens  → array of {token_id, balance, decimals} (use {{stepN.0.token_id}} for first item)
  hedera_get_account_info → account (accountId string), balance.hbars
  vera_memory_save   → memory_id, title
  hedera_get_transaction → transaction_id, result, name, charged_tx_fee, consensus_timestamp
  vera_memory_recall → memories (array of {id, title, content, tags, saved_at})
  vera_spawn_agent   → result (sub-agent output string), agent_role, tools_called, memory_saved
  hedera_hcs_get_messages → array of {sequence_number, consensus_timestamp, message} (use {{stepN.0.message}} for first)
  kit_get_hcs_messages    → array of {sequence_number, consensus_timestamp, message}
  get_news           → articles (array of {title, source, published, url, summary}), article_count, topic
  wiki_search        → title, summary (text extract), url, related (array of {title, snippet})
  web_search         → results (array of {title, url, snippet}), result_count, query
  hackernews_search  → stories (array of {title, url, points, comments, posted}), story_count

Example 1 (create token then post to HCS topic):
{"goal":"Create AETH token and log creation event to HCS","steps":[{"step":1,"action":"Create AETH fungible token with 1B supply","tool":"hts_create_token","args":{"tokenName":"AetherCoin","tokenSymbol":"AETH","initialSupply":1000000000,"decimals":8}},{"step":2,"action":"Create HCS topic for token event log","tool":"hcs_create_topic","args":{"topicMemo":"AETH token event log"}},{"step":3,"action":"Post token creation event to HCS topic","tool":"hcs_submit_message","args":{"topicId":"{{step2.topicId}}","message":"AETH token created: {{step1.tokenId}}"}}],"total_steps":3}

Example 2 (compile then deploy then call contract function):
{"goal":"Deploy Counter contract and call increment()","steps":[{"step":1,"action":"Compile Counter Solidity contract","tool":"vera_compile_contract","args":{"source_code":"pragma solidity ^0.8.20; contract Counter { uint public count; function increment() external { count++; } }","contract_name":"Counter"}},{"step":2,"action":"Deploy compiled Counter contract","tool":"vera_deploy_contract","args":{"bytecode":"{{step1.bytecode}}","abi":"{{step1.abi}}"}},{"step":3,"action":"Call increment() on deployed contract","tool":"vera_call_contract","args":{"contract_id":"{{step2.contract_id}}","abi":"{{step1.abi}}","function_name":"increment","args":[],"read_only":false}}],"total_steps":3}

Example 3 (create token then mint then airdrop to recipients):
{"goal":"Create NOVA token, mint 10M more, airdrop to two accounts","steps":[{"step":1,"action":"Create NOVA fungible token with 100M initial supply","tool":"hts_create_token","args":{"tokenName":"NovaToken","tokenSymbol":"NOVA","initialSupply":100000000,"decimals":8,"supplyType":"FINITE","maxSupply":200000000}},{"step":2,"action":"Mint additional 10M NOVA tokens","tool":"hts_mint_token","args":{"tokenId":"{{step1.tokenId}}","amount":10000000}},{"step":3,"action":"Airdrop NOVA to two recipient accounts","tool":"hts_airdrop","args":{"tokenId":"{{step1.tokenId}}","recipients":[{"accountId":"0.0.1001","amount":5000000},{"accountId":"0.0.1002","amount":5000000}]}}],"total_steps":3}

Example 4 (search tokens then get price using nested path):
{"goal":"Find SAUCE token and get its SaucerSwap price","steps":[{"step":1,"action":"Search for SAUCE token to get its token ID","tool":"hedera_search_tokens","args":{"query":"SAUCE","limit":3}},{"step":2,"action":"Get SAUCE price from SaucerSwap using found token_id","tool":"saucerswap_get_token_price","args":{"token_id":"{{step1.tokens.0.token_id}}"}}],"total_steps":2}

Example 5 (research then save to memory):
{"goal":"Research Hedera news and save summary to memory","steps":[{"step":1,"action":"Get latest Hedera HBAR news articles","tool":"get_news","args":{"topic":"Hedera HBAR blockchain news","limit":5}},{"step":2,"action":"Save news summary to memory","tool":"vera_memory_save","args":{"title":"HBAR news snapshot","content":"Top story: {{step1.articles.0.title}} ({{step1.articles.0.source}}). Article count: {{step1.article_count}}.","tags":["hbar","news","research"]}}],"total_steps":2}

Example 6 (multi-source research with web + wiki):
{"goal":"Research Layer 2 scaling from news and Wikipedia","steps":[{"step":1,"action":"Get latest Layer 2 news","tool":"get_news","args":{"topic":"Layer 2 blockchain scaling","limit":4}},{"step":2,"action":"Get Wikipedia overview of Layer 2","tool":"wiki_search","args":{"query":"Layer 2 blockchain scaling","sentences":8}},{"step":3,"action":"Save combined research to memory","tool":"vera_memory_save","args":{"title":"Layer 2 research","content":"News: {{step1.articles.0.title}}. Wiki: {{step2.summary}}","tags":["layer2","research"]}}],"total_steps":3}

Rules:
- "tool" must be null for steps with no tool call
- Maximum 6 steps — merge similar actions into one
- Order: creation before reference, topics before messages
- Args must match exact parameter names above

Available tools:
${toolList}`;
}

// ─── Main planner stream ──────────────────────────────────────────────────────

export async function* runPlannerAgentStream(
  messages: ChatMessage[],
): AsyncGenerator<AgentStreamEvent> {
  const systemPrompt = await buildSystemPromptWithVeda();
  let totalPrompt = 0;
  let totalCompletion = 0;

  const toolList = ALL_TOOL_DEFINITIONS
    .filter((t) => PLANNER_TOOL_NAMES.has(t.function.name))
    .map((t) => {
      const desc = t.function.description.length > 90
        ? t.function.description.slice(0, 87) + '…'
        : t.function.description;
      return `  ${t.function.name}: ${desc}`;
    })
    .join('\n');

  // ─── Phase 1: PLAN ────────────────────────────────────────────────
  yield { type: 'plan_phase', phase: 'planning' } as AgentStreamEvent;
  const plannerMessages: ChatMessage[] = [
    { role: 'system', content: buildPlannerPrompt(toolList) },
    ...messages,
  ];

  let planRaw: string;
  try {
    planRaw = await callQvxInfer(plannerMessages as never, 600);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'text', content: `⚠ Planner error: ${msg}` };
    yield { type: 'done' };
    return;
  }

  totalPrompt += Math.ceil(
    plannerMessages.reduce((n, m) => n + (m.content?.length ?? 0), 0) / 4,
  );
  totalCompletion += Math.ceil(planRaw.length / 4);

  const plan = extractPlan(planRaw);
  if (!plan || !plan.steps?.length) {
    // Couldn't parse a valid plan — fall through to regular runner for a proper response
    const { runQvxDirectAgentStream } = await import('./qvxDirectRunner.js');
    yield* runQvxDirectAgentStream({ messages });
    return;
  }

  // Hard-cap at 6 steps regardless of what the model output
  if (plan.steps.length > 6) {
    plan.steps = plan.steps.slice(0, 6);
    plan.total_steps = 6;
  }

  // Emit plan card event
  yield {
    type: 'plan',
    goal: plan.goal,
    steps: plan.steps.map((s) => ({
      step:   s.step,
      action: s.action,
      tool:   s.tool ?? null,
    })),
  } as AgentStreamEvent;

  // ─── Phase 2: EXECUTE ──────────────────────────────────────────────
  yield { type: 'plan_phase', phase: 'executing' } as AgentStreamEvent;
  const stepResults = new Map<number, Record<string, unknown>>();
  const executionLog: string[] = [];

  for (const step of plan.steps) {
    const stepStart = Date.now();
    yield { type: 'plan_step_start', stepNum: step.step, action: step.action } as AgentStreamEvent;

    let stepFailed = false;
    let stepErrorMsg: string | undefined;

    if (step.tool) {
      const resolvedArgs = resolveArgs(step.args ?? {}, stepResults);
      yield { type: 'tool_use', name: step.tool, args: resolvedArgs };

      let result: string;
      try {
        result = await executeTool(step.tool, resolvedArgs);
      } catch (err) {
        result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }

      // Detect error in result
      try {
        const parsed = JSON.parse(result) as Record<string, unknown>;
        if (parsed['__pending_tx__']) {
          stepFailed = true;
          stepErrorMsg = `Tool "${step.tool}" requires user TX approval and cannot run autonomously in a plan. Use an Agent Kit tool (hts_*, hcs_*, hbar_transfer) instead.`;
          executionLog.push(`Step ${step.step} [${step.tool}] ERROR: ${stepErrorMsg}`);
        } else if (parsed['error']) {
          stepFailed = true;
          stepErrorMsg = String(parsed['error']).slice(0, 200);
          executionLog.push(`Step ${step.step} [${step.tool}] ERROR: ${stepErrorMsg}`);
        } else {
          stepResults.set(step.step, parsed);
          // If the result is a raw array (e.g. hedera_get_tokens), log a compact summary
          if (Array.isArray(parsed)) {
            const items = (parsed as Array<Record<string, unknown>>).slice(0, 3).map((t) =>
              ({ token_id: t['token_id'], symbol: t['symbol'], balance: t['balance'] }));
            executionLog.push(`Step ${step.step} [${step.tool}]: [${items.map((t) => JSON.stringify(t)).join(', ')}] (${(parsed as unknown[]).length} items)`);
            continue;
          }
          // Compact log: omit abi arrays and truncate bytecodes; always preserve IDs and hashscan links
          const CRITICAL_KEYS = new Set(['tokenId','topicId','contractId','contract_id','contract_address','transactionId','transaction_id','hashscan_url','accountId','result','memory_id','title','priceUsd','priceHbar','symbol','count','article_count','story_count','result_count','article_0_title']);
          const logObj: Record<string, unknown> = {};
          const critObj: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (k === 'abi' || k === 'warnings') continue;  // arrays that bloat context
            if (k === 'bytecode' && typeof v === 'string') { logObj[k] = v.slice(0, 20) + '…'; continue; }
            if (k === 'tokens' && Array.isArray(v)) {
              // For search results, log a compact summary instead of the full array
              logObj[k] = (v as Array<Record<string, unknown>>).slice(0, 3).map((t) => ({ token_id: t['token_id'], symbol: t['symbol'], name: t['name'] }));
              // Surface the first token_id in critical keys for synthesis
              const first = (v as Array<Record<string, unknown>>)[0];
              if (first?.['token_id']) critObj['token_id_0'] = first['token_id'];
              continue;
            }
            if (k === 'articles' && Array.isArray(v)) {
              // Compact news articles — only keep title and source
              logObj[k] = (v as Array<Record<string, unknown>>).slice(0, 3).map((a) => ({ title: a['title'], source: a['source'] }));
              const first = (v as Array<Record<string, unknown>>)[0];
              if (first?.['title']) critObj['article_0_title'] = first['title'];
              continue;
            }
            if (k === 'stories' && Array.isArray(v)) {
              // Compact HN stories — only keep title and points
              logObj[k] = (v as Array<Record<string, unknown>>).slice(0, 3).map((s) => ({ title: s['title'], points: s['points'] }));
              continue;
            }
            if (k === 'results' && Array.isArray(v)) {
              // Compact web_search results — only keep title and snippet
              logObj[k] = (v as Array<Record<string, unknown>>).slice(0, 3).map((r) => ({ title: r['title'], snippet: String(r['snippet'] ?? '').slice(0, 80) }));
              continue;
            }
            if (k === 'summary' && typeof v === 'string' && v.length > 300) {
              logObj[k] = v.slice(0, 300) + '…';
              continue;
            }
            if (k === 'memories' && Array.isArray(v)) {
              logObj[k] = (v as Array<Record<string, unknown>>).slice(0, 3).map((m) => ({ id: m['id'], title: m['title'] }));
              continue;
            }
            logObj[k] = v;
            if (CRITICAL_KEYS.has(k)) critObj[k] = v;  // always keep these in full
          }
          const body = JSON.stringify(logObj).slice(0, 400);
          const critical = Object.keys(critObj).length ? ' ' + JSON.stringify(critObj) : '';
          executionLog.push(`Step ${step.step} [${step.tool}]: ${body}${critical}`);
        }
      } catch {
        stepResults.set(step.step, { raw: result });
        executionLog.push(`Step ${step.step} [${step.tool}]: ${result.slice(0, 300)}`);
      }

      yield { type: 'tool_result', name: step.tool, result };
    } else {
      executionLog.push(`Step ${step.step}: ${step.action} (no tool)`);
    }

    yield { type: 'plan_step_done', stepNum: step.step, error: stepFailed, error_message: stepErrorMsg, duration_ms: Date.now() - stepStart } as AgentStreamEvent;
  }

  // ─── Phase 3: CRITIQUE ────────────────────────────────────────────
  yield { type: 'plan_phase', phase: 'critiquing' } as AgentStreamEvent;
  const critiqueMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are Vera's internal quality critic. Respond in 1-2 sentences max. Be blunt.
Check: (1) Did any steps fail (ERROR in log)? (2) Are all required IDs/data present (tokenId, topicId, contractId, transactionId, memory_id, token_id_0, priceUsd, result, article_0_title, article_count)? (3) Was the user's goal fully achieved?
Format: "X/10. [One concrete gap or confirmation it's complete]". No preamble.`,
    },
    ...messages,
    {
      role: 'assistant',
      content: `Goal: ${plan.goal}\n\nExecution log:\n${executionLog.join('\n')}`,
    },
    {
      role: 'user',
      content: 'Score this execution and name the single most important gap (or confirm complete).',
    },
  ];

  let critiqueText = '';
  try {
    critiqueText = await callQvxInfer(critiqueMessages as never, 150);
    totalPrompt += Math.ceil(
      critiqueMessages.reduce((n, m) => n + (m.content?.length ?? 0), 0) / 4,
    );
    totalCompletion += Math.ceil(critiqueText.length / 4);
  } catch {
    critiqueText = 'Execution complete.';
  }

  yield { type: 'critique', text: critiqueText } as AgentStreamEvent;

  // ─── Phase 4: SYNTHESIZE ──────────────────────────────────────────
  yield { type: 'plan_phase', phase: 'synthesizing' } as AgentStreamEvent;
  const synthMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
    {
      role: 'assistant',
      content: `I completed the plan: ${plan.goal}\n\n${executionLog.join('\n')}\n\nCritic review: ${critiqueText}`,
    },
    {
      role: 'user',
      content: `Write your final response now. Lead with a punchy confirmation of what was accomplished. Quote EXACT IDs (tokenId, topicId, contractId, transactionId, memory_id) and HashScan links from the execution log above. For price/search steps, include priceUsd, token_id, symbol. List what was created/executed with full details. End with 2-3 concrete next steps. Never hedge — this happened, say so directly.`,
    },
  ];

  let finalResponse: string;
  try {
    finalResponse = await callQvxInfer(synthMessages as never);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'text', content: `⚠ Synthesis error: ${msg}` };
    yield { type: 'done' };
    return;
  }

  totalPrompt += Math.ceil(
    synthMessages.reduce((n, m) => n + (m.content?.length ?? 0), 0) / 4,
  );
  totalCompletion += Math.ceil(finalResponse.length / 4);

  // Stream in sentence-sized chunks for smooth rendering
  const chunks = finalResponse.match(/[^.!?\n]+[.!?\n]?\s*/g) ?? [finalResponse];
  for (const chunk of chunks) {
    if (chunk.trim()) yield { type: 'text', content: chunk };
  }

  yield { type: 'usage', promptTokens: totalPrompt, completionTokens: totalCompletion };
  yield { type: 'done' };
}
