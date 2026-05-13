"""
Tests for Vera OS v2.0 — Live Proof Loop + Verifiable AI + Learning Lane.

Covers:
  - HCS Proof Emitter (dry_run mode)
  - Mirror Verifier (unit — no live network)
  - First-Party Agents (registry, bidding, execution)
  - Verifiable AI (full proof loop execution)
  - Proof Loop Tracker (open/close/stage tracking)
  - Lesson Engine (extraction from closed loops)
  - Upgrade Packages (build + publish)
  - Integration: full end-to-end flow
"""

import sys
sys.path.insert(0, ".")

import pytest

from src.hedera_proof.hcs_emitter import HCSProofEmitter, ProofMode
from src.hedera_proof.mirror_verifier import MirrorVerifier, VerificationResult
from src.verifiable_ai.first_party_agents import (
    FirstPartyAgentRegistry, AgentResult,
    ProofPublisherAgent, HCSAuditorAgent, OperatorHarmonyAgent,
)
from src.verifiable_ai.verifiable_ai_api import _execute_proof_loop
from src.marketplace.task_engine import TaskEngine
from src.marketplace.reputation import ReputationEngine
from src.marketplace.escrow import EscrowEngine
from src.marketplace.verifier import ResultVerifier
from src.learning_lane.proof_loop_tracker import ProofLoopTracker, LoopStage
from src.learning_lane.lesson_engine import LessonEngine
from src.learning_lane.upgrade_packages import UpgradePackageBuilder
from src.agents.advanced_workflows import EventBus


# ═══════════════════════════════════════════════════════════════
# PHASE A: HEDERA PROOF
# ═══════════════════════════════════════════════════════════════

class TestHCSProofEmitter:
    def setup_method(self):
        self.emitter = HCSProofEmitter(mode=ProofMode.DRY_RUN)

    def test_dry_run_emission(self):
        receipt = self.emitter.emit("task_001", "task.posted", "abc123")
        assert receipt.mode == "dry_run"
        assert receipt.task_id == "task_001"
        assert receipt.proof_hash == "abc123"
        assert receipt.sequence_number == 1
        assert receipt.error is None

    def test_chain_tracking(self):
        self.emitter.emit("task_001", "task.posted", "hash1")
        self.emitter.emit("task_001", "task.awarded", "hash2")
        self.emitter.emit("task_001", "task.settled", "hash3")
        chain = self.emitter.get_chain("task_001")
        assert chain["chain_length"] == 3
        assert chain["verified"] is True

    def test_marketplace_event_bridge(self):
        receipt = self.emitter.emit_marketplace_event(
            "marketplace.task.posted",
            {"task_id": "t1", "proof_hash": "deadbeef", "status": "bidding"},
        )
        assert receipt.task_id == "t1"
        assert receipt.proof_hash == "deadbeef"
        assert receipt.event_type == "marketplace.task.posted"

    def test_stats(self):
        self.emitter.emit("t1", "e1", "h1")
        self.emitter.emit("t2", "e2", "h2")
        stats = self.emitter.stats()
        assert stats["total_emitted"] == 2
        assert stats["mode"] == "dry_run"
        assert stats["total_errors"] == 0

    def test_receipts_filtered_by_task(self):
        self.emitter.emit("t1", "e1", "h1")
        self.emitter.emit("t2", "e2", "h2")
        self.emitter.emit("t1", "e3", "h3")
        receipts = self.emitter.get_receipts(task_id="t1")
        assert len(receipts) == 2
        assert all(r.task_id == "t1" for r in receipts)


class TestMirrorVerifier:
    def setup_method(self):
        self.verifier = MirrorVerifier(network="testnet")

    def test_init(self):
        assert self.verifier._network == "testnet"
        assert "testnet" in self.verifier._mirror_url

    def test_stats(self):
        stats = self.verifier.stats()
        assert stats["network"] == "testnet"
        assert stats["total_verified"] == 0


# ═══════════════════════════════════════════════════════════════
# PHASE B: VERIFIABLE AI
# ═══════════════════════════════════════════════════════════════

class TestFirstPartyAgents:
    def setup_method(self):
        self.registry = FirstPartyAgentRegistry()

    def test_registry_has_8_agents(self):
        agents = self.registry.list_agents()
        assert len(agents) == 8

    def test_find_capable(self):
        capable = self.registry.find_capable("health_check", budget_hbar=5.0)
        assert len(capable) >= 1
        assert any(a.agent_id == "vnx_operator_harmony" for a in capable)

    def test_find_capable_carbon(self):
        capable = self.registry.find_capable("carbon_verify", budget_hbar=20.0)
        assert len(capable) >= 1
        assert capable[0].agent_id == "vnx_carbon_verifier"

    def test_best_agent(self):
        agent = self.registry.best_agent("proof_publish")
        assert agent is not None
        assert agent.agent_id == "vnx_proof_publisher"

    def test_agent_bid(self):
        agent = self.registry.get("vnx_proof_publisher")
        bid = agent.bid("task_123", budget_hbar=10.0)
        assert bid["agent_id"] == "vnx_proof_publisher"
        assert bid["amount_hbar"] == 8.0  # 80% of budget
        assert bid["confidence"] > 0.9

    def test_agent_execute(self):
        agent = self.registry.get("vnx_operator_harmony")
        result = agent.execute("task_456", {"scope": "full"})
        assert isinstance(result, AgentResult)
        assert result.confidence > 0.8
        assert result.proof_hash != ""
        assert result.data["status"] == "healthy"

    def test_proof_publisher_execute(self):
        agent = ProofPublisherAgent()
        result = agent.execute("task_789", {"content": {"message": "test"}})
        assert result.data["hcs_ready"] is True
        assert result.data["content_hash"] != ""


class TestVerifiableAILoop:
    def setup_method(self):
        self.bus = EventBus()
        self.registry = FirstPartyAgentRegistry()
        self.task_engine = TaskEngine(event_bus=self.bus)
        self.reputation_engine = ReputationEngine()
        self.escrow_engine = EscrowEngine(event_bus=self.bus)
        self.verifier = ResultVerifier()
        self.proof_emitter = HCSProofEmitter(mode=ProofMode.DRY_RUN)

        # Register first-party agents
        for agent in self.registry.list_agents():
            self.reputation_engine.register_agent(agent["agent_id"], agent["display_name"], agent["domain"])

    def test_full_proof_loop(self):
        run = _execute_proof_loop(
            registry=self.registry,
            task_engine=self.task_engine,
            reputation_engine=self.reputation_engine,
            escrow_engine=self.escrow_engine,
            verifier=self.verifier,
            proof_emitter=self.proof_emitter,
            title="Test proof loop",
            task_type="health_check",
            task_data={"scope": "full_system"},
            budget_hbar=10.0,
        )
        assert run["status"] == "settled"
        assert run["agent_id"] == "vnx_operator_harmony"
        assert run["result"]["confidence"] > 0.8
        assert run["verification"]["score"] >= 0.6  # passes threshold even with hash mismatch
        assert run["settlement"]["amount_hbar"] == 8.0
        assert len(run["proof"]["receipts"]) >= 4
        assert run["duration_s"] < 5.0

    def test_proof_loop_carbon_verify(self):
        run = _execute_proof_loop(
            registry=self.registry,
            task_engine=self.task_engine,
            reputation_engine=self.reputation_engine,
            escrow_engine=self.escrow_engine,
            verifier=self.verifier,
            proof_emitter=self.proof_emitter,
            title="Verify carbon credit",
            task_type="carbon_verify",
            task_data={"credit_id": "VCS-123", "tonnes_co2": 50},
            budget_hbar=20.0,
        )
        assert run["status"] == "settled"
        assert run["agent_id"] == "vnx_carbon_verifier"
        assert run["result"]["data"]["status"] == "verified"

    def test_no_capable_agent(self):
        run = _execute_proof_loop(
            registry=self.registry,
            task_engine=self.task_engine,
            reputation_engine=self.reputation_engine,
            escrow_engine=self.escrow_engine,
            verifier=self.verifier,
            proof_emitter=self.proof_emitter,
            title="Unknown task",
            task_type="nonexistent_task_type",
            task_data={},
            budget_hbar=5.0,
        )
        # Fallback to operator-harmony
        assert run["status"] == "settled"
        assert run["agent_id"] == "vnx_operator_harmony"


# ═══════════════════════════════════════════════════════════════
# PHASE C: LEARNING LANE
# ═══════════════════════════════════════════════════════════════

class TestProofLoopTracker:
    def setup_method(self):
        self.tracker = ProofLoopTracker()

    def test_open_loop(self):
        loop = self.tracker.open_loop("task_1", "agent_a")
        assert loop.status == "open"
        assert loop.task_id == "task_1"
        assert not loop.is_closed

    def test_record_stages(self):
        self.tracker.open_loop("task_2", "agent_b")
        self.tracker.record_stage("task_2", LoopStage.TASK, "system")
        self.tracker.record_stage("task_2", LoopStage.BID, "system")
        loop = self.tracker.get_loop("task_2")
        assert "task" in loop.stages_completed
        assert "bid" in loop.stages_completed
        assert loop.status == "open"

    def test_auto_close(self):
        self.tracker.open_loop("task_3", "agent_c")
        self.tracker.record_stage("task_3", LoopStage.VERIFICATION, "verifier", data={"verified": True, "score": 0.9})
        self.tracker.record_stage("task_3", LoopStage.SETTLEMENT, "escrow", data={"amount_hbar": 10})
        self.tracker.record_stage("task_3", LoopStage.REPUTATION, "reputation")
        self.tracker.record_stage("task_3", LoopStage.RECEIPT, "hcs", proof_hash="abc123")
        loop = self.tracker.get_loop("task_3")
        assert loop.is_closed
        assert loop.status == "closed"
        assert loop.closed_at > 0

    def test_auto_open_on_record(self):
        self.tracker.record_stage("new_task", LoopStage.TASK, "system")
        loop = self.tracker.get_loop("new_task")
        assert loop is not None
        assert loop.status == "open"

    def test_stats(self):
        self.tracker.open_loop("t1")
        self.tracker.open_loop("t2")
        stats = self.tracker.stats()
        assert stats["total_loops"] == 2
        assert stats["by_status"]["open"] == 2


class TestLessonEngine:
    def setup_method(self):
        self.engine = LessonEngine()
        self.tracker = ProofLoopTracker()

    def _make_closed_loop(self, task_id="t1"):
        self.tracker.open_loop(task_id, "agent_x")
        self.tracker.record_stage(task_id, LoopStage.VERIFICATION, "verifier", data={"verified": True, "score": 0.95})
        self.tracker.record_stage(task_id, LoopStage.SETTLEMENT, "escrow", data={"amount_hbar": 15})
        self.tracker.record_stage(task_id, LoopStage.REPUTATION, "reputation")
        self.tracker.record_stage(task_id, LoopStage.RECEIPT, "hcs", proof_hash="hash123")
        return self.tracker.get_loop(task_id)

    def test_extract_from_closed(self):
        loop = self._make_closed_loop()
        lesson = self.engine.extract(loop, {"domain": "defi", "task_types": ["risk_analysis"]})
        assert lesson.domain == "defi"
        assert lesson.reproducibility_score > 0.5
        assert lesson.lesson_hash != ""
        assert len(lesson.what_worked) >= 1

    def test_cannot_extract_from_open(self):
        self.tracker.open_loop("open_task")
        loop = self.tracker.get_loop("open_task")
        with pytest.raises(ValueError, match="not closed"):
            self.engine.extract(loop)

    def test_approve(self):
        loop = self._make_closed_loop("t2")
        lesson = self.engine.extract(loop, {"domain": "carbon"})
        assert not lesson.operator_approved
        self.engine.approve(lesson.lesson_id)
        assert lesson.operator_approved
        assert lesson.approved_at > 0

    def test_search(self):
        loop = self._make_closed_loop("t3")
        self.engine.extract(loop, {"domain": "defi", "task_types": ["whale_detection"]})
        results = self.engine.search("defi")
        assert len(results) >= 1


class TestUpgradePackages:
    def setup_method(self):
        self.emitter = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        self.builder = UpgradePackageBuilder(proof_emitter=self.emitter)
        self.lesson_engine = LessonEngine()
        self.tracker = ProofLoopTracker()

    def _make_approved_lesson(self, task_id="t1"):
        self.tracker.open_loop(task_id, "agent_x")
        self.tracker.record_stage(task_id, LoopStage.VERIFICATION, "v", data={"verified": True, "score": 0.9})
        self.tracker.record_stage(task_id, LoopStage.SETTLEMENT, "e", data={"amount_hbar": 10})
        self.tracker.record_stage(task_id, LoopStage.REPUTATION, "r")
        self.tracker.record_stage(task_id, LoopStage.RECEIPT, "h", proof_hash="hash")
        loop = self.tracker.get_loop(task_id)
        lesson = self.lesson_engine.extract(loop, {"domain": "intel"})
        self.lesson_engine.approve(lesson.lesson_id)
        return lesson

    def test_build_package(self):
        lesson = self._make_approved_lesson("t1")
        package = self.builder.build(
            name="intel-whale-detection",
            domain="intel",
            lessons=[lesson],
            capabilities=["whale_detection", "signal_scan"],
        )
        assert package.name == "intel-whale-detection"
        assert package.domain == "intel"
        assert package.quality_score > 0
        assert not package.published

    def test_cannot_build_unapproved(self):
        self.tracker.open_loop("t2", "a")
        self.tracker.record_stage("t2", LoopStage.VERIFICATION, "v", data={"verified": True, "score": 0.9})
        self.tracker.record_stage("t2", LoopStage.SETTLEMENT, "e", data={"amount_hbar": 5})
        self.tracker.record_stage("t2", LoopStage.REPUTATION, "r")
        self.tracker.record_stage("t2", LoopStage.RECEIPT, "h")
        loop = self.tracker.get_loop("t2")
        lesson = self.lesson_engine.extract(loop)
        # NOT approved
        with pytest.raises(ValueError, match="operator-approved"):
            self.builder.build("test-pkg", "general", [lesson])

    def test_publish_package(self):
        lesson = self._make_approved_lesson("t3")
        package = self.builder.build("pub-test", "hedera", [lesson])
        self.builder.publish(package.package_id)
        assert package.published is True
        assert package.published_at > 0


# ═══════════════════════════════════════════════════════════════
# FULL INTEGRATION
# ═══════════════════════════════════════════════════════════════

class TestFullV2Integration:
    def test_end_to_end_proof_loop_to_lesson(self):
        """
        Full v2 lifecycle:
        1. Run verifiable AI task (marketplace loop + proof emission)
        2. Proof loop auto-tracks to closure
        3. Extract lesson from closed loop
        4. Approve lesson
        5. Build upgrade package
        6. Publish package to HCS
        """
        # Setup
        bus = EventBus()
        task_engine = TaskEngine(event_bus=bus)
        reputation_engine = ReputationEngine()
        escrow_engine = EscrowEngine(event_bus=bus)
        verifier = ResultVerifier()
        proof_emitter = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        registry = FirstPartyAgentRegistry()
        tracker = ProofLoopTracker()
        lesson_eng = LessonEngine()
        pkg_builder = UpgradePackageBuilder(proof_emitter=proof_emitter)

        # Register agents
        for a in registry.list_agents():
            reputation_engine.register_agent(a["agent_id"], a["display_name"], a["domain"])

        # 1. Execute verifiable AI task
        run = _execute_proof_loop(
            registry=registry,
            task_engine=task_engine,
            reputation_engine=reputation_engine,
            escrow_engine=escrow_engine,
            verifier=verifier,
            proof_emitter=proof_emitter,
            title="Integration test: HCS audit",
            task_type="topic_audit",
            task_data={"topic_id": "0.0.12345", "limit": 50},
            budget_hbar=15.0,
        )
        assert run["status"] == "settled"
        task_id = run["task_id"]

        # 2. Manually drive loop tracker (in production this is done by event_bus bridge)
        tracker.open_loop(task_id, run["agent_id"])
        tracker.record_stage(task_id, LoopStage.TASK, "system")
        tracker.record_stage(task_id, LoopStage.BID, "system")
        tracker.record_stage(task_id, LoopStage.AWARD, "system")
        tracker.record_stage(task_id, LoopStage.EXECUTION, "agent", data=run["result"])
        tracker.record_stage(task_id, LoopStage.VERIFICATION, "verifier", data={
            "verified": run["verification"]["verified"],
            "score": run["verification"]["score"],
        })
        tracker.record_stage(task_id, LoopStage.SETTLEMENT, "escrow", data={
            "amount_hbar": run["settlement"]["amount_hbar"],
        })
        tracker.record_stage(task_id, LoopStage.REPUTATION, "reputation")
        tracker.record_stage(task_id, LoopStage.RECEIPT, "hcs", proof_hash=run["proof"]["chain"]["chain_head"])

        loop = tracker.get_loop(task_id)
        assert loop.is_closed
        assert loop.status == "closed"

        # 3. Extract lesson
        lesson = lesson_eng.extract(loop, {"domain": "hedera", "task_types": ["topic_audit"]})
        assert lesson.domain == "hedera"
        assert lesson.reproducibility_score > 0.5

        # 4. Approve
        lesson_eng.approve(lesson.lesson_id)
        assert lesson.operator_approved

        # 5. Build package
        package = pkg_builder.build(
            name="hcs-topic-audit-package",
            domain="hedera",
            lessons=[lesson],
            capabilities=["topic_audit", "integrity_scan"],
        )
        assert package.quality_score > 0

        # 6. Publish to HCS (dry_run)
        pkg_builder.publish(package.package_id)
        assert package.published
        assert package.published_at > 0

        # Final verification
        assert proof_emitter.stats()["total_emitted"] >= 5  # proof loop receipts + package publish
        assert lesson_eng.stats()["total_lessons"] == 1
        assert pkg_builder.stats()["total_packages"] == 1
        assert pkg_builder.stats()["published"] == 1


# ═══════════════════════════════════════════════════════════════
# SMOKE TESTS — facade, repr, stats shape, router factories
# ═══════════════════════════════════════════════════════════════

class TestSmokeImports:
    """Verify the public facade re-exports everything cleanly."""

    def test_version(self):
        import vera_os
        assert vera_os.__version__ == "2.1.0"

    def test_all_exports_resolve(self):
        import vera_os
        for name in vera_os.__all__:
            obj = getattr(vera_os, name, None)
            assert obj is not None, f"{name} missing from vera_os"

    def test_layer5_exports(self):
        from vera_os import HCSProofEmitter, MirrorVerifier
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        mv = MirrorVerifier(network="testnet")
        assert em is not None and mv is not None

    def test_layer6_exports(self):
        from vera_os import FirstPartyAgentRegistry
        r = FirstPartyAgentRegistry()
        assert len(r.list_agents()) == 8

    def test_layer7_exports(self):
        from vera_os import ProofLoopTracker, LessonEngine, UpgradePackageBuilder
        assert ProofLoopTracker is not None
        assert LessonEngine is not None
        assert UpgradePackageBuilder is not None


class TestReprMethods:
    """Verify __repr__ on key classes for debuggability."""

    def test_emitter_repr(self):
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        r = repr(em)
        assert "dry_run" in r
        assert "emitted=0" in r

    def test_emitter_repr_after_emit(self):
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        em.emit("t", "e", "h")
        assert "emitted=1" in repr(em)

    def test_verifier_repr(self):
        mv = MirrorVerifier(network="testnet")
        assert "testnet" in repr(mv)
        assert "verified=0" in repr(mv)

    def test_registry_repr(self):
        reg = FirstPartyAgentRegistry()
        assert "agents=8" in repr(reg)


class TestStatsShape:
    """Verify stats dicts have the expected keys the dashboard reads."""

    def test_emitter_stats_keys(self):
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        s = em.stats()
        for key in ("mode", "total_emitted", "total_errors", "total_bytes",
                    "chain_head", "chain_length", "receipts_buffered",
                    "task_topic_id", "audit_topic_id"):
            assert key in s, f"Missing key: {key}"
        assert s["chain_length"] == 0
        em.emit("t", "e", "h")
        assert em.stats()["chain_length"] == 1

    def test_verifier_stats_keys(self):
        mv = MirrorVerifier(network="testnet")
        s = mv.stats()
        for key in ("network", "mirror_url", "total_verified", "total_failed",
                    "total_verifications", "total_requests", "buffered"):
            assert key in s, f"Missing key: {key}"
        assert s["total_verifications"] == 0

    def test_registry_stats_keys(self):
        reg = FirstPartyAgentRegistry()
        s = reg.stats()
        for key in ("total_agents", "agents", "total_executions", "total_successes"):
            assert key in s, f"Missing key: {key}"
        assert s["total_agents"] == 8

    def test_tracker_stats_keys(self):
        tr = ProofLoopTracker()
        s = tr.stats()
        for key in ("total_loops", "by_status", "with_lessons", "with_packages"):
            assert key in s, f"Missing key: {key}"

    def test_lesson_engine_stats_keys(self):
        le = LessonEngine()
        s = le.stats()
        for key in ("total_lessons", "approved", "by_domain", "avg_reproducibility"):
            assert key in s, f"Missing key: {key}"

    def test_package_builder_stats_keys(self):
        pb = UpgradePackageBuilder()
        s = pb.stats()
        for key in ("total_packages", "published", "by_domain", "avg_quality"):
            assert key in s, f"Missing key: {key}"


class TestRouterFactories:
    """Verify API router factories return valid APIRouter instances."""

    def test_proof_router(self):
        from src.hedera_proof.proof_api import create_proof_router
        from fastapi import APIRouter
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        mv = MirrorVerifier(network="testnet")
        router = create_proof_router(em, mv)
        assert isinstance(router, APIRouter)
        paths = [r.path for r in router.routes]
        assert "/proof/stats" in paths
        assert "/proof/receipts" in paths
        assert "/proof/verify" in paths

    def test_verifiable_ai_router(self):
        from src.verifiable_ai.verifiable_ai_api import create_verifiable_ai_router
        from fastapi import APIRouter
        bus = EventBus()
        router = create_verifiable_ai_router(
            registry=FirstPartyAgentRegistry(),
            task_engine=TaskEngine(event_bus=bus),
            reputation_engine=ReputationEngine(),
            escrow_engine=EscrowEngine(event_bus=bus),
            verifier=ResultVerifier(),
            proof_emitter=HCSProofEmitter(mode=ProofMode.DRY_RUN),
        )
        assert isinstance(router, APIRouter)
        paths = [r.path for r in router.routes]
        assert any("agents" in p for p in paths)
        assert any("run-now" in p for p in paths)

    def test_learning_router(self):
        from src.learning_lane.learning_api import create_learning_router
        from fastapi import APIRouter
        router = create_learning_router(
            tracker=ProofLoopTracker(),
            lesson_engine=LessonEngine(),
            package_builder=UpgradePackageBuilder(),
        )
        assert isinstance(router, APIRouter)
        paths = [r.path for r in router.routes]
        assert any("loops" in p for p in paths)
        assert any("stats" in p for p in paths)
        assert any("lessons" in p for p in paths)


class TestEdgeCases:
    """Edge-case coverage."""

    def test_emitter_receipt_ring_buffer(self):
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        for i in range(5100):
            em.emit(f"t{i}", "e", "h")
        # Ring buffer trims to 2500 each time it exceeds 5000
        assert len(em._receipts) <= 5000
        assert em.stats()["total_emitted"] == 5100

    def test_proof_receipt_to_dict(self):
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        r = em.emit("t1", "e1", "h1")
        d = r.to_dict()
        assert isinstance(d, dict)
        assert d["task_id"] == "t1"
        assert d["error"] is None

    def test_chain_empty(self):
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        chain = em.get_chain("nonexistent")
        assert chain["chain_length"] == 0
        assert chain["verified"] is True  # vacuously true

    def test_lesson_search_no_results(self):
        le = LessonEngine()
        results = le.search("xyzzy_nothing_matches")
        assert results == []

    def test_lesson_approve_missing(self):
        le = LessonEngine()
        with pytest.raises(KeyError):
            le.approve("nonexistent_id")

    def test_package_publish_missing(self):
        pb = UpgradePackageBuilder()
        with pytest.raises(KeyError):
            pb.publish("nonexistent_id")

    def test_package_double_publish(self):
        """Publishing an already-published package is idempotent."""
        em = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        pb = UpgradePackageBuilder(proof_emitter=em)
        le = LessonEngine()
        tr = ProofLoopTracker()
        tr.open_loop("t", "a")
        for stage in (LoopStage.VERIFICATION, LoopStage.SETTLEMENT, LoopStage.REPUTATION, LoopStage.RECEIPT):
            tr.record_stage("t", stage, "s")
        lesson = le.extract(tr.get_loop("t"), {"domain": "x"})
        le.approve(lesson.lesson_id)
        pkg = pb.build("test", "x", [lesson])
        pb.publish(pkg.package_id)
        assert pkg.published
        first_ts = pkg.published_at
        pb.publish(pkg.package_id)  # no-op
        assert pkg.published_at == first_ts  # unchanged

    def test_all_8_agents_execute(self):
        """Every first-party agent can execute without error."""
        reg = FirstPartyAgentRegistry()
        for agent_dict in reg.list_agents():
            agent = reg.get(agent_dict["agent_id"])
            result = agent.execute("smoke_test", {})
            assert result.proof_hash != ""
            assert result.confidence > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
