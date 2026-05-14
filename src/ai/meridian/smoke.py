"""
Fast Meridian infrastructure smoke test.

This does not train. It verifies that the model config, forward pass,
checkpoint metadata path, and tokenizer contract are usable on CPU.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import torch
from torch.optim import AdamW

from architecture import MeridianModel
from infrastructure import build_config
from server import PyTorchMeridianRuntime
from tokenizer import SimpleTokenizer
from train import save_checkpoint


def main() -> None:
    cfg = build_config("smoke", max_seq_len=64)
    model = MeridianModel(cfg)
    tokenizer = SimpleTokenizer(vocab_size=cfg.vocab_size)
    tokens = tokenizer.encode("classify this Vera task", max_length=32)
    input_ids = torch.tensor([tokens], dtype=torch.long)
    logits = model(input_ids)
    assert logits.shape[0] == 1
    assert logits.shape[-1] == cfg.vocab_size

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "smoke.pt"
        optimizer = AdamW(model.parameters(), lr=1e-4)
        save_checkpoint(model, optimizer, 0, path, cfg, {"smoke": True})
        payload = torch.load(path, map_location="cpu", weights_only=False)
        assert payload["checkpoint_version"] == "meridian.checkpoint.v1"
        assert payload["model_config"]["d_model"] == cfg.d_model

        runtime = PyTorchMeridianRuntime(path, device=torch.device("cpu"), preset="smoke", max_seq_len=64)
        assert runtime.health()["ok"] is True
        result = runtime.infer("classify this Vera task", max_tokens=4, temperature=0)
        assert result["backend"] == "pytorch"
        assert result["tokens_used"] >= 1

    print("Meridian smoke passed")


if __name__ == "__main__":
    main()
