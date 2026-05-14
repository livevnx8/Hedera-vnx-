#!/usr/bin/env python3
"""
Split real Hedera corpus into train/validation/test sets

This script splits a corpus into train, validation, and test sets with
configurable ratios. The splits are shuffled to ensure random distribution.

Usage:
    python3 split_real_corpus.py
"""

import json
import random
import sys
from typing import Tuple, List, Dict, Any


def split_corpus(corpus_path: str, train_ratio: float = 0.7, val_ratio: float = 0.15) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Split corpus into train/validation/test sets.
    
    Args:
        corpus_path: Path to corpus JSON file
        train_ratio: Ratio for training set (default 0.7)
        val_ratio: Ratio for validation set (default 0.15)
        
    Returns:
        Tuple of (train, validation, test) datasets
        
    Raises:
        FileNotFoundError: If corpus file does not exist
        json.JSONDecodeError: If corpus file is not valid JSON
        ValueError: If ratios are invalid
    """
    # Validate ratios
    assert 0 < train_ratio < 1, f"train_ratio must be between 0 and 1, got {train_ratio}"
    assert 0 < val_ratio < 1, f"val_ratio must be between 0 and 1, got {val_ratio}"
    assert train_ratio + val_ratio < 1, f"train_ratio + val_ratio must be < 1, got {train_ratio + val_ratio}"
    
    # Load corpus
    try:
        with open(corpus_path, 'r') as f:
            corpus = json.load(f)
    except FileNotFoundError:
        print(f"Error: Corpus file not found at {corpus_path}")
        raise
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse corpus JSON: {e}")
        raise
    
    print(f"Loaded {len(corpus)} samples from {corpus_path}")
    assert len(corpus) > 0, "Corpus should not be empty"
    
    # Shuffle
    random.shuffle(corpus)
    
    # Split
    train_end = int(len(corpus) * train_ratio)
    val_end = train_end + int(len(corpus) * val_ratio)
    
    train = corpus[:train_end]
    val = corpus[train_end:val_end]
    test = corpus[val_end:]
    
    print(f"Train: {len(train)} samples ({len(train)/len(corpus)*100:.1f}%)")
    print(f"Validation: {len(val)} samples ({len(val)/len(corpus)*100:.1f}%)")
    print(f"Test: {len(test)} samples ({len(test)/len(corpus)*100:.1f}%)")
    
    # Validate splits
    assert len(train) > 0, "Training set should not be empty"
    assert len(val) > 0, "Validation set should not be empty"
    assert len(test) > 0, "Test set should not be empty"
    assert len(train) + len(val) + len(test) == len(corpus), "Split sizes should sum to corpus size"
    
    # Save splits
    base_path = corpus_path.replace('.json', '')
    
    try:
        with open(f"{base_path}_train.json", 'w') as f:
            json.dump(train, f, indent=2)
        print(f"Saved train split to {base_path}_train.json")
        
        with open(f"{base_path}_val.json", 'w') as f:
            json.dump(val, f, indent=2)
        print(f"Saved validation split to {base_path}_val.json")
        
        with open(f"{base_path}_test.json", 'w') as f:
            json.dump(test, f, indent=2)
        print(f"Saved test split to {base_path}_test.json")
    except IOError as e:
        print(f"Error saving splits: {e}")
        raise
    
    return train, val, test


if __name__ == "__main__":
    try:
        # Split classification corpus
        split_corpus("/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus.json")
        
        # Split generation corpus
        split_corpus("/home/vera-live-0-1/hedera-llm-api/data/real_hedera_generation_corpus.json")
        
        print("\n=== Corpus Split Complete ===")
    except Exception as e:
        print(f"\nCorpus split failed: {e}")
        sys.exit(1)
