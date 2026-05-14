/**
 * Vera vLLM Router
 * 
 * High-performance inference using vLLM with PagedAttention.
 * 2-4x faster than standard Ollama on NVIDIA GPUs.
 * 
 * Features:
 * - PagedAttention for efficient KV cache management
 * - Continuous batching for higher throughput
 * - CUDA acceleration for RTX 4060 Ti
 * - Compatible with existing sovereign routing
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { InferenceRequest, InferenceResult, StreamCallback } from './sovereignRouter.js';

export interface VLLMConfig {
  model: string;
  gpuMemoryUtilization: number;
  maxModelLen: number;
  quantization: 'awq' | 'gptq' | 'fp16' | 'bf16' | null;
  tensorParallelSize: number;
  dtype: 'auto' | 'half' | 'bfloat16' | 'float';
  enforceEager: boolean;
  maxNumBatchedTokens: number;
  maxNumSeqs: number;
}

export class VLLMRouter extends EventEmitter {
  private serverProcess: ChildProcess | null = null;
  private serverUrl: string = 'http://localhost:8000';
  private config: VLLMConfig;
  private isReady: boolean = false;
  private requestQueue: Array<() => void> = [];

  constructor(config?: Partial<VLLMConfig>) {
    super();
    this.config = {
      model: config?.model || process.env.VLLM_MODEL || 'llama3.1:8b',
      gpuMemoryUtilization: config?.gpuMemoryUtilization || 0.85,
      maxModelLen: config?.maxModelLen || 8192,
      quantization: config?.quantization || null,
      tensorParallelSize: config?.tensorParallelSize || 1,
      dtype: config?.dtype || 'auto',
      enforceEager: config?.enforceEager || false,
      maxNumBatchedTokens: config?.maxNumBatchedTokens || 2048,
      maxNumSeqs: config?.maxNumSeqs || 256,
      ...config,
    };
  }

  /**
   * Start vLLM server with optimized settings for RTX 4060 Ti
   */
  async start(): Promise<boolean> {
    if (this.isReady) return true;

    console.log('[vLLM] Starting server with config:', this.config);

    // Check if vLLM is already running
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      if (response.ok) {
        console.log('[vLLM] Server already running');
        this.isReady = true;
        return true;
      }
    } catch {
      // Not running, start it
    }

    // Build vLLM serve command
    const args = [
      'serve',
      this.config.model,
      '--host', '0.0.0.0',
      '--port', '8000',
      '--gpu-memory-utilization', String(this.config.gpuMemoryUtilization),
      '--max-model-len', String(this.config.maxModelLen),
      '--tensor-parallel-size', String(this.config.tensorParallelSize),
      '--max-num-batched-tokens', String(this.config.maxNumBatchedTokens),
      '--max-num-seqs', String(this.config.maxNumSeqs),
    ];

    if (this.config.quantization) {
      args.push('--quantization', this.config.quantization);
    }

    if (this.config.dtype !== 'auto') {
      args.push('--dtype', this.config.dtype);
    }

    if (this.config.enforceEager) {
      args.push('--enforce-eager');
    }

    console.log('[vLLM] Command: python -m vllm.entrypoints.openai.api_server', args.join(' '));

    // Start server process
    this.serverProcess = spawn('python', ['-m', 'vllm.entrypoints.openai.api_server', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Capture logs
    this.serverProcess.stdout?.on('data', (data) => {
      const log = data.toString().trim();
      if (log.includes('Uvicorn running') || log.includes('Application startup complete')) {
        this.isReady = true;
        this.emit('ready');
        console.log('[vLLM] Server ready');
        
        // Process queued requests
        while (this.requestQueue.length > 0) {
          const req = this.requestQueue.shift();
          req?.();
        }
      }
      console.log('[vLLM]', log);
    });

    this.serverProcess.stderr?.on('data', (data) => {
      console.error('[vLLM Error]', data.toString().trim());
    });

    this.serverProcess.on('error', (error) => {
      console.error('[vLLM] Process error:', error);
      this.emit('error', error);
    });

    this.serverProcess.on('exit', (code) => {
      console.log(`[vLLM] Process exited with code ${code}`);
      this.isReady = false;
      this.emit('exit', code);
    });

    // Wait for server to be ready
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds

    while (attempts < maxAttempts && !this.isReady) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      // Check if server is up
      try {
        const response = await fetch(`${this.serverUrl}/health`);
        if (response.ok) {
          this.isReady = true;
          console.log('[vLLM] Server ready after', attempts, 'seconds');
          return true;
        }
      } catch {
        // Not ready yet
      }
    }

    if (!this.isReady) {
      console.error('[vLLM] Server failed to start within 60 seconds');
      this.stop();
      return false;
    }

    return true;
  }

  /**
   * Stop vLLM server
   */
  stop(): void {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }
    this.isReady = false;
    console.log('[vLLM] Server stopped');
  }

  /**
   * Inference with vLLM (OpenAI-compatible API)
   */
  async infer(request: InferenceRequest): Promise<InferenceResult> {
    if (!this.isReady) {
      await this.start();
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: request.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: request.prompt },
          ],
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024,
          top_p: 0.9,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`vLLM inference failed: ${error}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      const latencyMs = Date.now() - startTime;

      return {
        content,
        model: this.config.model,
        latencyMs,
        complexityScore: 0.5,
        provider: 'vllm',
        tokensUsed: data.usage?.total_tokens || 0,
        sovereign: true,
        routingReason: 'vllm_fast_inference',
      };
    } catch (error) {
      console.error('[vLLM] Inference error:', error);
      throw error;
    }
  }

  /**
   * Streaming inference with vLLM
   */
  async inferStream(request: InferenceRequest, callback: StreamCallback): Promise<InferenceResult> {
    if (!this.isReady) {
      await this.start();
    }

    const startTime = Date.now();
    let fullContent = '';
    let tokensUsed = 0;

    try {
      const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: request.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: request.prompt },
          ],
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024,
          top_p: 0.9,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`vLLM streaming failed: ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices[0]?.delta?.content || '';
              if (token) {
                fullContent += token;
                tokensUsed++;
                callback(token);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      callback('');

      return {
        content: fullContent,
        model: this.config.model,
        latencyMs: Date.now() - startTime,
        complexityScore: 0.5,
        provider: 'vllm',
        tokensUsed,
        sovereign: true,
        routingReason: 'vllm_streaming',
      };
    } catch (error) {
      console.error('[vLLM] Streaming error:', error);
      throw error;
    }
  }

  /**
   * Check vLLM status
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`, { 
        signal: AbortSignal.timeout(2000) 
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get GPU stats from vLLM
   */
  async getStats(): Promise<any> {
    try {
      const response = await fetch(`${this.serverUrl}/stats`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}

// Optimized config for RTX 4060 Ti 16GB
export const vllmConfigRTX4060Ti: Partial<VLLMConfig> = {
  gpuMemoryUtilization: 0.85,
  maxModelLen: 4096,
  quantization: null,  // Use full precision for quality
  tensorParallelSize: 1,
  dtype: 'auto',
  maxNumBatchedTokens: 4096,
  maxNumSeqs: 128,
};

// Singleton instance
export const vllmRouter = new VLLMRouter(vllmConfigRTX4060Ti);
