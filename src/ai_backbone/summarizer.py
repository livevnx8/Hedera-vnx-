"""
Result Summarizer — converts agent outputs into human-readable explanations.
"""

import time
from typing import Any, Dict, List

from .llm_router import LLMRouter


class ResultSummarizer:
    """
    Summarizes agent pipeline results into natural language.

    LLM mode: full narrative summary
    Fallback mode: structured bullet-point summary from data
    """

    SYSTEM_PROMPT = """You are Vera OS result summarizer. Given agent execution results, produce a concise, actionable summary.

Format:
- Start with a one-line headline assessment
- List 2-4 key findings
- End with a recommended next action

Be specific about numbers, scores, and agent recommendations. Keep it under 200 words."""

    def __init__(self, llm_router: LLMRouter):
        self.llm = llm_router
        self._history: List[Dict[str, Any]] = []

    def summarize(
        self,
        results: Dict[str, Any],
        context: str = "",
    ) -> Dict[str, Any]:
        """
        Summarize pipeline/agent results.

        Returns: {"summary": "...", "method": "llm"|"fallback", "headline": "..."}
        """
        import json

        # Build prompt from results
        result_text = json.dumps(results, indent=2, default=str)[:3000]
        prompt = f"Agent Results:\n{result_text}"
        if context:
            prompt += f"\n\nContext: {context}"

        response = self.llm.complete(
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT,
            max_tokens=300,
            temperature=0.5,
        )

        if not response.fallback:
            summary = response.text.strip()
            headline = summary.split("\n")[0] if summary else "Results processed"
            result = {
                "summary": summary,
                "headline": headline,
                "method": "llm",
                "model_used": response.model_used,
                "latency_ms": response.latency_ms,
            }
        else:
            # Fallback: structured extraction
            summary_parts = self._extract_summary(results)
            result = {
                "summary": "\n".join(summary_parts),
                "headline": summary_parts[0] if summary_parts else "Analysis complete",
                "method": "fallback",
                "model_used": "template",
                "latency_ms": 0.1,
            }

        self._history.append(result)
        if len(self._history) > 100:
            self._history = self._history[-50:]

        return result

    def _extract_summary(self, results: Dict[str, Any]) -> List[str]:
        """Extract key information from structured results."""
        parts = []

        # Pipeline results
        if "completed_steps" in results:
            total = results.get("total_steps", 0)
            done = results.get("completed_steps", 0)
            failed = results.get("failed_steps", 0)
            parts.append(f"Pipeline: {done}/{total} steps completed ({failed} failed)")

            for step in results.get("steps", [])[:5]:
                output = step.get("output_data", {})
                actions = output.get("actions", [])
                if actions:
                    top_action = actions[0] if isinstance(actions[0], dict) else {}
                    parts.append(
                        f"  • {step.get('name', 'Step')}: {top_action.get('title', 'completed')}"
                    )

        # Domain results
        elif "domain" in results:
            domain = results.get("domain", "unknown")
            status = results.get("status", "unknown")
            total_actions = results.get("total_actions", 0)
            parts.append(f"{domain.title()} domain: {status} ({total_actions} actions)")

            for action in results.get("actions", [])[:3]:
                if isinstance(action, dict):
                    parts.append(f"  • [{action.get('urgency', 'info')}] {action.get('title', '')}")

        # All-domain results
        elif "results" in results:
            domains = results.get("domains", 0)
            parts.append(f"Full scan: {domains} domains analyzed")
            for domain, data in results.get("results", {}).items():
                if isinstance(data, dict):
                    parts.append(
                        f"  • {domain}: {data.get('status', '?')} "
                        f"({data.get('total_actions', 0)} actions)"
                    )

        if not parts:
            parts.append("Analysis completed successfully")

        return parts

    def history(self, limit: int = 10) -> List[Dict[str, Any]]:
        return list(reversed(self._history[-limit:]))
