#!/usr/bin/env python3
"""Vera's semantic memory recall — query FAISS over lattice shards."""
import sys, json, pickle, os

try:
    from sentence_transformers import SentenceTransformer
    import faiss
    import numpy as np
except ImportError:
    print(json.dumps({"error": "Missing deps. Run: /home/vera-live-0-1/vera-ml-venv/bin/pip install sentence-transformers faiss-cpu"}))
    sys.exit(1)

LATTICE = "/mnt/vera-mirror-shards/vera-lattice"
INDEX_PATH = f"{LATTICE}/semantic.index"
META_PATH = f"{LATTICE}/semantic.meta"

if not os.path.exists(INDEX_PATH):
    print(json.dumps({"error": "Index not built. Run scripts/build-semantic-index.py"}))
    sys.exit(1)

query = " ".join(sys.argv[1:]) or "lattice status"
topK = 5

model = SentenceTransformer('all-MiniLM-L6-v2')
index = faiss.read_index(INDEX_PATH)
with open(META_PATH, 'rb') as f:
    metadata = pickle.load(f)

emb = model.encode([query]).astype('float32')
D, I = index.search(emb, topK)

results = []
for dist, idx in zip(D[0], I[0]):
    if idx < len(metadata):
        m = metadata[idx]
        results.append({
            "name": m["name"],
            "path": m["path"],
            "distance": float(dist),
            "score": float(1 / (1 + dist)),
        })

print(json.dumps({"query": query, "results": results, "count": len(results)}))
