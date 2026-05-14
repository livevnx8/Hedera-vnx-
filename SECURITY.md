# Security Policy — VeraLattice

## Vulnerability Management

We run `npm audit` on every CI build and require **zero critical, high, or moderate** vulnerabilities before merging to `main`.

### Current Status (March 2026)

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | Resolved |
| High | 0 | Resolved |
| Moderate | 0 | Resolved |
| Low | 13 | Accepted risk (see below) |

### Accepted Low-Severity Vulnerabilities

All 13 remaining low-severity findings trace to a single root cause:

**`elliptic` — GHSA-848j-6mx2-7j84**
_"Elliptic Uses a Cryptographic Primitive with a Risky Implementation"_

- **Affected range**: all versions (`*`) — no patched version exists
- **Severity**: Low
- **Dependency chain**:
  - `hedera-agent-kit@3.8.2` → `@hashgraph/sdk` → `@ethersproject/*` → `elliptic`
  - `hedera-agent-kit@3.8.2` → `@elizaos/core` → `crypto-browserify` → `browserify-sign` / `create-ecdh` → `elliptic`
- **Why we accept this**:
  1. Server-side only — not exposed to browser/client-side attacks
  2. No known exploit exists for this advisory
  3. The only fix (`npm audit fix --force`) downgrades `hedera-agent-kit` from 3.8.2 to 3.6.0, breaking 25+ Hedera tools
  4. Upstream packages (`@hashgraph/sdk`, `@elizaos/core`) need to migrate to `@noble/curves` — we cannot fix this at our level
- **Monitoring**: We check for upstream fixes on each dependency update cycle

### Remediation History

| Date | Action | Result |
|------|--------|--------|
| 2026-03-31 | `npm audit fix` | Resolved handlebars (critical), path-to-regexp (high), picomatch (high), brace-expansion (moderate) |
| 2026-03-31 | Upgraded fastify v4 → v5.8.4 | Resolved 3 high-severity Fastify CVEs |
| 2026-03-31 | Upgraded @fastify/cors → ^10, @fastify/static → ^8 | Fastify v5 compatibility |
| 2026-03-31 | Added npm overrides for bn.js, tmp | Resolved moderate bn.js infinite loop, low tmp symlink vuln |

## Reporting Vulnerabilities

If you discover a security vulnerability, please email security@veralattice.com.
