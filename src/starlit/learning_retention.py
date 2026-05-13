"""
Learning retention optimizations for Starlit specialists
Includes loss functions, regularization, learning rate scheduling, and memory mechanisms
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim.lr_scheduler import CosineAnnealingLR, OneCycleLR, ReduceLROnPlateau
from typing import Optional, Dict, Any
import numpy as np


class LabelSmoothingLoss(nn.Module):
    """
    Label smoothing loss for better generalization.
    """

    def __init__(self, smoothing: float = 0.1, reduction: str = 'mean'):
        super().__init__()
        self.smoothing = smoothing
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Compute label smoothing loss.

        Args:
            logits: Model predictions
            targets: Ground truth labels

        Returns:
            Loss value
        """
        log_probs = F.log_softmax(logits, dim=-1)
        nll_loss = -log_probs.gather(dim=-1, index=targets.unsqueeze(-1)).squeeze(-1)

        smooth_loss = -log_probs.mean(dim=-1)

        loss = (1 - self.smoothing) * nll_loss + self.smoothing * smooth_loss

        if self.reduction == 'mean':
            return loss.mean()
        elif self.reduction == 'sum':
            return loss.sum()
        return loss


class FocalLoss(nn.Module):
    """
    Focal loss for handling class imbalance.
    """

    def __init__(self, alpha: float = 0.25, gamma: float = 2.0, reduction: str = 'mean'):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Compute focal loss.

        Args:
            logits: Model predictions
            targets: Ground truth labels

        Returns:
            Loss value
        """
        probs = F.softmax(logits, dim=-1)
        pt = probs.gather(dim=-1, index=targets.unsqueeze(-1)).squeeze(-1)

        focal_weight = (1 - pt) ** self.gamma
        ce_loss = F.cross_entropy(logits, targets, reduction='none')

        loss = self.alpha * focal_weight * ce_loss

        if self.reduction == 'mean':
            return loss.mean()
        elif self.reduction == 'sum':
            return loss.sum()
        return loss


class GradientClipping:
    """
    Gradient clipping for training stability.
    """

    def __init__(self, max_norm: float = 1.0):
        self.max_norm = max_norm

    def clip_gradients(self, model: nn.Module):
        """Clip gradients by max norm."""
        torch.nn.utils.clip_grad_norm_(model.parameters(), self.max_norm)


class LearningRateScheduler:
    """
    Learning rate scheduling for better convergence.
    """

    def __init__(
        self,
        optimizer: torch.optim.Optimizer,
        scheduler_type: str = 'cosine',
        total_steps: int = 10000,
        warmup_steps: int = 1000
    ):
        self.optimizer = optimizer
        self.scheduler_type = scheduler_type

        if scheduler_type == 'cosine':
            self.scheduler = CosineAnnealingLR(
                optimizer,
                T_max=total_steps,
                eta_min=1e-6
            )
        elif scheduler_type == 'onecycle':
            self.scheduler = OneCycleLR(
                optimizer,
                max_lr=optimizer.param_groups[0]['lr'],
                total_steps=total_steps,
                pct_start=warmup_steps / total_steps
            )
        elif scheduler_type == 'plateau':
            self.scheduler = ReduceLROnPlateau(
                optimizer,
                mode='min',
                factor=0.5,
                patience=10,
                min_lr=1e-6
            )
        else:
            self.scheduler = None

    def step(self, loss: Optional[float] = None):
        """Step the scheduler."""
        if self.scheduler_type == 'plateau' and loss is not None:
            self.scheduler.step(loss)
        elif self.scheduler is not None:
            self.scheduler.step()


class ExperienceReplayBuffer:
    """
    Experience replay buffer for continual learning.
    """

    def __init__(self, capacity: int = 10000):
        self.capacity = capacity
        self.buffer = []

    def add(self, experience: Dict[str, Any]):
        """Add experience to buffer."""
        if len(self.buffer) >= self.capacity:
            self.buffer.pop(0)
        self.buffer.append(experience)

    def sample(self, batch_size: int) -> list:
        """Sample batch of experiences."""
        if len(self.buffer) < batch_size:
            return self.buffer
        indices = np.random.choice(len(self.buffer), batch_size, replace=False)
        return [self.buffer[i] for i in indices]

    def __len__(self):
        return len(self.buffer)


class LearningRetentionTrainer:
    """
    Trainer with learning retention optimizations.
    """

    def __init__(
        self,
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
        device: str = 'cuda',
        loss_type: str = 'label_smoothing',
        lr_scheduler_type: str = 'cosine',
        gradient_clip_norm: float = 1.0,
        use_dropout: bool = True,
        dropout_rate: float = 0.1,
        use_experience_replay: bool = True,
        replay_buffer_size: int = 10000
    ):
        """
        Initialize learning retention trainer.

        Args:
            model: PyTorch model
            optimizer: Optimizer
            device: Device to use
            loss_type: Type of loss function (cross_entropy, label_smoothing, focal)
            lr_scheduler_type: Type of learning rate scheduler
            gradient_clip_norm: Max gradient norm for clipping
            use_dropout: Use dropout for regularization
            dropout_rate: Dropout rate
            use_experience_replay: Use experience replay for continual learning
            replay_buffer_size: Size of experience replay buffer
        """
        self.model = model
        self.optimizer = optimizer
        self.device = device

        # Loss function
        if loss_type == 'label_smoothing':
            self.loss_fn = LabelSmoothingLoss(smoothing=0.1)
        elif loss_type == 'focal':
            self.loss_fn = FocalLoss(alpha=0.25, gamma=2.0)
        else:
            self.loss_fn = nn.CrossEntropyLoss()

        # Gradient clipping
        self.gradient_clipper = GradientClipping(max_norm=gradient_clip_norm)

        # Learning rate scheduler
        self.lr_scheduler = LearningRateScheduler(
            optimizer,
            scheduler_type=lr_scheduler_type,
            total_steps=10000,
            warmup_steps=1000
        )

        # Dropout
        self.use_dropout = use_dropout
        if use_dropout:
            self.dropout = nn.Dropout(dropout_rate)

        # Experience replay
        self.use_experience_replay = use_experience_replay
        if use_experience_replay:
            self.replay_buffer = ExperienceReplayBuffer(capacity=replay_buffer_size)

    def train_step(self, batch: Dict[str, torch.Tensor]) -> float:
        """
        Training step with learning retention optimizations.

        Args:
            batch: Training batch

        Returns:
            Loss value
        """
        self.model.train()
        self.optimizer.zero_grad()

        inputs = batch['input'].to(self.device)
        targets = batch['output'].to(self.device)

        # Forward pass
        outputs = self.model(inputs)

        # Apply dropout if enabled
        if self.use_dropout:
            outputs = self.dropout(outputs)

        # Compute loss
        loss = self.loss_fn(outputs, targets)

        # Backward pass
        loss.backward()

        # Gradient clipping
        self.gradient_clipper.clip_gradients(self.model)

        # Optimize
        self.optimizer.step()

        # Learning rate scheduling
        self.lr_scheduler.step(loss.item())

        # Experience replay
        if self.use_experience_replay:
            experience = {
                'input': inputs,
                'output': targets,
                'loss': loss.item()
            }
            self.replay_buffer.add(experience)

        return loss.item()

    def train_with_replay(self, batch: Dict[str, torch.Tensor], replay_batch_size: int = 32) -> float:
        """
        Training step with experience replay.

        Args:
            batch: Current training batch
            replay_batch_size: Size of replay batch

        Returns:
            Loss value
        """
        # Train on current batch
        current_loss = self.train_step(batch)

        # Train on replay batch if buffer is full enough
        if self.use_experience_replay and len(self.replay_buffer) >= replay_batch_size:
            replay_samples = self.replay_buffer.sample(replay_batch_size)

            # Pad sequences to same length
            max_len = max(len(exp['input']) for exp in replay_samples)
            replay_inputs = torch.zeros(replay_batch_size, max_len, dtype=torch.long, device=self.device)
            replay_targets = torch.zeros(replay_batch_size, dtype=torch.long, device=self.device)

            for i, exp in enumerate(replay_samples):
                replay_inputs[i, :len(exp['input'])] = exp['input']
                replay_targets[i] = exp['output']

            replay_batch_dict = {
                'input': replay_inputs,
                'output': replay_targets
            }

            # Train on replay batch
            self.model.train()
            self.optimizer.zero_grad()

            outputs = self.model(replay_inputs)
            loss = self.loss_fn(outputs, replay_targets)

            loss.backward()
            self.gradient_clipper.clip_gradients(self.model)
            self.optimizer.step()

            return (current_loss + loss.item()) / 2

        return current_loss


if __name__ == "__main__":
    # Test learning retention components
    print("Testing learning retention optimizations...")

    # Test label smoothing loss
    loss_fn = LabelSmoothingLoss(smoothing=0.1)
    logits = torch.randn(32, 128)
    targets = torch.randint(0, 128, (32,))
    loss = loss_fn(logits, targets)
    print(f"Label smoothing loss: {loss.item():.4f}")

    # Test focal loss
    focal_loss = FocalLoss(alpha=0.25, gamma=2.0)
    loss = focal_loss(logits, targets)
    print(f"Focal loss: {loss.item():.4f}")

    # Test experience replay buffer
    replay_buffer = ExperienceReplayBuffer(capacity=10)
    for i in range(15):
        replay_buffer.add({'input': i, 'output': i+1})
    print(f"Replay buffer size: {len(replay_buffer)}")

    print("✓ Learning retention optimizations test complete")
