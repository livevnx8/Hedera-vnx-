#!/usr/bin/env python3
"""
Test 1: Disable ternary quantization to see if model can learn

This test validates that the model can learn effectively when ternary
quantization is disabled. If the loss decreases significantly from
the initial value (ln(10) ≈ 2.30), it confirms that quantization
was blocking learning.

Expected Results:
- Loss should decrease from ~2.30 to < 1.5
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


def create_simple_model(num_features=20, num_classes=10, hidden_size=120):
    """Create a simple MLP model without ternary quantization."""
    return nn.Sequential(
        nn.Linear(num_features, hidden_size),
        nn.ReLU(),
        nn.Linear(hidden_size, hidden_size),
        nn.ReLU(),
        nn.Linear(hidden_size, num_classes)
    )


def test_no_quantization():
    """
    Test training without ternary quantization.
    
    Returns:
        tuple: (final_loss, final_accuracy) from training
    """
    print("=== Test 1: Training WITHOUT ternary quantization ===")
    print("This will determine if quantization is blocking learning\n")
    
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
    
    # Create model without quantization
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Training on {device}")
    
    model = create_simple_model(num_features=20, num_classes=10, hidden_size=120).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    # Train for 10 epochs
    print("\nTraining for 10 epochs...")
    initial_loss = None
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
        
        if epoch == 0:
            initial_loss = avg_loss
        
        final_loss = avg_loss
        final_accuracy = avg_accuracy
        
        print(f"Epoch {epoch}: Loss: {avg_loss:.4f}, Accuracy: {avg_accuracy:.2%}")
    
    print("\n=== Test 1 Complete ===")
    
    # Assertions based on expected results
    assert initial_loss is not None, "Should have captured initial loss"
    assert final_loss < 2.0, f"Final loss should be < 2.0, got {final_loss:.4f}"
    assert final_accuracy > 0.30, f"Final accuracy should be > 30%, got {final_accuracy:.2%}"
    
    if final_loss < 2.0:
        print("✓ SUCCESS: Loss decreased - quantization was the blocker!")
    else:
        print("✗ FAILED: Loss still stuck - quantization is not the only issue")
    
    return final_loss, final_accuracy


if __name__ == "__main__":
    loss, accuracy = test_no_quantization()
    
    if loss is not None and accuracy is not None:
        print(f"\nTest completed successfully!")
        print(f"Loss: {loss:.4f}, Accuracy: {accuracy:.2%}")
    else:
        print("\nTest failed!")
        sys.exit(1)
