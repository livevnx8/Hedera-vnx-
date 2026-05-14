#!/usr/bin/env python3
"""
Save training benchmark and key findings

This script automates the process of saving training benchmarks and key findings
for future reference and comparison.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional


def save_benchmark(
    configuration: Dict[str, Any],
    results: Dict[str, Any],
    findings: List[str],
    comparison: Optional[Dict[str, Any]] = None,
    run_name: Optional[str] = None
) -> str:
    """
    Save training benchmark to JSON file.
    
    Args:
        configuration: Training configuration (model, training, dataset, hardware)
        results: Training results (loss, accuracy, time, etc.)
        findings: List of key findings from the run
        comparison: Optional comparison with baseline run
        run_name: Optional custom run name (defaults to configuration['run_name'])
        
    Returns:
        Path to saved benchmark file
    """
    timestamp = datetime.now().strftime("%Y-%m-%d")
    run_id = f"{timestamp}_{run_name or configuration.get('run_name', 'unknown')}"
    
    benchmark = {
        "run_id": run_id,
        "timestamp": datetime.now().isoformat(),
        "configuration": configuration,
        "results": results,
        "findings": findings
    }
    
    if comparison:
        benchmark["comparison"] = comparison
    
    # Create benchmarks directory
    benchmarks_dir = Path("benchmarks")
    benchmarks_dir.mkdir(exist_ok=True)
    
    # Save benchmark
    benchmark_path = benchmarks_dir / f"{run_id}.json"
    with open(benchmark_path, 'w') as f:
        json.dump(benchmark, f, indent=2)
    
    print(f"Saved benchmark to {benchmark_path}")
    return str(benchmark_path)


def save_training_result_benchmark(
    configuration: Dict[str, Any],
    training_result: Any,
    findings: List[str],
    comparison: Optional[Dict[str, Any]] = None,
    run_name: Optional[str] = None
) -> str:
    """
    Save a benchmark from measured TrainingResult data.

    This avoids copying metrics by hand and records provenance needed to
    distinguish train, validation, and held-out test scores.
    """
    results = {
        "final_loss": training_result.final_loss,
        "final_train_accuracy": training_result.final_train_accuracy,
        "best_validation_accuracy": training_result.best_validation_accuracy,
        "test_accuracy": training_result.test_accuracy,
        "test_loss": training_result.test_loss,
        "training_time_seconds": training_result.training_time_seconds,
        "epoch_history": training_result.epoch_history,
        "split_sizes": training_result.split_sizes,
        "provenance": training_result.provenance,
    }

    return save_benchmark(
        configuration=configuration,
        results=results,
        findings=findings,
        comparison=comparison,
        run_name=run_name or configuration.get("run_name", "measured-training")
    )


def save_finding(
    title: str,
    content: str,
    tags: Optional[List[str]] = None,
    finding_dir: str = "findings"
) -> str:
    """
    Save key finding as markdown document.
    
    Args:
        title: Title of the finding
        content: Content of the finding (markdown format)
        tags: Optional list of tags for categorization
        finding_dir: Directory to save findings (default: "findings")
        
    Returns:
        Path to saved finding file
    """
    timestamp = datetime.now().strftime("%Y-%m-%d")
    
    findings_path = Path(finding_dir)
    findings_path.mkdir(exist_ok=True)
    
    # Sanitize title for filename
    safe_title = title.lower().replace(' ', '-').replace('/', '-').replace(':', '-')
    finding_file = findings_path / f"{timestamp}_{safe_title}.md"
    
    with open(finding_file, 'w') as f:
        f.write(f"# {title}\n\n")
        f.write(f"**Date**: {timestamp}\n\n")
        f.write(content)
        if tags:
            f.write(f"\n\n**Tags**: {', '.join(tags)}\n")
    
    print(f"Saved finding to {finding_file}")
    return str(finding_file)


def update_summary(benchmarks_dir: str = "benchmarks", summary_file: str = "benchmarks/summary.md"):
    """
    Update summary markdown with all benchmarks.
    
    Args:
        benchmarks_dir: Directory containing benchmark JSON files
        summary_file: Path to summary markdown file
    """
    benchmarks_path = Path(benchmarks_dir)
    summary_path = Path(summary_file)
    
    # Load all benchmarks
    benchmarks = []
    for benchmark_file in benchmarks_path.glob("*.json"):
        with open(benchmark_file, 'r') as f:
            benchmarks.append(json.load(f))
    
    # Sort by timestamp (newest first)
    benchmarks.sort(key=lambda x: x['timestamp'], reverse=True)
    
    # Generate summary
    summary = "# Training Benchmarks Summary\n\n"
    summary += f"**Last Updated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
    summary += f"**Total Runs**: {len(benchmarks)}\n\n"
    
    # Best performing models table
    summary += "## Best Performing Models\n\n"
    summary += "| Run | Accuracy | Loss | Dataset | Key Finding |\n"
    summary += "|-----|----------|------|---------|-------------|\n"
    
    for bench in benchmarks[:10]:  # Top 10
        run_id = bench['run_id']
        results = bench['results']
        acc = results.get('test_accuracy', results.get('final_accuracy', results.get('final_train_accuracy', 0))) * 100
        loss = results.get('test_loss', results.get('final_loss', 0))
        dataset = bench['configuration'].get('dataset', {}).get('type', 'unknown')
        finding = bench['findings'][0] if bench['findings'] else "N/A"
        summary += f"| {run_id} | {acc:.1f}% | {loss:.2f} | {dataset} | {finding[:50]}... |\n"
    
    # Key findings section
    summary += "\n## Key Findings\n\n"
    all_findings = {}
    for bench in benchmarks:
        for finding in bench['findings']:
            if finding not in all_findings:
                all_findings[finding] = []
            all_findings[finding].append(bench['run_id'])
    
    for i, (finding, runs) in enumerate(all_findings.items(), 1):
        summary += f"{i}. **{finding}** - Observed in: {', '.join(runs)}\n"
    
    # Save summary
    summary_path.parent.mkdir(exist_ok=True)
    with open(summary_path, 'w') as f:
        f.write(summary)
    
    print(f"Updated summary at {summary_path}")


if __name__ == "__main__":
    # Example usage for mixed corpus training
    configuration = {
        "run_name": "mixed-corpus",
        "model": {
            "architecture": "BitLattice",
            "lattice_size": 120,
            "vocabulary_size": 128,
            "num_features": 20,
            "num_classes": 10
        },
        "training": {
            "optimizer": "Adam",
            "learning_rate": 0.01,
            "batch_size": 32,
            "epochs": 20,
            "use_quantization": False,
            "use_learning_retention": False,
            "loss_type": "cross_entropy",
            "lr_scheduler_type": "cosine"
        },
        "dataset": {
            "type": "mixed",
            "real_samples": 100,
            "synthetic_samples": 9000,
            "total_samples": 9100
        },
        "hardware": {
            "device": "cuda",
            "gpu": "RTX 4060 Ti"
        }
    }
    
    results = {
        "final_loss": 0.85,
        "final_accuracy": 0.4545,
        "best_accuracy": 0.4574,
        "best_loss": 0.85,
        "training_time_seconds": 120
    }
    
    findings = [
        "Real data improved accuracy from 33% to 45%",
        "Loss decreased from 1.58 to 0.85",
        "Training completed without errors",
        "Class imbalance present in real data"
    ]
    
    comparison = {
        "baseline_run": "2026-05-10_synthetic-only",
        "baseline_accuracy": 0.34,
        "accuracy_improvement": 0.1145,
        "relative_improvement": 0.3368
    }
    
    # Save benchmark
    save_benchmark(configuration, results, findings, comparison)
    
    # Save key finding
    save_finding(
        "Real Data Improves Accuracy",
        """## Finding
Adding 100 real Hedera transactions to 9000 synthetic samples improved accuracy from 33% to 45%.

## Evidence
- Baseline (synthetic-only): 33-34% accuracy
- Mixed corpus: 45-46% accuracy
- Relative improvement: 36%
- Loss: 1.58 → 0.85

## Implications
- Real data provides valuable signal even in small quantities
- Mixed training is effective when real data is limited
- Class imbalance in real data may need addressing

## Next Steps
- Fetch more real data to reduce synthetic ratio
- Address class imbalance with oversampling
- Test with different real/synthetic ratios
""",
        tags=["real-data", "accuracy", "mixed-training"]
    )
    
    # Update summary
    update_summary()
