"""
Evidence Collector — captures testnet proof artifacts for credibility.

Stores proof receipts, HashScan links, and verification results as
structured JSON files in ``docs/evidence/<session>/``.

Usage:
    collector = EvidenceCollector("testnet-proof-v2.1")
    collector.record_receipt(receipt)
    collector.record_verification(result)
    collector.write_summary()
"""

import json
import logging
import os
import time
from typing import Any, Dict, List

logger = logging.getLogger("vnx.evidence")


class EvidenceCollector:
    """Collects and persists testnet proof evidence for human review."""

    def __init__(self, session_name: str, base_dir: str = "docs/evidence"):
        self._session = session_name
        self._dir = os.path.join(base_dir, session_name)
        self._receipts: List[Dict[str, Any]] = []
        self._verifications: List[Dict[str, Any]] = []
        self._created_at = time.time()

        os.makedirs(self._dir, exist_ok=True)
        logger.info(f"EvidenceCollector: {self._dir}")

    @property
    def session_dir(self) -> str:
        return self._dir

    def record_receipt(self, receipt: Dict[str, Any]):
        """Append a proof receipt to the evidence log."""
        entry = {
            **receipt,
            "collected_at": time.time(),
        }
        self._receipts.append(entry)
        self._append_jsonl("receipts.jsonl", entry)

    def record_verification(self, result: Dict[str, Any]):
        """Append a verification result to the evidence log."""
        entry = {
            **result,
            "collected_at": time.time(),
        }
        self._verifications.append(entry)
        self._append_jsonl("verifications.jsonl", entry)

    def write_summary(self) -> str:
        """Write a human-readable summary markdown file.  Returns the path."""
        total = len(self._receipts)
        verified = sum(1 for v in self._verifications if v.get("verified"))
        failed = sum(1 for v in self._verifications if not v.get("verified"))

        # Collect unique topic IDs and HashScan links
        topics = sorted({r.get("topic_id", "") for r in self._receipts if r.get("topic_id")})
        hashscan_links = [r.get("hashscan_url") for r in self._receipts if r.get("hashscan_url")]
        tx_ids = [r.get("transaction_id", "") for r in self._receipts if r.get("transaction_id")]

        md = [
            f"# VNX — Testnet Proof Evidence",
            f"",
            f"**Session:** `{self._session}`",
            f"**Collected:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(self._created_at))}",
            f"",
            f"## Summary",
            f"",
            f"| Metric | Value |",
            f"|---|---|",
            f"| Proof receipts | {total} |",
            f"| Verifications passed | {verified} |",
            f"| Verifications failed | {failed} |",
            f"| Unique topics | {len(topics)} |",
            f"| Transaction IDs | {len(tx_ids)} |",
            f"",
        ]

        if topics:
            md.append("## HCS Topics")
            md.append("")
            for t in topics:
                md.append(f"- `{t}`")
            md.append("")

        if hashscan_links[:10]:
            md.append("## HashScan Links (first 10)")
            md.append("")
            for link in hashscan_links[:10]:
                md.append(f"- [{link}]({link})")
            md.append("")

        if tx_ids[:10]:
            md.append("## Transaction IDs (first 10)")
            md.append("")
            for tx in tx_ids[:10]:
                md.append(f"- `{tx}`")
            md.append("")

        md.append("## Raw Data")
        md.append("")
        md.append(f"- [`receipts.jsonl`](receipts.jsonl) — {total} records")
        md.append(f"- [`verifications.jsonl`](verifications.jsonl) — {len(self._verifications)} records")
        md.append("")

        path = os.path.join(self._dir, "EVIDENCE.md")
        with open(path, "w") as f:
            f.write("\n".join(md))

        logger.info(f"Evidence summary written: {path}")
        return path

    def _append_jsonl(self, filename: str, record: Dict[str, Any]):
        path = os.path.join(self._dir, filename)
        with open(path, "a") as f:
            f.write(json.dumps(record, default=str, sort_keys=True) + "\n")
