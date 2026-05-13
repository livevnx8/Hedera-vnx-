"""
BitLattice Artifact Format (.vnx) for micro-specialists
"""

import struct
import json
import hashlib
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class BitLatticeArtifact:
    """
    BitLattice artifact (.vnx format) for micro-specialists.
    """
    header: bytes
    metadata: Dict[str, Any]
    weights: bytes

    def save(self, filepath: str):
        """
        Save artifact to file.

        Args:
            filepath: Output file path
        """
        with open(filepath, 'wb') as f:
            # Write header (16 bytes)
            f.write(self.header)

            # Write metadata length (4 bytes)
            metadata_json = json.dumps(self.metadata).encode('utf-8')
            f.write(struct.pack('<I', len(metadata_json)))

            # Write metadata
            f.write(metadata_json)

            # Write weights
            f.write(self.weights)

    @classmethod
    def load(cls, filepath: str) -> 'BitLatticeArtifact':
        """
        Load artifact from file.

        Args:
            filepath: Input file path

        Returns:
            BitLatticeArtifact instance
        """
        with open(filepath, 'rb') as f:
            # Read header (16 bytes)
            header = f.read(16)

            # Read metadata length (4 bytes)
            metadata_len = struct.unpack('<I', f.read(4))[0]

            # Read metadata
            metadata_json = f.read(metadata_len).decode('utf-8')
            metadata = json.loads(metadata_json)

            # Read weights
            weights = f.read()

        return cls(header, metadata, weights)

    def get_proof_hash(self) -> str:
        """
        Get canonical hash of entire artifact.

        Returns:
            SHA-256 hash
        """
        artifact_bytes = self.header + json.dumps(self.metadata).encode('utf-8') + self.weights
        return hashlib.sha256(artifact_bytes).hexdigest()

    def get_model_hash(self) -> str:
        """
        Get hash of model weights.

        Returns:
            SHA-256 hash
        """
        return hashlib.sha256(self.weights).hexdigest()

    def get_size(self) -> int:
        """
        Get total artifact size in bytes.

        Returns:
            Size in bytes
        """
        return len(self.header) + len(json.dumps(self.metadata).encode('utf-8')) + len(self.weights)


def create_header(magic: int = 0x564E5801, version: int = 0x0001, lattice_size: int = 0) -> bytes:
    """
    Create BitLattice artifact header.

    Args:
        magic: Magic number (default: 0x564E5801 for VNX)
        version: Version number (default: 0x0001)
        lattice_size: Number of vertices in lattice

    Returns:
        16-byte header
    """
    header = struct.pack('<IHH8x', magic, version, lattice_size)
    return header


def create_metadata(
    architecture: str,
    specialization: str,
    specialist_id: str,
    lattice_size: int,
    vocabulary_size: int,
    corpus_hash: str,
    training_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create metadata for BitLattice artifact.

    Args:
        architecture: Architecture type (domain/concept/pattern)
        specialization: Specialization description
        specialist_id: Unique specialist identifier
        lattice_size: Number of vertices in lattice
        vocabulary_size: Size of vocabulary
        corpus_hash: SHA-256 hash of training corpus
        training_config: Training configuration dictionary

    Returns:
        Metadata dictionary
    """
    metadata = {
        "architecture": architecture,
        "specialization": specialization,
        "specialist_id": specialist_id,
        "lattice_topology": {
            "vertex_count": lattice_size,
            "edge_count": lattice_size * 3,  # Approximate for dodecahedron
            "topology_type": "dodecahedron-inspired"
        },
        "vocabulary": {
            "type": "character-level",
            "size": vocabulary_size
        },
        "corpus_hash": corpus_hash
    }

    if training_config:
        metadata["training_config"] = training_config

    return metadata


def validate_artifact(artifact: BitLatticeArtifact) -> bool:
    """
    Validate BitLattice artifact.

    Args:
        artifact: BitLatticeArtifact instance

    Returns:
        True if valid, False otherwise
    """
    # Check header magic number
    magic = struct.unpack('<I', artifact.header[:4])[0]
    if magic != 0x564E5801:
        return False

    # Check metadata structure
    required_fields = ["architecture", "specialization", "specialist_id", "lattice_topology", "vocabulary", "corpus_hash"]
    for field in required_fields:
        if field not in artifact.metadata:
            return False

    # Check architecture type
    if artifact.metadata["architecture"] not in ["domain", "concept", "pattern"]:
        return False

    # Check lattice size matches metadata
    lattice_size = struct.unpack('<IHH8x', artifact.header)[2]
    if lattice_size != artifact.metadata["lattice_topology"]["vertex_count"]:
        return False

    return True
