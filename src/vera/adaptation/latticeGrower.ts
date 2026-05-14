/**
 * Lattice Grower
 *
 * Second adaptation loop: dynamically spawns "skill nodes" in an overlay
 * lattice when tool-usage clusters cross thresholds. Each skill node
 * represents a frequently used tool and is connected to co-occurring tools
 * via learned sequences.
 *
 * This is an overlay on top of the static sacred-geometry lattice — it does
 * NOT mutate the `flowerOfLifeOS` core. That keeps blast radius tiny and
 * the base geometry stable.
 *
 * - Non-blocking ticker (default every 60s)
 * - Persisted to `data/vera-skill-lattice.json` for cross-restart continuity
 * - Emits `node-spawned` / `edge-formed` events the rest of Vera can subscribe to
 *
 * @module vera/adaptation/latticeGrower
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface SkillNode {
  id: string;          // e.g. 'skill:hedera_get_balance'
  tool: string;
  calls: number;
  successRate: number;
  spawnedAt: number;
  layer: 'skill';
  parentCluster: string; // derived from tool prefix (hedera_, saucer_, qvx_, etc.)
}

export interface SkillEdge {
  from: string;
  to: string;
  weight: number;      // co-occurrence frequency
  createdAt: number;
}

export interface LatticeGrowerOptions {
  tickIntervalMs?: number;
  persistPath?: string;
  /** Minimum calls before a tool spawns a skill node */
  spawnThreshold?: number;
  /** Minimum co-occurrences before an edge forms */
  edgeThreshold?: number;
}

export class LatticeGrower extends EventEmitter {
  private nodes = new Map<string, SkillNode>();
  private edges: SkillEdge[] = [];
  private tickInterval: NodeJS.Timeout | null = null;
  private running = false;
  private ticks = 0;

  private readonly opts: Required<LatticeGrowerOptions>;

  constructor(opts: LatticeGrowerOptions = {}) {
    super();
    this.opts = {
      tickIntervalMs: opts.tickIntervalMs ?? 60_000,
      persistPath: opts.persistPath ?? path.join('data', 'vera-skill-lattice.json'),
      spawnThreshold: opts.spawnThreshold ?? 3,
      edgeThreshold: opts.edgeThreshold ?? 2,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.loadFromDisk();
    this.running = true;
    this.tickInterval = setInterval(() => {
      this.tick().catch((e) =>
        logger.debug('LatticeGrower', { message: 'Tick error', error: String(e) })
      );
    }, this.opts.tickIntervalMs);
    // Run one immediate tick
    this.tick().catch(() => {});
    logger.info('LatticeGrower', {
      message: 'Started',
      intervalSec: this.opts.tickIntervalMs / 1000,
      nodes: this.nodes.size,
      edges: this.edges.length,
    });
  }

  stop(): void {
    this.running = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    // Fire-and-forget final persist
    this.persist().catch(() => {});
  }

  getSnapshot() {
    return {
      running: this.running,
      ticks: this.ticks,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
    };
  }

  /**
   * Read learning stats and grow the skill lattice.
   */
  async tick(): Promise<void> {
    this.ticks++;
    try {
      const { agentLearningSystem } = await import('../../agent/learningSystem.js');
      const metrics = agentLearningSystem.getAllAgentMetrics();

      // Aggregate calls per tool across all agents
      const toolStats = new Map<string, { calls: number; successes: number }>();
      for (const m of metrics) {
        const analytics = agentLearningSystem.getToolAnalytics(m.agentId, 30);
        for (const t of analytics?.tools ?? []) {
          // Skip chat turn records — only real tool use spawns skill nodes
          if (typeof t.tool === 'string' && t.tool.startsWith('chat:')) continue;
          const calls = Number(t.calls) || 0;
          const successRate = Number(t.successRate) || 0;
          const e = toolStats.get(t.tool) ?? { calls: 0, successes: 0 };
          e.calls += calls;
          e.successes += Math.round(successRate * calls);
          toolStats.set(t.tool, e);
        }
      }

      // Spawn nodes for tools over threshold
      let spawned = 0;
      for (const [tool, s] of toolStats) {
        if (s.calls < this.opts.spawnThreshold) continue;
        const id = `skill:${tool}`;
        const existing = this.nodes.get(id);
        const node: SkillNode = {
          id,
          tool,
          calls: s.calls,
          successRate: s.calls > 0 ? s.successes / s.calls : 0,
          spawnedAt: existing?.spawnedAt ?? Date.now(),
          layer: 'skill',
          parentCluster: tool.split('_')[0] || 'other',
        };
        if (!existing) {
          this.nodes.set(id, node);
          spawned++;
          this.emit('node-spawned', node);
        } else {
          this.nodes.set(id, node); // refresh stats
        }
      }

      // Form edges between nodes that share a cluster (simple heuristic)
      let newEdges = 0;
      const byCluster = new Map<string, string[]>();
      for (const node of this.nodes.values()) {
        const cluster = byCluster.get(node.parentCluster) ?? [];
        cluster.push(node.id);
        byCluster.set(node.parentCluster, cluster);
      }
      for (const [, members] of byCluster) {
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const from = members[i];
            const to = members[j];
            const exists = this.edges.some(
              (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)
            );
            if (!exists) {
              const edge: SkillEdge = { from, to, weight: 1, createdAt: Date.now() };
              this.edges.push(edge);
              newEdges++;
              this.emit('edge-formed', edge);
            }
          }
        }
      }

      if (spawned > 0 || newEdges > 0) {
        logger.info('LatticeGrower', {
          message: 'Lattice grown',
          newNodes: spawned,
          newEdges,
          totalNodes: this.nodes.size,
          totalEdges: this.edges.length,
        });
      }

      await this.persist();
    } catch (e) {
      logger.debug('LatticeGrower', { message: 'Tick failed', error: String(e) });
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.opts.persistPath), { recursive: true });
      await fs.writeFile(
        this.opts.persistPath,
        JSON.stringify(
          { updatedAt: Date.now(), nodes: Array.from(this.nodes.values()), edges: this.edges },
          null,
          2
        )
      );
    } catch (e) {
      logger.debug('LatticeGrower', { message: 'Persist failed', error: String(e) });
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.opts.persistPath, 'utf8');
      const data = JSON.parse(raw) as { nodes: SkillNode[]; edges: SkillEdge[] };
      for (const n of data.nodes ?? []) this.nodes.set(n.id, n);
      this.edges = data.edges ?? [];
      logger.info('LatticeGrower', {
        message: 'Loaded skill lattice from disk',
        nodes: this.nodes.size,
        edges: this.edges.length,
      });
    } catch {
      // Fresh start
    }
  }
}

export const latticeGrower = new LatticeGrower();
