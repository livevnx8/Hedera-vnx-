"""
Ternary Quantization-Aware Training (QAT) for BitLattice models
Implements straight-through estimator and ternary-specific optimization
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Optional, Tuple
import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.bitlattice_model import BitLatticeModel


class TernaryQuantizer:
    """
    Ternary quantizer with straight-through estimator.
    """

    def __init__(self, threshold: float = 0.33):
        """
        Initialize ternary quantizer.

        Args:
            threshold: Threshold for quantization (default 0.33)
        """
        self.threshold = threshold

    def forward(self, weights: torch.Tensor) -> torch.Tensor:
        """
        Forward pass: quantize to ternary (-1, 0, +1).

        Args:
            weights: Float weights

        Returns:
            Quantized ternary weights
        """
        # Quantize to -1, 0, +1
        quantized = torch.where(
            weights > self.threshold,
            torch.tensor(1.0, device=weights.device),
            torch.where(
                weights < -self.threshold,
                torch.tensor(-1.0, device=weights.device),
                torch.tensor(0.0, device=weights.device)
            )
        )
        return quantized

    def backward(self, weights: torch.Tensor, grad_output: torch.Tensor) -> torch.Tensor:
        """
        Backward pass: straight-through estimator.

        Args:
            weights: Original weights
            grad_output: Gradient from quantized weights

        Returns:
            Gradient for original weights (identity gradient)
        """
        # Straight-through estimator: pass gradient through unchanged
        return grad_output

    def ste_forward(self, weights: torch.Tensor) -> torch.Tensor:
        """
        Straight-through estimator forward pass.

        Args:
            weights: Float weights

        Returns:
            Quantized weights with gradient tracking
        """
        # Forward: quantize
        quantized = self.forward(weights)

        # Straight-through: use identity gradient
        return quantized.detach() + weights - weights.detach()


class TernaryLinear(nn.Module):
    """
    Ternary linear layer with QAT.
    """

    def __init__(self, in_features: int, out_features: int, threshold: float = 0.33):
        """
        Initialize ternary linear layer.

        Args:
            in_features: Input features
            out_features: Output features
            threshold: Quantization threshold
        """
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features

        # Float weights (for training)
        self.weight = nn.Parameter(torch.randn(out_features, in_features))
        self.bias = nn.Parameter(torch.zeros(out_features))

        # Quantizer
        self.quantizer = TernaryQuantizer(threshold)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass with ternary quantization.

        Args:
            x: Input tensor

        Returns:
            Output tensor
        """
        # Quantize weights with straight-through estimator
        quantized_weight = self.quantizer.ste_forward(self.weight)

        # Compute output
        return torch.nn.functional.linear(x, quantized_weight, self.bias)

    def get_ternary_weights(self) -> torch.Tensor:
        """
        Get ternary weights (for export).

        Returns:
            Ternary weights as tensor
        """
        return self.quantizer.forward(self.weight)


class TernaryBitLattice(nn.Module):
    """
    BitLattice model with ternary QAT.
    """

    def __init__(self, lattice_size: int, vocabulary_size: int, threshold: float = 0.33):
        """
        Initialize ternary BitLattice.

        Args:
            lattice_size: Number of vertices in lattice
            vocabulary_size: Vocabulary size
            threshold: Quantization threshold
        """
        super().__init__()
        self.lattice_size = lattice_size
        self.vocabulary_size = vocabulary_size

        # Embedding layer
        self.embedding = nn.Embedding(vocabulary_size, lattice_size)

        # Ternary weight layers (simulating lattice routing)
        self.ternary_layers = nn.ModuleList([
            TernaryLinear(lattice_size, lattice_size, threshold)
            for _ in range(3)  # 3 lattice layers
        ])

        # Output layer
        self.output = nn.Linear(lattice_size, vocabulary_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input indices

        Returns:
            Output logits
        """
        # Embed
        x = self.embedding(x)

        # Pass through ternary layers
        for layer in self.ternary_layers:
            x = layer(x)

        # Output
        x = self.output(x)

        return x

    def get_ternary_weights(self) -> list:
        """
        Get all ternary weights.

        Returns:
            List of ternary weight tensors
        """
        return [layer.get_ternary_weights() for layer in self.ternary_layers]


class TernaryAdam(torch.optim.Optimizer):
    """
    Adam optimizer with ternary projection.
    """

    def __init__(self, params, lr=0.01, betas=(0.9, 0.999), eps=1e-8, threshold=0.33):
        """
        Initialize Ternary Adam.

        Args:
            params: Model parameters
            lr: Learning rate
            betas: Beta parameters for Adam
            eps: Epsilon for Adam
            threshold: Ternary projection threshold
        """
        defaults = dict(lr=lr, betas=betas, eps=eps, threshold=threshold)
        super().__init__(params, defaults)
        self.threshold = threshold

    def step(self, closure=None):
        """
        Perform optimization step with ternary projection.

        Args:
            closure: Closure for re-evaluating model
        """
        loss = None
        if closure is not None:
            loss = closure()

        for group in self.param_groups:
            for p in group['params']:
                if p.grad is None:
                    continue

                grad = p.grad.data
                if grad.is_sparse:
                    raise RuntimeError('TernaryAdam does not support sparse gradients')

                state = self.state[p]

                # State initialization
                if len(state) == 0:
                    state['step'] = 0
                    state['exp_avg'] = torch.zeros_like(p.data)
                    state['exp_avg_sq'] = torch.zeros_like(p.data)

                exp_avg, exp_avg_sq = state['exp_avg'], state['exp_avg_sq']
                beta1, beta2 = group['betas']

                state['step'] += 1
                bias_correction1 = 1 - beta1 ** state['step']
                bias_correction2 = 1 - beta2 ** state['step']

                # Adam update
                exp_avg.mul_(beta1).add_(grad, alpha=1 - beta1)
                exp_avg_sq.mul_(beta2).addcmul_(grad, grad, value=1 - beta2)

                denom = (exp_avg_sq.sqrt() / math.sqrt(bias_correction2)).add_(group['eps'])
                step_size = group['lr'] / bias_correction1

                p.data.addcdiv_(exp_avg, denom, value=-step_size)

                # Ternary projection
                p.data = torch.where(
                    p.data > self.threshold,
                    torch.tensor(1.0, device=p.data.device),
                    torch.where(
                        p.data < -self.threshold,
                        torch.tensor(-1.0, device=p.data.device),
                        torch.tensor(0.0, device=p.data.device)
                    )
                )

        return loss


import math


class TernaryQATTrainer:
    """
    Trainer for ternary QAT.
    """

    def __init__(
        self,
        model: nn.Module,
        learning_rate: float = 0.01,
        threshold: float = 0.33,
        device: str = 'cuda'
    ):
        """
        Initialize Ternary QAT trainer.

        Args:
            model: Model to train
            learning_rate: Learning rate
            threshold: Ternary threshold
            device: Device to train on
        """
        self.model = model.to(device)
        self.device = device
        self.threshold = threshold

        # Use Ternary Adam optimizer
        self.optimizer = TernaryAdam(
            model.parameters(),
            lr=learning_rate,
            threshold=threshold
        )

        # Quantizer
        self.quantizer = TernaryQuantizer(threshold)

    def train_step(self, batch: dict) -> float:
        """
        Training step with ternary QAT.

        Args:
            batch: Training batch

        Returns:
            Loss value
        """
        self.model.train()
        self.optimizer.zero_grad()

        # Forward pass
        inputs = batch['input'].to(self.device)
        targets = batch['output'].to(self.device)

        outputs = self.model(inputs)

        # Compute loss
        loss = nn.functional.cross_entropy(outputs, targets)

        # Backward pass
        loss.backward()

        # Optimize
        self.optimizer.step()

        return loss.item()

    def get_ternary_weights(self) -> list:
        """
        Get ternary weights from model.

        Returns:
            List of ternary weight tensors
        """
        if isinstance(self.model, TernaryBitLattice):
            return self.model.get_ternary_weights()
        else:
            # For other models, return quantized parameters
            return [
                self.quantizer.forward(p)
                for p in self.model.parameters()
            ]


if __name__ == "__main__":
    # Test ternary QAT
    print("Testing Ternary QAT...")

    # Create model
    model = TernaryBitLattice(lattice_size=15, vocabulary_size=128)

    # Create trainer
    trainer = TernaryQATTrainer(model, learning_rate=0.01)

    # Test forward pass
    dummy_input = torch.randint(0, 128, (32, 10))
    outputs = model(dummy_input)
    print(f"Output shape: {outputs.shape}")

    # Test training step
    dummy_batch = {
        'input': torch.randint(0, 128, (32, 10)),
        'output': torch.randint(0, 128, (32,))
    }
    loss = trainer.train_step(dummy_batch)
    print(f"Training loss: {loss}")

    # Test ternary weights
    ternary_weights = trainer.get_ternary_weights()
    print(f"Ternary weights: {len(ternary_weights)} layers")
    print(f"Unique values: {torch.unique(ternary_weights[0]).tolist()}")

    print("✓ Ternary QAT test complete")
