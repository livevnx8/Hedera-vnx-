/**
 * Unsloth Fine-Tuning Integration for Vera
 * 
 * Optimized for RTX 4060 Ti 8GB with:
 * - LoRA adapters for efficient fine-tuning
 * - 2x faster training with OpenAI Triton kernels
 * - 70% less VRAM usage
 * - INT8/INT4 quantization support
 * 
 * @module ai/fineTuning/unslothTrainer
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../../monitoring/logger.js';

// ─── Configuration Types ─────────────────────────────────────────────────

export interface UnslothConfig {
  modelName: string;           // e.g., "unsloth/Meta-Llama-3.1-8B"
  maxSeqLength: number;        // 2048 for 8GB VRAM
  loadIn4bit: boolean;         // true for 8GB VRAM
  loraConfig: LoRAConfig;
  trainingConfig: TrainingConfig;
  outputDir: string;
}

export interface LoRAConfig {
  r: number;                   // LoRA rank (8-32)
  targetModules: string[];     // ["q_proj", "k_proj", "v_proj", "o_proj"]
  loraAlpha: number;           // Usually 2*r
  loraDropout: number;         // 0.0-0.1
  bias: 'none' | 'all' | 'lora_only';
  useGradientCheckpointing: 'unsloth' | 'standard' | false;
  randomState: number;
}

export interface TrainingConfig {
  perDeviceBatchSize: number;  // 1-2 for 8GB
  gradientAccumulationSteps: number; // 4-8
  warmupSteps: number;         // 5-10
  maxSteps: number;            // 60-100 for testing
  learningRate: number;        // 2e-4
  loggingSteps: number;        // 1
  optim: 'adamw_8bit' | 'paged_adamw_8bit' | 'adamw_torch';
  weightDecay: number;         // 0.01
  lrSchedulerType: 'linear' | 'cosine';
  seed: number;
}

export interface TrainingDataset {
  instructions: string[];
  inputs: string[];
  outputs: string[];
}

export interface TrainingProgress {
  step: number;
  maxSteps: number;
  loss: number;
  learningRate: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  vramUsedMb: number;
  samplesPerSecond: number;
}

// ─── Unsloth Trainer ───────────────────────────────────────────────────────

export class UnslothTrainer {
  private config: UnslothConfig;
  private trainingProcess: ChildProcess | null = null;
  private progressListeners: ((progress: TrainingProgress) => void)[] = [];
  private isTraining = false;
  private pythonScriptPath: string;

  constructor(config: Partial<UnslothConfig> = {}) {
    this.config = this.getDefaultConfig(config);
    this.pythonScriptPath = join(process.cwd(), 'src/ai/fineTuning/unsloth_train.py');
  }

  /**
   * Get optimized default config for RTX 4060 Ti 8GB
   */
  private getDefaultConfig(override: Partial<UnslothConfig>): UnslothConfig {
    return {
      modelName: 'unsloth/Meta-Llama-3.1-8B-Instruct',
      maxSeqLength: 2048,
      loadIn4bit: true,
      loraConfig: {
        r: 16,
        targetModules: [
          'q_proj', 'k_proj', 'v_proj', 'o_proj',
          'gate_proj', 'up_proj', 'down_proj',
        ],
        loraAlpha: 32,
        loraDropout: 0,
        bias: 'none',
        useGradientCheckpointing: 'unsloth',
        randomState: 3407,
        ...override.loraConfig,
      },
      trainingConfig: {
        perDeviceBatchSize: 1,
        gradientAccumulationSteps: 4,
        warmupSteps: 5,
        maxSteps: 60,
        learningRate: 2e-4,
        loggingSteps: 1,
        optim: 'adamw_8bit',
        weightDecay: 0.01,
        lrSchedulerType: 'linear',
        seed: 3407,
        ...override.trainingConfig,
      },
      outputDir: join(process.cwd(), 'models/fine-tuned'),
      ...override,
    };
  }

  /**
   * Check if Unsloth is installed and GPU is available
   */
  async checkPrerequisites(): Promise<{
    unslothInstalled: boolean;
    gpuAvailable: boolean;
    gpuName?: string;
    vramGb?: number;
    cudaVersion?: string;
  }> {
    try {
      const pythonCheck = await this.runPythonScript(`
import sys
try:
    import torch
    import unsloth
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    vram = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0
    cuda = torch.version.cuda
    print(f"UNSLOTH_OK|{gpu_name}|{vram:.1f}|{cuda}")
except ImportError as e:
    print(f"ERROR|{e}")
      `);

      const parts = pythonCheck.trim().split('|');
      if (parts[0] === 'UNSLOTH_OK') {
        return {
          unslothInstalled: true,
          gpuAvailable: true,
          gpuName: parts[1],
          vramGb: parseFloat(parts[2]),
          cudaVersion: parts[3],
        };
      }
    } catch (error) {
      logger.warn('UnslothTrainer', { message: 'Prerequisites check failed', error: String(error) });
    }

    return {
      unslothInstalled: false,
      gpuAvailable: false,
    };
  }

  /**
   * Generate training Python script dynamically
   */
  private async generateTrainingScript(dataset: TrainingDataset): Promise<string> {
    const datasetPath = join(this.config.outputDir, 'dataset.json');
    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.writeFile(datasetPath, JSON.stringify(dataset, null, 2));

    const script = `
import json
import torch
from unsloth import FastLanguageModel, is_bfloat16_supported
from trl import SFTTrainer, DataCollatorForCompletionOnlyLM
from transformers import TrainingArguments
from datasets import Dataset

# Load config
dataset_path = "${datasetPath}"
output_dir = "${this.config.outputDir}"

# Load dataset
with open(dataset_path, 'r') as f:
    data = json.load(f)

dataset = Dataset.from_dict(data)

# Load model with Unsloth
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="${this.config.modelName}",
    max_seq_length=${this.config.maxSeqLength},
    load_in_4bit=${this.config.loadIn4bit},
    dtype=None,
)

# Add LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=${this.config.loraConfig.r},
    target_modules=${JSON.stringify(this.config.loraConfig.targetModules)},
    lora_alpha=${this.config.loraConfig.loraAlpha},
    lora_dropout=${this.config.loraConfig.loraDropout},
    bias="${this.config.loraConfig.bias}",
    use_gradient_checkpointing="${this.config.loraConfig.useGradientCheckpointing}",
    random_state=${this.config.loraConfig.randomState},
)

# Training arguments
training_args = TrainingArguments(
    per_device_train_batch_size=${this.config.trainingConfig.perDeviceBatchSize},
    gradient_accumulation_steps=${this.config.trainingConfig.gradientAccumulationSteps},
    warmup_steps=${this.config.trainingConfig.warmupSteps},
    max_steps=${this.config.trainingConfig.maxSteps},
    learning_rate=${this.config.trainingConfig.learningRate},
    logging_steps=${this.config.trainingConfig.loggingSteps},
    optim="${this.config.trainingConfig.optim}",
    weight_decay=${this.config.trainingConfig.weightDecay},
    lr_scheduler_type="${this.config.trainingConfig.lrSchedulerType}",
    seed=${this.config.trainingConfig.seed},
    output_dir=output_dir,
    save_strategy="steps",
    save_steps=20,
    report_to="none",
)

# Format data for instruction tuning
def formatting_prompts_func(examples):
    instructions = examples["instructions"]
    inputs = examples["inputs"]
    outputs = examples["outputs"]
    texts = []
    for instruction, input, output in zip(instructions, inputs, outputs):
        text = f"### Instruction:\\n{instruction}\\n\\n### Input:\\n{input}\\n\\n### Response:\\n{output}"
        texts.append(text)
    return { "text": texts }

dataset = dataset.map(formatting_prompts_func, batched=True)

# Trainer
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=${this.config.maxSeqLength},
    data_collator=DataCollatorForCompletionOnlyLM(
        tokenizer=tokenizer, 
        response_template="### Response:"
    ),
    args=training_args,
)

# Train
trainer.train()

# Save LoRA adapters
model.save_pretrained(f"{output_dir}/lora_adapter")
tokenizer.save_pretrained(f"{output_dir}/lora_adapter")

print("TRAINING_COMPLETE")
`;

    await fs.writeFile(this.pythonScriptPath, script);
    return this.pythonScriptPath;
  }

  /**
   * Start fine-tuning process
   */
  async startTraining(dataset: TrainingDataset): Promise<void> {
    if (this.isTraining) {
      throw new Error('Training already in progress');
    }

    // Generate training script
    await this.generateTrainingScript(dataset);

    this.isTraining = true;
    logger.info('UnslothTrainer', {
      message: 'Starting fine-tuning',
      model: this.config.modelName,
      steps: this.config.trainingConfig.maxSteps,
    });

    // Spawn training process
    const venvPath = join(process.env.HOME || '', '.venv/nvidia');
    this.trainingProcess = spawn(
      join(venvPath, 'bin/python3'),
      [this.pythonScriptPath],
      {
        env: {
          ...process.env,
          PYTHONPATH: join(process.cwd(), 'src'),
          CUDA_VISIBLE_DEVICES: '0',
        },
        detached: false,
      }
    );

    // Handle output
    this.trainingProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      this.parseTrainingOutput(output);
    });

    this.trainingProcess.stderr?.on('data', (data) => {
      logger.warn('UnslothTrainer', {
        message: 'Training stderr',
        output: data.toString(),
      });
    });

    this.trainingProcess.on('close', (code) => {
      this.isTraining = false;
      if (code === 0) {
        logger.info('UnslothTrainer', { message: 'Training completed successfully' });
      } else {
        logger.error('UnslothTrainer', { message: 'Training failed', exitCode: code });
      }
    });
  }

  /**
   * Parse training output for progress updates
   */
  private parseTrainingOutput(output: string): void {
    // Parse progress from Unsloth output
    const progressMatch = output.match(/Step\s+(\d+)\/(\d+).*loss=([\d.]+).*lr=([\d.e-]+)/);
    if (progressMatch) {
      const progress: TrainingProgress = {
        step: parseInt(progressMatch[1]),
        maxSteps: parseInt(progressMatch[2]),
        loss: parseFloat(progressMatch[3]),
        learningRate: parseFloat(progressMatch[4]),
        elapsedSeconds: 0, // Would need to track start time
        estimatedRemainingSeconds: 0,
        vramUsedMb: 0,
        samplesPerSecond: 0,
      };

      this.progressListeners.forEach(listener => listener(progress));
    }
  }

  /**
   * Subscribe to training progress
   */
  onProgress(callback: (progress: TrainingProgress) => void): () => void {
    this.progressListeners.push(callback);
    return () => {
      const index = this.progressListeners.indexOf(callback);
      if (index > -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * Stop training
   */
  async stopTraining(): Promise<void> {
    if (this.trainingProcess && this.isTraining) {
      this.trainingProcess.kill('SIGTERM');
      this.isTraining = false;
      logger.info('UnslothTrainer', { message: 'Training stopped by user' });
    }
  }

  /**
   * Check if training is in progress
   */
  isTrainingActive(): boolean {
    return this.isTraining;
  }

  /**
   * Get training status
   */
  async getTrainingStatus(): Promise<{
    isTraining: boolean;
    outputDir: string;
    latestCheckpoint?: string;
  }> {
    const status = {
      isTraining: this.isTraining,
      outputDir: this.config.outputDir,
    };

    // Check for latest checkpoint
    try {
      const files = await fs.readdir(this.config.outputDir);
      const checkpoints = files.filter(f => f.startsWith('checkpoint-'));
      if (checkpoints.length > 0) {
        return {
          ...status,
          latestCheckpoint: checkpoints.sort().pop(),
        };
      }
    } catch {
      // Directory doesn't exist yet
    }

    return status;
  }

  /**
   * Run Python script and return output
   */
  private async runPythonScript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const venvPath = join(process.env.HOME || '', '.venv/nvidia');
      const process_ = spawn(
        join(venvPath, 'bin/python3'),
        ['-c', script],
        { env: { ...process.env, PYTHONPATH: join(process.cwd(), 'src') } }
      );

      let output = '';
      process_.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process_.stderr?.on('data', (data) => {
        logger.warn('UnslothTrainer', { message: 'Python stderr', output: data.toString() });
      });

      process_.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Python script failed with code ${code}`));
        }
      });
    });
  }
}

// ─── Dataset Curator for Hedera ───────────────────────────────────────────

export class HederaDatasetCurator {
  private examples: Array<{
    instruction: string;
    input: string;
    output: string;
    category: 'token' | 'defi' | 'governance' | 'coding' | 'general';
  }> = [];

  addExample(
    instruction: string,
    input: string,
    output: string,
    category: 'token' | 'defi' | 'governance' | 'coding' | 'general'
  ): void {
    this.examples.push({ instruction, input, output, category });
  }

  /**
   * Add common Hedera token operations examples
   */
  addTokenExamples(): void {
    this.addExample(
      'Create a Hedera fungible token',
      'Token name: CarbonCredit, Symbol: CCR, Decimals: 2, Initial Supply: 1000000',
      `import { TokenCreateTransaction, TokenType } from '@hashgraph/sdk';

const transaction = new TokenCreateTransaction()
  .setTokenName('CarbonCredit')
  .setTokenSymbol('CCR')
  .setDecimals(2)
  .setInitialSupply(1000000)
  .setTokenType(TokenType.FungibleCommon);

const response = await transaction.execute(client);
const receipt = await response.getReceipt(client);
console.log('Token ID:', receipt.tokenId);`,
      'token'
    );

    this.addExample(
      'Transfer tokens between accounts',
      'From: 0.0.1234, To: 0.0.5678, Token: 0.0.9012, Amount: 100.50',
      `import { TransferTransaction } from '@hashgraph/sdk';

const transaction = new TransferTransaction()
  .addTokenTransfer('0.0.9012', '0.0.1234', -100.50)
  .addTokenTransfer('0.0.9012', '0.0.5678', 100.50);

await transaction.execute(client);`,
      'token'
    );
  }

  /**
   * Add DeFi strategy examples
   */
  addDeFiExamples(): void {
    this.addExample(
      'Calculate impermanent loss for LP position',
      'Initial price: $1.00, Current price: $1.25, Initial liquidity: $1000',
      `function calculateIL(priceRatio: number): number {
  const sqrtRatio = Math.sqrt(priceRatio);
  const il = (2 * sqrtRatio / (1 + priceRatio)) - 1;
  return il * 100; // Return as percentage
}

// For price ratio 1.25
const il = calculateIL(1.25); // -0.97% impermanent loss`,
      'defi'
    );

    this.addExample(
      'Analyze yield farming opportunity',
      'APY: 45%, Token volatility: high, Lock period: 30 days, TVL: $5M',
      `Risk Assessment:
1. High APY (45%) indicates significant risk
2. High volatility increases impermanent loss risk
3. Short lock period (30 days) is favorable
4. Moderate TVL ($5M) - liquidity is acceptable
5. Recommendation: Allocate 5-10% of portfolio maximum

Risk-adjusted return: ~22.5% (accounting for volatility)`,
      'defi'
    );
  }

  /**
   * Build training dataset
   */
  buildDataset(): TrainingDataset {
    return {
      instructions: this.examples.map(e => e.instruction),
      inputs: this.examples.map(e => e.input),
      outputs: this.examples.map(e => e.output),
    };
  }

  /**
   * Export to JSONL format for other trainers
   */
  exportToJSONL(): string {
    return this.examples
      .map(e => JSON.stringify({
        instruction: e.instruction,
        input: e.input,
        output: e.output,
        category: e.category,
      }))
      .join('\n');
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────

export const unslothTrainer = new UnslothTrainer();
export const datasetCurator = new HederaDatasetCurator();
export default unslothTrainer;
