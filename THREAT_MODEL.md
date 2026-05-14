# Vera Threat Model

**What Vera proves. What she doesn't. Why that matters.**

This is the honest, adversarial specification of Vera's verifiability guarantees. If you're building on top of Vera, evaluating her for compliance, or integrating her into a production agent pipeline — read this first.

---

## TL;DR

Vera is a **verifiable-by-attestation AI** built on Hedera Consensus Service.

She proves **what she did, when she did it, and that it hasn't been tampered with**.

She does **not** prove **that what she did was correct**, **that the LLM is reasoning truthfully**, or **that the tools she calls return honest data**.

These are different problems. Knowing which one you need is the difference between useful verifiability and security theater.

---

## 1. Verifiability Model

### 1.1 What is attested

Every action Vera takes produces a cryptographic proof containing:

| Field | Purpose |
|:---|:---|
| `domain` | Coarse category (e.g. `tool-call`, `decision`, `state-snapshot`) |
| `type`   | Fine-grained action name (e.g. `saucerswap_get_pools`) |
| `actor`  | Which Vera subsystem performed it |
| `payload`| Canonical inputs (deterministically JSON-sorted) |
| `result` | Canonical outputs |
| `hash`   | SHA-256 of the canonical payload |
| `signature` | Ed25519 / ECDSA over `hash` by the operator account |
| `timestamp` | Local ms timestamp |

Each proof is HIP-993-chunked and submitted to a dedicated HCS topic (currently `0.0.10416198` on mainnet). The Hedera consensus node assigns a **consensus timestamp** which cannot be forged or reordered.

### 1.2 Verification chain

The `@vera/verify` package (or equivalent) executes this chain **without trusting the Vera server**:

1. Fetch the raw message from `https://mainnet-public.mirrornode.hedera.com/api/v1/topics/<topic>/messages/<seq>`
2. Decode the base64 body, unwrap the double-layer HIP-993 envelope
3. Extract `hash`, `signature`, and canonical `payload`
4. **Recompute `SHA-256(canonicalize(payload))`** — must equal `hash`
5. Verify the operator signature over `hash`
6. Cross-check the returned `consensus_timestamp` against Hedera consensus roster

If any step fails, the proof is rejected. There is no override.

---

## 2. What Vera Proves (The Guarantees)

### 2.1 Non-repudiation of action occurrence

> **Claim:** "A Vera agent with operator key `K` performed action `A` at consensus time `T`."

**Proof mechanism:** Hedera consensus timestamp + operator signature.

**Trust assumptions:**

- Hedera mainnet consensus is honest (≥ ⅔ of stake)
- Operator private key is not compromised
- SHA-256 and Ed25519/ECDSA are not broken

### 2.2 Payload integrity

> **Claim:** "The payload and result of action `A` have not been altered since submission."

**Proof mechanism:** Canonical JSON → SHA-256, recomputable by anyone. Hedera is append-only, so once anchored, the payload cannot be modified without altering the hash.

**Trust assumptions:**

- Canonicalization function is implemented correctly (see `canonicalize()` in `actionVerifier.ts` and `@vera/verify`)
- JSON serialization is deterministic (we sort keys recursively; no floats in payloads)

### 2.3 Temporal ordering

> **Claim:** "Action `A` occurred before action `B`."

**Proof mechanism:** Hedera consensus timestamps are strictly monotonic within a topic. Sequence numbers are globally assigned.

**Trust assumption:** Same as 2.1.

### 2.4 State drift detection

> **Claim:** "Vera's capability set, adaptive weights, and lattice topology at time `T` were exactly `S`."

**Proof mechanism:** `selfVerifyTicker` periodically snapshots Vera's full adaptive state, canonicalizes it, hashes it, signs it, and submits it to HCS.

Any change to Vera's reasoning behavior produces a new state root. Outside observers can detect drift by comparing successive state roots.

### 2.5 Capability manifest binding

> **Claim:** "Vera has exactly these 124 tools registered, with these descriptions."

**Proof mechanism:** `capabilityRegistry` publishes a Merkle-style root of the tool manifest. Changing any tool (adding, removing, or modifying) produces a new root.

---

## 3. What Vera Does **NOT** Prove (The Gaps)

### 3.1 Correctness of LLM reasoning ❌

Vera can verifiably call a tool with verifiably bad arguments because the LLM hallucinated. The proof says "the LLM chose to call `hedera_get_balance` with account `0.0.999999`" — it does not say "this was the right account to query."

**Mitigations available:**

- Pre-commit proofs (sign the *intent* before executing)
- Multiple-model consensus (two different LLMs must agree)
- zkML (future — prove the inference was correct without revealing the model)

None of these are implemented today.

### 3.2 Correctness of tool outputs ❌

If `saucerswap_get_token_price` returns a manipulated price, Vera will sign and anchor the wrong price. The proof shows **what Vera was told**, not **what was true**.

**Mitigations available:**

- Use only tools that themselves publish proofs (chain of attestations)
- Cross-check against multiple data sources
- Require oracles with their own attestation chain

### 3.3 LLM output reproducibility ❌

Even with temperature=0, most LLM runtimes have non-determinism (tokenizer edge cases, GPU kernel variance, KV-cache ordering). Vera's textual responses are hashed and anchored, but cannot be proven to re-derive from the same inputs.

**What *is* deterministic and verifiable:**

- Tool calls (args + results)
- State transitions
- Capability manifest

The prose wrapper around tool calls is attested but not reproducible.

### 3.4 Operator integrity ❌

The operator key signs everything. If the operator account is compromised, an attacker can produce valid-looking proofs for fake actions.

**Mitigations available (unimplemented):**

- Threshold signatures (M-of-N operators)
- Hardware-secured keys (HSM, TEE)
- User-attached signatures (user signs intent, Vera counter-signs)

### 3.5 Liveness / censorship ❌

Vera can selectively *not submit* a proof for an action she took. The proof cache holds it locally, but if she chooses, she can drop the action before HCS submission.

This is a **censorship-of-evidence** attack, not tampering. The user sees the action happen but can't find the proof.

**Mitigations available:**

- Pre-commit proofs (submit the hash *before* execution — if Vera fails to follow through, drift is visible)
- External observers that replay expected actions and verify proofs appear

### 3.6 User intent binding ❌

Proofs show Vera's actor acted, not that the user requested it. A compromised Vera could take actions "on behalf of" a user who never asked.

**Mitigation (unimplemented):** User signs request → Vera signs response → both published. Requires wallet integration.

### 3.7 Model substitution ❌

The proof does not attest *which LLM model weights* generated the decision. A malicious operator could swap Ollama for a compromised model mid-session and proofs would still verify.

**Mitigation (unimplemented):** Hash loaded model weights at `selfVerifyTicker` intervals.

### 3.8 Mirror node availability ❌

`@vera/verify` depends on Hedera's public mirror node. If it's down or compromised, verification fails.

**Mitigations:**

- Use multiple mirror nodes (Hedera publishes a list)
- Run your own mirror node (open-source)
- Fall back to direct consensus node queries

---

## 4. Threat Actors

### 4.1 Adversarial Vera operator

**Capability:** Controls the operator key, server, and database.

**Can do:**

- Produce valid proofs for fabricated actions (3.4)
- Hide proofs for real actions (3.5)
- Swap the underlying LLM (3.7)

**Cannot do:**

- Alter an action after it's been anchored (2.2)
- Forge a Hedera consensus timestamp (2.1, 2.3)
- Claim to have acted at a time they didn't (without signing)

### 4.2 Adversarial tool provider

**Capability:** Controls one of the 124 upstream tools Vera calls.

**Can do:**

- Return false data to Vera (3.2)
- Cause Vera to sign that false data

**Cannot do:**

- Forge Vera's signature or alter the proof after submission

**Defense:** Prefer tools with their own attestation chains; cross-reference critical data.

### 4.3 Man-in-the-middle between Vera and Hedera

**Capability:** Intercepts HCS submissions.

**Can do:**

- Drop submissions (liveness attack, 3.5)
- Delay submissions

**Cannot do:**

- Forge HCS messages (requires node-level consensus compromise)
- Tamper with messages in-flight (transactions are signed)

### 4.4 Compromised user client

**Capability:** Sends malicious requests to Vera on a legitimate user's behalf.

**Can do:**

- Trigger real, anchored actions in the user's name

**Defense:** User-signed requests (3.6 mitigation — unimplemented).

### 4.5 Future: quantum attacker

SHA-256 is quantum-resistant (256-bit security reduces to 128-bit under Grover, still adequate). Ed25519 and ECDSA are **not** — both fall to Shor's algorithm on sufficient qubits.

**Mitigation (future):** Post-quantum signature schemes (Dilithium, SPHINCS+) would require operator key migration.

---

## 5. Known Operational Caveats

### 5.1 Insufficient HBAR halts anchoring

If the operator account runs out of HBAR, HCS submissions fail. Proofs continue to be generated and cached locally, but become **local-only** (unverifiable externally) until the account is topped up.

**Current status:** Operator `0.0.10294360` holds ≈200 HBAR. Each proof submission costs ~$0.0001. Runway ≈ 2M proofs.

**Mitigation:** Auto-top-up from a treasury account; alerting on balance < threshold.

### 5.2 Mirror node propagation delay

Proofs typically appear on the mirror node 2–10 seconds after submission. `@vera/verify` retries 3 times; callers should not interpret an immediate "not found" as "not submitted."

### 5.3 Self-verify ticker drift

The self-verify loop publishes state proofs on drift detection OR a fixed interval. If the interval is too long, an adversarial operator has a window to alter state between snapshots without external detection.

**Current interval:** Every 60 seconds + on any significant adaptation event.

---

## 6. Recommended Usage by Risk Level

### 6.1 Low-stakes: informational queries

- User asks for HBAR price
- Vera calls `kit_get_exchange_rate`, returns result

Vera's current model is **fully sufficient**. The risk of a wrong answer is low; the audit trail protects against "she actually returned a different number and edited the transcript."

### 6.2 Medium-stakes: read-only compliance queries

- "Show me all transactions my agent executed between dates X and Y"
- "Prove agent `0.0.x` did not access data outside topic `0.0.y`"

Vera's model is **sufficient with the caveat that tool outputs are trusted**. Add cross-referencing against independent sources for critical claims.

### 6.3 High-stakes: autonomous value transfer

- Trading bot executing swaps
- Agent signing transactions

Vera's model is **necessary but not sufficient**. Layer on:

- User-signed authorizations (3.6)
- Pre-commit proofs (3.5)
- Multi-signature or threshold operators (3.4)
- Cross-agent consensus (two Veras must agree)

### 6.4 Adversarial: proving AI did not do something

**Vera alone cannot prove a negative.** No attestation system can. You can only prove that *if Vera ran faithfully, these are all the actions she took*.

Proving "this AI did NOT front-run my trade" requires:

- Deterministic replay (pre-commit hashes on every decision)
- External ordering proof (sequencer or rollup)
- User-signed denial of unrelated actions

---

## 7. Comparison to Other Verifiable-AI Approaches

| System | Attests | Does Not Attest |
|:---|:---|:---|
| **Vera (this system)** | Action + result + state + capabilities, on public ledger | LLM correctness, tool honesty, liveness |
| **OpenAI API audit logs** | Inference occurred (per their telemetry) | Anything verifiable by third parties |
| **Signed model weights** (Meta, Mistral) | Which weights were used | Which outputs were produced |
| **zkML (e.g. Modulus, EZKL)** | Inference was correct for given weights + inputs | Who ran it, when, or what tools were called |
| **TEE-based (Phala, Marlin)** | Inference ran in attested enclave | Weights aren't swapped per-call |
| **On-chain inference (Ritual, ORA)** | Every step on-chain | Cost and throughput at scale |

Vera occupies the **operational-attestation** niche: provable action history with cheap scale, weak on inference correctness. Different from zkML (strong correctness, weak history) and from API logs (weak everything but cheap).

No single approach is strictly superior. Stack them according to your threat model.

---

## 8. Getting Help

- **Report a vulnerability:** Email `security@vera-lattice` (PGP key in `.well-known/security.txt`)
- **Question about a specific proof:** `npx @vera/verify <hash>` and include output in issue
- **Request a missing attestation:** Open issue with use case + adversary model

---

## 9. Revision History

| Version | Date       | Change |
|:---|:---|:---|
| 0.1.0   | 2026-04-19 | Initial public threat model |

---

## Appendix: The One-Sentence Version

> **Vera proves what she did; she does not prove that what she did was wise. Use her for audit trails, not for truth.**
