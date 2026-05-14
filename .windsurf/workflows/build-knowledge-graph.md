---
description: Build knowledge graph from lattice shards with entity extraction
---

# Build Knowledge Graph

Extract entities, relationships, and build graph from 48k lattice shards.

## Install Neo4j

```bash
docker run -d --name vera-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/verapass \
  -v /mnt/vera-ssd/neo4j-data:/data \
  neo4j:5
```

## Entity Extractor

```bash
cat > scripts/build-kg.mjs << 'EOF'
import fs from 'fs';
import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'verapass'));
const session = driver.session();

async function extractEntities(text) {
  const entities = [];
  
  // Hedera accounts
  const accounts = text.match(/0\.0\.\d+/g) || [];
  accounts.forEach(id => entities.push({ type: 'Account', id }));
  
  // Addresses
  const addrs = text.match(/0x[a-fA-F0-9]{40}/g) || [];
  addrs.forEach(addr => entities.push({ type: 'EVMAddress', id: addr }));
  
  // Tokens
  const symbols = text.match(/\b(HBAR|USDC|SAUCE|WHBAR)\b/g) || [];
  symbols.forEach(sym => entities.push({ type: 'Token', id: sym }));
  
  return entities;
}

async function buildGraph() {
  const shardsDir = '/mnt/vera-mirror-shards/vera-lattice/qvx-shards';
  const files = fs.readdirSync(shardsDir).slice(0, 1000);
  
  for (const file of files) {
    const shard = JSON.parse(fs.readFileSync(`${shardsDir}/${file}`, 'utf8'));
    const entities = await extractEntities(shard.preview || '');
    
    for (const e of entities) {
      await session.run(
        'MERGE (n:' + e.type + ' {id: $id}) SET n.lastSeen = $time',
        { id: e.id, time: Date.now() }
      );
    }
    
    // Create relationships between co-occurring entities
    for (let i = 0; i < entities.length; i++) {
      for (let j = i+1; j < entities.length; j++) {
        await session.run(
          `MATCH (a:${entities[i].type} {id: $aid}), (b:${entities[j].type} {id: $bid})
           MERGE (a)-[r:CO_OCCURS]->(b)
           ON CREATE SET r.count = 1
           ON MATCH SET r.count = r.count + 1`,
          { aid: entities[i].id, bid: entities[j].id }
        );
      }
    }
  }
  
  console.log('✅ Knowledge graph built');
  await session.close();
  await driver.close();
}

buildGraph();
EOF

node scripts/build-kg.mjs
```

## Query Graph

```bash
# Most connected entities
curl http://localhost:7474/db/data/transaction/commit \
  -u neo4j:verapass -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (n)-[r]-() RETURN n.id, count(r) ORDER BY count(r) DESC LIMIT 10"}]}'
```

## Visualize

Open: `http://localhost:7474` (neo4j / verapass)
