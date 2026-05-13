"""
Extended base agent class for specialized workflow agents.

Builds on BaseVNXSpecialist patterns with:
- Multi-step workflow state tracking
- Typed action recommendations
- Proof hash generation for HCS anchoring
- Step-level logging and timing
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class AgentDomain(str, Enum):
    DEFI = "defi"
    CARBON = "carbon"
    RISK = "risk"
    HEDERA = "hedera"
    INTEL = "intel"
    OPS = "ops"


class ActionType(str, Enum):
    INFORM = "inform"           # Provide information / analysis
    RECOMMEND = "recommend"     # Suggest an action
    EXECUTE = "execute"         # Take an action (requires approval)
    ALERT = "alert"             # Critical alert requiring attention


@dataclass
class AgentAction:
    """A typed action recommendation from an agent."""
    action_type: ActionType = ActionType.INFORM
    title: str = ""
    description: str = ""
    params: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    urgency: str = "low"       # low | medium | high | critical
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_type": self.action_type.value,
            "title": self.title,
            "description": self.description,
            "params": self.params,
            "confidence": round(self.confidence, 4),
            "urgency": self.urgency,
            "timestamp": self.timestamp,
        }


@dataclass
class WorkflowStep:
    """One step in a multi-agent workflow."""
    step_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    agent_id: str = ""
    name: str = ""
    status: str = "pending"    # pending | running | completed | failed
    input_data: Dict[str, Any] = field(default_factory=dict)
    output_data: Dict[str, Any] = field(default_factory=dict)
    started_at: float = 0.0
    completed_at: float = 0.0
    duration_ms: float = 0.0
    proof_hash: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_id": self.step_id,
            "agent_id": self.agent_id,
            "name": self.name,
            "status": self.status,
            "duration_ms": round(self.duration_ms, 2),
            "proof_hash": self.proof_hash,
            "output_data": self.output_data,
        }


class WorkflowAgent:
    """
    Base class for specialized workflow agents.

    Every agent:
    1. Receives context (portfolio state, market data, oracle signals)
    2. Runs analysis → produces typed AgentActions
    3. Generates a proof hash of its output for HCS anchoring
    """

    _event_bus = None  # Set by WorkflowEngine when event bus is active

    def __init__(self, agent_id: str, name: str, domain: AgentDomain):
        self.agent_id = agent_id
        self.name = name
        self.domain = domain
        self.status = "idle"
        self.last_run = 0.0
        self.run_count = 0
        self.total_actions = 0
        self.alert_threshold = 0.7

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute agent analysis. Override in subclass."""
        raise NotImplementedError

    def execute(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run with timing, proof hashing, and state tracking."""
        self.status = "running"
        start = time.time()
        context = context or {}

        try:
            result = self.run(context)
            result["agent_id"] = self.agent_id
            result["agent_name"] = self.name
            result["domain"] = self.domain.value
            result["timestamp"] = time.time()
            result["proof_hash"] = self._proof_hash(result)

            actions = result.get("actions", [])
            self.total_actions += len(actions)
            self.run_count += 1
            self.last_run = time.time()
            self.status = "idle"

            result["latency_ms"] = round((time.time() - start) * 1000, 2)

            # Emit event for event-driven triggers
            if WorkflowAgent._event_bus is not None:
                WorkflowAgent._event_bus.emit(
                    f"{self.domain.value}.{self.agent_id}", result
                )

            return result

        except Exception as e:
            self.status = "error"
            return {
                "agent_id": self.agent_id,
                "agent_name": self.name,
                "domain": self.domain.value,
                "status": "error",
                "error": str(e),
                "timestamp": time.time(),
            }

    def _proof_hash(self, result: Dict[str, Any]) -> str:
        """Generate SHA-256 proof of agent output for HCS anchoring."""
        payload = json.dumps({
            "agent_id": self.agent_id,
            "timestamp": result.get("timestamp", 0),
            "actions": [a.to_dict() if hasattr(a, 'to_dict') else a
                        for a in result.get("actions", [])],
        }, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()

    def info(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "domain": self.domain.value,
            "status": self.status,
            "run_count": self.run_count,
            "total_actions": self.total_actions,
            "last_run": self.last_run,
        }


class WorkflowOrchestrator:
    """
    Orchestrates a domain of workflow agents.

    Runs all agents in a domain, aggregates results, and produces
    a domain-level health report with actions and alerts.
    """

    def __init__(self, domain: AgentDomain, agents: List[WorkflowAgent]):
        self.domain = domain
        self.agents = agents
        self.run_count = 0
        self.total_alerts = 0

    def run_all(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute all agents and aggregate results."""
        start = time.time()
        context = context or {}
        results = []
        all_actions = []

        for agent in self.agents:
            result = agent.execute(context)
            results.append(result)
            actions = result.get("actions", [])
            if isinstance(actions, list):
                all_actions.extend(
                    a.to_dict() if hasattr(a, 'to_dict') else a for a in actions
                )

        self.run_count += 1

        # Count by urgency
        critical = sum(1 for a in all_actions if a.get("urgency") == "critical")
        high = sum(1 for a in all_actions if a.get("urgency") == "high")
        self.total_alerts = critical + high

        return {
            "domain": self.domain.value,
            "status": "critical" if critical > 0 else "warning" if high > 0 else "healthy",
            "agents_total": len(self.agents),
            "agents_succeeded": sum(1 for r in results if r.get("status") != "error"),
            "total_actions": len(all_actions),
            "critical_actions": critical,
            "high_actions": high,
            "actions": all_actions[:20],
            "agent_results": results,
            "run_count": self.run_count,
            "latency_ms": round((time.time() - start) * 1000, 2),
        }

    def get_agent(self, agent_id: str) -> Optional[WorkflowAgent]:
        return next((a for a in self.agents if a.agent_id == agent_id), None)

    def list_agents(self) -> List[Dict[str, Any]]:
        return [a.info() for a in self.agents]


class WorkflowEngine:
    """
    Unified engine that runs multi-step agent pipelines.

    Chains agents across domains into workflows:
      e.g. "assess risk → size position → route swap"
    """

    def __init__(self):
        self._orchestrators: Dict[str, WorkflowOrchestrator] = {}
        self._workflow_history: List[Dict[str, Any]] = []

    def register(self, orchestrator: WorkflowOrchestrator):
        self._orchestrators[orchestrator.domain.value] = orchestrator

    def run_domain(self, domain: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run all agents in a single domain."""
        orch = self._orchestrators.get(domain)
        if not orch:
            raise KeyError(f"Unknown domain: {domain}")
        return orch.run_all(context)

    def run_pipeline(
        self,
        steps: List[Dict[str, str]],
        initial_context: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """
        Run a multi-step pipeline across domains.

        steps: [{"domain": "risk", "agent": "risk_size_001"}, ...]
        Each step's output feeds into the next step's context.
        """
        context = dict(initial_context or {})
        pipeline_id = uuid.uuid4().hex[:12]
        executed_steps: List[WorkflowStep] = []
        start = time.time()

        for step_def in steps:
            domain = step_def.get("domain", "")
            agent_id = step_def.get("agent", "")

            orch = self._orchestrators.get(domain)
            if not orch:
                executed_steps.append(WorkflowStep(
                    agent_id=agent_id, name=f"{domain}/{agent_id}",
                    status="failed", output_data={"error": f"Unknown domain: {domain}"},
                ))
                continue

            agent = orch.get_agent(agent_id)
            if not agent:
                executed_steps.append(WorkflowStep(
                    agent_id=agent_id, name=f"{domain}/{agent_id}",
                    status="failed", output_data={"error": f"Unknown agent: {agent_id}"},
                ))
                continue

            ws = WorkflowStep(agent_id=agent_id, name=agent.name)
            ws.status = "running"
            ws.started_at = time.time()
            ws.input_data = {k: str(v)[:200] for k, v in context.items()}

            result = agent.execute(context)

            ws.completed_at = time.time()
            ws.duration_ms = (ws.completed_at - ws.started_at) * 1000
            ws.output_data = result
            ws.proof_hash = result.get("proof_hash", "")
            ws.status = "completed" if result.get("status") != "error" else "failed"

            executed_steps.append(ws)

            # Feed output into next step's context
            context["previous_step"] = result
            for action in result.get("actions", []):
                a = action.to_dict() if hasattr(action, 'to_dict') else action
                context.update(a.get("params", {}))

        record = {
            "pipeline_id": pipeline_id,
            "steps": [s.to_dict() for s in executed_steps],
            "total_steps": len(steps),
            "completed_steps": sum(1 for s in executed_steps if s.status == "completed"),
            "failed_steps": sum(1 for s in executed_steps if s.status == "failed"),
            "latency_ms": round((time.time() - start) * 1000, 2),
        }
        self._workflow_history.append(record)
        return record

    def run_all(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run all domains."""
        results = {}
        for domain, orch in self._orchestrators.items():
            results[domain] = orch.run_all(context)
        return {
            "domains": len(results),
            "results": results,
        }

    def stats(self) -> Dict[str, Any]:
        return {
            "domains": list(self._orchestrators.keys()),
            "total_agents": sum(
                len(o.agents) for o in self._orchestrators.values()
            ),
            "total_runs": sum(
                o.run_count for o in self._orchestrators.values()
            ),
            "total_pipelines": len(self._workflow_history),
        }

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._workflow_history[-limit:]))
