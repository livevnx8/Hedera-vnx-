"""
Meridian Tokenizer & Data Utilities

Standalone module to avoid circular imports between train/eval/serve.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

import torch
from torch import Tensor


class SimpleTokenizer:
    """Minimal byte-level tokenizer for bootstrapping training.
    Replace with proper BPE tokenizer once trained via tokenizer_train.py."""

    def __init__(self, vocab_size: int = 32000):
        self.vocab_size = vocab_size
        self.pad_id = 0
        self.eos_id = 1
        self.char_to_id: Dict[str, int] = {}
        self.id_to_char: Dict[int, str] = {}
        self._build_byte_vocab()

    def _build_byte_vocab(self):
        """Build a byte-level vocabulary (256 chars + special tokens)."""
        next_id = 2  # 0=pad, 1=eos
        for i in range(256):
            ch = chr(i) if i >= 32 else f"<b{i}>"
            self.char_to_id[ch] = next_id
            self.id_to_char[next_id] = ch
            next_id += 1
        # Fill remaining vocab with placeholder tokens
        for i in range(next_id, self.vocab_size):
            self.id_to_char[i] = f"<tok{i}>"
            self.char_to_id[f"<tok{i}>"] = i

    def encode(self, text: str, max_length: int = 512) -> List[int]:
        tokens = []
        for ch in text:
            if ch in self.char_to_id:
                tokens.append(self.char_to_id[ch])
            else:
                for b in ch.encode("utf-8", errors="ignore"):
                    byte_ch = chr(b) if b >= 32 else f"<b{b}>"
                    tokens.append(self.char_to_id.get(byte_ch, self.pad_id))
            if len(tokens) >= max_length:
                break
        tokens.append(self.eos_id)
        return tokens[:max_length]

    def decode(self, tokens: List[int]) -> str:
        chars = []
        for t in tokens:
            if t <= 1:
                continue
            ch = self.id_to_char.get(t, "")
            if ch.startswith("<") and ch.startswith("<b"):
                try:
                    b = int(ch[2:-1])
                    chars.append(chr(b))
                except ValueError:
                    pass
            elif ch.startswith("<tok"):
                pass  # placeholder
            else:
                chars.append(ch)
        return "".join(chars)


# ─── Data Helpers ─────────────────────────────────────────────────────────

def format_instruction(obj: Dict[str, str]) -> str:
    """Format instruction example as a single text string."""
    instruction = obj.get("instruction", "")
    inp = obj.get("input", "")
    output = obj.get("output", "")
    parts = [f"### Instruction:\n{instruction}"]
    if inp:
        parts.append(f"### Input:\n{inp}")
    parts.append(f"### Response:\n{output}")
    return "\n\n".join(parts)


def collate_batch(batch: List[Tensor], pad_token_id: int = 0) -> Tuple[Tensor, Tensor]:
    """Pad batch to max length and create causal LM labels."""
    max_len = max(len(t) for t in batch)
    padded = torch.full((len(batch), max_len), pad_token_id, dtype=torch.long)
    for i, t in enumerate(batch):
        padded[i, : len(t)] = t
    # Labels: same as input, shifted in loss function
    return padded, padded.clone()


def load_jsonl(path: Path) -> List[Dict[str, str]]:
    """Load a JSONL file."""
    examples: List[Dict[str, str]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                examples.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return examples
