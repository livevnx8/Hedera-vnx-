"""
LLM Router — multi-model routing with fallback chain.

Supports:
  - OpenAI (GPT-4o, GPT-4o-mini) via API key
  - Ollama (local models) via OLLAMA_URL
  - Template fallback (no LLM needed, rule-based)

The system works without any API keys in fallback mode.
"""

import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ModelInfo:
    model_id: str = ""
    provider: str = ""          # "openai" | "ollama" | "fallback"
    display_name: str = ""
    available: bool = False
    latency_ms: float = 0.0
    call_count: int = 0
    error_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_id": self.model_id,
            "provider": self.provider,
            "display_name": self.display_name,
            "available": self.available,
            "latency_ms": round(self.latency_ms, 1),
            "call_count": self.call_count,
            "error_count": self.error_count,
        }


@dataclass
class LLMResponse:
    text: str = ""
    model_used: str = ""
    provider: str = ""
    latency_ms: float = 0.0
    tokens_used: int = 0
    fallback: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "model_used": self.model_used,
            "provider": self.provider,
            "latency_ms": round(self.latency_ms, 1),
            "tokens_used": self.tokens_used,
            "fallback": self.fallback,
        }


class LLMRouter:
    """
    Multi-model router with automatic fallback.

    Priority:
      1. OpenAI (if OPENAI_API_KEY set)
      2. Ollama local (if OLLAMA_URL set)
      3. Template fallback (always available)
    """

    def __init__(self):
        self._models: Dict[str, ModelInfo] = {}
        self._history: List[Dict[str, Any]] = []
        self._init_models()

    def _init_models(self):
        # OpenAI
        if os.environ.get("OPENAI_API_KEY"):
            self._models["gpt-4o-mini"] = ModelInfo(
                model_id="gpt-4o-mini",
                provider="openai",
                display_name="GPT-4o Mini",
                available=True,
            )
            self._models["gpt-4o"] = ModelInfo(
                model_id="gpt-4o",
                provider="openai",
                display_name="GPT-4o",
                available=True,
            )

        # Ollama
        ollama_url = os.environ.get("OLLAMA_URL", "")
        if ollama_url:
            self._models["ollama-default"] = ModelInfo(
                model_id="ollama-default",
                provider="ollama",
                display_name="Ollama Local",
                available=True,
            )

        # Fallback always available
        self._models["fallback"] = ModelInfo(
            model_id="fallback",
            provider="fallback",
            display_name="Template Fallback",
            available=True,
        )

    def complete(
        self,
        prompt: str,
        system_prompt: str = "",
        model: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Route completion to best available model.

        Falls through priority chain on failure.
        """
        # If specific model requested
        if model and model in self._models:
            return self._call_model(model, prompt, system_prompt, max_tokens, temperature)

        # Priority chain
        for model_id in self._priority_order():
            info = self._models[model_id]
            if not info.available:
                continue
            try:
                return self._call_model(model_id, prompt, system_prompt, max_tokens, temperature)
            except Exception:
                info.error_count += 1
                continue

        # Final fallback
        return self._template_fallback(prompt)

    def _priority_order(self) -> List[str]:
        order = []
        if "gpt-4o-mini" in self._models:
            order.append("gpt-4o-mini")
        if "ollama-default" in self._models:
            order.append("ollama-default")
        order.append("fallback")
        return order

    def _call_model(
        self,
        model_id: str,
        prompt: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        info = self._models[model_id]
        start = time.time()

        if info.provider == "openai":
            text = self._call_openai(model_id, prompt, system_prompt, max_tokens, temperature)
        elif info.provider == "ollama":
            text = self._call_ollama(prompt, system_prompt, max_tokens, temperature)
        else:
            return self._template_fallback(prompt)

        latency = (time.time() - start) * 1000
        info.call_count += 1
        info.latency_ms = (info.latency_ms * (info.call_count - 1) + latency) / info.call_count

        response = LLMResponse(
            text=text,
            model_used=model_id,
            provider=info.provider,
            latency_ms=latency,
            tokens_used=len(text.split()),
        )

        self._history.append({
            "model": model_id,
            "prompt_len": len(prompt),
            "response_len": len(text),
            "latency_ms": latency,
            "timestamp": time.time(),
        })
        if len(self._history) > 200:
            self._history = self._history[-100:]

        return response

    def _call_openai(
        self,
        model: str,
        prompt: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call OpenAI API."""
        try:
            import openai
            client = openai.OpenAI()
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            raise RuntimeError(f"OpenAI error: {e}")

    def _call_ollama(
        self,
        prompt: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call local Ollama instance."""
        try:
            import requests
            url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
            full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            resp = requests.post(
                f"{url}/api/generate",
                json={
                    "model": os.environ.get("OLLAMA_MODEL", "llama3"),
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {"num_predict": max_tokens, "temperature": temperature},
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("response", "")
        except Exception as e:
            raise RuntimeError(f"Ollama error: {e}")

    def _template_fallback(self, prompt: str) -> LLMResponse:
        """Rule-based fallback when no LLM is available."""
        # Simple keyword-based response
        prompt_lower = prompt.lower()

        if "decompose" in prompt_lower or "break down" in prompt_lower:
            text = "I'll analyze this task and suggest appropriate agent steps based on the task category and requirements."
        elif "summarize" in prompt_lower or "summary" in prompt_lower:
            text = "Based on the agent results, the operation completed successfully with the outputs provided."
        elif "recommend" in prompt_lower or "suggest" in prompt_lower:
            text = "Based on current market conditions and agent analysis, I recommend proceeding with caution and monitoring key metrics."
        else:
            text = "I've processed your request using the template engine. For richer responses, configure an LLM provider (OPENAI_API_KEY or OLLAMA_URL)."

        return LLMResponse(
            text=text,
            model_used="fallback",
            provider="fallback",
            latency_ms=0.1,
            tokens_used=len(text.split()),
            fallback=True,
        )

    def list_models(self) -> List[Dict[str, Any]]:
        return [m.to_dict() for m in self._models.values()]

    def stats(self) -> Dict[str, Any]:
        return {
            "available_models": sum(1 for m in self._models.values() if m.available),
            "total_calls": sum(m.call_count for m in self._models.values()),
            "total_errors": sum(m.error_count for m in self._models.values()),
            "primary_model": self._priority_order()[0] if self._priority_order() else "fallback",
            "models": self.list_models(),
        }
