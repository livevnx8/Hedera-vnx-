import OpenAI from 'openai';
import { createLlmClient, resolveModel } from '../llm/realProvider.js';
import { ALL_TOOL_DEFINITIONS, type ToolDefinition } from './definitions.js';
import { buildSystemPrompt } from './system.js';
import { executeTool } from './executor.js';
import { PENDING_TX_SENTINEL } from '../hedera/txApproval.js';
import { runNativeAgentStream } from './nativeRunner.js';
import { runQvxDirectAgentStream } from './qvxDirectRunner.js';
import { config } from '../config.js';
import { rigTopology } from '../swarm/rigTopology.js';

export type InferenceTier = 'instant' | 'fast' | 'standard' | 'deep';

/**
 * Classify a model provider + model into an inference speed tier.
 * Used by the lattice to route tasks to the appropriate compute tier.
 */
export function classifyInferenceTier(provider: string, model?: string): InferenceTier {
  if (provider === 'native') return 'instant';
  if (provider === 'ollama') return 'fast';
  if (provider === 'google') return 'standard';
  if (provider === 'openai') return model?.includes('gpt-4') ? 'deep' : 'standard';
  if (provider === 'qvx-direct') return 'deep';
  return 'standard';
}

/**
 * True if the tier bypasses GPU/LLM entirely (deterministic / cache hit).
 */
export function isInstantTier(tier: InferenceTier): boolean {
  return tier === 'instant';
}

function buildXmlToolInstructions(tools: ToolDefinition[]): string {
  const toolList = tools.slice(0, 15).map(t => `  <tool name="${t.function.name}">\n    ${t.function.description.slice(0, 80)}...\n  </tool>`).join('\n');
  return `

## TOOL USAGE (XML FORMAT)

You have ${tools.length} tools available. When you need real-time data (prices, charts, search), you MUST use tools.

To call a tool, output XML exactly like this:

<tool name="get_price_chart">
{"token": "HBAR", "period": "7d"}
</tool>

Available tools:
${toolList}

After calling a tool, you will see the result and can respond with the actual data.
`;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

export type CandleData = { time: number; open: number; high: number; low: number; close: number };

export type PlanStepSummary = { step: number; action: string; tool: string | null };

export type AgentStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'chart'; symbol: string; tokenId: string; period: string; candles: CandleData[]; currentPrice: number; priceChange24h: number; priceChangePercent: number; high24h: number; low24h: number; coingeckoId?: string }
  | { type: 'pending_tx'; txId: string; tool: string; label: string; details: Record<string, unknown> }
  | { type: 'plan_phase'; phase: 'planning' | 'executing' | 'critiquing' | 'synthesizing' }
  | { type: 'plan'; goal: string; steps: PlanStepSummary[] }
  | { type: 'plan_step_start'; stepNum: number; action: string }
  | { type: 'plan_step_done'; stepNum: number; error?: boolean; error_message?: string; duration_ms?: number }
  | { type: 'critique'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'inference_tier'; tier: InferenceTier; gpuId?: number; gpuModel?: string }
  | { type: 'done' };

const MAX_TOOL_ROUNDS = 8;

export async function* runAgentStream(params: {
  messages: ChatMessage[];
  model?: string;
  enableTools?: boolean;
  plannerMode?: boolean;
}): AsyncGenerator<AgentStreamEvent> {
  const tier = classifyInferenceTier(config.MODEL_PROVIDER, params.model);

  if (config.MODEL_PROVIDER === 'native') {
    yield { type: 'inference_tier', tier };
    yield* runNativeAgentStream(params);
    return;
  }

  const gpu = !isInstantTier(tier) ? rigTopology.pickGpu(tier) : null;
  const startMs = Date.now();

  yield {
    type: 'inference_tier',
    tier,
    ...(gpu ? { gpuId: gpu.id, gpuModel: gpu.model } : {}),
  };

  try {
    // QVX-direct: use planner or raw QVX runner (both rely on callQvxInfer)
    if (config.MODEL_PROVIDER === 'qvx-direct') {
      const { runPlannerAgentStream, isComplexMultiStepTask } = await import('./plannerRunner.js');
      const shouldPlan = params.plannerMode || isComplexMultiStepTask(params.messages);
      if (shouldPlan) {
        yield* runPlannerAgentStream(params.messages);
        return;
      }
      yield* runQvxDirectAgentStream(params);
      return;
    }
    // All OpenAI-compatible providers (openai, google, ollama, custom): use native tool calling
    // Ollama falls back to XML parsing if native tools not supported
    yield* runOpenAIAgentStream(params);
  } finally {
    if (gpu) {
      rigTopology.releaseGpu(gpu.id, Date.now() - startMs);
    }
  }
}

async function* runOpenAIAgentStream(params: {
  messages: ChatMessage[];
  model?: string;
  enableTools?: boolean;
}): AsyncGenerator<AgentStreamEvent> {
  const client = createLlmClient();
  const model = resolveModel(params.model ?? '');
  const isOllama = config.MODEL_PROVIDER === 'ollama';
  let tools = (params.enableTools !== false ? ALL_TOOL_DEFINITIONS : []) as ToolDefinition[];

  // For Ollama, add XML tool instructions since it doesn't support native tool calling
  const xmlToolInstructions = isOllama && tools.length > 0 ? buildXmlToolInstructions(tools) : '';

  const conversation: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() + xmlToolInstructions },
    ...params.messages,
  ];

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let fullContent = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const pendingToolCalls: Record<number, { id: string; name: string; arguments: string }> = {};
    let hasToolCalls = false;

    let stream;
    try {
      stream = await client.chat.completions.create({
        model,
        messages: conversation as OpenAI.ChatCompletionMessageParam[],
        tools: tools.length > 0 ? (tools as OpenAI.ChatCompletionTool[]) : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,
        stream_options: { include_usage: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (tools.length > 0 && msg.includes('does not support tools')) {
        tools = [];
        stream = await client.chat.completions.create({
          model,
          messages: conversation as OpenAI.ChatCompletionMessageParam[],
          stream: true,
          stream_options: { include_usage: true },
        });
      } else {
        throw err;
      }
    }

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      if (chunk.usage) {
        totalPromptTokens += chunk.usage.prompt_tokens ?? 0;
        totalCompletionTokens += chunk.usage.completion_tokens ?? 0;
      }

      if (!choice) continue;

      const delta = choice.delta;

      if (delta.content) {
        fullContent += delta.content;
        // For Ollama, don't yield immediately - we'll filter XML after streaming
        if (!isOllama) {
          yield { type: 'text', content: delta.content };
        }
      }

      if (!isOllama && delta.tool_calls) {
        hasToolCalls = true;
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!pendingToolCalls[idx]) {
            pendingToolCalls[idx] = { id: '', name: '', arguments: '' };
          }
          if (tc.id) pendingToolCalls[idx].id = tc.id;
          if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) pendingToolCalls[idx].arguments += tc.function.arguments;
        }
      }
    }

    // For Ollama, parse XML tool calls from the complete response
    if (isOllama && tools.length > 0) {
      console.log('[DEBUG] Ollama fullContent:', fullContent.slice(0, 500));
      const toolRegex = /<tool\s+name="([^"]+)">\s*(\{[\s\S]*?\})\s*<\/tool>/g;
      let match;
      let toolIndex = 0;
      while ((match = toolRegex.exec(fullContent)) !== null) {
        console.log('[DEBUG] Found tool match:', match[1], match[2]);
        hasToolCalls = true;
        pendingToolCalls[toolIndex] = {
          id: `xml-${Date.now()}-${toolIndex}`,
          name: match[1],
          arguments: match[2]
        };
        toolIndex++;
      }
      // Remove tool XML from content and yield the rest
      if (hasToolCalls) {
        fullContent = fullContent.replace(toolRegex, '');
      }
      console.log('[DEBUG] After regex, fullContent:', fullContent.slice(0, 200));
      console.log('[DEBUG] hasToolCalls:', hasToolCalls);
      // Yield the non-XML content (if any)
      if (fullContent.trim()) {
        yield { type: 'text', content: fullContent };
      }
    }

    if (!hasToolCalls) {
      // For Ollama, if we have content but no tool calls, we're done
      if (isOllama && fullContent.trim()) {
        break; // Text was already yielded above
      }
      // For non-Ollama, break if no tool calls
      break;
    }

    const calls = Object.values(pendingToolCalls).filter((tc) => tc.name);
    if (calls.length === 0) break;

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: null,
      tool_calls: calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    conversation.push(assistantMessage);

    for (const tc of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }

      yield { type: 'tool_use', name: tc.name, args };

      const result = await executeTool(tc.name, args);

      // Detect pending tx sentinel — emit approval event and give placeholder result
      let toolResult = result;
      let chartEvent: AgentStreamEvent | null = null;
      try {
        const parsed = JSON.parse(result) as Record<string, unknown>;
        if (parsed[PENDING_TX_SENTINEL]) {
          yield {
            type: 'pending_tx',
            txId: parsed['txId'] as string,
            tool: parsed['tool'] as string,
            label: parsed['label'] as string,
            details: parsed['details'] as Record<string, unknown>,
          };
          toolResult = JSON.stringify({
            status: 'pending_approval',
            txId: parsed['txId'],
            message: 'Transaction queued — waiting for user approval in the UI.',
          });
        } else if (parsed['__chart__'] === true) {
          // Emit chart event so frontend renders the visual
          chartEvent = {
            type: 'chart',
            symbol: parsed['symbol'] as string,
            tokenId: parsed['tokenId'] as string,
            period: parsed['period'] as string,
            candles: parsed['candles'] as CandleData[],
            currentPrice: parsed['currentPrice'] as number,
            priceChange24h: parsed['priceChange24h'] as number,
            priceChangePercent: parsed['priceChangePercent'] as number,
            high24h: parsed['high24h'] as number,
            low24h: parsed['low24h'] as number,
            coingeckoId: parsed['coingeckoId'] as string | undefined,
          };
          // Give Vera the text summary to read and analyse
          toolResult = parsed['summary'] as string;
        }
      } catch { /* not JSON, use raw result */ }

      if (chartEvent) yield chartEvent;
      yield { type: 'tool_result', name: tc.name, result: toolResult };

      conversation.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
        name: tc.name,
      });
    }
  }

  yield { type: 'usage', promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };
  yield { type: 'done' };
}
