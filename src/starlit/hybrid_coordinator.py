"""
Hybrid coordinator combining hierarchical and adaptive coordination
"""

import time
from typing import List, Dict, Any
from .domain_layer import HierarchicalDomainLayer
from .adaptive_selector import AdaptiveSelector


class HybridCoordinator:
    """
    Hybrid coordinator combining hierarchical domain layer with adaptive selection.
    """
    
    def __init__(
        self,
        domain_layer: HierarchicalDomainLayer,
        adaptive_selector: AdaptiveSelector,
        fallback_enabled: bool = True,
        fallback_threshold: float = 0.2
    ):
        """
        Initialize hybrid coordinator.
        
        Args:
            domain_layer: Hierarchical domain layer
            adaptive_selector: Adaptive selector
            fallback_enabled: Whether to enable fallback mechanism
            fallback_threshold: Time threshold for fallback (seconds)
        """
        self.domain_layer = domain_layer
        self.adaptive_selector = adaptive_selector
        self.fallback_enabled = fallback_enabled
        self.fallback_threshold = fallback_threshold
        self.fallback_count = 0
        self.adaptive_count = 0
    
    def coordinate(
        self,
        input_text: str,
        concept_specialists: List[Dict],
        pattern_specialists: List[Dict],
        n: int = 500
    ) -> List[str]:
        """
        Coordinate specialist selection using hybrid approach.
        
        Args:
            input_text: Input text
            concept_specialists: Available concept specialists
            pattern_specialists: Available pattern specialists
            n: Number of specialists to select
            
        Returns:
            List of selected specialist IDs
        """
        start_time = time.time()
        
        # Layer 1: Hierarchical domain classification
        domain_results = self.domain_layer.classify(input_text)
        selected_domains = [r["domain"] for r in domain_results]
        
        # Layer 2: Adaptive selection
        try:
            selected_specialists = self.adaptive_selector.select_specialists(
                input_text,
                selected_domains,
                concept_specialists,
                pattern_specialists,
                n=n
            )
            
            selection_time = time.time() - start_time
            
            # Check if selection took too long
            if selection_time > self.fallback_threshold and self.fallback_enabled:
                print(f"Adaptive selection timeout ({selection_time:.3f}s), using fallback")
                self.fallback_count += 1
                return self._fallback_coordination(input_text, selected_domains, concept_specialists, pattern_specialists)
            
            self.adaptive_count += 1
            return selected_specialists
            
        except Exception as e:
            print(f"Adaptive selection error: {e}, using fallback")
            self.fallback_count += 1
            return self._fallback_coordination(input_text, selected_domains, concept_specialists, pattern_specialists)
    
    def _fallback_coordination(
        self,
        input_text: str,
        selected_domains: List[str],
        concept_specialists: List[Dict],
        pattern_specialists: List[Dict]
    ) -> List[str]:
        """
        Fallback to full hierarchical coordination.
        
        Args:
            input_text: Input text
            selected_domains: Selected domains
            concept_specialists: Available concept specialists
            pattern_specialists: Available pattern specialists
            
        Returns:
            List of selected specialist IDs
        """
        selected = []
        
        # Select all concept specialists from selected domains
        for specialist in concept_specialists:
            if specialist.get("parent_domain") in selected_domains:
                selected.append(specialist["specialist_id"])
        
        # Select all pattern specialists from selected concepts
        selected_concepts = [
            s["specialization"] for s in concept_specialists
            if s.get("parent_domain") in selected_domains
        ]
        
        for specialist in pattern_specialists:
            if specialist.get("parent_concept") in selected_concepts:
                selected.append(specialist["specialist_id"])
        
        return selected
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get coordination statistics.
        
        Returns:
            Statistics dictionary
        """
        total = self.adaptive_count + self.fallback_count
        return {
            "adaptive_count": self.adaptive_count,
            "fallback_count": self.fallback_count,
            "total": total,
            "fallback_rate": self.fallback_count / total if total > 0 else 0
        }
