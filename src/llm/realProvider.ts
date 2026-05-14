import OpenAI from 'openai';
import { config } from '../config.js';
import { type LlmProvider, type ChatCompletionRequest, type ChatCompletionResult, estimateTokensFromText } from './provider.js';
import { createNativeSession } from './nativeLlm.js';
import { QVXDirectProvider } from './qvxDirectProvider.js';

export function createLlmClient(): OpenAI {
  if (config.MODEL_PROVIDER === 'ollama') {
    return new OpenAI({ baseURL: `${config.OLLAMA_URL}/v1`, apiKey: 'ollama' });
  }
  if (config.MODEL_PROVIDER === 'google') {
    return new OpenAI({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: config.GOOGLE_AI_STUDIO_API_KEY ?? config.OPENAI_API_KEY ?? 'no-key',
    });
  }
  return new OpenAI({
    baseURL: config.OPENAI_BASE_URL,
    apiKey: config.OPENAI_API_KEY ?? 'no-key',
  });
}

export function resolveModel(requestedModel: string, type: 'chat' | 'code' = 'chat'): string {
  if (!requestedModel || requestedModel === 'vera-mock') {
    return type === 'code' ? config.DEFAULT_CODE_MODEL : config.DEFAULT_CHAT_MODEL;
  }
  return requestedModel;
}

export class RealProvider implements LlmProvider {
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const client = createLlmClient();
    const model = resolveModel(req.model);

    const response = await client.chat.completions.create({
      model,
      messages: req.messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: req.max_tokens,
      temperature: req.temperature,
    });

    const content = response.choices[0]?.message.content ?? '';
    const usage = response.usage;

    return {
      content,
      promptTokens: usage?.prompt_tokens ?? estimateTokensFromText(req.messages.map((m) => m.content).join('\n')),
      completionTokens: usage?.completion_tokens ?? estimateTokensFromText(content),
    };
  }
}

export class NativeProvider implements LlmProvider {
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const { session, dispose } = createNativeSession({});
    try {
      const msgs = req.messages;
      const lastMsg = msgs[msgs.length - 1];
      let content = '';
      await session.prompt(lastMsg.content ?? '', {
        onTextChunk: (chunk: string) => { content += chunk; },
      });
      return {
        content,
        promptTokens: estimateTokensFromText(msgs.map((m) => m.content).join('\n')),
        completionTokens: estimateTokensFromText(content),
      };
    } finally {
      dispose();
    }
  }
}

export function createProvider(): LlmProvider {
  if (config.MODEL_PROVIDER === 'native') return new NativeProvider();
  if (config.MODEL_PROVIDER === 'qvx-direct') return new QVXDirectProvider();
  return new RealProvider();
}

export function isGoogleProvider(): boolean {
  return config.MODEL_PROVIDER === 'google';
}
