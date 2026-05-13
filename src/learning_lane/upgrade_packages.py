"""
Upgrade Package Builder — groups similar lessons into reusable agent packages.

An upgrade package contains:
  - Capability definition (what the package enables)
  - Required evidence (what proof is needed to use it)
  - Source lessons (where the knowledge came from)
  - Test template (how to verify the package works)
  - HCS publish status (whether it's been anchored on-chain)
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from .lesson_engine import Lesson


@dataclass
class UpgradePackage:
    """A reusable upgrade package built from multiple lessons."""
    package_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    name: str = ""
    domain: str = ""
    description: str = ""
    capabilities: List[str] = field(default_factory=list)
    required_evidence: List[str] = field(default_factory=list)
    source_lesson_ids: List[str] = field(default_factory=list)
    source_proof_hashes: List[str] = field(default_factory=list)
    test_template: Dict[str, Any] = field(default_factory=dict)
    quality_score: float = 0.0
    published: bool = False
    published_at: float = 0.0
    hcs_topic_id: Optional[str] = None
    hcs_sequence: Optional[int] = None
    hcs_transaction_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    package_hash: str = ""

    def __post_init__(self):
        if not self.package_hash:
            self._compute_hash()

    def _compute_hash(self):
        payload = json.dumps({
            "name": self.name,
            "domain": self.domain,
            "capabilities": self.capabilities,
            "source_lesson_ids": self.source_lesson_ids,
            "created_at": self.created_at,
        }, sort_keys=True, default=str)
        self.package_hash = hashlib.sha256(payload.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class UpgradePackageBuilder:
    """Builds and manages upgrade packages from lessons."""

    def __init__(self, proof_emitter=None):
        self._packages: Dict[str, UpgradePackage] = {}
        self._proof_emitter = proof_emitter

    def build(
        self,
        name: str,
        domain: str,
        lessons: List[Lesson],
        description: str = "",
        capabilities: Optional[List[str]] = None,
    ) -> UpgradePackage:
        """Build a package from one or more approved lessons."""
        if not lessons:
            raise ValueError("At least one lesson required to build a package")

        unapproved = [l for l in lessons if not l.operator_approved]
        if unapproved:
            raise ValueError(
                f"All lessons must be operator-approved. "
                f"Unapproved: {[l.lesson_id for l in unapproved]}"
            )

        # Merge capabilities from lessons
        merged_caps = capabilities or []
        if not merged_caps:
            for lesson in lessons:
                merged_caps.extend(lesson.task_types_applicable)
            merged_caps = list(set(merged_caps)) or [f"{domain}_capability"]

        # Collect proof hashes
        all_proofs = []
        for lesson in lessons:
            all_proofs.extend(lesson.proof_hashes)

        # Quality score: average of lesson reproducibility
        quality = sum(l.reproducibility_score for l in lessons) / len(lessons)

        # Generate test template
        test_template = self._generate_test_template(name, domain, merged_caps)

        package = UpgradePackage(
            name=name,
            domain=domain,
            description=description or f"Upgrade package for {domain}: {', '.join(merged_caps[:3])}",
            capabilities=merged_caps,
            required_evidence=["test_suite", "proof_emission", "settlement_record"],
            source_lesson_ids=[l.lesson_id for l in lessons],
            source_proof_hashes=all_proofs[:20],  # cap at 20
            test_template=test_template,
            quality_score=round(quality, 3),
        )

        self._packages[package.package_id] = package
        return package

    def publish(self, package_id: str) -> UpgradePackage:
        """Publish a package to the learning HCS lane."""
        package = self._packages.get(package_id)
        if not package:
            raise KeyError(f"Package {package_id} not found")
        if package.published:
            return package

        # Emit to HCS if emitter is available
        if self._proof_emitter:
            receipt = self._proof_emitter.emit(
                task_id=f"pkg_{package_id}",
                event_type="learning.package_published",
                proof_hash=package.package_hash,
                metadata={
                    "package_name": package.name,
                    "domain": package.domain,
                    "capabilities": package.capabilities[:5],
                    "quality_score": package.quality_score,
                    "source_lessons": len(package.source_lesson_ids),
                },
            )
            package.hcs_topic_id = receipt.topic_id
            package.hcs_sequence = receipt.sequence_number
            package.hcs_transaction_id = receipt.transaction_id

        package.published = True
        package.published_at = time.time()
        return package

    def get(self, package_id: str) -> Optional[UpgradePackage]:
        return self._packages.get(package_id)

    def list_packages(
        self,
        domain: Optional[str] = None,
        published_only: bool = False,
        limit: int = 50,
    ) -> List[UpgradePackage]:
        packages = list(self._packages.values())
        if domain:
            packages = [p for p in packages if p.domain == domain]
        if published_only:
            packages = [p for p in packages if p.published]
        packages.sort(key=lambda p: p.created_at, reverse=True)
        return packages[:limit]

    def stats(self) -> Dict[str, Any]:
        packages = list(self._packages.values())
        return {
            "total_packages": len(packages),
            "published": sum(1 for p in packages if p.published),
            "by_domain": self._count_by_domain(packages),
            "avg_quality": round(
                sum(p.quality_score for p in packages) / max(len(packages), 1), 3
            ),
        }

    def _generate_test_template(
        self, name: str, domain: str, capabilities: List[str]
    ) -> Dict[str, Any]:
        return {
            "name": f"test_{name.replace('-', '_').replace(' ', '_')}",
            "domain": domain,
            "steps": [
                {"action": "post_task", "task_type": capabilities[0] if capabilities else "general"},
                {"action": "await_bid", "timeout_s": 30},
                {"action": "execute", "verify_result": True},
                {"action": "check_proof", "require_hcs": False},
                {"action": "check_settlement", "min_amount": 0},
            ],
            "pass_criteria": {
                "verification_score": ">= 0.6",
                "proof_hash_present": True,
                "settlement_complete": True,
            },
        }

    def _count_by_domain(self, packages: List[UpgradePackage]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for p in packages:
            counts[p.domain] = counts.get(p.domain, 0) + 1
        return counts
