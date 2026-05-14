/**
 * Sovereign LLM Router
 * Routes inference requests between local GPU and API fallback based on complexity
 * 
 * Complexity scoring:
 * - >0.7: Local model (Llama 13B) — center consciousness decisions
 * - 0.3-0.7: Local model — routine tasks, agent coordination
 * - <0.3: Cached patterns — no LLM call needed
 * 
 * API Fallback: Google AI Studio (Gemini) for complex reasoning when local insufficient
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { prometheus } from '../monitoring/prometheus.js';
import { config } from '../config.js';
import { hcsDomainLogger } from '../vera/logging/hcsDomainLogger.js';
import OpenAI from 'openai';
import { ALL_TOOL_DEFINITIONS, type ToolDefinition } from '../agent/definitions.js';
import { executeTool } from '../agent/executor.js';

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

export interface ComplexityFeatures {
  tokenCount: number;
  reasoningDepth: number;      // 0-1 based on keywords
  contextWindow: number;         // tokens of context needed
  creativityRequired: number;  // 0-1 for generative vs deterministic
  agentSpawning: boolean;        // spawning new agents = high complexity
  economicImpact: number;      // 0-1 HBAR value at stake
}

export interface InferenceRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  context?: Record<string, unknown>;
  creativityRequired?: boolean;  // For cache eligibility
  stream?: boolean;  // Enable streaming for faster perceived response
}

export interface InferenceResult {
  content: string;
  model: string;
  latencyMs: number;
  complexityScore: number;
  provider: 'local' | 'api' | 'cache' | 'vllm' | 'nim' | 'meridian';
  tokensUsed: number;
  sovereign: boolean;  // true if processed locally, false if API fallback
  routingReason?: string;
}

// Streaming callback type
export type StreamCallback = (chunk: string) => void;

export class SovereignLlmRouter extends EventEmitter {
  private localEndpoint: string;
  private apiClient: OpenAI | null = null;
  private apiModel: string;
  private complexityThresholds = {
    apiFallback: config.SOVEREIGN_COMPLEXITY_THRESHOLD ?? 0.85,
    cache: 0.2,
  };
  private requestHistory: Array<{ features: ComplexityFeatures; latency: number; quality: number; sovereign: boolean }> = [];
  private cache = new Map<string, { result: string; timestamp: number }>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private localModel: string;
  
  // Predictive response cache - pre-generated responses for common follow-ups
  private predictiveCache = new Map<string, { result: string; context: string; timestamp: number }>();
  private predictiveCacheTTL = 10 * 60 * 1000; // 10 minutes
  
  // vLLM for fast inference (optional)
  private vllmEnabled: boolean = false;
  private vllmUrl: string = 'http://localhost:8000';

  // NIM for TensorRT-LLM optimized inference (optional)
  private nimEnabled: boolean = false;
  private nimUrl: string = 'http://localhost:8000';

  // Meridian — BitNet ternary CPU inference (research prototype)
  private meridianEnabled: boolean = false;
  private meridianUrl: string = 'http://localhost:8123';
  private meridianBackend: 'pytorch' | 'bitnetcpp' = 'pytorch';

  constructor() {
    super();
    // Use Ollama endpoint for local inference (native API, not OpenAI compatible)
    this.localEndpoint = config.OLLAMA_URL || 'http://localhost:11434';
    this.localModel = config.SOVEREIGN_LOCAL_MODEL || config.DEFAULT_CHAT_MODEL || 'llama3.1:8b';
    this.apiModel = config.SOVEREIGN_FALLBACK_MODEL || 'gemini-1.5-flash-8b';
    
    // Enable NIM if configured (highest priority)
    this.nimEnabled = process.env.USE_NIM === 'true' || false;
    if (this.nimEnabled) {
      this.nimUrl = process.env.NIM_URL || 'http://localhost:8000';
      console.log('[SovereignRouter] NIM enabled at', this.nimUrl);
    }
    
    // Enable vLLM if configured (second priority)
    this.vllmEnabled = process.env.USE_VLLM === 'true' || false;
    if (this.vllmEnabled) {
      this.vllmUrl = process.env.VLLM_URL || 'http://localhost:8000';
      console.log('[SovereignRouter] vLLM enabled at', this.vllmUrl);
    }

    // Enable Meridian BitNet if configured (CPU ternary, 0.3–0.7 complexity band)
    this.meridianEnabled = config.ENABLE_MERIDIAN_BITNET === 'true' || false;
    if (this.meridianEnabled) {
      this.meridianUrl = config.MERIDIAN_URL || 'http://localhost:8123';
      this.meridianBackend = config.MERIDIAN_BACKEND;
      console.log('[SovereignRouter] Meridian BitNet enabled at', this.meridianUrl, 'backend=', this.meridianBackend);
    }
    
    // Initialize API client for fallback (Google AI Studio)
    if (config.GOOGLE_AI_STUDIO_API_KEY || config.OPENAI_API_KEY) {
      this.apiClient = new OpenAI({
        baseURL: config.MODEL_PROVIDER === 'google' 
          ? 'https://generativelanguage.googleapis.com/v1beta/openai'
          : (config.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
        apiKey: config.GOOGLE_AI_STUDIO_API_KEY || config.OPENAI_API_KEY || 'no-key',
      });
    }
    
    // Warm up the model to prevent cold starts
    this.warmupModel();
  }

  /**
   * Warm up the model by sending a dummy request
   * This keeps the model loaded in memory for faster responses
   */
  private async warmupModel(): Promise<void> {
    try {
      console.log('[SovereignRouter] Warming up model...');
      await fetch(`${this.localEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.localModel,
          prompt: 'Hello',
          stream: false,
          options: { num_predict: 1 },
        }),
      });
      console.log('[SovereignRouter] Model warmed up ✓');
    } catch (error) {
      console.warn('[SovereignRouter] Model warmup failed (Ollama may not be running):', error);
    }
  }

  /**
   * Predict and pre-generate likely responses based on conversation context
   * Call this after sending a response to pre-warm cache for next query
   */
  async predictAndPreload(context: string, lastResponse: string): Promise<void> {
    // Generate likely follow-up questions
    const likelyFollowUps = this.generateLikelyFollowUps(context, lastResponse);
    
    for (const query of likelyFollowUps) {
      const cacheKey = this.hashPrompt(query);
      
      // Skip if already cached
      if (this.predictiveCache.has(cacheKey)) continue;
      
      // Pre-generate response in background (don't await)
      this.preGenerateResponse(query, context).then(result => {
        if (result) {
          this.predictiveCache.set(cacheKey, {
            result,
            context,
            timestamp: Date.now(),
          });
          console.log(`[SovereignRouter] Pre-cached response for: "${query.slice(0, 30)}..."`);
        }
      }).catch(() => {
        // Ignore pre-generation errors
      });
    }
  }

  /**
   * Generate likely follow-up questions based on context
   */
  private generateLikelyFollowUps(context: string, lastResponse: string): string[] {
    const followUps: string[] = [];
    
    // Based on last response content, predict what user might ask next
    if (lastResponse.toLowerCase().includes('code') || lastResponse.includes('```')) {
      followUps.push('can you explain that code', 'how does this work', 'can you optimize this');
    }
    
    if (lastResponse.toLowerCase().includes('error') || lastResponse.includes('exception')) {
      followUps.push('how do I fix this', 'what caused this error', 'is there a better way');
    }
    
    if (context.toLowerCase().includes('help') || context.includes('?')) {
      followUps.push('thank you', 'that worked', 'what else can you do');
    }
    
    // Always include common follow-ups
    followUps.push('tell me more', 'why', 'how do you know that');
    
    return [...new Set(followUps)]; // Deduplicate
  }

  /**
   * Pre-generate a response for predictive caching
   */
  private async preGenerateResponse(query: string, context: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.localEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.localModel,
          prompt: `${context}\n\nUser: ${query}\nAssistant:`,
          stream: false,
          options: {
            temperature: 0.6,
            num_predict: 300, // Shorter for predictions
            num_gpu: 1,
            num_thread: 8,
          },
        }),
      });

      if (!response.ok) return null;
      
      const data = await response.json();
      return data.response || null;
    } catch {
      return null;
    }
  }

  /**
   * Check predictive cache for a pre-generated response
   */
  getPredictiveResponse(prompt: string): string | null {
    const cacheKey = this.hashPrompt(prompt);
    const cached = this.predictiveCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.predictiveCacheTTL) {
      // Remove from predictive cache (one-time use)
      this.predictiveCache.delete(cacheKey);
      return cached.result;
    }
    
    return null;
  }

  /**
   * Hash a prompt for caching
   */
  private hashPrompt(prompt: string): string {
    return prompt.toLowerCase().trim().slice(0, 100);
  }

  /**
   * Main inference method — routes to appropriate provider
   * 
   * Strategy:
   * 1. Check cache for low-complexity queries
   * 2. Default to local model (sovereign)
   * 3. Use API fallback only when complexity > threshold
   * 4. Log all routing decisions to HCS
   */
  async infer(request: InferenceRequest): Promise<InferenceResult> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Calculate complexity score
    const complexity = this.scoreComplexity(request);
    
    // Check for conversation history (disables caching for multi-turn chats)
    const hasConversationHistory = request.prompt.includes('User:') || request.prompt.includes('Vera:');
    
    // Check pre-warmed common response cache first (instant replies for simple queries)
    const commonResponse = this.getCommonResponse(request.prompt);
    if (commonResponse && !hasConversationHistory) {
      return {
        content: commonResponse,
        model: 'cache-instant',
        latencyMs: Date.now() - startTime,
        complexityScore: 0,
        provider: 'cache',
        tokensUsed: 0,
        sovereign: true,
        routingReason: 'common_pattern_cache',
      };
    }

    // Check cache for low-complexity, deterministic queries (only if no conversation history)
    if (complexity.score < this.complexityThresholds.cache && !request.creativityRequired && !hasConversationHistory) {
      const cacheKey = this.hashRequest(request);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return {
          content: cached.result,
          model: 'cache',
          latencyMs: Date.now() - startTime,
          complexityScore: complexity.score,
          provider: 'cache',
          tokensUsed: 0,
          sovereign: true,
          routingReason: 'cache_hit',
        };
      }
    }

    // Determine routing: local (sovereign) by default, API fallback for high complexity
    const useApiFallback = complexity.score >= this.complexityThresholds.apiFallback && this.apiClient !== null;
    const routingReason = useApiFallback 
      ? `complexity_${complexity.score.toFixed(2)}_exceeds_threshold_${this.complexityThresholds.apiFallback}`
      : 'default_local_sovereign';

    let result: InferenceResult;
    
    try {
      if (useApiFallback) {
        // High complexity with API available → API fallback
        result = await this.inferApi(request, complexity);
      } else {
        // Default → local sovereign model
        result = await this.inferLocal(request, complexity);
      }
    } catch (error) {
      // On API failure, fallback to local
      if (useApiFallback) {
        logger.warn('SovereignLlmRouter', {
          message: 'API fallback failed, switching to local',
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        result = await this.inferLocal(request, complexity);
      } else {
        throw error;
      }
    }

    // Add routing metadata
    result.routingReason = routingReason;

    // Store in cache if deterministic
    if (complexity.score < 0.3 && result.tokensUsed < 500) {
      this.cache.set(this.hashRequest(request), {
        result: result.content,
        timestamp: Date.now(),
      });
    }

    // Pre-generate likely follow-up responses in background
    if (result.content.length > 50) {
      const context = request.systemPrompt || '';
      this.predictAndPreload(context, result.content).catch(() => {
        // Ignore prediction errors
      });
    }

    // Record for learning
    this.requestHistory.push({
      features: complexity.features,
      latency: result.latencyMs,
      quality: this.estimateQuality(result),
      sovereign: result.sovereign,
    });
    if (this.requestHistory.length > 1000) {
      this.requestHistory.shift();
    }

    // Log to HCS for sovereignty audit trail
    this.logRoutingDecision(requestId, result, complexity).catch(err => {
      logger.warn('SovereignLlmRouter', { message: 'Failed to log routing to HCS', error: err });
    });

    this.emit('inference_complete', result);
    return result;
  }

  /**
   * Score complexity of a request (0-1)
   */
  private scoreComplexity(request: InferenceRequest): { score: number; features: ComplexityFeatures } {
    const prompt = request.prompt.toLowerCase();
    
    // Detect reasoning depth
    const reasoningKeywords = ['analyze', 'evaluate', 'compare', 'synthesize', 'explain why', 'trade-off'];
    const reasoningDepth = reasoningKeywords.reduce((acc, kw) => acc + (prompt.includes(kw) ? 0.2 : 0), 0);
    
    // Detect agent spawning
    const agentSpawning = /spawn|create.*agent|recruit|hire/i.test(prompt);
    
    // Detect economic impact
    const economicKeywords = ['hbars', 'dollars', 'budget', 'cost', 'revenue', 'token'];
    const economicImpact = economicKeywords.reduce((acc, kw) => acc + (prompt.includes(kw) ? 0.25 : 0), 0);
    
    // Context window estimation
    const contextWindow = (request.systemPrompt?.length || 0) + request.prompt.length;
    
    const features: ComplexityFeatures = {
      tokenCount: request.maxTokens || 1024,
      reasoningDepth: Math.min(1, reasoningDepth),
      contextWindow,
      creativityRequired: request.temperature && request.temperature > 0.7 ? 0.8 : 0.2,
      agentSpawning,
      economicImpact: Math.min(1, economicImpact),
    };

    // Weighted complexity score
    const score = Math.min(1,
      features.reasoningDepth * 0.3 +
      features.creativityRequired * 0.2 +
      (features.agentSpawning ? 0.3 : 0) +
      features.economicImpact * 0.2 +
      (contextWindow > 4000 ? 0.1 : 0)
    );

return { score, features };
}

  /**
   * Local sovereign inference (Llama 3.1 13B or configured local model)
   */
  private async inferLocal(
    request: InferenceRequest,
    complexity: { score: number; features: ComplexityFeatures }
  ): Promise<InferenceResult> {
    const startTime = Date.now();
    
    // Try NIM first (TensorRT-LLM optimized)
    if (this.nimEnabled) {
      const nimResult = await this.tryNIM(request);
      if (nimResult) {
        nimResult.latencyMs = Date.now() - startTime;
        logger.info('SovereignLlmRouter', {
          message: 'NIM inference complete',
          latencyMs: nimResult.latencyMs,
          tokensUsed: nimResult.tokensUsed,
        });
        return nimResult;
      }
    }
    
    // Try vLLM for speed
    if (this.vllmEnabled) {
      const vllmResult = await this.tryVLLM(request);
      if (vllmResult) {
        vllmResult.latencyMs = Date.now() - startTime;
        logger.info('SovereignLlmRouter', {
          message: 'vLLM inference complete',
          latencyMs: vllmResult.latencyMs,
          tokensUsed: vllmResult.tokensUsed,
        });
        return vllmResult;
      }
    }

    // Try Meridian BitNet (CPU ternary) for 0.3–0.7 complexity band
    if (this.meridianEnabled && complexity.score >= 0.3 && complexity.score <= 0.7) {
      const meridianResult = await this.tryMeridian(request);
      if (meridianResult) {
        meridianResult.latencyMs = Date.now() - startTime;
        logger.info('SovereignLlmRouter', {
          message: 'Meridian BitNet inference complete',
          latencyMs: meridianResult.latencyMs,
          tokensUsed: meridianResult.tokensUsed,
          model: 'meridian-bitnet',
        });
        return meridianResult;
      }
    }

    try {
      // Build prompt with system prompt and tool instructions if provided
      const tools = ALL_TOOL_DEFINITIONS;
      const xmlToolInstructions = tools.length > 0 ? buildXmlToolInstructions(tools) : '';
      const fullPrompt = request.systemPrompt 
        ? `${request.systemPrompt}${xmlToolInstructions}\n\nUser: ${request.prompt}\nAssistant:`
        : request.prompt;
      
      // Use Ollama native API with performance optimizations
      const response = await fetch(`${this.localEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.localModel,
          prompt: fullPrompt,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.6,  // Slightly lower for faster, more focused responses
            num_predict: request.maxTokens ?? 800,    // Reduced from 1024 for speed
            num_ctx: 4096,                            // Context window size
            top_k: 40,                                // Limit token sampling for speed
            top_p: 0.9,                               // Nucleus sampling
            repeat_penalty: 1.1,                      // Prevent repetition
            seed: Math.floor(Math.random() * 1000000), // Random seed for variety
            // Performance optimizations
            num_gpu: 1,                               // Use GPU
            num_thread: 8,                            // Use 8 threads  
            batch_size: 512,                          // Larger batch for throughput
            f16_kv: true,                             // Use FP16 for key/value cache
            // 4-bit quantization for 2x speedup and 50% less memory
            // Requires Ollama model pulled with --quantize q4_0
            ...(process.env.USE_4BIT === 'true' ? {
              quantization: 'q4_0',
            } : {})
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Local LLM error: ${response.status}`);
      }

      const data = await response.json();
      let content = data.response || '';
      const tokensUsed = data.eval_count || Math.ceil(content.length / 4);

      // Parse for tool calls
      const toolRegex = /<tool\s+name="([^"]+)">\s*(\{[\s\S]*?\})\s*<\/tool>/g;
      let match;
      const toolCalls = [];
      while ((match = toolRegex.exec(content)) !== null) {
        toolCalls.push({
          name: match[1],
          arguments: match[2],
        });
      }

      if (toolCalls.length > 0) {
        content = content.replace(toolRegex, '').trim();
        const toolResults = [];
        for (const tc of toolCalls) {
          let args = {};
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {}
          const result = await executeTool(tc.name, args);
          toolResults.push({ name: tc.name, result });
        }
        // This is a simplification. A full implementation would pass tool results back to the model.
        // For now, we'll just append them to the content.
        content += `\n\n<tool_results>\n${JSON.stringify(toolResults, null, 2)}\n</tool_results>`;
      }

      logger.info('SovereignLlmRouter', {
        message: 'Local sovereign inference complete',
        model: this.localModel,
        latencyMs: Date.now() - startTime,
        complexity: complexity.score.toFixed(2),
        tokensUsed,
      });

      return {
        content,
        model: this.localModel,
        latencyMs: Date.now() - startTime,
        complexityScore: complexity.score,
        provider: 'local',
        tokensUsed,
        sovereign: true,
      };
    } catch (error) {
      logger.error('SovereignLlmRouter', {
        message: 'Local inference failed',
        model: this.localModel,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Streaming inference for real-time responses
   * Returns tokens as they're generated for faster perceived speed
   */
  async inferStream(
    request: InferenceRequest,
    onChunk: StreamCallback,
    complexity?: { score: number; features: ComplexityFeatures }
  ): Promise<InferenceResult> {
    const startTime = Date.now();
    const comp = complexity ?? this.scoreComplexity(request);
    
    try {
      const fullPrompt = request.systemPrompt 
        ? `${request.systemPrompt}\n\nUser: ${request.prompt}\nAssistant:`
        : request.prompt;
      
      const response = await fetch(`${this.localEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.localModel,
          prompt: fullPrompt,
          stream: true,
          options: {
            temperature: request.temperature ?? 0.6,
            num_predict: request.maxTokens ?? 800,
            num_ctx: 4096,
            top_k: 40,
            top_p: 0.9,
            repeat_penalty: 1.1,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Local LLM error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let tokensUsed = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                fullContent += data.response;
                tokensUsed++;
                onChunk(data.response);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      return {
        content: fullContent,
        model: this.localModel,
        latencyMs: Date.now() - startTime,
        complexityScore: comp.score,
        provider: 'local',
        tokensUsed,
        sovereign: true,
      };
    } catch (error) {
      logger.error('SovereignLlmRouter', {
        message: 'Streaming inference failed',
        model: this.localModel,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * API fallback inference (Google AI Studio / OpenAI)
   * Used only for high-complexity requests when local model insufficient
   */
  private async inferApi(
    request: InferenceRequest,
    complexity: { score: number; features: ComplexityFeatures }
  ): Promise<InferenceResult> {
    const startTime = Date.now();
    
    if (!this.apiClient) {
      throw new Error('API fallback not configured - set GOOGLE_AI_STUDIO_API_KEY or OPENAI_API_KEY');
    }

    try {
      const response = await this.apiClient.chat.completions.create({
        model: this.apiModel,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.prompt },
        ] as OpenAI.ChatCompletionMessageParam[],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
      });

      const content = response.choices?.[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      logger.info('SovereignLlmRouter', {
        message: 'API fallback inference complete',
        model: this.apiModel,
        latencyMs: Date.now() - startTime,
        complexity: complexity.score.toFixed(2),
        tokensUsed,
      });

      return {
        content,
        model: this.apiModel,
        latencyMs: Date.now() - startTime,
        complexityScore: complexity.score,
        provider: 'api',
        tokensUsed,
        sovereign: false,
      };
    } catch (error) {
      logger.error('SovereignLlmRouter', {
        message: 'API fallback inference failed',
        model: this.apiModel,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Try NIM inference (TensorRT-LLM optimized)
   */
  private async tryNIM(
    request: InferenceRequest
  ): Promise<InferenceResult | null> {
    try {
      const response = await fetch(`${this.nimUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NIM_API_KEY || 'nvidia-api-key'}`
        },
        body: JSON.stringify({
          model: process.env.NIM_MODEL || 'meta/llama3-8b-instruct',
          messages: [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt }
          ],
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`NIM error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0]?.message?.content || '',
        model: data.model || 'nim-llama-3',
        latencyMs: 0,
        complexityScore: 0.5,
        provider: 'nim',
        tokensUsed: data.usage?.total_tokens || 0,
        sovereign: true,
        routingReason: 'nim_tensorrt',
      };
    } catch {
      return null;
    }
  }

  /**
   * Try Meridian BitNet inference (ternary weights, CPU-optimized)
   */
  private async tryMeridian(
    request: InferenceRequest
  ): Promise<InferenceResult | null> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.meridianUrl}/v1/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: request.prompt,
          system_prompt: request.systemPrompt || '',
          max_tokens: request.maxTokens ?? 512,
          temperature: request.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Meridian error: ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      // Record metrics
      prometheus.recordMeridianRequest();
      prometheus.recordMeridianLatency(latencyMs);

      return {
        content: data.content || '',
        model: data.model || 'meridian-bitnet',
        latencyMs,
        complexityScore: 0.5,
        provider: 'meridian',
        tokensUsed: data.tokens_used || 0,
        sovereign: true,
        routingReason: data.backend === 'bitnetcpp' || this.meridianBackend === 'bitnetcpp'
          ? 'meridian_bitnetcpp_gguf'
          : 'meridian_pytorch_research',
      };
    } catch {
      prometheus.recordMeridianError();
      prometheus.recordMeridianFallback();
      return null;
    }
  }

  /**
   * Try vLLM inference
   */
  private async tryVLLM(
    request: InferenceRequest
  ): Promise<InferenceResult | null> {
    try {
      const response = await fetch(`${this.vllmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.VLLM_MODEL || 'meta-llama/Llama-3.1-8B-Instruct',
          messages: [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt }
          ],
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`vLLM error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0]?.message?.content || '',
        model: data.model || 'vllm-llama-3.1',
        latencyMs: 0,
        complexityScore: 0.5,
        provider: 'vllm',
        tokensUsed: data.usage?.total_tokens || 0,
        sovereign: true,
        routingReason: 'vllm_fast',
      };
    } catch {
      return null;
    }
  }

  /**
   * Get router statistics
   */
  getStats(): {
    totalRequests: number;
    sovereignRatio: number;  // % processed locally
    apiFallbackRatio: number;  // % using API fallback
    cacheHitRate: number;
    avgComplexity: number;
    avgLatencyMs: number;
  } {
    const total = this.requestHistory.length;
    if (total === 0) {
      return {
        totalRequests: 0,
        sovereignRatio: 0,
        apiFallbackRatio: 0,
        cacheHitRate: 0,
        avgComplexity: 0,
        avgLatencyMs: 0,
      };
    }

    const sovereignCount = this.requestHistory.filter(r => r.sovereign).length;
    const cacheHits = this.cache.size;
    
    return {
      totalRequests: total,
      sovereignRatio: sovereignCount / total,
      apiFallbackRatio: (total - sovereignCount) / total,
      cacheHitRate: cacheHits / (total + cacheHits),
      avgComplexity: this.requestHistory.reduce((s, r) => s + r.quality, 0) / total,
      avgLatencyMs: this.requestHistory.reduce((s, r) => s + r.latency, 0) / total,
    };
  }

  /**
   * Log routing decision to HCS for sovereignty audit trail
   */
  private async logRoutingDecision(
    requestId: string,
    result: InferenceResult,
    complexity: { score: number; features: ComplexityFeatures }
  ): Promise<void> {
    try {
      await hcsDomainLogger.logEvent('auditTopicId', {
        type: 'MODEL_ROUTING',
        requestId,
        routedTo: result.provider,
        modelUsed: result.model,
        complexityScore: complexity.score,
        sovereign: result.sovereign,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
        routingReason: result.routingReason,
        features: {
          reasoningDepth: complexity.features.reasoningDepth,
          agentSpawning: complexity.features.agentSpawning,
          economicImpact: complexity.features.economicImpact,
          contextWindow: complexity.features.contextWindow,
        },
      });
    } catch (error) {
      // Non-blocking: HCS logging failure shouldn't break inference
      logger.debug('SovereignLlmRouter', {
        message: 'HCS logging failed (non-critical)',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Simple hash for cache keys
   */
  private hashRequest(request: InferenceRequest): string {
    return `${request.systemPrompt || ''}:${request.prompt}`.slice(0, 200);
  }

  /**
   * Pre-warmed common responses for instant replies
   * These bypass LLM entirely for <1ms responses
   */
  private getCommonResponse(prompt: string): string | null {
    const normalized = prompt.toLowerCase().trim();
    
    // Greetings
    if (/^(hi|hello|hey|greetings|what's up|howdy)[!?.]?$/.test(normalized)) {
      return "Hello! I'm Vera, your sovereign AI assistant. How can I help you today?";
    }
    
    // Identity questions
    if (/who (are you|built you|made you|created you)/.test(normalized)) {
      return "I'm Vera Oasis, an AI assistant created by you. I run locally on your hardware using llama3.1:8b.";
    }
    
    // Capability questions
    if (/what can you do|what are your capabilities|how can you help/.test(normalized)) {
      return "I can help with coding, analysis, writing, math, answering questions, and having conversations. I remember context and run entirely on your local machine.";
    }
    
    // Status checks
    if (/are you (working|online|awake|alive|ready)/.test(normalized)) {
      return "Yes, I'm online and ready! Running on sovereign local inference.";
    }
    
    // Thanks responses
    if (/thank|thanks|appreciate it/.test(normalized)) {
      return "You're welcome! Happy to help.";
    }
    
    // Goodbye
    if (/bye|goodbye|see you|later|exit|quit/.test(normalized)) {
      return "Goodbye! I'll be here whenever you need me.";
    }
    
    // Model info
    if (/what model|which llm|what ai|version/.test(normalized)) {
      return "I'm running llama3.1:8b locally on your machine. Sovereign AI, no API calls.";
    }
    
    return null;
  }

  /**
   * Estimate quality (placeholder for feedback loop)
   */
  private estimateQuality(result: InferenceResult): number {
    // Simple heuristic: longer, faster responses = higher quality
    // In production, this would use human/agent feedback
    const lengthScore = Math.min(1, result.content.length / 500);
    const speedScore = Math.max(0, 1 - result.latencyMs / 10000);
    return (lengthScore + speedScore) / 2;
  }
}

// Singleton
export const sovereignLlmRouter = new SovereignLlmRouter();
export default sovereignLlmRouter;
