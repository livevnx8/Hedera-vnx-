import { defineChatSessionFunction } from 'node-llama-cpp';
import { z } from 'zod';
import { createNativeSession } from '../llm/nativeLlm.js';
import { buildSystemPrompt } from './system.js';
import { executeTool } from './executor.js';
import type { ChatMessage, AgentStreamEvent } from './runner.js';

type HistoryItem =
  | { type: 'system'; text: string }
  | { type: 'user'; text: string }
  | { type: 'model'; response: string[] };

function convertToChatHistory(messages: ChatMessage[]): HistoryItem[] {
  const items: HistoryItem[] = [{ type: 'system', text: buildSystemPrompt() }];
  for (const m of messages) {
    if (m.role === 'user') items.push({ type: 'user', text: m.content ?? '' });
    else if (m.role === 'assistant') items.push({ type: 'model', response: [m.content ?? ''] });
  }
  return items;
}

function buildFunctions(emit: (e: AgentStreamEvent) => void) {
  function wrap<T extends z.ZodObject<z.ZodRawShape>>(
    name: string,
    description: string,
    params: T,
  ) {
    return defineChatSessionFunction({
      description,
      params: params as never,
      async handler(args) {
        const typedArgs = (args ?? {}) as Record<string, unknown>;
        emit({ type: 'tool_use', name, args: typedArgs });
        const result = await executeTool(name, typedArgs);
        emit({ type: 'tool_result', name, result });
        return result;
      },
    });
  }

  return {
    hedera_get_account_info: wrap(
      'hedera_get_account_info',
      'Get information about a Hedera account including HBAR balance, key, and memo.',
      z.object({ account_id: z.string().describe('Hedera account ID, e.g. 0.0.12345') }),
    ),
    hedera_get_balance: wrap(
      'hedera_get_balance',
      'Get the current HBAR balance of a Hedera account.',
      z.object({ account_id: z.string().describe('Hedera account ID') }),
    ),
    hedera_get_tokens: wrap(
      'hedera_get_tokens',
      'Get all HTS tokens held by a Hedera account.',
      z.object({ account_id: z.string().describe('Hedera account ID') }),
    ),
    hedera_search_tokens: wrap(
      'hedera_search_tokens',
      'Search for HTS tokens on Hedera by name or symbol. Use this to look up a token ID when you only know the token name (e.g. "GIB", "DOSA") or symbol (e.g. "HBARX", "WHBAR").',
      z.object({
        query: z.string().describe('Token name or symbol to search for'),
        limit: z.number().optional().describe('Max results (default 10)'),
      }),
    ),
    hedera_transfer_hbar: wrap(
      'hedera_transfer_hbar',
      'Transfer HBAR from the operator account to another Hedera account. Always confirm with user first.',
      z.object({
        to_account_id: z.string().describe('Destination Hedera account ID'),
        amount_hbar: z.number().describe('Amount of HBAR to transfer (positive number)'),
        memo: z.string().optional().describe('Optional transaction memo'),
      }),
    ),
    hedera_hcs_send_message: wrap(
      'hedera_hcs_send_message',
      'Publish a message to a Hedera Consensus Service (HCS) topic.',
      z.object({
        topic_id: z.string().optional().describe('HCS topic ID; omit to use the default configured topic'),
        message: z.string().describe('Message content to publish'),
      }),
    ),
    hedera_hcs_get_messages: wrap(
      'hedera_hcs_get_messages',
      'Read recent messages from an HCS topic.',
      z.object({
        topic_id: z.string().optional().describe('HCS topic ID; omit to use the default'),
        limit: z.number().optional().describe('Max messages to return (default 25, max 100)'),
      }),
    ),
    hedera_get_transaction: wrap(
      'hedera_get_transaction',
      'Look up a Hedera transaction by its transaction ID.',
      z.object({ tx_id: z.string().describe('Hedera transaction ID') }),
    ),
    qvx_get_node_status: wrap(
      'qvx_get_node_status',
      'Get the current operational status of the QVX node.',
      z.object({}),
    ),
    qvx_get_node_metrics: wrap(
      'qvx_get_node_metrics',
      'Get performance metrics from the QVX node.',
      z.object({}),
    ),
  };
}

export async function* runNativeAgentStream(params: {
  messages: ChatMessage[];
  enableTools?: boolean;
}): AsyncGenerator<AgentStreamEvent> {
  if (params.messages.length === 0) {
    yield { type: 'done' };
    return;
  }

  const priorMessages = params.messages.slice(0, -1);
  const lastMessage = params.messages[params.messages.length - 1];
  const history = convertToChatHistory(priorMessages) as Parameters<
    ReturnType<typeof createNativeSession>['session']['setChatHistory']
  >[0];

  const { session, dispose } = createNativeSession({});

  try {
    await session.setChatHistory(history);

    const queue: AgentStreamEvent[] = [];
    let done = false;
    let err: unknown = null;
    let notify: (() => void) | null = null;

    const emit = (event: AgentStreamEvent) => {
      queue.push(event);
      notify?.();
      notify = null;
    };

    const waitForNext = () =>
      new Promise<void>((resolve) => {
        if (queue.length > 0 || done || err) resolve();
        else notify = resolve;
      });

    const functions = params.enableTools !== false ? buildFunctions(emit) : undefined;

    const promptOptions: any = {
      functions,
      onTextChunk(chunk: string) {
        emit({ type: 'text', content: chunk });
      },
    };

    session
      .prompt(lastMessage.content ?? '', promptOptions)
      .then(() => {
        emit({ type: 'usage', promptTokens: 0, completionTokens: 0 });
        done = true;
        notify?.();
        notify = null;
      })
      .catch((e: unknown) => {
        err = e;
        done = true;
        notify?.();
        notify = null;
      });

    while (true) {
      await waitForNext();
      while (queue.length > 0) yield queue.shift()!;
      if (err) throw err instanceof Error ? err : new Error(String(err));
      if (done && queue.length === 0) {
        yield { type: 'done' };
        return;
      }
    }
  } finally {
    dispose();
  }
}
