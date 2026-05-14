/**
 * Vision Engine for Vera Oasis
 * 
 * Image analysis using llava or similar multimodal models
 * Integrated with the sovereign routing system
 */

import { EventEmitter } from 'events';

export interface VisionRequest {
  image: Buffer | string;  // Base64 string or Buffer
  prompt: string;         // Question about the image
  maxTokens?: number;
}

export interface VisionResult {
  description: string;
  model: string;
  provider: 'local' | 'api';
  latencyMs: number;
  sovereign: boolean;
}

export class VisionEngine extends EventEmitter {
  private visionModel = 'llava:13b';  // Default vision model
  private ollamaEndpoint: string;

  constructor() {
    super();
    this.ollamaEndpoint = process.env.OLLAMA_URL || 'http://localhost:11434';
  }

  /**
   * Analyze an image using multimodal LLM
   */
  async analyze(request: VisionRequest): Promise<VisionResult> {
    const startTime = Date.now();
    
    try {
      // Convert image to base64 if needed
      const base64Image = typeof request.image === 'string' 
        ? request.image 
        : request.image.toString('base64');

      // Use Ollama's multimodal support
      const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.visionModel,
          prompt: request.prompt,
          images: [base64Image],
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: request.maxTokens || 500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Vision analysis failed: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        description: data.response || 'Unable to analyze image',
        model: this.visionModel,
        provider: 'local',
        latencyMs: Date.now() - startTime,
        sovereign: true,
      };
    } catch (error) {
      console.error('[VisionEngine] Analysis failed:', error);
      return {
        description: `Vision analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        model: this.visionModel,
        provider: 'local',
        latencyMs: Date.now() - startTime,
        sovereign: true,
      };
    }
  }

  /**
   * Quick image description (no question)
   */
  async describe(image: Buffer | string): Promise<string> {
    const result = await this.analyze({
      image,
      prompt: 'Describe this image in detail. What do you see?',
    });
    return result.description;
  }

  /**
   * OCR - extract text from image
   */
  async extractText(image: Buffer | string): Promise<string> {
    const result = await this.analyze({
      image,
      prompt: 'Extract all text from this image. Return only the text, nothing else.',
    });
    return result.description;
  }

  /**
   * Check if vision model is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
      if (!response.ok) return false;
      
      const data = await response.json() as { models?: Array<{ name: string }> };
      return data.models?.some(m => m.name.includes('llava')) || false;
    } catch {
      return false;
    }
  }

  /**
   * Set vision model
   */
  setModel(model: string): void {
    this.visionModel = model;
  }
}

// Singleton export
export const visionEngine = new VisionEngine();
