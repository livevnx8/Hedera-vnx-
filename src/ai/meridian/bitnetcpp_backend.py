"""
bitnet.cpp backend adapter for Meridian.

The adapter intentionally does not vendor or download Microsoft BitNet assets.
Point it at a local bitnet.cpp checkout plus an official GGUF model and it
will expose the same runtime contract as the PyTorch research backend.
"""

from __future__ import annotations

import shlex
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List


DEFAULT_COMMAND_TEMPLATE = (
    "python3 {bitnet_dir}/run_inference.py "
    "-m {model} -p {prompt} -n {max_tokens} -t {threads} "
    "-c {ctx_size} -temp {temperature}"
)


@dataclass
class BitnetCppConfig:
    model_path: Path
    bitnet_dir: Path = Path("vendor/BitNet")
    command_template: str = DEFAULT_COMMAND_TEMPLATE
    threads: int = 4
    ctx_size: int = 2048
    timeout_ms: int = 120_000


class BitnetCppRuntime:
    backend = "bitnetcpp"
    model_name = "meridian-bitnetcpp"

    def __init__(self, config: BitnetCppConfig) -> None:
        self.config = config
        self.loaded = self.config.model_path.exists()
        self.error = None if self.loaded else f"GGUF model not found: {self.config.model_path}"

    def health(self) -> Dict[str, Any]:
        return {
            "ok": self.loaded,
            "backend": self.backend,
            "model": self.model_name,
            "model_path": str(self.config.model_path),
            "bitnet_dir": str(self.config.bitnet_dir),
            "threads": self.config.threads,
            "ctx_size": self.config.ctx_size,
            "timeout_ms": self.config.timeout_ms,
            "error": self.error,
            "command_template": self.config.command_template,
        }

    def infer(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        max_tokens: int = 128,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        if not self.loaded:
            raise RuntimeError(self.error or "bitnet.cpp backend is not loaded")

        start = time.time()
        full_prompt = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
        command = self._build_command(
            prompt=full_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        completed = subprocess.run(
            command,
            cwd=str(self.config.bitnet_dir) if self.config.bitnet_dir.exists() else None,
            capture_output=True,
            text=True,
            timeout=max(1, self.config.timeout_ms / 1000),
            check=False,
        )
        latency_ms = int((time.time() - start) * 1000)

        if completed.returncode != 0:
            details = (completed.stderr or completed.stdout or "").strip()
            raise RuntimeError(f"bitnet.cpp exited {completed.returncode}: {details[:1200]}")

        content = self._extract_content(completed.stdout)
        return {
            "content": content,
            "model": self.model_name,
            "backend": self.backend,
            "tokens_used": 0,
            "latency_ms": latency_ms,
            "model_path": str(self.config.model_path),
            "loaded": self.loaded,
        }

    def _build_command(self, *, prompt: str, max_tokens: int, temperature: float) -> List[str]:
        values = {
            "bitnet_dir": str(self.config.bitnet_dir),
            "model": str(self.config.model_path),
            "prompt": prompt,
            "max_tokens": str(max_tokens),
            "threads": str(self.config.threads),
            "ctx_size": str(self.config.ctx_size),
            "temperature": str(temperature),
        }
        return [part.format(**values) for part in shlex.split(self.config.command_template)]

    @staticmethod
    def _extract_content(stdout: str) -> str:
        text = stdout.strip()
        if not text:
            return ""

        marker_candidates = [
            "### Response:",
            "Response:",
            "Assistant:",
            "<|assistant|>",
        ]
        for marker in marker_candidates:
            if marker in text:
                return text.split(marker, 1)[1].strip()

        return text
