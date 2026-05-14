---
description: Integrate QVX training data into Vera lattice
---

# Setup QVX Pipeline

Wire your QVX bot-captures and features into Vera's lattice for unified intelligence.

## Architecture

```
QVX bot-captures → Extract patterns → Lattice layer 2 (contextual)
QVX bot-features → Embed features   → Lattice layer 3 (outer)
QVX models      → GPU inference    → Lattice layer 0 (center)
```

## 1. Create Pipeline

```bash
// turbo
cat > /home/vera-live-0-1/hedera-llm-api/scripts/qvx-to-lattice.mjs << 'EOF'
import fs from 'fs';
import path from 'path';

const QVX_ARCHIVE = '/mnt/vera-ssd/qvx-archive';
const LATTICE = '/mnt/vera-mirror-shards/vera-lattice';

async function ingestQVXData() {
  console.log('🌸 QVX → Lattice Pipeline Starting...');
  
  const captures = fs.readdirSync(`${QVX_ARCHIVE}/bot-captures`).slice(0, 100);
  
  for (const file of captures) {
    const data = fs.readFileSync(`${QVX_ARCHIVE}/bot-captures/${file}`, 'utf8');
    // Transform to lattice shard format
    const shard = {
      source: 'qvx-capture',
      timestamp: Date.now(),
      payload: data.slice(0, 10000),
      layer: 2
    };
    fs.writeFileSync(
      `${LATTICE}/qvx-shards/${file}.json`,
      JSON.stringify(shard)
    );
  }
  
  console.log(`✅ Ingested ${captures.length} QVX captures into lattice`);
}

ingestQVXData().catch(console.error);
EOF

mkdir -p /mnt/vera-mirror-shards/vera-lattice/qvx-shards
```

## 2. Run Ingestion

```bash
// turbo
node /home/vera-live-0-1/hedera-llm-api/scripts/qvx-to-lattice.mjs
```

## 3. Schedule Continuous Sync

```bash
// turbo
# Hourly QVX → Lattice sync
(crontab -l 2>/dev/null | grep -v qvx-to-lattice; \
 echo "0 * * * * node /home/vera-live-0-1/hedera-llm-api/scripts/qvx-to-lattice.mjs >> /home/vera-live-0-1/hedera-llm-api/logs/qvx-pipeline.log 2>&1") | crontab -
```

## 4. Query Lattice

```bash
// turbo
curl http://localhost:8088/api/vera/lattice/query \
  -d '{"source": "qvx-capture", "limit": 10}'
```

## Verify

```bash
ls /mnt/vera-mirror-shards/vera-lattice/qvx-shards/ | wc -l
```
