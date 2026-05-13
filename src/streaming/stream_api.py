"""
Stream API — WebSocket and SSE endpoints for real-time event streaming.
"""

import asyncio
import json
import time
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from .event_stream import EventStream
from .ws_manager import ConnectionManager
from .live_pipeline import LivePipeline


def create_stream_router(
    event_stream: EventStream,
    ws_manager: ConnectionManager,
    live_pipeline: LivePipeline,
) -> APIRouter:
    router = APIRouter(tags=["streaming"])

    # ─── WebSocket ──────────────────────────────────────────

    @router.websocket("/ws/events")
    async def ws_events(websocket: WebSocket):
        """
        WebSocket endpoint for real-time events.

        Client can send JSON messages to subscribe to channels:
          {"action": "subscribe", "channels": ["marketplace", "agents"]}
          {"action": "unsubscribe", "channels": ["agents"]}
        """
        conn_id = await ws_manager.connect(websocket)

        # Send welcome
        await ws_manager.send_to(conn_id, {
            "type": "connected",
            "conn_id": conn_id,
            "timestamp": time.time(),
        })

        # Subscribe to event stream
        queue = event_stream.subscribe()

        try:
            # Run two tasks: read from client + push events
            async def push_events():
                while True:
                    event = await queue.get()
                    await ws_manager.broadcast(event.channel, event.to_dict())

            async def read_client():
                while True:
                    data = await websocket.receive_text()
                    try:
                        msg = json.loads(data)
                        action = msg.get("action", "")
                        if action == "subscribe":
                            ws_manager.subscribe(conn_id, msg.get("channels", ["*"]))
                        elif action == "ping":
                            await ws_manager.send_to(conn_id, {"type": "pong"})
                    except json.JSONDecodeError:
                        pass

            await asyncio.gather(push_events(), read_client())

        except WebSocketDisconnect:
            pass
        finally:
            ws_manager.disconnect(conn_id)
            event_stream.unsubscribe(queue)

    # ─── Server-Sent Events ─────────────────────────────────

    @router.get("/stream/events")
    async def sse_events(channel: str = None):
        """SSE endpoint for dashboard. Optional channel filter."""

        async def event_generator():
            queue = event_stream.subscribe()
            try:
                while True:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    if channel and not event.channel.startswith(channel):
                        continue
                    yield f"data: {json.dumps(event.to_dict())}\n\n"
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': time.time()})}\n\n"
            except asyncio.CancelledError:
                pass
            finally:
                event_stream.unsubscribe(queue)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # ─── REST Event History ─────────────────────────────────

    @router.get("/stream/history")
    async def stream_history(limit: int = 50, channel: str = None) -> Dict[str, Any]:
        events = event_stream.history(limit=limit, channel=channel)
        return {"count": len(events), "events": events}

    @router.get("/stream/stats")
    async def stream_stats() -> Dict[str, Any]:
        return {
            "stream": event_stream.stats(),
            "connections": ws_manager.stats(),
            "pipeline": live_pipeline.stats(),
        }

    # ─── Live Pipeline Rules ────────────────────────────────

    @router.get("/stream/rules")
    async def list_rules() -> Dict[str, Any]:
        rules = live_pipeline.list_rules()
        return {"count": len(rules), "rules": rules}

    @router.get("/stream/pipeline/history")
    async def pipeline_history(limit: int = 20) -> Dict[str, Any]:
        history = live_pipeline.history(limit=limit)
        return {"count": len(history), "history": history}

    return router
