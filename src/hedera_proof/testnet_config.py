"""
Testnet operator configuration for Hedera HCS proof emission.

Validates that testnet credentials are present and topics are configured
before allowing HCS writes.  Provides a single ``TestnetConfig.from_env()``
factory that reads all required env vars and returns a frozen config object.

Required environment variables (for testnet mode):
    HEDERA_OPERATOR_ACCOUNT_ID   — e.g. 0.0.4515xxx
    HEDERA_OPERATOR_PRIVATE_KEY  — DER-encoded Ed25519 private key
    HEDERA_NETWORK               — "testnet" (default)
    VERA_TASK_TOPIC_ID           — HCS topic for task proofs
    VERA_AUDIT_TOPIC_ID          — HCS topic for audit proofs
    VERA_DRY_RUN                 — "false" to enable live emission
"""

import logging
import os
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger("vera.testnet_config")


@dataclass(frozen=True)
class TestnetConfig:
    """Immutable snapshot of testnet operator credentials and topic IDs."""

    operator_account_id: str
    operator_private_key_present: bool
    network: str
    task_topic_id: str
    audit_topic_id: str
    learning_topic_id: str
    dry_run: bool
    bridge_url: str

    @classmethod
    def from_env(cls) -> "TestnetConfig":
        """Build config from environment variables."""
        return cls(
            operator_account_id=os.environ.get("HEDERA_OPERATOR_ACCOUNT_ID", ""),
            operator_private_key_present=bool(os.environ.get("HEDERA_OPERATOR_PRIVATE_KEY", "")),
            network=os.environ.get("HEDERA_NETWORK", "testnet").lower(),
            task_topic_id=os.environ.get("VERA_TASK_TOPIC_ID", ""),
            audit_topic_id=os.environ.get("VERA_AUDIT_TOPIC_ID", ""),
            learning_topic_id=os.environ.get("VERA_LEARNING_TOPIC_ID", ""),
            dry_run=os.environ.get("VERA_DRY_RUN", "true").lower() == "true",
            bridge_url=os.environ.get("VERA_HCS_BRIDGE_URL", "http://localhost:8000"),
        )

    @property
    def is_testnet_ready(self) -> bool:
        """All required fields are present for testnet emission."""
        return (
            not self.dry_run
            and self.network == "testnet"
            and bool(self.operator_account_id)
            and self.operator_private_key_present
            and bool(self.task_topic_id)
        )

    def validate(self) -> List[str]:
        """Return a list of missing requirements.  Empty = ready."""
        issues: List[str] = []
        if self.dry_run:
            issues.append("VERA_DRY_RUN is true — set to 'false' for testnet")
        if not self.operator_account_id:
            issues.append("HEDERA_OPERATOR_ACCOUNT_ID not set")
        if not self.operator_private_key_present:
            issues.append("HEDERA_OPERATOR_PRIVATE_KEY not set")
        if self.network not in ("testnet", "mainnet"):
            issues.append(f"HEDERA_NETWORK={self.network} — expected 'testnet' or 'mainnet'")
        if not self.task_topic_id:
            issues.append("VERA_TASK_TOPIC_ID not set — create with: hedera topic create")
        if not self.audit_topic_id:
            issues.append("VERA_AUDIT_TOPIC_ID not set (optional but recommended)")
        return issues

    def summary(self) -> dict:
        """Human-readable summary for /health and operator dashboards."""
        issues = self.validate()
        return {
            "network": self.network,
            "operator": self.operator_account_id or "(not set)",
            "key_present": self.operator_private_key_present,
            "task_topic": self.task_topic_id or "(not set)",
            "audit_topic": self.audit_topic_id or "(not set)",
            "learning_topic": self.learning_topic_id or "(not set)",
            "dry_run": self.dry_run,
            "ready": self.is_testnet_ready,
            "issues": issues,
        }
