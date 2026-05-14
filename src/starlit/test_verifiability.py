"""
Integration tests for verifiability layer
"""

from typing import List, Dict, Any
from .bitlattice_proof_generator import BitLatticeProofGenerator
from .tool_proof_generator import ToolProofGenerator
from .swarm_proof_aggregator import SwarmProofAggregator
from .verifiability_layer import VerifiabilityLayer
from .bitlattice_model import BitLatticeModel


def test_bitlattice_proof_generator():
    """Test BitLattice proof generator."""
    print("Testing BitLattice proof generator...")
    
    # Create mock model
    model = BitLatticeModel(lattice_size=15, vocabulary_size=128)
    
    # Generate proof
    generator = BitLatticeProofGenerator()
    proof = generator.generate_proof(
        specialist_id="pattern_add_001",
        model=model,
        input_text="What is 2 + 2?",
        output_text="4",
        trace=[0, 1, 2, 3, 4, 14]
    )
    
    assert "proofHash" in proof
    assert "model" in proof
    assert "inference" in proof
    assert "performance" in proof
    assert proof["inference"]["promptHash"] != ""
    assert proof["inference"]["outputHash"] != ""
    
    print("BitLattice proof generator test passed")


def test_tool_proof_generator():
    """Test tool proof generator."""
    print("Testing tool proof generator...")
    
    # Generate tool proof
    generator = ToolProofGenerator()
    proof = generator.generate_tool_proof(
        specialist_id="pattern_calculator_001",
        tool_name="calculator",
        parameters={"operation": "add", "operands": [2, 2]},
        result=4
    )
    
    assert "toolProofHash" in proof
    assert "tool" in proof
    assert "execution" in proof
    assert "performance" in proof
    assert proof["execution"]["parametersHash"] != ""
    assert proof["execution"]["resultHash"] != ""
    
    print("Tool proof generator test passed")


def test_swarm_proof_aggregator():
    """Test swarm proof aggregator."""
    print("Testing swarm proof aggregator...")
    
    # Create mock proofs
    specialist_proofs = [
        {"proofHash": "abc123", "model": {"hash": "def456"}, "inference": {}, "performance": {}}
    ]
    
    tool_proofs = [
        {"toolProofHash": "ghi789", "tool": {"name": "calculator"}, "execution": {}, "performance": {}}
    ]
    
    coordination_proof = {"coordinationHash": "jkl012", "selected_domains": ["mathematics"]}
    synthesis_proof = {"synthesisHash": "mno345", "quality_score": 0.95}
    
    # Aggregate proofs
    aggregator = SwarmProofAggregator()
    swarm_proof = aggregator.aggregate_proofs(
        specialist_proofs,
        tool_proofs,
        coordination_proof,
        synthesis_proof
    )
    
    assert "swarmProofHash" in swarm_proof
    assert "specialistProofs" in swarm_proof
    assert "toolProofs" in swarm_proof
    assert "coordinationProof" in swarm_proof
    assert "synthesisProof" in swarm_proof
    assert "metadata" in swarm_proof
    
    print("Swarm proof aggregator test passed")


def test_verifiability_layer():
    """Test verifiability layer."""
    print("Testing verifiability layer...")
    
    # Create mock execution data
    specialist_executions = [
        {
            "specialist_id": "pattern_add_001",
            "model": BitLatticeModel(lattice_size=15, vocabulary_size=128),
            "input": "What is 2 + 2?",
            "output": "4",
            "trace": [0, 1, 2, 3, 4, 14]
        }
    ]
    
    tool_executions = [
        {
            "specialist_id": "pattern_calculator_001",
            "tool_name": "calculator",
            "parameters": {"operation": "add", "operands": [2, 2]},
            "result": 4
        }
    ]
    
    coordination_data = {
        "selected_domains": ["mathematics"],
        "selected_specialists": ["pattern_add_001"]
    }
    
    synthesis_data = {
        "output": "4",
        "avg_quality_score": 0.95
    }
    
    # Generate swarm proof
    layer = VerifiabilityLayer()
    swarm_proof = layer.generate_swarm_proof(
        specialist_executions,
        tool_executions,
        coordination_data,
        synthesis_data
    )
    
    assert "swarmProofHash" in swarm_proof
    assert "metadata" in swarm_proof
    assert swarm_proof["metadata"]["total_specialists"] == 1
    assert swarm_proof["metadata"]["total_tools"] == 1
    
    print("Verifiability layer test passed")


def run_all_tests():
    """Run all verifiability tests."""
    print("Running verifiability layer tests...\n")
    
    test_bitlattice_proof_generator()
    test_tool_proof_generator()
    test_swarm_proof_aggregator()
    test_verifiability_layer()
    
    print("\nVerifiability layer tests complete")


if __name__ == "__main__":
    run_all_tests()
