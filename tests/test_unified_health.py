"""Tests for the unified health endpoint."""

import sys
sys.path.insert(0, ".")

from src.health.unified_health import UnifiedHealthCheck
from src.hedera_proof.hcs_emitter import HCSProofEmitter, ProofMode
from src.hedera_proof.mirror_verifier import MirrorVerifier
from src.verifiable_ai.first_party_agents import FirstPartyAgentRegistry
from src.learning_lane.proof_loop_tracker import ProofLoopTracker
from src.learning_lane.lesson_engine import LessonEngine
from src.learning_lane.upgrade_packages import UpgradePackageBuilder


class TestUnifiedHealth:
    def setup_method(self):
        self.emitter = HCSProofEmitter(mode=ProofMode.DRY_RUN)
        self.verifier = MirrorVerifier(network="testnet")
        self.registry = FirstPartyAgentRegistry()
        self.tracker = ProofLoopTracker()
        self.lesson_engine = LessonEngine()
        self.pkg_builder = UpgradePackageBuilder()

        self.health = UnifiedHealthCheck(
            proof_emitter=self.emitter,
            mirror_verifier=self.verifier,
            first_party_registry=self.registry,
            proof_loop_tracker=self.tracker,
            lesson_engine=self.lesson_engine,
            package_builder=self.pkg_builder,
        )

    def test_returns_ok_status(self):
        result = self.health.check()
        assert result["status"] in ("ok", "degraded")
        assert result["version"] == "2.0.0"
        assert result["uptime_s"] >= 0

    def test_has_all_7_layers(self):
        result = self.health.check()
        layers = result["layers"]
        assert len(layers) == 7
        expected = [
            "hedera_core", "predictions", "workflow_agents",
            "marketplace", "proof_loop", "verifiable_ai", "learning_lane",
        ]
        for name in expected:
            assert name in layers, f"Missing layer: {name}"

    def test_layer_numbers_sequential(self):
        result = self.health.check()
        for name, info in result["layers"].items():
            assert "layer" in info
            assert info["layer"] >= 1 and info["layer"] <= 7

    def test_proof_loop_layer_details(self):
        self.emitter.emit("t1", "e1", "h1")
        result = self.health.check()
        proof = result["layers"]["proof_loop"]
        assert proof["status"] == "ok"
        assert proof["mode"] == "dry_run"
        assert proof["total_emitted"] == 1
        assert proof["chain_length"] == 1

    def test_verifiable_ai_layer_details(self):
        result = self.health.check()
        vai = result["layers"]["verifiable_ai"]
        assert vai["status"] == "ok"
        assert vai["first_party_agents"] == 8

    def test_learning_lane_layer_details(self):
        result = self.health.check()
        ll = result["layers"]["learning_lane"]
        assert ll["status"] == "ok"
        assert "total_loops" in ll
        assert "total_lessons" in ll
        assert "total_packages" in ll

    def test_degraded_when_engines_missing(self):
        """Layers without engines report degraded."""
        minimal = UnifiedHealthCheck(
            proof_emitter=self.emitter,
            mirror_verifier=self.verifier,
        )
        result = minimal.check()
        assert result["status"] == "degraded"
        assert result["layers"]["marketplace"]["status"] == "degraded"
        assert result["layers"]["proof_loop"]["status"] == "ok"
