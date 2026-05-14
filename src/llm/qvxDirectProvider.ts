import axios from 'axios';
import { config } from '../config.js';
import { type LlmProvider, type ChatCompletionRequest, type ChatCompletionResult, estimateTokensFromText } from './provider.js';

interface InferRequest {
  model: string;
  prompt: string;
  system_prompt: string;
  max_new_tokens: number;
}

interface InferResponse {
  model: string;
  output: string;
  latency_ms: number;
  timestamp: number;
}

function buildQwenPrompt(messages: ChatCompletionRequest['messages']): {
  systemPrompt: string;
  userPrompt: string;
} {
  let systemPrompt = '';
  const turns: Array<{ role: string; content: string }> = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content ?? '';
    } else if (m.role === 'user' || m.role === 'assistant' || m.role === 'tool') {
      turns.push({ role: m.role, content: m.content ?? '' });
    }
  }

  if (turns.length === 0) return { systemPrompt, userPrompt: '' };

  const parts: string[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (i === 0) {
      parts.push(t.content);
    } else if (t.role === 'assistant') {
      parts.push(`<|im_end|>\n<|im_start|>assistant\n${t.content}`);
    } else if (t.role === 'tool') {
      parts.push(`<|im_end|>\n<|im_start|>user\n<tool_response>${t.content}</tool_response>`);
    } else {
      parts.push(`<|im_end|>\n<|im_start|>user\n${t.content}`);
    }
  }

  return { systemPrompt, userPrompt: parts.join('') };
}

export async function callQvxInfer(
  messages: ChatCompletionRequest['messages'],
  maxTokens?: number,
): Promise<string> {
  const { systemPrompt, userPrompt } = buildQwenPrompt(messages);

  const body: InferRequest = {
    model: 'vera-chat',
    prompt: userPrompt,
    system_prompt: systemPrompt,
    max_new_tokens: maxTokens ?? config.QVX_INFER_MAX_TOKENS,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.QVX_INFER_API_KEY) headers['X-API-Key'] = config.QVX_INFER_API_KEY;

  const res = await axios.post<InferResponse>(`${config.QVX_INFER_URL}/infer`, body, { headers, timeout: 120_000 });
  return res.data.output ?? '';
}

export class QVXDirectProvider implements LlmProvider {
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const content = await callQvxInfer(req.messages, req.max_tokens ?? config.QVX_INFER_MAX_TOKENS);
    return {
      content,
      promptTokens: estimateTokensFromText(req.messages.map((m) => m.content ?? '').join('\n')),
      completionTokens: estimateTokensFromText(content),
    };
  }
}
