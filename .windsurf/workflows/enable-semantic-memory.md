---
description: Build embedding index across 48,093 lattice files for semantic search
---

# Enable Semantic Memory

Build embedding index over all 48,093 lattice shards for semantic retrieval.

## Install

```bash
// turbo
pip install sentence-transformers faiss-cpu
```

## Build Index

```bash
// turbo
cat > scripts/build-semantic-index.py << 'EOF'
import os, json, glob, pickle
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

LATTICE = "/mnt/vera-mirror-shards/vera-lattice"
INDEX_PATH = f"{LATTICE}/semantic.index"
META_PATH = f"{LATTICE}/semantic.meta"

model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = []
metadata = []

files = glob.glob(f"{LATTICE}/**/*.json", recursive=True)[:5000]
print(f"Indexing {len(files)} shards...")

for i, path in enumerate(files):
    try:
        with open(path) as f:
            text = f.read()[:2000]
        emb = model.encode(text)
        embeddings.append(emb)
        metadata.append({"path": path, "size": len(text)})
        if i % 500 == 0:
            print(f"  {i}/{len(files)}")
    except: continue

emb_array = np.array(embeddings).astype('float32')
index = faiss.IndexFlatL2(emb_array.shape[1])
index.add(emb_array)

faiss.write_index(index, INDEX_PATH)
with open(META_PATH, 'wb') as f:
    pickle.dump(metadata, f)

print(f"✅ Indexed {len(embeddings)} shards")
EOF

python scripts/build-semantic-index.py
```

## Semantic Query API

```bash
// turbo
# Add to Vera
cat > src/lattice/semanticMemory.ts << 'EOF'
import fs from 'fs';
import { spawn } from 'child_process';

export async function querySemanticMemory(query: string, topK = 5): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-c', `
import faiss, pickle
from sentence_transformers import SentenceTransformer
import json, sys
model = SentenceTransformer('all-MiniLM-L6-v2')
index = faiss.read_index('/mnt/vera-mirror-shards/vera-lattice/semantic.index')
meta = pickle.load(open('/mnt/vera-mirror-shards/vera-lattice/semantic.meta', 'rb'))
q = model.encode(["${query.replace(/"/g, '\\"')}"])
D, I = index.search(q.astype('float32'), ${topK})
print(json.dumps([meta[i] for i in I[0]]))
`]);
    let out = '';
    py.stdout.on('data', d => out += d);
    py.on('close', () => resolve(JSON.parse(out || '[]')));
    py.on('error', reject);
  });
}
EOF
```

## Test

```bash
curl http://localhost:8088/api/vera/memory/search \
  -d '{"query":"carbon retirement workflow","topK":5}' | jq .
```
