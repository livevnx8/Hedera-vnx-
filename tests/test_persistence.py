"""Tests for Vera OS SQLite persistence layer."""

import sys
import os
import tempfile
sys.path.insert(0, ".")

import pytest
from src.persistence.vera_db import VeraDB


@pytest.fixture
def db():
    """Create a temporary DB for each test."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_vera.db")
        d = VeraDB(db_path)
        yield d
        d.close()


class TestVeraDB:
    def test_init_creates_tables(self, db):
        stats = db.stats()
        assert stats["schema_version"] == 1
        assert stats["proof_receipts"] == 0

    def test_save_and_load_receipt(self, db):
        receipt = {
            "receipt_id": "r1",
            "task_id": "t1",
            "event_type": "task.posted",
            "proof_hash": "abc123",
            "mode": "dry_run",
            "topic_id": "0.0.123",
            "sequence_number": 1,
            "transaction_id": "dry_run_001",
            "timestamp": 1700000000.0,
        }
        db.save_receipt(receipt)
        loaded = db.load_receipts(limit=10)
        assert len(loaded) == 1
        assert loaded[0]["receipt_id"] == "r1"
        assert loaded[0]["proof_hash"] == "abc123"

    def test_receipt_filter_by_task(self, db):
        for i, tid in enumerate(["t1", "t2", "t1", "t2", "t1"]):
            db.save_receipt({
                "receipt_id": f"r{i}",
                "task_id": tid,
                "event_type": "e",
                "proof_hash": "h",
                "mode": "dry_run",
                "timestamp": 1700000000.0 + i,
            })
        loaded = db.load_receipts(task_id="t1")
        assert len(loaded) == 3
        assert all(r["task_id"] == "t1" for r in loaded)

    def test_save_receipts_batch(self, db):
        receipts = [
            {
                "receipt_id": f"r{i}",
                "task_id": f"t{i}",
                "event_type": "e",
                "proof_hash": "h",
                "mode": "dry_run",
                "timestamp": 1700000000.0 + i,
            }
            for i in range(50)
        ]
        db.save_receipts_batch(receipts)
        assert db.receipt_count() == 50

    def test_save_and_load_loop(self, db):
        loop_data = {
            "loop_id": "lp1",
            "task_id": "t1",
            "agent_id": "agent_x",
            "status": "open",
            "stages_completed": ["task", "bid"],
            "opened_at": 1700000000.0,
            "closed_at": None,
            "has_lesson": False,
            "has_package": False,
        }
        db.save_loop(loop_data)
        loaded = db.load_loops()
        assert len(loaded) == 1
        assert loaded[0]["task_id"] == "t1"

    def test_loop_status_filter(self, db):
        db.save_loop({"loop_id": "lp1", "task_id": "t1", "status": "open", "opened_at": 1.0})
        db.save_loop({"loop_id": "lp2", "task_id": "t2", "status": "closed", "opened_at": 2.0})
        db.save_loop({"loop_id": "lp3", "task_id": "t3", "status": "open", "opened_at": 3.0})
        assert db.loop_count("open") == 2
        assert db.loop_count("closed") == 1
        assert db.loop_count() == 3

    def test_save_and_load_lesson(self, db):
        lesson = {
            "lesson_id": "les1",
            "loop_id": "lp1",
            "domain": "hedera",
            "what_worked": ["agent responded fast"],
            "what_failed": [],
            "quality_score": 0.85,
            "reproducibility_score": 0.7,
            "lesson_hash": "hashABC",
            "operator_approved": True,
            "approved_at": 1700001000.0,
            "created_at": 1700000000.0,
        }
        db.save_lesson(lesson)
        loaded = db.load_lessons()
        assert len(loaded) == 1
        assert loaded[0]["lesson_id"] == "les1"
        assert loaded[0]["approved"] == 1

    def test_save_and_load_package(self, db):
        pkg = {
            "package_id": "pkg1",
            "name": "hedera-audit-pack",
            "domain": "hedera",
            "lesson_ids": ["les1", "les2"],
            "capabilities": ["topic_audit", "tx_verify"],
            "quality_score": 0.9,
            "published": True,
            "published_at": 1700002000.0,
            "package_hash": "pkghash",
            "created_at": 1700000000.0,
        }
        db.save_package(pkg)
        loaded = db.load_packages()
        assert len(loaded) == 1
        assert loaded[0]["name"] == "hedera-audit-pack"
        assert loaded[0]["published"] == 1

    def test_stats(self, db):
        db.save_receipt({"receipt_id": "r1", "task_id": "t1", "event_type": "e", "proof_hash": "h", "mode": "dry_run", "timestamp": 1.0})
        db.save_loop({"loop_id": "lp1", "task_id": "t1", "status": "closed", "opened_at": 1.0})
        db.save_lesson({"lesson_id": "l1", "loop_id": "lp1", "lesson_hash": "h", "created_at": 1.0, "operator_approved": True, "approved_at": 2.0})
        db.save_package({"package_id": "p1", "name": "n", "domain": "d", "package_hash": "h", "published": True, "published_at": 3.0, "created_at": 1.0})

        stats = db.stats()
        assert stats["proof_receipts"] == 1
        assert stats["proof_loops"] == 1
        assert stats["proof_loops_closed"] == 1
        assert stats["lessons"] == 1
        assert stats["lessons_approved"] == 1
        assert stats["upgrade_packages"] == 1
        assert stats["packages_published"] == 1

    def test_upsert_receipt(self, db):
        """save_receipt with same receipt_id replaces existing."""
        db.save_receipt({"receipt_id": "r1", "task_id": "t1", "event_type": "e", "proof_hash": "old", "mode": "dry_run", "timestamp": 1.0})
        db.save_receipt({"receipt_id": "r1", "task_id": "t1", "event_type": "e", "proof_hash": "new", "mode": "dry_run", "timestamp": 2.0})
        assert db.receipt_count() == 1
        loaded = db.load_receipts()
        assert loaded[0]["proof_hash"] == "new"
