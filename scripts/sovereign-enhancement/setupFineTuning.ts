#!/usr/bin/env tsx

/**
 * Vera Sovereign Enhancement - Fine-Tuning Setup
 * 
 * This script sets up the fine-tuning environment and prepares for
 * dual-track sovereign model enhancement.
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { config } from '../../src/config.js';

interface FineTuningConfig {
  baseModel: string;
  outputDir: string;
  datasets: {
    conversation: string;
    hedera: string;
  };
  hyperparameters: {
    learning_rate: number;
    batch_size: number;
    epochs: number;
    max_length: number;
    warmup_steps: number;
  };
  hardware: {
    gpu_memory: string;
    system_memory: string;
    storage: string;
  };
}

class FineTuningSetup {
  private config: FineTuningConfig;
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.config = {
      baseModel: './models/vera-backup.gguf',
      outputDir: path.join(this.projectRoot, 'models/fine-tuned'),
      datasets: {
        conversation: path.join(this.projectRoot, 'training-data/conversation-enhancement.jsonl'),
        hedera: path.join(this.projectRoot, 'training-data/hedera-tools-optimization.jsonl')
      },
      hyperparameters: {
        learning_rate: 2e-5,
        batch_size: 4,
        epochs: 3,
        max_length: 2048,
        warmup_steps: 100
      },
      hardware: {
        gpu_memory: '16GB+',
        system_memory: '32GB+',
        storage: '500GB+ SSD'
      }
    };
  }

  /**
   * Check system requirements
   */
  async checkSystemRequirements(): Promise<boolean> {
    console.log('🔍 Checking system requirements...');
    
    try {
      // Check GPU availability
      const gpuCheck = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { encoding: 'utf-8' });
      console.log('🎮 GPU Info:', gpuCheck.trim());
      
      // Check CUDA
      try {
        const cudaVersion = execSync('nvcc --version', { encoding: 'utf-8' });
        console.log('🚀 CUDA:', cudaVersion.split('\n')[3]?.trim() || 'Not found');
      } catch {
        console.log('⚠️  CUDA not found - may need installation');
      }
      
      // Check Python
      const pythonVersion = execSync('python3 --version', { encoding: 'utf-8' });
      console.log('🐍 Python:', pythonVersion.trim());
      
      // Check available memory
      const memInfo = execSync('free -h', { encoding: 'utf-8' });
      console.log('💾 Memory:', memInfo.split('\n')[1]?.trim() || 'Unknown');
      
      // Check disk space
      const diskInfo = execSync('df -h .', { encoding: 'utf-8' });
      console.log('💿 Disk Space:', diskInfo.split('\n')[1]?.trim() || 'Unknown');
      
      console.log('✅ System requirements check complete');
      return true;
      
    } catch (error) {
      console.error('❌ Error checking system requirements:', error);
      return false;
    }
  }

  /**
   * Set up Python environment for fine-tuning
   */
  async setupPythonEnvironment(): Promise<void> {
    console.log('🐍 Setting up Python environment...');
    
    try {
      // Create virtual environment
      const venvPath = path.join(this.projectRoot, 'venv-finetuning');
      
      try {
        await fs.access(venvPath);
        console.log('📁 Virtual environment already exists');
      } catch {
        console.log('📁 Creating virtual environment...');
        execSync('python3 -m venv venv-finetuning', { stdio: 'inherit' });
      }
      
      // Activate and install dependencies
      console.log('📦 Installing fine-tuning dependencies...');
      
      const requirements = [
        'torch>=2.0.0',
        'transformers>=4.35.0',
        'unsloth[colab-new]>=2024.1',
        'datasets>=2.14.0',
        'accelerate>=0.24.0',
        'bitsandbytes>=0.41.0',
        'peft>=0.6.0',
        'trl>=0.7.0'
      ];
      
      for (const req of requirements) {
        console.log(`Installing ${req}...`);
        execSync(`./venv-finetuning/bin/pip install ${req}`, { stdio: 'inherit' });
      }
      
      console.log('✅ Python environment setup complete');
      
    } catch (error) {
      console.error('❌ Error setting up Python environment:', error);
      throw error;
    }
  }

  /**
   * Create fine-tuning scripts
   */
  async createFineTuningScripts(): Promise<void> {
    console.log('📝 Creating fine-tuning scripts...');
    
    const scriptsDir = path.join(this.projectRoot, 'scripts/sovereign-enhancement');
    
    // Create conversation fine-tuning script
    const conversationScript = this.createConversationScript();
    await fs.writeFile(
      path.join(scriptsDir, 'fine-tune-conversation.py'),
      conversationScript
    );
    
    // Create Hedera fine-tuning script
    const hederaScript = this.createHederaScript();
    await fs.writeFile(
      path.join(scriptsDir, 'fine-tune-hedera.py'),
      hederaScript
    );
    
    // Create evaluation script
    const evaluationScript = this.createEvaluationScript();
    await fs.writeFile(
      path.join(scriptsDir, 'evaluate-models.py'),
      evaluationScript
    );
    
    console.log('✅ Fine-tuning scripts created');
  }

  /**
   * Create conversation enhancement fine-tuning script
   */
  private createConversationScript(): string {
    return `#!/usr/bin/env python3
"""
Vera Conversation Enhancement Fine-Tuning Script
Fine-tunes Vera's sovereign model for improved general conversation capabilities
"""

import os
import json
import torch
from datasets import Dataset
from transformers import AutoTokenizer
from unsloth import FastLanguageModel
from trl import SFTTrainer
from peft import LoraConfig

# Configuration
BASE_MODEL = "${this.config.baseModel}"
DATASET_PATH = "${this.config.datasets.conversation}"
OUTPUT_DIR = "${path.join(this.config.outputDir, 'vera-conversation')}"
MAX_LENGTH = ${this.config.hyperparameters.max_length}
BATCH_SIZE = ${this.config.hyperparameters.batch_size}
LEARNING_RATE = ${this.config.hyperparameters.learning_rate}
EPOCHS = ${this.config.hyperparameters.epochs}

def load_dataset():
    """Load and prepare the conversation enhancement dataset"""
    print("📖 Loading conversation dataset...")
    
    examples = []
    with open(DATASET_PATH, 'r') as f:
        data = json.load(f)
        
    for example in data['examples']:
        if example['category'] in ['general', 'error_handling']:
            # Format for instruction fine-tuning
            formatted = {
                'instruction': example['input'],
                'input': '',
                'output': example['output']
            }
            examples.append(formatted)
    
    print(f"✅ Loaded {len(examples)} conversation examples")
    return Dataset.from_list(examples)

def format_prompt(example):
    """Format examples for training"""
    if example['input']:
        return f"### Instruction:\\n{example['instruction']}\\n\\n### Input:\\n{example['input']}\\n\\n### Response:\\n{example['output']}"
    else:
        return f"### Instruction:\\n{example['instruction']}\\n\\n### Response:\\n{example['output']}"

def main():
    print("🚀 Starting Vera Conversation Enhancement Fine-Tuning...")
    
    # Load dataset
    dataset = load_dataset()
    
    # Load model and tokenizer
    print("🎮 Loading model and tokenizer...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_LENGTH,
        dtype=torch.float16,
        load_in_4bit=True,
    )
    
    # Configure LoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing=True,
        random_state=3407,
    )
    
    # Format dataset
    print("📝 Formatting dataset...")
    dataset = dataset.map(lambda x: {"text": format_prompt(x)})
    
    # Setup trainer
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_LENGTH,
        dataset_num_proc=2,
        packing=False,
        args=dict(
            per_device_train_batch_size=BATCH_SIZE,
            gradient_accumulation_steps=4,
            warmup_steps=${this.config.hyperparameters.warmup_steps},
            max_steps=-1,
            num_train_epochs=EPOCHS,
            learning_rate=LEARNING_RATE,
            fp16=True,
            logging_steps=10,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir=OUTPUT_DIR,
            report_to=[],  # Disable wandb
        ),
    )
    
    # Start training
    print("🏋️ Starting training...")
    trainer.train()
    
    # Save model
    print("💾 Saving model...")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    print("✅ Conversation enhancement fine-tuning complete!")
    print(f"📁 Model saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
`;
  }

  /**
   * Create Hedera tools optimization fine-tuning script
   */
  private createHederaScript(): string {
    return `#!/usr/bin/env python3
"""
Vera Hedera Tools Optimization Fine-Tuning Script
Fine-tunes Vera's sovereign model for superior Hedera blockchain expertise
"""

import os
import json
import torch
from datasets import Dataset
from transformers import AutoTokenizer
from unsloth import FastLanguageModel
from trl import SFTTrainer
from peft import LoraConfig

# Configuration
BASE_MODEL = "${this.config.baseModel}"
DATASET_PATH = "${this.config.datasets.hedera}"
OUTPUT_DIR = "${path.join(this.config.outputDir, 'vera-hedera')}"
MAX_LENGTH = ${this.config.hyperparameters.max_length}
BATCH_SIZE = ${this.config.hyperparameters.batch_size}
LEARNING_RATE = ${this.config.hyperparameters.learning_rate}
EPOCHS = ${this.config.hyperparameters.epochs}

def load_dataset():
    """Load and prepare the Hedera tools dataset"""
    print("📖 Loading Hedera dataset...")
    
    examples = []
    with open(DATASET_PATH, 'r') as f:
        data = json.load(f)
        
    for example in data['examples']:
        if example['category'] in ['hedera_tools', 'carbon_credits', 'defi_analytics']:
            # Format for instruction fine-tuning
            formatted = {
                'instruction': example['input'],
                'input': json.dumps({
                    'category': example['category'],
                    'tools_used': example.get('tools_used', []),
                    'context': example.get('context', '')
                }),
                'output': example['output']
            }
            examples.append(formatted)
    
    print(f"✅ Loaded {len(examples)} Hedera examples")
    return Dataset.from_list(examples)

def format_prompt(example):
    """Format examples for training with Hedera context"""
    context = json.loads(example['input'])
    
    prompt = f"### Instruction:\\n{example['instruction']}\\n\\n"
    
    if context['category']:
        prompt += f"### Category:\\n{context['category']}\\n\\n"
    if context['tools_used']:
        prompt += f"### Available Tools:\\n{', '.join(context['tools_used'])}\\n\\n"
    if context['context']:
        prompt += f"### Context:\\n{context['context']}\\n\\n"
    
    prompt += f"### Response:\\n{example['output']}"
    
    return prompt

def main():
    print("🚀 Starting Vera Hedera Tools Optimization Fine-Tuning...")
    
    # Load dataset
    dataset = load_dataset()
    
    # Load model and tokenizer
    print("🎮 Loading model and tokenizer...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_LENGTH,
        dtype=torch.float16,
        load_in_4bit=True,
    )
    
    # Configure LoRA for specialized knowledge
    model = FastLanguageModel.get_peft_model(
        model,
        r=32,  # Higher rank for specialized knowledge
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=32,
        lora_dropout=0.05,  # Slight dropout for regularization
        bias="none",
        use_gradient_checkpointing=True,
        random_state=3407,
    )
    
    # Format dataset
    print("📝 Formatting dataset...")
    dataset = dataset.map(lambda x: {"text": format_prompt(x)})
    
    # Setup trainer with specialized settings
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_LENGTH,
        dataset_num_proc=2,
        packing=False,
        args=dict(
            per_device_train_batch_size=BATCH_SIZE,
            gradient_accumulation_steps=2,  # Lower accumulation for specialized training
            warmup_steps=${this.config.hyperparameters.warmup_steps},
            max_steps=-1,
            num_train_epochs=EPOCHS,
            learning_rate=LEARNING_RATE,
            fp16=True,
            logging_steps=5,  # More frequent logging for specialized training
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="cosine",  # Cosine scheduler for specialized fine-tuning
            seed=3407,
            output_dir=OUTPUT_DIR,
            report_to=[],  # Disable wandb
        ),
    )
    
    # Start training
    print("🏋️ Starting Hedera specialization training...")
    trainer.train()
    
    # Save model
    print("💾 Saving specialized model...")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    print("✅ Hedera tools optimization fine-tuning complete!")
    print(f"📁 Specialized model saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
`;
  }

  /**
   * Create model evaluation script
   */
  private createEvaluationScript(): string {
    return `#!/usr/bin/env python3
"""
Vera Model Evaluation Script
Evaluates fine-tuned models against baseline performance
"""

import os
import json
import torch
from transformers import AutoTokenizer
from unsloth import FastLanguageModel

# Configuration
BASE_MODEL = "${this.config.baseModel}"
CONVERSATION_MODEL = "${path.join(this.config.outputDir, 'vera-conversation')}"
HEDERA_MODEL = "${path.join(this.config.outputDir, 'vera-hedera')}"

class ModelEvaluator:
    def __init__(self):
        self.test_cases = self.load_test_cases()
    
    def load_test_cases(self):
        """Load evaluation test cases"""
        return {
            'general': [
                {
                    'input': 'What can you help me with?',
                    'expected_keywords': ['vera', 'assistant', 'help', 'quantum']
                },
                {
                    'input': 'Explain blockchain simply',
                    'expected_keywords': ['blockchain', 'ledger', 'decentralized', 'distributed']
                }
            ],
            'hedera': [
                {
                    'input': 'How do I create a new Hedera token?',
                    'expected_keywords': ['hedera', 'token', 'hts', 'create', 'service']
                },
                {
                    'input': 'Verify this carbon credit',
                    'expected_keywords': ['carbon', 'credit', 'verification', 'dovu', 'blockchain']
                }
            ],
            'error_handling': [
                {
                    'input': 'My transaction failed, what should I do?',
                    'expected_keywords': ['transaction', 'failed', 'error', 'troubleshoot', 'check']
                }
            ]
        }
    
    def load_model(self, model_path):
        """Load model for evaluation"""
        print(f"🎮 Loading model: {model_path}")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_path,
            max_seq_length=2048,
            dtype=torch.float16,
            load_in_4bit=True,
        )
        FastLanguageModel.for_inference(model)
        return model, tokenizer
    
    def generate_response(self, model, tokenizer, prompt):
        """Generate response from model"""
        messages = [{"role": "user", "content": prompt}]
        inputs = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt"
        ).to("cuda")
        
        outputs = model.generate(
            input_ids=inputs,
            max_new_tokens=512,
            use_cache=True,
            temperature=0.7,
            min_p=0.1
        )
        
        response = tokenizer.decode(outputs[0][len(inputs[0]):], skip_special_tokens=True)
        return response
    
    def evaluate_response(self, response, expected_keywords):
        """Evaluate response quality"""
        response_lower = response.lower()
        matches = sum(1 for keyword in expected_keywords if keyword.lower() in response_lower)
        score = matches / len(expected_keywords)
        return score
    
    def evaluate_model(self, model_path, model_name):
        """Evaluate a single model"""
        print(f"🔍 Evaluating {model_name}...")
        
        model, tokenizer = self.load_model(model_path)
        results = {}
        
        for category, test_cases in self.test_cases.items():
            category_scores = []
            
            for test_case in test_cases:
                response = self.generate_response(model, tokenizer, test_case['input'])
                score = self.evaluate_response(response, test_case['expected_keywords'])
                category_scores.append(score)
                
                print(f"  📝 {test_case['input'][:50]}... - Score: {score:.2f}")
            
            results[category] = sum(category_scores) / len(category_scores)
        
        overall_score = sum(results.values()) / len(results)
        results['overall'] = overall_score
        
        print(f"📊 {model_name} Results:")
        for category, score in results.items():
            print(f"  {category}: {score:.2f}")
        
        return results
    
    def run_evaluation(self):
        """Run complete evaluation"""
        print("🚀 Starting Vera Model Evaluation...")
        
        # Evaluate baseline model
        baseline_results = self.evaluate_model(BASE_MODEL, "Baseline")
        
        # Evaluate conversation model
        conversation_results = self.evaluate_model(CONVERSATION_MODEL, "Conversation Enhanced")
        
        # Evaluate Hedera model
        hedera_results = self.evaluate_model(HEDERA_MODEL, "Hedera Specialized")
        
        # Generate comparison report
        print("\\n📈 Comparison Report:")
        print("\\nBaseline vs Enhanced Models:")
        
        for metric in ['overall', 'general', 'hedera', 'error_handling']:
            if metric in baseline_results:
                baseline = baseline_results[metric]
                conversation = conversation_results.get(metric, 0)
                hedera = hedera_results.get(metric, 0)
                
                improvement_conv = ((conversation - baseline) / baseline * 100) if baseline > 0 else 0
                improvement_hedera = ((hedera - baseline) / baseline * 100) if baseline > 0 else 0
                
                print(f"  {metric}:")
                print(f"    Baseline: {baseline:.2f}")
                print(f"    Conversation: {conversation:.2f} ({improvement_conv:+.1f}%)")
                print(f"    Hedera: {hedera:.2f} ({improvement_hedera:+.1f}%)")
        
        # Save results
        results = {
            'baseline': baseline_results,
            'conversation': conversation_results,
            'hedera': hedera_results,
            'timestamp': torch.cuda.get_device_name()
        }
        
        with open('evaluation-results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        print("\\n✅ Evaluation complete! Results saved to evaluation-results.json")

if __name__ == "__main__":
    evaluator = ModelEvaluator()
    evaluator.run_evaluation()
`;
  }

  /**
   * Make scripts executable
   */
  async makeScriptsExecutable(): Promise<void> {
    console.log('🔐 Making scripts executable...');
    
    const scripts = [
      'fine-tune-conversation.py',
      'fine-tune-hedera.py',
      'evaluate-models.py'
    ];
    
    for (const script of scripts) {
      const scriptPath = path.join(this.projectRoot, 'scripts/sovereign-enhancement', script);
      execSync(`chmod +x ${scriptPath}`, { stdio: 'inherit' });
    }
    
    console.log('✅ Scripts made executable');
  }

  /**
   * Create output directories
   */
  async createOutputDirectories(): Promise<void> {
    console.log('📁 Creating output directories...');
    
    const directories = [
      this.config.outputDir,
      path.join(this.config.outputDir, 'vera-conversation'),
      path.join(this.config.outputDir, 'vera-hedera'),
      path.join(this.projectRoot, 'logs'),
      path.join(this.projectRoot, 'checkpoints')
    ];
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    console.log('✅ Output directories created');
  }

  /**
   * Generate setup report
   */
  async generateSetupReport(): Promise<void> {
    console.log('📋 Generating setup report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      configuration: this.config,
      requirements: {
        python: '3.9+',
        cuda: '11.8+',
        gpu_memory: this.config.hardware.gpu_memory,
        system_memory: this.config.hardware.system_memory,
        storage: this.config.hardware.storage
      },
      next_steps: [
        '1. Activate virtual environment: source venv-finetuning/bin/activate',
        '2. Run knowledge transfer: tsx scripts/sovereign-enhancement/knowledgeTransfer.ts',
        '3. Fine-tune conversation model: python scripts/sovereign-enhancement/fine-tune-conversation.py',
        '4. Fine-tune Hedera model: python scripts/sovereign-enhancement/fine-tune-hedera.py',
        '5. Evaluate models: python scripts/sovereign-enhancement/evaluate-models.py'
      ],
      integration_notes: {
        model_routing: 'Update src/llm/realProvider.ts to route queries to appropriate models',
        configuration: 'Add new model paths to config.ts',
        monitoring: 'Set up performance monitoring for enhanced models'
      }
    };
    
    const reportPath = path.join(this.projectRoot, 'fine-tuning-setup-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📄 Setup report saved to: ${reportPath}`);
  }

  /**
   * Execute complete setup
   */
  async execute(): Promise<void> {
    console.log('🚀 Starting Vera Sovereign Fine-Tuning Setup...\n');
    
    try {
      // Check system requirements
      const requirementsMet = await this.checkSystemRequirements();
      if (!requirementsMet) {
        console.log('⚠️  System requirements not fully met. Continue anyway? (y/N)');
        return;
      }
      
      // Setup Python environment
      await this.setupPythonEnvironment();
      
      // Create output directories
      await this.createOutputDirectories();
      
      // Create fine-tuning scripts
      await this.createFineTuningScripts();
      
      // Make scripts executable
      await this.makeScriptsExecutable();
      
      // Generate setup report
      await this.generateSetupReport();
      
      console.log('\n🎉 Fine-Tuning Setup Complete!');
      console.log('📁 Scripts created in scripts/sovereign-enhancement/');
      console.log('🐍 Python environment: venv-finetuning/');
      console.log('📄 Setup report: fine-tuning-setup-report.json');
      console.log('\n📋 Next Steps:');
      console.log('1. Run knowledge transfer pipeline');
      console.log('2. Execute fine-tuning scripts');
      console.log('3. Evaluate enhanced models');
      console.log('4. Integrate with Vera system');
      
    } catch (error) {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    }
  }
}

// Execute setup if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new FineTuningSetup();
  setup.execute().catch(console.error);
}

export { FineTuningSetup, type FineTuningConfig };
