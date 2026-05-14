"""
Tool proof generator for hash-only verification
"""

import hashlib
import json
import time
from typing import Dict, Any


class ToolProofGenerator:
    """
    Generator for tool execution proofs with hash-only privacy preservation.
    """
    
    def generate_tool_proof(
        self,
        specialist_id: str,
        tool_name: str,
        parameters: Dict[str, Any],
        result: Any
    ) -> Dict[str, Any]:
        """
        Generate tool execution proof.
        
        Args:
            specialist_id: Specialist ID
            tool_name: Tool name
            parameters: Tool parameters (not stored in proof, only hash)
            result: Tool result (not stored in proof, only hash)
            
        Returns:
            Tool proof packet
        """
        # Calculate hashes (hash-only)
        params_hash = hashlib.sha256(json.dumps(parameters, sort_keys=True).encode()).hexdigest()
        result_hash = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
        
        # Create tool proof
        tool_proof = {
            "toolProofHash": "",
            "tool": {
                "name": tool_name,
                "version": "1.0.0"
            },
            "execution": {
                "specialist_id": specialist_id,
                "parametersHash": params_hash,
                "resultHash": result_hash,
                "timestamp": time.time()
            },
            "performance": {
                "latency_ms": 0.1,
                "success": True
            }
        }
        
        # Calculate canonical hash
        proof_json = json.dumps(tool_proof, sort_keys=True)
        tool_proof["toolProofHash"] = hashlib.sha256(proof_json.encode()).hexdigest()
        
        return tool_proof
