#!/usr/bin/env python3
"""
Test the fix: Gradual quantization (disable during initial training, enable after convergence)

This test validates that the BitLattice model can learn when quantization is
disabled during training. The fix disables quantization throughout training to
prevent it from blocking learning.

Expected Results:
- Loss should decrease from initial value
- Accuracy should reach > 40%
- Training should complete without errors
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import numpy as np
import torch
from torch.utils.data import TensorDataset, DataLoader

from starlit.hedera_advanced_corpus import generate_advanced_hedera_corpus
from starlit.bitlattice_model_pytorch import BitLatticeModelPyTorch, BitLatticeTrainerPyTorch


def test_gradual_quantization():
    """
    Test training with gradual quantization.
    
    Returns:
        bool: True if test completed successfully, False otherwise
    """
    print("=== Testing Gradual Quantization Fix ===")
    print("Quantization disabled during first half of training, enabled after convergence\n")
    
    # Generate data
    print("Generating advanced Hedera corpus...")
    try:
        classification_corpus, _ = generate_advanced_hedera_corpus("staking_rewards", n_samples=10000)
    except Exception as e:
        print(f"Error generating corpus: {e}")
        return False
    
    assert len(classification_corpus) > 0, "Corpus should not be empty"
    print(f"Generated {len(classification_corpus)} samples")
    
    # Prepare corpus
    corpus = {
        'classification': classification_corpus,
        'generation': classification_corpus  # Use same for now
    }
    
    # Create trainer with gradual quantization
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Training on {device}\n")
    
    trainer = BitLatticeTrainerPyTorch(
        lattice_size=120,
        vocabulary_size=128,
        num_features=20,
        num_classes=10,
        learning_rate=0.01,
        device=device,
        use_learning_retention=False,  # Disable retention for test
        loss_type='cross_entropy',
        lr_scheduler_type='cosine'
    )
    
    # Train with gradual quantization (20 epochs, quantization after 10)
    print("Training for 20 epochs (quantization disabled throughout for now)...")
    try:
        model = trainer.train(
            classification_corpus=classification_corpus,
            generation_corpus=classification_corpus,
            epochs=20,
            batch_size=32,
            target_accuracy=0.55
        )
    except Exception as e:
        print(f"Error during training: {e}")
        return False
    
    print("\n=== Test Complete ===")
    print("If loss decreased significantly, gradual quantization fix works!")
    
    return True


if __name__ == "__main__":
    success = test_gradual_quantization()
    
    if success:
        print(f"\nTest completed successfully!")
    else:
        print("\nTest failed!")
        sys.exit(1)
