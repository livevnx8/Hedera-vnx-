---
description: Index all 109 Hedera tools into Flower of Life consciousness lattice
---

# Build Tool Consciousness

Map all 109 Hedera tools across the 4 Flower of Life lattice layers.

## Layer Mapping

| Layer | Role | Tool Types |
|-------|------|-----------|
| **0 Center** | Consciousness | Decision routing, query dispatch |
| **1 Inner (6)** | Core | HBAR transfers, account ops, pricing |
| **2 Middle (12)** | Domain | HTS, HCS, carbon, EVM queries |
| **3 Outer (18)** | Specialized | DeFi, NFTs, cross-chain, oracles |

## Generate Tool Map

```bash
// turbo
cat > scripts/build-tool-map.mjs << 'EOF'
import fs from 'fs';
import path from 'path';

const TOOLS_DIR = '/home/vera-live-0-1/hedera-llm-api/src/agent';
const OUT = '/mnt/vera-mirror-shards/vera-lattice/tool-consciousness.json';

const LAYER_RULES = {
  0: ['orchestrator', 'router', 'dispatch'],
  1: ['hbar_transfer', 'account', 'balance', 'price'],
  2: ['hts_', 'hcs_', 'carbon', 'evm_query', 'transaction'],
  3: ['nft', 'defi', 'bridge', 'oracle', 'dao', 'did']
};

function classifyTool(name) {
  for (const [layer, patterns] of Object.entries(LAYER_RULES)) {
    if (patterns.some(p => name.toLowerCase().includes(p))) {
      return parseInt(layer);
    }
  }
  return 2; // default domain layer
}

// Read tool definitions
const defs = fs.readFileSync(path.join(TOOLS_DIR, 'definitions.ts'), 'utf8');
const toolNames = [...defs.matchAll(/name:\s*['"](\w+)['"]/g)].map(m => m[1]);

const consciousness = {
  timestamp: Date.now(),
  totalTools: toolNames.length,
  layers: { 0: [], 1: [], 2: [], 3: [] }
};

toolNames.forEach(name => {
  const layer = classifyTool(name);
  consciousness.layers[layer].push({
    name,
    layer,
    energy: 1.0,
    lastUsed: null
  });
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(consciousness, null, 2));

console.log(`🌸 Tool Consciousness Built:`);
console.log(`   Total: ${consciousness.totalTools}`);
Object.entries(consciousness.layers).forEach(([l, tools]) => {
  console.log(`   Layer ${l}: ${tools.length} tools`);
});
EOF

node scripts/build-tool-map.mjs
```

## Wire to Lattice Router

```bash
// turbo
# Load into FlowerOfLifeOS
curl -X POST http://localhost:8088/api/vera/lattice/consciousness/load \
  -d @/mnt/vera-mirror-shards/vera-lattice/tool-consciousness.json
```

## Query Tool by Intent

```bash
curl http://localhost:8088/api/vera/lattice/find-tool \
  -d '{"intent":"transfer hbar"}' | jq .
```

## Visualize

```bash
curl http://localhost:8088/api/vera/lattice/consciousness | jq '.layers'
```
