"""
Meridian BPE Tokenizer Training

Trains a Byte-Pair Encoding tokenizer on Vera's interaction corpus.
Target vocabulary: 32,000 tokens (configurable).

This tokenizer handles:
- Hedera entity IDs (0.0.12345)
- Tool call XML tags (<tool name="...">)
- JSON tool parameters
- HCS topic IDs and transaction hashes
- Common DeFi/carbon/crypto terminology

Usage:
    python src/ai/meridian/tokenizer_train.py \
        --input data/learning-interactions.jsonl \
        --output models/meridian/tokenizer \
        --vocab_size 32000
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple


# ─── Byte-Pair Encoding Core ──────────────────────────────────────────────

class BPETokenizer:
    """
    Simple BPE tokenizer implementation.
    Starts with byte-level vocabulary and merges frequent pairs.
    """

    def __init__(self, vocab_size: int = 32000):
        self.vocab_size = vocab_size
        self.vocab: Dict[int, bytes] = {}
        self.merges: List[Tuple[bytes, bytes]] = []
        self.special_tokens = {
            b"<pad>": 0,
            b"<eos>": 1,
            b"<tool>": 2,
            b"</tool>": 3,
            b"<json>": 4,
            b"</json>": 5,
            b"<hedera_id>": 6,
            b"<hash>": 7,
        }
        self._init_byte_vocab()

    def _init_byte_vocab(self):
        """Initialize vocabulary with all 256 bytes + special tokens."""
        next_id = 256
        # First 256 ids are raw bytes
        for i in range(256):
            self.vocab[i] = bytes([i])

        # Add special tokens
        for token_bytes, token_id in self.special_tokens.items():
            self.vocab[token_id] = token_bytes

    def _get_word_tokens(self, word: str) -> List[bytes]:
        """Convert a word to initial byte tokens."""
        return [bytes([b]) for b in word.encode("utf-8")]

    def _get_stats(self, tokens: List[List[bytes]]) -> Dict[Tuple[bytes, bytes], int]:
        """Count frequency of adjacent token pairs."""
        pairs = defaultdict(int)
        for word in tokens:
            for i in range(len(word) - 1):
                pairs[(word[i], word[i + 1])] += 1
        return dict(pairs)

    def _merge_tokens(self, tokens: List[List[bytes]], pair: Tuple[bytes, bytes]) -> List[List[bytes]]:
        """Apply a merge rule to all token sequences."""
        merged = []
        for word in tokens:
            new_word = []
            i = 0
            while i < len(word):
                if i < len(word) - 1 and word[i] == pair[0] and word[i + 1] == pair[1]:
                    new_word.append(pair[0] + pair[1])
                    i += 2
                else:
                    new_word.append(word[i])
                    i += 1
            merged.append(new_word)
        return merged

    def train(self, texts: List[str], num_merges: int | None = None):
        """
        Train BPE on a corpus of texts.
        num_merges defaults to vocab_size - 256 - len(special_tokens).
        """
        if num_merges is None:
            num_merges = self.vocab_size - 256 - len(self.special_tokens)

        print(f"Training BPE with {num_merges} merges from {len(texts)} documents...")

        # Pre-tokenize: split on whitespace and punctuation
        # Keep Hedera IDs, hashes, and tool tags as single tokens
        all_tokens: List[List[bytes]] = []
        for text in texts:
            words = self._pretokenize(text)
            for word in words:
                all_tokens.append(self._get_word_tokens(word))

        print(f"Initial tokens: {sum(len(w) for w in all_tokens)}")

        next_id = max(self.vocab.keys()) + 1

        for i in range(num_merges):
            stats = self._get_stats(all_tokens)
            if not stats:
                break

            # Most frequent pair
            best_pair = max(stats, key=stats.get)
            best_count = stats[best_pair]

            if best_count < 2:
                print(f"Stopping at merge {i}: no pairs with frequency >= 2")
                break

            all_tokens = self._merge_tokens(all_tokens, best_pair)
            merged_token = best_pair[0] + best_pair[1]
            self.vocab[next_id] = merged_token
            self.merges.append(best_pair)
            next_id += 1

            if (i + 1) % 1000 == 0:
                total = sum(len(w) for w in all_tokens)
                print(f"  Merge {i + 1}: vocab={len(self.vocab)}, tokens={total}, pair={best_pair[0][:20]}... + {best_pair[1][:20]}...")

        print(f"Training complete: {len(self.vocab)} tokens, {len(self.merges)} merges")

    def _pretokenize(self, text: str) -> List[str]:
        """
        Pre-tokenize text, preserving special patterns as single tokens.
        """
        # Patterns to keep as single tokens
        patterns = [
            (r"\b0\.0\.\d+\b", "<hedera_id>"),           # Hedera entity IDs
            (r"[a-f0-9]{64}", "<hash>"),                   # Transaction hashes
            (r"<tool\s+[^>]*>", "<tool>"),                # Tool XML tags
            (r"</tool>", "</tool>"),
            (r"\{[^{}]*\}", "<json>"),                   # Simple JSON objects
        ]

        # Replace patterns with placeholders
        placeholders: Dict[str, str] = {}
        placeholder_id = 0
        processed = text

        for pattern, token_name in patterns:
            matches = list(re.finditer(pattern, processed, re.IGNORECASE))
            for match in reversed(matches):  # reverse to preserve indices
                placeholder = f"__PH{placeholder_id}__"
                placeholder_id += 1
                placeholders[placeholder] = match.group()
                processed = processed[:match.start()] + placeholder + processed[match.end():]

        # Now split on whitespace and punctuation
        parts = re.split(r"(\s+|[^\w<>/]|__PH\d+__)", processed)
        words = [p for p in parts if p and not p.isspace()]

        # Restore placeholders
        result = []
        for word in words:
            if word.startswith("__PH") and word.endswith("__"):
                original = placeholders.get(word, word)
                result.append(original)
            else:
                result.append(word)

        return result

    def encode(self, text: str) -> List[int]:
        """Encode text to token ids."""
        words = self._pretokenize(text)
        token_ids = []

        for word in words:
            # Check if word is directly in vocab (special tokens, common words)
            word_bytes = word.encode("utf-8")
            for vocab_id, vocab_bytes in self.vocab.items():
                if vocab_bytes == word_bytes:
                    token_ids.append(vocab_id)
                    break
            else:
                # Apply merges in order
                word_tokens = [bytes([b]) for b in word_bytes]
                for merge in self.merges:
                    i = 0
                    while i < len(word_tokens) - 1:
                        if word_tokens[i] == merge[0] and word_tokens[i + 1] == merge[1]:
                            word_tokens[i] = merge[0] + merge[1]
                            word_tokens.pop(i + 1)
                        else:
                            i += 1

                # Convert to ids
                for token_bytes in word_tokens:
                    # Find id for this byte sequence
                    found = False
                    for vocab_id, vocab_bytes in self.vocab.items():
                        if vocab_bytes == token_bytes:
                            token_ids.append(vocab_id)
                            found = True
                            break
                    if not found:
                        # Fallback: encode as individual bytes
                        for b in token_bytes:
                            token_ids.append(b)

        return token_ids

    def decode(self, token_ids: List[int]) -> str:
        """Decode token ids to text."""
        bytes_list = []
        for tid in token_ids:
            if tid in self.vocab:
                bytes_list.append(self.vocab[tid])
            else:
                # Unknown token — byte fallback
                bytes_list.append(bytes([tid % 256]))

        try:
            return b"".join(bytes_list).decode("utf-8", errors="replace")
        except UnicodeDecodeError:
            return b"".join(bytes_list).decode("utf-8", errors="ignore")

    def save(self, path: Path):
        """Save tokenizer to directory."""
        path.mkdir(parents=True, exist_ok=True)

        # Save vocabulary
        vocab_json = {str(k): v.decode("utf-8", errors="replace") for k, v in self.vocab.items()}
        with open(path / "vocab.json", "w", encoding="utf-8") as f:
            json.dump(vocab_json, f, ensure_ascii=False, indent=2)

        # Save merges
        merges_json = [
            [m[0].decode("utf-8", errors="replace"), m[1].decode("utf-8", errors="replace")]
            for m in self.merges
        ]
        with open(path / "merges.json", "w", encoding="utf-8") as f:
            json.dump(merges_json, f, ensure_ascii=False, indent=2)

        # Save metadata
        meta = {
            "vocab_size": self.vocab_size,
            "actual_vocab_size": len(self.vocab),
            "num_merges": len(self.merges),
            "special_tokens": {
                k.decode("utf-8", errors="replace"): v
                for k, v in self.special_tokens.items()
            },
        }
        with open(path / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        print(f"Tokenizer saved to {path}")

    @classmethod
    def load(cls, path: Path) -> "BPETokenizer":
        """Load tokenizer from directory."""
        with open(path / "meta.json", "r", encoding="utf-8") as f:
            meta = json.load(f)

        tokenizer = cls(vocab_size=meta["vocab_size"])

        with open(path / "vocab.json", "r", encoding="utf-8") as f:
            vocab_json = json.load(f)
            tokenizer.vocab = {int(k): v.encode("utf-8", errors="replace") for k, v in vocab_json.items()}

        with open(path / "merges.json", "r", encoding="utf-8") as f:
            merges_json = json.load(f)
            tokenizer.merges = [
                (m[0].encode("utf-8", errors="replace"), m[1].encode("utf-8", errors="replace"))
                for m in merges_json
            ]

        return tokenizer


# ─── Training Pipeline ──────────────────────────────────────────────────────

def load_training_texts(data_paths: List[Path], max_docs: int = 100000) -> List[str]:
    """Load text corpus from Vera data files."""
    texts: List[str] = []

    for data_path in data_paths:
        if not data_path.exists():
            print(f"Warning: {data_path} not found, skipping")
            continue

        with open(data_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= max_docs:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    # Extract text from various fields
                    for key in ["instruction", "input", "output", "prompt", "response", "text"]:
                        if key in obj and isinstance(obj[key], str):
                            texts.append(obj[key])
                            break
                except json.JSONDecodeError:
                    # Plain text line
                    texts.append(line)

    print(f"Loaded {len(texts)} text documents")
    return texts


def train_tokenizer(
    output_dir: Path,
    data_paths: List[Path],
    vocab_size: int = 32000,
    max_docs: int = 100000,
) -> BPETokenizer:
    """Train and save a BPE tokenizer."""
    texts = load_training_texts(data_paths, max_docs)

    if len(texts) < 100:
        print(f"Warning: only {len(texts)} documents found. Adding synthetic examples...")
        # Add synthetic Vera-specific examples
        synthetic = [
            "<tool name=\"get_price_chart\">{\"token\": \"HBAR\", \"period\": \"7d\"}</tool>",
            "Hedera entity ID: 0.0.12345",
            "Transaction hash: a1b2c3d4e5f6... (64 hex chars)",
            "Spawn lattice agent for carbon credit verification",
            "Verify block proof for block number 15000000",
            "Query DeFi yield on SaucerSwap pool 0.0.67890",
            "Submit HCS message to topic 0.0.12346",
            "Schedule token transfer for 2024-01-01T00:00:00Z",
            "Agent coordination: 6 active agents in swarm consensus",
            "Block stream anomaly detected: high latency 5000ms",
        ]
        texts.extend(synthetic * 100)

    tokenizer = BPETokenizer(vocab_size=vocab_size)
    tokenizer.train(texts)
    tokenizer.save(output_dir)

    # Test round-trip
    test_text = "Verify block proof 0.0.12345 for HBAR price chart <tool>{\"token\":\"HBAR\"}</tool>"
    encoded = tokenizer.encode(test_text)
    decoded = tokenizer.decode(encoded)
    print(f"\nRound-trip test:")
    print(f"  Original:  {test_text}")
    print(f"  Encoded:   {encoded[:20]}... ({len(encoded)} tokens)")
    print(f"  Decoded:   {decoded}")
    print(f"  Match:     {test_text == decoded}")

    return tokenizer


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train Meridian BPE tokenizer")
    parser.add_argument("--input", nargs="+", default=["data/learning-interactions.jsonl"], help="Input data files")
    parser.add_argument("--output", default="models/meridian/tokenizer", help="Output directory")
    parser.add_argument("--vocab-size", type=int, default=32000, help="Target vocabulary size")
    parser.add_argument("--max-docs", type=int, default=100000, help="Maximum documents to process")
    args = parser.parse_args()

    data_paths = [Path(p) for p in args.input]
    output_dir = Path(args.output)

    tokenizer = train_tokenizer(
        output_dir=output_dir,
        data_paths=data_paths,
        vocab_size=args.vocab_size,
        max_docs=args.max_docs,
    )

    print(f"\nTokenizer ready at {output_dir}")
    print(f"Use in training: python src/ai/meridian/train.py --vocab_size {args.vocab_size}")


if __name__ == "__main__":
    main()
