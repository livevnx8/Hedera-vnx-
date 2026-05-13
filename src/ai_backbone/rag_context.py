"""
RAG Context — retrieval-augmented generation over agent results and marketplace history.

Maintains a searchable context store of recent agent outputs, marketplace events,
and system state for grounded Q&A.
"""

import time
from collections import deque
from typing import Any, Dict, List, Optional

from .llm_router import LLMRouter


class ContextEntry:
    """Single entry in the RAG context store."""

    def __init__(
        self,
        content: str,
        source: str,
        category: str = "general",
        metadata: Dict[str, Any] = None,
    ):
        self.content = content
        self.source = source
        self.category = category
        self.metadata = metadata or {}
        self.timestamp = time.time()
        # Simple keyword index for retrieval
        self._keywords = set(content.lower().split())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "content": self.content[:200],
            "source": self.source,
            "category": self.category,
            "timestamp": self.timestamp,
        }


class RAGContext:
    """
    Simple retrieval-augmented context for Q&A.

    Stores recent agent results, marketplace events, and system state.
    Retrieves relevant context for LLM prompts using keyword matching.
    """

    def __init__(self, llm_router: LLMRouter, max_entries: int = 500):
        self.llm = llm_router
        self._entries: deque = deque(maxlen=max_entries)
        self._history: List[Dict[str, Any]] = []

    def ingest(
        self,
        content: str,
        source: str,
        category: str = "general",
        metadata: Dict[str, Any] = None,
    ):
        """Add a new entry to the context store."""
        entry = ContextEntry(content, source, category, metadata)
        self._entries.append(entry)

    def ingest_agent_result(self, result: Dict[str, Any]):
        """Ingest an agent execution result."""
        import json
        agent_id = result.get("agent_id", "unknown")
        domain = result.get("domain", "unknown")
        actions = result.get("actions", [])

        summary_parts = [f"Agent {agent_id} ({domain}):"]
        for action in actions[:3]:
            if isinstance(action, dict):
                summary_parts.append(f"  - {action.get('title', 'action')}")
            elif hasattr(action, 'to_dict'):
                a = action.to_dict()
                summary_parts.append(f"  - {a.get('title', 'action')}")

        self.ingest(
            content="\n".join(summary_parts),
            source=f"agent.{agent_id}",
            category=domain,
            metadata={"agent_id": agent_id, "domain": domain},
        )

    def ingest_marketplace_event(self, event: Dict[str, Any]):
        """Ingest a marketplace event."""
        event_type = event.get("event_type", "unknown")
        task_id = event.get("task_id", "")
        status = event.get("status", "")

        self.ingest(
            content=f"Marketplace: {event_type} (task={task_id}, status={status})",
            source="marketplace",
            category="marketplace",
            metadata=event,
        )

    def retrieve(
        self,
        query: str,
        limit: int = 10,
        category: Optional[str] = None,
    ) -> List[ContextEntry]:
        """Retrieve relevant entries using keyword matching."""
        query_keywords = set(query.lower().split())
        scored = []

        for entry in self._entries:
            if category and entry.category != category:
                continue
            # Simple keyword overlap scoring
            overlap = len(query_keywords & entry._keywords)
            if overlap > 0:
                # Boost recent entries
                recency = 1.0 / (1.0 + (time.time() - entry.timestamp) / 3600)
                score = overlap * (1.0 + recency)
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [entry for _, entry in scored[:limit]]

    def ask(
        self,
        question: str,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Answer a question using retrieved context + LLM.

        Returns: {"answer": "...", "sources": [...], "method": "llm"|"fallback"}
        """
        # Retrieve relevant context
        relevant = self.retrieve(question, limit=5, category=category)
        context_text = "\n\n".join(e.content for e in relevant)

        if not context_text:
            context_text = "No relevant context found in recent history."

        prompt = f"""Context from recent system activity:
{context_text}

Question: {question}

Answer based on the context above. If the context doesn't contain enough information, say so."""

        response = self.llm.complete(
            prompt=prompt,
            system_prompt="You are Vera OS assistant. Answer questions about the system state, agent results, and marketplace activity based on the provided context.",
            max_tokens=300,
            temperature=0.5,
        )

        result = {
            "answer": response.text,
            "sources": [e.to_dict() for e in relevant],
            "source_count": len(relevant),
            "method": "fallback" if response.fallback else "llm",
            "model_used": response.model_used,
        }

        self._history.append({
            "question": question,
            "answer_preview": response.text[:100],
            "sources": len(relevant),
            "method": result["method"],
            "timestamp": time.time(),
        })
        if len(self._history) > 100:
            self._history = self._history[-50:]

        return result

    def stats(self) -> Dict[str, Any]:
        entries = list(self._entries)
        categories = {}
        for e in entries:
            categories[e.category] = categories.get(e.category, 0) + 1
        return {
            "total_entries": len(entries),
            "by_category": categories,
            "total_queries": len(self._history),
            "oldest_entry_age_s": round(time.time() - entries[0].timestamp) if entries else 0,
        }

    def history(self, limit: int = 10) -> List[Dict[str, Any]]:
        return list(reversed(self._history[-limit:]))
