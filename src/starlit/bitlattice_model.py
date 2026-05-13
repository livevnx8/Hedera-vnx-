"""
BitLattice Model - Ternary weight lattice model for micro-specialists
"""

import numpy as np
import hashlib
from typing import Tuple, List, Dict, Any


class BitLatticeModel:
    """
    BitLattice model with ternary weights (-1, 0, +1) and lattice routing.
    """

    def __init__(self, lattice_size: int, vocabulary_size: int):
        """
        Initialize BitLattice model.

        Args:
            lattice_size: Number of vertices in lattice
            vocabulary_size: Size of vocabulary (character-level or subword)
        """
        self.lattice_size = lattice_size
        self.vocabulary_size = vocabulary_size

        # Initialize ternary weights (-1, 0, +1)
        self.weights = self._initialize_ternary_weights(lattice_size).astype(np.float64)

        # Generate lattice topology
        self.topology = self._generate_lattice_topology(lattice_size)

        # Training state
        self.training_history = []

    def _initialize_ternary_weights(self, size: int) -> np.ndarray:
        """
        Initialize weights with random ternary values (-1, 0, +1).

        Args:
            size: Size of weight matrix

        Returns:
            Ternary weight matrix (float type for training)
        """
        return np.random.choice([-1.0, 0.0, 1.0], size=(size, size))

    def _generate_lattice_topology(self, size: int) -> 'LatticeTopology':
        """
        Generate lattice topology (dodecahedron-inspired).

        Args:
            size: Number of vertices

        Returns:
            Lattice topology object
        """
        return LatticeTopology(size)

    def forward_pass(self, input_token: str) -> str:
        """
        Forward pass through lattice routing.

        Args:
            input_token: Input token

        Returns:
            Output token
        """
        current_vertex = self.topology.input_vertex

        # Route through lattice
        for step in range(self.lattice_size):
            # Get weights for current vertex
            vertex_weights = self.weights[current_vertex]

            # Apply ternary weights to input
            activation = self._apply_weights(input_token, vertex_weights)

            # Select next vertex
            next_vertex = self._select_next_vertex(current_vertex, activation)

            if next_vertex == self.topology.output_vertex:
                break

            current_vertex = next_vertex

        return self.topology.get_output(current_vertex)

    def _apply_weights(self, input_token: str, weights: np.ndarray) -> float:
        """
        Apply ternary weights to input token.

        Args:
            input_token: Input token
            weights: Ternary weights for current vertex

        Returns:
            Activation value
        """
        # Convert token to numeric value
        token_value = self._token_to_numeric(input_token)

        # Apply ternary weights (simplified)
        activation = np.sum(weights * token_value)

        return activation

    def _token_to_numeric(self, token: str) -> float:
        """
        Convert token to numeric value.

        Args:
            token: Input token

        Returns:
            Numeric value
        """
        # Simple hash-based numeric conversion
        return float(hash(token) % 100) / 100.0

    def _select_next_vertex(self, current_vertex: int, activation: float) -> int:
        """
        Select next vertex based on activation.

        Args:
            current_vertex: Current vertex index
            activation: Activation value

        Returns:
            Next vertex index
        """
        # Get connected vertices
        connected = self.topology.get_connected_vertices(current_vertex)

        if not connected:
            return self.topology.output_vertex

        # Select based on activation (simplified)
        if activation > 0:
            # Select vertex with highest weight
            weights = self.weights[current_vertex, connected]
            return connected[np.argmax(weights)]
        elif activation < 0:
            # Select vertex with lowest weight
            weights = self.weights[current_vertex, connected]
            return connected[np.argmin(weights)]
        else:
            # Select random connected vertex
            return np.random.choice(connected)

    def train_step(self, batch: Dict[str, Any]) -> float:
        """
        Single training step.

        Args:
            batch: Training batch with inputs and outputs

        Returns:
            Loss value
        """
        # Forward pass
        predictions = [self.forward_pass(inp) for inp in batch["input"]]

        # Calculate loss (simplified cross-entropy)
        loss = self._calculate_loss(predictions, batch["output"])

        # Backward pass (simplified gradient descent)
        self._backward_pass(loss, batch)

        # Quantize weights to ternary values
        self._quantize_weights()

        # Record training history
        self.training_history.append(loss)

        return loss

    def _calculate_loss(self, predictions: List[str], targets: List[str]) -> float:
        """
        Calculate loss (simplified).

        Args:
            predictions: Predicted outputs
            targets: Target outputs

        Returns:
            Loss value
        """
        # Simple accuracy-based loss
        correct = sum(1 for p, t in zip(predictions, targets) if p == t)
        return 1.0 - (correct / len(predictions))

    def _backward_pass(self, loss: float, batch: Dict[str, Any]):
        """
        Backward pass (simplified gradient descent).

        Args:
            loss: Loss value
            batch: Training batch
        """
        # Simplified gradient update
        learning_rate = 0.01

        # Update weights based on error
        for i in range(len(batch["input"])):
            prediction = predictions = self.forward_pass(batch["input"][i])
            target = batch["output"][i]

            # Calculate error gradient
            error = 1.0 if prediction != target else -1.0

            # Update weights (simplified)
            self.weights += learning_rate * error * np.random.randn(*self.weights.shape)

    def _quantize_weights(self):
        """
        Quantize weights to ternary values (-1, 0, +1).
        """
        self.weights = np.where(self.weights > 0.33, 1.0,
                               np.where(self.weights < -0.33, -1.0, 0.0)).astype(np.float64)

    def calculate_confidence(self, output: str) -> float:
        """
        Calculate confidence score for output.

        Args:
            output: Output token

        Returns:
            Confidence score (0-1)
        """
        # Simplified confidence based on weight strength
        avg_weight = np.mean(np.abs(self.weights))
        return min(1.0, avg_weight)

    def get_model_hash(self) -> str:
        """
        Get hash of model weights.

        Returns:
            SHA-256 hash
        """
        weights_bytes = self.weights.tobytes()
        return hashlib.sha256(weights_bytes).hexdigest()


class LatticeTopology:
    """
    Lattice topology structure for BitLattice models.
    """

    def __init__(self, size: int):
        """
        Initialize lattice topology.

        Args:
            size: Number of vertices
        """
        self.size = size
        self.input_vertex = 0
        self.output_vertex = size - 1

        # Generate connections (dodecahedron-inspired)
        self.connections = self._generate_connections()

        # Output mapping
        self.outputs = self._generate_outputs()

    def _generate_connections(self) -> Dict[int, List[int]]:
        """
        Generate vertex connections.

        Returns:
            Dictionary mapping vertex to connected vertices
        """
        connections = {}

        # Generate ring connections
        for i in range(self.size):
            connections[i] = [
                (i - 1) % self.size,
                (i + 1) % self.size
            ]

            # Add cross connections for dodecahedron structure
            if self.size > 10:
                connections[i].append((i + self.size // 2) % self.size)

        return connections

    def _generate_outputs(self) -> Dict[int, str]:
        """
        Generate output mapping for vertices.

        Returns:
            Dictionary mapping vertex to output token
        """
        outputs = {}

        # Simple output mapping
        for i in range(self.size):
            outputs[i] = str(i % 10)  # Single digit outputs

        return outputs

    def get_connected_vertices(self, vertex: int) -> List[int]:
        """
        Get connected vertices for given vertex.

        Args:
            vertex: Vertex index

        Returns:
            List of connected vertex indices
        """
        return self.connections.get(vertex, [])

    def get_output(self, vertex: int) -> str:
        """
        Get output for given vertex.

        Args:
            vertex: Vertex index

        Returns:
            Output token
        """
        return self.outputs.get(vertex, "")


def pack_ternary_weights(weights: np.ndarray) -> bytes:
    """
    Pack ternary weights into bytes (5 weights per byte).

    Args:
        weights: Ternary weight matrix

    Returns:
        Packed bytes
    """
    packed = bytearray()

    # Flatten weights
    flat_weights = weights.flatten()

    # Pack 4 weights per byte (8 bits total: 4 weights × 2 bits each)
    for i in range(0, len(flat_weights), 4):
        chunk = flat_weights[i:i+4]
        packed_byte = 0

        for j, weight in enumerate(chunk):
            # Encode: -1 → 00, 0 → 01, +1 → 10
            if weight == -1:
                encoded = 0b00
            elif weight == 0:
                encoded = 0b01
            else:  # weight == +1
                encoded = 0b10

            packed_byte |= encoded << (j * 2)

        packed.append(packed_byte)

    return bytes(packed)


def unpack_ternary_weights(packed: bytes, size: int) -> np.ndarray:
    """
    Unpack ternary weights from bytes.

    Args:
        packed: Packed bytes
        size: Size of weight matrix

    Returns:
        Ternary weight matrix
    """
    flat_weights = []

    for byte in packed:
        # Unpack 4 weights per byte
        for j in range(4):
            encoded = (byte >> (j * 2)) & 0b11

            # Decode: 00 → -1, 01 → 0, 10 → +1
            if encoded == 0b00:
                weight = -1
            elif encoded == 0b01:
                weight = 0
            else:  # encoded == 0b10
                weight = 1

            flat_weights.append(weight)

    # Reshape to original size
    return np.array(flat_weights[:size*size]).reshape((size, size))
