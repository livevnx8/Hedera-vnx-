"""
Synthesis engine for combining specialist outputs
"""

import time
from typing import List, Dict, Any
from .quality_scorer import QualityScorer
from .conflict_resolver import ConflictResolver
from .hierarchical_synthesizer import HierarchicalSynthesizer


class SynthesisEngine:
    """
    Synthesis engine for combining specialist outputs into final result.
    """
    
    def __init__(self):
        """Initialize synthesis engine with all components."""
        self.quality_scorer = QualityScorer()
        self.conflict_resolver = ConflictResolver(resolution_strategy="quality_based")
        self.synthesizer = HierarchicalSynthesizer(synthesis_strategy="selection")
    
    def synthesize(self, specialist_outputs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Synthesize final output from specialist outputs.
        
        Args:
            specialist_outputs: List of specialist outputs
            
        Returns:
            Synthesis result with final output and metadata
        """
        start_time = time.time()
        
        # Step 1: Quality scoring
        scored_outputs = self.quality_scorer.score_outputs(specialist_outputs)
        
        # Step 2: Conflict resolution
        resolved_outputs = self.conflict_resolver.resolve_conflicts(scored_outputs)
        
        # Step 3: Hierarchical synthesis
        final_output = self.synthesizer.synthesize(resolved_outputs)
        
        synthesis_time = time.time() - start_time
        
        # Calculate synthesis quality
        avg_quality = sum(o.get("quality_score", 0) for o in scored_outputs) / len(scored_outputs) if scored_outputs else 0
        
        return {
            "output": final_output,
            "synthesis_time_ms": synthesis_time * 1000,
            "avg_quality_score": avg_quality,
            "specialists_used": len(specialist_outputs),
            "outputs_considered": len(resolved_outputs)
        }
