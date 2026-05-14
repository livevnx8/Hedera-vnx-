"""
Advanced Hedera corpus generation with HIP-993, block streams, clipper, and complex features
Harder training dataset for Starlit specialists
"""

import json
import random
import numpy as np
from typing import List, Dict, Any, Tuple

# HIP-993 related features (Staking Rewards)
HIP_993_FEATURES = {
    "staking_reward_rate": [0.03, 0.05, 0.07, 0.10, 0.15],
    "node_reward_distribution": ["proportional", "weighted", "fixed"],
    "reward_calculation_method": ["hbar_based", "time_based", "hybrid"]
}

# Block stream features
BLOCK_STREAM_FEATURES = {
    "block_hash_length": [64, 128, 256],
    "block_timestamp_precision": ["nanoseconds", "microseconds", "milliseconds"],
    "block_consensus_round": ["fast", "medium", "slow"],
    "block_transaction_count": [100, 500, 1000, 5000, 10000]
}

# New clipper features
CLIPPER_FEATURES = {
    "clipper_algorithm": ["LZ4", "ZSTD", "Snappy"],
    "compression_ratio": [0.5, 0.6, 0.7, 0.8, 0.9],
    "compression_speed": ["fast", "medium", "slow"],
    "decompression_speed": ["fast", "medium", "slow"]
}

# Complex Hedera domains for advanced training
ADVANCED_DOMAINS = [
    "hip_governance",
    "block_streams",
    "data_compression",
    "staking_rewards",
    "consensus_mechanisms",
    "smart_contract_optimization"
]

# Advanced transaction types
ADVANCED_TRANSACTION_TYPES = [
    "hip_proposal_submit",
    "hip_vote_cast",
    "block_stream_subscribe",
    "block_stream_query",
    "data_compress",
    "data_decompress",
    "stake_hbar",
    "unstake_hbar",
    "claim_rewards",
    "consensus_message_compress"
]

ADVANCED_TRANSACTION_TYPE_TO_IDX = {t: i for i, t in enumerate(ADVANCED_TRANSACTION_TYPES)}


def extract_advanced_hedera_features(transaction: Dict[str, Any]) -> Dict[str, float]:
    """
    Extract advanced features from Hedera transaction with HIP-993, block streams, clipper.
    
    Args:
        transaction: Hedera transaction data
        
    Returns:
        Dictionary of normalized features (20 features for harder training)
    """
    features = {}
    
    # HIP-993 staking features
    staking_amount = transaction.get("staking_amount", 0.0)
    features["staking_amount_log"] = np.log1p(max(0, staking_amount)) / 20.0
    
    reward_rate = transaction.get("reward_rate", 0.05)
    features["reward_rate_normalized"] = float(reward_rate) / 0.20
    
    staking_duration = transaction.get("staking_duration", 0)
    features["staking_duration_normalized"] = float(staking_duration) / 31536000.0  # Normalize by year
    
    # Block stream features
    block_height = transaction.get("block_height", 0)
    features["block_height_log"] = np.log1p(max(0, block_height)) / 30.0
    
    block_gas_used = transaction.get("block_gas_used", 0)
    features["block_gas_used_log"] = np.log1p(max(0, block_gas_used)) / 25.0
    
    stream_subscription_id = transaction.get("stream_subscription_id", "0.0.1000")
    stream_num = int(stream_subscription_id.split(".")[-1]) if "." in stream_subscription_id else 1000
    features["stream_id_normalized"] = float(stream_num) / 100000.0
    
    # Clipper compression features
    data_size_before = transaction.get("data_size_before", 0)
    features["data_size_before_log"] = np.log1p(max(0, data_size_before)) / 20.0
    
    data_size_after = transaction.get("data_size_after", 0)
    features["data_size_after_log"] = np.log1p(max(0, data_size_after)) / 20.0
    
    compression_ratio = transaction.get("compression_ratio", 0.5)
    features["compression_ratio_normalized"] = float(compression_ratio)
    
    # HIP governance features
    hip_id = transaction.get("hip_id", 993)
    features["hip_id_normalized"] = float(hip_id) / 1000.0
    
    vote_count = transaction.get("vote_count", 0)
    features["vote_count_log"] = np.log1p(max(0, vote_count)) / 15.0
    
    # Account and token features
    account_id = transaction.get("account_id", "0.0.1000")
    account_num = int(account_id.split(".")[-1]) if "." in account_id else 1000
    features["account_id_normalized"] = float(account_num) / 10000.0
    
    token_id = transaction.get("token_id", "0.0.100000")
    token_num = int(token_id.split(".")[-1]) if "." in token_id else 100000
    features["token_id_normalized"] = float(token_num) / 1000000.0
    
    # Transaction type
    transaction_type = transaction.get("transaction_type", "hip_proposal_submit")
    features["transaction_type_idx"] = float(ADVANCED_TRANSACTION_TYPE_TO_IDX.get(transaction_type, 0))
    
    # Timestamp features
    timestamp = transaction.get("timestamp", random.randint(0, 86400))
    features["hour_of_day"] = float(timestamp % 86400) / 86400.0
    features["day_of_week"] = float((timestamp // 86400) % 7) / 7.0
    
    # Fee features
    transaction_fee = transaction.get("transaction_fee", 0.0)
    features["transaction_fee_log"] = np.log1p(max(0, transaction_fee)) / 15.0
    
    # Network congestion
    network_congestion = transaction.get("network_congestion", 0.5)
    features["network_congestion_normalized"] = float(network_congestion)
    
    # Additional features to reach exactly 20
    features["memo_length"] = float(len(transaction.get("memo", ""))) / 100.0
    features["max_fee"] = float(transaction.get("max_fee", 0.1)) / 1.0
    
    return features


def generate_advanced_hedera_transaction(domain: str, index: int) -> Dict[str, Any]:
    """
    Generate advanced Hedera transaction with HIP-993, block streams, clipper features.
    
    Args:
        domain: Hedera domain
        index: Sample index
        
    Returns:
        Transaction data
    """
    # HIP-993 staking rewards
    if domain == "staking_rewards":
        return {
            "type": random.choice(["stake_hbar", "unstake_hbar", "claim_rewards"]),
            "staking_amount": random.uniform(100, 10000),
            "reward_rate": random.choice(HIP_993_FEATURES["staking_reward_rate"]),
            "staking_duration": random.randint(86400, 31536000),  # 1 day to 1 year
            "account_id": f"0.0.{random.randint(1000, 9999)}",
            "transaction_fee": random.uniform(0.001, 0.1),
            "timestamp": random.randint(0, 86400 * 365),
            "network_congestion": random.uniform(0.1, 0.9)
        }
    
    # Block streams
    elif domain == "block_streams":
        return {
            "type": random.choice(["block_stream_subscribe", "block_stream_query"]),
            "block_height": random.randint(100000, 10000000),
            "block_gas_used": random.randint(1000, 1000000),
            "stream_subscription_id": f"0.0.{random.randint(1000, 99999)}",
            "account_id": f"0.0.{random.randint(1000, 9999)}",
            "transaction_fee": random.uniform(0.001, 0.1),
            "timestamp": random.randint(0, 86400 * 365),
            "network_congestion": random.uniform(0.1, 0.9)
        }
    
    # Data compression (clipper)
    elif domain == "data_compression":
        return {
            "type": random.choice(["data_compress", "data_decompress"]),
            "data_size_before": random.randint(1000, 10000000),
            "data_size_after": random.randint(500, 5000000),
            "compression_ratio": random.choice(CLIPPER_FEATURES["compression_ratio"]),
            "clipper_algorithm": random.choice(CLIPPER_FEATURES["clipper_algorithm"]),
            "account_id": f"0.0.{random.randint(1000, 9999)}",
            "transaction_fee": random.uniform(0.001, 0.1),
            "timestamp": random.randint(0, 86400 * 365),
            "network_congestion": random.uniform(0.1, 0.9)
        }
    
    # HIP governance
    elif domain == "hip_governance":
        return {
            "type": random.choice(["hip_proposal_submit", "hip_vote_cast"]),
            "hip_id": random.randint(1, 1000),
            "vote_count": random.randint(0, 10000),
            "account_id": f"0.0.{random.randint(1000, 9999)}",
            "transaction_fee": random.uniform(0.001, 0.1),
            "timestamp": random.randint(0, 86400 * 365),
            "network_congestion": random.uniform(0.1, 0.9)
        }
    
    # Consensus mechanisms
    elif domain == "consensus_mechanisms":
        return {
            "type": "consensus_message_compress",
            "data_size_before": random.randint(100, 10000),
            "data_size_after": random.randint(50, 5000),
            "compression_ratio": random.choice(CLIPPER_FEATURES["compression_ratio"]),
            "topic_id": f"0.0.{random.randint(1000, 99999)}",
            "account_id": f"0.0.{random.randint(1000, 9999)}",
            "transaction_fee": random.uniform(0.001, 0.1),
            "timestamp": random.randint(0, 86400 * 365),
            "network_congestion": random.uniform(0.1, 0.9)
        }
    
    # Smart contract optimization
    else:
        return {
            "type": random.choice(["stake_hbar", "unstake_hbar"]),
            "staking_amount": random.uniform(100, 10000),
            "reward_rate": random.choice(HIP_993_FEATURES["staking_reward_rate"]),
            "staking_duration": random.randint(86400, 31536000),
            "account_id": f"0.0.{random.randint(1000, 9999)}",
            "token_id": f"0.0.{random.randint(100000, 999999)}",
            "transaction_fee": random.uniform(0.001, 0.1),
            "timestamp": random.randint(0, 86400 * 365),
            "network_congestion": random.uniform(0.1, 0.9)
        }


def generate_advanced_hedera_corpus(domain: str, n_samples: int = 10000) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Generate advanced Hedera corpus with HIP-993, block streams, clipper features.
    
    Args:
        domain: Hedera domain
        n_samples: Number of samples to generate
        
    Returns:
        Tuple of (classification_dataset, generation_dataset)
    """
    classification_corpus = []
    generation_corpus = []
    
    for i in range(n_samples):
        # Generate advanced Hedera transaction
        transaction = generate_advanced_hedera_transaction(domain, i)
        
        # Extract advanced features
        features = extract_advanced_hedera_features(transaction)
        
        # Classification task: predict transaction type
        transaction_type = transaction["type"]
        if transaction_type in ADVANCED_TRANSACTION_TYPE_TO_IDX:
            label = ADVANCED_TRANSACTION_TYPE_TO_IDX[transaction_type]
        else:
            label = 0  # Default to first class
        classification_sample = {
            "features": features,
            "label": label
        }
        classification_corpus.append(classification_sample)
        
        # Generation task: predict output features (all 20 features)
        generation_sample = {
            "features": features,
            "output": features  # Use all features as output
        }
        generation_corpus.append(generation_sample)
    
    return classification_corpus, generation_corpus


def create_advanced_hedera_specialist_definitions():
    """
    Create advanced Hedera specialist definitions for HIP-993, block streams, clipper.
    
    Returns:
        Tuple of (domain_defs, concept_defs, pattern_defs)
    """
    domain_defs = []
    concept_defs = []
    pattern_defs = []
    
    # Domain specialists
    for domain in ADVANCED_DOMAINS:
        domain_defs.append({
            "specialist_id": f"hedera_advanced_domain_{domain}_000",
            "layer": "domain",
            "specialization": domain,
            "lattice_size": 120,
            "vocabulary_size": 128,
            "learning_rate": 0.01,
            "training_epochs": 100,
            "batch_size": 32
        })
    
    # Concept specialists (2-3 per domain)
    for domain in ADVANCED_DOMAINS:
        concepts = []
        if domain == "staking_rewards":
            concepts = ["reward_calculation", "stake_management", "reward_claiming"]
        elif domain == "block_streams":
            concepts = ["stream_subscription", "block_query", "stream_filtering"]
        elif domain == "data_compression":
            concepts = ["clipper_lz4", "clipper_zstd", "clipper_snappy"]
        elif domain == "hip_governance":
            concepts = ["hip_proposal", "hip_voting", "hip_execution"]
        elif domain == "consensus_mechanisms":
            concepts = ["consensus_compress", "consensus_decompress", "consensus_routing"]
        else:
            concepts = ["contract_optimization", "gas_efficiency", "storage_optimization"]
        
        for i, concept in enumerate(concepts):
            concept_defs.append({
                "specialist_id": f"hedera_advanced_concept_{concept}_000",
                "layer": "concept",
                "specialization": concept,
                "parent_domain": domain,
                "lattice_size": 60,
                "vocabulary_size": 64,
                "learning_rate": 0.01,
                "training_epochs": 100,
                "batch_size": 32
            })
    
    # Pattern specialists (2-3 per concept)
    for concept_def in concept_defs[:6]:  # Limit to first 6 concepts for testing
        concept = concept_def["specialization"]
        patterns = [f"{concept}_pattern_{i}" for i in range(2)]
        
        for i, pattern in enumerate(patterns):
            pattern_defs.append({
                "specialist_id": f"hedera_advanced_pattern_{pattern}_000",
                "layer": "pattern",
                "specialization": pattern,
                "parent_concept": concept,
                "parent_domain": concept_def["parent_domain"],
                "lattice_size": 30,
                "vocabulary_size": 32,
                "learning_rate": 0.01,
                "training_epochs": 100,
                "batch_size": 32
            })
    
    return domain_defs, concept_defs, pattern_defs
