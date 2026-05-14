#!/usr/bin/env python3
"""
Generate synthetic Starlit artifacts for architecture validation
This creates mock artifacts to test coordination/synthesis/verifiability layers without slow training
"""

import os
import json
import numpy as np
import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.artifact_format import BitLatticeArtifact, create_header, create_metadata
from starlit.bitlattice_model import pack_ternary_weights


def create_synthetic_artifact(specialist_id: str, layer: str, specialization: str, lattice_size: int):
    """
    Create a synthetic BitLattice artifact without training.

    Args:
        specialist_id: Specialist identifier
        layer: Layer type (domain/concept/pattern)
        specialization: Specialization description
        lattice_size: Size of lattice
    """
    # Create synthetic ternary weights (random -1, 0, +1) as integers
    weights = np.random.choice([-1, 0, 1], size=(lattice_size, lattice_size))

    # Pack weights to bytes
    packed_weights = pack_ternary_weights(weights)

    # Create artifact
    header = create_header(lattice_size)
    metadata = create_metadata(
        architecture=layer,
        specialization=specialization,
        specialist_id=specialist_id,
        lattice_size=lattice_size,
        vocabulary_size=128,
        corpus_hash="synthetic_validation",
        training_config={
            "epochs": 0,
            "learning_rate": 0.01,
            "batch_size": 32
        }
    )

    artifact = BitLatticeArtifact(
        header=header,
        metadata=metadata,
        weights=packed_weights
    )

    return artifact


def generate_synthetic_specialists():
    """Generate synthetic specialists for validation."""
    
    artifact_dir = "/home/vera-live-0-1/hedera-llm-api/starlit-artifacts"
    os.makedirs(f"{artifact_dir}/domain", exist_ok=True)
    os.makedirs(f"{artifact_dir}/concept", exist_ok=True)
    os.makedirs(f"{artifact_dir}/pattern", exist_ok=True)
    
    # Generate domain specialists (5)
    domains = ["mathematics", "language", "logic", "reasoning", "creativity"]
    for i, domain in enumerate(domains):
        artifact = create_synthetic_artifact(
            f"domain_{domain}_{i:03d}",
            "domain",
            domain,
            120
        )
        artifact.save(f"{artifact_dir}/domain/domain_{domain}_{i:03d}.vnx")
        print(f"Created synthetic artifact: domain_{domain}_{i:03d}")
    
    # Generate concept specialists (10)
    concepts = [
        ("addition", "mathematics"),
        ("subtraction", "mathematics"),
        ("grammar", "language"),
        ("vocabulary", "language"),
        ("deduction", "logic"),
        ("induction", "logic"),
        ("analysis", "reasoning"),
        ("synthesis", "reasoning"),
        ("metaphor", "creativity"),
        ("imagery", "creativity")
    ]
    for i, (concept, domain) in enumerate(concepts):
        artifact = create_synthetic_artifact(
            f"concept_{concept}_{i:03d}",
            "concept",
            concept,
            30
        )
        artifact.save(f"{artifact_dir}/concept/concept_{concept}_{i:03d}.vnx")
        print(f"Created synthetic artifact: concept_{concept}_{i:03d}")
    
    # Generate pattern specialists (20)
    patterns = [
        ("add two positive integers", "addition", "mathematics"),
        ("add positive and negative integers", "addition", "mathematics"),
        ("subtract positive integers", "subtraction", "mathematics"),
        ("identify subject in sentence", "grammar", "language"),
        ("identify verb in sentence", "grammar", "language"),
        ("define simple word", "vocabulary", "language"),
        ("deduce conclusion from premise", "deduction", "logic"),
        ("apply deductive rule", "deduction", "logic"),
        ("analyze cause and effect", "analysis", "reasoning"),
        ("analyze pros and cons", "analysis", "reasoning"),
        ("create simple metaphor", "metaphor", "creativity"),
        ("interpret metaphor", "metaphor", "creativity"),
        ("visualize scene from description", "imagery", "creativity"),
        ("describe visual scene", "imagery", "creativity"),
        ("multiply two numbers", "multiplication", "mathematics"),
        ("divide two numbers", "division", "mathematics"),
        ("identify noun in sentence", "grammar", "language"),
        ("identify adjective in sentence", "grammar", "language"),
        ("apply inductive reasoning", "induction", "logic"),
        ("generalize from examples", "induction", "logic")
    ]
    for i, (pattern, concept, domain) in enumerate(patterns):
        pattern_safe = pattern.replace(" ", "_").replace("<", "lt").replace(">", "gt")
        artifact = create_synthetic_artifact(
            f"pattern_{pattern_safe}_{i:03d}",
            "pattern",
            pattern,
            15
        )
        artifact.save(f"{artifact_dir}/pattern/pattern_{pattern_safe}_{i:03d}.vnx")
        print(f"Created synthetic artifact: pattern_{pattern_safe}_{i:03d}")
    
    print(f"\nGenerated 35 synthetic artifacts:")
    print(f"  - Domain: 5")
    print(f"  - Concept: 10")
    print(f"  - Pattern: 20")
    print(f"\nArtifacts saved to {artifact_dir}")
    print("These can be used to test coordination/synthesis/verifiability layers")


if __name__ == "__main__":
    generate_synthetic_specialists()
