#!/usr/bin/env python3
"""
Regression tests for honest BitLattice classification evaluation.
"""

import math
import sys

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch

from starlit.bitlattice_model_pytorch import (
    BitLatticeTrainerPyTorch,
    compute_class_weights,
    prepare_classification_examples,
    split_classification_corpus,
)


def make_sample(label: int, index: int) -> dict:
    return {
        "features": {
            "transaction_type_idx": float(label),
            "account_id_normalized": float(index % 7) / 7.0,
            "transaction_fee_log": float(label + 1) / 20.0,
            "hour_of_day": float(index % 24) / 24.0,
        },
        "label": label,
    }


def test_prepare_classification_examples_removes_leakage_feature():
    corpus = [make_sample(label=2, index=1)]

    features, labels, feature_names, removed = prepare_classification_examples(
        corpus,
        leakage_feature_names=("transaction_type_idx",),
    )

    assert removed == ["transaction_type_idx"]
    assert "transaction_type_idx" not in feature_names
    assert features.shape == (1, 3)
    assert labels.tolist() == [2]


def test_split_classification_corpus_is_deterministic_and_stratified():
    corpus = [make_sample(label=i % 3, index=i) for i in range(30)]

    first = split_classification_corpus(corpus, seed=123, train_ratio=0.6, val_ratio=0.2)
    second = split_classification_corpus(corpus, seed=123, train_ratio=0.6, val_ratio=0.2)

    assert first == second
    assert len(first["train"]) == 18
    assert len(first["val"]) == 6
    assert len(first["test"]) == 6
    for split_name in ("train", "val", "test"):
        assert sorted({item["label"] for item in first[split_name]}) == [0, 1, 2]


def test_compute_class_weights_uses_training_distribution_only():
    labels = torch.tensor([0, 0, 0, 1], dtype=torch.long)

    weights = compute_class_weights(labels, num_classes=3)

    assert weights.tolist() == [0.5, 1.5, 0.0]


def test_trainer_returns_measured_metrics_without_leakage():
    torch.manual_seed(7)
    corpus = [make_sample(label=i % 2, index=i) for i in range(80)]

    trainer = BitLatticeTrainerPyTorch(
        lattice_size=12,
        vocabulary_size=16,
        num_features=3,
        num_classes=2,
        learning_rate=0.01,
        device="cpu",
        use_learning_retention=False,
        loss_type="cross_entropy",
    )

    result = trainer.train(
        classification_corpus=corpus,
        generation_corpus=corpus,
        epochs=3,
        batch_size=8,
        target_accuracy=0.99,
        split_seed=11,
        leakage_feature_names=("transaction_type_idx",),
    )

    assert result.model is trainer.model
    assert result.provenance["leakage_features_removed"] == ["transaction_type_idx"]
    assert result.provenance["split_seed"] == 11
    assert result.provenance["metric_scope"] == "heldout_test"
    assert result.provenance["feature_names"] == [
        "account_id_normalized",
        "transaction_fee_log",
        "hour_of_day",
    ]
    assert result.provenance["test_majority_baseline_label"] in (0, 1)
    assert math.isfinite(result.provenance["test_majority_baseline_accuracy"])
    assert result.provenance["class_weighting"] == "none"
    assert sum(result.split_sizes.values()) == len(corpus)
    assert len(result.epoch_history) >= 1

    for value in (
        result.final_loss,
        result.final_train_accuracy,
        result.best_validation_accuracy,
        result.test_accuracy,
        result.test_loss,
        result.training_time_seconds,
    ):
        assert isinstance(value, float)
        assert math.isfinite(value)


if __name__ == "__main__":
    test_prepare_classification_examples_removes_leakage_feature()
    test_split_classification_corpus_is_deterministic_and_stratified()
    test_compute_class_weights_uses_training_distribution_only()
    test_trainer_returns_measured_metrics_without_leakage()
    print("training evaluation tests passed")
