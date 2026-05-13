"""
Hedera Native Agents — 5 specialists that deeply use HCS/HTS primitives.

- HCS Topic Orchestrator: create/query/subscribe topics, gap detection
- HTS Token Lifecycle: mint/burn tracking, supply auditing
- Scheduled Tx Manager: pending tx tracking, expiry alerts
- Multi-Sig Coordinator: threshold key approvals, stale tx cleanup
- Account Activity Profiler: tx frequency, holdings, risk score
"""

import time
from typing import Any, Dict, List

from .base_agent import (
    AgentAction,
    ActionType,
    AgentDomain,
    WorkflowAgent,
    WorkflowOrchestrator,
)


class HCSTopicOrchestratorAgent(WorkflowAgent):
    """
    Create/query/subscribe HCS topics, verify message sequences, detect gaps.
    """

    def __init__(self):
        super().__init__("hedera_hcs_001", "HCS Topic Orchestrator", AgentDomain.HEDERA)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        topics = context.get("topics", self._default_topics())
        actions: List[AgentAction] = []

        analyzed = []
        for topic in topics:
            tid = topic.get("topic_id", "")
            msg_count = topic.get("message_count", 0)
            last_seq = topic.get("last_sequence", 0)
            expected_seq = topic.get("expected_sequence", 0)
            last_msg_age_s = topic.get("last_message_age_seconds", 0)
            has_submit_key = topic.get("has_submit_key", True)

            gaps = max(0, expected_seq - last_seq - 1)
            stale = last_msg_age_s > 3600  # >1 hour
            flood = msg_count > 100  # >100 msgs in window

            health = 100
            if gaps > 0:
                health -= min(40, gaps * 10)
            if stale:
                health -= 30
            if flood:
                health -= 20
            if not has_submit_key:
                health -= 10

            entry = {
                "topic_id": tid,
                "message_count": msg_count,
                "sequence_gaps": gaps,
                "stale": stale,
                "flood": flood,
                "health_score": max(0, health),
            }
            analyzed.append(entry)

            if gaps > 0:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Sequence gap on {tid}: {gaps} missing",
                    description=f"Expected seq {expected_seq}, got {last_seq}. Possible message loss.",
                    params={"topic_id": tid, "gaps": gaps},
                    confidence=0.88,
                    urgency="critical" if gaps > 5 else "high",
                ))
            if stale:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Stale topic: {tid} ({last_msg_age_s}s since last msg)",
                    description="No recent messages — publisher may be down",
                    params={"topic_id": tid, "age_seconds": last_msg_age_s},
                    confidence=0.82,
                    urgency="high",
                ))
            if flood:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Message flood on {tid}: {msg_count} msgs",
                    description="Unusually high activity — possible spam or attack",
                    params={"topic_id": tid, "count": msg_count},
                    confidence=0.80,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "topics": analyzed,
            "total_gaps": sum(t["sequence_gaps"] for t in analyzed),
            "avg_health": round(sum(t["health_score"] for t in analyzed) / max(len(analyzed), 1), 1),
            "actions": actions,
        }

    def _default_topics(self) -> List[Dict]:
        return [
            {"topic_id": "0.0.1001", "message_count": 42, "last_sequence": 42, "expected_sequence": 42, "last_message_age_seconds": 120, "has_submit_key": True},
            {"topic_id": "0.0.1002", "message_count": 150, "last_sequence": 147, "expected_sequence": 150, "last_message_age_seconds": 30, "has_submit_key": True},
            {"topic_id": "0.0.1003", "message_count": 5, "last_sequence": 5, "expected_sequence": 5, "last_message_age_seconds": 7200, "has_submit_key": False},
        ]


class HTSTokenLifecycleAgent(WorkflowAgent):
    """
    Token creation templates, mint/burn tracking, supply auditing, association checks.
    """

    def __init__(self):
        super().__init__("hedera_hts_001", "HTS Token Lifecycle", AgentDomain.HEDERA)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        tokens = context.get("hts_tokens", self._default_tokens())
        actions: List[AgentAction] = []

        analyzed = []
        for token in tokens:
            tid = token.get("token_id", "")
            name = token.get("name", "Unknown")
            total_supply = token.get("total_supply", 0)
            max_supply = token.get("max_supply", 0)
            recent_mints = token.get("recent_mints", 0)
            recent_burns = token.get("recent_burns", 0)
            holders = token.get("holders", 0)
            has_freeze_key = token.get("has_freeze_key", False)
            has_wipe_key = token.get("has_wipe_key", False)

            supply_pct = (total_supply / max(max_supply, 1)) * 100 if max_supply > 0 else 0
            net_emission = recent_mints - recent_burns

            risk_flags: List[str] = []
            if has_wipe_key:
                risk_flags.append("wipe_key_exists")
            if has_freeze_key:
                risk_flags.append("freeze_key_exists")
            if supply_pct > 90 and max_supply > 0:
                risk_flags.append("near_max_supply")
            if holders < 5:
                risk_flags.append("low_holder_count")

            entry = {
                "token_id": tid,
                "name": name,
                "total_supply": total_supply,
                "max_supply": max_supply,
                "supply_utilization_pct": round(supply_pct, 1),
                "recent_mints": recent_mints,
                "recent_burns": recent_burns,
                "net_emission": net_emission,
                "holders": holders,
                "risk_flags": risk_flags,
            }
            analyzed.append(entry)

            if net_emission > total_supply * 0.1:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Large mint event: {name} (+{net_emission})",
                    description=f"Net emission is >10% of supply — verify authorization",
                    params={"token_id": tid, "net_emission": net_emission},
                    confidence=0.85,
                    urgency="high",
                ))
            if risk_flags:
                actions.append(AgentAction(
                    action_type=ActionType.INFORM,
                    title=f"Risk flags on {name}: {', '.join(risk_flags)}",
                    description=f"Token has {len(risk_flags)} risk indicators",
                    params={"token_id": tid, "flags": risk_flags},
                    confidence=0.78,
                    urgency="medium" if len(risk_flags) < 3 else "high",
                ))

        return {
            "status": "completed",
            "tokens": analyzed,
            "total_tokens": len(analyzed),
            "total_risk_flags": sum(len(t["risk_flags"]) for t in analyzed),
            "actions": actions,
        }

    def _default_tokens(self) -> List[Dict]:
        return [
            {"token_id": "0.0.456858", "name": "DOVU", "total_supply": 1_000_000_000, "max_supply": 2_000_000_000, "recent_mints": 5_000_000, "recent_burns": 1_000_000, "holders": 2500, "has_freeze_key": False, "has_wipe_key": False},
            {"token_id": "0.0.731861", "name": "SAUCE", "total_supply": 500_000_000, "max_supply": 1_000_000_000, "recent_mints": 0, "recent_burns": 200_000, "holders": 15000, "has_freeze_key": False, "has_wipe_key": False},
            {"token_id": "0.0.999999", "name": "TEST_NFT", "total_supply": 95, "max_supply": 100, "recent_mints": 10, "recent_burns": 0, "holders": 3, "has_freeze_key": True, "has_wipe_key": True},
        ]


class ScheduledTxManagerAgent(WorkflowAgent):
    """
    Create and monitor scheduled transactions, approve/execute pending, expiry alerts.
    """

    def __init__(self):
        super().__init__("hedera_sched_001", "Scheduled Tx Manager", AgentDomain.HEDERA)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        scheduled_txs = context.get("scheduled_txs", self._default_txs())
        actions: List[AgentAction] = []
        now = time.time()

        analyzed = []
        for tx in scheduled_txs:
            tx_id = tx.get("tx_id", "")
            tx_type = tx.get("type", "unknown")
            created = tx.get("created_at", 0)
            expiry = tx.get("expiry_at", 0)
            sigs_needed = tx.get("signatures_needed", 1)
            sigs_collected = tx.get("signatures_collected", 0)
            executed = tx.get("executed", False)

            time_remaining = max(0, expiry - now)
            sigs_pct = (sigs_collected / max(sigs_needed, 1)) * 100
            at_risk = time_remaining < 3600 and not executed and sigs_pct < 100

            entry = {
                "tx_id": tx_id,
                "type": tx_type,
                "signatures": f"{sigs_collected}/{sigs_needed}",
                "signatures_pct": round(sigs_pct, 1),
                "time_remaining_s": round(time_remaining),
                "executed": executed,
                "at_risk": at_risk,
            }
            analyzed.append(entry)

            if at_risk:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Expiring tx: {tx_id} ({time_remaining:.0f}s left)",
                    description=f"Needs {sigs_needed - sigs_collected} more signatures. Type: {tx_type}",
                    params={"tx_id": tx_id, "time_remaining": time_remaining, "sigs_missing": sigs_needed - sigs_collected},
                    confidence=0.90,
                    urgency="critical" if time_remaining < 600 else "high",
                ))

        return {
            "status": "completed",
            "scheduled_txs": analyzed,
            "pending": sum(1 for t in analyzed if not t["executed"]),
            "at_risk": sum(1 for t in analyzed if t["at_risk"]),
            "actions": actions,
        }

    def _default_txs(self) -> List[Dict]:
        now = time.time()
        return [
            {"tx_id": "0.0.5001@1700000000", "type": "token_mint", "created_at": now - 3600, "expiry_at": now + 300, "signatures_needed": 3, "signatures_collected": 1, "executed": False},
            {"tx_id": "0.0.5002@1700000001", "type": "transfer", "created_at": now - 1800, "expiry_at": now + 7200, "signatures_needed": 2, "signatures_collected": 2, "executed": False},
            {"tx_id": "0.0.5003@1700000002", "type": "topic_create", "created_at": now - 86400, "expiry_at": now - 100, "signatures_needed": 1, "signatures_collected": 1, "executed": True},
        ]


class MultiSigCoordinatorAgent(WorkflowAgent):
    """
    Track threshold key signatures, pending approvals, stale tx cleanup.
    """

    def __init__(self):
        super().__init__("hedera_multisig_001", "Multi-Sig Coordinator", AgentDomain.HEDERA)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        accounts = context.get("multisig_accounts", self._default_accounts())
        actions: List[AgentAction] = []

        analyzed = []
        for acct in accounts:
            acct_id = acct.get("account_id", "")
            threshold = acct.get("threshold", 1)
            total_keys = acct.get("total_keys", 1)
            pending_txs = acct.get("pending_txs", 0)
            stale_txs = acct.get("stale_txs", 0)
            last_activity = acct.get("last_activity_age_hours", 0)

            health = 100
            if stale_txs > 3:
                health -= 30
            if pending_txs > 5:
                health -= 20
            if last_activity > 168:  # >1 week
                health -= 25

            entry = {
                "account_id": acct_id,
                "threshold": f"{threshold}/{total_keys}",
                "pending_txs": pending_txs,
                "stale_txs": stale_txs,
                "last_activity_hours": last_activity,
                "health_score": max(0, health),
            }
            analyzed.append(entry)

            if stale_txs > 0:
                actions.append(AgentAction(
                    action_type=ActionType.RECOMMEND,
                    title=f"Cleanup {stale_txs} stale txs on {acct_id}",
                    description=f"Stale transactions wasting resources. Threshold: {threshold}/{total_keys}",
                    params={"account_id": acct_id, "stale_count": stale_txs},
                    confidence=0.82,
                    urgency="medium",
                ))
            if pending_txs > 3:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Approval backlog on {acct_id}: {pending_txs} pending",
                    description=f"Signatures needed — {pending_txs} transactions waiting",
                    params={"account_id": acct_id, "pending": pending_txs},
                    confidence=0.80,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "accounts": analyzed,
            "total_pending": sum(a["pending_txs"] for a in analyzed),
            "total_stale": sum(a["stale_txs"] for a in analyzed),
            "actions": actions,
        }

    def _default_accounts(self) -> List[Dict]:
        return [
            {"account_id": "0.0.3001", "threshold": 2, "total_keys": 3, "pending_txs": 1, "stale_txs": 0, "last_activity_age_hours": 4},
            {"account_id": "0.0.3002", "threshold": 3, "total_keys": 5, "pending_txs": 6, "stale_txs": 4, "last_activity_age_hours": 200},
        ]


class AccountActivityProfilerAgent(WorkflowAgent):
    """
    Profile any 0.0.X account: tx frequency, token holdings, topic activity, risk score.
    """

    def __init__(self):
        super().__init__("hedera_account_001", "Account Activity Profiler", AgentDomain.HEDERA)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        account_id = context.get("account_id", "0.0.12345")
        activity = context.get("account_activity", self._default_activity())
        actions: List[AgentAction] = []

        tx_count = activity.get("tx_count_30d", 0)
        unique_counterparties = activity.get("unique_counterparties", 0)
        token_count = activity.get("token_holdings_count", 0)
        nft_count = activity.get("nft_count", 0)
        topic_subs = activity.get("topic_subscriptions", 0)
        hbar_balance = activity.get("hbar_balance", 0)
        account_age_days = activity.get("account_age_days", 0)

        # Risk scoring
        risk_score = 50  # neutral
        if tx_count > 1000:
            risk_score -= 10  # high activity = lower risk (established)
        if account_age_days < 7:
            risk_score += 20  # new account = higher risk
        if unique_counterparties < 3 and tx_count > 50:
            risk_score += 15  # interacts with few accounts but many txs
        if hbar_balance > 100_000_000_000:  # >1000 HBAR
            risk_score -= 5
        if token_count > 20:
            risk_score -= 5

        risk_score = max(0, min(100, risk_score))
        risk_level = "low" if risk_score < 30 else "medium" if risk_score < 60 else "high"

        profile = {
            "account_id": account_id,
            "tx_count_30d": tx_count,
            "unique_counterparties": unique_counterparties,
            "token_holdings": token_count,
            "nft_count": nft_count,
            "topic_subscriptions": topic_subs,
            "hbar_balance": hbar_balance,
            "account_age_days": account_age_days,
            "risk_score": risk_score,
            "risk_level": risk_level,
        }

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"Profile: {account_id} — Risk: {risk_level} ({risk_score}/100)",
            description=(
                f"30d txs: {tx_count} | Counterparties: {unique_counterparties} | "
                f"Tokens: {token_count} | Age: {account_age_days}d"
            ),
            params=profile,
            confidence=0.85,
            urgency="low" if risk_level == "low" else "medium" if risk_level == "medium" else "high",
        ))

        if risk_level == "high":
            actions.append(AgentAction(
                action_type=ActionType.ALERT,
                title=f"High-risk account: {account_id}",
                description=f"Risk score {risk_score}/100 — review recommended",
                params={"account_id": account_id, "risk_score": risk_score},
                confidence=0.80,
                urgency="high",
            ))

        return {
            "status": "completed",
            "profile": profile,
            "actions": actions,
        }

    def _default_activity(self) -> Dict:
        return {
            "tx_count_30d": 245,
            "unique_counterparties": 18,
            "token_holdings_count": 8,
            "nft_count": 3,
            "topic_subscriptions": 2,
            "hbar_balance": 50_000_000_000,
            "account_age_days": 180,
        }


def create_hedera_orchestrator() -> WorkflowOrchestrator:
    """Create the Hedera Native orchestrator with all 5 agents."""
    return WorkflowOrchestrator(
        domain=AgentDomain.HEDERA,
        agents=[
            HCSTopicOrchestratorAgent(),
            HTSTokenLifecycleAgent(),
            ScheduledTxManagerAgent(),
            MultiSigCoordinatorAgent(),
            AccountActivityProfilerAgent(),
        ],
    )
