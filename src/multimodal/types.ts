/**
 * Multi-Modal AI Types (Phase 15)
 * 
 * Type definitions for vision, audio, video, and advanced reasoning capabilities.
 */

export interface ImageAnalysis {
  description: string;
  objects: Array<{
    label: string;
    confidence: number;
    bbox?: [number, number, number, number]; // x, y, width, height
  }>;
  text?: string[]; // OCR extracted text
  sentiment?: 'positive' | 'neutral' | 'negative';
  categories: string[];
}

export interface Transcription {
  text: string;
  language: string;
  confidence: number;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
  wordCount: number;
}

export interface AudioSynthesis {
  audio: Buffer;
  duration: number;
  sampleRate: number;
  format: 'wav' | 'mp3' | 'ogg';
  voice: string;
}

export interface VideoSummary {
  description: string;
  duration: number;
  keyFrames: Array<{
    timestamp: number;
    description: string;
  }>;
  actions: string[];
  scenes: Array<{
    start: number;
    end: number;
    description: string;
  }>;
  transcript?: Transcription;
}

export interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  observation?: string;
  confidence: number;
}

export interface ReasoningChain {
  query: string;
  steps: ReasoningStep[];
  conclusion: string;
  finalConfidence: number;
  totalSteps: number;
  executionTime: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolExecution {
  tool: string;
  params: Record<string, unknown>;
  result: unknown;
  executionTime: number;
  success: boolean;
  error?: string;
}

export interface ToolExecutionResult {
  task: string;
  toolsUsed: ToolExecution[];
  finalAnswer: string;
  totalExecutionTime: number;
  toolCallCount: number;
}

export interface CodeExecution {
  code: string;
  language: string;
  output: string;
  error?: string;
  executionTime: number;
  memoryUsed: number;
}
