/**
 * Behavior Adapter
 *
 * Closes the first adaptation loop: periodically reads what Vera has learned
 * from `agentLearningSystem` and derives a weight (0..1) per tool so routers
 * can bias toward fast, successful tools and away from slow or failing ones.
 *
 * - Non-blocking ticker (default every 60s)
 * - Weights persisted to `data/vera-tool-weights.json` so they survive restarts
 * - Exposes `getToolWeight(name)` for routers/executors to consult
 *
 * @module vera/adaptation/behaviorAdapter
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface ToolWeight {
  tool: string;
  weight: number; // 0..1
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  lastUpdated: number;
  reason: string;
}

export interface BehaviorAdapterOptions {
  tickIntervalMs?: number;
  persistPath?: string;
  /** Default weight for unseen tools */
  defaultWeight?: number;
  /** Latency (ms) above which tools get penalized */
  slowThresholdMs?: number;
  /** Success rate (0..1) below which tools get penalized */
  minSuccessRate?: number;
}

export class BehaviorAdapter extends EventEmitter {
  private weights = new Map<string, ToolWeight>();
  private tickInterval: NodeJS.Timeout | null = null;
  private running = false;
  private ticks = 0;

  private readonly opts: Required<BehaviorAdapterOptions>;

  constructor(opts: BehaviorAdapterOptions = {}) {
    super();
    this.opts = {
      tickIntervalMs: opts.tickIntervalMs ?? 60_000,
      persistPath: opts.persistPath ?? path.join('data', 'vera-tool-weights.json'),
      defaultWeight: opts.defaultWeight ?? 1.0,
      slowThresholdMs: opts.slowThresholdMs ?? 2000,
      minSuccessRate: opts.minSuccessRate ?? 0.85,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.loadFromDisk();
    this.running = true;
    this.tickInterval = setInterval(() => {
      this.tick().catch((e) =>
        logger.debug('BehaviorAdapter', { message: 'Tick error', error: String(e) })
      );
    }, this.opts.tickIntervalMs);
    // Also run one immediate tick on start
    this.tick().catch(() => {});
    logger.info('BehaviorAdapter', {
      message: 'Started',
      intervalSec: this.opts.tickIntervalMs / 1000,
      persistPath: this.opts.persistPath,
    });
  }

  stop(): void {
    this.running = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    // Fire-and-forget final persist
    this.persist().catch(() => {});
  }

  /**
   * Router/executor consults this to bias tool choice.
   */
  getToolWeight(tool: string): number {
    return this.weights.get(tool)?.weight ?? this.opts.defaultWeight;
  }

  getAllWeights(): ToolWeight[] {
    return Array.from(this.weights.values()).sort((a, b) => b.calls - a.calls);
  }

  /**
   * Given a set of candidate tools, return the one Vera has learned works best.
   * Ties are broken by call count (more battle-tested > less).
   * Unknown tools default to `defaultWeight`.
   */
  pickBestTool(candidates: string[]): string | null {
    if (candidates.length === 0) return null;
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const tool of candidates) {
      const tw = this.weights.get(tool);
      const weight = tw?.weight ?? this.opts.defaultWeight;
      const calls = tw?.calls ?? 0;
      // Score = weight primarily, call-count as tie-breaker
      const score = weight + Math.min(0.0001 * calls, 0.05);
      if (score > bestScore) {
        bestScore = score;
        best = tool;
      }
    }
    return best;
  }

  /**
   * Explain why a tool got its current weight (for dashboards / debugging).
   */
  explain(tool: string): ToolWeight | null {
    return this.weights.get(tool) ?? null;
  }

  getStats() {
    return {
      running: this.running,
      ticks: this.ticks,
      toolCount: this.weights.size,
      intervalMs: this.opts.tickIntervalMs,
      persistPath: this.opts.persistPath,
    };
  }

  /**
   * One adaptation pass: read learning stats, update weights, emit + persist.
   */
  async tick(): Promise<void> {
    this.ticks++;
    try {
      const { agentLearningSystem } = await import('../../agent/learningSystem.js');
      const metrics = agentLearningSystem.getAllAgentMetrics();

      // Collect per-tool stats across all agents (7 days)
      const toolAgg = new Map<
        string,
        { calls: number; successes: number; totalLatency: number }
      >();

      for (const m of metrics) {
        const analytics = agentLearningSystem.getToolAnalytics(m.agentId, 7);
        const tools = Array.isArray(analytics?.tools) ? analytics.tools : [];
        for (const t of tools) {
          // Skip chat turn records — they're conversation logs, not tool calls.
          // LLM latency is inherent to the model, not a signal about tool quality.
          if (typeof t.tool === 'string' && t.tool.startsWith('chat:')) continue;
          const calls = Number(t.calls) || 0;
          const successRate = Number(t.successRate) || 0;
          const avgDuration = Number(t.avgDuration) || 0;
          const e = toolAgg.get(t.tool) ?? { calls: 0, successes: 0, totalLatency: 0 };
          e.calls += calls;
          e.successes += Math.round(successRate * calls);
          e.totalLatency += avgDuration * calls;
          toolAgg.set(t.tool, e);
        }
      }

      // Compute weights
      const updated: ToolWeight[] = [];
      for (const [tool, a] of toolAgg) {
        const successRate = a.calls > 0 ? a.successes / a.calls : 1;
        const avgLatencyMs = a.calls > 0 ? a.totalLatency / a.calls : 0;

        // Start at 1.0, apply multiplicative penalties
        let weight = 1.0;
        const reasons: string[] = [];

        if (successRate < this.opts.minSuccessRate) {
          const penalty = Math.max(0.2, successRate / this.opts.minSuccessRate);
          weight *= penalty;
          reasons.push(`success ${(successRate * 100).toFixed(0)}% < ${(this.opts.minSuccessRate * 100).toFixed(0)}%`);
        }
        if (avgLatencyMs > this.opts.slowThresholdMs) {
          const penalty = Math.max(0.3, this.opts.slowThresholdMs / avgLatencyMs);
          weight *= penalty;
          reasons.push(`slow ${avgLatencyMs.toFixed(0)}ms > ${this.opts.slowThresholdMs}ms`);
        }
        if (reasons.length === 0) reasons.push('healthy');

        const tw: ToolWeight = {
          tool,
          weight: Math.max(0.1, Math.min(1, weight)),
          calls: a.calls,
          successRate,
          avgLatencyMs,
          lastUpdated: Date.now(),
          reason: reasons.join('; '),
        };
        this.weights.set(tool, tw);
        updated.push(tw);
      }

      this.emit('adapted', { ticks: this.ticks, toolCount: updated.length });
      await this.persist();
    } catch (e) {
      logger.debug('BehaviorAdapter', { message: 'Tick failed', error: String(e) });
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.opts.persistPath), { recursive: true });
      const data = {
        updatedAt: Date.now(),
        ticks: this.ticks,
        weights: Array.from(this.weights.values()),
      };
      await fs.writeFile(this.opts.persistPath, JSON.stringify(data, null, 2));
    } catch (e) {
      logger.debug('BehaviorAdapter', { message: 'Persist failed', error: String(e) });
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.opts.persistPath, 'utf8');
      const data = JSON.parse(raw) as { weights: ToolWeight[] };
      for (const w of data.weights ?? []) {
        // Migration: drop legacy chat:* entries (no longer tracked as tools)
        if (typeof w.tool === 'string' && w.tool.startsWith('chat:')) continue;
        this.weights.set(w.tool, w);
      }
      logger.info('BehaviorAdapter', { message: 'Loaded weights from disk', count: this.weights.size });
    } catch {
      // No prior state — fresh start
    }
  }
}

export const behaviorAdapter = new BehaviorAdapter();
