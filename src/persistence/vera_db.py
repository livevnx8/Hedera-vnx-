"""
Vera OS SQLite persistence layer.

Stores proof receipts, proof loops, lessons, and upgrade packages so state
survives process restarts.  All writes are synchronous and use WAL mode for
concurrent reads.

Usage:
    db = VeraDB("data/vera.db")
    db.save_receipt(receipt.to_dict())
    receipts = db.load_receipts(limit=100)
"""

import json
import logging
import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger("vera.persistence")

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proof_receipts (
    receipt_id  TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    proof_hash  TEXT NOT NULL,
    mode        TEXT NOT NULL,
    topic_id    TEXT,
    sequence_number INTEGER,
    transaction_id  TEXT,
    timestamp   REAL NOT NULL,
    payload     TEXT NOT NULL,
    created_at  REAL NOT NULL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_receipts_task ON proof_receipts(task_id);
CREATE INDEX IF NOT EXISTS idx_receipts_ts   ON proof_receipts(timestamp);

CREATE TABLE IF NOT EXISTS proof_loops (
    loop_id     TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL UNIQUE,
    agent_id    TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    stages      TEXT NOT NULL DEFAULT '{}',
    opened_at   REAL NOT NULL,
    closed_at   REAL,
    has_lesson  INTEGER NOT NULL DEFAULT 0,
    has_package INTEGER NOT NULL DEFAULT 0,
    payload     TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_loops_status ON proof_loops(status);

CREATE TABLE IF NOT EXISTS lessons (
    lesson_id       TEXT PRIMARY KEY,
    loop_id         TEXT NOT NULL,
    domain          TEXT NOT NULL DEFAULT 'general',
    what_worked     TEXT NOT NULL DEFAULT '[]',
    what_failed     TEXT NOT NULL DEFAULT '[]',
    quality_score   REAL NOT NULL DEFAULT 0,
    reproducibility REAL NOT NULL DEFAULT 0,
    lesson_hash     TEXT NOT NULL,
    approved        INTEGER NOT NULL DEFAULT 0,
    approved_at     REAL,
    created_at      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lessons_domain ON lessons(domain);

CREATE TABLE IF NOT EXISTS upgrade_packages (
    package_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    domain       TEXT NOT NULL,
    lesson_ids   TEXT NOT NULL DEFAULT '[]',
    capabilities TEXT NOT NULL DEFAULT '[]',
    quality_score REAL NOT NULL DEFAULT 0,
    published    INTEGER NOT NULL DEFAULT 0,
    published_at REAL,
    package_hash TEXT NOT NULL,
    created_at   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_packages_domain ON upgrade_packages(domain);
"""


class VeraDB:
    """Lightweight SQLite persistence for Vera OS v2 state."""

    def __init__(self, db_path: str = "data/vera.db"):
        self._db_path = db_path
        self._lock = threading.Lock()

        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)

        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.row_factory = sqlite3.Row

        self._init_schema()
        logger.info(f"VeraDB initialized: {db_path}")

    def __repr__(self) -> str:
        return f"VeraDB(path={self._db_path})"

    def _init_schema(self):
        with self._lock:
            self._conn.executescript(_SCHEMA)
            cur = self._conn.execute("SELECT version FROM schema_version LIMIT 1")
            row = cur.fetchone()
            if row is None:
                self._conn.execute("INSERT INTO schema_version (version) VALUES (?)", (SCHEMA_VERSION,))
            self._conn.commit()

    def close(self):
        with self._lock:
            self._conn.close()

    # ── Proof Receipts ─────────────────────────────────────────

    def save_receipt(self, receipt: Dict[str, Any]):
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO proof_receipts
                   (receipt_id, task_id, event_type, proof_hash, mode, topic_id,
                    sequence_number, transaction_id, timestamp, payload)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    receipt["receipt_id"],
                    receipt["task_id"],
                    receipt["event_type"],
                    receipt["proof_hash"],
                    receipt["mode"],
                    receipt.get("topic_id"),
                    receipt.get("sequence_number"),
                    receipt.get("transaction_id"),
                    receipt["timestamp"],
                    json.dumps(receipt),
                ),
            )
            self._conn.commit()

    def save_receipts_batch(self, receipts: List[Dict[str, Any]]):
        with self._lock:
            self._conn.executemany(
                """INSERT OR REPLACE INTO proof_receipts
                   (receipt_id, task_id, event_type, proof_hash, mode, topic_id,
                    sequence_number, transaction_id, timestamp, payload)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        r["receipt_id"], r["task_id"], r["event_type"],
                        r["proof_hash"], r["mode"], r.get("topic_id"),
                        r.get("sequence_number"), r.get("transaction_id"),
                        r["timestamp"], json.dumps(r),
                    )
                    for r in receipts
                ],
            )
            self._conn.commit()

    def load_receipts(self, limit: int = 100, task_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            if task_id:
                cur = self._conn.execute(
                    "SELECT payload FROM proof_receipts WHERE task_id = ? ORDER BY timestamp DESC LIMIT ?",
                    (task_id, limit),
                )
            else:
                cur = self._conn.execute(
                    "SELECT payload FROM proof_receipts ORDER BY timestamp DESC LIMIT ?",
                    (limit,),
                )
            return [json.loads(row["payload"]) for row in cur.fetchall()]

    def receipt_count(self) -> int:
        with self._lock:
            cur = self._conn.execute("SELECT COUNT(*) as cnt FROM proof_receipts")
            return cur.fetchone()["cnt"]

    # ── Proof Loops ────────────────────────────────────────────

    def save_loop(self, loop_data: Dict[str, Any]):
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO proof_loops
                   (loop_id, task_id, agent_id, status, stages, opened_at,
                    closed_at, has_lesson, has_package, payload)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    loop_data["loop_id"],
                    loop_data["task_id"],
                    loop_data.get("agent_id"),
                    loop_data["status"],
                    json.dumps(loop_data.get("stages_completed", [])),
                    loop_data["opened_at"],
                    loop_data.get("closed_at"),
                    int(loop_data.get("has_lesson", False)),
                    int(loop_data.get("has_package", False)),
                    json.dumps(loop_data),
                ),
            )
            self._conn.commit()

    def load_loops(self, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            if status:
                cur = self._conn.execute(
                    "SELECT payload FROM proof_loops WHERE status = ? ORDER BY opened_at DESC LIMIT ?",
                    (status, limit),
                )
            else:
                cur = self._conn.execute(
                    "SELECT payload FROM proof_loops ORDER BY opened_at DESC LIMIT ?",
                    (limit,),
                )
            return [json.loads(row["payload"]) for row in cur.fetchall()]

    def loop_count(self, status: Optional[str] = None) -> int:
        with self._lock:
            if status:
                cur = self._conn.execute("SELECT COUNT(*) as cnt FROM proof_loops WHERE status = ?", (status,))
            else:
                cur = self._conn.execute("SELECT COUNT(*) as cnt FROM proof_loops")
            return cur.fetchone()["cnt"]

    # ── Lessons ────────────────────────────────────────────────

    def save_lesson(self, lesson: Dict[str, Any]):
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO lessons
                   (lesson_id, loop_id, domain, what_worked, what_failed,
                    quality_score, reproducibility, lesson_hash, approved, approved_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    lesson["lesson_id"],
                    lesson["loop_id"],
                    lesson.get("domain", "general"),
                    json.dumps(lesson.get("what_worked", [])),
                    json.dumps(lesson.get("what_failed", [])),
                    lesson.get("quality_score", 0),
                    lesson.get("reproducibility_score", 0),
                    lesson.get("lesson_hash", ""),
                    int(lesson.get("operator_approved", False)),
                    lesson.get("approved_at"),
                    lesson.get("created_at", 0),
                ),
            )
            self._conn.commit()

    def load_lessons(self, domain: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            if domain:
                cur = self._conn.execute(
                    "SELECT * FROM lessons WHERE domain = ? ORDER BY created_at DESC LIMIT ?",
                    (domain, limit),
                )
            else:
                cur = self._conn.execute(
                    "SELECT * FROM lessons ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                )
            return [dict(row) for row in cur.fetchall()]

    # ── Upgrade Packages ───────────────────────────────────────

    def save_package(self, pkg: Dict[str, Any]):
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO upgrade_packages
                   (package_id, name, domain, lesson_ids, capabilities,
                    quality_score, published, published_at, package_hash, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    pkg["package_id"],
                    pkg["name"],
                    pkg["domain"],
                    json.dumps(pkg.get("lesson_ids", [])),
                    json.dumps(pkg.get("capabilities", [])),
                    pkg.get("quality_score", 0),
                    int(pkg.get("published", False)),
                    pkg.get("published_at"),
                    pkg.get("package_hash", ""),
                    pkg.get("created_at", 0),
                ),
            )
            self._conn.commit()

    def load_packages(self, domain: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            if domain:
                cur = self._conn.execute(
                    "SELECT * FROM upgrade_packages WHERE domain = ? ORDER BY created_at DESC LIMIT ?",
                    (domain, limit),
                )
            else:
                cur = self._conn.execute(
                    "SELECT * FROM upgrade_packages ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                )
            return [dict(row) for row in cur.fetchall()]

    # ── Backup & Maintenance ────────────────────────────────────

    def backup(self, backup_path: Optional[str] = None) -> str:
        """Create a hot backup of the database using SQLite backup API."""
        import shutil
        import time as _time

        if backup_path is None:
            ts = _time.strftime("%Y%m%d-%H%M%S")
            backup_dir = os.path.join(os.path.dirname(self._db_path), "backups")
            os.makedirs(backup_dir, exist_ok=True)
            backup_path = os.path.join(backup_dir, f"vera-{ts}.db")

        with self._lock:
            dst = sqlite3.connect(backup_path)
            self._conn.backup(dst)
            dst.close()

        logger.info(f"Database backed up to {backup_path}")
        return backup_path

    def integrity_check(self) -> Dict[str, Any]:
        """Run SQLite integrity check and return result."""
        with self._lock:
            result = self._conn.execute("PRAGMA integrity_check").fetchone()[0]
            page_count = self._conn.execute("PRAGMA page_count").fetchone()[0]
            page_size = self._conn.execute("PRAGMA page_size").fetchone()[0]
            wal_mode = self._conn.execute("PRAGMA journal_mode").fetchone()[0]

        db_size = 0
        try:
            db_size = os.path.getsize(self._db_path)
        except OSError:
            pass

        return {
            "integrity": result,
            "ok": result == "ok",
            "db_size_bytes": db_size,
            "db_size_mb": round(db_size / (1024 * 1024), 2),
            "page_count": page_count,
            "page_size": page_size,
            "journal_mode": wal_mode,
        }

    def vacuum(self):
        """Reclaim unused space. Run during low-traffic periods."""
        with self._lock:
            self._conn.execute("VACUUM")
        logger.info("Database vacuumed")

    # ── Stats ──────────────────────────────────────────────────

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            receipts = self._conn.execute("SELECT COUNT(*) as cnt FROM proof_receipts").fetchone()["cnt"]
            loops = self._conn.execute("SELECT COUNT(*) as cnt FROM proof_loops").fetchone()["cnt"]
            closed = self._conn.execute("SELECT COUNT(*) as cnt FROM proof_loops WHERE status = 'closed'").fetchone()["cnt"]
            lessons = self._conn.execute("SELECT COUNT(*) as cnt FROM lessons").fetchone()["cnt"]
            approved = self._conn.execute("SELECT COUNT(*) as cnt FROM lessons WHERE approved = 1").fetchone()["cnt"]
            packages = self._conn.execute("SELECT COUNT(*) as cnt FROM upgrade_packages").fetchone()["cnt"]
            published = self._conn.execute("SELECT COUNT(*) as cnt FROM upgrade_packages WHERE published = 1").fetchone()["cnt"]

        db_size = 0
        try:
            db_size = os.path.getsize(self._db_path)
        except OSError:
            pass

        return {
            "db_path": self._db_path,
            "schema_version": SCHEMA_VERSION,
            "db_size_bytes": db_size,
            "proof_receipts": receipts,
            "proof_loops": loops,
            "proof_loops_closed": closed,
            "lessons": lessons,
            "lessons_approved": approved,
            "upgrade_packages": packages,
            "packages_published": published,
        }
