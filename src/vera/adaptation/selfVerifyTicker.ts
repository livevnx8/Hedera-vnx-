/**
 * Self-Verify Ticker
 *
 * Third adaptation loop: periodically snapshots Vera's capability + adaptation
 * state and publishes a verification proof to HCS via actionVerifier.
 *
 * Runs every `intervalMs` (default 5 min). Publishes only when the hash has
 * changed from the prior tick (drift detection) — cheap, auditable,
 * tamper-evident.
 *
 * @module vera/adaptation/selfVerifyTicker
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

export interface SelfVerifyTickerOptions {
  intervalMs?: number;
  /** Always publish even if hash unchanged (heartbeat mode) */
  forceEveryN?: number;
}

export class SelfVerifyTicker extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private ticks = 0;
  private publishes = 0;
  private lastHash: string | null = null;
  private lastProof: unknown = null;

  private readonly opts: Required<SelfVerifyTickerOptions>;

  constructor(opts: SelfVerifyTickerOptions = {}) {
    super();
    this.opts = {
      intervalMs: opts.intervalMs ?? 5 * 60_000,
      forceEveryN: opts.forceEveryN ?? 12, // force publish once per hour at 5-min tick
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.interval = setInterval(() => {
      this.tick().catch((e) =>
        logger.debug('SelfVerifyTicker', { message: 'Tick error', error: String(e) })
      );
    }, this.opts.intervalMs);
    logger.info('SelfVerifyTicker', {
      message: 'Started',
      intervalSec: this.opts.intervalMs / 1000,
      forceEveryN: this.opts.forceEveryN,
    });
  }

  stop(): void {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  getStats() {
    return {
      running: this.running,
      ticks: this.ticks,
      publishes: this.publishes,
      lastHash: this.lastHash,
      intervalMs: this.opts.intervalMs,
    };
  }

  /**
   * Manually trigger a verification cycle. Returns the proof if published.
   */
  async tick(): Promise<{ published: boolean; hash: string; proof?: unknown }> {
    this.ticks++;
    try {
      // Snapshot Vera's current adaptive state
      const [
        { capabilityRegistry },
        { behaviorAdapter },
        { latticeGrower },
        { actionVerifier },
      ] = await Promise.all([
        import('../verification/capabilityRegistry.js'),
        import('./behaviorAdapter.js'),
        import('./latticeGrower.js'),
        import('../verification/actionVerifier.js'),
      ]);

      const manifest = capabilityRegistry.getManifest() ?? capabilityRegistry.buildManifest();
      const weights = behaviorAdapter.getAllWeights();
      const lattice = latticeGrower.getSnapshot();

      const state = {
        capabilities: {
          toolCount: manifest.toolCount,
          manifestHash: manifest.hash,
        },
        behavior: {
          toolCount: weights.length,
          topAdapted: weights.slice(0, 10).map((w) => ({ tool: w.tool, weight: w.weight })),
        },
        lattice: {
          skillNodes: lattice.nodeCount,
          skillEdges: lattice.edgeCount,
        },
      };

      // Hash state deterministically
      const { createHash } = await import('crypto');
      const stateStr = JSON.stringify(state);
      const hash = createHash('sha256').update(stateStr).digest('hex');

      const forcePublish = this.ticks % this.opts.forceEveryN === 0;
      if (hash === this.lastHash && !forcePublish) {
        this.emit('unchanged', { ticks: this.ticks, hash });
        return { published: false, hash };
      }

      // Drift detected (or forced heartbeat) — publish
      const proof = await actionVerifier.verifyAction({
        domain: 'self-state',
        type: 'adaptation-snapshot',
        actor: 'vera-self-verify-ticker',
        payload: { ...state, stateHash: hash, forced: forcePublish, previousHash: this.lastHash },
      });

      this.lastHash = hash;
      this.lastProof = proof;
      this.publishes++;
      this.emit('published', { ticks: this.ticks, hash, proof });

      logger.info('SelfVerifyTicker', {
        message: 'State snapshot published',
        hash: hash.substring(0, 16),
        toolWeights: weights.length,
        skillNodes: lattice.nodeCount,
        forced: forcePublish,
      });

      return { published: true, hash, proof };
    } catch (e) {
      logger.debug('SelfVerifyTicker', { message: 'Tick failed', error: String(e) });
      return { published: false, hash: '' };
    }
  }

  getLastProof(): unknown {
    return this.lastProof;
  }
}

export const selfVerifyTicker = new SelfVerifyTicker();
