"""
Conflict resolver for specialist outputs
"""

from typing import List, Dict, Any


class ConflictResolver:
    """
    Conflict resolver for handling disagreements between specialists.
    """
    
    def __init__(self, resolution_strategy: str = "quality_based"):
        """
        Initialize conflict resolver.
        
        Args:
            resolution_strategy: Strategy for resolving conflicts (quality_based, voting, consensus)
        """
        self.resolution_strategy = resolution_strategy
    
    def resolve_conflicts(self, scored_outputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Resolve conflicts between specialist outputs.
        
        Args:
            scored_outputs: List of outputs with quality scores
            
        Returns:
            List of resolved outputs
        """
        if not scored_outputs:
            return []
        
        # Group outputs by output value
        output_groups = {}
        
        for output in scored_outputs:
            output_value = output.get("output", "")
            if output_value not in output_groups:
                output_groups[output_value] = []
            output_groups[output_value].append(output)
        
        if self.resolution_strategy == "quality_based":
            return self._quality_based_resolution(output_groups)
        elif self.resolution_strategy == "voting":
            return self._voting_resolution(output_groups)
        else:  # consensus
            return self._consensus_resolution(scored_outputs)
    
    def _quality_based_resolution(self, output_groups: Dict[str, List[Dict]]) -> List[Dict[str, Any]]:
        """
        Select highest quality output from each group.
        
        Args:
            output_groups: Grouped outputs
            
        Returns:
            List of best outputs
        """
        resolved = []
        
        for group in output_groups.values():
            best = max(group, key=lambda x: x.get("quality_score", 0))
            resolved.append(best)
        
        return resolved
    
    def _voting_resolution(self, output_groups: Dict[str, List[Dict]]) -> List[Dict[str, Any]]:
        """
        Select most frequent output.
        
        Args:
            output_groups: Grouped outputs
            
        Returns:
            List of selected outputs
        """
        largest_group = max(output_groups.values(), key=len)
        return largest_group
    
    def _consensus_resolution(self, scored_outputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Return all outputs (no filtering).
        
        Args:
            scored_outputs: All scored outputs
            
        Returns:
            All outputs
        """
        return scored_outputs
