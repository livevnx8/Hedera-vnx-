"""
Training pipeline for Starlit specialists
"""

import numpy as np
import torch
from typing import Dict, Any, List

from starlit.bitlattice_model import BitLatticeModel
from starlit.bitlattice_model_pytorch import BitLatticeTrainerPyTorch
from .artifact_format import BitLatticeArtifact, create_header, create_metadata
from .corpus_generation import prepare_training_data, create_batches


def train_specialist(spec_def: Dict[str, Any], corpus: List[Dict[str, Any]], use_pytorch: bool = False) -> BitLatticeModel:
    """
    Train a BitLattice specialist.
    
    Args:
        spec_def: Specialist definition
        corpus: Training corpus
        use_pytorch: Use PyTorch implementation with GPU acceleration
        
    Returns:
        Trained BitLatticeModel
    """
    if use_pytorch:
        return train_specialist_pytorch(spec_def, corpus)
    else:
        return train_specialist_numpy(spec_def, corpus)


def train_specialist_pytorch(spec_def: Dict[str, Any], corpus: Dict[str, list], num_features: int = 20, num_classes: int = 10) -> BitLatticeModel:
    """
    Train a BitLattice specialist using PyTorch with GPU acceleration and multi-task learning.
    
    Args:
        spec_def: Specialist definition
        corpus: Training corpus with classification and generation datasets
        num_features: Number of input features (default 20 for advanced dataset)
        num_classes: Number of classification classes (default 10 for advanced dataset)
        
    Returns:
        Trained BitLatticeModel (converted from PyTorch)
    """
    import torch
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Training on {device}")
    
    # Create PyTorch trainer with multi-task support
    trainer = BitLatticeTrainerPyTorch(
        lattice_size=spec_def["lattice_size"],
        vocabulary_size=spec_def["vocabulary_size"],
        num_features=num_features,
        num_classes=num_classes,
        learning_rate=spec_def["learning_rate"],
        device=device,
        use_learning_retention=True,
        loss_type='label_smoothing',
        lr_scheduler_type='cosine'
    )
    
    # Transfer learning: initialize from parent specialist if available
    if "transfer_from" in spec_def and spec_def["transfer_from"] is not None:
        parent_model = spec_def["transfer_from"]
        parent_weights = parent_model.weights
        
        # Transfer weights
        student_model = trainer.model
        student_lattice_size = student_model.lattice_size
        teacher_lattice_size = parent_weights.shape[0]
        
        if teacher_lattice_size > student_lattice_size:
            step = teacher_lattice_size // student_lattice_size
            transferred = np.zeros((student_lattice_size, student_lattice_size))
            for i in range(student_lattice_size):
                for j in range(student_lattice_size):
                    transferred[i, j] = np.mean(
                        parent_weights[i*step:(i+1)*step, j*step:(j+1)*step]
                    )
            # Initialize first ternary layer with transferred weights
            student_model.ternary_layers[0].weight.data = torch.tensor(
                transferred, dtype=torch.float32, device=device
            )
            print(f"  - Transferred weights from parent (size {teacher_lattice_size} → {student_lattice_size})")
    
    # Train with multi-task learning (classification + generation)
    classification_corpus = corpus.get('classification', [])
    generation_corpus = corpus.get('generation', [])
    
    training_result = trainer.train(
        classification_corpus=classification_corpus,
        generation_corpus=generation_corpus,
        epochs=spec_def["training_epochs"],
        batch_size=spec_def["batch_size"],
        target_accuracy=0.55,
        leakage_feature_names=("transaction_type_idx",)
    )
    
    # Convert to NumPy model for compatibility
    numpy_model = BitLatticeModel(
        lattice_size=spec_def["lattice_size"],
        vocabulary_size=spec_def["vocabulary_size"]
    )
    numpy_model.weights = training_result.model.get_weights()
    
    return numpy_model


def train_specialist_numpy(spec_def: Dict[str, Any], corpus: List[Dict[str, Any]]) -> BitLatticeModel:
    """
    Train a BitLattice specialist.
    
    Args:
        spec_def: Specialist definition
        corpus: Training corpus
        
    Returns:
        Trained BitLatticeModel
    """
    # Initialize model
    model = BitLatticeModel(
        lattice_size=spec_def["lattice_size"],
        vocabulary_size=spec_def["vocabulary_size"]
    )
    
    # Transfer learning: initialize from parent specialist if available
    if "transfer_from" in spec_def and spec_def["transfer_from"] is not None:
        parent_model = spec_def["transfer_from"]
        parent_weights = parent_model.weights
        
        # Transfer weights using downsampling
        student_lattice_size = model.lattice_size
        teacher_lattice_size = parent_weights.shape[0]
        
        if teacher_lattice_size > student_lattice_size:
            # Downsample teacher weights to student size
            step = teacher_lattice_size // student_lattice_size
            transferred = np.zeros((student_lattice_size, student_lattice_size))
            for i in range(student_lattice_size):
                for j in range(student_lattice_size):
                    transferred[i, j] = np.mean(
                        parent_weights[i*step:(i+1)*step, j*step:(j+1)*step]
                    )
            model.weights = transferred
            print(f"  - Transferred weights from parent (size {teacher_lattice_size} → {student_lattice_size})")
        else:
            # Upsample if teacher is smaller
            transferred = np.zeros((student_lattice_size, student_lattice_size))
            for i in range(student_lattice_size):
                for j in range(student_lattice_size):
                    ti = min(i, teacher_lattice_size - 1)
                    tj = min(j, teacher_lattice_size - 1)
                    transferred[i, j] = parent_weights[ti, tj]
            model.weights = transferred
            print(f"  - Transferred weights from parent (size {teacher_lattice_size} → {student_lattice_size})")
    
    # Prepare training data
    inputs, outputs = prepare_training_data(corpus)
    
    # Training loop
    for epoch in range(spec_def["training_epochs"]):
        total_loss = 0
        
        for batch in create_batches(inputs, outputs, spec_def["batch_size"]):
            loss = model.train_step(batch)
            total_loss += loss
        
        avg_loss = total_loss / len(list(create_batches(inputs, outputs, spec_def["batch_size"])))
        
        if epoch % 100 == 0:
            print(f"Epoch {epoch}, Loss: {avg_loss:.4f}")
    
    return model


def export_bitlattice_artifact(model: BitLatticeModel, spec_def: Dict[str, Any], corpus: List[Dict[str, Any]]) -> BitLatticeArtifact:
    """
    Export trained model as BitLattice artifact.
    
    Args:
        model: Trained BitLatticeModel
        spec_def: Specialist definition
        corpus: Training corpus
        
    Returns:
        BitLatticeArtifact
    """
    # Generate header
    header = create_header(
        lattice_size=model.lattice_size
    )
    
    # Generate metadata
    corpus_hash = hashlib.sha256(json.dumps(corpus).encode()).hexdigest()
    
    training_config = {
        "epochs": spec_def["training_epochs"],
        "learning_rate": spec_def["learning_rate"],
        "batch_size": spec_def["batch_size"]
    }
    
    metadata = create_metadata(
        architecture=spec_def["layer"],
        specialization=spec_def["specialization"],
        specialist_id=spec_def["specialist_id"],
        lattice_size=model.lattice_size,
        vocabulary_size=model.vocabulary_size,
        corpus_hash=corpus_hash,
        training_config=training_config
    )
    
    # Pack weights
    from .bitlattice_model import pack_ternary_weights
    packed_weights = pack_ternary_weights(model.weights)
    
    # Create artifact
    artifact = BitLatticeArtifact(
        header=header,
        metadata=metadata,
        weights=packed_weights
    )
    
    return artifact
