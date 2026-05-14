"""
Swarm proof aggregator for combining individual proofs
"""

import hashlib
import json
import time
from typing import List, Dict, Any


class SwarmProofAggregator:
    """
    Aggregator for combining individual proofs into swarm-level proof.
    """
    
    def aggregate_proofs(
        self,
        specialist_proofs: List[Dict[str, Any]],
        tool_proofs: List[Dict[str, Any]],
        coordination_proof: Dict[str, Any],
        synthesis_proof: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Aggregate all proofs into swarm-level proof.
        
        Args:
            specialist_proofs: List of specialist proof packets
            tool_proofs: List of tool proof packets
            coordination_proof: Coordination proof
            synthesis_proof: Synthesis proof
            
        Returns:
            Aggregated swarm proof
        """
        # Create swarm proof
        swarm_proof = {
            "swarmProofHash": "",
            "specialistProofs": specialist_proofs,
            "toolProofs": tool_proofs,
            "coordinationProof": coordination_proof,
            "synthesisProof": synthesis_proof,
            "metadata": {
                "total_specialists": len(specialist_proofs),
                "total_tools": len(tool_proofs),
                "timestamp": time.time()
            }
        }
        
        # Calculate canonical hash
        proof_json = json.dumps(swarm_proof, sort_keys=True)
        swarm_proof["swarmProofHash"] = hashlib.sha256(proof_json.encode()).hexdigest()
        
        return swarm_proof
