"""Pydantic models for VeraLattice API."""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "vera-mock"
    messages: list[ChatMessage]
    max_tokens: Optional[int] = None
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    stream: bool = False


class ChatCompletionResponse(BaseModel):
    response: str
    events: list[dict[str, Any]]
    sovereign: bool = False
    provider: Optional[str] = None
    model: Optional[str] = None


class TaskSubmission(BaseModel):
    description: str
    service_type: str
    budget: float = Field(gt=0)
    required_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    deadline_ms: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class TaskRecord(BaseModel):
    task_id: str
    state: str
    record: dict[str, Any]


class AgentInfo(BaseModel):
    agent_id: str
    service: str
    fee_per_task: float = 0.0
    availability: bool = True
    reputation: Optional[float] = None


class LatticeNode(BaseModel):
    id: str
    x: float
    y: float
    layer: int
    angle: float
    energy: float
    type: str
    role: Optional[str] = None
    connections: list[str]
    last_accessed: int
    access_count: int
    assigned_agents: list[str]
    state: str


class LatticeEdge(BaseModel):
    id: str
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    strength: float
    traffic: int
    last_used: int
    flow_direction: str


class LatticeState(BaseModel):
    nodes: list[LatticeNode]
    edges: list[LatticeEdge]
    pulses: list[dict[str, Any]]


class LatticePulse(BaseModel):
    type: Literal["heartbeat", "audit", "decision", "alert"] = "heartbeat"
    data: Optional[dict[str, Any]] = None


class HealthStatus(BaseModel):
    status: str
    uptime: int
    topics: dict[str, Any]
    registry: dict[str, Any]
    feature_flags: dict[str, Any]
    rig: dict[str, Any]
