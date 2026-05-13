"""
WebSocket Connection Manager — handles client connections, rooms, and broadcast.
"""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket


class ConnectionManager:
    """
    Manages WebSocket connections with channel subscription support.

    Clients can subscribe to specific channels:
      - "marketplace" — marketplace events only
      - "agents" — agent execution events
      - "system" — ops/health events
      - "*" — all events (default)
    """

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}  # conn_id → ws
        self._subscriptions: Dict[str, Set[str]] = {}  # conn_id → channels
        self._connected_at: Dict[str, float] = {}
        self._total_messages_sent: int = 0

    async def connect(self, websocket: WebSocket, client_id: str = None) -> str:
        """Accept connection and register."""
        await websocket.accept()
        conn_id = client_id or f"ws_{id(websocket)}"
        self._connections[conn_id] = websocket
        self._subscriptions[conn_id] = {"*"}
        self._connected_at[conn_id] = time.time()
        return conn_id

    def disconnect(self, conn_id: str):
        """Remove connection."""
        self._connections.pop(conn_id, None)
        self._subscriptions.pop(conn_id, None)
        self._connected_at.pop(conn_id, None)

    def subscribe(self, conn_id: str, channels: List[str]):
        """Set channel subscriptions for a connection."""
        if conn_id in self._subscriptions:
            self._subscriptions[conn_id] = set(channels)

    async def broadcast(self, channel: str, data: Dict[str, Any]):
        """Send event to all matching subscribers."""
        message = json.dumps({
            "channel": channel,
            "data": data,
            "timestamp": time.time(),
        })

        dead = []
        channel_prefix = channel.split(".")[0]

        for conn_id, ws in self._connections.items():
            subs = self._subscriptions.get(conn_id, set())
            if "*" in subs or channel_prefix in subs or channel in subs:
                try:
                    await ws.send_text(message)
                    self._total_messages_sent += 1
                except Exception:
                    dead.append(conn_id)

        for conn_id in dead:
            self.disconnect(conn_id)

    async def send_to(self, conn_id: str, data: Dict[str, Any]):
        """Send to specific connection."""
        ws = self._connections.get(conn_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
                self._total_messages_sent += 1
            except Exception:
                self.disconnect(conn_id)

    def stats(self) -> Dict[str, Any]:
        return {
            "active_connections": len(self._connections),
            "total_messages_sent": self._total_messages_sent,
            "connections": [
                {
                    "conn_id": cid,
                    "channels": list(self._subscriptions.get(cid, set())),
                    "connected_seconds": round(time.time() - self._connected_at.get(cid, 0)),
                }
                for cid in self._connections
            ],
        }
