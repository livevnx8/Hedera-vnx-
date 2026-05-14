#!/usr/bin/env python3
"""
Test 3: Simple linear layer baseline (no hidden layers)

This test validates that a simple linear model can learn on the dataset.
If the linear model achieves reasonable accuracy, it confirms that:
- The data and features are valid
- The problem is not data-related
- Any issues with BitLattice are architecture-specific

Expected Results:
- Loss should decrease from initial value
- Accuracy should reach > 30%
- Training should complete without errors
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import TensorDataset, DataLoader

from starlit.hedera_advanced_corpus import generate_advanced_hedera_corpus


def create_linear_baseline(num_features=20, num_classes=10):
    """Create a simple linear baseline (no hidden layers)."""
    return nn.Linear(num_features, num_classes)


def test_linear_baseline():
    """
    Test simple linear baseline model.
    
    Returns:
        tuple: (final_loss, final_accuracy) from training
    """
    print("=== Test 3: Simple Linear Layer Baseline ===")
    print("This will test if the architecture itself is the issue\n")
    
    # Generate data
    print("Generating advanced Hedera corpus...")
    try:
        classification_corpus, _ = generate_advanced_hedera_corpus("staking_rewards", n_samples=10000)
    except Exception as e:
        print(f"Error generating corpus: {e}")
        return None, None
    
    assert len(classification_corpus) > 0, "Corpus should not be empty"
    print(f"Generated {len(classification_corpus)} samples")
    
    # Prepare data
    features = torch.tensor([list(item['features'].values()) for item in classification_corpus], dtype=torch.float32)
    labels = torch.tensor([item['label'] for item in classification_corpus], dtype=torch.long)
    
    assert features.shape[1] == 20, "Features should have 20 dimensions"
    assert labels.shape[0] == len(classification_corpus), "Labels count should match corpus size"
    
    dataset = TensorDataset(features, labels)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    # Create simple linear model
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Training on {device}")
    
    model = create_linear_baseline(num_features=20, num_classes=10).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    # Train for 10 epochs
    print("\nTraining for 10 epochs...")
    final_loss = None
    final_accuracy = None
    
    for epoch in range(10):
        total_loss = 0
        total_accuracy = 0
        num_batches = 0
        
        model.train()
        for batch_features, batch_labels in dataloader:
            batch_features = batch_features.to(device)
            batch_labels = batch_labels.to(device)
            
            # Forward pass
            logits = model(batch_features)
            
            # Compute loss
            loss = F.cross_entropy(logits, batch_labels)
            
            # Backward pass
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            # Compute accuracy
            with torch.no_grad():
                predictions = torch.argmax(logits, dim=1)
                accuracy = (predictions == batch_labels).float().mean().item()
            
            total_loss += loss.item()
            total_accuracy += accuracy
            num_batches += 1
        
        avg_loss = total_loss / num_batches
        avg_accuracy = total_accuracy / num_batches
        
        final_loss = avg_loss
        final_accuracy = avg_accuracy
        
        print(f"Epoch {epoch}: Loss: {avg_loss:.4f}, Accuracy: {avg_accuracy:.2%}")
    
    print("\n=== Test 3 Complete ===")
    
    # Assertions based on expected results
    assert final_loss is not None, "Should have captured final loss"
    assert final_loss < 1.5, f"Final loss should be < 1.5, got {final_loss:.4f}"
    assert final_accuracy > 0.30, f"Final accuracy should be > 30%, got {final_accuracy:.2%}"
    
    if final_loss < 1.5:
        print("✓ Linear model learns - architecture is not the issue")
    else:
        print("✗ Linear model fails - data or feature issue")
    
    return final_loss, final_accuracy


if __name__ == "__main__":
    loss, accuracy = test_linear_baseline()
    
    if loss is not None and accuracy is not None:
        print(f"\nTest completed successfully!")
        print(f"Loss: {loss:.4f}, Accuracy: {accuracy:.2%}")
    else:
        print("\nTest failed!")
        sys.exit(1)
