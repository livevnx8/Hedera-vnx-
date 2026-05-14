# `@vera/verify`

**Zero-trust verifier for Vera AI action proofs anchored on Hedera HCS.**

Any Vera action — tool call, decision, state transition — is hashed, signed, and published to Hedera Consensus Service. This package lets **anyone** cryptographically verify those proofs without trusting the Vera server, by talking directly to the Hedera public mirror node.

```bash
npx @vera/verify <hash>
```

That's it. One command, zero config, exit code 0 if the action is truly anchored on mainnet.

---

## What it proves

Given a 64-hex SHA-256 `hash` of a Vera action, this package verifies:

1. ✅ The hash is anchored in an HCS topic with a **public consensus timestamp**
2. ✅ The on-chain payload **bit-exactly matches** the hash (canonical re-hash)
3. ✅ The message was signed by the operator key (optional — Ed25519 built-in, ECDSA via `@noble/secp256k1`)

You are trusting **only the Hedera mirror node**. Not Vera's server. Not the operator. Not npm's registry beyond this package.

## What it does *not* prove

- Whether the action was "correct" — only that it happened and was attested
- Whether the tool's return value reflects reality — Vera can verifiably report wrong data if a tool misbehaves
- Whether the LLM would produce the same output again — inference is non-deterministic

See [Vera Threat Model](../../THREAT_MODEL.md) for the full scope.

---

## Install

```bash
npm install @vera/verify
# or, one-shot:
npx @vera/verify <hash>
```

For ECDSA-signed deployments, also install the optional peer:

```bash
npm install @noble/secp256k1
```

Without it, ECDSA signature validation is skipped — but the **hash-anchor proof is still valid** (that's the cryptographic core; the signature only binds the proof to a specific operator key).

## CLI

```bash
# Verify against a running Vera server
vera-verify 42332a61a35e5e9897b238a4d99f670d0e25588d9a89211abadbb85f8c2b369f

# Verify via explicit topic + sequence (no server needed)
vera-verify <hash> --topic 0.0.10416198 --seq 1323

# Custom server
vera-verify <hash> --server https://vera.example.com

# Testnet
vera-verify <hash> --network testnet

# Machine-readable output
vera-verify <hash> --json

# List recent proofs cached on a Vera server
vera-verify --list --server http://localhost:8080
```

**Exit codes:**
- `0` — verified on-chain
- `3` — unreachable (server or mirror)
- `4` — not verified (hash mismatch, not submitted, etc.)
- `1` — bad usage
- `10` — unexpected error

## Programmatic API

```js
import { verifyProof } from '@vera/verify';

const result = await verifyProof({
  hash: '42332a61a35e5e9897b238a4d99f670d0e25588d9a89211abadbb85f8c2b369f',
  network: 'mainnet',
  server: 'https://vera.example.com',   // optional — lets us look up topic+seq
});

if (result.verified) {
  console.log('✓ Anchored at', result.consensusTimestamp);
  console.log('  hashscan:', result.hashscan);
} else {
  console.error('✗', result.status, result.error);
}
```

### Offline / archive mode

If Vera's server is gone but you have the topic + sequence from an audit trail:

```js
import { verifyFromMirror } from '@vera/verify';

const result = await verifyFromMirror({
  hash: 'abc123...',
  topicId: '0.0.10416198',
  sequenceNumber: 1323,
  publicKey: '03408dd7fd...',  // optional
  network: 'mainnet',
});
```

This talks only to the Hedera mirror node — no Vera dependency.

## Why this matters

Most "verifiable AI" pitches can't pass this test:

> Can a third party verify an action happened *without contacting the AI vendor?*

`@vera/verify` passes it. The proof lives on Hedera mainnet. This package is just 300 lines of code that:
1. Parse a URL
2. Fetch from mirror node
3. Run SHA-256
4. Compare

You could rewrite it in any language. That's the point — the verification is **protocol**, not a product.

## License

MIT
