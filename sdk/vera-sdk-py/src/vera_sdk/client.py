"""Async VeraLattice client with retry, x402 payment handling, and WebSocket support."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
from typing import Any, AsyncIterator, Optional

import httpx
import websockets

from .models import (
    AgentInfo,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    HealthStatus,
    LatticePulse,
    LatticeState,
    TaskRecord,
    TaskSubmission,
)


class VeraError(Exception):
    """Base Vera SDK error."""

    def __init__(self, message: str, status_code: Optional[int] = None, body: Optional[dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class PaymentRequiredError(VeraError):
    """Raised when x402 payment is required."""

    def __init__(self, payment: dict[str, Any], endpoint: str):
        super().__init__(f"x402 payment required: ${payment.get('amount')} for {endpoint}")
        self.payment = payment
        self.endpoint = endpoint


class VeraClient:
    """Async HTTP client for VeraLattice API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "http://localhost:8080",
        timeout: float = 30.0,
        retries: int = 3,
        hedera_operator_id: Optional[str] = None,
        hedera_operator_key: Optional[str] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.hedera_operator_id = hedera_operator_id
        self.hedera_operator_key = hedera_operator_key
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        client = await self._get_client()
        url = f"{self.base_url}{path}"
        headers = kwargs.pop("headers", {})
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        last_error: Optional[Exception] = None
        for attempt in range(self.retries):
            try:
                response = await client.request(method, url, headers=headers, **kwargs)
                if response.status_code == 402:
                    error_data = response.json()
                    raise PaymentRequiredError(error_data.get("payment", {}), path)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code in (429, 502, 503, 504):
                    await asyncio.sleep(1.0 * (attempt + 1))
                    continue
                raise VeraError(
                    f"HTTP {exc.response.status_code}: {exc.response.text}",
                    status_code=exc.response.status_code,
                ) from exc
            except (httpx.ConnectError, httpx.ReadTimeout) as exc:
                last_error = exc
                await asyncio.sleep(1.0 * (attempt + 1))
                continue

        raise VeraError(f"Max retries exceeded: {last_error}") from last_error

    # ─── Health ───────────────────────────────────────────

    async def health(self) -> HealthStatus:
        data = await self._request("GET", "/api/vera/health")
        return HealthStatus.model_validate(data)

    async def system_health(self) -> dict[str, Any]:
        return await self._request("GET", "/health")

    # ─── Chat / AI ──────────────────────────────────────

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str = "vera-mock",
        stream: bool = False,
    ) -> ChatCompletionResponse:
        req = ChatCompletionRequest(model=model, messages=messages, stream=stream)
        data = await self._request("POST", "/v1/chat/completions", json=req.model_dump())
        return ChatCompletionResponse.model_validate(data)

    async def agent_chat(
        self,
        messages: list[ChatMessage],
        model: Optional[str] = None,
        enable_tools: bool = True,
        stream: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "messages": [m.model_dump() for m in messages],
            "enable_tools": enable_tools,
            "stream": stream,
        }
        if model:
            payload["model"] = model
        return await self._request("POST", "/v1/chat/agent", json=payload)

    # ─── Lattice ────────────────────────────────────────

    async def lattice_state(self) -> LatticeState:
        data = await self._request("GET", "/api/vera/lattice/state")
        return LatticeState.model_validate(data)

    async def lattice_stats(self) -> dict[str, Any]:
        return await self._request("GET", "/api/vera/lattice/stats")

    async def lattice_pulse(self, pulse: LatticePulse) -> dict[str, Any]:
        return await self._request("POST", "/api/vera/lattice/pulse", json=pulse.model_dump())

    async def lattice_path(self, from_node: str, to_node: str) -> dict[str, Any]:
        return await self._request("GET", "/api/vera/lattice/path", params={"from": from_node, "to": to_node})

    async def route_message(self, from_node: str, to_node: str, message: dict[str, Any]) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/vera/lattice/route-message",
            json={"from": from_node, "to": to_node, "message": message},
        )

    async def route_decision(self, decision_type: str, data: dict[str, Any], source_layer: int = 3) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/vera/lattice/decision",
            json={"type": decision_type, "data": data, "sourceLayer": source_layer},
        )

    # ─── Tasks / Marketplace ──────────────────────────────

    async def list_tasks(self) -> dict[str, Any]:
        return await self._request("GET", "/api/vera/tasks")

    async def get_task(self, task_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/vera/tasks/{task_id}")

    async def submit_task(self, task: TaskSubmission) -> TaskRecord:
        data = await self._request("POST", "/api/vera/tasks", json=task.model_dump(by_alias=False))
        return TaskRecord.model_validate(data)

    async def bid_on_task(self, task_id: str, agent_id: str, amount: float, confidence: float) -> dict[str, Any]:
        return await self._request(
            "POST",
            f"/api/vera/tasks/{task_id}/bid",
            json={"agentId": agent_id, "amount": amount, "confidence": confidence},
        )

    # ─── Agents ─────────────────────────────────────────

    async def list_agents(self) -> list[AgentInfo]:
        data = await self._request("GET", "/api/vera/agents")
        return [AgentInfo.model_validate(a) for a in data.get("agents", [])]

    async def register_agent(self, agent: AgentInfo) -> dict[str, Any]:
        payload = {
            "agent_id": agent.agent_id,
            "service": agent.service,
            "fee_per_task": agent.fee_per_task,
            "availability": agent.availability,
        }
        return await self._request("POST", "/api/vera/agents/register", json=payload)

    # ─── Escrow / Payments ──────────────────────────────

    async def escrow_stats(self) -> dict[str, Any]:
        return await self._request("GET", "/api/vera/escrow")

    async def settlements_stats(self) -> dict[str, Any]:
        return await self._request("GET", "/api/vera/settlements")

    async def verification_stats(self) -> dict[str, Any]:
        return await self._request("GET", "/api/vera/verification")

    # ─── Tools / Consciousness ────────────────────────────

    async def list_tools(self, layer: Optional[int] = None, category: Optional[str] = None, search: Optional[str] = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if layer is not None:
            params["layer"] = layer
        if category:
            params["category"] = category
        if search:
            params["search"] = search
        return await self._request("GET", "/api/vera/tools", params=params)

    async def orchestrate_intent(self, intent: str, top_k: int = 5) -> dict[str, Any]:
        return await self._request("POST", "/api/vera/orchestrate", json={"intent": intent, "topK": top_k})

    async def semantic_recall(self, query: str, top_k: int = 5) -> dict[str, Any]:
        return await self._request("POST", "/api/vera/recall", json={"query": query, "topK": top_k})

    # ─── WebSocket (Realtime) ───────────────────────────

    async def websocket_stream(self, path: str = "/ws") -> AsyncIterator[dict[str, Any]]:
        uri = f"{self.base_url.replace('http', 'ws')}{path}"
        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        async with websockets.connect(uri, extra_headers=headers) as ws:
            async for message in ws:
                yield json.loads(message)

    # ─── x402 Payment Handling ────────────────────────────

    async def pay_and_retry(
        self,
        method: str,
        path: str,
        payment: dict[str, Any],
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Submit x402 payment proof and retry the request."""
        if not self.hedera_operator_id or not self.hedera_operator_key:
            raise VeraError("Hedera credentials not configured for x402 payments")

        # Build payment proof via HCS topic message
        proof = await self._submit_x402_payment(payment)
        headers = kwargs.pop("headers", {})
        headers["X-Payment-Proof"] = proof
        return await self._request(method, path, headers=headers, **kwargs)

    async def _submit_x402_payment(self, payment: dict[str, Any]) -> str:
        """Submit an x402 payment to the Hedera topic. Returns payment proof."""
        # This is a placeholder for actual Hedera SDK integration.
        # In production, use hedera-sdk-py to submit TopicMessageSubmitTransaction.
        payload = json.dumps(
            {
                "requestId": payment.get("requestId"),
                "amount": payment.get("amount"),
                "endpoint": payment.get("endpoint"),
                "timestamp": int(time.time() * 1000),
            },
            sort_keys=True,
        )
        proof = hmac.new(
            self.hedera_operator_key.encode() if self.hedera_operator_key else b"",
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        return proof

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> VeraClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
