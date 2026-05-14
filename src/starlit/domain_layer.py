"""
Hierarchical domain layer for Starlit coordination engine
"""

import time
from typing import List, Dict, Any
from .bitlattice_model import BitLatticeModel
from .artifact_format import BitLatticeArtifact
from .artifact_storage import load_artifact


class HierarchicalDomainLayer:
    """
    Hierarchical domain layer for deterministic domain classification.
    """
    
    def __init__(self, artifact_dir: str, top_k: int = 3):
        """
        Initialize domain layer.
        
        Args:
            artifact_dir: Directory containing domain artifacts
            top_k: Number of top domains to select
        """
        self.artifact_dir = artifact_dir
        self.top_k = top_k
        self.domain_specialists = []
        self._load_specialists()
    
    def _load_specialists(self):
        """Load all domain specialists from artifacts."""
        from .artifact_storage import list_artifacts
        
        specialist_ids = list_artifacts(self.artifact_dir, "domain")
        
        for specialist_id in specialist_ids:
            artifact, metadata = load_artifact(self.artifact_dir, "domain", specialist_id)
            self.domain_specialists.append({
                "specialist_id": specialist_id,
                "specialization": metadata["artifact"]["specialization"],
                "artifact": artifact,
                "metadata": metadata
            })
    
    def classify(self, input_text: str) -> List[Dict[str, Any]]:
        """
        Classify input into domains using all domain specialists.
        
        Args:
            input_text: Input text to classify
            
        Returns:
            List of (domain, confidence) pairs sorted by confidence
        """
        results = []
        
        for specialist in self.domain_specialists:
            # Load model from artifact
            from .bitlattice_model import unpack_ternary_weights
            weights = unpack_ternary_weights(
                specialist["artifact"].weights,
                specialist["metadata"]["artifact"]["lattice_topology"]["vertex_count"]
            )
            
            model = BitLatticeModel(
                lattice_size=specialist["metadata"]["artifact"]["lattice_topology"]["vertex_count"],
                vocabulary_size=specialist["metadata"]["artifact"]["vocabulary"]["size"]
            )
            model.weights = weights
            
            # Run inference
            start_time = time.time()
            output = model.forward_pass(input_text)
            latency = time.time() - start_time
            
            # Calculate confidence
            confidence = model.calculate_confidence(output)
            
            results.append({
                "domain": specialist["specialization"],
                "specialist_id": specialist["specialist_id"],
                "confidence": confidence,
                "output": output,
                "latency_ms": latency * 1000
            })
        
        # Sort by confidence and return top-k
        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[:self.top_k]
    
    def get_selected_domains(self, input_text: str) -> List[str]:
        """
        Get selected domain names.
        
        Args:
            input_text: Input text to classify
            
        Returns:
            List of domain names
        """
        results = self.classify(input_text)
        return [r["domain"] for r in results]
