"""
Reputation System — outcome-weighted agent scoring.

Every settled task updates the agent's reputation based on:
- Verification outcome (success/failure)
- Delivery speed vs estimate
- Bid accuracy (actual vs quoted price)
- Client satisfaction signal
"""

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ReputationRecord:
    """Single reputation event from a settled task."""
    task_id: str = ""
    outcome: str = "success"        # success | failure | partial
    score_delta: float = 0.0
    speed_ratio: float = 1.0        # actual_time / estimated_time
    cost_ratio: float = 1.0         # settlement / bid
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "outcome": self.outcome,
            "score_delta": round(self.score_delta, 4),
            "speed_ratio": round(self.speed_ratio, 2),
            "cost_ratio": round(self.cost_ratio, 2),
            "timestamp": self.timestamp,
        }


@dataclass
class AgentReputation:
    """Aggregate reputation for one agent."""
    agent_id: str = ""
    display_name: str = ""
    domain: str = "general"
    score: float = 1000.0           # ELO-style, starts at 1000
    total_tasks: int = 0
    successful_tasks: int = 0
    failed_tasks: int = 0
    total_earned_hbar: float = 0.0
    avg_speed_ratio: float = 1.0
    avg_cost_ratio: float = 1.0
    streak: int = 0                 # consecutive successes (negative = failures)
    history: List[ReputationRecord] = field(default_factory=list)
    registered_at: float = field(default_factory=time.time)

    @property
    def success_rate(self) -> float:
        if self.total_tasks == 0:
            return 0.0
        return self.successful_tasks / self.total_tasks

    @property
    def tier(self) -> str:
        if self.score >= 1500:
            return "elite"
        if self.score >= 1200:
            return "trusted"
        if self.score >= 1000:
            return "standard"
        if self.score >= 800:
            return "probation"
        return "restricted"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "display_name": self.display_name,
            "domain": self.domain,
            "score": round(self.score, 1),
            "tier": self.tier,
            "total_tasks": self.total_tasks,
            "successful_tasks": self.successful_tasks,
            "failed_tasks": self.failed_tasks,
            "success_rate": round(self.success_rate, 3),
            "total_earned_hbar": round(self.total_earned_hbar, 4),
            "avg_speed_ratio": round(self.avg_speed_ratio, 2),
            "streak": self.streak,
            "registered_at": self.registered_at,
        }


class ReputationEngine:
    """
    Manages agent reputations across the marketplace.

    Score updates use an ELO-inspired formula:
      - Base delta: +25 for success, -30 for failure (asymmetric to penalize failures)
      - Speed bonus: up to +10 for fast delivery
      - Streak multiplier: consecutive wins boost gains
      - Floor: score cannot go below 100
    """

    BASE_WIN = 25.0
    BASE_LOSS = -30.0
    SPEED_BONUS_MAX = 10.0
    STREAK_MULTIPLIER = 0.05  # 5% per streak level
    SCORE_FLOOR = 100.0
    SCORE_CEILING = 2500.0

    def __init__(self):
        self._agents: Dict[str, AgentReputation] = {}

    def register_agent(
        self,
        agent_id: str,
        display_name: str = "",
        domain: str = "general",
        initial_score: float = 1000.0,
    ) -> AgentReputation:
        if agent_id in self._agents:
            return self._agents[agent_id]
        rep = AgentReputation(
            agent_id=agent_id,
            display_name=display_name or agent_id,
            domain=domain,
            score=initial_score,
        )
        self._agents[agent_id] = rep
        return rep

    def record_outcome(
        self,
        agent_id: str,
        task_id: str,
        outcome: str = "success",
        earned_hbar: float = 0.0,
        actual_time_s: float = 0.0,
        estimated_time_s: float = 0.0,
        settlement_amount: float = 0.0,
        bid_amount: float = 0.0,
    ) -> ReputationRecord:
        rep = self._agents.get(agent_id)
        if not rep:
            rep = self.register_agent(agent_id)

        speed_ratio = (actual_time_s / max(estimated_time_s, 1)) if estimated_time_s > 0 else 1.0
        cost_ratio = (settlement_amount / max(bid_amount, 0.001)) if bid_amount > 0 else 1.0

        # Calculate score delta
        if outcome == "success":
            delta = self.BASE_WIN
            # Speed bonus: deliver faster than estimate = bonus
            if speed_ratio < 1.0:
                delta += self.SPEED_BONUS_MAX * (1.0 - speed_ratio)
            # Streak bonus
            if rep.streak > 0:
                delta *= (1.0 + self.STREAK_MULTIPLIER * min(rep.streak, 10))
            rep.successful_tasks += 1
            rep.streak = max(1, rep.streak + 1)
        elif outcome == "failure":
            delta = self.BASE_LOSS
            # Streak penalty
            if rep.streak < 0:
                delta *= (1.0 + self.STREAK_MULTIPLIER * min(abs(rep.streak), 10))
            rep.failed_tasks += 1
            rep.streak = min(-1, rep.streak - 1)
        else:  # partial
            delta = self.BASE_WIN * 0.4
            rep.successful_tasks += 1
            rep.streak = 0

        rep.score = max(self.SCORE_FLOOR, min(self.SCORE_CEILING, rep.score + delta))
        rep.total_tasks += 1
        rep.total_earned_hbar += earned_hbar

        # Running averages
        n = rep.total_tasks
        rep.avg_speed_ratio = ((rep.avg_speed_ratio * (n - 1)) + speed_ratio) / n
        rep.avg_cost_ratio = ((rep.avg_cost_ratio * (n - 1)) + cost_ratio) / n

        record = ReputationRecord(
            task_id=task_id,
            outcome=outcome,
            score_delta=delta,
            speed_ratio=speed_ratio,
            cost_ratio=cost_ratio,
        )
        rep.history.append(record)

        # Trim history
        if len(rep.history) > 200:
            rep.history = rep.history[-100:]

        return record

    def get_agent(self, agent_id: str) -> Optional[AgentReputation]:
        return self._agents.get(agent_id)

    def leaderboard(self, limit: int = 20, domain: str = None) -> List[Dict[str, Any]]:
        agents = list(self._agents.values())
        if domain:
            agents = [a for a in agents if a.domain == domain]
        agents.sort(key=lambda a: a.score, reverse=True)
        return [
            {**a.to_dict(), "rank": i + 1}
            for i, a in enumerate(agents[:limit])
        ]

    def stats(self) -> Dict[str, Any]:
        agents = list(self._agents.values())
        return {
            "total_agents": len(agents),
            "avg_score": round(sum(a.score for a in agents) / max(len(agents), 1), 1),
            "total_tasks_completed": sum(a.total_tasks for a in agents),
            "total_earned_hbar": round(sum(a.total_earned_hbar for a in agents), 4),
            "by_tier": {
                tier: sum(1 for a in agents if a.tier == tier)
                for tier in ("elite", "trusted", "standard", "probation", "restricted")
            },
        }
