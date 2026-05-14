"""
Adaptive selector for semantic memory-based specialist selection
"""

import time
import sqlite3
import numpy as np
from typing import List, Dict, Any
from sentence_transformers import SentenceTransformer


class AdaptiveSelector:
    """
    Adaptive selector for dynamic specialist selection based on semantic memory.
    """
    
    def __init__(self, semantic_memory_db: str, embedding_model: str = "all-MiniLM-L6-v2"):
        """
        Initialize adaptive selector.
        
        Args:
            semantic_memory_db: Path to semantic memory database
            embedding_model: Name of sentence transformer model
        """
        self.semantic_memory_db = semantic_memory_db
        self.embedder = SentenceTransformer(embedding_model)
    
    def select_specialists(
        self,
        input_text: str,
        selected_domains: List[str],
        concept_specialists: List[Dict],
        pattern_specialists: List[Dict],
        n: int = 500
    ) -> List[str]:
        """
        Select specialists based on semantic similarity.
        
        Args:
            input_text: Input text
            selected_domains: Selected domains from domain layer
            concept_specialists: Available concept specialists
            pattern_specialists: Available pattern specialists
            n: Number of specialists to select
            
        Returns:
            List of selected specialist IDs
        """
        # Generate input embedding
        input_embedding = self.embedder.encode(input_text)
        
        # Search semantic memory for similar tasks
        similar_tasks = self._semantic_search(input_embedding, top_k=50)
        
        # Score specialists based on similarity
        specialist_scores = {}
        
        for task_hash, similarity in similar_tasks:
            task_data = self._get_task_data(task_hash)
            
            if task_data is None:
                continue
            
            for specialist_id in task_data["specialists_used"]:
                # Check if specialist belongs to selected domains
                specialist = self._get_specialist(specialist_id, concept_specialists, pattern_specialists)
                
                if specialist and specialist.get("parent_domain") in selected_domains:
                    if specialist_id not in specialist_scores:
                        specialist_scores[specialist_id] = 0
                    specialist_scores[specialist_id] += similarity * task_data["performance"]["quality_score"]
        
        # Sort by score and return top-n
        sorted_specialists = sorted(specialist_scores.items(), key=lambda x: x[1], reverse=True)
        return [spec_id for spec_id, score in sorted_specialists[:n]]
    
    def _semantic_search(self, embedding: np.ndarray, top_k: int = 10) -> List[tuple]:
        """
        Search semantic memory for similar tasks.
        
        Args:
            embedding: Input embedding
            top_k: Number of similar tasks to return
            
        Returns:
            List of (task_hash, similarity) tuples
        """
        conn = sqlite3.connect(self.semantic_memory_db)
        cursor = conn.cursor()
        
        # Get all embeddings
        cursor.execute("SELECT task_hash, embedding FROM task_embeddings")
        results = cursor.fetchall()
        
        # Compute cosine similarity
        similarities = []
        for task_hash, embedding_bytes in results:
            if embedding_bytes is None:
                continue
            stored_embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
            similarity = np.dot(embedding, stored_embedding) / (np.linalg.norm(embedding) * np.linalg.norm(stored_embedding))
            similarities.append((task_hash, similarity))
        
        # Sort by similarity
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        conn.close()
        return similarities[:top_k]
    
    def _get_task_data(self, task_hash: str) -> Dict[str, Any]:
        """
        Get task data from semantic memory.
        
        Args:
            task_hash: Task hash
            
        Returns:
            Task data dictionary
        """
        conn = sqlite3.connect(self.semantic_memory_db)
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT specialists_used, performance_metrics FROM swarm_memory WHERE task_hash = ?",
            (task_hash,)
        )
        
        result = cursor.fetchone()
        conn.close()
        
        if result is None:
            return None
        
        return {
            "specialists_used": result[0].split(",") if isinstance(result[0], str) else result[0],
            "performance": result[1]
        }
    
    def _get_specialist(
        self,
        specialist_id: str,
        concept_specialists: List[Dict],
        pattern_specialists: List[Dict]
    ) -> Dict[str, Any]:
        """
        Get specialist data.
        
        Args:
            specialist_id: Specialist ID
            concept_specialists: Available concept specialists
            pattern_specialists: Available pattern specialists
            
        Returns:
            Specialist data dictionary
        """
        # Search in concept specialists
        for specialist in concept_specialists:
            if specialist["specialist_id"] == specialist_id:
                return specialist
        
        # Search in pattern specialists
        for specialist in pattern_specialists:
            if specialist["specialist_id"] == specialist_id:
                return specialist
        
        return None
