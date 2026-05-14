/**
 * attestation.mjs — thin wrapper over Vera's /api/vera/verify endpoint.
 * Handles intent + execution proof submission.
 */

export class Attestor {
  constructor({ server = 'http://localhost:8080', actor = 'defi-agent' } = {}) {
    this.server = server;
    this.actor = actor;
  }

  /**
   * Submit a proof for an action. Returns the full proof object incl. hash + HCS seq.
   */
  async attest({ domain, type, payload, result }) {
    const res = await fetch(`${this.server}/api/vera/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        type,
        actor: this.actor,
        payload,
        result,
      }),
    });
    if (!res.ok) {
      throw new Error(`attest failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    return res.json();
  }

  /**
   * Pre-commit: observation + decision, BEFORE executing anything.
   * This is the critical anti-frontrun proof.
   */
  async attestIntent({ decision, observedPrice, context = {} }) {
    return this.attest({
      domain: 'defi',
      type: 'trade-intent',
      payload: {
        decision,
        observedPrice,
        observedAt: Date.now(),
        ...context,
      },
    });
  }

  /**
   * Post-commit: the actual execution result, referencing the intent hash.
   */
  async attestExecution({ intentHash, trade, actualResult }) {
    return this.attest({
      domain: 'defi',
      type: 'trade-execution',
      payload: {
        intentHash,
        trade,
        executedAt: Date.now(),
      },
      result: actualResult,
    });
  }

  /**
   * Verify a proof via Vera's server-side mirror-node roundtrip.
   */
  async verify(hash) {
    const res = await fetch(`${this.server}/api/vera/verify/action/${hash}`);
    return res.json();
  }
}
