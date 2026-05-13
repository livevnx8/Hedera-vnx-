"""
Result Verifier — validates agent task outputs.

Verification checks:
1. Schema validation (required fields present)
2. Proof hash integrity (output hash matches claimed hash)
3. Quality scoring (completeness, confidence thresholds)
4. Optional: human review flag for high-value tasks
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class VerificationResult:
    task_id: str = ""
    verified: bool = False
    score: float = 0.0              # 0-1 quality score
    checks_passed: int = 0
    checks_total: int = 0
    issues: List[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    proof_hash: str = ""
    requires_human_review: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "verified": self.verified,
            "score": round(self.score, 3),
            "checks_passed": self.checks_passed,
            "checks_total": self.checks_total,
            "issues": self.issues,
            "timestamp": self.timestamp,
            "proof_hash": self.proof_hash,
            "requires_human_review": self.requires_human_review,
        }


class ResultVerifier:
    """
    Automated result verification for marketplace tasks.

    Runs configurable verification checks and produces a quality score.
    """

    HUMAN_REVIEW_THRESHOLD = 500.0  # HBAR — tasks above this require human review
    MIN_CONFIDENCE = 0.5
    MIN_QUALITY_SCORE = 0.6

    def __init__(self):
        self._history: List[VerificationResult] = []

    def verify(
        self,
        task_id: str,
        result_data: Dict[str, Any],
        claimed_proof_hash: str = "",
        budget_hbar: float = 0.0,
        required_fields: List[str] = None,
    ) -> VerificationResult:
        checks = []
        issues = []

        # Check 1: Non-empty result
        if result_data:
            checks.append(True)
        else:
            checks.append(False)
            issues.append("Result data is empty")

        # Check 2: Proof hash integrity
        computed_hash = hashlib.sha256(
            json.dumps(result_data, sort_keys=True, default=str).encode()
        ).hexdigest()
        if claimed_proof_hash:
            if computed_hash == claimed_proof_hash:
                checks.append(True)
            else:
                checks.append(False)
                issues.append("Proof hash mismatch")
        else:
            checks.append(True)  # No hash claimed = skip check

        # Check 3: Required fields present
        required = required_fields or []
        if required:
            missing = [f for f in required if f not in result_data]
            if not missing:
                checks.append(True)
            else:
                checks.append(False)
                issues.append(f"Missing required fields: {missing}")
        else:
            checks.append(True)

        # Check 4: Confidence threshold (if provided)
        confidence = result_data.get("confidence", result_data.get("score", None))
        if confidence is not None:
            if isinstance(confidence, (int, float)) and confidence >= self.MIN_CONFIDENCE:
                checks.append(True)
            else:
                checks.append(False)
                issues.append(f"Confidence {confidence} below threshold {self.MIN_CONFIDENCE}")
        else:
            checks.append(True)

        # Check 5: No error status
        status = result_data.get("status", "")
        if status == "error":
            checks.append(False)
            issues.append(f"Result has error status: {result_data.get('error', 'unknown')}")
        else:
            checks.append(True)

        # Calculate quality score
        passed = sum(1 for c in checks if c)
        total = len(checks)
        score = passed / max(total, 1)

        # Human review flag
        requires_human = budget_hbar >= self.HUMAN_REVIEW_THRESHOLD

        # Final verdict
        verified = score >= self.MIN_QUALITY_SCORE and not any(
            "hash mismatch" in i for i in issues
        )

        vr = VerificationResult(
            task_id=task_id,
            verified=verified,
            score=score,
            checks_passed=passed,
            checks_total=total,
            issues=issues,
            proof_hash=computed_hash,
            requires_human_review=requires_human,
        )
        self._history.append(vr)

        if len(self._history) > 500:
            self._history = self._history[-250:]

        return vr

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return [v.to_dict() for v in reversed(self._history[-limit:])]

    def stats(self) -> Dict[str, Any]:
        total = len(self._history)
        passed = sum(1 for v in self._history if v.verified)
        return {
            "total_verifications": total,
            "passed": passed,
            "failed": total - passed,
            "pass_rate": round(passed / max(total, 1), 3),
            "avg_score": round(
                sum(v.score for v in self._history) / max(total, 1), 3
            ),
            "human_review_pending": sum(
                1 for v in self._history
                if v.requires_human_review and v.verified
            ),
        }
