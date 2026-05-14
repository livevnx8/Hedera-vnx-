#!/usr/bin/env python3
"""
Evaluate leakage-free mixed-corpus findings across seeds and simple baselines.
"""

import json
import math
import random
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch
import torch.nn as nn
import torch.nn.functional as F

from starlit.bitlattice_model_pytorch import (
    BitLatticeTrainerPyTorch,
    prepare_classification_examples,
    split_classification_corpus,
    majority_class_accuracy,
)


CORPUS_PATH = Path("/home/vera-live-0-1/hedera-llm-api/data/mixed_hedera_classification_corpus.json")
OUTPUT_PATH = Path("/home/vera-live-0-1/hedera-llm-api/benchmarks/2026-05-10_mixed-corpus-evaluation.json")
SEEDS = [11, 23, 42, 77, 101]
EPOCHS = 20
BATCH_SIZE = 32
LEAKAGE_FEATURES = ("transaction_type_idx",)


class LinearBaseline(nn.Module):
    def __init__(self, num_features: int, num_classes: int):
        super().__init__()
        self.output = nn.Linear(num_features, num_classes)

    def forward(self, x):
        return self.output(x)


class MLPBaseline(nn.Module):
    def __init__(self, num_features: int, num_classes: int, hidden_size: int = 120):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(num_features, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, x):
        return self.net(x)


def evaluate_model(model, features, labels, device):
    model.eval()
    with torch.no_grad():
        features = features.to(device)
        labels = labels.to(device)
        logits = model(features)
        loss = F.cross_entropy(logits, labels).item()
        predictions = torch.argmax(logits, dim=1)
        accuracy = (predictions == labels).float().mean().item()
    return loss, accuracy, predictions.cpu().tolist()


def train_baseline(model_cls, splits, num_classes, device, seed, feature_names, class_weighting="none"):
    torch.manual_seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(seed)

    train_features, train_labels, feature_names, removed = prepare_classification_examples(
        splits["train"],
        leakage_feature_names=LEAKAGE_FEATURES,
        feature_names=feature_names,
    )
    val_features, val_labels, _, _ = prepare_classification_examples(
        splits["val"],
        leakage_feature_names=LEAKAGE_FEATURES,
        feature_names=feature_names,
    )
    test_features, test_labels, _, _ = prepare_classification_examples(
        splits["test"],
        leakage_feature_names=LEAKAGE_FEATURES,
        feature_names=feature_names,
    )

    model = model_cls(train_features.shape[1], num_classes).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    class_weights = None
    if class_weighting == "balanced":
        from starlit.bitlattice_model_pytorch import compute_class_weights
        # Use median-frequency weights with conservative cap (max_weight=1.5)
        class_weights = compute_class_weights(train_labels, num_classes).to(device)
    dataset = torch.utils.data.TensorDataset(train_features, train_labels)
    loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    best_validation_accuracy = 0.0
    for _ in range(EPOCHS):
        model.train()
        for batch_features, batch_labels in loader:
            batch_features = batch_features.to(device)
            batch_labels = batch_labels.to(device)
            logits = model(batch_features)
            loss = F.cross_entropy(logits, batch_labels, weight=class_weights)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        _, val_accuracy, _ = evaluate_model(model, val_features, val_labels, device)
        best_validation_accuracy = max(best_validation_accuracy, val_accuracy)

    test_loss, test_accuracy, predictions = evaluate_model(model, test_features, test_labels, device)
    return {
        "test_loss": test_loss,
        "test_accuracy": test_accuracy,
        "best_validation_accuracy": best_validation_accuracy,
        "feature_count": len(feature_names),
        "leakage_features_removed": removed,
        "class_weighting": class_weighting,
        "class_weights": class_weights.detach().cpu().tolist() if class_weights is not None else None,
        "predictions": predictions,
    }


def confusion_matrix(labels, predictions, num_classes):
    matrix = [[0 for _ in range(num_classes)] for _ in range(num_classes)]
    for label, prediction in zip(labels, predictions):
        matrix[label][prediction] += 1
    return matrix


def per_class_recall(matrix):
    recalls = {}
    for label, row in enumerate(matrix):
        total = sum(row)
        if total:
            recalls[str(label)] = row[label] / total
    return recalls


def summarize(values):
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return {
        "mean": mean,
        "min": min(values),
        "max": max(values),
        "std": math.sqrt(variance),
    }


def main():
    corpus = json.loads(CORPUS_PATH.read_text())
    num_classes = 10
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    random.seed(0)
    torch.manual_seed(0)

    runs = []
    for seed in SEEDS:
        print(f"\n=== Seed {seed} ===")
        splits = split_classification_corpus(corpus, seed=seed)
        baseline_label, majority_accuracy = majority_class_accuracy(splits["train"], splits["test"])
        test_labels = [item["label"] for item in splits["test"]]

        torch.manual_seed(seed)
        if device.type == "cuda":
            torch.cuda.manual_seed_all(seed)
        trainer = BitLatticeTrainerPyTorch(
            lattice_size=120,
            vocabulary_size=128,
            num_features=20,
            num_classes=num_classes,
            learning_rate=0.01,
            device=str(device),
            use_learning_retention=False,
            loss_type="cross_entropy",
            lr_scheduler_type="cosine",
        )
        started = time.perf_counter()
        bitlattice = trainer.train(
            classification_corpus=corpus,
            generation_corpus=corpus,
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            target_accuracy=0.55,
            split_seed=seed,
            leakage_feature_names=LEAKAGE_FEATURES,
        )
        bitlattice_elapsed = time.perf_counter() - started

        torch.manual_seed(seed)
        if device.type == "cuda":
            torch.cuda.manual_seed_all(seed)
        weighted_trainer = BitLatticeTrainerPyTorch(
            lattice_size=120,
            vocabulary_size=128,
            num_features=20,
            num_classes=num_classes,
            learning_rate=0.01,
            device=str(device),
            use_learning_retention=False,
            loss_type="cross_entropy",
            lr_scheduler_type="cosine",
        )
        weighted_started = time.perf_counter()
        weighted_bitlattice = weighted_trainer.train(
            classification_corpus=corpus,
            generation_corpus=corpus,
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            target_accuracy=0.55,
            split_seed=seed,
            leakage_feature_names=LEAKAGE_FEATURES,
            class_weighting="balanced",
        )
        weighted_elapsed = time.perf_counter() - weighted_started

        test_features, test_tensor_labels, _, _ = prepare_classification_examples(
            splits["test"],
            leakage_feature_names=LEAKAGE_FEATURES,
            feature_names=bitlattice.provenance["feature_names"],
        )
        trainer.model.eval()
        with torch.no_grad():
            logits, _ = trainer.model(test_features.to(device))
            bitlattice_predictions = torch.argmax(logits, dim=1).cpu().tolist()

        weighted_trainer.model.eval()
        with torch.no_grad():
            weighted_logits, _ = weighted_trainer.model(test_features.to(device))
            weighted_predictions = torch.argmax(weighted_logits, dim=1).cpu().tolist()

        linear = train_baseline(
            LinearBaseline,
            splits,
            num_classes,
            device,
            seed,
            bitlattice.provenance["feature_names"],
        )
        mlp = train_baseline(
            MLPBaseline,
            splits,
            num_classes,
            device,
            seed,
            bitlattice.provenance["feature_names"],
        )

        matrix = confusion_matrix(test_labels, bitlattice_predictions, num_classes)
        run = {
            "seed": seed,
            "split_sizes": bitlattice.split_sizes,
            "majority_baseline": {
                "label": baseline_label,
                "test_accuracy": majority_accuracy,
            },
            "bitlattice": {
                "test_accuracy": bitlattice.test_accuracy,
                "test_loss": bitlattice.test_loss,
                "best_validation_accuracy": bitlattice.best_validation_accuracy,
                "final_train_accuracy": bitlattice.final_train_accuracy,
                "training_time_seconds": bitlattice_elapsed,
                "confusion_matrix": matrix,
                "per_class_recall": per_class_recall(matrix),
            },
            "weighted_bitlattice": {
                "test_accuracy": weighted_bitlattice.test_accuracy,
                "test_loss": weighted_bitlattice.test_loss,
                "best_validation_accuracy": weighted_bitlattice.best_validation_accuracy,
                "final_train_accuracy": weighted_bitlattice.final_train_accuracy,
                "training_time_seconds": weighted_elapsed,
                "class_weights": weighted_bitlattice.provenance["class_weights"],
                "confusion_matrix": confusion_matrix(test_labels, weighted_predictions, num_classes),
                "per_class_recall": per_class_recall(
                    confusion_matrix(test_labels, weighted_predictions, num_classes)
                ),
            },
            "linear": {
                key: value
                for key, value in linear.items()
                if key != "predictions"
            },
            "mlp": {
                key: value
                for key, value in mlp.items()
                if key != "predictions"
            },
        }
        runs.append(run)
        print(
            f"majority={majority_accuracy:.2%} "
            f"bitlattice={bitlattice.test_accuracy:.2%} "
            f"weighted={weighted_bitlattice.test_accuracy:.2%} "
            f"linear={linear['test_accuracy']:.2%} "
            f"mlp={mlp['test_accuracy']:.2%}"
        )

    results = {
        "corpus_path": str(CORPUS_PATH),
        "total_samples": len(corpus),
        "class_distribution": dict(sorted(Counter(item["label"] for item in corpus).items())),
        "epochs": EPOCHS,
        "batch_size": BATCH_SIZE,
        "leakage_features_removed": list(LEAKAGE_FEATURES),
        "device": str(device),
        "seeds": SEEDS,
        "summary": {
            "majority_baseline": summarize([run["majority_baseline"]["test_accuracy"] for run in runs]),
            "bitlattice": summarize([run["bitlattice"]["test_accuracy"] for run in runs]),
            "weighted_bitlattice": summarize([run["weighted_bitlattice"]["test_accuracy"] for run in runs]),
            "linear": summarize([run["linear"]["test_accuracy"] for run in runs]),
            "mlp": summarize([run["mlp"]["test_accuracy"] for run in runs]),
        },
        "runs": runs,
    }

    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(results, indent=2))
    print(f"\nSaved evaluation to {OUTPUT_PATH}")
    print(json.dumps(results["summary"], indent=2))


if __name__ == "__main__":
    main()
