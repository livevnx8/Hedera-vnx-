/**
 * Smart Chat Orchestrator
 *
 * Wraps Vera's chat pipeline and integrates the full Vera tech stack:
 *
 *   1. Intent classifier routes the message:
 *        - `small_talk`  → direct Ollama call (fast, no cascade)
 *        - `tool_call`   → extract tool + args → behaviorAdapter.pickBestTool()
 *                          → executeTool() → inject result into final reply
 *        - `reasoning`   → full oasisChat cascade (slow, high quality)
 *
 *   2. Every turn records to:
 *        - agentLearningSystem (for adaptation)
 *        - actionVerifier → HCS audit topic (for provenance)
 *
 *   3. Streams as NDJSON so the UI shows progressive text.
 *
 * @module vera/chat/smartChatOrchestrator
 */

import { EventEmitter } from 'events';
import { createHash } from 'node:crypto';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import type { VnxSwarmPromptContext } from '../../vnx/swarmPromptContext.js';

export type Intent = 'small_talk' | 'tool_call' | 'reasoning';

export interface ChatTurn {
  sessionId: string;
  userId: string;
  message: string;
  showTrace?: boolean;
}

export interface ChatResponse {
  response: string;
  intent: Intent;
  durationMs: number;
  toolsCalled: string[];
  confidence: number;
  sovereign: boolean;
  provider: string;
  model: string;
  thinkingTrace?: string;
  metadata?: Record<string, unknown>;
}

// ─── Intent classifier ────────────────────────────────────────────────────

const SMALL_TALK_PATTERNS = [
  /^\s*(hi|hey|hello|yo|sup|hola|greetings)[\s!.?]*$/i,
  /^\s*(thanks|thank you|ty|thx)[\s!.?]*$/i,
  /^\s*(bye|goodbye|cya|later)[\s!.?]*$/i,
  /^\s*(how are you|how'?s it going|what'?s up)[\s!.?]*$/i,
  /^\s*(who are you|what are you)[\s!.?]*$/i,
  /^\s*(ok|okay|cool|nice|got it)[\s!.?]*$/i,
];

/**
 * Tool-intent keywords mapped to candidate tool names (executor-registered).
 * First match wins, so put more specific patterns earlier.
 */
const TOOL_INTENTS: Array<{ pattern: RegExp; candidates: string[]; extract?: (m: string) => Record<string, unknown> }> = [
  // ─── Exchange rate (more specific than 'hbar' — must come before balance) ─
  {
    pattern: /\b(exchange\s+rate|hbar\s+to\s+usd|usd\s+price|hbar\s+price|price\s+of\s+hbar)\b/i,
    candidates: ['kit_get_exchange_rate'],
    extract: () => ({}),
  },

  // ─── Network / economics ──────────────────────────────────────────────
  {
    pattern: /\b(network\s+stats|network\s+status|hedera\s+stats|node\s+count|tps)\b/i,
    candidates: ['get_network_status'],
    extract: () => ({}),
  },

  // ─── Balance & account ────────────────────────────────────────────────
  {
    pattern: /\b(balance|hbar|account\s+balance|how\s+much\s+hbar)\b/i,
    candidates: ['hedera_get_balance'],
    extract: (m) => {
      const id = m.match(/\b(0\.0\.\d+)\b/)?.[1];
      return { account_id: id || config.HEDERA_OPERATOR_ACCOUNT_ID };
    },
  },
  {
    pattern: /\b(account\s+info|who\s+owns|account\s+details|staking)\b/i,
    candidates: ['hedera_get_account_info'],
    extract: (m) => {
      const id = m.match(/\b(0\.0\.\d+)\b/)?.[1];
      return { account_id: id || config.HEDERA_OPERATOR_ACCOUNT_ID };
    },
  },
  {
    pattern: /\b(transaction|tx)\b/i,
    candidates: ['hedera_get_transaction', 'kit_get_transaction_record'],
    extract: (m) => {
      const txId = m.match(/(\d+\.\d+\.\d+@\d+\.\d+)/)?.[1];
      return { transaction_id: txId };
    },
  },

  // ─── Tokens ───────────────────────────────────────────────────────────
  {
    pattern: /\b(search\s+token|find\s+token|lookup\s+token)\b/i,
    candidates: ['hedera_search_tokens'],
    extract: (m) => {
      const q = m.match(/(?:search|find|lookup).*?for\s+['"]?([A-Za-z0-9_ -]+)['"]?/i)?.[1]
        ?? m.split(/\s+/).slice(-1)[0];
      return { query: q, limit: 5 };
    },
  },
  {
    pattern: /\b(my\s+tokens|list\s+tokens|what\s+tokens|token\s+holdings)\b/i,
    candidates: ['hedera_get_tokens'],
    extract: () => ({ account_id: config.HEDERA_OPERATOR_ACCOUNT_ID }),
  },
  {
    pattern: /\btoken\s+info\b|\bdetails\s+(?:on|for|about)\s+token\b/i,
    candidates: ['hedera_get_token_info'],
    extract: (m) => {
      const id = m.match(/\b(0\.0\.\d+)\b/)?.[1];
      return { token_id: id };
    },
  },

  // ─── NFTs (query capability — note: no registered list-nfts-for-account tool,
  // so we defer to reasoning with context) ─────────────────────────────────
  // (intentionally omitted — would need a new tool registration)

  // ─── SaucerSwap DEX ────────────────────────────────────────────────────
  {
    pattern: /\b(saucerswap|sauce)\s+(pools?|liquidity)\b/i,
    candidates: ['saucerswap_get_pools'],
    extract: () => ({ limit: 5 }),
  },
  {
    pattern: /\b(price\s+of|token\s+price|how\s+much\s+is|quote\s+for)\b/i,
    candidates: ['saucerswap_get_token_price'],
    extract: (m) => {
      const id = m.match(/\b(0\.0\.\d+)\b/)?.[1];
      return { token_id: id };
    },
  },

  // ─── HCS topics ────────────────────────────────────────────────────────
  {
    pattern: /\b(topic\s+info|topic\s+details|hcs\s+topic)\b/i,
    candidates: ['kit_get_topic_info'],
    extract: (m) => {
      const id = m.match(/\b(0\.0\.\d+)\b/)?.[1];
      return { topic_id: id };
    },
  },

  // ─── Trending topics on Hedera ────────────────────────────────────────
  {
    pattern: /\btrending\b/i,
    candidates: ['get_trending_topics'],
    extract: () => ({}),
  },

  // ─── Contracts ─────────────────────────────────────────────────────────
  {
    pattern: /\b(contract\s+info|contract\s+details|smart\s+contract)\b/i,
    candidates: ['kit_get_contract_info'],
    extract: (m) => {
      const id = m.match(/\b(0\.0\.\d+)\b/)?.[1];
      return { contract_id: id };
    },
  },
];

export function classifyIntent(message: string): { intent: Intent; toolHint?: typeof TOOL_INTENTS[number] } {
  if (SMALL_TALK_PATTERNS.some((r) => r.test(message))) return { intent: 'small_talk' };
  const hit = TOOL_INTENTS.find((t) => t.pattern.test(message));
  if (hit) return { intent: 'tool_call', toolHint: hit };
  // Default to reasoning for anything non-trivial
  return { intent: 'reasoning' };
}

// ─── Ollama fast path ─────────────────────────────────────────────────────

async function askOllama(prompt: string, systemPrompt?: string): Promise<string> {
  const res = await fetch(`${config.OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.DEFAULT_CHAT_MODEL || 'llama3.1:8b',
      prompt,
      system: systemPrompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 256 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return data.response?.trim() || '';
}

// ─── Main orchestrator ────────────────────────────────────────────────────

class SmartChatOrchestrator extends EventEmitter {
  async handle(turn: ChatTurn): Promise<ChatResponse> {
    const startedAt = Date.now();
    const { intent, toolHint } = classifyIntent(turn.message);
    const toolsCalled: string[] = [];
    let response = '';
    let confidence = 0.5;
    let provider = 'local';
    let model = config.DEFAULT_CHAT_MODEL || 'llama3.1:8b';
    let thinkingTrace: string | undefined;
    let metadata: Record<string, unknown> | undefined;

    try {
      const swarmContext = await this.buildSwarmContext(turn.message);
      const swarmPromptContext = swarmContext?.promptContext ? `\n\n${swarmContext.promptContext}` : '';
      void this.emitSwarmSignals(turn.message, swarmContext);

      if (intent === 'small_talk') {
        // Fast path — skip cascade entirely
        response = await askOllama(
          turn.message,
          `You are Vera, a concise local AI. Keep replies under 3 sentences. You have ${124} tools ready if the user needs real data.${swarmPromptContext}`
        );
        confidence = 0.9;
      } else if (intent === 'tool_call' && toolHint) {
        // Tool path — consult behaviorAdapter, call tool, incorporate result
        const { behaviorAdapter } = await import('../adaptation/behaviorAdapter.js');
        const { executeTool } = await import('../../agent/executor.js');
        const picked = behaviorAdapter.pickBestTool(toolHint.candidates) || toolHint.candidates[0];
        const args = toolHint.extract?.(turn.message) ?? {};
        toolsCalled.push(picked);

        let toolResult = '';
        try {
          toolResult = await executeTool(picked, args, `chat:${turn.userId}`);
        } catch (e) {
          toolResult = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
        }

        // Ask Ollama to summarize the tool output for the user
        response = await askOllama(
          `The user asked: "${turn.message}"\n\nI called the tool \`${picked}\` and got this result:\n\n${toolResult.slice(0, 1500)}\n\nExplain it in 2-4 sentences.`,
          `You are Vera. Summarize tool output clearly and concisely. If there was an error, explain what went wrong plainly.${swarmPromptContext}`
        );
        confidence = 0.85;
        metadata = { toolResult: toolResult.slice(0, 500), toolPicked: picked, toolArgs: args };
      } else {
        // Reasoning path — full cascade
        const { oasisChat } = await import('./veraOasisChatIntegration.js');
        const result = await oasisChat.processMessage(turn.sessionId, turn.userId, turn.message, { swarmContext });
        response = result.message?.content || 'I processed your request.';
        confidence = result.confidence;
        provider = result.provider ?? provider;
        model = result.model ?? model;
        thinkingTrace = turn.showTrace ? result.thinkingTrace : undefined;
        metadata = result.metadata as Record<string, unknown>;
      }

      if (swarmContext) {
        metadata = {
          ...(metadata || {}),
          vnxSwarm: {
            enabled: swarmContext.enabled,
            briefing: swarmContext.briefing,
            selected: swarmContext.selected.map((item) => ({
              id: item.id,
              name: item.name,
              score: item.score,
              reasons: item.reasons,
              guidance: item.guidance,
            })),
            outputs: swarmContext.outputs.map((item) => ({
              id: item.id,
              confidence: item.confidence,
              routeScore: item.routeScore,
              elapsedMs: item.elapsedMs,
              error: item.error,
            })),
          },
        };
      }

      // Fire-and-forget: record to learning + verify to HCS
      void this.recordTurn(turn, response, intent, toolsCalled, Date.now() - startedAt);

      return {
        response,
        intent,
        durationMs: Date.now() - startedAt,
        toolsCalled,
        confidence,
        sovereign: true,
        provider,
        model,
        thinkingTrace,
        metadata,
      };
    } catch (error) {
      logger.error('SmartChat', {
        message: 'Chat orchestration failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async buildSwarmContext(message: string): Promise<VnxSwarmPromptContext | null> {
    try {
      const { buildVnxSwarmPromptContext } = await import('../../vnx/swarmPromptContext.js');
      return await buildVnxSwarmPromptContext(message, { maxSpecialists: 4, maxTokens: 48 });
    } catch (error) {
      logger.warn('SmartChat', {
        message: 'VNX swarm context unavailable',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async emitSwarmSignals(message: string, swarmContext: VnxSwarmPromptContext | null): Promise<void> {
    if (!swarmContext) return;

    try {
      const { emitVnxSignal } = await import('../../vnx/qvxBridge.js');
      const promptHash = createHash('sha256').update(message).digest('hex');
      const selected = swarmContext.selected.map((item) => ({
        id: item.id,
        score: item.score,
        reasons: item.reasons,
      }));

      await emitVnxSignal('vnx.swarm.selected', {
        promptHash,
        selected,
        maxSpecialists: swarmContext.maxSpecialists,
      });

      if (swarmContext.promptContext) {
        await emitVnxSignal('vnx.swarm.context_injected', {
          promptHash,
          selected,
          outputCount: swarmContext.outputs.filter((item) => item.output && !item.error).length,
          enabled: swarmContext.enabled,
        });
      }
    } catch {
      // QVX signal emission is advisory and must never block chat.
    }
  }

  private async recordTurn(
    turn: ChatTurn,
    reply: string,
    intent: Intent,
    toolsCalled: string[],
    durationMs: number,
  ): Promise<void> {
    // Learning record
    try {
      const { agentLearningSystem } = await import('../../agent/learningSystem.js');
      agentLearningSystem.recordToolUsage({
        toolName: `chat:${intent}`,
        agentId: `chat:${turn.userId}`,
        input: turn.message.slice(0, 500),
        output: reply.slice(0, 500),
        success: true,
        durationMs,
        timestamp: Date.now(),
      });
    } catch {
      // Non-fatal
    }

    // HCS audit via actionVerifier
    try {
      const { actionVerifier } = await import('../verification/actionVerifier.js');
      await actionVerifier.verifyAction({
        domain: 'chat',
        type: intent,
        actor: `chat:${turn.userId}`,
        payload: {
          sessionId: turn.sessionId,
          userMessage: turn.message.slice(0, 500),
          veraReply: reply.slice(0, 500),
          toolsCalled,
          durationMs,
        },
      });
    } catch {
      // Non-fatal — HCS submit may fail due to balance; local proof is cached
    }
  }
}

export const smartChat = new SmartChatOrchestrator();
