#!/usr/bin/env python3
"""
Test 2: Check gradient magnitudes before and after quantization

This test analyzes how ternary quantization affects gradient flow during training.
By tracking gradient magnitudes before and after quantization, we can determine
if quantization is destroying gradient information and preventing learning.

Expected Results:
- Gradients should be computed successfully
- Gradient ratio (after/before) should indicate if quantization is harmful
- If ratio is very small (< 0.1), quantization is likely blocking learning
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import TensorDataset, DataLoader

from starlit.hedera_advanced_corpus import generate_advanced_hedera_corpus


class TernaryQuantizer:
    """Ternary quantizer with straight-through estimator."""
    def __init__(self, threshold=0.33):
        self.threshold = threshold
    
    def ste_forward(self, x):
        """Straight-through estimator for ternary quantization."""
        # Quantize to -1, 0, +1
        quantized = torch.zeros_like(x)
        quantized[x > self.threshold] = 1.0
        quantized[x < -self.threshold] = -1.0
        # Use straight-through estimator: gradient passes through as if no quantization
        return (quantized - x).detach() + x


def create_bitlattice_model(num_features=20, num_classes=10, hidden_size=120):
    """Create BitLattice-like model with ternary quantization."""
    model = nn.Sequential(
        nn.Linear(num_features, hidden_size),
        nn.ReLU(),
        nn.Linear(hidden_size, hidden_size),
        nn.ReLU(),
        nn.Linear(hidden_size, num_classes)
    )
    return model


def quantize_model(model, quantizer):
    """Quantize all model weights."""
    for layer in model:
        if isinstance(layer, nn.Linear):
            layer.weight.data = quantizer.ste_forward(layer.weight.data)
            if layer.bias is not None:
                layer.bias.data = quantizer.ste_forward(layer.bias.data)


def get_gradient_magnitudes(model):
    """Get average gradient magnitude for all parameters."""
    total_grad_norm = 0.0
    param_count = 0
    for param in model.parameters():
        if param.grad is not None:
            grad_norm = param.grad.data.norm().item()
            total_grad_norm += grad_norm
            param_count += 1
    return total_grad_norm / param_count if param_count > 0 else 0.0


def test_gradient_magnitudes():
    """
    Test gradient magnitudes before and after quantization.
    
    Returns:
        dict: Dictionary containing gradient magnitude results
    """
    print("=== Test 2: Gradient Magnitudes Before/After Quantization ===\n")
    
    # Generate data
    print("Generating advanced Hedera corpus...")
    try:
        classification_corpus, _ = generate_advanced_hedera_corpus("staking_rewards", n_samples=1000)
    except Exception as e:
        print(f"Error generating corpus: {e}")
        return None
    
    assert len(classification_corpus) > 0, "Corpus should not be empty"
    print(f"Generated {len(classification_corpus)} samples")
    
    # Prepare data
    features = torch.tensor([list(item['features'].values()) for item in classification_corpus], dtype=torch.float32)
    labels = torch.tensor([item['label'] for item in classification_corpus], dtype=torch.long)
    
    assert features.shape[1] == 20, "Features should have 20 dimensions"
    
    dataset = TensorDataset(features, labels)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    # Create model
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Training on {device}")
    
    model = create_bitlattice_model(num_features=20, num_classes=10, hidden_size=120).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    quantizer = TernaryQuantizer(threshold=0.33)
    
    # Test for 5 steps
    print("\nTraining for 5 steps with gradient magnitude tracking...\n")
    
    results = {
        'grad_before': [],
        'grad_after': [],
        'ratios': []
    }
    
    for step in range(5):
        batch_features, batch_labels = next(iter(dataloader))
        batch_features = batch_features.to(device)
        batch_labels = batch_labels.to(device)
        
        # Forward pass
        logits = model(batch_features)
        loss = F.cross_entropy(logits, batch_labels)
        
        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        
        # Get gradient magnitude BEFORE quantization
        grad_before = get_gradient_magnitudes(model)
        assert grad_before > 0, f"Gradient magnitude should be positive before quantization, got {grad_before}"
        
        # Optimize
        optimizer.step()
        
        # Quantize weights
        quantize_model(model, quantizer)
        
        # Get gradient magnitude AFTER quantization (on next backward)
        batch_features2, batch_labels2 = next(iter(dataloader))
        batch_features2 = batch_features2.to(device)
        batch_labels2 = batch_labels2.to(device)
        
        logits2 = model(batch_features2)
        loss2 = F.cross_entropy(logits2, batch_labels2)
        optimizer.zero_grad()
        loss2.backward()
        
        grad_after = get_gradient_magnitudes(model)
        
        # Optimize and quantize again
        optimizer.step()
        quantize_model(model, quantizer)
        
        ratio = grad_after / grad_before if grad_before > 0 else 0
        
        results['grad_before'].append(grad_before)
        results['grad_after'].append(grad_after)
        results['ratios'].append(ratio)
        
        print(f"Step {step}: Loss: {loss.item():.4f}, Grad Before: {grad_before:.6f}, Grad After: {grad_after:.6f}, Ratio: {ratio:.2f}")
    
    print("\n=== Test 2 Complete ===")
    print("If grad_after/grad_before ratio is very small (< 0.1), quantization is destroying gradients")
    
    # Calculate average ratio
    avg_ratio = np.mean(results['ratios'])
    print(f"Average gradient ratio (after/before): {avg_ratio:.4f}")
    
    return results


if __name__ == "__main__":
    results = test_gradient_magnitudes()
    
    if results is not None:
        print(f"\nTest completed successfully!")
        avg_ratio = np.mean(results['ratios'])
        print(f"Average gradient ratio: {avg_ratio:.4f}")
    else:
        print("\nTest failed!")
        sys.exit(1)
