"""
Verifiability layer for Starlit swarm proof generation
"""

import hashlib
import json
import time
from typing import List, Dict, Any
from .bitlattice_proof_generator import BitLatticeProofGenerator
from .tool_proof_generator import ToolProofGenerator
from .swarm_proof_aggregator import SwarmProofAggregator


class VerifiabilityLayer:
    """
    Verifiability layer for generating complete swarm proofs.
    """
    
    def __init__(self):
        """Initialize verifiability layer with all components."""
        self.bitlattice_proof_generator = BitLatticeProofGenerator()
        self.tool_proof_generator = ToolProofGenerator()
        self.swarm_proof_aggregator = SwarmProofAggregator()
    
    def generate_swarm_proof(
        self,
        specialist_executions: List[Dict[str, Any]],
        tool_executions: List[Dict[str, Any]],
        coordination_data: Dict[str, Any],
        synthesis_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate complete swarm proof.
        
        Args:
            specialist_executions: List of specialist execution data
            tool_executions: List of tool execution data
            coordination_data: Coordination layer data
            synthesis_data: Synthesis layer data
            
        Returns:
            Complete swarm proof
        """
        start_time = time.time()
        
        # Generate specialist proofs
        specialist_proofs = []
        for execution in specialist_executions:
            proof = self.bitlattice_proof_generator.generate_proof(
                execution["specialist_id"],
                execution["model"],
                execution["input"],
                execution["output"],
                execution.get("trace", [])
            )
            specialist_proofs.append(proof)
        
        # Generate tool proofs
        tool_proofs = []
        for execution in tool_executions:
            proof = self.tool_proof_generator.generate_tool_proof(
                execution["specialist_id"],
                execution["tool_name"],
                execution["parameters"],
                execution["result"]
            )
            tool_proofs.append(proof)
        
        # Generate coordination proof
        coordination_proof = {
            "coordinationHash": hashlib.sha256(json.dumps(coordination_data, sort_keys=True).encode()).hexdigest(),
            "selected_domains": coordination_data.get("selected_domains", []),
            "selected_specialists": coordination_data.get("selected_specialists", []),
            "timestamp": time.time()
        }
        
        # Generate synthesis proof
        synthesis_proof = {
            "synthesisHash": hashlib.sha256(json.dumps(synthesis_data, sort_keys=True).encode()).hexdigest(),
            "final_output_hash": hashlib.sha256(synthesis_data.get("output", "").encode()).hexdigest(),
            "quality_score": synthesis_data.get("avg_quality_score", 0),
            "timestamp": time.time()
        }
        
        # Aggregate all proofs
        swarm_proof = self.swarm_proof_aggregator.aggregate_proofs(
            specialist_proofs,
            tool_proofs,
            coordination_proof,
            synthesis_proof
        )
        
        proof_generation_time = time.time() - start_time
        
        # Add metadata
        swarm_proof["metadata"]["proof_generation_time_ms"] = proof_generation_time * 1000
        swarm_proof["metadata"]["total_proof_size_bytes"] = len(json.dumps(swarm_proof).encode())
        
        return swarm_proof
