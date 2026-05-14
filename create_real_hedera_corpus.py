#!/usr/bin/env python3
"""
Create real Hedera corpus from blockchain data

This script fetches real transactions from Hedera mirror nodes and creates
training corpora for classification and generation tasks. The corpus includes
transaction features extracted from real blockchain data.

Usage:
    python3 create_real_hedera_corpus.py
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import json
import numpy as np
from starlit.hedera_real_data_fetcher import HederaDataFetcher, extract_features_from_real_transaction
from typing import List, Dict, Any, Tuple

# Transaction type mapping for classification
REAL_TRANSACTION_TYPES = [
    "CRYPTOTRANSFER",
    "TOKENCREATE",
    "TOKENTRANSFER",
    "CONTRACTCALL",
    "CONSENSUSSUBMITMESSAGE",
    "TOKENMINT",
    "SYSTEMDELETE",
    "SYSTEMUNDELETE",
    "FREEZE",
    "UNFREEZE"
]

REAL_TRANSACTION_TYPE_TO_IDX = {t: i for i, t in enumerate(REAL_TRANSACTION_TYPES)}


def create_real_hedera_corpus(network: str = "testnet", n_samples: int = 10000) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Create real Hedera corpus from blockchain data.
    
    Args:
        network: Network to fetch from (testnet or mainnet)
        n_samples: Number of samples to fetch
        
    Returns:
        Tuple of (classification_corpus, generation_corpus)
        
    Raises:
        Exception: If fetching transactions fails
    """
    print(f"=== Creating Real Hedera Corpus ===")
    print(f"Network: {network}")
    print(f"Target samples: {n_samples}\n")
    
    # Validate network parameter
    assert network in ["testnet", "mainnet"], f"Network must be 'testnet' or 'mainnet', got '{network}'"
    assert n_samples > 0, f"n_samples must be positive, got {n_samples}"
    
    # Fetch real transactions
    try:
        fetcher = HederaDataFetcher(network=network)
        transactions = fetcher.fetch_transactions(limit=n_samples)
    except Exception as e:
        print(f"Error fetching transactions: {e}")
        raise
    
    print(f"\nFetched {len(transactions)} transactions")
    assert len(transactions) > 0, "No transactions fetched from Hedera mirror node"
    
    # Create classification and generation corpora
    classification_corpus = []
    generation_corpus = []
    
    for transaction in transactions:
        # Extract features
        try:
            features = extract_features_from_real_transaction(transaction)
        except Exception as e:
            print(f"Error extracting features from transaction: {e}")
            continue
        
        # Validate features
        assert len(features) == 20, f"Expected 20 features, got {len(features)}"
        
        # Get transaction type for classification
        transaction_type = transaction.get("name", "UNKNOWN")
        label = REAL_TRANSACTION_TYPE_TO_IDX.get(transaction_type, 0)
        
        # Create classification sample
        classification_sample = {
            'features': features,
            'label': label
        }
        classification_corpus.append(classification_sample)
        
        # Create generation sample (same features for now)
        generation_sample = {
            'features': features,
            'output': features  # For now, predict the same features
        }
        generation_corpus.append(generation_sample)
    
    print(f"\nCreated corpus:")
    print(f"  Classification samples: {len(classification_corpus)}")
    print(f"  Generation samples: {len(generation_corpus)}")
    
    assert len(classification_corpus) > 0, "Classification corpus is empty"
    assert len(generation_corpus) > 0, "Generation corpus is empty"
    
    # Print class distribution
    label_counts = {}
    for sample in classification_corpus:
        label = sample['label']
        label_counts[label] = label_counts.get(label, 0) + 1
    
    print(f"\nClass distribution:")
    for label, count in sorted(label_counts.items()):
        print(f"  {REAL_TRANSACTION_TYPES[label]}: {count}")
    
    return classification_corpus, generation_corpus


def save_corpus(corpus: List[Dict[str, Any]], filepath: str) -> None:
    """
    Save corpus to JSON file.
    
    Args:
        corpus: Corpus to save
        filepath: Path to save corpus to
        
    Raises:
        IOError: If file cannot be written
    """
    try:
        with open(filepath, 'w') as f:
            json.dump(corpus, f, indent=2)
        print(f"Saved corpus to {filepath}")
    except IOError as e:
        print(f"Error saving corpus to {filepath}: {e}")
        raise


if __name__ == "__main__":
    try:
        # Create real Hedera corpus
        classification_corpus, generation_corpus = create_real_hedera_corpus(
            network="testnet",
            n_samples=1000  # Start with 1K for testing
        )
        
        # Save corpora
        save_corpus(classification_corpus, "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_classification_corpus.json")
        save_corpus(generation_corpus, "/home/vera-live-0-1/hedera-llm-api/data/real_hedera_generation_corpus.json")
        
        print("\n=== Real Hedera Corpus Creation Complete ===")
    except Exception as e:
        print(f"\nCorpus creation failed: {e}")
        sys.exit(1)
