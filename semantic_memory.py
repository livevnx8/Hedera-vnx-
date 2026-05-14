#!/usr/bin/env python3
"""
Vera OS Semantic Memory Layer
SQLite-based trading decision memory with cosine similarity search.

Stores every prediction → outcome pair. Enables:
  - "Has this pattern happened before?"
  - "What was the result?"
  - Semantic search over decision history
"""
import hashlib
import json
import math
import os
import sqlite3
import time
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

# Simple deterministic embedding (no external deps, works everywhere)
def _tokenize(text: str) -> List[str]:
    return text.lower().replace(",", " ").replace(".", " ").split()

def _embed(text: str, dim: int = 128) -> List[float]:
    """Simple bag-of-words hash embedding — deterministic, no model required."""
    tokens = _tokenize(text)
    vec = [0.0] * dim
    for token in tokens:
        h = hashlib.md5(token.encode()).hexdigest()
        for i in range(dim):
            # Use hex digits to influence dimensions
            idx = (int(h[i % 32], 16) + i) % dim
            val = (int(h[(i + 1) % 32], 16) - 7.5) / 7.5
            vec[idx] += val
    # L2 normalize
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]

def _cosine(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


class SemanticMemory:
    """SQLite-backed semantic memory for trading decisions."""

    def __init__(self, db_path: str = "data/semantic_memory.db"):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self._dim = 128
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    token TEXT NOT NULL,
                    prediction TEXT NOT NULL,      -- e.g. "UP 0.82"
                    features_json TEXT NOT NULL,   -- serialized features dict
                    outcome TEXT,                  -- "UP", "DOWN", "PENDING"
                    outcome_price REAL,            -- price after interval
                    confidence REAL,
                    embedding TEXT NOT NULL,       -- JSON array of floats
                    context TEXT                   -- free-form notes
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_decisions_token ON decisions(token)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(timestamp)
            """)
            conn.commit()

    def record(self, token: str, prediction: str, features: Dict[str, Any],
               confidence: float, context: str = "") -> int:
        """Record a new decision. Returns row id."""
        embedding = _embed(json.dumps(features, sort_keys=True))
        emb_json = json.dumps(embedding)
        ts = time.time()
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute(
                """INSERT INTO decisions
                   (timestamp, token, prediction, features_json, outcome,
                    outcome_price, confidence, embedding, context)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (ts, token, prediction, json.dumps(features), "PENDING",
                 None, confidence, emb_json, context),
            )
            conn.commit()
            return cur.lastrowid

    def update_outcome(self, decision_id: int, outcome: str, outcome_price: float):
        """Update a pending decision with its actual outcome."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE decisions SET outcome = ?, outcome_price = ? WHERE id = ?",
                (outcome, outcome_price, decision_id),
            )
            conn.commit()

    def search_similar(self, token: str, features: Dict[str, Any],
                       top_k: int = 5) -> List[Dict[str, Any]]:
        """Find similar past decisions by cosine similarity of feature embeddings."""
        query_emb = _embed(json.dumps(features, sort_keys=True))
        results = []
        with sqlite3.connect(self.db_path) as conn:
            # Filter by same token for relevance, then compute similarity
            rows = conn.execute(
                "SELECT id, timestamp, token, prediction, outcome, confidence, embedding, context "
                "FROM decisions WHERE token = ? ORDER BY timestamp DESC LIMIT 500",
                (token,),
            ).fetchall()
        scored = []
        for row in rows:
            emb = json.loads(row[6])
            score = _cosine(query_emb, emb)
            scored.append((score, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        for score, row in scored[:top_k]:
            results.append({
                "id": row[0],
                "timestamp": row[1],
                "token": row[2],
                "prediction": row[3],
                "outcome": row[4],
                "confidence": row[5],
                "similarity": round(score, 4),
                "context": row[7],
            })
        return results

    def get_stats(self, token: Optional[str] = None) -> Dict[str, Any]:
        """Aggregate stats: total decisions, accuracy by token, etc."""
        with sqlite3.connect(self.db_path) as conn:
            if token:
                total = conn.execute(
                    "SELECT COUNT(*) FROM decisions WHERE token = ?", (token,)
                ).fetchone()[0]
                resolved = conn.execute(
                    "SELECT COUNT(*) FROM decisions WHERE token = ? AND outcome != 'PENDING'",
                    (token,),
                ).fetchone()[0]
                correct = conn.execute(
                    "SELECT COUNT(*) FROM decisions WHERE token = ? AND prediction = outcome",
                    (token,),
                ).fetchone()[0]
            else:
                total = conn.execute("SELECT COUNT(*) FROM decisions").fetchone()[0]
                resolved = conn.execute(
                    "SELECT COUNT(*) FROM decisions WHERE outcome != 'PENDING'"
                ).fetchone()[0]
                correct = conn.execute(
                    "SELECT COUNT(*) FROM decisions WHERE prediction = outcome"
                ).fetchone()[0]
        accuracy = (correct / resolved * 100) if resolved else 0
        return {
            "token": token or "ALL",
            "total_decisions": total,
            "resolved": resolved,
            "correct": correct,
            "accuracy_pct": round(accuracy, 2),
        }

    def get_recent(self, token: str, n: int = 10) -> List[Dict[str, Any]]:
        """Get most recent decisions for a token."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT id, timestamp, prediction, outcome, confidence, context "
                "FROM decisions WHERE token = ? ORDER BY timestamp DESC LIMIT ?",
                (token, n),
            ).fetchall()
        return [
            {
                "id": r[0],
                "timestamp": r[1],
                "prediction": r[2],
                "outcome": r[3],
                "confidence": r[4],
                "context": r[5],
            }
            for r in rows
        ]


# Singleton for server use
_semantic_memory: Optional[SemanticMemory] = None

def get_semantic_memory(db_path: str = "data/semantic_memory.db") -> SemanticMemory:
    global _semantic_memory
    if _semantic_memory is None:
        _semantic_memory = SemanticMemory(db_path)
    return _semantic_memory


if __name__ == "__main__":
    # Self-test
    mem = SemanticMemory(db_path="/tmp/test_semantic_memory.db")
    fid = mem.record("hbar", "UP", {"price": 0.1, "vol": 1000}, 0.82, "round_1")
    print(f"Recorded decision {fid}")

    # Search before outcome
    similar = mem.search_similar("hbar", {"price": 0.11, "vol": 1050})
    print(f"Similar decisions: {len(similar)}")

    # Update outcome
    mem.update_outcome(fid, "UP", 0.11)

    # Stats
    print(mem.get_stats("hbar"))
    print(mem.get_recent("hbar"))
    print("Semantic Memory: self-test passed")
