#!/usr/bin/env python3
"""
Mix synthetic and real Hedera data to increase dataset size

This script combines real Hedera transactions with synthetic data to create
a larger training corpus. This helps improve model accuracy when real data
is limited due to API constraints.

Usage:
    python3 mix_synthetic_real_corpus.py
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import json
import random
from typing import List, Dict, Any

from starlit.hedera_advanced_corpus import generate_advanced_hedera_corpus


def mix_corpora(real_corpus_path: str, synthetic_samples: int = 9000) -> List[Dict[str, Any]]:
    """
    Mix real and synthetic corpora to increase dataset size.
    
    Args:
        real_corpus_path: Path to real corpus JSON file
        synthetic_samples: Number of synthetic samples to generate
        
    Returns:
        Mixed corpus (real + synthetic)
        
    Raises:
        FileNotFoundError: If real corpus file does not exist
        json.JSONDecodeError: If real corpus file is not valid JSON
        Exception: If synthetic corpus generation fails
    """
    # Validate parameters
    assert synthetic_samples > 0, f"synthetic_samples must be positive, got {synthetic_samples}"
    
    # Load real corpus
    try:
        with open(real_corpus_path, 'r') as f:
            real_corpus = json.load(f)
    except FileNotFoundError:
        print(f"Error: Real corpus file not found at {real_corpus_path}")
        raise
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse real corpus JSON: {e}")
        raise
    
    print(f"Loaded {len(real_corpus)} real samples")
    assert len(real_corpus) > 0, "Real corpus should not be empty"
    
    # Validate real corpus structure
    assert 'features' in real_corpus[0], "Real corpus items should have 'features' key"
    assert 'label' in real_corpus[0], "Real corpus items should have 'label' key"
    
    # Generate synthetic corpus
    synthetic_corpus = []
    synthetic_types = ["staking_rewards", "block_streams", "clipper_compression"]
    
    try:
        for tx_type in synthetic_types:
            classification, _ = generate_advanced_hedera_corpus(tx_type, n_samples=synthetic_samples // 3)
            synthetic_corpus.extend(classification)
    except Exception as e:
        print(f"Error generating synthetic corpus: {e}")
        raise
    
    print(f"Generated {len(synthetic_corpus)} synthetic samples")
    assert len(synthetic_corpus) > 0, "Synthetic corpus should not be empty"
    
    # Validate synthetic corpus structure
    assert 'features' in synthetic_corpus[0], "Synthetic corpus items should have 'features' key"
    assert 'label' in synthetic_corpus[0], "Synthetic corpus items should have 'label' key"
    
    # Mix corpora
    mixed_corpus = real_corpus + synthetic_corpus
    random.shuffle(mixed_corpus)
    
    print(f"Mixed corpus size: {len(mixed_corpus)}")
    print(f"Real samples: {len(real_corpus)} ({len(real_corpus)/len(mixed_corpus)*100:.1f}%)")
    print(f"Synthetic samples: {len(synthetic_corpus)} ({len(synthetic_corpus)/len(mixed_corpus)*100:.1f}%)")
    
    return mixed_corpus


if __name__ == "__main__":
    try:
        # Mix classification corpora
        real_classification_path = "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus.json"
        mixed_classification = mix_corpora(real_classification_path, synthetic_samples=9000)
        
        # Save mixed corpus
        with open("/home/vera-live-0-1/hedera-llm-api/data/mixed_hedera_classification_corpus.json", 'w') as f:
            json.dump(mixed_classification, f, indent=2)
        print("Saved mixed classification corpus")
        
        print("\n=== Mixed Corpus Creation Complete ===")
    except Exception as e:
        print(f"\nMixed corpus creation failed: {e}")
        sys.exit(1)
