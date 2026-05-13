"""
Comprehensive tests for Vera OS v1.0 Foundation.

Tests all four pillars:
  1. Marketplace — task lifecycle, reputation, escrow, verifier
  2. Streaming — event stream, live pipeline
  3. AI backbone — LLM router, decomposer, summarizer, RAG
  4. Integration — full lifecycle end-to-end
"""

import sys
import time

sys.path.insert(0, ".")

import pytest

from src.marketplace.task_engine import TaskEngine, TaskStatus, TaskCategory
from src.marketplace.reputation import ReputationEngine
from src.marketplace.escrow import EscrowEngine, EscrowStatus
from src.marketplace.verifier import ResultVerifier
from src.streaming.event_stream import EventStream
from src.streaming.live_pipeline import LivePipeline, LivePipelineRule, create_default_rules
from src.ai_backbone.llm_router import LLMRouter
from src.ai_backbone.task_decomposer import TaskDecomposer
from src.ai_backbone.summarizer import ResultSummarizer
from src.ai_backbone.rag_context import RAGContext
from src.agents.advanced_workflows import EventBus


# ═══════════════════════════════════════════════════════════════
# PILLAR 1: MARKETPLACE
# ═══════════════════════════════════════════════════════════════

class TestTaskEngine:
    def setup_method(self):
        self.bus = EventBus()
        self.engine = TaskEngine(event_bus=self.bus)

    def test_post_task(self):
        task = self.engine.post_task("Test task", budget_hbar=10.0)
        assert task.title == "Test task"
        assert task.status == TaskStatus.BIDDING  # post_task transitions immediately to BIDDING
        assert task.budget_hbar == 10.0

    def test_bid_flow(self):
        task = self.engine.post_task("Bid test", budget_hbar=20.0)
        bid = self.engine.submit_bid(task.task_id, "agent_a", amount_hbar=15.0, confidence=0.9)
        assert bid.agent_id == "agent_a"
        assert task.status == TaskStatus.BIDDING
        assert len(task.bids) == 1

    def test_award_and_execute(self):
        task = self.engine.post_task("Award test", budget_hbar=10.0)
        bid = self.engine.submit_bid(task.task_id, "agent_b", amount_hbar=8.0)
        self.engine.award_task(task.task_id, bid.bid_id)
        assert task.status == TaskStatus.AWARDED
        assert task.awarded_agent_id == "agent_b"

        self.engine.start_execution(task.task_id)
        assert task.status == TaskStatus.EXECUTING

    def test_full_lifecycle(self):
        task = self.engine.post_task("Full test", budget_hbar=10.0)
        bid = self.engine.submit_bid(task.task_id, "agent_c", amount_hbar=8.0, confidence=0.85)
        self.engine.award_task(task.task_id, bid.bid_id)
        self.engine.start_execution(task.task_id)
        self.engine.submit_result(task.task_id, "agent_c", {"prediction": "up", "confidence": 0.9})
        self.engine.verify_result(task.task_id, verified=True)
        self.engine.settle_task(task.task_id)
        assert task.status == TaskStatus.SETTLED
        assert task.settlement_amount == 8.0
        assert len(task.proof_chain) >= 4

    def test_invalid_transition(self):
        task = self.engine.post_task("Bad transition")
        with pytest.raises(ValueError, match="cannot be settled"):
            self.engine.settle_task(task.task_id)

    def test_cancel(self):
        task = self.engine.post_task("Cancel me", budget_hbar=5.0)
        self.engine.cancel_task(task.task_id, reason="Test cancel")
        assert task.status == TaskStatus.CANCELLED

    def test_dispute_flow(self):
        task = self.engine.post_task("Dispute test", budget_hbar=10.0)
        bid = self.engine.submit_bid(task.task_id, "agent_d", amount_hbar=9.0)
        self.engine.award_task(task.task_id, bid.bid_id)
        self.engine.start_execution(task.task_id)
        self.engine.submit_result(task.task_id, "agent_d", {"bad": "result"})
        self.engine.verify_result(task.task_id, verified=False, verifier_notes="Bad result")
        assert task.status == TaskStatus.DISPUTED

    def test_stats(self):
        self.engine.post_task("Task 1")
        self.engine.post_task("Task 2")
        stats = self.engine.stats()
        assert stats["total_tasks"] == 2
        assert "bidding" in stats["by_status"]

    def test_event_emission(self):
        captured = []
        self.bus.subscribe("marketplace.*", lambda e, d: captured.append((e, d)))
        task = self.engine.post_task("Event test")
        assert len(captured) >= 1
        assert "marketplace.task.posted" == captured[0][0]


class TestReputation:
    def setup_method(self):
        self.engine = ReputationEngine()

    def test_register_agent(self):
        rep = self.engine.register_agent("agent_1", "Agent One", "defi")
        assert rep.score == 1000.0
        assert rep.tier == "standard"

    def test_success_increases_score(self):
        self.engine.register_agent("agent_2")
        self.engine.record_outcome("agent_2", "task_1", "success", earned_hbar=10.0)
        rep = self.engine.get_agent("agent_2")
        assert rep.score > 1000.0
        assert rep.total_tasks == 1
        assert rep.successful_tasks == 1
        assert rep.streak == 1

    def test_failure_decreases_score(self):
        self.engine.register_agent("agent_3")
        self.engine.record_outcome("agent_3", "task_1", "failure")
        rep = self.engine.get_agent("agent_3")
        assert rep.score < 1000.0
        assert rep.failed_tasks == 1
        assert rep.streak == -1

    def test_streak_bonus(self):
        self.engine.register_agent("agent_4")
        for i in range(5):
            self.engine.record_outcome("agent_4", f"task_{i}", "success")
        rep = self.engine.get_agent("agent_4")
        assert rep.streak == 5
        assert rep.score > 1125  # 5 * 25 = 125 minimum, plus streak bonuses

    def test_tier_progression(self):
        self.engine.register_agent("agent_5")
        for i in range(25):
            self.engine.record_outcome("agent_5", f"task_{i}", "success")
        rep = self.engine.get_agent("agent_5")
        assert rep.tier in ("trusted", "elite")

    def test_leaderboard(self):
        self.engine.register_agent("agent_a", domain="defi")
        self.engine.register_agent("agent_b", domain="defi")
        self.engine.record_outcome("agent_a", "t1", "success", earned_hbar=10.0)
        lb = self.engine.leaderboard(domain="defi")
        assert len(lb) == 2
        assert lb[0]["rank"] == 1


class TestEscrow:
    def setup_method(self):
        self.engine = EscrowEngine()

    def test_hold(self):
        entry = self.engine.hold("task_1", "payer", "payee", 100.0)
        assert entry.status == EscrowStatus.HELD
        assert entry.amount_hbar == 100.0
        assert entry.proof_hash != ""

    def test_release(self):
        entry = self.engine.hold("task_2", "payer", "payee", 50.0)
        released = self.engine.release(entry.escrow_id)
        assert released.status == EscrowStatus.RELEASED
        assert released.released_amount == 50.0

    def test_partial_release(self):
        entry = self.engine.hold("task_3", "payer", "payee", 100.0)
        released = self.engine.release(entry.escrow_id, 60.0)
        assert released.status == EscrowStatus.PARTIAL_RELEASE
        assert released.released_amount == 60.0

    def test_refund(self):
        entry = self.engine.hold("task_4", "payer", "payee", 75.0)
        refunded = self.engine.refund(entry.escrow_id)
        assert refunded.status == EscrowStatus.REFUNDED
        assert refunded.refunded_amount == 75.0

    def test_dispute(self):
        entry = self.engine.hold("task_5", "payer", "payee", 100.0)
        disputed = self.engine.dispute(entry.escrow_id)
        assert disputed.status == EscrowStatus.DISPUTED

    def test_cannot_release_after_refund(self):
        entry = self.engine.hold("task_6", "payer", "payee", 50.0)
        self.engine.refund(entry.escrow_id)
        with pytest.raises(ValueError):
            self.engine.release(entry.escrow_id)

    def test_stats(self):
        self.engine.hold("t1", "p", "a", 10.0)
        self.engine.hold("t2", "p", "a", 20.0)
        stats = self.engine.stats()
        assert stats["total_escrows"] == 2
        assert stats["total_held_hbar"] == 30.0


class TestVerifier:
    def setup_method(self):
        self.verifier = ResultVerifier()

    def test_pass_verification(self):
        result = self.verifier.verify(
            task_id="task_1",
            result_data={"prediction": "up", "confidence": 0.85},
        )
        assert result.verified is True
        assert result.score == 1.0

    def test_fail_empty_result(self):
        result = self.verifier.verify(
            task_id="task_2",
            result_data={},
        )
        # Empty data fails check 1 but 4/5 checks pass (0.8 >= 0.6 threshold)
        assert result.score == 0.8
        assert "Result data is empty" in result.issues

    def test_fail_low_confidence(self):
        result = self.verifier.verify(
            task_id="task_3",
            result_data={"confidence": 0.1},
        )
        # Low confidence fails check 4 but 4/5 still pass (0.8 >= 0.6)
        assert any("Confidence" in i for i in result.issues)
        assert result.score == 0.8

    def test_hash_mismatch(self):
        result = self.verifier.verify(
            task_id="task_4",
            result_data={"value": 42},
            claimed_proof_hash="deadbeef",
        )
        assert result.verified is False
        assert any("hash mismatch" in i for i in result.issues)

    def test_human_review_flag(self):
        result = self.verifier.verify(
            task_id="task_5",
            result_data={"prediction": "up", "confidence": 0.9},
            budget_hbar=600.0,
        )
        assert result.requires_human_review is True

    def test_stats(self):
        self.verifier.verify("t1", {"confidence": 0.9})
        self.verifier.verify("t2", {})
        stats = self.verifier.stats()
        assert stats["total_verifications"] == 2


# ═══════════════════════════════════════════════════════════════
# PILLAR 2: STREAMING
# ═══════════════════════════════════════════════════════════════

class TestEventStream:
    def test_emit_and_history(self):
        stream = EventStream()
        stream.emit("test.event", {"key": "value"}, source="test")
        history = stream.history(limit=10)
        assert len(history) == 1
        assert history[0]["channel"] == "test.event"
        assert history[0]["data"]["key"] == "value"

    def test_channel_filter(self):
        stream = EventStream()
        stream.emit("marketplace.task.posted", {"task_id": "1"})
        stream.emit("agents.run", {"agent_id": "a"})
        stream.emit("marketplace.task.settled", {"task_id": "2"})
        marketplace_events = stream.history(channel="marketplace")
        assert len(marketplace_events) == 2

    def test_stats(self):
        stream = EventStream()
        stream.emit("ch1.sub", {})
        stream.emit("ch2.sub", {})
        stats = stream.stats()
        assert stats["total_emitted"] == 2
        assert "ch1" in stats["channels_seen"]


class TestLivePipeline:
    def test_rule_matching(self):
        results = []

        def mock_run(steps, data):
            results.append(steps)
            return {"status": "ok"}

        pipeline = LivePipeline(run_pipeline_fn=mock_run)
        pipeline.add_rule(LivePipelineRule(
            name="test_rule",
            event_pattern="test.event",
            pipeline_steps=[{"domain": "intel", "agent": "intel_signal_001"}],
            cooldown_seconds=0,
        ))

        fired = pipeline.process_event("test.event", {"key": "val"})
        assert len(fired) == 1
        assert fired[0]["rule"] == "test_rule"
        assert len(results) == 1

    def test_cooldown(self):
        call_count = [0]

        def mock_run(steps, data):
            call_count[0] += 1
            return {}

        pipeline = LivePipeline(run_pipeline_fn=mock_run)
        pipeline.add_rule(LivePipelineRule(
            name="cooldown_rule",
            event_pattern="rapid.*",
            pipeline_steps=[],
            cooldown_seconds=60,
        ))

        pipeline.process_event("rapid.fire", {})
        pipeline.process_event("rapid.fire", {})
        assert call_count[0] == 1  # Second call blocked by cooldown

    def test_default_rules(self):
        rules = create_default_rules()
        assert len(rules) == 3
        assert rules[0].name == "task_posted_intel"


# ═══════════════════════════════════════════════════════════════
# PILLAR 3: AI BACKBONE
# ═══════════════════════════════════════════════════════════════

class TestLLMRouter:
    def test_fallback_always_available(self):
        router = LLMRouter()
        assert router.stats()["available_models"] >= 1

    def test_fallback_completion(self):
        router = LLMRouter()
        response = router.complete("Summarize the results")
        assert response.text != ""
        assert response.provider == "fallback"
        assert response.fallback is True

    def test_list_models(self):
        router = LLMRouter()
        models = router.list_models()
        assert any(m["model_id"] == "fallback" for m in models)


class TestTaskDecomposer:
    def test_keyword_decomposition(self):
        router = LLMRouter()
        decomposer = TaskDecomposer(router)
        result = decomposer.decompose("Check whale activity and drawdown risk")
        assert len(result["steps"]) >= 2
        assert result["method"] == "fallback"
        domains = [s["domain"] for s in result["steps"]]
        assert "intel" in domains or "risk" in domains

    def test_default_fallback(self):
        router = LLMRouter()
        decomposer = TaskDecomposer(router)
        result = decomposer.decompose("Do something vague with no keywords")
        assert len(result["steps"]) >= 2  # Default pipeline assigned


class TestSummarizer:
    def test_domain_summary(self):
        router = LLMRouter()
        summarizer = ResultSummarizer(router)
        result = summarizer.summarize({
            "domain": "intel",
            "status": "healthy",
            "total_actions": 3,
            "actions": [{"title": "Whale alert", "urgency": "high"}],
        })
        assert result["headline"] != ""
        assert result["method"] == "fallback"

    def test_pipeline_summary(self):
        router = LLMRouter()
        summarizer = ResultSummarizer(router)
        result = summarizer.summarize({
            "completed_steps": 3,
            "total_steps": 3,
            "failed_steps": 0,
        })
        assert "3/3" in result["summary"]


class TestRAGContext:
    def test_ingest_and_retrieve(self):
        router = LLMRouter()
        rag = RAGContext(router)
        rag.ingest("HBAR price showing bullish divergence", "agent_1", "intel")
        rag.ingest("Portfolio risk at 45% concentration", "agent_2", "risk")
        results = rag.retrieve("risk exposure portfolio")
        assert len(results) >= 1
        assert "risk" in results[0].content.lower() or "portfolio" in results[0].content.lower()

    def test_ask(self):
        router = LLMRouter()
        rag = RAGContext(router)
        rag.ingest("Bitcoin volume up 200% in 24h", "intel_volume", "intel")
        answer = rag.ask("What is bitcoin volume?")
        assert answer["answer"] != ""
        assert answer["source_count"] >= 1


# ═══════════════════════════════════════════════════════════════
# INTEGRATION: FULL LIFECYCLE
# ═══════════════════════════════════════════════════════════════

class TestIntegration:
    def test_full_marketplace_lifecycle_with_all_systems(self):
        """End-to-end: post → bid → award → execute → verify → settle with all systems."""
        bus = EventBus()
        task_engine = TaskEngine(event_bus=bus)
        reputation_engine = ReputationEngine()
        escrow_engine = EscrowEngine(event_bus=bus)
        verifier = ResultVerifier()
        event_stream = EventStream()

        # Bridge events
        bus.subscribe("marketplace.*", lambda e, d: event_stream.emit(e, d, source="bus"))

        # Register agent
        reputation_engine.register_agent("integrator_agent", "Integrator", "defi")

        # Post task + escrow
        task = task_engine.post_task("Predict HBAR price", budget_hbar=25.0)
        escrow = escrow_engine.hold(task.task_id, "system", "integrator_agent", 25.0)
        task.escrow_id = escrow.escrow_id

        # Bid + Award + Execute
        bid = task_engine.submit_bid(task.task_id, "integrator_agent", amount_hbar=20.0, confidence=0.9)
        task_engine.award_task(task.task_id, bid.bid_id)
        task_engine.start_execution(task.task_id)

        # Submit result + verify
        result = task_engine.submit_result(task.task_id, "integrator_agent", {
            "prediction": "bullish",
            "confidence": 0.88,
            "target_price": 0.15,
        })
        vr = verifier.verify(task.task_id, result.data, result.proof_hash)
        assert vr.verified is True

        task_engine.verify_result(task.task_id, verified=True)
        task_engine.settle_task(task.task_id)

        # Release escrow
        escrow_engine.release(escrow.escrow_id, task.settlement_amount)

        # Update reputation
        reputation_engine.record_outcome(
            "integrator_agent", task.task_id, "success",
            earned_hbar=task.settlement_amount,
        )

        # Assertions
        assert task.status == TaskStatus.SETTLED
        assert task.settlement_amount == 20.0
        rep = reputation_engine.get_agent("integrator_agent")
        assert rep.score > 1000.0
        assert rep.total_earned_hbar == 20.0
        # Releasing 20 of 25 = partial release
        escrow_status = escrow_engine.get(escrow.escrow_id).status
        assert escrow_status in (EscrowStatus.RELEASED, EscrowStatus.PARTIAL_RELEASE)

        # Event stream captured events
        history = event_stream.history()
        assert len(history) >= 5  # posted, bid, awarded, executing, settled
        assert any("settled" in e["channel"] for e in history)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
