#!/usr/bin/env python3
"""
Train Starlit specialists using optimized infrastructure
Uses curriculum learning, transfer learning, and parallel training with GPU acceleration
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.distributed_training import PipelineParallelTrainer
from starlit.pipeline_orchestrator import MicroSpecialistPipeline
from starlit.corpus_generation import DOMAINS, get_concepts_for_domain, get_patterns_for_concept
import torch


def create_specialist_definitions():
    """Create specialist definitions for training."""
    
    # Domain specialists
    domain_defs = []
    for i, domain in enumerate(DOMAINS):
        domain_defs.append({
            "specialist_id": f"domain_{domain}_{i:03d}",
            "layer": "domain",
            "specialization": domain,
            "lattice_size": 120,
            "vocabulary_size": 128,
            "training_epochs": 100,
            "learning_rate": 0.01,
            "batch_size": 32
        })
    
    # Concept specialists
    concept_defs = []
    for i, domain in enumerate(DOMAINS):
        concepts = get_concepts_for_domain(domain)
        for concept in concepts:
            if len(concept_defs) >= 10:  # Limit to 10 for validation
                break
            concept_defs.append({
                "specialist_id": f"concept_{concept}_{len(concept_defs):03d}",
                "layer": "concept",
                "specialization": concept,
                "parent_domain": domain,
                "lattice_size": 30,
                "vocabulary_size": 256,
                "training_epochs": 100,
                "learning_rate": 0.01,
                "batch_size": 32
            })
    
    # Pattern specialists
    pattern_defs = []
    for i, domain in enumerate(DOMAINS):
        concepts = get_concepts_for_domain(domain)
        for concept in concepts:
            patterns = get_patterns_for_concept(concept)
            for pattern in patterns:
                if len(pattern_defs) >= 20:  # Limit to 20 for validation
                    break
                pattern_safe = pattern.replace(" ", "_").replace("<", "lt").replace(">", "gt")
                pattern_defs.append({
                    "specialist_id": f"pattern_{pattern_safe}_{len(pattern_defs):03d}",
                    "layer": "pattern",
                    "specialization": pattern,
                    "parent_concept": concept,
                    "parent_domain": domain,
                    "lattice_size": 15,
                    "vocabulary_size": 128,
                    "training_epochs": 100,
                    "learning_rate": 0.01,
                    "batch_size": 32
                })
            if len(pattern_defs) >= 20:
                break
        if len(pattern_defs) >= 20:
            break
    
    return domain_defs, concept_defs, pattern_defs


def main():
    print("Starting Starlit training with optimized infrastructure...")
    print("Using curriculum learning with transfer learning and GPU acceleration\n")
    
    # Check for GPU
    if torch.cuda.is_available():
        print(f"✓ GPU detected: {torch.cuda.get_device_name(0)}")
        print(f"✓ CUDA available: {torch.cuda.is_available()}")
    else:
        print("⚠ No GPU detected, falling back to CPU (slower)")
    
    # Create specialist definitions
    domain_defs, concept_defs, pattern_defs = create_specialist_definitions()
    
    print(f"\nTraining configuration:")
    print(f"  - Domain specialists: {len(domain_defs)}")
    print(f"  - Concept specialists: {len(concept_defs)}")
    print(f"  - Pattern specialists: {len(pattern_defs)}")
    print(f"  - Total: {len(domain_defs) + len(concept_defs) + len(pattern_defs)} specialists\n")
    
    # Initialize pipeline parallel trainer with knowledge distillation
    trainer = PipelineParallelTrainer(temperature=3.0, alpha=0.5)
    
    # Train using curriculum learning
    print("Starting curriculum learning with GPU acceleration...\n")
    
    try:
        results = trainer.train_curriculum(
            domain_defs=domain_defs,
            concept_defs=concept_defs,
            pattern_defs=pattern_defs,
            num_processes=2  # Use 2 parallel processes for GPU training
        )
        
        print(f"\nTraining complete!")
        print(f"Results:")
        print(f"  - Domain: {len(results['domain'])} specialists")
        print(f"  - Concept: {len(results['concept'])} specialists")
        print(f"  - Pattern: {len(results['pattern'])} specialists")
        print(f"\nArtifacts can be exported using the artifact format")
        
    except Exception as e:
        print(f"\nTraining failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
