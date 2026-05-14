#!/usr/bin/env python3
"""
Test training with mixed synthetic/real corpus

This test validates that the BitLattice model can learn effectively
when trained on a mixed corpus of real Hedera transactions (100 samples)
and synthetic data (9000 samples).

Expected Results:
- Loss should decrease from initial value (~1.58) to < 1.0
- Accuracy should reach > 40%
- Training should complete without errors
"""

import sys
import json
import math
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

import torch

from starlit.bitlattice_model_pytorch import BitLatticeTrainerPyTorch
from save_benchmark import save_training_result_benchmark


def test_mixed_corpus_training():
    """
    Test training with mixed synthetic/real corpus.
    
    Returns:
        TrainingResult from training
    """
    print("=== Testing Mixed Corpus Training ===\n")
    
    # Load mixed corpus
    corpus_path = '/home/vera-live-0-1/hedera-llm-api/data/mixed_hedera_classification_corpus.json'
    try:
        with open(corpus_path, 'r') as f:
            mixed_corpus = json.load(f)
    except FileNotFoundError:
        print(f"Error: Corpus file not found at {corpus_path}")
        print("Please run mix_synthetic_real_corpus.py first")
        return None, None
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse corpus JSON: {e}")
        return None, None
    
    print(f"Loaded {len(mixed_corpus)} samples from mixed corpus")
    assert len(mixed_corpus) > 0, "Corpus should not be empty"
    
    # Validate corpus structure
    assert 'features' in mixed_corpus[0], "Corpus items should have 'features' key"
    assert 'label' in mixed_corpus[0], "Corpus items should have 'label' key"
    assert len(mixed_corpus[0]['features']) == 20, "Features should have 20 dimensions"
    
    # Create trainer
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Training on {device}\n")
    
    trainer = BitLatticeTrainerPyTorch(
        lattice_size=120,
        vocabulary_size=128,
        num_features=20,
        num_classes=10,
        learning_rate=0.01,
        device=device,
        use_learning_retention=False,
        loss_type='cross_entropy',
        lr_scheduler_type='cosine'
    )
    
    # Train for 20 epochs
    print("Training for 20 epochs on mixed corpus...")
    try:
        result = trainer.train(
            classification_corpus=mixed_corpus,
            generation_corpus=mixed_corpus,
            epochs=20,
            batch_size=32,
            target_accuracy=0.55,
            split_seed=42,
            leakage_feature_names=("transaction_type_idx",)
        )
    except Exception as e:
        print(f"Error during training: {e}")
        return None
    
    baseline_accuracy = result.provenance["test_majority_baseline_accuracy"]
    print(f"\nFinal Train Loss: {result.final_loss:.4f}")
    print(f"Final Train Accuracy: {result.final_train_accuracy:.2%}")
    print(f"Best Validation Accuracy: {result.best_validation_accuracy:.2%}")
    print(f"Held-out Test Loss: {result.test_loss:.4f}")
    print(f"Held-out Test Accuracy: {result.test_accuracy:.2%}")
    print(f"Majority Baseline Accuracy: {baseline_accuracy:.2%}")
    print(f"Removed Leakage Features: {result.provenance['leakage_features_removed']}")
    
    # Assertions based on measured, held-out results
    assert math.isfinite(result.final_loss), "Final train loss should be finite"
    assert math.isfinite(result.test_loss), "Held-out test loss should be finite"
    assert math.isfinite(result.test_accuracy), "Held-out test accuracy should be finite"
    assert len(result.epoch_history) > 0, "Epoch history should not be empty"
    assert result.provenance["metric_scope"] == "heldout_test"
    assert "transaction_type_idx" in result.provenance["leakage_features_removed"]
    assert result.test_accuracy > baseline_accuracy, (
        f"Held-out test accuracy should beat majority baseline; "
        f"got {result.test_accuracy:.2%} vs {baseline_accuracy:.2%}"
    )
    
    print("\n=== Mixed Corpus Training Test PASSED ===")
    
    return result


if __name__ == "__main__":
    training_result = test_mixed_corpus_training()
    
    if training_result is not None:
        configuration = {
            "run_name": "mixed-corpus-measured",
            "model": {
                "architecture": "BitLattice",
                "lattice_size": 120,
                "vocabulary_size": 128,
                "num_features": training_result.provenance["num_input_features"],
                "num_classes": 10
            },
            "training": {
                "optimizer": "Adam",
                "learning_rate": 0.01,
                "batch_size": 32,
                "epochs_requested": 20,
                "use_quantization": False,
                "use_learning_retention": False,
                "loss_type": "cross_entropy",
                "lr_scheduler_type": "cosine"
            },
            "dataset": {
                "type": "mixed",
                "total_samples": sum(training_result.split_sizes.values())
            },
            "hardware": {
                "device": "cuda" if torch.cuda.is_available() else "cpu"
            }
        }
        benchmark_path = save_training_result_benchmark(
            configuration=configuration,
            training_result=training_result,
            findings=[
                "Metrics are measured from train/validation/test evaluation",
                "transaction_type_idx removed from classification inputs",
                "Held-out test accuracy compared against train-majority baseline"
            ],
            run_name="mixed-corpus-measured"
        )
        print(f"\nTest completed successfully!")
        print(f"Benchmark: {benchmark_path}")
        print(f"Test Accuracy: {training_result.test_accuracy:.2%}")
    else:
        print("\nTest failed!")
        sys.exit(1)
