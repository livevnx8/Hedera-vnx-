"""
Event Stream — central event pipeline with history and channel routing.

All system events (marketplace, agents, ops) flow through here and get
broadcast to WebSocket subscribers and SSE clients.
"""

import asyncio
import hashlib
import json
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass
class StreamEvent:
    """Single event in the stream."""
    event_id: str = field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:10]}")
    channel: str = ""               # e.g. "marketplace.task.posted", "agents.intel.*"
    source: str = ""                # component that emitted this
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    proof_hash: str = ""

    def __post_init__(self):
        if not self.proof_hash:
            payload = json.dumps({
                "event_id": self.event_id,
                "channel": self.channel,
                "timestamp": self.timestamp,
                "data_keys": sorted(self.data.keys()),
            }, sort_keys=True)
            self.proof_hash = hashlib.sha256(payload.encode()).hexdigest()[:16]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "channel": self.channel,
            "source": self.source,
            "data": self.data,
            "timestamp": self.timestamp,
            "proof_hash": self.proof_hash,
        }


class EventStream:
    """
    Central event pipeline.

    - Stores rolling history (configurable buffer size)
    - Supports channel-based filtering
    - Broadcasts to async subscribers (WebSocket connections)
    - Thread-safe emission from sync code via queue
    """

    def __init__(self, max_history: int = 1000):
        self._history: deque = deque(maxlen=max_history)
        self._subscribers: List[asyncio.Queue] = []
        self._sync_queue: List[StreamEvent] = []
        self._total_emitted: int = 0
        self._channels_seen: Set[str] = set()

    def emit(
        self,
        channel: str,
        data: Dict[str, Any],
        source: str = "system",
    ) -> StreamEvent:
        """Emit an event (sync-safe). Returns the created event."""
        event = StreamEvent(channel=channel, data=data, source=source)
        self._history.append(event)
        self._total_emitted += 1
        self._channels_seen.add(channel.split(".")[0])

        # Queue for async broadcast
        self._sync_queue.append(event)

        return event

    async def broadcast_pending(self):
        """Flush sync queue to async subscribers. Call from async context."""
        while self._sync_queue:
            event = self._sync_queue.pop(0)
            dead = []
            for q in self._subscribers:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._subscribers.remove(q)

    def subscribe(self) -> asyncio.Queue:
        """Create a new subscriber queue. Returns queue to await events from."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        """Remove a subscriber."""
        if q in self._subscribers:
            self._subscribers.remove(q)

    def history(
        self,
        limit: int = 50,
        channel: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent events, optionally filtered by channel prefix."""
        events = list(self._history)
        if channel:
            events = [e for e in events if e.channel.startswith(channel)]
        return [e.to_dict() for e in events[-limit:]]

    def stats(self) -> Dict[str, Any]:
        return {
            "total_emitted": self._total_emitted,
            "buffer_size": len(self._history),
            "active_subscribers": len(self._subscribers),
            "channels_seen": sorted(self._channels_seen),
        }
