/**
 * RigTopology — GPU-aware compute scheduling for Vera lattice agents
 *
 * Knows which GPU hosts which model, current utilization, and queue depth.
 * Routes planner / deep-tier agents to the least-loaded GPU node.
 */

import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import type { InferenceTier } from '../agent/runner.js';

export interface GpuNode {
  id: number;
  model: string;
  url: string;
  maxLayers: number;
  tier: InferenceTier;
  load: number;      // 0-1 synthetic utilization
  queueDepth: number;
  lastHeartbeat: number;
}

class RigTopology {
  private gpus: GpuNode[] = [];
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    // Parse RIG_TOPOLOGY JSON if provided
    if (config.RIG_TOPOLOGY) {
      try {
        const parsed = JSON.parse(config.RIG_TOPOLOGY) as GpuNode[];
        this.gpus = parsed.map((g, i) => ({
          id: g.id ?? i,
          model: g.model ?? 'unknown',
          url: g.url ?? 'http://localhost:11434',
          maxLayers: g.maxLayers ?? 35,
          tier: g.tier ?? 'standard',
          load: 0,
          queueDepth: 0,
          lastHeartbeat: Date.now(),
        }));
      } catch (e) {
        logger.warn('RigTopology', { message: 'Failed to parse RIG_TOPOLOGY, falling back to defaults', error: String(e) });
      }
    }

    // Fallback: create default single-GPU rig from config
    if (this.gpus.length === 0) {
      const count = config.RIG_GPU_COUNT ?? 1;
      for (let i = 0; i < count; i++) {
        this.gpus.push({
          id: i,
          model: config.DEFAULT_CHAT_MODEL ?? 'llama3.1:8b',
          url: config.OLLAMA_URL ?? 'http://localhost:11434',
          maxLayers: config.NATIVE_GPU_LAYERS ?? 35,
          tier: config.RIG_DEFAULT_TIER ?? 'standard',
          load: 0,
          queueDepth: 0,
          lastHeartbeat: Date.now(),
        });
      }
    }

    this.initialized = true;
    logger.info('RigTopology', {
      message: 'Rig topology initialized',
      gpus: this.gpus.length,
      models: this.gpus.map(g => g.model),
    });
  }

  /**
   * Pick the best GPU for a given inference tier.
   * Prefers GPUs whose declared tier matches; falls back to least-loaded.
   */
  pickGpu(tier: InferenceTier): GpuNode | null {
    if (!this.initialized) this.initialize();
    if (this.gpus.length === 0) return null;

    // Tier match + load scoring
    const scored = this.gpus.map(g => {
      const tierMatch = g.tier === tier ? 1.0 : g.tier === 'standard' && tier === 'fast' ? 0.7 : 0.3;
      const loadPenalty = g.load * 2 + g.queueDepth * 0.1;
      return { gpu: g, score: tierMatch - loadPenalty };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].gpu;

    // Simulate queue depth increase
    best.queueDepth++;
    return best;
  }

  /**
   * Record task completion to update synthetic load.
   */
  releaseGpu(gpuId: number, latencyMs: number): void {
    const gpu = this.gpus.find(g => g.id === gpuId);
    if (!gpu) return;
    gpu.queueDepth = Math.max(0, gpu.queueDepth - 1);
    // Smooth load estimate: EMA with 0.2 alpha
    const instantLoad = Math.min(1, latencyMs / 5000);
    gpu.load = gpu.load * 0.8 + instantLoad * 0.2;
    gpu.lastHeartbeat = Date.now();
  }

  getStats(): { gpus: GpuNode[]; averageLoad: number } {
    const avg = this.gpus.reduce((s, g) => s + g.load, 0) / (this.gpus.length || 1);
    return { gpus: this.gpus.map(g => ({ ...g })), averageLoad: avg };
  }
}

export const rigTopology = new RigTopology();
