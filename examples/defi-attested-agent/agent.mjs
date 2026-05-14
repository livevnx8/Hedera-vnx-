/**
 * agent.mjs — simple momentum strategy with bounded confidence.
 * Real agents should swap this out for their ML model / LLM chain.
 * The attestation pattern is independent of the strategy.
 */

export class SimpleMomentumAgent {
  constructor({ priceWindow = 5, buyThreshold = 0.7, sellThreshold = 0.7 } = {}) {
    this.priceWindow = priceWindow;
    this.buyThreshold = buyThreshold;
    this.sellThreshold = sellThreshold;
    this._priceHistory = [];
  }

  /**
   * Observe a new price point and decide. Returns a decision object that
   * will be canonicalized into the intent proof.
   *
   * @param {{price:number, observedAt:number}} snapshot
   * @param {number} size — trade size in base units
   * @returns {{action:'BUY'|'SELL'|'HOLD', size:number, confidence:number, reason:string}}
   */
  decide(snapshot, size) {
    if (!snapshot?.price || Number.isNaN(snapshot.price)) {
      return { action: 'HOLD', size: 0, confidence: 1, reason: 'no-price' };
    }

    this._priceHistory.push(snapshot.price);
    if (this._priceHistory.length > this.priceWindow) {
      this._priceHistory.shift();
    }

    if (this._priceHistory.length < 2) {
      return { action: 'HOLD', size: 0, confidence: 1, reason: 'warming-up' };
    }

    const first = this._priceHistory[0];
    const last = this._priceHistory[this._priceHistory.length - 1];
    const momentum = (last - first) / first; // relative change

    // Map momentum to confidence: |10%| move = 1.0 confidence
    const confidence = Math.min(1, Math.abs(momentum) * 10);

    if (momentum > 0 && confidence >= this.buyThreshold) {
      return {
        action: 'BUY',
        size,
        confidence,
        reason: `momentum-up ${(momentum * 100).toFixed(2)}%`,
      };
    }
    if (momentum < 0 && confidence >= this.sellThreshold) {
      return {
        action: 'SELL',
        size,
        confidence,
        reason: `momentum-down ${(momentum * 100).toFixed(2)}%`,
      };
    }
    return {
      action: 'HOLD',
      size: 0,
      confidence,
      reason: `insufficient-momentum ${(momentum * 100).toFixed(2)}% < threshold`,
    };
  }

  /**
   * Simulated execution. Replace with real SaucerSwap call.
   * Returns the actual swap result (which will become the execution proof).
   */
  async executeTrade(decision, snapshot) {
    if (decision.action === 'HOLD') {
      return { executed: false, reason: decision.reason };
    }
    // Simulate small slippage (0–0.5%)
    const slippage = Math.random() * 0.005;
    const executionPrice = snapshot.price * (1 + (decision.action === 'BUY' ? slippage : -slippage));
    return {
      executed: true,
      action: decision.action,
      size: decision.size,
      expectedPrice: snapshot.price,
      executionPrice: Number(executionPrice.toFixed(6)),
      slippage: Number((slippage * 100).toFixed(4)),
      txId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      simulated: true,
    };
  }
}
