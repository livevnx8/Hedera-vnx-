"""
Advanced workflow engine extensions:
- Conditional branching in pipelines
- Event bus with pub/sub
- Event-driven triggers that auto-fire pipelines
- Cron-style and interval-based agent scheduling
"""

import operator
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


# ──────────────────────────────────────────────────────────────
# Event Bus — lightweight in-process pub/sub
# ──────────────────────────────────────────────────────────────

class EventBus:
    """In-process event bus. Agents emit events; triggers subscribe."""

    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._history: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def subscribe(self, pattern: str, callback: Callable):
        """Subscribe to events matching a pattern (supports '*' glob)."""
        with self._lock:
            self._subscribers.setdefault(pattern, []).append(callback)

    def unsubscribe(self, pattern: str, callback: Callable):
        with self._lock:
            subs = self._subscribers.get(pattern, [])
            if callback in subs:
                subs.remove(callback)

    def emit(self, event_name: str, data: Dict[str, Any]):
        """Emit an event. Matched subscribers fire synchronously."""
        record = {
            "event": event_name,
            "timestamp": time.time(),
            "data_keys": list(data.keys()),
        }
        with self._lock:
            self._history.append(record)
            if len(self._history) > 500:
                self._history = self._history[-250:]

        for pattern, callbacks in list(self._subscribers.items()):
            if self._matches(pattern, event_name):
                for cb in callbacks:
                    try:
                        cb(event_name, data)
                    except Exception:
                        pass  # Don't let subscriber errors crash the bus

    def _matches(self, pattern: str, event: str) -> bool:
        if pattern == "*":
            return True
        if "*" in pattern:
            regex = pattern.replace(".", r"\.").replace("*", ".*")
            return bool(re.match(f"^{regex}$", event))
        return pattern == event

    def stats(self) -> Dict[str, Any]:
        return {
            "subscribers": {p: len(cbs) for p, cbs in self._subscribers.items()},
            "total_events": len(self._history),
        }

    def recent_events(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._history[-limit:]))


# ──────────────────────────────────────────────────────────────
# Condition Evaluator — safe expression eval for branching
# ──────────────────────────────────────────────────────────────

_OPS = {
    "==": operator.eq,
    "!=": operator.ne,
    ">": operator.gt,
    "<": operator.lt,
    ">=": operator.ge,
    "<=": operator.le,
    "in": lambda a, b: a in b,
}

# Pattern: "field_name op value"
_COND_RE = re.compile(
    r"^(\w+(?:\.\w+)*)\s*(==|!=|>=|<=|>|<|in)\s*(.+)$"
)


def evaluate_condition(condition: str, data: Dict[str, Any]) -> bool:
    """
    Evaluate a simple condition against data.

    Supports: field == value, field > 0.5, field in ['a','b'], etc.
    Nested fields via dot notation: actions.0.urgency == 'critical'
    """
    m = _COND_RE.match(condition.strip())
    if not m:
        return False

    field_path, op_str, raw_value = m.group(1), m.group(2), m.group(3).strip()

    # Resolve field
    obj = data
    for part in field_path.split("."):
        if isinstance(obj, dict):
            obj = obj.get(part)
        elif isinstance(obj, (list, tuple)):
            try:
                obj = obj[int(part)]
            except (IndexError, ValueError):
                return False
        else:
            return False
        if obj is None:
            return False

    # Parse target value
    target = _parse_value(raw_value)

    try:
        return _OPS[op_str](obj, target)
    except (TypeError, KeyError):
        return False


def _parse_value(raw: str) -> Any:
    """Parse a string literal into a Python value."""
    s = raw.strip()
    if s.startswith("'") and s.endswith("'"):
        return s[1:-1]
    if s.startswith('"') and s.endswith('"'):
        return s[1:-1]
    if s.lower() == "true":
        return True
    if s.lower() == "false":
        return False
    if s.lower() == "none":
        return None
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    # Lists: [a, b, c]
    if s.startswith("[") and s.endswith("]"):
        items = [_parse_value(x.strip()) for x in s[1:-1].split(",") if x.strip()]
        return items
    return s


# ──────────────────────────────────────────────────────────────
# Event Trigger — auto-fire pipelines on events
# ──────────────────────────────────────────────────────────────

@dataclass
class EventTrigger:
    """Fires a pipeline when an event condition is met."""
    trigger_id: str = field(default_factory=lambda: uuid.uuid4().hex[:10])
    name: str = ""
    event_pattern: str = "*"           # e.g. "risk.*", "intel.intel_whale_001"
    condition: str = ""                # e.g. "drawdown_pct > 20"
    pipeline_steps: List[Dict[str, str]] = field(default_factory=list)
    enabled: bool = True
    fire_count: int = 0
    last_fired: float = 0.0
    cooldown_seconds: float = 60.0     # Min time between firings

    def to_dict(self) -> Dict[str, Any]:
        return {
            "trigger_id": self.trigger_id,
            "name": self.name,
            "event_pattern": self.event_pattern,
            "condition": self.condition,
            "pipeline_steps": self.pipeline_steps,
            "enabled": self.enabled,
            "fire_count": self.fire_count,
            "last_fired": self.last_fired,
            "cooldown_seconds": self.cooldown_seconds,
        }


class TriggerManager:
    """Manages event triggers and wires them to the event bus."""

    def __init__(self, event_bus: EventBus, run_pipeline_fn: Callable):
        self.event_bus = event_bus
        self.run_pipeline = run_pipeline_fn
        self._triggers: Dict[str, EventTrigger] = {}
        self._results: List[Dict[str, Any]] = []
        event_bus.subscribe("*", self._on_event)

    def register(self, trigger: EventTrigger):
        self._triggers[trigger.trigger_id] = trigger

    def unregister(self, trigger_id: str):
        self._triggers.pop(trigger_id, None)

    def _on_event(self, event_name: str, data: Dict[str, Any]):
        now = time.time()
        for trigger in list(self._triggers.values()):
            if not trigger.enabled:
                continue
            if not self.event_bus._matches(trigger.event_pattern, event_name):
                continue
            if now - trigger.last_fired < trigger.cooldown_seconds:
                continue
            if trigger.condition and not evaluate_condition(trigger.condition, data):
                continue

            # Fire!
            trigger.fire_count += 1
            trigger.last_fired = now
            try:
                result = self.run_pipeline(trigger.pipeline_steps, data)
                self._results.append({
                    "trigger_id": trigger.trigger_id,
                    "name": trigger.name,
                    "event": event_name,
                    "timestamp": now,
                    "result": result,
                })
            except Exception as e:
                self._results.append({
                    "trigger_id": trigger.trigger_id,
                    "name": trigger.name,
                    "event": event_name,
                    "timestamp": now,
                    "error": str(e),
                })

            if len(self._results) > 200:
                self._results = self._results[-100:]

    def list_triggers(self) -> List[Dict[str, Any]]:
        return [t.to_dict() for t in self._triggers.values()]

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._results[-limit:]))

    def stats(self) -> Dict[str, Any]:
        return {
            "total_triggers": len(self._triggers),
            "active_triggers": sum(1 for t in self._triggers.values() if t.enabled),
            "total_firings": sum(t.fire_count for t in self._triggers.values()),
        }


# ──────────────────────────────────────────────────────────────
# Conditional Pipeline Steps
# ──────────────────────────────────────────────────────────────

def resolve_pipeline_steps(
    steps: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> List[Dict[str, str]]:
    """
    Flatten a pipeline that may contain branch steps.

    A branch step looks like:
    {
        "type": "branch",
        "condition": "drawdown_status == 'critical'",
        "if_true":  [{"domain": "risk", "agent": "risk_stop_001"}],
        "if_false": [{"domain": "risk", "agent": "risk_rebal_001"}],
    }

    Normal steps are passed through unchanged.
    """
    flat: List[Dict[str, str]] = []
    for step in steps:
        if step.get("type") == "branch":
            cond = step.get("condition", "")
            if evaluate_condition(cond, context):
                branch_steps = step.get("if_true", [])
            else:
                branch_steps = step.get("if_false", [])
            # Recursive — branches can contain branches
            flat.extend(resolve_pipeline_steps(branch_steps, context))
        else:
            flat.append(step)
    return flat


# ──────────────────────────────────────────────────────────────
# Agent Scheduler — cron-style + interval scheduling
# ──────────────────────────────────────────────────────────────

@dataclass
class ScheduleEntry:
    """A scheduled agent or pipeline run."""
    schedule_id: str = field(default_factory=lambda: uuid.uuid4().hex[:10])
    name: str = ""
    interval_seconds: float = 0          # 0 = disabled interval
    cron: str = ""                       # Simple cron: "M H D Mo DoW" (not used in MVP, placeholder)
    pipeline_steps: List[Dict[str, str]] = field(default_factory=list)
    domain: str = ""                     # If set, run entire domain instead of pipeline
    enabled: bool = True
    run_count: int = 0
    last_run: float = 0.0
    next_run: float = 0.0
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schedule_id": self.schedule_id,
            "name": self.name,
            "interval_seconds": self.interval_seconds,
            "cron": self.cron,
            "domain": self.domain,
            "pipeline_steps": self.pipeline_steps,
            "enabled": self.enabled,
            "run_count": self.run_count,
            "last_run": self.last_run,
            "next_run": self.next_run,
        }


class AgentScheduler:
    """
    Lightweight scheduler for periodic agent/pipeline runs.

    Uses a background thread that checks every second for due tasks.
    """

    def __init__(self, run_pipeline_fn: Callable, run_domain_fn: Callable):
        self.run_pipeline = run_pipeline_fn
        self.run_domain = run_domain_fn
        self._schedules: Dict[str, ScheduleEntry] = {}
        self._results: List[Dict[str, Any]] = []
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def register(self, entry: ScheduleEntry):
        if entry.interval_seconds > 0 and entry.next_run == 0:
            entry.next_run = time.time() + entry.interval_seconds
        with self._lock:
            self._schedules[entry.schedule_id] = entry

    def unregister(self, schedule_id: str):
        with self._lock:
            self._schedules.pop(schedule_id, None)

    def start(self):
        """Start the background scheduler thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)

    def _loop(self):
        while self._running:
            now = time.time()
            with self._lock:
                due = [
                    s for s in self._schedules.values()
                    if s.enabled and s.interval_seconds > 0 and now >= s.next_run
                ]

            for entry in due:
                try:
                    if entry.domain:
                        result = self.run_domain(entry.domain, entry.context)
                    elif entry.pipeline_steps:
                        result = self.run_pipeline(entry.pipeline_steps, entry.context)
                    else:
                        continue

                    entry.run_count += 1
                    entry.last_run = now
                    entry.next_run = now + entry.interval_seconds

                    self._results.append({
                        "schedule_id": entry.schedule_id,
                        "name": entry.name,
                        "timestamp": now,
                        "status": "completed",
                    })
                except Exception as e:
                    entry.next_run = now + entry.interval_seconds
                    self._results.append({
                        "schedule_id": entry.schedule_id,
                        "name": entry.name,
                        "timestamp": now,
                        "status": "error",
                        "error": str(e),
                    })

                if len(self._results) > 200:
                    self._results = self._results[-100:]

            time.sleep(1)

    def run_now(self, schedule_id: str) -> Dict[str, Any]:
        """Manually trigger a scheduled entry immediately."""
        entry = self._schedules.get(schedule_id)
        if not entry:
            return {"error": f"Schedule {schedule_id} not found"}
        try:
            if entry.domain:
                result = self.run_domain(entry.domain, entry.context)
            else:
                result = self.run_pipeline(entry.pipeline_steps, entry.context)
            entry.run_count += 1
            entry.last_run = time.time()
            if entry.interval_seconds > 0:
                entry.next_run = time.time() + entry.interval_seconds
            return {"status": "completed", "result": result}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def list_schedules(self) -> List[Dict[str, Any]]:
        return [s.to_dict() for s in self._schedules.values()]

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._results[-limit:]))

    def stats(self) -> Dict[str, Any]:
        return {
            "total_schedules": len(self._schedules),
            "active_schedules": sum(1 for s in self._schedules.values() if s.enabled),
            "total_runs": sum(s.run_count for s in self._schedules.values()),
            "scheduler_running": self._running,
        }
