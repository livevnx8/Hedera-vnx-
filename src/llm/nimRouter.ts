/**
 * NVIDIA NIM Router
 * 
 * High-performance inference using NVIDIA NIM microservices.
 * NIM provides optimized model serving with TensorRT-LLM acceleration.
 * Falls back to vLLM → Ollama if NIM unavailable.
 * 
 * @module llm/nimRouter
 */

import { EventEmitter } from 'events';
import OpenAI from 'openai';

export interface NIMConfig {
  url: string;
  model: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface NIMRequest {
  prompt: string;
  systemPrompt?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  complexity?: number;
}

export interface NIMResult {
  content: string;
  model: string;
  latencyMs: number;
  tokensUsed: number;
  provider: 'nim' | 'vllm' | 'ollama';
  sovereign: boolean;
  finishReason?: string;
}

export type NIMStreamCallback = (chunk: string) => void;

export class NIMRouter extends EventEmitter {
  private client: OpenAI | null = null;
  private config: NIMConfig;
  private apiBaseUrl: string;
  private available = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: Partial<NIMConfig> = {}, options: { startHealthChecks?: boolean } = {}) {
    super();
    this.config = {
      url: config.url || process.env.NIM_URL || 'http://localhost:8000',
      model: config.model || process.env.NIM_MODEL || 'meta/llama3-8b-instruct',
      apiKey: config.apiKey || process.env.NIM_API_KEY || 'nvidia-api-key',
      maxTokens: config.maxTokens || parseInt(process.env.NIM_MAX_TOKENS || '2048'),
      temperature: config.temperature || parseFloat(process.env.NIM_TEMPERATURE || '0.7'),
    };
    this.apiBaseUrl = this.normalizeApiBaseUrl(this.config.url);

    this.initialize();
    if (options.startHealthChecks !== false) {
      this.startHealthChecks();
    }
  }

  /**
   * Initialize NIM client
   */
  private initialize(): void {
    try {
      this.client = new OpenAI({
        baseURL: this.apiBaseUrl,
        apiKey: this.config.apiKey,
        timeout: 60000,
      });
      console.log('[NIM] Client initialized:', this.config.model);
    } catch (error) {
      console.error('[NIM] Failed to initialize:', error);
      this.client = null;
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.checkHealth();
    
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, 30000); // Check every 30s
    this.healthCheckInterval.unref?.();
  }

  /**
   * Check if NIM is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (response.ok) {
        if (!this.available) {
          this.available = true;
          this.emit('available');
          console.log('[NIM] Available - TensorRT-LLM optimized inference ready');
        }
        return true;
      }
    } catch (error) {
      // NIM not available
    }

    if (this.available) {
      this.available = false;
      this.emit('unavailable');
      console.log('[NIM] Unavailable - will fallback to vLLM/Ollama');
    }
    return false;
  }

  /**
   * Check if NIM is currently available
   */
  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  /**
   * Run inference with NIM
   */
  async infer(request: NIMRequest, callback?: NIMStreamCallback): Promise<NIMResult> {
    const startTime = Date.now();

    if (!this.isAvailable() || !this.client) {
      throw new Error('NIM not available');
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    
    messages.push({ role: 'user', content: request.prompt });

    try {
      if (request.stream && callback) {
        return await this.streamInfer(messages, request, callback, startTime);
      } else {
        return await this.batchInfer(messages, request, startTime);
      }
    } catch (error) {
      console.error('[NIM] Inference error:', error);
      throw error;
    }
  }

  /**
   * Batch inference
   */
  private async batchInfer(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    request: NIMRequest,
    startTime: number
  ): Promise<NIMResult> {
    const response = await this.client!.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      stream: false,
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    this.emit('complete', {
      latencyMs,
      tokensUsed,
      model: this.config.model,
    });

    return {
      content,
      model: this.config.model,
      latencyMs,
      tokensUsed,
      provider: 'nim',
      sovereign: true,
      finishReason: response.choices[0]?.finish_reason || 'stop',
    };
  }

  /**
   * Streaming inference
   */
  private async streamInfer(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    request: NIMRequest,
    callback: NIMStreamCallback,
    startTime: number
  ): Promise<NIMResult> {
    const stream = await this.client!.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      stream: true,
    });

    let fullContent = '';
    let tokensUsed = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        tokensUsed++;
        callback(content);
      }
    }

    const latencyMs = Date.now() - startTime;

    this.emit('complete', {
      latencyMs,
      tokensUsed,
      model: this.config.model,
    });

    return {
      content: fullContent,
      model: this.config.model,
      latencyMs,
      tokensUsed,
      provider: 'nim',
      sovereign: true,
      finishReason: 'stop',
    };
  }

  /**
   * Get available models from NIM
   */
  async getModels(): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.data?.map((m: any) => m.id) || [];
      }
    } catch (error) {
      console.error('[NIM] Failed to get models:', error);
    }

    return [];
  }

  /**
   * Get NIM status
   */
  getStatus(): {
    available: boolean;
    model: string;
    url: string;
    tensorRT: boolean;
  } {
    return {
      available: this.available,
      model: this.config.model,
      url: this.config.url,
      tensorRT: true, // NIM always uses TensorRT-LLM optimization
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NIMConfig>): void {
    this.config = { ...this.config, ...config };
    this.apiBaseUrl = this.normalizeApiBaseUrl(this.config.url);
    this.initialize();
    this.checkHealth();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.client = null;
    this.available = false;
  }

  private normalizeApiBaseUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }
}

// Singleton instance
export const nimRouter = new NIMRouter();
export default nimRouter;
