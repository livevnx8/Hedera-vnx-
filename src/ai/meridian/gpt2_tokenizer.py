"""GPT-2 Tokenizer wrapper for Meridian."""

from transformers import GPT2Tokenizer
from typing import List


class GPT2TokenizerWrapper:
    """Wrapper around GPT2Tokenizer for Meridian compatibility."""
    
    def __init__(self):
        self.tokenizer = GPT2Tokenizer.from_pretrained('gpt2')
        # Add special tokens
        special_tokens = {
            'pad_token': '<pad>',
            'eos_token': '<eos>',
        }
        self.tokenizer.add_special_tokens(special_tokens)
        
    @property
    def vocab_size(self) -> int:
        return len(self.tokenizer)
    
    @property
    def pad_id(self) -> int:
        return self.tokenizer.pad_token_id
    
    @property
    def eos_id(self) -> int:
        return self.tokenizer.eos_token_id
    
    def encode(self, text: str, max_length: int = None) -> List[int]:
        """Encode text to token IDs."""
        tokens = self.tokenizer.encode(text, add_special_tokens=False)
        tokens.append(self.eos_id)
        
        if max_length:
            tokens = tokens[:max_length]
            while len(tokens) < max_length:
                tokens.append(self.pad_id)
        
        return tokens
    
    def decode(self, ids: List[int]) -> str:
        """Decode token IDs to text."""
        # Filter out special tokens
        ids = [i for i in ids if i not in [self.pad_id, self.eos_id]]
        return self.tokenizer.decode(ids, skip_special_tokens=True)
    
    def save(self, path: str):
        """Save tokenizer."""
        self.tokenizer.save_pretrained(path)
        print(f"Saved GPT2 tokenizer to: {path}")
    
    @classmethod
    def load(cls, path: str):
        """Load tokenizer."""
        wrapper = cls()
        wrapper.tokenizer = GPT2Tokenizer.from_pretrained(path)
        return wrapper


def get_tokenizer():
    """Get or create GPT2 tokenizer for Meridian."""
    import os
    cache_dir = 'models/meridian/gpt2_tokenizer_cache'
    
    if os.path.exists(cache_dir):
        print(f"Loading cached GPT2 tokenizer from {cache_dir}")
        return GPT2TokenizerWrapper.load(cache_dir)
    else:
        print("Downloading GPT2 tokenizer...")
        tok = GPT2TokenizerWrapper()
        tok.save(cache_dir)
        return tok


if __name__ == '__main__':
    # Test
    tok = get_tokenizer()
    print(f"Vocab size: {tok.vocab_size}")
    
    test_json = '[{"tool": "vera_memory_recall", "parameters": {"query": "test"}}]'
    enc = tok.encode(test_json)
    dec = tok.decode(enc)
    print(f"Original: {test_json}")
    print(f"Decoded:  {dec}")
    print(f"Match: {test_json == dec}")
