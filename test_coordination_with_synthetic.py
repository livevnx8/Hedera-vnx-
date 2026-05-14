#!/usr/bin/env python3
"""
Test coordination layer with synthetic artifacts
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.domain_layer import HierarchicalDomainLayer
from starlit.artifact_storage import list_artifacts

def test_domain_layer():
    """Test domain layer with synthetic artifacts."""
    print("Testing HierarchicalDomainLayer with synthetic artifacts...")
    
    artifact_dir = "/home/vera-live-0-1/hedera-llm-api/starlit-artifacts"
    
    # Check artifacts exist
    domain_specialists = list_artifacts(artifact_dir, "domain")
    concept_specialists = list_artifacts(artifact_dir, "concept")
    pattern_specialists = list_artifacts(artifact_dir, "pattern")
    
    print(f"Found artifacts:")
    print(f"  - Domain: {len(domain_specialists)}")
    print(f"  - Concept: {len(concept_specialists)}")
    print(f"  - Pattern: {len(pattern_specialists)}")
    
    # Initialize domain layer
    domain_layer = HierarchicalDomainLayer(artifact_dir)
    
    # Test classification
    test_inputs = [
        "What is 2 + 2?",
        "Calculate 15 × 3",
        "Identify the subject in the sentence"
    ]
    
    print("\nTesting classification:")
    for test_input in test_inputs:
        try:
            classifications = domain_layer.classify(test_input, top_k=3)
            print(f"\nInput: {test_input}")
            print(f"Classifications: {classifications}")
        except Exception as e:
            print(f"\nInput: {test_input}")
            print(f"Error: {e}")
    
    print("\nDomain layer test complete")

if __name__ == "__main__":
    test_domain_layer()
