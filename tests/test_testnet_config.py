"""Tests for testnet operator configuration and evidence collector."""

import os
import sys
import tempfile

sys.path.insert(0, ".")

import pytest
from src.hedera_proof.testnet_config import TestnetConfig
from src.hedera_proof.evidence_collector import EvidenceCollector


class TestTestnetConfig:
    def test_default_is_dry_run(self):
        cfg = TestnetConfig.from_env()
        assert cfg.dry_run is True
        assert cfg.is_testnet_ready is False

    def test_validate_reports_issues(self):
        cfg = TestnetConfig.from_env()
        issues = cfg.validate()
        assert any("VERA_DRY_RUN" in i for i in issues)

    def test_summary_returns_dict(self):
        cfg = TestnetConfig.from_env()
        s = cfg.summary()
        assert "network" in s
        assert "ready" in s
        assert "issues" in s
        assert isinstance(s["issues"], list)

    def test_frozen(self):
        cfg = TestnetConfig.from_env()
        with pytest.raises(AttributeError):
            cfg.dry_run = False

    def test_ready_when_configured(self):
        cfg = TestnetConfig(
            operator_account_id="0.0.12345",
            operator_private_key_present=True,
            network="testnet",
            task_topic_id="0.0.67890",
            audit_topic_id="0.0.67891",
            learning_topic_id="0.0.67892",
            dry_run=False,
            bridge_url="http://localhost:8000",
        )
        assert cfg.is_testnet_ready is True
        assert len(cfg.validate()) == 0

    def test_not_ready_missing_key(self):
        cfg = TestnetConfig(
            operator_account_id="0.0.12345",
            operator_private_key_present=False,
            network="testnet",
            task_topic_id="0.0.67890",
            audit_topic_id="",
            learning_topic_id="",
            dry_run=False,
            bridge_url="http://localhost:8000",
        )
        assert cfg.is_testnet_ready is False
        issues = cfg.validate()
        assert any("PRIVATE_KEY" in i for i in issues)


class TestEvidenceCollector:
    def test_record_and_summary(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            collector = EvidenceCollector("test-session", base_dir=tmpdir)
            collector.record_receipt({
                "receipt_id": "r1",
                "task_id": "t1",
                "proof_hash": "abc",
                "topic_id": "0.0.123",
                "transaction_id": "0.0.123@1234567890.000",
                "hashscan_url": "https://hashscan.io/testnet/transaction/0.0.123@1234567890.000",
                "mode": "testnet",
            })
            collector.record_verification({
                "task_id": "t1",
                "verified": True,
                "local_hash": "abc",
                "on_chain_hash": "abc",
            })

            path = collector.write_summary()
            assert os.path.exists(path)

            with open(path) as f:
                content = f.read()

            assert "Proof receipts | 1" in content
            assert "Verifications passed | 1" in content
            assert "0.0.123" in content
            assert "hashscan.io" in content

    def test_creates_jsonl_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            collector = EvidenceCollector("test-jsonl", base_dir=tmpdir)
            collector.record_receipt({"receipt_id": "r1", "task_id": "t1", "proof_hash": "h"})
            collector.record_receipt({"receipt_id": "r2", "task_id": "t2", "proof_hash": "h2"})

            jsonl_path = os.path.join(tmpdir, "test-jsonl", "receipts.jsonl")
            assert os.path.exists(jsonl_path)

            with open(jsonl_path) as f:
                lines = f.readlines()
            assert len(lines) == 2

    def test_empty_session(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            collector = EvidenceCollector("empty", base_dir=tmpdir)
            path = collector.write_summary()
            assert os.path.exists(path)
            with open(path) as f:
                content = f.read()
            assert "Proof receipts | 0" in content
