/**
 * NVIDIA Nemotron Router
 * Optimized inference for Nemotron models (Nano/Super/Mega)
 * Local-first deployment via NIM, Ollama, or TensorRT-LLM
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface NemotronConfig {
  model: 'nemotron-nano' | 'nemotron-4-340b' | 'nemotron-3-8b' | string;
  provider: 'nim' | 'ollama' | 'triton';
  url: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface NemotronRequest {
  prompt: string;
  systemPrompt?: string;
  context?: string[];
  maxTokens?: number;
  temperature?: number;
  requireReasoning?: boolean;
  structuredOutput?: boolean;
}

export interface NemotronResult {
  content: string;
  reasoning?: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  provider: string;
  structured?: Record<string, unknown>;
}

export interface NemotronCapabilities {
  reasoning: boolean;
  structuredOutput: boolean;
  functionCalling: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

/**
 * NVIDIA Nemotron Model Router
 * Optimized for agentic tasks, reasoning, and structured outputs
 */
export class NemotronRouter extends EventEmitter {
  private config: NemotronConfig;
  private apiBaseUrl: string;
  private available = false;
  private capabilities: NemotronCapabilities;

  // Model specifications
  private readonly MODEL_SPECS: Record<string, NemotronCapabilities> = {
    'nemotron-nano': {
      reasoning: true,
      structuredOutput: true,
      functionCalling: true,
      contextWindow: 8192,
      maxOutputTokens: 2048,
    },
    'nemotron-3-8b': {
      reasoning: true,
      structuredOutput: true,
      functionCalling: true,
      contextWindow: 8192,
      maxOutputTokens: 4096,
    },
    'nemotron-4-340b': {
      reasoning: true,
      structuredOutput: true,
      functionCalling: true,
      contextWindow: 128000,
      maxOutputTokens: 8192,
    },
    'nemotron-4-15b': {
      reasoning: true,
      structuredOutput: true,
      functionCalling: true,
      contextWindow: 32768,
      maxOutputTokens: 4096,
    },
  };

  constructor(config: Partial<NemotronConfig> = {}) {
    super();
    
    this.config = {
      model: config.model || process.env.NEMOTRON_MODEL || 'nemotron-nano',
      provider: config.provider || (process.env.NEMOTRON_PROVIDER as NemotronConfig['provider']) || 'nim',
      url: config.url || process.env.NEMOTRON_URL || 'http://localhost:8000',
      apiKey: config.apiKey || process.env.NEMOTRON_API_KEY,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
      reasoningEffort: config.reasoningEffort || 'medium',
    };
    this.apiBaseUrl = this.normalizeApiBaseUrl(this.config.url);

    this.capabilities = this.MODEL_SPECS[this.config.model] || this.MODEL_SPECS['nemotron-nano'];
    
    logger.info('NemotronRouter', {
      message: 'Nemotron router initialized',
      model: this.config.model,
      provider: this.config.provider,
    });
  }

  /**
   * Check if Nemotron is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      let response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok && response.status === 404) {
        response = await fetch(`${this.apiBaseUrl}/models`, {
          method: 'GET',
          headers: this.getHeaders(),
        });
      }

      this.available = response.ok;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Run inference with Nemotron
   * Includes automatic retry logic for transient failures
   */
  async infer(request: NemotronRequest, retryCount: number = 2): Promise<NemotronResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // Build prompt with reasoning instructions if required
        let fullPrompt = this.buildPrompt(request);
        
        const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders(),
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
              ...(request.context?.map((c, i) => ({ 
                role: i % 2 === 0 ? 'user' : 'assistant', 
                content: c 
              })) || []),
              { role: 'user', content: fullPrompt },
            ],
            max_tokens: request.maxTokens || this.config.maxTokens,
            temperature: request.temperature || this.config.temperature,
            ...(request.structuredOutput && {
              response_format: { type: 'json_object' },
            }),
          }),
        });

        if (!response.ok) {
          throw new Error(`Nemotron inference failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.choices || data.choices.length === 0) {
          throw new Error('Nemotron returned empty response');
        }
        
        const content = data.choices[0]?.message?.content || '';
        
        // Parse reasoning if present
        let reasoning: string | undefined;
        let structured: Record<string, unknown> | undefined;
        
        if (request.requireReasoning) {
          const parsed = this.extractReasoning(content);
          reasoning = parsed.reasoning;
          structured = parsed.structured;
        } else if (request.structuredOutput) {
          try {
            structured = JSON.parse(content);
          } catch {
            structured = undefined;
          }
        }

        const latencyMs = Date.now() - startTime;
        
        this.emit('inference:complete', {
          model: this.config.model,
          latencyMs,
          tokensUsed: data.usage?.total_tokens || 0,
          attempts: attempt + 1,
        });

        return {
          content: reasoning ? structured?.response || content : content,
          reasoning,
          model: this.config.model,
          tokensUsed: data.usage?.total_tokens || 0,
          latencyMs,
          provider: this.config.provider,
          structured,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Only retry on transient errors (5xx, network errors)
        const isTransient = lastError.message.includes('500') || 
                           lastError.message.includes('502') || 
                           lastError.message.includes('503') ||
                           lastError.message.includes('504') ||
                           lastError.message.includes('fetch failed');
        
        if (!isTransient || attempt === retryCount) {
          break;
        }
        
        // Exponential backoff: 100ms, 200ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        
        logger.warn('NemotronRouter', {
          message: `Retrying inference (attempt ${attempt + 2}/${retryCount + 1})`,
          error: lastError.message,
        });
      }
    }
    
    logger.error('NemotronRouter', {
      message: 'Inference failed after all retries',
      error: lastError?.message,
      model: this.config.model,
    });
    
    throw lastError || new Error('Inference failed');
  }

  /**
   * Chain-of-thought reasoning with Nemotron
   */
  async reason(
    problem: string,
    steps: number = 3
  ): Promise<{ conclusion: string; chain: string[] }> {
    const chain: string[] = [];
    let currentProblem = problem;

    for (let i = 0; i < steps; i++) {
      const result = await this.infer({
        prompt: `Step ${i + 1}/${steps}: ${currentProblem}`,
        systemPrompt: `You are a step-by-step reasoning engine. Analyze the problem carefully, then provide:
1. Your reasoning for this step
2. Your intermediate conclusion

Format: REASONING: [your analysis] CONCLUSION: [your output]`,
        requireReasoning: true,
        temperature: 0.3, // Lower temp for reasoning
      });

      chain.push(result.content);
      
      if (result.reasoning) {
        currentProblem = `Previous conclusion: ${result.content}. Continue to next step.`;
      }
    }

    // Final synthesis
    const final = await this.infer({
      prompt: `Synthesize the following chain of reasoning into a final conclusion:\n${chain.join('\n')}`,
      temperature: 0.5,
    });

    return {
      conclusion: final.content,
      chain,
    };
  }

  /**
   * Structured output generation
   */
  async generateStructured<T extends Record<string, unknown>>(
    prompt: string,
    schema: string,
    systemPrompt?: string
  ): Promise<T> {
    const result = await this.infer({
      prompt: `${prompt}\n\nRespond with valid JSON matching this schema:\n${schema}`,
      systemPrompt: systemPrompt || 'You are a structured data generator. Output valid JSON only.',
      structuredOutput: true,
      temperature: 0.2,
    });

    if (result.structured) {
      return result.structured as T;
    }

    throw new Error('Failed to generate structured output');
  }

  /**
   * Get model capabilities
   */
  getCapabilities(): NemotronCapabilities {
    return this.capabilities;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<NemotronConfig>): void {
    this.config = { ...this.config, ...updates };
    this.apiBaseUrl = this.normalizeApiBaseUrl(this.config.url);
    this.capabilities = this.MODEL_SPECS[this.config.model] || this.capabilities;
    
    logger.info('NemotronRouter', {
      message: 'Configuration updated',
      model: this.config.model,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): NemotronConfig {
    return { ...this.config };
  }

  /**
   * Check if model supports feature
   */
  supports(feature: keyof NemotronCapabilities): boolean {
    return this.capabilities[feature] as boolean;
  }

  /**
   * Build full prompt with reasoning instructions
   */
  private buildPrompt(request: NemotronRequest): string {
    let prompt = request.prompt;

    if (request.requireReasoning && this.config.reasoningEffort !== 'low') {
      prompt += '\n\nThink through this step-by-step. Provide REASONING followed by CONCLUSION.';
    }

    return prompt;
  }

  /**
   * Extract reasoning and structured output from response
   */
  private extractReasoning(content: string): { reasoning?: string; structured?: Record<string, unknown> } {
    const reasoningMatch = content.match(/REASONING:\s*([^]+?)(?=CONCLUSION:|$)/i);
    const conclusionMatch = content.match(/CONCLUSION:\s*([^]+)/i);

    const reasoning = reasoningMatch?.[1]?.trim();
    const conclusion = conclusionMatch?.[1]?.trim() || content;

    // Try to parse conclusion as JSON
    let structured: Record<string, unknown> | undefined;
    try {
      structured = JSON.parse(conclusion);
    } catch {
      structured = { response: conclusion };
    }

    return { reasoning, structured };
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private normalizeApiBaseUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }
}

// Export singleton instance
export const nemotronRouter = new NemotronRouter();
