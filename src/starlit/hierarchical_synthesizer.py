"""
Hierarchical synthesizer for combining specialist outputs
"""

from typing import List, Dict, Any


class HierarchicalSynthesizer:
    """
    Hierarchical synthesizer for final output generation.
    """
    
    def __init__(self, synthesis_strategy: str = "weighted"):
        """
        Initialize hierarchical synthesizer.
        
        Args:
            synthesis_strategy: Strategy for synthesis (weighted, selection, concatenation)
        """
        self.synthesis_strategy = synthesis_strategy
    
    def synthesize(self, resolved_outputs: List[Dict[str, Any]]) -> str:
        """
        Synthesize final output from resolved outputs.
        
        Args:
            resolved_outputs: List of resolved outputs
            
        Returns:
            Final synthesized output
        """
        if not resolved_outputs:
            return ""
        
        if self.synthesis_strategy == "weighted":
            return self._weighted_synthesis(resolved_outputs)
        elif self.synthesis_strategy == "selection":
            return self._selection_synthesis(resolved_outputs)
        else:  # concatenation
            return self._concatenation_synthesis(resolved_outputs)
    
    def _weighted_synthesis(self, resolved_outputs: List[Dict[str, Any]]) -> str:
        """
        Select output with highest quality score.
        
        Args:
            resolved_outputs: List of resolved outputs
            
        Returns:
            Best output
        """
        total_weight = sum(o.get("quality_score", 0) for o in resolved_outputs)
        
        if total_weight == 0:
            return resolved_outputs[0].get("output", "")
        
        # Select output with highest weight
        best = max(resolved_outputs, key=lambda x: x.get("quality_score", 0))
        return best.get("output", "")
    
    def _selection_synthesis(self, resolved_outputs: List[Dict[str, Any]]) -> str:
        """
        Select single best output.
        
        Args:
            resolved_outputs: List of resolved outputs
            
        Returns:
            Best output
        """
        best = max(resolved_outputs, key=lambda x: x.get("quality_score", 0))
        return best.get("output", "")
    
    def _concatenation_synthesis(self, resolved_outputs: List[Dict[str, Any]]) -> str:
        """
        Concatenate all outputs.
        
        Args:
            resolved_outputs: List of resolved outputs
            
        Returns:
            Concatenated output
        """
        outputs = [o.get("output", "") for o in resolved_outputs]
        return " ".join(outputs)
