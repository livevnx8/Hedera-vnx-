/**
 * Multi-Model Ensemble Router
 * 
 * Routes requests to the best model based on task complexity:
 * - Simple: llama3.1:8b (fast, efficient)
 * - Medium: llama3.1:13b (balanced)
 * - Complex: llama3.1:70b or API fallback (most capable)
 * - Code: CodeLlama or specialized code model
 * - Vision: llava (multimodal)
 */

import { EventEmitter } from 'events';

export interface ModelConfig {
  name: string;
  size: number;        // Parameter count in billions
  specialties: string[];
  latency: number;   // Expected latency in ms
  quality: number;   // Quality score 0-1
  endpoint: string;
}

export interface EnsembleRequest {
  prompt: string;
  task: 'chat' | 'code' | 'analysis' | 'creative' | 'vision';
  complexity: 'low' | 'medium' | 'high';
  streaming?: boolean;
}

export interface EnsembleResult {
  content: string;
  model: string;
  latencyMs: number;
  confidence: number;
  routingReason: string;
}

export class ModelEnsemble extends EventEmitter {
  private models: Map<string, ModelConfig> = new Map([
    ['llama3.1:8b', {
      name: 'llama3.1:8b',
      size: 8,
      specialties: ['chat', 'general', 'fast'],
      latency: 2000,
      quality: 0.75,
      endpoint: 'http://localhost:11434',
    }],
    ['llama3.1:13b', {
      name: 'llama3.1:13b',
      size: 13,
      specialties: ['chat', 'analysis', 'balanced'],
      latency: 4000,
      quality: 0.85,
      endpoint: 'http://localhost:11434',
    }],
    ['codellama:13b', {
      name: 'codellama:13b',
      size: 13,
      specialties: ['code', 'programming', 'technical'],
      latency: 3500,
      quality: 0.88,
      endpoint: 'http://localhost:11434',
    }],
    ['llava:13b', {
      name: 'llava:13b',
      size: 13,
      specialties: ['vision', 'multimodal', 'image'],
      latency: 5000,
      quality: 0.80,
      endpoint: 'http://localhost:11434',
    }],
  ]);

  private defaultModel = 'llama3.1:8b';

  /**
   * Route request to best model based on task and complexity
   */
  async route(request: EnsembleRequest): Promise<EnsembleResult> {
    const startTime = Date.now();
    const model = this.selectModel(request);
    
    this.emit('routing_decision', { request, selectedModel: model });

    try {
      // Call the selected model via Ollama
      const response = await fetch(`${model.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.name,
          prompt: request.prompt,
          stream: request.streaming || false,
          options: {
            temperature: this.getTemperature(request.task),
            num_predict: this.getMaxTokens(request.task, request.complexity),
            num_gpu: 1,
            num_thread: 8,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Model ${model.name} failed: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        content: data.response || '',
        model: model.name,
        latencyMs: Date.now() - startTime,
        confidence: this.calculateConfidence(model, request),
        routingReason: this.getRoutingReason(model, request),
      };
    } catch (error) {
      // Fallback to default model
      if (model.name !== this.defaultModel) {
        console.log(`[Ensemble] Falling back to ${this.defaultModel}`);
        return this.route({ ...request, complexity: 'low' });
      }
      throw error;
    }
  }

  private selectModel(request: EnsembleRequest): ModelConfig {
    // Task-based routing
    if (request.task === 'vision') {
      return this.models.get('llava:13b') || this.getDefaultModel();
    }

    if (request.task === 'code') {
      const codeModel = this.models.get('codellama:13b');
      if (codeModel && request.complexity !== 'low') {
        return codeModel;
      }
    }

    // Complexity-based routing
    switch (request.complexity) {
      case 'low':
        return this.models.get('llama3.1:8b') || this.getDefaultModel();
      
      case 'medium':
        return this.models.get('llama3.1:13b') || this.getDefaultModel();
      
      case 'high':
        // Try 13b first, if not available use 8b with better prompting
        return this.models.get('llama3.1:13b') || 
               this.models.get('llama3.1:8b') || 
               this.getDefaultModel();
      
      default:
        return this.getDefaultModel();
    }
  }

  private getDefaultModel(): ModelConfig {
    return this.models.get(this.defaultModel) || {
      name: 'llama3.1:8b',
      size: 8,
      specialties: ['chat'],
      latency: 2000,
      quality: 0.75,
      endpoint: 'http://localhost:11434',
    };
  }

  private getTemperature(task: string): number {
    switch (task) {
      case 'code': return 0.3;      // Deterministic for code
      case 'creative': return 0.9;  // High creativity
      case 'analysis': return 0.5;  // Balanced
      default: return 0.7;
    }
  }

  private getMaxTokens(task: string, complexity: string): number {
    const baseTokens = task === 'code' ? 1200 : 800;
    const multiplier = complexity === 'high' ? 1.5 : 1;
    return Math.floor(baseTokens * multiplier);
  }

  private calculateConfidence(model: ModelConfig, request: EnsembleRequest): number {
    const specialtyMatch = model.specialties.includes(request.task) ? 0.2 : 0;
    const sizeBonus = model.size >= 13 ? 0.1 : 0;
    return Math.min(0.95, model.quality + specialtyMatch + sizeBonus);
  }

  private getRoutingReason(model: ModelConfig, request: EnsembleRequest): string {
    if (request.task === 'vision') return 'vision_task';
    if (request.task === 'code' && model.name.includes('code')) return 'code_specialist';
    if (request.complexity === 'high') return 'high_complexity';
    if (request.complexity === 'low') return 'speed_optimized';
    return 'balanced_choice';
  }

  /**
   * Add a new model to the ensemble
   */
  addModel(config: ModelConfig): void {
    this.models.set(config.name, config);
    this.emit('model_added', config);
  }

  /**
   * List available models
   */
  listModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * Check which models are currently loaded/available
   */
  async checkAvailability(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};
    
    for (const [name, model] of this.models) {
      try {
        const response = await fetch(`${model.endpoint}/api/tags`);
        if (response.ok) {
          const data = await response.json() as { models?: Array<{ name: string }> };
          availability[name] = data.models?.some(m => m.name.includes(name)) || false;
        } else {
          availability[name] = false;
        }
      } catch {
        availability[name] = false;
      }
    }
    
    return availability;
  }

  /**
   * Auto-select best model based on prompt analysis
   */
  analyzeAndRoute(prompt: string): Promise<EnsembleResult> {
    // Detect task type from prompt
    const task = this.detectTask(prompt);
    const complexity = this.estimateComplexity(prompt);
    
    return this.route({ prompt, task, complexity });
  }

  private detectTask(prompt: string): EnsembleRequest['task'] {
    const p = prompt.toLowerCase();
    
    if (p.includes('image') || p.includes('picture') || p.includes('look at') || p.includes('what do you see')) {
      return 'vision';
    }
    
    if (p.includes('code') || p.includes('function') || p.includes('script') || p.includes('program') || 
        p.includes('python') || p.includes('javascript') || p.includes('typescript')) {
      return 'code';
    }
    
    if (p.includes('analyze') || p.includes('compare') || p.includes('evaluate') || p.includes('explain')) {
      return 'analysis';
    }
    
    if (p.includes('write') || p.includes('create') || p.includes('story') || p.includes('poem')) {
      return 'creative';
    }
    
    return 'chat';
  }

  private estimateComplexity(prompt: string): EnsembleRequest['complexity'] {
    const length = prompt.length;
    const hasCode = /```|[{}();]|function|class|import/.test(prompt);
    const hasMath = /[∫∑∏√]|\^|_\{|\$\$/.test(prompt);
    const wordCount = prompt.split(/\s+/).length;
    
    if (hasCode && wordCount > 50) return 'high';
    if (hasMath || wordCount > 100) return 'high';
    if (length > 500 || hasCode) return 'medium';
    return 'low';
  }
}

// Singleton export
export const modelEnsemble = new ModelEnsemble();
