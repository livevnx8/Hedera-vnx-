"""
Task Decomposer — turns natural language task descriptions into agent pipelines.

Uses LLM when available, falls back to keyword-based mapping.
"""

import re
from typing import Any, Dict, List

from .llm_router import LLMRouter, LLMResponse


# Domain keyword mappings for fallback decomposition
DOMAIN_KEYWORDS = {
    "defi": ["swap", "yield", "pool", "liquidity", "lp", "fee", "dex", "amm", "apy"],
    "carbon": ["carbon", "esg", "sustainability", "offset", "retirement", "green", "environment"],
    "risk": ["risk", "drawdown", "exposure", "stop-loss", "rebalance", "position", "volatility"],
    "hedera": ["hcs", "hts", "topic", "token", "account", "transaction", "scheduled", "multi-sig"],
    "intel": ["signal", "sentiment", "whale", "volume", "arbitrage", "prediction", "market"],
    "ops": ["health", "heal", "cost", "circuit", "schedule", "system", "monitor", "restart"],
}

# Agent selection by capability
AGENT_MAP = {
    "swap": {"domain": "defi", "agent": "defi_swap_001"},
    "yield": {"domain": "defi", "agent": "defi_yield_001"},
    "pool": {"domain": "defi", "agent": "defi_pool_001"},
    "liquidity": {"domain": "defi", "agent": "defi_lp_001"},
    "fee": {"domain": "defi", "agent": "defi_fees_001"},
    "carbon": {"domain": "carbon", "agent": "carbon_verify_001"},
    "esg": {"domain": "carbon", "agent": "esg_score_001"},
    "offset": {"domain": "carbon", "agent": "carbon_retire_001"},
    "risk": {"domain": "risk", "agent": "risk_exposure_001"},
    "drawdown": {"domain": "risk", "agent": "risk_drawdown_001"},
    "position": {"domain": "risk", "agent": "risk_size_001"},
    "rebalance": {"domain": "risk", "agent": "risk_rebal_001"},
    "topic": {"domain": "hedera", "agent": "hedera_hcs_001"},
    "token": {"domain": "hedera", "agent": "hedera_hts_001"},
    "account": {"domain": "hedera", "agent": "hedera_account_001"},
    "signal": {"domain": "intel", "agent": "intel_signal_001"},
    "sentiment": {"domain": "intel", "agent": "intel_sentiment_001"},
    "whale": {"domain": "intel", "agent": "intel_whale_001"},
    "volume": {"domain": "intel", "agent": "intel_volume_001"},
    "arbitrage": {"domain": "intel", "agent": "intel_arb_001"},
    "health": {"domain": "ops", "agent": "ops_health_001"},
    "cost": {"domain": "ops", "agent": "ops_cost_001"},
    "heal": {"domain": "ops", "agent": "ops_heal_001"},
}


class TaskDecomposer:
    """
    Decomposes a natural language task into executable agent pipeline steps.

    LLM mode: sends task to LLM with structured output prompt
    Fallback mode: keyword extraction → domain mapping → agent selection
    """

    SYSTEM_PROMPT = """You are Vera OS task decomposer. Given a user's task description, output a JSON array of pipeline steps.

Each step is: {"domain": "<domain>", "agent": "<agent_id>"}

Available domains and agents:
- defi: defi_yield_001, defi_swap_001, defi_lp_001, defi_pool_001, defi_fees_001
- carbon: carbon_verify_001, carbon_retire_001, esg_score_001, esg_report_001, carbon_token_001
- risk: risk_size_001, risk_rebal_001, risk_stop_001, risk_exposure_001, risk_drawdown_001
- hedera: hedera_hcs_001, hedera_hts_001, hedera_sched_001, hedera_multisig_001, hedera_account_001
- intel: intel_signal_001, intel_sentiment_001, intel_whale_001, intel_volume_001, intel_arb_001
- ops: ops_heal_001, ops_cost_001, ops_circuit_001, ops_scheduler_001, ops_health_001

Rules:
- Output ONLY valid JSON array
- Order steps logically (gather intel → assess risk → execute action)
- Use 2-5 steps typically
- Match the user's intent to the most relevant agents"""

    def __init__(self, llm_router: LLMRouter):
        self.llm = llm_router
        self._history: List[Dict[str, Any]] = []

    def decompose(
        self,
        task_description: str,
        context: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """
        Decompose a natural language task into pipeline steps.

        Returns:
          {
            "steps": [...],
            "reasoning": "...",
            "method": "llm" | "fallback",
            "confidence": 0.0-1.0
          }
        """
        # Try LLM first
        response = self.llm.complete(
            prompt=f"Task: {task_description}\n\nContext: {context or {}}",
            system_prompt=self.SYSTEM_PROMPT,
            max_tokens=500,
            temperature=0.3,
        )

        if not response.fallback:
            steps = self._parse_llm_response(response.text)
            if steps:
                result = {
                    "steps": steps,
                    "reasoning": f"LLM decomposed into {len(steps)} steps",
                    "method": "llm",
                    "model_used": response.model_used,
                    "confidence": 0.85,
                }
                self._history.append(result)
                return result

        # Fallback: keyword-based decomposition
        steps = self._keyword_decompose(task_description)
        result = {
            "steps": steps,
            "reasoning": f"Keyword-based decomposition into {len(steps)} steps",
            "method": "fallback",
            "model_used": "keyword_engine",
            "confidence": 0.6,
        }
        self._history.append(result)
        return result

    def _parse_llm_response(self, text: str) -> List[Dict[str, str]]:
        """Extract JSON array from LLM response."""
        import json
        # Find JSON array in response
        match = re.search(r'\[.*?\]', text, re.DOTALL)
        if match:
            try:
                steps = json.loads(match.group())
                # Validate
                valid = []
                for s in steps:
                    if isinstance(s, dict) and "domain" in s and "agent" in s:
                        valid.append({"domain": s["domain"], "agent": s["agent"]})
                return valid if valid else []
            except json.JSONDecodeError:
                return []
        return []

    def _keyword_decompose(self, description: str) -> List[Dict[str, str]]:
        """Keyword-based fallback decomposition."""
        desc_lower = description.lower()
        words = set(re.findall(r'\w+', desc_lower))

        matched_agents = []
        seen = set()

        for keyword, step in AGENT_MAP.items():
            if keyword in words or keyword in desc_lower:
                key = (step["domain"], step["agent"])
                if key not in seen:
                    matched_agents.append(step)
                    seen.add(key)

        if not matched_agents:
            # Default: run signal + risk assessment
            matched_agents = [
                {"domain": "intel", "agent": "intel_signal_001"},
                {"domain": "risk", "agent": "risk_exposure_001"},
            ]

        # Sort: intel first, then risk, then action domains
        domain_order = {"intel": 0, "risk": 1, "hedera": 2, "defi": 3, "carbon": 4, "ops": 5}
        matched_agents.sort(key=lambda s: domain_order.get(s["domain"], 9))

        return matched_agents[:5]

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._history[-limit:]))
