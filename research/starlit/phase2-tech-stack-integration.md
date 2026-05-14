# Phase 2.3: Tech Stack Integration Design

## Overview

Detailed integration design for Starlit's tech stack: BitLattice (ternary weights, lattice topology), ONNX quantization (deployment optimization), semantic memory (swarm coordination), and MCP (tool interface).

## BitLattice Integration

### Micro-Specialist Models as BitLattice Artifacts

**Artifact Format (.vnx)**:

**Header** (16 bytes):
```c
struct BitLatticeHeader {
    uint32_t magic;        // 0x564E5801 (VNX magic number)
    uint16_t version;      // 0x0001 (version 1)
    uint16_t lattice_size; // Number of vertices
    uint8_t  reserved[8];  // Future use
}
```

**Metadata JSON** (variable):
```json
{
  "architecture": "domain|concept|pattern",
  "specialization": "mathematics|addition|add_two_positive_integers_lt100",
  "specialist_id": "domain_math_001|concept_add_001|pattern_add_pos_pos_lt100_001",
  "lattice_topology": {
    "vertex_count": 120|30|15,
    "edge_count": 360|90|45,
    "topology_type": "dodecahedron-inspired"
  },
  "vocabulary": {
    "type": "character-level|subword",
    "size": 128|256
  },
  "corpus_hash": "SHA-256 of training data",
  "training_config": {
    "epochs": 1000,
    "learning_rate": 0.01,
    "batch_size": 32
  }
}
```

**Packed Ternary Weights** (variable):
- 5 weights per byte (3^5 = 243 combinations)
- Encoding: -1 → 00, 0 → 01, +1 → 10
- Storage: N_weights / 5 bytes

**Lattice Topology by Layer**:

**Domain Specialists** (120 vertices):
```
- Complex classification task
- High connectivity (3 edges per vertex)
- 360 edges total
- Weight matrix: 360 ternary weights
- Packed size: 360 / 5 = 72 bytes
```

**Concept Specialists** (30 vertices):
```
- Narrow classification task
- Medium connectivity (3 edges per vertex)
- 90 edges total
- Weight matrix: 90 ternary weights
- Packed size: 90 / 5 = 18 bytes
```

**Pattern Specialists** (15 vertices):
```
- Simple computation task
- High connectivity (3 edges per vertex)
- 45 edges total
- Weight matrix: 45 ternary weights
- Packed size: 45 / 5 = 9 bytes
```

### Lattice Routing System

**Routing Algorithm**:
```
function lattice_routing(input_token, lattice):
    current_vertex = lattice.input_vertex
    
    while current_vertex != lattice.output_vertex:
        # Get ternary weight for edge
        weight = lattice.get_weight(current_vertex, next_vertex)
        
        # Apply weight to input
        if weight == -1:
            activation = -input_token
        elif weight == 0:
            activation = 0
        else:  # weight == +1
            activation = input_token
        
        # Select next vertex based on activation
        next_vertex = lattice.select_next_vertex(current_vertex, activation)
        
        # Move to next vertex
        current_vertex = next_vertex
    
    return current_vertex.output
```

**Optimizations**:
- Pre-computed routing paths for common inputs
- Caching of intermediate activations
- SIMD operations for parallel edge traversal
- Hardware acceleration (GPU/NPU support)

### BitLattice Proof Packet Integration

**Per-Specialist Proof Packet**:
```json
{
  "proofHash": "SHA-256 of entire packet",
  "model": {
    "hash": "SHA-256 of .vnx artifact",
    "latticeHash": "SHA-256 of lattice structure",
    "weightHash": "SHA-256 of packed weights"
  },
  "inference": {
    "promptHash": "SHA-256 of input (without raw prompt)",
    "outputHash": "SHA-256 of output (without raw output)",
    "traceHash": "SHA-256 of normalized token trace",
    "vertexTrace": ["v01→v05→v10→...", "v02→v07→v12→..."]
  },
  "performance": {
    "latency_ms": 0.5,
    "energy_mJ": 0.01,
    "confidence": 0.95
  },
  "metadata": {
    "specialist_id": "pattern_add_pos_pos_lt100_001",
    "timestamp": "ISO-8601"
  }
}
```

**Privacy Preservation**:
- Raw prompts and outputs stored only in local exports
- HCS publishes only hash-only summaries
- Vertex traces normalized (hash of path, not actual tokens)

## ONNX Quantization Integration

### Quantization Strategy by Layer

**Domain Specialists** (8-bit quantization):
```python
# Quantization configuration
domain_quantization_config = {
    "mode": "static",  # Calibrate once, use for all inferences
    "dtype": "uint8",  # 8-bit unsigned
    "scheme": "symmetric",  # Symmetric range around zero
    "calibration": "min-max",  # Min-max calibration
    "per_channel": False  # Per-tensor quantization
}

# Expected accuracy: 95-98% of FP16
# Size reduction: 2x (16-bit → 8-bit)
# Speed improvement: 1.5-2x (integer arithmetic)
```

**Concept Specialists** (4-bit quantization):
```python
# Quantization configuration
concept_quantization_config = {
    "mode": "dynamic",  # Calibrate per inference
    "dtype": "uint4",  # 4-bit unsigned
    "scheme": "asymmetric",  # Asymmetric range
    "calibration": "percentile",  # 99th percentile calibration
    "per_channel": True  # Per-channel quantization
}

# Expected accuracy: 90-95% of FP16
# Size reduction: 4x (16-bit → 4-bit)
# Speed improvement: 2-3x (integer arithmetic)
```

**Pattern Specialists** (2-bit quantization):
```python
# Quantization configuration
pattern_quantization_config = {
    "mode": "ternary",  # BitLattice ternary weights
    "dtype": "int2",  # 2-bit signed (-1, 0, +1)
    "scheme": "ternary",  -1, 0, +1 mapping
    "calibration": "ternary",  # Ternary calibration
    "per_channel": False  # Per-tensor quantization
}

# Expected accuracy: 85-90% of FP16
# Size reduction: 8x (16-bit → 2-bit)
# Speed improvement: 3-4x (integer arithmetic)
```

### ONNX Runtime Integration

**Model Loading**:
```python
import onnxruntime as ort

# Create ONNX Runtime session with quantization
session_options = ort.SessionOptions()
session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

# Load quantized model
session = ort.InferenceSession(
    "specialist.onnx",
    sess_options=session_options,
    providers=["CPUExecutionProvider", "CUDAExecutionProvider"]
)

# Auto-select provider based on availability
if "CUDAExecutionProvider" in session.get_providers():
    provider = "CUDAExecutionProvider"
else:
    provider = "CPUExecutionProvider"
```

**Inference with Quantization**:
```python
# Run inference
inputs = {
    "input": input_tensor,
    "lattice_weights": quantized_weights_tensor
}

outputs = session.run(
    None,  # Run all outputs
    inputs
)

# Output is quantized, dequantize if needed
output = dequantize(outputs[0], quantization_config)
```

**Auto-Tuning**:
```python
# ONNX Runtime auto-tuning
session_options.enable_profiling = True
session_options.enable_mem_pattern = True

# Run inference to collect profiling data
for _ in range(100):
    session.run(None, inputs)

# ONNX Runtime automatically optimizes based on profiling
```

### Hardware Acceleration

**CPU Optimization**:
- SIMD instructions (AVX-512, ARM NEON)
- Multi-threading for parallel specialist execution
- Cache-friendly memory layout

**GPU Optimization**:
- CUDA kernels for lattice routing
- Tensor cores for parallel edge traversal
- Shared memory for weight caching

**NPU Optimization**:
- Ternary operation acceleration
- Lattice routing hardware support
- Energy-efficient inference

## Semantic Memory Integration

### Memory Schema

**SQLite Database Schema**:
```sql
CREATE TABLE swarm_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_hash TEXT NOT NULL UNIQUE,
    task_type TEXT NOT NULL,
    specialists_used TEXT NOT NULL,  -- JSON array
    output_hash TEXT NOT NULL,
    performance_metrics TEXT NOT NULL,  -- JSON object
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_hash (task_hash),
    INDEX idx_task_type (task_type),
    INDEX idx_timestamp (timestamp)
);

CREATE TABLE specialist_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    specialist_id TEXT NOT NULL,
    task_hash TEXT NOT NULL,
    latency_ms REAL NOT NULL,
    quality_score REAL NOT NULL,
    confidence REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_hash) REFERENCES swarm_memory(task_hash),
    INDEX idx_specialist_id (specialist_id),
    INDEX idx_task_hash (task_hash)
);
```

### Semantic Search

**Cosine Similarity Search**:
```python
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer

# Load embedding model
embedder = SentenceTransformer('all-MiniLM-L6-v2')

# Generate embedding for task
task_embedding = embedder.encode(task_text)

# Store embedding
def store_task_embedding(task_hash, task_text, embedding):
    conn = sqlite3.connect('swarm_memory.db')
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO task_embeddings (task_hash, task_text, embedding) VALUES (?, ?, ?)",
        (task_hash, task_text, embedding.tobytes())
    )
    
    conn.commit()
    conn.close()

# Semantic search for similar tasks
def semantic_search(query_embedding, top_k=10):
    conn = sqlite3.connect('swarm_memory.db')
    cursor = conn.cursor()
    
    # Get all embeddings
    cursor.execute("SELECT task_hash, embedding FROM task_embeddings")
    results = cursor.fetchall()
    
    # Compute cosine similarity
    similarities = []
    for task_hash, embedding_bytes in results:
        embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
        similarity = np.dot(query_embedding, embedding) / (np.linalg.norm(query_embedding) * np.linalg.norm(embedding))
        similarities.append((task_hash, similarity))
    
    # Sort by similarity
    similarities.sort(key=lambda x: x[1], reverse=True)
    
    conn.close()
    return similarities[:top_k]
```

### Adaptive Specialist Selection

**Selection Algorithm**:
```python
def adaptive_specialist_selection(task, semantic_memory):
    # Generate task embedding
    task_embedding = embedder.encode(task)
    
    # Search for similar tasks
    similar_tasks = semantic_search(task_embedding, top_k=50)
    
    # Get specialists used for similar tasks
    specialist_scores = {}
    for task_hash, similarity in similar_tasks:
        task_data = get_task_data(task_hash)
        for specialist_id in task_data['specialists_used']:
            if specialist_id not in specialist_scores:
                specialist_scores[specialist_id] = 0
            specialist_scores[specialist_id] += similarity * task_data['performance']['quality_score']
    
    # Sort by score
    sorted_specialists = sorted(specialist_scores.items(), key=lambda x: x[1], reverse=True)
    
    # Select top N specialists
    N = min(500, len(sorted_specialists))
    selected_specialists = [spec_id for spec_id, score in sorted_specialists[:N]]
    
    return selected_specialists
```

### Learning from Performance

**Performance Tracking**:
```python
def track_specialist_performance(specialist_id, task_hash, latency_ms, quality_score, confidence):
    conn = sqlite3.connect('swarm_memory.db')
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO specialist_performance (specialist_id, task_hash, latency_ms, quality_score, confidence) VALUES (?, ?, ?, ?, ?)",
        (specialist_id, task_hash, latency_ms, quality_score, confidence)
    )
    
    conn.commit()
    conn.close()

# Get specialist performance metrics
def get_specialist_metrics(specialist_id):
    conn = sqlite3.connect('swarm_memory.db')
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT AVG(latency_ms), AVG(quality_score), AVG(confidence), COUNT(*) FROM specialist_performance WHERE specialist_id = ?",
        (specialist_id,)
    )
    
    avg_latency, avg_quality, avg_confidence, count = cursor.fetchone()
    
    conn.close()
    
    return {
        "avg_latency_ms": avg_latency,
        "avg_quality_score": avg_quality,
        "avg_confidence": avg_confidence,
        "task_count": count
    }
```

## MCP Integration

### Tool Interface Standardization

**MCP Server for Starlit**:
```python
from mcp import MCPServer, Tool

# Create MCP server
server = MCPServer("starlit-swarm")

# Define tool schema
calculator_tool = Tool(
    name="calculator",
    description="Perform arithmetic calculations",
    parameters={
        "operation": {"type": "string", "enum": ["add", "subtract", "multiply", "divide"]},
        "operands": {"type": "array", "items": {"type": "number"}}
    }
)

# Register tool
server.register_tool(calculator_tool)
```

### Tool Specialization

**Pattern Specialist for Specific Tools**:
```python
# Pattern specialist for calculator addition
class CalculatorAddPatternSpecialist:
    def __init__(self):
        self.tool = "calculator"
        self.operation = "add"
        self.bitlattice_model = load_bitlattice_model("pattern_calculator_add")
    
    def execute(self, operands):
        # Use MCP to call tool
        result = server.call_tool("calculator", {
            "operation": "add",
            "operands": operands
        })
        
        return result

# Register specialized pattern specialists
specialists = [
    CalculatorAddPatternSpecialist(),
    CalculatorSubtractPatternSpecialist(),
    CalculatorMultiplyPatternSpecialist(),
    CalculatorDividePatternSpecialist(),
    # ... more tool specialists
]
```

### Tool Coordination

**Conflict Resolution**:
```python
class ToolCoordinator:
    def __init__(self):
        self.tool_locks = {}  # Tool → lock status
        self.tool_queues = {}  # Tool → queue of pending requests
    
    def request_tool(self, specialist_id, tool_name, parameters):
        # Check if tool is locked
        if tool_name in self.tool_locks and self.tool_locks[tool_name]:
            # Add to queue
            if tool_name not in self.tool_queues:
                self.tool_queues[tool_name] = []
            self.tool_queues[tool_name].append((specialist_id, parameters))
            return None
        else:
            # Lock tool
            self.tool_locks[tool_name] = True
            # Execute tool
            result = server.call_tool(tool_name, parameters)
            # Release lock
            self.tool_locks[tool_name] = False
            # Process queue
            self.process_queue(tool_name)
            return result
    
    def process_queue(self, tool_name):
        if tool_name in self.tool_queues and self.tool_queues[tool_name]:
            specialist_id, parameters = self.tool_queues[tool_name].pop(0)
            # Execute next request
            self.request_tool(specialist_id, tool_name, parameters)
```

### Tool Execution Proofs

**Tool Proof Packet**:
```json
{
  "toolProofHash": "SHA-256 of tool proof packet",
  "tool": {
    "name": "calculator",
    "version": "1.0.0",
    "hash": "SHA-256 of tool code"
  },
  "execution": {
    "specialist_id": "pattern_calculator_add_001",
    "parameters_hash": "SHA-256 of parameters (without raw values)",
    "result_hash": "SHA-256 of result (without raw value)",
    "timestamp": "ISO-8601"
  },
  "performance": {
    "latency_ms": 0.1,
    "success": true
  }
}
```

## Integration Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Starlit Swarm System                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Input Processing Layer                        │
│  - Task embedding generation (sentence-transformers)             │
│  - Semantic memory search (cosine similarity)                    │
│  - Context analysis                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Hybrid Coordination Layer                      │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ Hierarchical     │    │ Adaptive         │                   │
│  │ Domain Layer     │    │ Selection        │                   │
│  │ (50 specialists) │    │ (Semantic Memory) │                   │
│  └──────────────────┘    └──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Parallel Execution Layer                      │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ BitLattice       │    │ ONNX Runtime     │                   │
│  │ Lattice Artifacts │    │ Quantization     │                   │
│  │ (.vnx files)     │    │ (8/4/2-bit)      │                   │
│  └──────────────────┘    └──────────────────┘                   │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ Lattice Routing  │    │ Hardware Accel.  │                   │
│  │ (Integer Arith.) │    │ (CPU/GPU/NPU)    │                   │
│  └──────────────────┘    └──────────────────┘                   │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ MCP Tool         │    │ Tool Coord.      │                   │
│  │ Interface        │    │ (Locking/Queue)  │                   │
│  └──────────────────┘    └──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Output Synthesis Layer                         │
│  - Quality scoring                                               │
│  - Conflict resolution                                           │
│  - Hierarchical synthesis                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Verifiability Layer                            │
│  - BitLattice proof packets (hash-only)                          │
│  - Tool execution proofs                                          │
│  - Swarm proof aggregation                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Output + Proofs                                │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**1. Input Processing**:
```
Input Text → Sentence Transformer → Task Embedding
Task Embedding → Semantic Memory Search → Similar Tasks
Similar Tasks → Context Analysis → Specialist Selection Strategy
```

**2. Coordination**:
```
Input → Hierarchical Domain Layer (50 BitLattice specialists)
Domain Output → Adaptive Selection (Semantic Memory)
Selected Specialists → Parallel Execution
```

**3. Execution**:
```
Specialist → Load .vnx Artifact → ONNX Runtime → Quantized Inference
Specialist → Lattice Routing → Integer Arithmetic → Output
Specialist → MCP Tool Call → Tool Execution → Tool Proof
```

**4. Synthesis**:
```
Specialist Outputs → Quality Scoring → Conflict Resolution
Quality Scores → Hierarchical Synthesis → Final Output
```

**5. Verifiability**:
```
Specialist Execution → BitLattice Proof Packet → Hash-Only Storage
Tool Execution → Tool Proof Packet → Hash-Only Storage
Specialist Proofs → Swarm Proof Aggregation → Final Swarm Proof
```

## Performance Optimization

### Caching Strategy

**Multi-Layer Caching**:
- L1 Cache: In-memory cache for recent specialist outputs (sub-millisecond)
- L2 Cache: Persistent cache for specialist models (15ms)
- L3 Cache: Semantic memory for task patterns (50ms)

**Cache Keys**:
```
L1: specialist_id + input_hash
L2: specialist_id + model_hash
L3: task_embedding_hash
```

### Parallel Execution

**Specialist Parallelization**:
- All selected specialists execute in parallel
- Thread pool management (N = number of CPU cores)
- GPU batch processing for lattice routing
- NPU acceleration for ternary operations

**Pipeline Parallelization**:
```
Domain Layer (parallel) → Adaptive Selection (sequential) → 
Execution (parallel) → Synthesis (sequential)
```

### Memory Management

**Memory Pool**:
- Pre-allocate memory for specialist models
- Reuse memory buffers for lattice routing
- Zero-copy operations where possible

**Garbage Collection**:
- Explicit memory management for real-time constraints
- Pool-based allocation to avoid fragmentation

## Integration Testing Strategy

### Unit Tests

**BitLattice Integration**:
- Test .vnx artifact loading
- Test lattice routing correctness
- Test proof packet generation

**ONNX Integration**:
- Test quantization accuracy
- Test ONNX Runtime inference
- Test auto-tuning

**Semantic Memory Integration**:
- Test embedding generation
- Test semantic search
- Test adaptive selection

**MCP Integration**:
- Test tool registration
- Test tool execution
- Test tool coordination

### Integration Tests

**End-to-End Flow**:
- Test input → output with proofs
- Test hybrid coordination
- Test verifiability

**Performance Tests**:
- Test latency (<1ms target)
- Test memory (<500KB target)
- Test energy (<10mJ target)

## Next Steps

1. Complete Phase 2 Summary: Theoretical Architecture Document
2. Begin Phase 3: Prototype Implementation
3. Develop micro-specialist generation pipeline
4. Implement coordination engine
