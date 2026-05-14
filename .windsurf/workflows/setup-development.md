---
description: Set up Vera development environment
---

# Setup Development Environment

Configure local dev environment for Vera lattice.

## Quick Start

```bash
// turbo
git clone https://github.com/vera/hedera-llm-api.git
cd hedera-llm-api
npm install
cp .env.example .env
```

## Configure Environment

```bash
// turbo
# Edit .env
HEDERA_OPERATOR_ID=0.0.xxxx
HEDERA_OPERATOR_KEY=302e...
HEDERA_NETWORK=testnet
REDIS_URL=redis://localhost:6379
```

## Start Dev Server

```bash
// turbo
npm run dev
# API runs on http://localhost:8088
```

## Verify Setup

```bash
// turbo
curl http://localhost:8088/health
```

## Run Tests

```bash
// turbo
npm test
node test-smart-router.mjs
```
