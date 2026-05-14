"""
Artifact storage for BitLattice micro-specialists
"""

import json
import os
from typing import Dict, Any
from .artifact_format import BitLatticeArtifact


def store_artifact(
    artifact: BitLatticeArtifact,
    validation_report: Dict[str, Any],
    benchmark_report: Dict[str, Any],
    artifact_dir: str,
    layer: str
):
    """
    Store artifact with metadata.
    
    Args:
        artifact: BitLatticeArtifact
        validation_report: Validation report
        benchmark_report: Benchmark report
        artifact_dir: Artifact directory
        layer: Layer type (domain/concept/pattern)
    """
    specialist_id = artifact.metadata["specialist_id"]
    
    # Save metadata
    metadata = {
        "artifact": artifact.metadata,
        "validation": validation_report,
        "benchmark": benchmark_report
    }
    
    metadata_path = f"{artifact_dir}/{layer}/{specialist_id}_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Stored {specialist_id} with metadata")


def load_artifact(artifact_dir: str, layer: str, specialist_id: str) -> tuple:
    """
    Load artifact with metadata.
    
    Args:
        artifact_dir: Artifact directory
        layer: Layer type
        specialist_id: Specialist ID
        
    Returns:
        Tuple of (artifact, metadata)
    """
    # Load artifact
    artifact_path = f"{artifact_dir}/{layer}/{specialist_id}.vnx"
    artifact = BitLatticeArtifact.load(artifact_path)
    
    # Load metadata
    metadata_path = f"{artifact_dir}/{layer}/{specialist_id}_metadata.json"
    with open(metadata_path, "r") as f:
        metadata = json.load(f)
    
    return artifact, metadata


def list_artifacts(artifact_dir: str, layer: str = None) -> list:
    """
    List artifacts in directory.
    
    Args:
        artifact_dir: Artifact directory
        layer: Layer type (optional)
        
    Returns:
        List of specialist IDs
    """
    if layer:
        search_dir = f"{artifact_dir}/{layer}"
    else:
        search_dir = artifact_dir
    
    artifacts = []
    for filename in os.listdir(search_dir):
        if filename.endswith(".vnx"):
            specialist_id = filename.replace(".vnx", "")
            artifacts.append(specialist_id)
    
    return artifacts


def get_artifact_stats(artifact_dir: str) -> Dict[str, Any]:
    """
    Get statistics about stored artifacts.
    
    Args:
        artifact_dir: Artifact directory
        
    Returns:
        Statistics dictionary
    """
    stats = {
        "domain": len(list_artifacts(artifact_dir, "domain")),
        "concept": len(list_artifacts(artifact_dir, "concept")),
        "pattern": len(list_artifacts(artifact_dir, "pattern")),
        "total": 0
    }
    
    stats["total"] = stats["domain"] + stats["concept"] + stats["pattern"]
    
    return stats
