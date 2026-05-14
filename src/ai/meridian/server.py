"""
Meridian local inference server.

Serves Vera's research ternary model behind the contract used by
src/llm/sovereignRouter.ts:

  POST /v1/infer -> { content, model, tokens_used, latency_ms }

No web framework is required; this is intentionally lightweight infrastructure
for local research and routing experiments.
"""

from __future__ import annotations

import argparse
import json
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Tuple

import torch

from architecture import MeridianModel
from bpe_tokenizer import BPETokenizer
from bitnetcpp_backend import DEFAULT_COMMAND_TEMPLATE, BitnetCppConfig, BitnetCppRuntime
from infrastructure import build_config, config_from_checkpoint_payload
from gpt2_tokenizer import GPT2TokenizerWrapper, get_tokenizer
from tokenizer import SimpleTokenizer
from transformers import GPT2Tokenizer


class PyTorchMeridianRuntime:
    backend = "pytorch"

    def __init__(
        self,
        checkpoint: Path,
        *,
        device: torch.device,
        preset: str,
        max_seq_len: int,
    ) -> None:
        self.checkpoint = checkpoint
        self.device = device
        self.loaded = False
        self.error: str | None = None
        self.model_name = "meridian-bitnet"
        self.config = build_config(preset, max_seq_len=max_seq_len)
        self.tokenizer = SimpleTokenizer(vocab_size=self.config.vocab_size)
        self.tokenizer_kind = "simple"
        self.model: MeridianModel | None = None
        self.load()

    def _build_tokenizer(self, payload: Dict[str, Any]) -> Any:
        metadata = payload.get("tokenizer") if isinstance(payload.get("tokenizer"), dict) else {}
        kind = metadata.get("kind") or payload.get("tokenizer_kind")
        raw_config = payload.get("model_config") if isinstance(payload.get("model_config"), dict) else payload.get("config")
        raw_config = raw_config if isinstance(raw_config, dict) else {}
        checkpoint_vocab_size = int(payload.get("vocab_size") or raw_config.get("vocab_size") or self.config.vocab_size)
        legacy_config_only = isinstance(payload.get("config"), dict) and not isinstance(payload.get("model_config"), dict)

        # Older tokenizer-specific trainers used "config" without tokenizer
        # metadata. Keep standard model_config checkpoints on the simple path.
        if not kind and legacy_config_only and checkpoint_vocab_size >= 50000:
            kind = "gpt2"
        if (
            not kind
            and legacy_config_only
            and 100 <= checkpoint_vocab_size <= 10000
            and Path("models/meridian/bpe_tokenizer_5000.pkl").exists()
        ):
            kind = "bpe"

        if kind == "gpt2":
            tokenizer_path = metadata.get("path")
            expected_vocab_size = self.config.vocab_size
            if tokenizer_path and Path(tokenizer_path).exists():
                tokenizer = GPT2TokenizerWrapper.load(str(tokenizer_path))
            elif expected_vocab_size == 50258:
                # Legacy train_gpt2.py added only a pad token and reused GPT-2's
                # built-in EOS token.
                cache_path = Path("models/meridian/gpt2_tokenizer_cache")
                tokenizer = GPT2TokenizerWrapper.__new__(GPT2TokenizerWrapper)
                if cache_path.exists():
                    tokenizer.tokenizer = GPT2Tokenizer.from_pretrained(str(cache_path), local_files_only=True)
                else:
                    tokenizer.tokenizer = GPT2Tokenizer.from_pretrained("gpt2", local_files_only=True)
                tokenizer.tokenizer.eos_token = tokenizer.tokenizer.unk_token
                if tokenizer.tokenizer.pad_token != "<pad>":
                    tokenizer.tokenizer.add_special_tokens({"pad_token": "<pad>"})
            else:
                tokenizer = get_tokenizer()

            if expected_vocab_size == 50258:
                if tokenizer.pad_id >= expected_vocab_size or tokenizer.eos_id >= expected_vocab_size:
                    raise ValueError(
                        f"legacy GPT-2 tokenizer special IDs exceed checkpoint vocab size {expected_vocab_size}"
                    )
            elif tokenizer.vocab_size != expected_vocab_size:
                raise ValueError(
                    f"GPT-2 tokenizer vocab size {tokenizer.vocab_size} "
                    f"does not match checkpoint vocab size {expected_vocab_size}"
                )
            self.tokenizer_kind = "gpt2"
            return tokenizer

        if kind == "bpe":
            tokenizer_path = metadata.get("path") or "models/meridian/bpe_tokenizer_5000.pkl"
            if not Path(tokenizer_path).exists():
                raise ValueError(f"BPE tokenizer not found: {tokenizer_path}")
            tokenizer = BPETokenizer.load(str(tokenizer_path))
            if len(tokenizer.vocab) != self.config.vocab_size:
                raise ValueError(
                    f"BPE tokenizer vocab size {len(tokenizer.vocab)} "
                    f"does not match checkpoint vocab size {self.config.vocab_size}"
                )
            self.tokenizer_kind = "bpe"
            return tokenizer

        self.tokenizer_kind = "simple"
        return SimpleTokenizer(vocab_size=self.config.vocab_size)

    def load(self) -> None:
        if not self.checkpoint.exists():
            self.error = f"checkpoint not found: {self.checkpoint}"
            return

        try:
            payload = torch.load(self.checkpoint, map_location="cpu", weights_only=False)
            self.config = config_from_checkpoint_payload(payload, self.config)
            self.tokenizer = self._build_tokenizer(payload)
            self.model = MeridianModel(self.config)
            self.model.load_state_dict(payload["model_state_dict"])
            self.model.to(self.device)
            self.model.eval()
            self.loaded = True
            self.error = None
            self.model_name = payload.get("model_name") or {
                "gpt2": "meridian-gpt2",
                "bpe": "meridian-bpe",
            }.get(self.tokenizer_kind, "meridian-bitnet")
        except Exception as exc:
            self.loaded = False
            self.error = str(exc)

    def _encode_prompt(self, prompt: str, max_new_tokens: int) -> list[int]:
        context_limit = max(1, self.config.max_seq_len - max_new_tokens)

        if self.tokenizer_kind in ("gpt2", "bpe"):
            tokens = self.tokenizer.encode(prompt)
        else:
            tokens = self.tokenizer.encode(prompt, max_length=self.config.max_seq_len)

        if not tokens:
            tokens = [self.tokenizer.eos_id]
        if len(tokens) > context_limit:
            tokens = tokens[-context_limit:]
        return tokens

    @torch.no_grad()
    def infer(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        max_tokens: int = 128,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        if not self.loaded or self.model is None:
            raise RuntimeError(self.error or "Meridian model is not loaded")

        start = time.time()
        full_prompt = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
        requested_new_tokens = max(1, min(max_tokens, max(1, self.config.max_seq_len // 4)))
        input_tokens = self._encode_prompt(full_prompt, requested_new_tokens)
        input_ids = torch.tensor([input_tokens], dtype=torch.long, device=self.device)
        max_new_tokens = max(0, min(requested_new_tokens, self.config.max_seq_len - input_ids.shape[1]))

        generated = []
        for _ in range(max_new_tokens):
            logits = self.model(input_ids)
            next_logits = logits[:, -1, :]
            if temperature <= 0:
                next_token = torch.argmax(next_logits, dim=-1, keepdim=True)
            else:
                probs = torch.softmax(next_logits / max(temperature, 1e-5), dim=-1)
                next_token = torch.multinomial(probs, num_samples=1)

            token_id = int(next_token.item())
            if token_id == self.tokenizer.eos_id:
                break
            generated.append(token_id)
            input_ids = torch.cat([input_ids, next_token], dim=1)
            if input_ids.shape[1] >= self.config.max_seq_len:
                break

        latency_ms = int((time.time() - start) * 1000)
        return {
            "content": self.tokenizer.decode(generated),
            "model": self.model_name,
            "backend": self.backend,
            "tokens_used": len(input_tokens) + len(generated),
            "latency_ms": latency_ms,
            "checkpoint": str(self.checkpoint),
            "loaded": self.loaded,
        }

    def health(self) -> Dict[str, Any]:
        return {
            "ok": self.loaded,
            "backend": self.backend,
            "model": self.model_name,
            "checkpoint": str(self.checkpoint),
            "device": str(self.device),
            "error": self.error,
            "tokenizer": self.tokenizer_kind,
            "config": {
                "vocab_size": self.config.vocab_size,
                "d_model": self.config.d_model,
                "n_layers": self.config.n_layers,
                "n_heads": self.config.n_heads,
                "max_seq_len": self.config.max_seq_len,
                "use_ternary": self.config.use_ternary,
            },
        }


def parse_json_request(handler: BaseHTTPRequestHandler) -> Tuple[Dict[str, Any] | None, str | None]:
    length = int(handler.headers.get("content-length", "0"))
    if length <= 0:
        return {}, None
    try:
        raw = handler.rfile.read(length).decode("utf-8")
        return json.loads(raw), None
    except json.JSONDecodeError as exc:
        return None, str(exc)


def make_handler(runtime: Any):
    class MeridianHandler(BaseHTTPRequestHandler):
        server_version = "MeridianHTTP/0.1"

        def do_GET(self) -> None:
            if self.path in ("/health", "/v1/health"):
                self.send_json(runtime.health(), HTTPStatus.OK if runtime.loaded else HTTPStatus.SERVICE_UNAVAILABLE)
                return
            self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            if self.path != "/v1/infer":
                self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return

            payload, error = parse_json_request(self)
            if error:
                self.send_json({"error": "invalid_json", "details": error}, HTTPStatus.BAD_REQUEST)
                return

            prompt = str((payload or {}).get("prompt", "")).strip()
            if not prompt:
                self.send_json({"error": "prompt is required"}, HTTPStatus.BAD_REQUEST)
                return

            try:
                result = runtime.infer(
                    prompt,
                    system_prompt=str((payload or {}).get("system_prompt", "")),
                    max_tokens=int((payload or {}).get("max_tokens", 128)),
                    temperature=float((payload or {}).get("temperature", 0.2)),
                )
                self.send_json(result, HTTPStatus.OK)
            except Exception as exc:
                self.send_json({"error": "inference_failed", "details": str(exc)}, HTTPStatus.SERVICE_UNAVAILABLE)

        def log_message(self, fmt: str, *args: Any) -> None:
            print(f"[MeridianHTTP] {self.address_string()} - {fmt % args}")

        def send_json(self, payload: Dict[str, Any], status: HTTPStatus) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return MeridianHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Meridian local inference")
    parser.add_argument("--backend", choices=["pytorch", "bitnetcpp"], default="pytorch")
    parser.add_argument("--checkpoint", default="models/meridian/checkpoints/best.pt")
    parser.add_argument("--bitnet-model", default="models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf")
    parser.add_argument("--bitnet-dir", default="vendor/BitNet")
    parser.add_argument("--bitnet-command", default=None, help="Command template for bitnet.cpp inference")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--ctx-size", type=int, default=2048)
    parser.add_argument("--timeout-ms", type=int, default=120000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8123)
    parser.add_argument("--preset", choices=["smoke", "small", "base", "medium", "large", "xl", "xxl"], default="base")
    parser.add_argument("--max_seq_len", type=int, default=512)
    parser.add_argument("--cpu", action="store_true")
    parser.add_argument("--check", action="store_true", help="Print backend health and exit without binding a port")
    args = parser.parse_args()

    device = torch.device("cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu"))
    if args.backend == "bitnetcpp":
        bitnet_config = BitnetCppConfig(
            model_path=Path(args.bitnet_model),
            bitnet_dir=Path(args.bitnet_dir),
            command_template=args.bitnet_command or DEFAULT_COMMAND_TEMPLATE,
            threads=args.threads,
            ctx_size=args.ctx_size,
            timeout_ms=args.timeout_ms,
        )
        runtime = BitnetCppRuntime(bitnet_config)
    else:
        runtime = PyTorchMeridianRuntime(
            Path(args.checkpoint),
            device=device,
            preset=args.preset,
            max_seq_len=args.max_seq_len,
        )
    print(f"Meridian server starting on {args.host}:{args.port}")
    print(json.dumps(runtime.health(), indent=2))
    if args.check:
        return

    server = ThreadingHTTPServer((args.host, args.port), make_handler(runtime))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Meridian server stopped")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
