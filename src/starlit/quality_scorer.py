"""
Quality scorer for specialist outputs
"""

from typing import List, Dict, Any


class QualityScorer:
    """
    Quality scorer for evaluating specialist outputs.
    """
    
    def __init__(self):
        """Initialize quality scorer with scoring weights."""
        self.scoring_weights = {
            "confidence": 0.4,
            "consistency": 0.3,
            "relevance": 0.3
        }
    
    def score_outputs(self, outputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Score each specialist output.
        
        Args:
            outputs: List of specialist outputs with metadata
            
        Returns:
            List of outputs with quality scores
        """
        scored_outputs = []
        
        for output in outputs:
            # Calculate individual scores
            confidence_score = output.get("confidence", 0.5)
            consistency_score = self._calculate_consistency(output, outputs)
            relevance_score = self._calculate_relevance(output)
            
            # Calculate weighted score
            quality_score = (
                self.scoring_weights["confidence"] * confidence_score +
                self.scoring_weights["consistency"] * consistency_score +
                self.scoring_weights["relevance"] * relevance_score
            )
            
            output["quality_score"] = quality_score
            scored_outputs.append(output)
        
        return scored_outputs
    
    def _calculate_consistency(self, output: Dict, all_outputs: List[Dict]) -> float:
        """
        Calculate consistency score based on agreement with other outputs.
        
        Args:
            output: Output to evaluate
            all_outputs: All outputs for comparison
            
        Returns:
            Consistency score (0-1)
        """
        output_value = output.get("output", "")
        
        if not output_value:
            return 0.0
        
        # Count similar outputs
        similar_count = 0
        for other_output in all_outputs:
            if other_output.get("output") == output_value:
                similar_count += 1
        
        # Consistency = proportion of similar outputs
        if len(all_outputs) == 0:
            return 0.0
        
        return similar_count / len(all_outputs)
    
    def _calculate_relevance(self, output: Dict) -> float:
        """
        Calculate relevance score based on specialist type and output.
        
        Args:
            output: Output to evaluate
            
        Returns:
            Relevance score (0-1)
        """
        specialist_id = output.get("specialist_id", "")
        
        # Pattern specialists are most relevant, then concept, then domain
        if "pattern_" in specialist_id:
            return 0.9
        elif "concept_" in specialist_id:
            return 0.7
        else:
            return 0.5
