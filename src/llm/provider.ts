export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
};

export type ChatCompletionResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
};

export interface LlmProvider {
  chat(req: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

export function estimateTokensFromText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
