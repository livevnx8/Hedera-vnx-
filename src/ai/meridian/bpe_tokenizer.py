"""BPE Tokenizer for Meridian - replaces simple vocab with GPT2-style subwords."""

import json
import pickle
from pathlib import Path
from typing import List, Dict
import re


class BPETokenizer:
    """Byte-Pair Encoding tokenizer with 5000 vocab."""
    
    PAD_TOKEN = "<pad>"
    EOS_TOKEN = "<eos>"
    UNK_TOKEN = "<unk>"
    
    # Special JSON/tool tokens
    JSON_TOKENS = [
        "[", "]", "{", "}", ":", "\"", ",", "\\",
        "tool", "parameters", "name", "description",
        "vera_memory_recall", "vera_memory_save", "hedera_submit_topic",
        "get_news", "check_weather", "send_email", "search_web",
        "<tool>", "</tool>", "<json>", "</json>"
    ]
    
    def __init__(self, vocab_size: int = 5000):
        self.vocab_size = vocab_size
        self.vocab = {}
        self.merges = []
        self.pattern = None
        
    def build_vocab(self, texts: List[str], min_freq: int = 2):
        """Build BPE vocab from training texts."""
        # Start with chars + special tokens
        word_freqs = {}
        for text in texts:
            words = re.findall(r'\S+|\n', text)
            for word in words:
                word_freqs[word] = word_freqs.get(word, 0) + 1
        
        # Initialize with chars
        char_freqs = {}
        for word, freq in word_freqs.items():
            chars = list(word)
            for char in chars:
                char_freqs[char] = char_freqs.get(char, 0) + freq
        
        # Build vocab
        self.vocab = {
            self.PAD_TOKEN: 0,
            self.EOS_TOKEN: 1,
            self.UNK_TOKEN: 2,
        }
        
        # Add JSON special tokens first
        for token in self.JSON_TOKENS:
            if len(self.vocab) < self.vocab_size:
                self.vocab[token] = len(self.vocab)
        
        # Add frequent chars
        sorted_chars = sorted(char_freqs.items(), key=lambda x: -x[1])
        for char, _ in sorted_chars:
            if char not in self.vocab and len(self.vocab) < self.vocab_size:
                self.vocab[char] = len(self.vocab)
        
        # Add frequent words/subwords
        sorted_words = sorted(word_freqs.items(), key=lambda x: -x[1])
        for word, freq in sorted_words:
            if freq < min_freq:
                continue
            if word not in self.vocab and len(self.vocab) < self.vocab_size:
                self.vocab[word] = len(self.vocab)
        
        print(f"Built vocab: {len(self.vocab)} tokens (target: {self.vocab_size})")
        return self
    
    def encode(self, text: str, max_length: int = None) -> List[int]:
        """Encode text to token IDs."""
        if not self.vocab:
            raise RuntimeError("Tokenizer not trained")
        
        # Simple word-level encoding with fallback to chars
        words = re.findall(r'\S+|\n', text)
        ids = []
        
        for word in words:
            if word in self.vocab:
                ids.append(self.vocab[word])
            else:
                # Fallback to char-level
                for char in word:
                    ids.append(self.vocab.get(char, self.vocab[self.UNK_TOKEN]))
        
        ids.append(self.vocab[self.EOS_TOKEN])
        
        if max_length:
            ids = ids[:max_length]
            while len(ids) < max_length:
                ids.append(self.vocab[self.PAD_TOKEN])
        
        return ids
    
    def decode(self, ids: List[int]) -> str:
        """Decode token IDs to text with proper spacing."""
        inv_vocab = {v: k for k, v in self.vocab.items()}
        tokens = []
        for idx in ids:
            token = inv_vocab.get(idx, self.UNK_TOKEN)
            if token in [self.PAD_TOKEN, self.EOS_TOKEN]:
                continue
            tokens.append(token)
        
        # Smart join: add spaces between word tokens, not punctuation
        result = []
        for i, token in enumerate(tokens):
            if i == 0:
                result.append(token)
            else:
                prev = tokens[i-1]
                # Add space if both current and prev are "word-like" (not punctuation/special)
                is_prev_punct = prev in '[]{},:"\\'
                is_curr_punct = token in '[]{},:"\\'
                if not is_prev_punct and not is_curr_punct:
                    result.append(' ')
                result.append(token)
        
        return "".join(result)
    
    @property
    def pad_id(self) -> int:
        return self.vocab.get(self.PAD_TOKEN, 0)
    
    @property
    def eos_id(self) -> int:
        return self.vocab.get(self.EOS_TOKEN, 1)
    
    def save(self, path: str):
        """Save tokenizer to disk."""
        data = {
            'vocab': self.vocab,
            'merges': self.merges,
            'vocab_size': self.vocab_size
        }
        with open(path, 'wb') as f:
            pickle.dump(data, f)
        print(f"Saved tokenizer: {path}")
    
    @classmethod
    def load(cls, path: str):
        """Load tokenizer from disk."""
        with open(path, 'rb') as f:
            data = pickle.load(f)
        
        tok = cls(data['vocab_size'])
        tok.vocab = data['vocab']
        tok.merges = data.get('merges', [])
        return tok


def train_tokenizer_on_vera_data(train_file: str, vocab_size: int = 5000):
    """Train BPE tokenizer on Vera dataset."""
    print(f"Training BPE tokenizer on {train_file}...")
    
    texts = []
    with open(train_file, 'r') as f:
        for line in f:
            try:
                ex = json.loads(line)
                # Train on both input and output
                texts.append(ex.get('instruction', ''))
                texts.append(ex.get('output', ''))
            except:
                continue
    
    print(f"Loaded {len(texts)} text samples")
    
    tokenizer = BPETokenizer(vocab_size=vocab_size)
    tokenizer.build_vocab(texts)
    
    return tokenizer


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        train_file = sys.argv[1]
        vocab_size = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
        tok = train_tokenizer_on_vera_data(train_file, vocab_size)
        tok.save(f'models/meridian/bpe_tokenizer_{vocab_size}.pkl')
        
        # Test
        test_json = '[{"tool": "vera_memory_recall", "parameters": {"query": "test"}}]'
        encoded = tok.encode(test_json)
        decoded = tok.decode(encoded)
        print(f"\nTest: {test_json}")
        print(f"Encoded ({len(encoded)} tokens): {encoded[:20]}...")
        print(f"Decoded: {decoded}")
        print(f"Perfect: {test_json == decoded}")
