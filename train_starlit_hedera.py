#!/usr/bin/env python3
"""
Train Starlit specialists with real Hedera blockchain data
Uses curriculum learning, transfer learning, and GPU acceleration
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import numpy as np
from starlit.distributed_training import PipelineParallelTrainer
from starlit.hedera_corpus_generation import create_hedera_specialist_definitions, HEDERA_DOMAINS
from starlit.hedera_corpus_generation import generate_hedera_transaction_corpus, generate_hedera_token_corpus, generate_hedera_consensus_corpus
import torch


def train_worker_hedera(spec_def):
    """Worker function for training Hedera specialist with real data and multi-task learning."""
    # Generate Hedera-specific corpus based on layer
    if spec_def['layer'] == 'domain':
        classification_corpus, generation_corpus = generate_hedera_transaction_corpus(spec_def['specialization'], n_samples=10000)
    elif spec_def['layer'] == 'concept':
        classification_corpus, generation_corpus = generate_hedera_token_corpus(
            spec_def['specialization'],
            spec_def['parent_domain'],
            n_samples=5000
        )
        # For concept/pattern, use simplified format
        classification_corpus, generation_corpus = generate_hedera_transaction_corpus(spec_def['specialization'], n_samples=5000)
    else:  # pattern
        classification_corpus, generation_corpus = generate_hedera_transaction_corpus(spec_def['specialization'], n_samples=1000)
    
    # Prepare corpus with multi-task format
    corpus = {
        'classification': classification_corpus,
        'generation': generation_corpus
    }
    
    # Train specialist with PyTorch for GPU acceleration
    from starlit.training_pipeline import train_specialist
    model = train_specialist(spec_def, corpus, use_pytorch=True)
    
    return spec_def['specialist_id'], model


def train_worker_hedera_with_transfer(spec_def, parent_specialists):
    """Worker function with transfer learning for Hedera specialists."""
    # Find parent specialist
    if spec_def['layer'] == 'concept':
        parent_domain = spec_def.get('parent_domain')
        parent_specialist = parent_specialists.get(f"hedera_domain_{parent_domain}_000")
    else:  # pattern
        parent_concept = spec_def.get('parent_concept')
        parent_specialist = parent_specialists.get(f"hedera_concept_{parent_concept}_000")
    
    # Generate Hedera-specific corpus
    if spec_def['layer'] == 'concept':
        classification_corpus, generation_corpus = generate_hedera_transaction_corpus(spec_def['specialization'], n_samples=5000)
    else:  # pattern
        classification_corpus, generation_corpus = generate_hedera_transaction_corpus(spec_def['specialization'], n_samples=1000)
    
    # Initialize from parent specialist if available
    if parent_specialist is not None:
        spec_def['transfer_from'] = parent_specialist
        print(f"Initializing {spec_def['specialist_id']} from parent specialist")
    
    # Prepare corpus with multi-task format
    corpus = {
        'classification': classification_corpus,
        'generation': generation_corpus
    }
    
    # Train specialist with PyTorch for GPU acceleration
    from starlit.training_pipeline import train_specialist
    model = train_specialist(spec_def, corpus, use_pytorch=True)
    
    return spec_def['specialist_id'], model


def train_hedera_specialists_parallel(specialist_defs, num_processes=2):
    """Train Hedera specialists in parallel."""
    from multiprocessing import Pool
    
    with Pool(processes=num_processes) as pool:
        results = pool.map(train_worker_hedera, specialist_defs)
    
    return dict(results)


def train_worker_with_parent(spec_def, parent_specialists):
    """Helper function for starmap - trains specialist with parent."""
    return train_worker_hedera_with_transfer(spec_def, parent_specialists)


def main():
    print("Starting Starlit training with real Hedera blockchain data...")
    print("Using curriculum learning, transfer learning, and GPU acceleration\n")
    
    # Check for GPU
    if torch.cuda.is_available():
        print(f"✓ GPU detected: {torch.cuda.get_device_name(0)}")
        print(f"✓ CUDA available: {torch.cuda.is_available()}")
    else:
        print("⚠ No GPU detected, falling back to CPU (slower)")
    
    # Create Hedera specialist definitions
    domain_defs, concept_defs, pattern_defs = create_hedera_specialist_definitions()
    
    print(f"\nHedera training configuration:")
    print(f"  - Domain specialists: {len(domain_defs)}")
    print(f"  - Concept specialists: {len(concept_defs)}")
    print(f"  - Pattern specialists: {len(pattern_defs)}")
    print(f"  - Total: {len(domain_defs) + len(concept_defs) + len(pattern_defs)} Hedera specialists")
    print(f"\nHedera domains: {', '.join(HEDERA_DOMAINS)}")
    
    # Initialize pipeline parallel trainer
    trainer = PipelineParallelTrainer(temperature=3.0, alpha=0.5)
    
    # Phase 1: Train domain specialists
    print("\n=== Phase 1: Training Hedera domain specialists ===")
    domain_results = train_hedera_specialists_parallel(domain_defs, num_processes=2)
    trainer.domain_specialists = domain_results
    print(f"Completed {len(domain_results)} domain specialists")
    
    # Phase 2: Train concept specialists with transfer learning
    print("\n=== Phase 2: Training Hedera concept specialists with transfer learning ===")
    concept_results = {}
    from multiprocessing import Pool
    with Pool(processes=2) as pool:
        args = [(spec_def, domain_results) for spec_def in concept_defs]
        results = pool.starmap(train_worker_with_parent, args)
    for spec_id, model in results:
        concept_results[spec_id] = model
    trainer.concept_specialists = concept_results
    print(f"Completed {len(concept_results)} concept specialists")
    
    # Phase 3: Train pattern specialists with transfer learning
    print("\n=== Phase 3: Training Hedera pattern specialists with transfer learning ===")
    pattern_results = {}
    with Pool(processes=2) as pool:
        args = [(spec_def, concept_results) for spec_def in pattern_defs]
        results = pool.starmap(train_worker_with_parent, args)
    for spec_id, model in results:
        pattern_results[spec_id] = model
    trainer.pattern_specialists = pattern_results
    print(f"Completed {len(pattern_results)} pattern specialists")
    
    print(f"\n=== Hedera training complete ===")
    print(f"Results:")
    print(f"  - Domain: {len(domain_results)} specialists")
    print(f"  - Concept: {len(concept_results)} specialists")
    print(f"  - Pattern: {len(pattern_results)} specialists")
    print(f"\nHedera specialists trained with real blockchain data")


if __name__ == "__main__":
    main()
