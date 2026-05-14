# Phase 3.2: Coordination Engine Implementation

## Overview

Implementation of coordination engine for Starlit swarm, including hierarchical domain layer, adaptive selection, hybrid coordination, and fallback mechanism.

## Coordination Engine Architecture

### Components

```
Input → Domain Layer (Hierarchical) → Adaptive Selection → Parallel Execution → Synthesis
```

### Layer 1: Hierarchical Domain Layer

**Purpose**: Deterministic domain classification using 40 domain specialists

**Implementation**:
```python
class HierarchicalDomainLayer:
    def __init__(self, domain_specialists):
        self.domain_specialists = domain_specialists
        self.top_k = 3  # Select top 3 domains
    
    def classify(self, input_text: str) -> List[Dict[str, Any]]:
        """
        Classify input into domains.
        
        Args:
            input_text: Input text
            
        Returns:
            List of (domain, confidence) pairs
        """
        results = []
        
        for specialist in self.domain_specialists:
            # Load specialist model
            model = load_specialist(specialist["specialist_id"])
            
            # Run inference
            output = model.forward_pass(input_text)
            confidence = model.calculate_confidence(output)
            
            results.append({
                "domain": specialist["specialization"],
                "specialist_id": specialist["specialist_id"],
                "confidence": confidence
            })
        
        # Sort by confidence and return top-k
        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[:self.top_k]
```

### Layer 2: Adaptive Selection

**Purpose**: Dynamic specialist selection based on semantic memory

**Implementation**:
```python
class AdaptiveSelector:
    def __init__(self, semantic_memory_db: str):
        self.semantic_memory_db = semantic_memory_db
        self.embedder = load_embedding_model()
    
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
            selected_domains: Selected domains from layer 1
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
            
            for specialist_id in task_data["specialists_used"]:
                # Check if specialist belongs to selected domains
                specialist = self._get_specialist(specialist_id)
                if specialist["parent_domain"] in selected_domains:
                    if specialist_id not in specialist_scores:
                        specialist_scores[specialist_id] = 0
                    specialist_scores[specialist_id] += similarity * task_data["performance"]["quality_score"]
        
        # Sort by score and return top-n
        sorted_specialists = sorted(specialist_scores.items(), key=lambda x: x[1], reverse=True)
        return [spec_id for spec_id, score in sorted_specialists[:n]]
    
    def _semantic_search(self, embedding, top_k: int = 10):
        """Search semantic memory for similar tasks."""
        # Implementation using cosine similarity search
        pass
    
    def _get_task_data(self, task_hash: str):
        """Get task data from semantic memory."""
        # Implementation
        pass
    
    def _get_specialist(self, specialist_id: str):
        """Get specialist data."""
        # Implementation
        pass
```

### Layer 3: Hybrid Coordination

**Purpose**: Combine hierarchical and adaptive coordination

**Implementation**:
```python
class HybridCoordinator:
    def __init__(self, domain_layer, adaptive_selector):
        self.domain_layer = domain_layer
        self.adaptive_selector = adaptive_selector
        self.fallback_enabled = True
        self.fallback_threshold = 0.2  # 200μs threshold for adaptive selection
    
    def coordinate(
        self,
        input_text: str,
        concept_specialists: List[Dict],
        pattern_specialists: List[Dict]
    ) -> List[str]:
        """
        Coordinate specialist selection using hybrid approach.
        
        Args:
            input_text: Input text
            concept_specialists: Available concept specialists
            pattern_specialists: Available pattern specialists
            
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
                n=500
            )
            
            selection_time = time.time() - start_time
            
            # Check if selection took too long
            if selection_time > self.fallback_threshold and self.fallback_enabled:
                print(f"Adaptive selection timeout ({selection_time}s), using fallback")
                return self._fallback_coordination(input_text, selected_domains, concept_specialists, pattern_specialists)
            
            return selected_specialists
            
        except Exception as e:
            print(f"Adaptive selection error: {e}, using fallback")
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
            if specialist["parent_domain"] in selected_domains:
                selected.append(specialist["specialist_id"])
        
        # Select all pattern specialists from selected concepts
        for specialist in pattern_specialists:
            if specialist["parent_concept"] in [s["specialization"] for s in concept_specialists if s["parent_domain"] in selected_domains]:
                selected.append(specialist["specialist_id"])
        
        return selected
```

## Implementation Plan

### Phase 3.2.1: Domain Layer

**Tasks**:
1. Implement HierarchicalDomainLayer class
2. Implement specialist loading from artifacts
3. Implement parallel domain classification
4. Implement top-k selection

**Deliverables**:
- `src/starlit/domain_layer.py`

### Phase 3.2.2: Adaptive Selection

**Tasks**:
1. Implement AdaptiveSelector class
2. Implement semantic memory integration
3. Implement embedding generation
4. Implement semantic search
5. Implement specialist scoring

**Deliverables**:
- `src/starlit/adaptive_selector.py`

### Phase 3.2.3: Hybrid Coordination

**Tasks**:
1. Implement HybridCoordinator class
2. Implement fallback mechanism
3. Implement timeout handling
4. Implement error handling

**Deliverables**:
- `src/starlit/hybrid_coordinator.py`

### Phase 3.2.4: Integration Testing

**Tasks**:
1. Test domain layer classification
2. Test adaptive selection
3. Test hybrid coordination
4. Test fallback mechanism

**Deliverables**:
- Test cases in `src/starlit/test_coordination.py`

## Success Criteria

**Latency**:
- Domain layer: <100μs
- Adaptive selection: <150μs
- Total coordination: <250μs

**Accuracy**:
- Domain classification: >90% accuracy
- Specialist selection: >85% relevance

**Reliability**:
- Fallback mechanism: 100% success rate
- Error handling: Graceful degradation

## Next Steps

1. Implement domain layer
2. Implement adaptive selection
3. Implement hybrid coordination
4. Integrate and test
5. Move to Phase 3.3: Synthesis Engine
