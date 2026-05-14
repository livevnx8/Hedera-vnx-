# DeFi Attested Trading Agent

**Prove a trading bot didn't front-run, didn't act on insider info, and executed exactly what it claimed — all verifiable by third parties via Hedera mainnet.**

This is the **reference implementation** of Vera's DeFi attestation pattern. It demonstrates the full verifiability loop for autonomous agents that move money.

---

## The Problem

Every "AI trading agent" pitch hits the same wall: *how do you prove it's not front-running its users?*

Traditional answer: audit logs. Trust me bro.

**Vera's answer:** every decision has two on-chain proofs.

1. **Intent proof** (pre-commit): a hash of `{decision, observed-price, timestamp}` submitted to HCS **before** execution
2. **Execution proof** (post-commit): the actual swap result, signed and submitted **after** execution

Anyone can then check:

- Was the executed swap consistent with the pre-committed intent?
- Was there a gap between intent and execution large enough to suggest MEV / front-running?
- Did prices move adversarially during that window?

If intent → execution diverge, the bot is caught. No trust needed.

---

## How It Works

```
┌──────────────────┐
│  Price feed      │◀────── Mirror node / oracle
└────────┬─────────┘
         ▼
┌──────────────────┐         ┌────────────────┐
│ 1. Observe       │────────▶│ Intent Proof   │
│    & decide      │         │ → HCS topic    │
└────────┬─────────┘         └────────┬───────┘
         │                            │
         ▼                            │ seq N
┌──────────────────┐                  │
│ 2. Execute swap  │                  │
│    (SaucerSwap)  │                  │
└────────┬─────────┘                  │
         ▼                            │
┌──────────────────┐         ┌────────────────┐
│ 3. Record result │────────▶│ Execution Proof│
│                  │         │ → HCS topic    │
└──────────────────┘         └────────┬───────┘
                                      │ seq N+k
                                      ▼
                             ┌────────────────┐
                             │ npx @vera/verify
                             │ <intent-hash>
                             │ <exec-hash>
                             └────────────────┘
```

Consensus timestamps are strictly monotonic — so "intent before execution" is provable to any third party.

---

## Quick Start

```bash
# From repo root
cd examples/defi-attested-agent

# One-off demo: observe, decide, attest both proofs
node run.mjs --pair HBAR/USDC --size 100 --dry-run

# Continuous operation (one decision every 30s)
node run.mjs --pair HBAR/USDC --interval 30 --max-trades 5

# Verify any proof published by this agent
npx @vera/verify <hash>
```

Example output:

```
[agent] observed price: HBAR/USDC = 0.0889
[agent] decision: HOLD (confidence 72%, threshold 80%)
[intent]  ✓ anchored  topic=0.0.10416198 seq=1341 hash=8f3a…
[agent] no trade — respecting intent
[exec]    ✓ anchored  topic=0.0.10416198 seq=1342 hash=2c91…

Verify with:  npx @vera/verify 8f3a…  --server http://localhost:8080
```

---

## The Four Guarantees

When you run this agent, the resulting proof pair guarantees:

### 1. Decision happened before execution

Intent proof has consensus timestamp `T1`, execution proof has `T2`, and `T2 > T1` is enforced by Hedera consensus — not by the agent. Cannot be faked.

### 2. Execution matches intent

The execution proof references the intent proof's hash. Anyone fetching both can verify:

```
intent.payload.decision.action === execution.payload.trade.action
intent.payload.decision.size   === execution.payload.trade.size
```

### 3. Observed price is public

The intent proof includes the exact price the agent saw when it decided. Independent observers can cross-check against mirror node prices at `T1`. Disagreement = caught.

### 4. No hidden actions

If the operator key signs an execution without a matching intent (or vice versa), the proof pair is broken. Missing proofs are detectable by continuously-running watchers (not implemented here but trivial to add).

---

## Extending the Pattern

### For real DeFi integration

Replace `executeTrade()` with actual SaucerSwap SDK calls:

```js
import { SaucerSwapClient } from '@saucerswap/sdk';

async function executeTrade(intent) {
  const result = await saucer.swapExactTokensForTokens({
    amountIn: intent.size,
    path: [tokenIn, tokenOut],
    slippage: intent.maxSlippage,
  });
  return { txId: result.transactionId, amountOut: result.amountOut };
}
```

### For multi-agent coordination

Extend the intent proof to reference peer agents' intents:

```js
const intent = await attestIntent({
  decision,
  observedPrice,
  peerIntents: [peerA.intentHash, peerB.intentHash],  // ← chain of context
  timestamp: Date.now(),
});
```

### For user-signed authorizations

Accept a user's wallet signature over the decision parameters:

```js
const intent = await attestIntent({
  decision,
  observedPrice,
  userAuthorization: {
    signer: userWallet,
    signature: userSig,
    nonce,
  },
});
```

Then `@vera/verify` can check the user signature in addition to the operator signature.

---

## Files

- `run.mjs` — entrypoint, CLI flags, orchestration
- `agent.mjs` — decision logic (simple momentum strategy; replace with your model)
- `attestation.mjs` — wrapper over Vera's `/api/vera/verify` endpoint
- `price-feed.mjs` — mirror-node price oracle (SaucerSwap pools)

See [THREAT_MODEL.md](../../THREAT_MODEL.md) §3.1–3.3 for what this pattern does **not** prove — critically, it does not prove the model's decision was "good," only that it happened as claimed.

---

## License

MIT — copy, fork, integrate.
