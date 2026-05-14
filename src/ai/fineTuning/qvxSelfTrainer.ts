/**
 * Vera QVX Self-Training Pipeline
 *
 * Continuously improves the QVX model using:
 * 1. Successful tool-call traces from HCS learning logs
 * 2. LoRA adapter fine-tuning on tool-calling layers
 * 3. Hot-swap model weights without restart
 *
 * Target: RTX 4060 Ti 8GB via Unsloth
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../monitoring/logger.js';
import { unslothTrainer } from './unslothTrainer.js';
import type { TrainingDataset } from './unslothTrainer.js';

// ─── Types ─────────────────────────────────────────────────────────────────

interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
  metadata: {
    source: 'hcs_trace' | 'tool_example' | 'synthetic';
    confidence: number;   // 0-1 accuracy score
    toolNames: string[];
    timestamp: number;
    category: string;
  };
}

interface SelfTrainingConfig {
  minConfidence: number;
  maxExamples: number;
  outputDir: string;
  dataPath: string;
  adapterDir: string;
}

interface TrainingJob {
  id: string;
  startedAt: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  examplesUsed: number;
  loss?: number;
  adapterPath?: string;
  error?: string;
}

// ─── Self-Training Orchestrator ────────────────────────────────────────────

export class QvxSelfTrainer {
  private config: SelfTrainingConfig;
  private jobs: TrainingJob[] = [];
  private isTraining = false;
  private timer: NodeJS.Timeout | null = null;
  private currentAdapter: string | null = null;

  constructor(config?: Partial<SelfTrainingConfig>) {
    this.config = {
      minConfidence: 0.9,
      maxExamples: 500,
      outputDir: path.join(process.cwd(), 'models/self-trained'),
      dataPath: path.join(process.cwd(), 'data/learning-interactions.jsonl'),
      adapterDir: path.join(process.cwd(), 'models/fine-tuned/lora_adapter'),
      ...config,
    };
  }

  /**
   * Start the continuous training cycle — runs every day at 8:00 PM local time
   */
  start(): void {
    if (this.timer) return;

    const scheduleNext = () => {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1); // Already past 8 PM — schedule for tomorrow
      }
      const delay = target.getTime() - now.getTime();

      logger.info('QvxSelfTrainer', {
        message: 'Next training scheduled',
        targetTime: target.toISOString(),
        hoursUntil: (delay / 3_600_000).toFixed(2),
      });

      this.timer = setTimeout(async () => {
        await this.runTrainingCycle();
        scheduleNext(); // Chain next 8 PM after completion
      }, delay);
    };

    scheduleNext();

    logger.info('QvxSelfTrainer', {
      message: 'Self-training cycle started',
      schedule: 'Daily at 20:00 local time',
    });
  }

  /**
   * Stop the training cycle
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('QvxSelfTrainer', { message: 'Self-training cycle stopped' });
  }

  /**
   * One-shot training cycle:
   * 1. Extract high-confidence traces
   * 2. Format into training dataset
   * 3. Trigger LoRA fine-tuning
   * 4. Register new adapter for hot-swap
   */
  async runTrainingCycle(): Promise<TrainingJob | null> {
    if (this.isTraining) {
      logger.warn('QvxSelfTrainer', { message: 'Training already in progress, skipping cycle' });
      return null;
    }

    const jobId = `train-${Date.now()}`;
    const job: TrainingJob = {
      id: jobId,
      startedAt: Date.now(),
      status: 'queued',
      examplesUsed: 0,
    };
    this.jobs.push(job);

    try {
      this.isTraining = true;
      job.status = 'running';

      // 1. Extract traces
      const examples = await this.extractTrainingExamples();
      if (examples.length < 10) {
        logger.info('QvxSelfTrainer', {
          message: 'Insufficient training data, skipping cycle',
          examples: examples.length,
          minRequired: 10,
        });
        job.status = 'completed';
        job.examplesUsed = examples.length;
        this.isTraining = false;
        return job;
      }

      // 2. Build dataset
      const dataset = this.buildDataset(examples);
      job.examplesUsed = examples.length;

      // 3. Check GPU prerequisites
      const prereqs = await unslothTrainer.checkPrerequisites();
      if (!prereqs.unslothInstalled || !prereqs.gpuAvailable) {
        logger.error('QvxSelfTrainer', {
          message: 'GPU/Unsloth not available for training',
          unsloth: prereqs.unslothInstalled,
          gpu: prereqs.gpuAvailable,
        });
        job.status = 'failed';
        job.error = 'GPU prerequisites not met';
        this.isTraining = false;
        return job;
      }

      // 4. Run LoRA training
      logger.info('QvxSelfTrainer', {
        message: 'Starting LoRA fine-tuning',
        examples: dataset.instructions.length,
        gpu: prereqs.gpuName,
        vramGb: prereqs.vramGb,
      });

      await unslothTrainer.startTraining(dataset);

      // 5. Wait for completion and register adapter
      const adapterPath = path.join(this.config.adapterDir);
      this.currentAdapter = adapterPath;
      job.adapterPath = adapterPath;
      job.status = 'completed';

      logger.info('QvxSelfTrainer', {
        message: 'Training cycle completed',
        jobId,
        examplesUsed: job.examplesUsed,
        adapterPath,
      });

      this.isTraining = false;
      return job;

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      logger.error('QvxSelfTrainer', {
        message: 'Training cycle failed',
        jobId,
        error: job.error,
      });
      this.isTraining = false;
      return job;
    }
  }

  /**
   * Extract high-confidence training examples from HCS learning logs
   */
  private async extractTrainingExamples(): Promise<TrainingExample[]> {
    try {
      // Check if learning data exists
      try {
        await fs.access(this.config.dataPath);
      } catch {
        logger.warn('QvxSelfTrainer', { message: 'No learning data found', path: this.config.dataPath });
        return [];
      }

      const raw = await fs.readFile(this.config.dataPath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);

      const examples: TrainingExample[] = [];
      for (const line of lines) {
        try {
          const interaction = JSON.parse(line);
          // Filter: only successful interactions with high implied confidence
          if (!interaction.success) continue;
          if (interaction.user_feedback === 'negative') continue;

          // Compute confidence score
          const confidence = this.computeConfidence(interaction);
          if (confidence < this.config.minConfidence) continue;

          // Extract tool names used
          const toolNames = interaction.tools_used ?? [];

          // Build training example
          const example: TrainingExample = {
            instruction: interaction.user_query ?? interaction.instruction ?? '',
            input: this.buildInputContext(interaction),
            output: this.buildExpectedOutput(interaction),
            metadata: {
              source: 'hcs_trace',
              confidence,
              toolNames,
              timestamp: interaction.timestamp ?? Date.now(),
              category: interaction.category ?? 'general',
            },
          };

          if (example.instruction.length > 5 && example.output.length > 10) {
            examples.push(example);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Sort by confidence descending, take top N
      examples.sort((a, b) => b.metadata.confidence - a.metadata.confidence);
      return examples.slice(0, this.config.maxExamples);

    } catch (error) {
      logger.error('QvxSelfTrainer', {
        message: 'Failed to extract training examples',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Compute confidence score for an interaction
   */
  private computeConfidence(interaction: Record<string, unknown>): number {
    let score = 0.95; // Base for successful interactions

    const feedback = interaction.user_feedback as string | undefined;
    const responseTime = interaction.response_time_ms as number | undefined;
    const tools = interaction.tools_used as string[] | undefined;

    // Bonus for positive user feedback
    if (feedback === 'positive') score += 0.03;
    if (feedback === 'neutral') score -= 0.02;

    // Penalty for slow responses
    if (typeof responseTime === 'number' && responseTime > 10000) score -= 0.05;
    else if (typeof responseTime === 'number' && responseTime < 2000) score += 0.02;

    // Bonus for tool diversity (agent used multiple tools correctly)
    const toolCount = Array.isArray(tools) ? tools.length : 0;
    if (toolCount >= 2 && toolCount <= 5) score += 0.02;

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Build input context string from interaction
   */
  private buildInputContext(interaction: Record<string, unknown>): string {
    const parts: string[] = [];
    parts.push(`Category: ${(interaction.category as string) ?? 'general'}`);
    const tools = interaction.tools_used as string[] | undefined;
    if (Array.isArray(tools) && tools.length > 0) {
      parts.push(`Tools available: ${tools.join(', ')}`);
    }
    const ctx = interaction.context as string | undefined;
    if (ctx) {
      parts.push(`Context: ${ctx}`);
    }
    return parts.join('\n');
  }

  /**
   * Build expected output from interaction (vera_response or tool_call trace)
   */
  private buildExpectedOutput(interaction: Record<string, unknown>): string {
    // If we have a structured tool_call trace, use it
    const toolCalls = interaction.tool_calls;
    if (Array.isArray(toolCalls)) {
      const calls = toolCalls.map((tc: Record<string, unknown>) =>
        JSON.stringify({ name: tc.name as string, arguments: tc.arguments as Record<string, unknown> }, null, 2)
      ).join('\n');
      return `Tool calls:\n${calls}\n\nResponse:\n${(interaction.vera_response as string) ?? ''}`;
    }
    return (interaction.vera_response as string) ?? (interaction.response as string) ?? '';
  }

  /**
   * Build Unsloth-compatible training dataset
   */
  private buildDataset(examples: TrainingExample[]): TrainingDataset {
    return {
      instructions: examples.map(e => e.instruction),
      inputs: examples.map(e => e.input),
      outputs: examples.map(e => e.output),
    };
  }

  /**
   * Get current training status
   */
  getStatus(): {
    isTraining: boolean;
    currentAdapter: string | null;
    totalJobs: number;
    lastJob?: TrainingJob;
  } {
    return {
      isTraining: this.isTraining,
      currentAdapter: this.currentAdapter,
      totalJobs: this.jobs.length,
      lastJob: this.jobs.length > 0 ? this.jobs[this.jobs.length - 1] : undefined,
    };
  }

  /**
   * Get all training jobs
   */
  getJobs(): TrainingJob[] {
    return [...this.jobs];
  }

  /**
   * Manually trigger a training cycle
   */
  async triggerTraining(): Promise<TrainingJob | null> {
    return this.runTrainingCycle();
  }

  /**
   * Register a new adapter for hot-swap
   * Call this after LoRA training completes
   */
  async registerAdapter(adapterPath: string): Promise<boolean> {
    try {
      await fs.access(adapterPath);
      this.currentAdapter = adapterPath;
      logger.info('QvxSelfTrainer', {
        message: 'New LoRA adapter registered',
        adapterPath,
      });
      return true;
    } catch {
      logger.error('QvxSelfTrainer', {
        message: 'Adapter path not found',
        adapterPath,
      });
      return false;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────

export const qvxSelfTrainer = new QvxSelfTrainer();
export default qvxSelfTrainer;
