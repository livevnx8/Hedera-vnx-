"""
Escrow Engine — HBAR hold/release/dispute for marketplace tasks.

In-memory escrow ledger with proof hashes for HCS anchoring.
Production would use Hedera scheduled transactions or smart contracts.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class EscrowStatus(str, Enum):
    HELD = "held"
    RELEASED = "released"
    REFUNDED = "refunded"
    DISPUTED = "disputed"
    PARTIAL_RELEASE = "partial_release"


@dataclass
class EscrowEntry:
    escrow_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    task_id: str = ""
    payer_id: str = ""
    payee_id: str = ""
    amount_hbar: float = 0.0
    status: EscrowStatus = EscrowStatus.HELD
    released_amount: float = 0.0
    refunded_amount: float = 0.0
    created_at: float = field(default_factory=time.time)
    released_at: float = 0.0
    proof_hash: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "escrow_id": self.escrow_id,
            "task_id": self.task_id,
            "payer_id": self.payer_id,
            "payee_id": self.payee_id,
            "amount_hbar": self.amount_hbar,
            "status": self.status.value,
            "released_amount": self.released_amount,
            "refunded_amount": self.refunded_amount,
            "created_at": self.created_at,
            "released_at": self.released_at,
            "proof_hash": self.proof_hash,
        }

    def compute_proof(self) -> str:
        payload = json.dumps({
            "escrow_id": self.escrow_id,
            "task_id": self.task_id,
            "amount": self.amount_hbar,
            "status": self.status.value,
            "released": self.released_amount,
            "timestamp": self.released_at or self.created_at,
        }, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()


class EscrowEngine:
    """
    Manages escrow holds for marketplace tasks.

    Flow:
      1. hold()    — lock HBAR when task is awarded
      2. release() — pay agent when task is verified
      3. refund()  — return to requester on cancellation/dispute
    """

    def __init__(self, event_bus=None):
        self._escrows: Dict[str, EscrowEntry] = {}
        self._event_bus = event_bus
        self._total_held = 0.0
        self._total_released = 0.0
        self._total_refunded = 0.0

    def hold(
        self,
        task_id: str,
        payer_id: str,
        payee_id: str,
        amount_hbar: float,
    ) -> EscrowEntry:
        entry = EscrowEntry(
            task_id=task_id,
            payer_id=payer_id,
            payee_id=payee_id,
            amount_hbar=amount_hbar,
        )
        entry.proof_hash = entry.compute_proof()
        self._escrows[entry.escrow_id] = entry
        self._total_held += amount_hbar

        if self._event_bus:
            self._event_bus.emit("escrow.held", entry.to_dict())

        return entry

    def release(
        self,
        escrow_id: str,
        amount_hbar: Optional[float] = None,
    ) -> EscrowEntry:
        entry = self._get(escrow_id)
        if entry.status not in (EscrowStatus.HELD, EscrowStatus.DISPUTED):
            raise ValueError(f"Cannot release escrow {escrow_id} (status: {entry.status.value})")

        release_amount = amount_hbar if amount_hbar is not None else entry.amount_hbar
        if release_amount > entry.amount_hbar - entry.released_amount:
            raise ValueError("Release amount exceeds remaining escrow")

        entry.released_amount += release_amount
        entry.released_at = time.time()
        self._total_released += release_amount

        if entry.released_amount >= entry.amount_hbar:
            entry.status = EscrowStatus.RELEASED
        else:
            entry.status = EscrowStatus.PARTIAL_RELEASE

        entry.proof_hash = entry.compute_proof()

        if self._event_bus:
            self._event_bus.emit("escrow.released", entry.to_dict())

        return entry

    def refund(
        self,
        escrow_id: str,
        amount_hbar: Optional[float] = None,
    ) -> EscrowEntry:
        entry = self._get(escrow_id)
        if entry.status not in (EscrowStatus.HELD, EscrowStatus.DISPUTED):
            raise ValueError(f"Cannot refund escrow {escrow_id} (status: {entry.status.value})")

        refund_amount = amount_hbar if amount_hbar is not None else entry.amount_hbar
        remaining = entry.amount_hbar - entry.released_amount - entry.refunded_amount
        if refund_amount > remaining:
            raise ValueError("Refund amount exceeds remaining escrow")

        entry.refunded_amount += refund_amount
        entry.status = EscrowStatus.REFUNDED
        entry.released_at = time.time()
        entry.proof_hash = entry.compute_proof()
        self._total_refunded += refund_amount

        if self._event_bus:
            self._event_bus.emit("escrow.refunded", entry.to_dict())

        return entry

    def dispute(self, escrow_id: str) -> EscrowEntry:
        entry = self._get(escrow_id)
        if entry.status != EscrowStatus.HELD:
            raise ValueError(f"Cannot dispute escrow {escrow_id} (status: {entry.status.value})")
        entry.status = EscrowStatus.DISPUTED
        entry.proof_hash = entry.compute_proof()

        if self._event_bus:
            self._event_bus.emit("escrow.disputed", entry.to_dict())

        return entry

    def get(self, escrow_id: str) -> Optional[EscrowEntry]:
        return self._escrows.get(escrow_id)

    def get_by_task(self, task_id: str) -> Optional[EscrowEntry]:
        return next(
            (e for e in self._escrows.values() if e.task_id == task_id),
            None,
        )

    def stats(self) -> Dict[str, Any]:
        entries = list(self._escrows.values())
        return {
            "total_escrows": len(entries),
            "held": sum(1 for e in entries if e.status == EscrowStatus.HELD),
            "released": sum(1 for e in entries if e.status == EscrowStatus.RELEASED),
            "refunded": sum(1 for e in entries if e.status == EscrowStatus.REFUNDED),
            "disputed": sum(1 for e in entries if e.status == EscrowStatus.DISPUTED),
            "total_held_hbar": round(self._total_held, 4),
            "total_released_hbar": round(self._total_released, 4),
            "total_refunded_hbar": round(self._total_refunded, 4),
        }

    def _get(self, escrow_id: str) -> EscrowEntry:
        entry = self._escrows.get(escrow_id)
        if not entry:
            raise KeyError(f"Escrow {escrow_id} not found")
        return entry
