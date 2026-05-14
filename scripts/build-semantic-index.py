#!/usr/bin/env python3
"""Build FAISS semantic index over lattice shards."""
import os, json, glob, pickle, sys
from pathlib import Path

try:
    from sentence_transformers import SentenceTransformer
    import faiss
    import numpy as np
except ImportError as e:
    print(f"Missing deps: {e}")
    sys.exit(1)

LATTICE = "/mnt/vera-mirror-shards/vera-lattice"
INDEX_PATH = f"{LATTICE}/semantic.index"
META_PATH = f"{LATTICE}/semantic.meta"

print("Loading sentence-transformers model (first run downloads ~90MB)...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Prioritize QVX shards + key lattice files
patterns = [
    f"{LATTICE}/qvx-shards/*.json",
    f"{LATTICE}/*.json",
]

all_files = []
for p in patterns:
    all_files.extend(glob.glob(p))

all_files = all_files[:2000]
print(f"Indexing {len(all_files)} files...")

embeddings = []
metadata = []

for i, path in enumerate(all_files):
    try:
        with open(path) as f:
            raw = f.read()[:1500]
        emb = model.encode(raw, show_progress_bar=False)
        embeddings.append(emb)
        metadata.append({
            "path": path,
            "name": os.path.basename(path),
            "size": len(raw),
        })
        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{len(all_files)}")
    except Exception as e:
        continue

if not embeddings:
    print("No embeddings generated")
    sys.exit(1)

emb_array = np.array(embeddings).astype('float32')
index = faiss.IndexFlatL2(emb_array.shape[1])
index.add(emb_array)

faiss.write_index(index, INDEX_PATH)
with open(META_PATH, 'wb') as f:
    pickle.dump(metadata, f)

print(f"Indexed {len(embeddings)} shards")
print(f"   Index: {INDEX_PATH}")
print(f"   Meta:  {META_PATH}")
print(f"   Dim:   {emb_array.shape[1]}")
