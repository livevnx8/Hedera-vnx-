/**
 * GPU Configuration for RTX 4060 Ti (8GB)
 * 
 * Optimized settings for 8GB VRAM:
 * - Knowledge graph: up to 100K nodes
 * - Embeddings: all-MiniLM-L6-v2 (384 dims, ~80MB)
 * - LLM: llama3.1:8b or nemotron-4-15b with quantization
 * - Batch processing: 16-32 items per batch
 */

import { logger } from '../monitoring/logger.js';

export interface GPUConfig {
  device: 'cuda' | 'cpu';
  vramTotalMB: number;
  vramAvailableMB: number;
  cudaVersion: string;
  
  // Knowledge graph limits
  maxGraphNodes: number;
  maxGraphEdges: number;
  
  // Embedding config
  embeddingModel: string;
  embeddingDimension: number;
  embeddingBatchSize: number;
  
  // LLM config
  llmModel: string;
  llmMaxTokens: number;
  llmQuantization: 'none' | 'int8' | 'int4';
  llmContextLength: number;
  
  // Batch processing
  ragTopK: number;
  ragBatchSize: number;
  
  // Graph analytics
  graphAlgorithm: 'auto' | 'cugraph' | 'networkx';
  maxLouvainIterations: number;
}

// RTX 4060 Ti 8GB optimized configuration
export const RTX4060TI_CONFIG: GPUConfig = {
  device: 'cuda',
  vramTotalMB: 8192,
  vramAvailableMB: 7000, // Leave headroom for OS
  cudaVersion: '12.x',
  
  // Knowledge graph: ~100K nodes = ~2GB VRAM
  maxGraphNodes: 100000,
  maxGraphEdges: 500000,
  
  // Embeddings: all-MiniLM fits comfortably
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  embeddingDimension: 384,
  embeddingBatchSize: 32,
  
  // LLM: 8B model with INT8 quantization (~6GB)
  llmModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  llmMaxTokens: 2048,
  llmQuantization: 'int8',
  llmContextLength: 8192,
  
  // RAG: Conservative batching
  ragTopK: 10,
  ragBatchSize: 8,
  
  // Graph analytics
  graphAlgorithm: 'cugraph',
  maxLouvainIterations: 100
};

// CPU fallback configuration
export const CPU_CONFIG: GPUConfig = {
  device: 'cpu',
  vramTotalMB: 0,
  vramAvailableMB: 0,
  cudaVersion: 'N/A',
  
  maxGraphNodes: 50000,
  maxGraphEdges: 100000,
  
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  embeddingDimension: 384,
  embeddingBatchSize: 8,
  
  llmModel: 'llama3.1:8b',
  llmMaxTokens: 1024,
  llmQuantization: 'none',
  llmContextLength: 4096,
  
  ragTopK: 5,
  ragBatchSize: 4,
  
  graphAlgorithm: 'networkx',
  maxLouvainIterations: 50
};

export class GPUConfigurator {
  private config: GPUConfig = CPU_CONFIG;
  private detectedGPU: string | null = null;

  /**
   * Auto-detect GPU and apply optimal config
   */
  async autoConfigure(): Promise<GPUConfig> {
    try {
      const gpuInfo = await this.detectGPU();
      
      if (gpuInfo && this.isRTX4060Ti(gpuInfo)) {
        this.config = RTX4060TI_CONFIG;
        this.detectedGPU = 'RTX 4060 Ti';
        
        logger.info('GPUConfigurator', {
          gpu: this.detectedGPU,
          vram: this.config.vramTotalMB,
          message: 'Optimized for RTX 4060 Ti 8GB'
        });
      } else if (gpuInfo) {
        // Generic GPU detected, apply safe defaults
        this.config = this.applyGenericGPUConfig(gpuInfo);
        this.detectedGPU = gpuInfo.name;
        
        logger.info('GPUConfigurator', {
          gpu: this.detectedGPU,
          vram: this.config.vramTotalMB,
          message: 'Using generic GPU config'
        });
      } else {
        this.config = CPU_CONFIG;
        this.detectedGPU = null;
        
        logger.info('GPUConfigurator', {
          message: 'No GPU detected, using CPU config'
        });
      }
    } catch (error) {
      logger.warn('GPUConfigurator', {
        error: error instanceof Error ? error.message : String(error),
        message: 'GPU detection failed, using CPU config'
      });
      this.config = CPU_CONFIG;
    }

    return this.config;
  }

  /**
   * Detect GPU using nvidia-smi
   */
  private async detectGPU(): Promise<{ name: string; vramMB: number } | null> {
    try {
      const { execSync } = await import('child_process');
      const nvidiaSmi = execSync(
        'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
        { encoding: 'utf-8', timeout: 5000 }
      ).toString().trim();
      
      const [name, vram] = nvidiaSmi.split(',').map(s => s.trim());
      const vramMB = parseInt(vram);

      return { name, vramMB };
    } catch {
      return null;
    }
  }

  /**
   * Check if GPU is RTX 4060 Ti
   */
  private isRTX4060Ti(gpu: { name: string; vramMB: number }): boolean {
    const is4060Ti = gpu.name.toLowerCase().includes('4060 ti') ||
                     gpu.name.toLowerCase().includes('4060-ti');
    const has8GB = gpu.vramMB >= 7000 && gpu.vramMB <= 9000;
    
    return is4060Ti && has8GB;
  }

  /**
   * Apply generic GPU configuration based on VRAM
   */
  private applyGenericGPUConfig(gpu: { name: string; vramMB: number }): GPUConfig {
    const baseConfig = { ...RTX4060TI_CONFIG };
    
    // Scale limits based on VRAM
    const vramRatio = gpu.vramMB / 8192;
    
    baseConfig.vramTotalMB = gpu.vramMB;
    baseConfig.vramAvailableMB = Math.floor(gpu.vramMB * 0.85);
    
    baseConfig.maxGraphNodes = Math.floor(100000 * vramRatio);
    baseConfig.maxGraphEdges = Math.floor(500000 * vramRatio);
    
    // Adjust LLM quantization based on VRAM
    if (gpu.vramMB < 6000) {
      baseConfig.llmQuantization = 'int4';
      baseConfig.llmMaxTokens = 1024;
    } else if (gpu.vramMB > 12000) {
      baseConfig.llmQuantization = 'none';
      baseConfig.llmMaxTokens = 4096;
    }

    return baseConfig;
  }

  /**
   * Get current configuration
   */
  getConfig(): GPUConfig {
    return { ...this.config };
  }

  /**
   * Get detected GPU name
   */
  getDetectedGPU(): string | null {
    return this.detectedGPU;
  }

  /**
   * Check if running on GPU
   */
  isGPU(): boolean {
    return this.config.device === 'cuda';
  }

  /**
   * Check if specific VRAM threshold is available
   */
  hasVRAM(requiredMB: number): boolean {
    return this.config.vramAvailableMB >= requiredMB;
  }

  /**
   * Get recommended batch size for operation
   */
  getOptimalBatchSize(operation: 'embedding' | 'rag' | 'graph'): number {
    switch (operation) {
      case 'embedding':
        return this.config.embeddingBatchSize;
      case 'rag':
        return this.config.ragBatchSize;
      case 'graph':
        return Math.min(100, Math.floor(this.config.vramAvailableMB / 100));
      default:
        return 8;
    }
  }

  /**
   * Estimate VRAM usage for operation
   */
  estimateVRAMUsage(operation: {
    type: 'embed' | 'llm' | 'graph';
    items?: number;
    tokens?: number;
    nodes?: number;
    edges?: number;
  }): number {
    switch (operation.type) {
      case 'embed':
        // ~1MB per 1000 embeddings (384 dims)
        return ((operation.items || 1) * 384 * 4) / (1024 * 1024);
      
      case 'llm':
        // ~2GB base + 0.5MB per 1K tokens
        const baseLLM = this.config.llmQuantization === 'int8' ? 6000 : 
                        this.config.llmQuantization === 'int4' ? 4000 : 8000;
        return baseLLM + ((operation.tokens || 1000) * 0.5);
      
      case 'graph':
        // ~40 bytes per node, ~24 bytes per edge
        const nodeBytes = (operation.nodes || 0) * 40;
        const edgeBytes = (operation.edges || 0) * 24;
        return (nodeBytes + edgeBytes) / (1024 * 1024);
      
      default:
        return 1000;
    }
  }

  /**
   * Get optimization tips for user's GPU
   */
  getOptimizationTips(): string[] {
    const tips: string[] = [];
    
    if (this.detectedGPU?.includes('4060 Ti')) {
      tips.push('✓ RTX 4060 Ti detected - all features enabled');
      tips.push('✓ Use INT8 quantization for 8B models (~6GB VRAM)');
      tips.push('✓ Knowledge graph up to 100K nodes supported');
      tips.push('✓ Batch embeddings in groups of 32');
      tips.push('⚡ CUDA Graph analytics 100x faster than CPU');
    } else if (this.isGPU()) {
      tips.push(`✓ GPU detected: ${this.detectedGPU}`);
      tips.push(`✓ ${this.config.vramTotalMB}MB VRAM available`);
      tips.push(`✓ Knowledge graph up to ${this.config.maxGraphNodes.toLocaleString()} nodes`);
    } else {
      tips.push('⚠ No GPU detected - using CPU mode');
      tips.push('⚠ Knowledge graph limited to 50K nodes');
      tips.push('💡 Consider adding GPU for 10-100x speedup');
    }

    return tips;
  }

  /**
   * Monitor VRAM usage (if available)
   */
  async getCurrentVRAMUsage(): Promise<{ used: number; free: number; total: number } | null> {
    if (!this.isGPU()) return null;

    try {
      const { execSync } = await import('child_process');
      const nvidiaSmi = execSync(
        'nvidia-smi --query-gpu=memory.used,memory.free,memory.total --format=csv,noheader,nounits',
        { encoding: 'utf-8', timeout: 2000 }
      ).toString().trim();
      
      const [used, free, total] = nvidiaSmi.split(',').map(s => parseInt(s.trim()));

      return { used, free, total };
    } catch {
      return null;
    }
  }

  /**
   * Print configuration summary
   */
  printSummary(): void {
    console.log('\n' + '='.repeat(50));
    console.log('🎮 GPU Configuration');
    console.log('='.repeat(50));
    
    if (this.detectedGPU) {
      console.log(`GPU: ${this.detectedGPU}`);
      console.log(`VRAM: ${this.config.vramTotalMB}MB (${this.config.vramAvailableMB}MB available)`);
      console.log(`CUDA: ${this.config.cudaVersion}`);
    } else {
      console.log('GPU: Not detected (CPU mode)');
    }
    
    console.log('\n📊 Knowledge Graph:');
    console.log(`  Max Nodes: ${this.config.maxGraphNodes.toLocaleString()}`);
    console.log(`  Max Edges: ${this.config.maxGraphEdges.toLocaleString()}`);
    console.log(`  Algorithm: ${this.config.graphAlgorithm}`);
    
    console.log('\n🔤 Embeddings:');
    console.log(`  Model: ${this.config.embeddingModel}`);
    console.log(`  Dimensions: ${this.config.embeddingDimension}`);
    console.log(`  Batch Size: ${this.config.embeddingBatchSize}`);
    
    console.log('\n🤖 LLM:');
    console.log(`  Model: ${this.config.llmModel}`);
    console.log(`  Quantization: ${this.config.llmQuantization}`);
    console.log(`  Max Tokens: ${this.config.llmMaxTokens}`);
    
    console.log('\n💡 Tips:');
    this.getOptimizationTips().forEach(tip => console.log(`  ${tip}`));
    
    console.log('='.repeat(50) + '\n');
  }
}

// Export singleton
export const gpuConfigurator = new GPUConfigurator();
export default gpuConfigurator;
