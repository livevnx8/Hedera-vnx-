"""
Carbon/ESG Compliance Agents — 5 specialists for carbon credit verification,
retirement tracking, ESG scoring, sustainability reporting, and green token monitoring.
"""

import hashlib
import json
import time
from typing import Any, Dict, List

from .base_agent import (
    AgentAction,
    ActionType,
    AgentDomain,
    WorkflowAgent,
    WorkflowOrchestrator,
)


class CarbonCreditVerifierAgent(WorkflowAgent):
    """
    Validates carbon credit metadata, checks retirement status, flags suspicious credits.
    """

    def __init__(self):
        super().__init__("carbon_verify_001", "Carbon Credit Verifier", AgentDomain.CARBON)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        credits = context.get("credits", self._default_credits())
        actions: List[AgentAction] = []
        verified = []

        for credit in credits:
            cid = credit.get("credit_id", "unknown")
            vintage = credit.get("vintage_year", 0)
            registry = credit.get("registry", "unknown")
            tonnes = credit.get("tonnes_co2", 0)
            retired = credit.get("retired", False)
            methodology = credit.get("methodology", "unknown")

            # Verification checks
            issues: List[str] = []
            score = 100

            if vintage < 2020:
                issues.append(f"Old vintage ({vintage}) — may not meet current standards")
                score -= 20
            if registry not in ("verra", "gold_standard", "dovu", "puro"):
                issues.append(f"Unrecognized registry: {registry}")
                score -= 30
            if tonnes <= 0:
                issues.append("Invalid tonnage")
                score -= 50
            if methodology == "unknown":
                issues.append("Missing methodology")
                score -= 15

            status = "verified" if score >= 70 else "flagged" if score >= 40 else "rejected"

            entry = {
                "credit_id": cid,
                "vintage_year": vintage,
                "registry": registry,
                "tonnes_co2": tonnes,
                "retired": retired,
                "methodology": methodology,
                "verification_score": max(0, score),
                "status": status,
                "issues": issues,
            }
            verified.append(entry)

            if status == "flagged":
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Flagged credit: {cid}",
                    description=f"Score {score}/100 — issues: {', '.join(issues)}",
                    params={"credit_id": cid, "score": score, "issues": issues},
                    confidence=0.82,
                    urgency="high",
                ))
            elif status == "rejected":
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Rejected credit: {cid}",
                    description=f"Score {score}/100 — {', '.join(issues)}",
                    params={"credit_id": cid, "score": score},
                    confidence=0.92,
                    urgency="critical",
                ))

        return {
            "status": "completed",
            "credits_analyzed": len(credits),
            "verified": sum(1 for v in verified if v["status"] == "verified"),
            "flagged": sum(1 for v in verified if v["status"] == "flagged"),
            "rejected": sum(1 for v in verified if v["status"] == "rejected"),
            "results": verified,
            "actions": actions,
        }

    def _default_credits(self) -> List[Dict]:
        return [
            {"credit_id": "VCS-2024-001", "vintage_year": 2024, "registry": "verra", "tonnes_co2": 100, "retired": False, "methodology": "ARR"},
            {"credit_id": "DOVU-2023-042", "vintage_year": 2023, "registry": "dovu", "tonnes_co2": 50, "retired": True, "methodology": "soil_carbon"},
            {"credit_id": "UNKNOWN-2018-X", "vintage_year": 2018, "registry": "unknown", "tonnes_co2": 200, "retired": False, "methodology": "unknown"},
        ]


class RetirementTrackerAgent(WorkflowAgent):
    """
    Monitors carbon retirement transactions on Hedera, tracks offset totals.
    """

    def __init__(self):
        super().__init__("carbon_retire_001", "Retirement Tracker", AgentDomain.CARBON)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        retirements = context.get("retirements", self._default_retirements())
        actions: List[AgentAction] = []

        total_retired = 0
        by_registry: Dict[str, float] = {}
        by_year: Dict[int, float] = {}

        for r in retirements:
            tonnes = r.get("tonnes_co2", 0)
            registry = r.get("registry", "unknown")
            year = r.get("year", 2024)

            total_retired += tonnes
            by_registry[registry] = by_registry.get(registry, 0) + tonnes
            by_year[year] = by_year.get(year, 0) + tonnes

        # Generate certificate data
        cert_hash = hashlib.sha256(json.dumps({
            "total_retired": total_retired,
            "retirements": len(retirements),
            "timestamp": time.time(),
        }, sort_keys=True).encode()).hexdigest()

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"Retirement summary: {total_retired:.1f} tCO2 offset",
            description=(
                f"{len(retirements)} retirements across "
                f"{len(by_registry)} registries. Certificate hash: {cert_hash[:16]}..."
            ),
            params={
                "total_tonnes": total_retired,
                "by_registry": by_registry,
                "certificate_hash": cert_hash,
            },
            confidence=0.95,
            urgency="low",
        ))

        return {
            "status": "completed",
            "total_retired_tonnes": total_retired,
            "retirement_count": len(retirements),
            "by_registry": by_registry,
            "by_year": by_year,
            "certificate_hash": cert_hash,
            "actions": actions,
        }

    def _default_retirements(self) -> List[Dict]:
        return [
            {"credit_id": "VCS-2024-001", "tonnes_co2": 100, "registry": "verra", "year": 2024, "tx_hash": "0x...a1"},
            {"credit_id": "DOVU-2023-042", "tonnes_co2": 50, "registry": "dovu", "year": 2023, "tx_hash": "0x...b2"},
            {"credit_id": "GS-2024-010", "tonnes_co2": 75, "registry": "gold_standard", "year": 2024, "tx_hash": "0x...c3"},
        ]


class ESGScoreCalculatorAgent(WorkflowAgent):
    """
    Computes ESG score for wallets/projects based on on-chain activity.
    """

    def __init__(self):
        super().__init__("esg_score_001", "ESG Score Calculator", AgentDomain.CARBON)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        entity_id = context.get("entity_id", "0.0.12345")
        activity = context.get("activity", self._default_activity())
        actions: List[AgentAction] = []

        # Environmental score (0–100)
        carbon_retired = activity.get("carbon_retired_tonnes", 0)
        green_token_pct = activity.get("green_token_holdings_pct", 0)
        env_score = min(100, carbon_retired * 2 + green_token_pct * 0.5)

        # Social score
        community_txs = activity.get("community_transactions", 0)
        governance_votes = activity.get("governance_votes", 0)
        social_score = min(100, community_txs * 0.5 + governance_votes * 5)

        # Governance score
        transparency = activity.get("transparency_score", 50)
        audit_count = activity.get("audits_passed", 0)
        gov_score = min(100, transparency + audit_count * 10)

        composite = round((env_score * 0.4 + social_score * 0.3 + gov_score * 0.3), 1)

        grade = "A" if composite >= 80 else "B" if composite >= 60 else "C" if composite >= 40 else "D"

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"ESG Grade: {grade} ({composite}/100)",
            description=(
                f"E: {env_score:.0f} | S: {social_score:.0f} | G: {gov_score:.0f}"
            ),
            params={
                "entity_id": entity_id,
                "composite_score": composite,
                "grade": grade,
                "environmental": round(env_score, 1),
                "social": round(social_score, 1),
                "governance": round(gov_score, 1),
            },
            confidence=0.85,
            urgency="low",
        ))

        if composite < 40:
            actions.append(AgentAction(
                action_type=ActionType.ALERT,
                title=f"Low ESG score for {entity_id}",
                description=f"Score {composite}/100 (Grade D) — compliance risk",
                params={"entity_id": entity_id, "score": composite},
                confidence=0.80,
                urgency="high",
            ))

        return {
            "status": "completed",
            "entity_id": entity_id,
            "composite_score": composite,
            "grade": grade,
            "environmental": round(env_score, 1),
            "social": round(social_score, 1),
            "governance": round(gov_score, 1),
            "actions": actions,
        }

    def _default_activity(self) -> Dict:
        return {
            "carbon_retired_tonnes": 25,
            "green_token_holdings_pct": 30,
            "community_transactions": 45,
            "governance_votes": 8,
            "transparency_score": 65,
            "audits_passed": 2,
        }


class SustainabilityReporterAgent(WorkflowAgent):
    """
    Auto-generates sustainability compliance reports from on-chain data.
    """

    def __init__(self):
        super().__init__("esg_report_001", "Sustainability Reporter", AgentDomain.CARBON)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        entity_id = context.get("entity_id", "0.0.12345")
        period = context.get("period", "2024-Q1")
        actions: List[AgentAction] = []

        # Build report from context or defaults
        carbon_data = context.get("carbon_data", {
            "retired_tonnes": 225,
            "purchased_tonnes": 300,
            "pending_tonnes": 75,
        })
        esg_data = context.get("esg_data", {
            "composite_score": 72.5,
            "grade": "B",
        })

        report = {
            "entity_id": entity_id,
            "period": period,
            "generated_at": time.time(),
            "sections": {
                "carbon_offset": {
                    "total_retired": carbon_data.get("retired_tonnes", 0),
                    "total_purchased": carbon_data.get("purchased_tonnes", 0),
                    "net_position": carbon_data.get("retired_tonnes", 0) - carbon_data.get("purchased_tonnes", 0),
                    "pending": carbon_data.get("pending_tonnes", 0),
                },
                "esg_rating": esg_data,
                "compliance": {
                    "meets_paris_agreement": carbon_data.get("retired_tonnes", 0) > 100,
                    "reporting_complete": True,
                    "third_party_verified": carbon_data.get("retired_tonnes", 0) > 50,
                },
            },
            "report_hash": "",
        }

        report["report_hash"] = hashlib.sha256(
            json.dumps(report["sections"], sort_keys=True, default=str).encode()
        ).hexdigest()

        actions.append(AgentAction(
            action_type=ActionType.INFORM,
            title=f"Sustainability report generated: {period}",
            description=(
                f"Entity {entity_id} | {carbon_data.get('retired_tonnes', 0)} tCO2 retired | "
                f"ESG Grade: {esg_data.get('grade', 'N/A')} | Hash: {report['report_hash'][:16]}..."
            ),
            params={
                "entity_id": entity_id,
                "period": period,
                "report_hash": report["report_hash"],
            },
            confidence=0.92,
            urgency="low",
        ))

        return {
            "status": "completed",
            "report": report,
            "actions": actions,
        }


class GreenTokenMonitorAgent(WorkflowAgent):
    """
    Tracks green-tagged HTS tokens (DOVU, carbon NFTs), supply and price.
    """

    def __init__(self):
        super().__init__("carbon_token_001", "Green Token Monitor", AgentDomain.CARBON)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        tokens = context.get("green_tokens", self._default_tokens())
        actions: List[AgentAction] = []

        analyzed = []
        for token in tokens:
            name = token.get("name", "Unknown")
            supply = token.get("total_supply", 0)
            supply_change_24h = token.get("supply_change_24h_pct", 0)
            price = token.get("price_usd", 0)
            price_change_24h = token.get("price_change_24h_pct", 0)
            volume = token.get("volume_24h", 0)

            entry = {
                "name": name,
                "token_id": token.get("token_id", ""),
                "total_supply": supply,
                "supply_change_24h_pct": supply_change_24h,
                "price_usd": price,
                "price_change_24h_pct": price_change_24h,
                "volume_24h": volume,
                "market_cap": price * supply,
            }
            analyzed.append(entry)

            if supply_change_24h > 10:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Supply spike: {name} (+{supply_change_24h:.1f}%)",
                    description=f"Large mint event — verify legitimacy",
                    params={"token": name, "supply_change": supply_change_24h},
                    confidence=0.78,
                    urgency="high",
                ))
            if price_change_24h < -20:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Price crash: {name} ({price_change_24h:+.1f}%)",
                    description=f"Significant green token devaluation",
                    params={"token": name, "price_change": price_change_24h},
                    confidence=0.82,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "tokens": analyzed,
            "total_market_cap": sum(t["market_cap"] for t in analyzed),
            "actions": actions,
        }

    def _default_tokens(self) -> List[Dict]:
        return [
            {"name": "DOVU", "token_id": "0.0.456858", "total_supply": 1_000_000_000, "supply_change_24h_pct": 0.1, "price_usd": 0.0008, "price_change_24h_pct": 3.5, "volume_24h": 12_000},
            {"name": "HBAR Carbon NFT", "token_id": "0.0.999001", "total_supply": 10_000, "supply_change_24h_pct": 15.0, "price_usd": 5.20, "price_change_24h_pct": -2.1, "volume_24h": 800},
        ]


def create_carbon_orchestrator() -> WorkflowOrchestrator:
    """Create the Carbon/ESG orchestrator with all 5 agents."""
    return WorkflowOrchestrator(
        domain=AgentDomain.CARBON,
        agents=[
            CarbonCreditVerifierAgent(),
            RetirementTrackerAgent(),
            ESGScoreCalculatorAgent(),
            SustainabilityReporterAgent(),
            GreenTokenMonitorAgent(),
        ],
    )
