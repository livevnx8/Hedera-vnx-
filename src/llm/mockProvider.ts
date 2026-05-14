import { estimateTokensFromText, type ChatCompletionRequest, type ChatCompletionResult, type LlmProvider } from './provider.js';

export class MockProvider implements LlmProvider {
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const content = lastUser ? lastUser.content : 'Hello.';

    const promptTokens = estimateTokensFromText(req.messages.map((m) => m.content).join('\n'));
    const completionTokens = estimateTokensFromText(content);

    return {
      content,
      promptTokens,
      completionTokens
    };
  }
}
