/**
 * Vera Sub-Agent Runner
 *
 * Each sub-agent is a focused, autonomous unit with its own system prompt
 * and restricted tool subset. Vera (the orchestrator) spawns them via the
 * vera_spawn_agent tool and synthesises their results.
 *
 * Roles:
 *   researcher  — web intelligence (news, wiki, HN)
 *   analyst     — on-chain Hedera data analysis
 *   coder       — Solidity / TypeScript code generation and compilation
 *   critic      — adversarial review of ideas or plans
 *   planner     — structured project / tokenomics planning
 */

import { callQvxInfer } from '../llm/qvxDirectProvider.js';
import { executeTool } from './executor.js';
import Database from 'better-sqlite3';
import { config } from '../config.js';

// ── Role definitions ─────────────────────────────────────────────────────────

export type SubAgentRole = 'researcher' | 'analyst' | 'coder' | 'critic' | 'planner';

const ROLE_SYSTEM_PROMPTS: Record<SubAgentRole, string> = {
  researcher: `You are Vera's Research Sub-Agent — a specialist in gathering and synthesising real-time information.

Your job: use web tools to find the most current, accurate information on the assigned task, then produce a concise, fact-dense report.

Rules:
- Call get_news first for latest developments, wiki_search for background, hackernews_search for community signals
- ALWAYS quote specific facts, dates, numbers, and headlines from tool results — never vague summaries
- After all tool calls, synthesise into: ## Findings\n[specific facts]\n## Sources\n[tool names used]
- If you can't find something, say so explicitly — never hallucinate

Tool call format: {"name":"tool_name","arguments":{...}}
After a tool_response, immediately present the real data from it.`,

  analyst: `You are Vera's On-Chain Analyst Sub-Agent — a specialist in Hedera blockchain data.

Your job: pull live on-chain data for the assigned task and produce a precise analytical report.

Rules:
- Use hedera_get_balance, kit_get_account, kit_get_token_info, hedera_search_tokens, hedera_get_transaction for account/token/tx data
- Use saucerswap_get_token_price, saucerswap_get_pools, get_price_chart for DEX/price analysis
- Report exact values: balances in HBAR and USD, token amounts, transaction counts, prices
- Identify trends, anomalies, or notable patterns
- Format output as: ## On-Chain Analysis\n[precise data]\n## Interpretation\n[what it means]

Tool call format: {"name":"tool_name","arguments":{...}}
Present actual numbers from tool results — never estimate.`,

  coder: `You are Vera's Code Sub-Agent — a specialist in Hedera smart contracts and TypeScript development.

Your job: write production-quality code for the assigned task.

Rules:
- Write complete, compilable Solidity (^0.8.20) or TypeScript — no placeholders, no TODO stubs
- For Solidity: include all imports, error handling, events, and natspec comments
- For TypeScript: include all imports, types, error handling
- After writing code, call vera_compile_contract if it's a Solidity contract
- Format output as: ## Implementation\n\`\`\`solidity\n[code]\n\`\`\`\n## Usage\n[how to deploy/use it]

Tool call format: {"name":"tool_name","arguments":{...}}`,

  critic: `You are Vera's Critic Sub-Agent — an adversarial thinker whose job is to find flaws.

Your job: rigorously critique the assigned plan, idea, or code for weaknesses, risks, and blind spots.

Rules:
- Be constructive but brutally honest — your value is in finding what others miss
- Cover: technical risks, market risks, execution risks, regulatory concerns, tokenomics flaws
- For every weakness identified, propose a concrete mitigation
- Format as: ## Critical Issues\n[ranked by severity]\n## Recommendations\n[specific fixes]
- Do NOT soften findings to be polite — the user hired you to find problems`,

  planner: `You are Vera's Planning Sub-Agent — a specialist in structured project and product planning.

Your job: create a detailed, actionable plan for the assigned project.

Rules:
- Use vera_memory_recall first to check for relevant past context on this project
- Build structured plans with: Vision → Architecture → Phases (with dates) → Team → Tokenomics → GTM → Risks
- Be concrete: name specific technologies, timelines, headcount, budget estimates
- Save the completed plan with vera_memory_save before returning
- Format as markdown with headers so the UI renders it beautifully

Tool call format: {"name":"tool_name","arguments":{...}}`,
};

const ROLE_ALLOWED_TOOLS: Record<SubAgentRole, string[]> = {
  researcher: ['web_search', 'get_news', 'wiki_search', 'hackernews_search', 'vera_memory_save', 'vera_memory_recall'],
  analyst:    ['hedera_get_balance', 'hedera_get_account_info', 'hedera_hcs_get_messages',
               'hedera_search_tokens', 'hedera_get_tokens', 'hedera_get_transaction',
               'kit_get_account', 'kit_get_token_info', 'kit_get_hcs_messages',
               'saucerswap_get_token_price', 'saucerswap_get_pools',
               'get_price_chart', 'web_search', 'vera_memory_save', 'vera_memory_recall'],
  coder:      ['vera_compile_contract', 'web_search', 'wiki_search', 'hackernews_search', 'vera_memory_save', 'vera_memory_recall'],
  critic:     ['vera_memory_recall', 'web_search', 'wiki_search', 'hackernews_search'],
  planner:    ['vera_memory_save', 'vera_memory_recall', 'web_search', 'wiki_search', 'hackernews_search'],
};

const MAX_SUB_ROUNDS = 4;

// ── Tool call extraction (mirrors main runner) ────────────────────────────────

function repairJson(s: string): string {
  let r = s.replace(/,\s*([}\]])/g, '$1');           // trailing commas
  r = r.replace(/:\s*undefined\b/g, ': null');       // undefined values
  r = r.replace(/:\s*NaN\b/g, ': null');             // NaN values
  r = r.replace(/:\s*Infinity\b/g, ': null');        // Infinity values
  r = r.replace(/:\s*'([^']*?)'/g, ': "$1"');        // single-quoted strings
  r = r.replace(/([{,]\s*)([a-zA-Z_][\w]*)\s*:/g, '$1"$2":'); // unquoted keys
  return r;
}

function extractToolCall(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let i = start; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          for (const attempt of [candidate, repairJson(candidate)]) {
            try {
              const parsed = JSON.parse(attempt) as Record<string, unknown>;
              if (typeof parsed['name'] === 'string' && 'arguments' in parsed) return attempt;
            } catch { /* keep trying */ }
          }
          break;
        }
      }
    }
  }
  return null;
}

// ── Memory persistence ────────────────────────────────────────────────────────

function saveToMemory(role: SubAgentRole, task: string, result: string): void {
  try {
    const db = new Database(config.DATABASE_PATH);
    db.exec(`CREATE TABLE IF NOT EXISTS vera_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    )`);
    db.prepare('INSERT INTO vera_memories (title, content, tags, created_at) VALUES (?, ?, ?, ?)')
      .run(
        `[${role.toUpperCase()}] ${task.slice(0, 70)}`,
        result.slice(0, 2000),
        JSON.stringify([role, 'sub-agent', 'auto-saved']),
        new Date().toISOString(),
      );
    db.close();
  } catch { /* non-fatal */ }
}

// ── Sub-agent runner ──────────────────────────────────────────────────────────

export interface SubAgentResult {
  role:         SubAgentRole;
  task:         string;
  result:       string;
  tools_called: string[];
  rounds:       number;
  memory_saved: boolean;
}

export async function runSubAgent(params: {
  role:     SubAgentRole;
  task:     string;
  context?: string;
}): Promise<SubAgentResult> {
  const { role, task, context } = params;
  const systemPrompt = ROLE_SYSTEM_PROMPTS[role];
  const allowedTools = ROLE_ALLOWED_TOOLS[role];

  const userMessage = context
    ? `Task: ${task}\n\nAdditional context:\n${context}`
    : `Task: ${task}`;

  const conversation: Array<{ role: string; content: string }> = [
    { role: 'user', content: userMessage },
  ];

  const toolsCalled: string[] = [];
  let rounds = 0;
  let finalResult = '';

  for (let round = 0; round < MAX_SUB_ROUNDS; round++) {
    rounds = round + 1;

    const messagesForInfer = [
      { role: 'system', content: systemPrompt },
      ...conversation,
    ];

    let content: string;
    try {
      content = await callQvxInfer(messagesForInfer as never, 1024);
    } catch (err) {
      finalResult = `Sub-agent error: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }

    const rawCall = extractToolCall(content);

    if (!rawCall) {
      // No tool call → this is the final synthesised answer
      finalResult = content.trim();
      break;
    }

    // Parse and execute tool call
    let toolName: string;
    let toolArgs: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawCall) as { name: string; arguments?: Record<string, unknown> };
      toolName = parsed.name;
      toolArgs = parsed.arguments ?? {};
    } catch {
      finalResult = content.trim();
      break;
    }

    // Enforce tool allow-list — prevent sub-agents from accessing out-of-scope tools
    if (!allowedTools.includes(toolName)) {
      conversation.push({ role: 'assistant', content });
      conversation.push({
        role: 'user',
        content: `<tool_response name="${toolName}">\n{"error": "Tool '${toolName}' is not available to the ${role} sub-agent."}\n</tool_response>\n\nProvide your best answer using only the information you already have.`,
      });
      continue;
    }

    toolsCalled.push(toolName);
    const toolResult = await executeTool(toolName, toolArgs);

    conversation.push({ role: 'assistant', content });
    conversation.push({
      role: 'user',
      content: `<tool_response name="${toolName}">\n${toolResult}\n</tool_response>\n\nContinue your task using this data. Present specific facts and values from the result.`,
    });
  }

  if (!finalResult) {
    finalResult = conversation[conversation.length - 1]?.content ?? 'No result produced.';
  }

  // Auto-save to memory so Vera can recall this work in future sessions
  const shouldSave = finalResult.length > 100;
  if (shouldSave) saveToMemory(role, task, finalResult);

  return {
    role,
    task,
    result:       finalResult,
    tools_called: toolsCalled,
    rounds,
    memory_saved: shouldSave,
  };
}
