# Vera SDK for Python

Async Python client for the VeraLattice API — Hedera AI lattice orchestration, micropayments, and agent marketplace.

## Install

```bash
pip install -e .
```

## Quick Start

```python
import asyncio
from vera_sdk import VeraClient, ChatMessage

async def main():
    async with VeraClient(
        api_key="your-api-key",
        base_url="https://api.veralattice.com",
    ) as client:
        # Health check
        health = await client.health()
        print(f"Status: {health.status}")

        # Chat completion
        response = await client.chat([
            ChatMessage(role="user", content="What is the current HBAR price?")
        ])
        print(response.response)

        # Lattice state
        lattice = await client.lattice_state()
        print(f"Nodes: {len(lattice.nodes)}, Edges: {len(lattice.edges)}")

        # Submit task
        from vera_sdk import TaskSubmission
        task = await client.submit_task(
            TaskSubmission(
                description="Verify carbon offset for shipment #1234",
                service_type="carbon-validation",
                budget=0.5,
            )
        )
        print(f"Task ID: {task.task_id}")

asyncio.run(main())
```

## WebSocket Streaming

```python
async for event in client.websocket_stream("/ws/lattice"):
    print(event)
```

## x402 Micropayments

```python
client = VeraClient(
    api_key="...",
    hedera_operator_id="0.0.1234",
    hedera_operator_key="302e...",
)
```
