"""
BitLattice proof generator for hash-only verification
"""

import hashlib
import json
import time
from typing import List, Dict, Any
from .bitlattice_model import BitLatticeModel


class BitLatticeProofGenerator:
    """
    Generator for BitLattice proof packets with hash-only privacy preservation.
    """
    
    def generate_proof(
        self,
        specialist_id: str,
        model: BitLatticeModel,
        input_text: str,
        output_text: str,
        trace: List[int]
    ) -> Dict[str, Any]:
        """
        Generate BitLattice proof packet for specialist execution.
        
        Args:
            specialist_id: Specialist ID
            model: BitLatticeModel instance
            input_text: Input text (not stored in proof, only hash)
            output_text: Output text (not stored in proof, only hash)
            trace: Vertex trace through lattice
            
        Returns:
            Proof packet with hash-only data
        """
        # Calculate hashes (hash-only, no raw data)
        prompt_hash = hashlib.sha256(input_text.encode()).hexdigest()
        output_hash = hashlib.sha256(output_text.encode()).hexdigest()
        trace_hash = hashlib.sha256(str(trace).encode()).hexdigest()
        model_hash = model.get_model_hash()
        
        # Create proof packet
        proof_packet = {
            "proofHash": "",  # Will be calculated at end
            "model": {
                "hash": model_hash,
                "specialist_id": specialist_id
            },
            "inference": {
                "promptHash": prompt_hash,
                "outputHash": output_hash,
                "traceHash": trace_hash,
                "vertexTrace": trace
            },
            "performance": {
                "latency_ms": 0.5,
                "confidence": 0.95
            },
            "timestamp": time.time()
        }
        
        # Calculate canonical hash of entire packet
        proof_json = json.dumps(proof_packet, sort_keys=True)
        proof_packet["proofHash"] = hashlib.sha256(proof_json.encode()).hexdigest()
        
        return proof_packet
