"""
PyTorch implementation of BitLattice model for GPU acceleration
"""

from dataclasses import dataclass
import random
import time
from collections import defaultdict

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Dict, Any, List, Sequence, Tuple
import numpy as np

from starlit.ternary_qat import TernaryQuantizer, TernaryBitLattice, TernaryQATTrainer
from starlit.lattice_routing_cuda import LatticeRoutingCUDA, MixedPrecisionTraining
from starlit.learning_retention import LearningRetentionTrainer


@dataclass
class TrainingResult:
    """Measured output from a BitLattice training run."""

    model: "BitLatticeModelPyTorch"
    final_loss: float
    final_train_accuracy: float
    best_validation_accuracy: float
    test_accuracy: float
    test_loss: float
    epoch_history: List[Dict[str, float]]
    training_time_seconds: float
    split_sizes: Dict[str, int]
    provenance: Dict[str, Any]

    def get_weights(self) -> np.ndarray:
        """Compatibility helper for older callers that treated train() as a model."""
        return self.model.get_weights()


def prepare_classification_examples(
    corpus: list,
    leakage_feature_names: Sequence[str] = ("transaction_type_idx",),
    feature_names: Optional[Sequence[str]] = None,
) -> Tuple[torch.Tensor, torch.Tensor, List[str], List[str]]:
    """
    Convert a classification corpus into tensors while removing label leakage.

    Args:
        corpus: Samples with {"features": dict, "label": int}
        leakage_feature_names: Feature keys that expose the target label

    Returns:
        Tuple of features tensor, labels tensor, retained feature names, removed feature names
    """
    if not corpus:
        raise ValueError("classification corpus must not be empty")
    if "features" not in corpus[0] or "label" not in corpus[0]:
        raise ValueError("classification samples must contain 'features' and 'label'")

    leakage = set(leakage_feature_names or ())
    if feature_names is None:
        original_feature_names = []
        seen = set()
        for item in corpus:
            for name in item["features"].keys():
                if name not in seen:
                    original_feature_names.append(name)
                    seen.add(name)
        feature_names = [name for name in original_feature_names if name not in leakage]
    else:
        feature_names = list(feature_names)

    all_names = set()
    for item in corpus:
        all_names.update(item["features"].keys())
    removed = [name for name in leakage_feature_names if name in all_names]

    if not feature_names:
        raise ValueError("all classification features were removed")

    rows = []
    labels = []
    for index, item in enumerate(corpus):
        features = item.get("features")
        if not isinstance(features, dict):
            raise ValueError(f"sample {index} has invalid features")
        missing = [name for name in feature_names if name not in features]
        if missing:
            raise ValueError(f"sample {index} missing features: {missing}")
        rows.append([features[name] for name in feature_names])
        labels.append(item["label"])

    return (
        torch.tensor(rows, dtype=torch.float32),
        torch.tensor(labels, dtype=torch.long),
        feature_names,
        removed,
    )


def split_classification_corpus(
    corpus: list,
    seed: int = 42,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
) -> Dict[str, list]:
    """
    Deterministically split corpus into train/validation/test sets, stratified by label.
    """
    if not corpus:
        raise ValueError("classification corpus must not be empty")
    if train_ratio <= 0 or val_ratio < 0 or train_ratio + val_ratio >= 1:
        raise ValueError("ratios must leave a positive test split")

    rng = random.Random(seed)
    by_label = defaultdict(list)
    for item in corpus:
        by_label[item["label"]].append(item)

    splits = {"train": [], "val": [], "test": []}
    for label in sorted(by_label):
        items = list(by_label[label])
        rng.shuffle(items)
        count = len(items)
        train_count = int(count * train_ratio)
        val_count = int(count * val_ratio)

        if count >= 3:
            train_count = max(1, train_count)
            val_count = max(1, val_count)
            if train_count + val_count >= count:
                train_count = count - 2
                val_count = 1

        splits["train"].extend(items[:train_count])
        splits["val"].extend(items[train_count:train_count + val_count])
        splits["test"].extend(items[train_count + val_count:])

    for split_name in splits:
        rng.shuffle(splits[split_name])

    return splits


def majority_class_accuracy(train_corpus: list, evaluation_corpus: list) -> Tuple[int, float]:
    """Return train-majority label and its accuracy on an evaluation corpus."""
    counts = defaultdict(int)
    for item in train_corpus:
        counts[item["label"]] += 1
    if not counts or not evaluation_corpus:
        return -1, float("nan")

    majority_label = max(sorted(counts), key=lambda label: counts[label])
    correct = sum(1 for item in evaluation_corpus if item["label"] == majority_label)
    return int(majority_label), correct / len(evaluation_corpus)


def compute_class_weights(labels: torch.Tensor, num_classes: int, max_weight: float = 1.5) -> torch.Tensor:
    """
    Compute inverse-frequency class weights with conservative capping.

    Proven effective for Hedera transaction classification (see class_weight_experiments/).
    Uses inverse frequency (total / count) normalized to mean=1, then capped at max_weight.
    Default max_weight=1.5 balances minority recall improvement with training stability.

    Args:
        labels: Training labels tensor
        num_classes: Total number of classes
        max_weight: Maximum weight to cap at (default 1.5, validated across 5 seeds)

    Returns:
        Class weights tensor with floor=0.5, ceiling=max_weight
    """
    counts = torch.bincount(labels.cpu(), minlength=num_classes).float()
    present = counts > 0
    weights = torch.ones(num_classes, dtype=torch.float32)
    if present.any():
        # Inverse frequency: weight = total / count, normalized to mean=1
        inverse = counts[present].sum() / counts[present]
        weights[present] = inverse / inverse.mean()
        # Cap to prevent destabilization (validated: max_weight=1.5 is sweet spot)
        weights[present] = torch.clamp(weights[present], min=0.5, max=max_weight)
    return weights


class BitLatticeModelPyTorch(nn.Module):
    """
    PyTorch implementation of BitLattice model with GPU support and multi-task heads.
    """

    def __init__(
        self,
        lattice_size: int = 120,
        vocabulary_size: int = 128,
        num_features: int = 10,
        num_classes: int = 6,
        device: str = 'cuda'
    ):
        """
        Initialize PyTorch BitLattice model.

        Args:
            lattice_size: Number of vertices in lattice
            vocabulary_size: Size of vocabulary
            num_features: Number of input features
            num_classes: Number of classification classes
            device: Device to use (cuda or cpu)
        """
        super().__init__()
        self.lattice_size = lattice_size
        self.vocabulary_size = vocabulary_size
        self.num_features = num_features
        self.num_classes = num_classes
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')

        # Input layer: features to lattice
        self.input_layer = nn.Linear(num_features, lattice_size)

        # Ternary weight layers (simulating lattice routing)
        self.ternary_layers = nn.ModuleList([
            nn.Linear(lattice_size, lattice_size)
            for _ in range(3)
        ])

        # Residual connection for better gradient flow
        self.residual = nn.Linear(lattice_size, lattice_size)

        # Classification head: predict transaction type
        self.classification_head = nn.Linear(lattice_size, num_classes)

        # Generation head: predict output features
        self.generation_head = nn.Linear(lattice_size, num_features)

        # Quantizer
        self.quantizer = TernaryQuantizer(threshold=0.33)

        # Move to device
        self.to(self.device)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input features (batch_size, num_features)

        Returns:
            Tuple of (classification_logits, generation_features)
        """
        # Input layer
        x = self.input_layer(x)

        # Pass through ternary layers with proper residual connections
        for layer in self.ternary_layers:
            x_identity = x  # Save identity for residual
            x = layer(x) + x_identity  # Proper residual: add original input
            x = F.relu(x)

        # Classification head
        classification_logits = self.classification_head(x)

        # Generation head
        generation_features = self.generation_head(x)

        return classification_logits, generation_features

    def quantize_weights(self):
        """Quantize all weights to ternary values."""
        for layer in self.ternary_layers:
            layer.weight.data = self.quantizer.ste_forward(layer.weight.data)
            if layer.bias is not None:
                layer.bias.data = self.quantizer.ste_forward(layer.bias.data)

        self.input_layer.weight.data = self.quantizer.ste_forward(self.input_layer.weight.data)
        if self.input_layer.bias is not None:
            self.input_layer.bias.data = self.quantizer.ste_forward(self.input_layer.bias.data)

        self.classification_head.weight.data = self.quantizer.ste_forward(self.classification_head.weight.data)
        if self.classification_head.bias is not None:
            self.classification_head.bias.data = self.quantizer.ste_forward(self.classification_head.bias.data)

        self.generation_head.weight.data = self.quantizer.ste_forward(self.generation_head.weight.data)
        if self.generation_head.bias is not None:
            self.generation_head.bias.data = self.quantizer.ste_forward(self.generation_head.bias.data)

    def train_step(
        self,
        batch: Dict[str, torch.Tensor],
        optimizer: torch.optim.Optimizer,
        quantize: bool = False,
        class_weights: Optional[torch.Tensor] = None,
    ) -> float:
        """
        Training step for classification task with optional quantization.

        Args:
            batch: Training batch with features and labels
            optimizer: Optimizer
            quantize: Whether to apply ternary quantization (default False for learning)

        Returns:
            Loss value
        """
        self.train()
        optimizer.zero_grad()

        features = batch['features'].to(self.device)
        classification_labels = batch['classification_label'].to(self.device)

        # Forward pass
        classification_logits, _ = self.forward(features)

        # Compute classification loss only
        classification_loss = F.cross_entropy(
            classification_logits,
            classification_labels,
            weight=class_weights.to(self.device) if class_weights is not None else None,
        )

        # Backward pass
        classification_loss.backward()

        # Optimize
        optimizer.step()

        # Quantize weights only if enabled
        if quantize:
            self.quantize_weights()

        return classification_loss.item()

    def compute_accuracy(self, classification_logits: torch.Tensor, labels: torch.Tensor) -> float:
        """Compute classification accuracy."""
        predictions = torch.argmax(classification_logits, dim=1)
        accuracy = (predictions == labels).float().mean().item()
        return accuracy

    def get_weights(self) -> torch.Tensor:
        """Get weights as numpy array."""
        return self.ternary_layers[0].weight.data.cpu().numpy()


class BitLatticeTrainerPyTorch:
    """
    PyTorch trainer for BitLattice models with GPU acceleration, learning retention optimizations, and multi-task learning.
    """

    def __init__(
        self,
        lattice_size: int = 120,
        vocabulary_size: int = 128,
        num_features: int = 20,  # Increased to 20 for advanced dataset
        num_classes: int = 10,  # Increased to 10 for advanced transaction types
        learning_rate: float = 0.01,
        device: str = 'cuda',
        use_learning_retention: bool = True,
        loss_type: str = 'label_smoothing',
        lr_scheduler_type: str = 'cosine'
    ):
        """
        Initialize PyTorch trainer.

        Args:
            lattice_size: Lattice size
            vocabulary_size: Vocabulary size
            num_features: Number of input features
            num_classes: Number of classification classes
            learning_rate: Learning rate
            device: Device to use
            use_learning_retention: Use learning retention optimizations
            loss_type: Type of loss function
            lr_scheduler_type: Type of learning rate scheduler
        """
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.model_config = {
            "lattice_size": lattice_size,
            "vocabulary_size": vocabulary_size,
            "num_features": num_features,
            "num_classes": num_classes,
            "device": device,
        }
        self.learning_rate = learning_rate
        self.retention_config = {
            "use_learning_retention": use_learning_retention,
            "loss_type": loss_type,
            "lr_scheduler_type": lr_scheduler_type,
        }

        # Create model with multi-task heads
        self.model = BitLatticeModelPyTorch(
            lattice_size=lattice_size,
            vocabulary_size=vocabulary_size,
            num_features=num_features,
            num_classes=num_classes,
            device=device
        )

        # Use standard Adam optimizer (TernaryAdam might interfere with learning)
        self.optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=learning_rate
        )

        # Mixed precision training
        if self.device.type == 'cuda':
            self.mixed_precision = MixedPrecisionTraining(self.model, device)
        else:
            self.mixed_precision = None

        # Learning retention optimizations
        self.use_learning_retention = use_learning_retention
        if use_learning_retention:
            self.retention_trainer = LearningRetentionTrainer(
                self.model,
                self.optimizer,
                device,
                loss_type=loss_type,
                lr_scheduler_type=lr_scheduler_type,
                gradient_clip_norm=1.0,
                use_dropout=True,
                dropout_rate=0.1,
                use_experience_replay=False,  # Disabled for now due to complexity
                replay_buffer_size=10000
            )

    def _reset_optimizer(self):
        self.optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=self.learning_rate
        )
        if self.device.type == 'cuda':
            self.mixed_precision = MixedPrecisionTraining(self.model, str(self.device))
        else:
            self.mixed_precision = None
        if self.use_learning_retention:
            self.retention_trainer = LearningRetentionTrainer(
                self.model,
                self.optimizer,
                str(self.device),
                loss_type=self.retention_config["loss_type"],
                lr_scheduler_type=self.retention_config["lr_scheduler_type"],
                gradient_clip_norm=1.0,
                use_dropout=True,
                dropout_rate=0.1,
                use_experience_replay=False,
                replay_buffer_size=10000
            )

    def _ensure_feature_count(self, num_features: int):
        if self.model.num_features == num_features:
            return
        print(f"Rebuilding model for {num_features} leakage-safe input features")
        self.model_config["num_features"] = num_features
        self.model = BitLatticeModelPyTorch(**self.model_config)
        self._reset_optimizer()

    def _evaluate_loader(self, dataloader: torch.utils.data.DataLoader) -> Tuple[float, float]:
        self.model.eval()
        total_loss = 0.0
        total_correct = 0
        total_items = 0
        with torch.no_grad():
            for batch_features, batch_labels in dataloader:
                batch_features = batch_features.to(self.device)
                batch_labels = batch_labels.to(self.device)
                logits, _ = self.model(batch_features)
                loss = F.cross_entropy(logits, batch_labels)
                predictions = torch.argmax(logits, dim=1)
                total_loss += loss.item() * batch_labels.size(0)
                total_correct += (predictions == batch_labels).sum().item()
                total_items += batch_labels.size(0)

        if total_items == 0:
            return float("nan"), float("nan")
        return total_loss / total_items, total_correct / total_items

    def train(
        self,
        classification_corpus: list,
        generation_corpus: list,
        epochs: int = 100,
        batch_size: int = 32,
        target_accuracy: float = 0.55,
        split_seed: int = 42,
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        leakage_feature_names: Sequence[str] = ("transaction_type_idx",),
        class_weighting: str = "none",
    ) -> TrainingResult:
        """
        Train the model with multi-task learning and accuracy tracking.

        Args:
            classification_corpus: Classification training corpus
            generation_corpus: Generation training corpus
            epochs: Number of epochs
            batch_size: Batch size
            target_accuracy: Target classification accuracy (55%)

        Returns:
            Measured training result with trained model and held-out metrics
        """
        start_time = time.perf_counter()

        splits = split_classification_corpus(
            classification_corpus,
            seed=split_seed,
            train_ratio=train_ratio,
            val_ratio=val_ratio,
        )

        _, _, feature_names, removed_features = prepare_classification_examples(
            classification_corpus,
            leakage_feature_names=leakage_feature_names,
        )
        train_features, train_labels, _, _ = prepare_classification_examples(
            splits["train"],
            leakage_feature_names=leakage_feature_names,
            feature_names=feature_names,
        )
        val_features, val_labels, val_feature_names, _ = prepare_classification_examples(
            splits["val"],
            leakage_feature_names=leakage_feature_names,
            feature_names=feature_names,
        )
        test_features, test_labels, test_feature_names, _ = prepare_classification_examples(
            splits["test"],
            leakage_feature_names=leakage_feature_names,
            feature_names=feature_names,
        )

        if val_feature_names != feature_names or test_feature_names != feature_names:
            raise ValueError("train/validation/test feature names do not match")

        self._ensure_feature_count(train_features.shape[1])
        if class_weighting not in ("none", "balanced"):
            raise ValueError("class_weighting must be 'none' or 'balanced'")

        class_weights = None
        if class_weighting == "balanced":
            class_weights = compute_class_weights(train_labels, self.model.num_classes).to(self.device)

        train_dataset = torch.utils.data.TensorDataset(train_features, train_labels)
        val_dataset = torch.utils.data.TensorDataset(val_features, val_labels)
        test_dataset = torch.utils.data.TensorDataset(test_features, test_labels)

        dataloader = torch.utils.data.DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = torch.utils.data.DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        test_loader = torch.utils.data.DataLoader(test_dataset, batch_size=batch_size, shuffle=False)

        best_validation_accuracy = float("-inf")
        epoch_history = []

        # Training loop with quantization disabled (quantization blocks learning)
        for epoch in range(epochs):
            total_loss = 0.0
            total_correct = 0
            total_items = 0

            for batch_features, batch_labels in dataloader:
                batch = {
                    'features': batch_features,
                    'classification_label': batch_labels
                }

                if self.use_learning_retention:
                    # Use model's train_step directly with quantization disabled
                    loss = self.model.train_step(
                        batch,
                        self.optimizer,
                        quantize=False,
                        class_weights=class_weights,
                    )

                else:
                    # Basic training step with quantization disabled
                    loss = self.model.train_step(
                        batch,
                        self.optimizer,
                        quantize=False,
                        class_weights=class_weights,
                    )

                with torch.no_grad():
                    classification_logits, _ = self.model(batch_features.to(self.device))
                    predictions = torch.argmax(classification_logits, dim=1)
                    batch_labels_device = batch_labels.to(self.device)
                    total_correct += (predictions == batch_labels_device).sum().item()
                    total_items += batch_labels_device.size(0)
                    total_loss += loss * batch_labels_device.size(0)

            avg_loss = total_loss / total_items
            avg_accuracy = total_correct / total_items
            val_loss, val_accuracy = self._evaluate_loader(val_loader)
            best_validation_accuracy = max(best_validation_accuracy, val_accuracy)

            epoch_history.append({
                "epoch": float(epoch),
                "train_loss": float(avg_loss),
                "train_accuracy": float(avg_accuracy),
                "validation_loss": float(val_loss),
                "validation_accuracy": float(val_accuracy),
            })

            print(
                f"Epoch {epoch}, "
                f"Train Loss: {avg_loss:.4f}, Train Accuracy: {avg_accuracy:.2%}, "
                f"Val Loss: {val_loss:.4f}, Val Accuracy: {val_accuracy:.2%}"
            )

            # Early stopping if target accuracy reached
            if val_accuracy >= target_accuracy:
                print(f"Target validation accuracy {target_accuracy:.0%} reached at epoch {epoch}")
                break

        test_loss, test_accuracy = self._evaluate_loader(test_loader)
        baseline_label, baseline_accuracy = majority_class_accuracy(splits["train"], splits["test"])
        training_time_seconds = time.perf_counter() - start_time
        final_epoch = epoch_history[-1]

        return TrainingResult(
            model=self.model,
            final_loss=float(final_epoch["train_loss"]),
            final_train_accuracy=float(final_epoch["train_accuracy"]),
            best_validation_accuracy=float(best_validation_accuracy),
            test_accuracy=float(test_accuracy),
            test_loss=float(test_loss),
            epoch_history=epoch_history,
            training_time_seconds=float(training_time_seconds),
            split_sizes={name: len(items) for name, items in splits.items()},
            provenance={
                "leakage_features_removed": removed_features,
                "split_seed": split_seed,
                "train_ratio": train_ratio,
                "validation_ratio": val_ratio,
                "metric_scope": "heldout_test",
                "feature_names": feature_names,
                "num_input_features": len(feature_names),
                "test_majority_baseline_label": baseline_label,
                "test_majority_baseline_accuracy": float(baseline_accuracy),
                "class_weighting": class_weighting,
                "class_weights": class_weights.detach().cpu().tolist() if class_weights is not None else None,
            },
        )


if __name__ == "__main__":
    # Test PyTorch BitLattice model
    print("Testing PyTorch BitLattice model...")

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")

    # Create model
    model = BitLatticeModelPyTorch(lattice_size=15, vocabulary_size=128, device=device)

    # Test forward pass
    dummy_input = torch.randint(0, 128, (32, 10)).to(device)
    outputs = model(dummy_input)
    print(f"Output shape: {outputs.shape}")

    # Test trainer
    dummy_corpus = [
        {'input': i, 'output': (i + 1) % 128}
        for i in range(1000)
    ]

    trainer = BitLatticeTrainerPyTorch(lattice_size=15, vocabulary_size=128, device=device)
    trained_model = trainer.train(dummy_corpus, epochs=5, batch_size=32)

    print("✓ PyTorch BitLattice model test complete")
