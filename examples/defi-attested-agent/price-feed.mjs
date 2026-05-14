/**
 * price-feed.mjs — pulls live HBAR/USDC price from Vera's saucerswap tool.
 * Could easily be replaced with a direct SaucerSwap mirror-node query or
 * Chainlink/Pyth oracle.
 */

export class PriceFeed {
  constructor({ server = 'http://localhost:8080', pair = 'HBAR/USDC' } = {}) {
    this.server = server;
    this.pair = pair;
    this._lastPrice = null;
  }

  /**
   * Get the current HBAR → USD rate from Vera's kit_get_exchange_rate tool.
   * Returns { price, source, observedAt }.
   */
  async current() {
    // Vera's smart chat will route "hbar price" → kit_get_exchange_rate
    const res = await fetch(`${this.server}/api/vera/oasis/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "what's the current HBAR price in USD?" }),
    });
    const body = await res.json();

    // Extract the numeric price from tool output
    const toolOutput = body?.toolOutputs?.[0]?.output ?? body?.response ?? '';
    const priceMatch = String(toolOutput).match(/0?\.\d{2,6}/);
    const price = priceMatch ? parseFloat(priceMatch[0]) : null;

    const snapshot = {
      pair: this.pair,
      price,
      source: 'kit_get_exchange_rate',
      observedAt: Date.now(),
      rawText: typeof toolOutput === 'string' ? toolOutput.slice(0, 200) : null,
    };

    this._lastPrice = snapshot;
    return snapshot;
  }

  lastPrice() {
    return this._lastPrice;
  }
}
