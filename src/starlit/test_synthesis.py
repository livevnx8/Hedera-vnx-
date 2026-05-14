"""
Integration tests for synthesis engine
"""

from typing import List, Dict, Any
from .quality_scorer import QualityScorer
from .conflict_resolver import ConflictResolver
from .hierarchical_synthesizer import HierarchicalSynthesizer
from .synthesis_engine import SynthesisEngine


def test_quality_scorer():
    """Test quality scorer."""
    print("Testing quality scorer...")
    
    # Create mock outputs
    outputs = [
        {"specialist_id": "pattern_add_001", "output": "42", "confidence": 0.9},
        {"specialist_id": "pattern_add_002", "output": "42", "confidence": 0.8},
        {"specialist_id": "concept_add_001", "output": "43", "confidence": 0.7}
    ]
    
    scorer = QualityScorer()
    scored = scorer.score_outputs(outputs)
    
    assert len(scored) == 3
    assert all("quality_score" in o for o in scored)
    
    print("Quality scorer test passed")


def test_conflict_resolver():
    """Test conflict resolver."""
    print("Testing conflict resolver...")
    
    # Create mock scored outputs with conflicts
    outputs = [
        {"specialist_id": "pattern_add_001", "output": "42", "quality_score": 0.9},
        {"specialist_id": "pattern_add_002", "output": "42", "quality_score": 0.8},
        {"specialist_id": "concept_add_001", "output": "43", "quality_score": 0.7}
    ]
    
    resolver = ConflictResolver(resolution_strategy="quality_based")
    resolved = resolver.resolve_conflicts(outputs)
    
    assert len(resolved) > 0
    
    print("Conflict resolver test passed")


def test_hierarchical_synthesizer():
    """Test hierarchical synthesizer."""
    print("Testing hierarchical synthesizer...")
    
    # Create mock resolved outputs
    outputs = [
        {"specialist_id": "pattern_add_001", "output": "42", "quality_score": 0.9},
        {"specialist_id": "pattern_add_002", "output": "42", "quality_score": 0.8}
    ]
    
    synthesizer = HierarchicalSynthesizer(synthesis_strategy="selection")
    final = synthesizer.synthesize(outputs)
    
    assert final in ["42", "42"]
    
    print("Hierarchical synthesizer test passed")


def test_synthesis_engine():
    """Test synthesis engine."""
    print("Testing synthesis engine...")
    
    # Create mock specialist outputs
    outputs = [
        {"specialist_id": "pattern_add_001", "output": "42", "confidence": 0.9},
        {"specialist_id": "pattern_add_002", "output": "42", "confidence": 0.8},
        {"specialist_id": "concept_add_001", "output": "43", "confidence": 0.7}
    ]
    
    engine = SynthesisEngine()
    result = engine.synthesize(outputs)
    
    assert "output" in result
    assert "synthesis_time_ms" in result
    assert "avg_quality_score" in result
    assert result["specialists_used"] == 3
    
    print("Synthesis engine test passed")


def run_all_tests():
    """Run all synthesis tests."""
    print("Running synthesis engine tests...\n")
    
    test_quality_scorer()
    test_conflict_resolver()
    test_hierarchical_synthesizer()
    test_synthesis_engine()
    
    print("\nSynthesis engine tests complete")


if __name__ == "__main__":
    run_all_tests()
