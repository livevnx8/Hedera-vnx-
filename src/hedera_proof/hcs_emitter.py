"""
HCS Proof Emitter — emits marketplace proof hashes to Hedera Consensus Service.

Feature-gated modes:
  - dry_run: records proof packets locally, no network cost
  - testnet: submits to Hedera testnet topics
  - mainnet: submits to Hedera mainnet (requires VNX_ENABLE_MAINNET=true)

Integrates with the existing TypeScript hederaMasterClass via HTTP bridge,
or operates in dry-run mode with full proof chain tracking.
"""

import hashlib
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger("vnx.hedera_proof")


class ProofMode(str, Enum):
    """Operating mode for the HCS proof emitter."""
    DRY_RUN = "dry_run"
    TESTNET = "testnet"
    MAINNET = "mainnet"


@dataclass
class ProofReceipt:
    """A single HCS proof receipt — local or on-chain."""
    receipt_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    task_id: str = ""
    event_type: str = ""
    proof_hash: str = ""
    mode: str = "dry_run"
    topic_id: Optional[str] = None
    sequence_number: Optional[int] = None
    transaction_id: Optional[str] = None
    hashscan_url: Optional[str] = None
    timestamp: float = field(default_factory=time.time)
    operator_id: str = ""
    payload_size: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def __repr__(self) -> str:
        status = "error" if self.error else "ok"
        return f"ProofReceipt(id={self.receipt_id}, mode={self.mode}, status={status})"


@dataclass
class ProofPacket:
    """Compact proof packet sent to HCS."""
    task_id: str
    event_type: str
    proof_hash: str
    timestamp: float
    operator_id: str
    previous_hash: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True, default=str)

    def packet_hash(self) -> str:
        return hashlib.sha256(self.to_json().encode()).hexdigest()

    def __repr__(self) -> str:
        return f"ProofPacket(task={self.task_id}, event={self.event_type})"


class HCSProofEmitter:
    """
    Emits proof hashes to Hedera Consensus Service topics.

    In dry_run mode, records everything locally without network calls.
    In testnet/mainnet mode, calls the TS bridge endpoint to submit.
    """

    def __init__(
        self,
        mode: Optional[ProofMode] = None,
        task_topic_id: Optional[str] = None,
        audit_topic_id: Optional[str] = None,
        bridge_url: Optional[str] = None,
        operator_id: Optional[str] = None,
    ):
        self._mode = mode or self._detect_mode()
        self._task_topic_id = task_topic_id or os.environ.get("VNX_TASK_TOPIC_ID", "")
        self._audit_topic_id = audit_topic_id or os.environ.get("VNX_AUDIT_TOPIC_ID", "")
        self._learning_topic_id = os.environ.get("VNX_LEARNING_TOPIC_ID", "")
        self._bridge_url = bridge_url or os.environ.get("VNX_HCS_BRIDGE_URL", "http://localhost:8000")
        self._operator_id = operator_id or os.environ.get("HEDERA_OPERATOR_ACCOUNT_ID", "0.0.local")

        self._receipts: List[ProofReceipt] = []
        self._chain_head: str = ""  # last proof hash for chaining
        self._total_emitted: int = 0
        self._total_errors: int = 0
        self._total_bytes: int = 0

        logger.info(f"HCSProofEmitter initialized: mode={self._mode.value}, "
                     f"task_topic={self._task_topic_id or 'none'}, "
                     f"audit_topic={self._audit_topic_id or 'none'}")

    @property
    def mode(self) -> ProofMode:
        return self._mode

    def __repr__(self) -> str:
        return f"HCSProofEmitter(mode={self._mode.value}, emitted={self._total_emitted})"

    def _detect_mode(self) -> ProofMode:
        if os.environ.get("VNX_DRY_RUN", "true").lower() == "true":
            return ProofMode.DRY_RUN
        network = os.environ.get("HEDERA_NETWORK", "testnet").lower()
        if network == "mainnet" and os.environ.get("VNX_ENABLE_MAINNET", "").lower() == "true":
            return ProofMode.MAINNET
        return ProofMode.TESTNET

    def emit(
        self,
        task_id: str,
        event_type: str,
        proof_hash: str,
        metadata: Optional[Dict[str, Any]] = None,
        topic_override: Optional[str] = None,
    ) -> ProofReceipt:
        """
        Emit a proof packet to HCS.

        In ``dry_run`` mode, stores locally without network calls.
        In ``testnet``/``mainnet`` mode, submits via the TS bridge endpoint.

        Args:
            task_id: Marketplace task identifier.
            event_type: Dot-delimited event name (e.g. ``marketplace.task.posted``).
            proof_hash: SHA-256 hash of the proof payload.
            metadata: Optional extra fields attached to the packet.
            topic_override: Override the auto-selected HCS topic ID.

        Returns:
            A :class:`ProofReceipt` with transaction details (or error).
        """
        if not task_id or not event_type:
            raise ValueError("task_id and event_type are required")
        packet = ProofPacket(
            task_id=task_id,
            event_type=event_type,
            proof_hash=proof_hash,
            timestamp=time.time(),
            operator_id=self._operator_id,
            previous_hash=self._chain_head,
            metadata=metadata or {},
        )

        topic_id = topic_override or self._select_topic(event_type)

        if self._mode == ProofMode.DRY_RUN:
            receipt = self._emit_dry_run(packet, topic_id)
        else:
            receipt = self._emit_live(packet, topic_id)

        self._chain_head = packet.packet_hash()
        self._receipts.append(receipt)
        self._total_emitted += 1
        self._total_bytes += receipt.payload_size

        if len(self._receipts) > 5000:
            self._receipts = self._receipts[-2500:]

        return receipt

    def emit_marketplace_event(self, event_name: str, data: Dict[str, Any]) -> ProofReceipt:
        """Bridge helper: called by event_bus subscriber for marketplace.* events."""
        task_id = data.get("task_id", "unknown")
        proof_hash = data.get("proof_hash", "")
        if not proof_hash:
            proof_hash = hashlib.sha256(
                json.dumps(data, sort_keys=True, default=str).encode()
            ).hexdigest()

        return self.emit(
            task_id=task_id,
            event_type=event_name,
            proof_hash=proof_hash,
            metadata={k: v for k, v in data.items() if k not in ("task_id", "proof_hash")},
        )

    def _select_topic(self, event_type: str) -> str:
        """Route event types to the appropriate HCS topic."""
        if "escrow" in event_type or "audit" in event_type:
            return self._audit_topic_id
        if "learning" in event_type or "lesson" in event_type or "package" in event_type:
            return self._learning_topic_id or self._task_topic_id
        return self._task_topic_id

    def _emit_dry_run(self, packet: ProofPacket, topic_id: str) -> ProofReceipt:
        payload_json = packet.to_json()
        return ProofReceipt(
            task_id=packet.task_id,
            event_type=packet.event_type,
            proof_hash=packet.proof_hash,
            mode="dry_run",
            topic_id=topic_id or "dry_run",
            sequence_number=self._total_emitted + 1,
            transaction_id=f"dry_run_{uuid.uuid4().hex[:8]}",
            hashscan_url=None,
            timestamp=packet.timestamp,
            operator_id=packet.operator_id,
            payload_size=len(payload_json),
        )

    def _emit_live(self, packet: ProofPacket, topic_id: str) -> ProofReceipt:
        if not topic_id:
            return ProofReceipt(
                task_id=packet.task_id,
                event_type=packet.event_type,
                proof_hash=packet.proof_hash,
                mode=self._mode.value,
                error="No topic ID configured for this event type",
                timestamp=packet.timestamp,
                operator_id=packet.operator_id,
            )

        payload_json = packet.to_json()

        try:
            body = json.dumps({
                "topic_id": topic_id,
                "message": json.loads(payload_json),
                "max_chunk_size": 4096,
            }).encode()

            req = Request(
                f"{self._bridge_url}/hedera/submit-message",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())

            network = "testnet" if self._mode == ProofMode.TESTNET else "mainnet"
            base_url = f"https://hashscan.io/{network}/transaction"
            tx_id = result.get("transaction_id", "")

            return ProofReceipt(
                task_id=packet.task_id,
                event_type=packet.event_type,
                proof_hash=packet.proof_hash,
                mode=self._mode.value,
                topic_id=topic_id,
                sequence_number=result.get("sequence_number"),
                transaction_id=tx_id,
                hashscan_url=f"{base_url}/{tx_id}" if tx_id else None,
                timestamp=packet.timestamp,
                operator_id=packet.operator_id,
                payload_size=len(payload_json),
            )

        except (URLError, Exception) as e:
            self._total_errors += 1
            logger.error(f"HCS submit failed: {e}")
            return ProofReceipt(
                task_id=packet.task_id,
                event_type=packet.event_type,
                proof_hash=packet.proof_hash,
                mode=self._mode.value,
                topic_id=topic_id,
                error=str(e),
                timestamp=packet.timestamp,
                operator_id=packet.operator_id,
                payload_size=len(payload_json),
            )

    def get_receipts(
        self,
        task_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[ProofReceipt]:
        receipts = self._receipts
        if task_id:
            receipts = [r for r in receipts if r.task_id == task_id]
        return list(reversed(receipts[-limit:]))

    def get_chain(self, task_id: str) -> Dict[str, Any]:
        """Get the full proof chain for a task with HCS links."""
        receipts = [r for r in self._receipts if r.task_id == task_id]
        return {
            "task_id": task_id,
            "chain_length": len(receipts),
            "receipts": [r.to_dict() for r in receipts],
            "chain_head": self._chain_head,
            "verified": all(r.error is None for r in receipts),
            "mode": self._mode.value,
        }

    def stats(self) -> Dict[str, Any]:
        """Return emitter health stats for dashboards and /health."""
        return {
            "mode": self._mode.value,
            "operator_id": self._operator_id,
            "task_topic_id": self._task_topic_id or None,
            "audit_topic_id": self._audit_topic_id or None,
            "learning_topic_id": self._learning_topic_id or None,
            "total_emitted": self._total_emitted,
            "total_errors": self._total_errors,
            "total_bytes": self._total_bytes,
            "chain_head": self._chain_head,
            "chain_length": self._total_emitted,
            "receipts_buffered": len(self._receipts),
            "error_rate": round(self._total_errors / max(self._total_emitted, 1), 4),
        }
