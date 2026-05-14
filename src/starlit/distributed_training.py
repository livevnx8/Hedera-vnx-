"""
Distributed training framework for Starlit specialists
Supports data parallelism, model parallelism, and pipeline parallelism
Includes transfer learning and knowledge distillation
"""

import os
import torch
import torch.multiprocessing as mp
from typing import List, Dict, Any, Optional
import numpy as np
import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

# Set multiprocessing start method to 'spawn' for CUDA compatibility
if torch.cuda.is_available():
    mp.set_start_method('spawn', force=True)

from starlit.bitlattice_model import BitLatticeModel
from starlit.training_pipeline import train_specialist
from starlit.corpus_generation import generate_domain_corpus, generate_concept_corpus, generate_pattern_corpus


class KnowledgeDistiller:
    """
    Knowledge distillation for transfer learning from larger models to BitLattice specialists.
    """
    
    def __init__(
        self,
        teacher_model: Optional[Any] = None,
        temperature: float = 3.0,
        alpha: float = 0.5
    ):
        """
        Initialize knowledge distiller.
        
        Args:
            teacher_model: Teacher model (larger, pre-trained)
            temperature: Temperature for soft targets
            alpha: Weight for distillation loss
        """
        self.teacher_model = teacher_model
        self.temperature = temperature
        self.alpha = alpha
    
    def distill_loss(
        self,
        student_outputs: torch.Tensor,
        teacher_outputs: torch.Tensor,
        targets: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute distillation loss.
        
        Args:
            student_outputs: Student model outputs
            teacher_outputs: Teacher model outputs
            targets: Ground truth targets
            
        Returns:
            Combined loss (distillation + task)
        """
        # Soft targets from teacher
        soft_targets = torch.nn.functional.softmax(
            teacher_outputs / self.temperature,
            dim=-1
        )
        
        # Student soft predictions
        soft_predictions = torch.nn.functional.log_softmax(
            student_outputs / self.temperature,
            dim=-1
        )
        
        # Distillation loss (KL divergence)
        distillation_loss = kl_div(
            soft_predictions,
            soft_targets,
            reduction='batchmean'
        ) * (self.temperature ** 2)
        
        # Task loss (cross-entropy with hard targets)
        task_loss = torch.nn.functional.cross_entropy(
            student_outputs,
            targets
        )
        
        # Combined loss
        combined_loss = self.alpha * distillation_loss + (1 - self.alpha) * task_loss
        
        return combined_loss
    
    def transfer_weights(
        self,
        student_model: BitLatticeModel,
        teacher_weights: np.ndarray,
        method: str = 'downsample'
    ) -> BitLatticeModel:
        """
        Transfer weights from teacher to student.
        
        Args:
            student_model: Student model (BitLattice)
            teacher_weights: Teacher model weights
            method: Transfer method ('downsample', 'random_init', 'mean')
            
        Returns:
        Student model with transferred weights
        """
        student_lattice_size = student_model.lattice_size
        
        if method == 'downsample':
            # Downsample teacher weights to student size
            teacher_size = teacher_weights.shape[0]
            if teacher_size > student_lattice_size:
                # Average pooling to downsample
                step = teacher_size // student_lattice_size
                transferred = np.zeros((student_lattice_size, student_lattice_size))
                for i in range(student_lattice_size):
                    for j in range(student_lattice_size):
                        transferred[i, j] = np.mean(
                            teacher_weights[i*step:(i+1)*step, j*step:(j+1)*step]
                        )
                student_model.weights = transferred
            else:
                # Upsample if teacher is smaller
                transferred = np.zeros((student_lattice_size, student_lattice_size))
                for i in range(student_lattice_size):
                    for j in range(student_lattice_size):
                        ti = min(i, teacher_size - 1)
                        tj = min(j, teacher_size - 1)
                        transferred[i, j] = teacher_weights[ti, tj]
                student_model.weights = transferred
        
        elif method == 'mean':
            # Initialize with mean of teacher weights
            mean_weight = np.mean(teacher_weights)
            student_model.weights = np.ones_like(student_model.weights) * mean_weight
        
        elif method == 'random_init':
            # Random initialization (no transfer)
            pass  # Keep random initialization
        
        return student_model


class DistributedTrainer:
    """
    Distributed trainer for Starlit specialists.
    """
    
    def __init__(self, rank: int, world_size: int, backend: str = 'nccl'):
        """
        Initialize distributed trainer.
        
        Args:
            rank: Process rank
            world_size: Total number of processes
            backend: Distributed backend (nccl for GPU, gloo for CPU)
        """
        self.rank = rank
        self.world_size = world_size
        self.backend = backend
        self.device = torch.device(f'cuda:{rank}' if torch.cuda.is_available() else f'cpu:{rank}')
        
    def setup(self):
        """Initialize distributed training."""
        os.environ['MASTER_ADDR'] = 'localhost'
        os.environ['MASTER_PORT'] = '12355'
        
        dist.init_process_group(
            backend=self.backend,
            rank=self.rank,
            world_size=self.world_size
        )
        
        print(f"Rank {self.rank}/{self.world_size} initialized on {self.device}")
    
    def cleanup(self):
        """Cleanup distributed training."""
        dist.destroy_process_group()
    
    def train_specialist_distributed(
        self,
        spec_def: Dict[str, Any],
        corpus: List[Dict[str, str]],
        epochs: int = 100
    ):
        """
        Train a specialist with distributed data parallelism.
        
        Args:
            spec_def: Specialist definition
            corpus: Training corpus
            epochs: Number of training epochs
        """
        # Create model
        model = BitLatticeModel(
            lattice_size=spec_def['lattice_size'],
            vocabulary_size=spec_def['vocabulary_size']
        )
        
        # Move to device
        model = model.to(self.device)
        
        # Wrap with DDP
        model = DDP(model, device_ids=[self.rank])
        
        # Training loop
        for epoch in range(epochs):
            # Shuffle corpus
            np.random.shuffle(corpus)
            
            # Split across processes
            chunk_size = len(corpus) // self.world_size
            local_corpus = corpus[self.rank * chunk_size : (self.rank + 1) * chunk_size]
            
            # Train on local chunk
            for i in range(0, len(local_corpus), 32):
                batch = local_corpus[i:i+32]
                
                # Forward pass
                loss = 0
                for item in batch:
                    output = model.module.forward_pass(item['input'])
                    target = item['output']
                    if output != target:
                        loss += 1
                
                # Backward pass
                loss.backward()
                
                # Update weights
                with torch.no_grad():
                    for param in model.parameters():
                        param -= 0.01 * param.grad
                        # Quantize to ternary
                        param.data = torch.where(
                            param.data > 0.33,
                            torch.tensor(1.0, device=self.device),
                            torch.where(
                                param.data < -0.33,
                                torch.tensor(-1.0, device=self.device),
                                torch.tensor(0.0, device=self.device)
                            )
                        )
                
                # Zero gradients
                model.zero_grad()
            
            if self.rank == 0 and (epoch + 1) % 10 == 0:
                print(f"Epoch {epoch + 1}/{epochs}, Loss: {loss.item():.4f}")
        
        return model.module


def train_worker(spec_def):
    """Worker function for training a single specialist (must be at module level for pickling)."""
    # Generate corpus based on layer
    if spec_def['layer'] == 'domain':
        corpus = generate_domain_corpus(spec_def['specialization'], n_samples=10000)
    elif spec_def['layer'] == 'concept':
        corpus = generate_concept_corpus(
            spec_def['specialization'],
            spec_def['parent_domain'],
            n_samples=5000
        )
    else:  # pattern
        corpus = generate_pattern_corpus(
            spec_def['specialization'],
            spec_def['parent_concept'],
            spec_def['parent_domain'],
            n_samples=1000
        )
    
    # Train specialist with PyTorch for GPU acceleration
    from starlit.training_pipeline import train_specialist
    model = train_specialist(spec_def, corpus, use_pytorch=True)
    
    return spec_def['specialist_id'], model


def train_specialists_parallel(
    specialist_defs: List[Dict[str, Any]],
    num_processes: int = 4
):
    """
    Train specialists in parallel using multiprocessing.
    
    Args:
        specialist_defs: List of specialist definitions
        num_processes: Number of parallel processes
    """
    # Use multiprocessing pool
    from multiprocessing import Pool
    
    with Pool(processes=num_processes) as pool:
        results = pool.map(train_worker, specialist_defs)
    
    return dict(results)


class PipelineParallelTrainer:
    """
    Pipeline parallel trainer for curriculum learning with knowledge distillation.
    """
    
    def __init__(self, temperature: float = 3.0, alpha: float = 0.5):
        """
        Initialize pipeline parallel trainer.
        
        Args:
            temperature: Temperature for knowledge distillation
            alpha: Weight for distillation loss
        """
        self.domain_specialists = {}
        self.concept_specialists = {}
        self.pattern_specialists = {}
        self.distiller = KnowledgeDistiller(temperature=temperature, alpha=alpha)
    
    def train_domain_specialists(
        self,
        domain_specialist_defs: List[Dict[str, Any]],
        num_processes: int = 8
    ):
        """
        Train domain specialists (Phase 1 of curriculum).
        
        Args:
            domain_specialist_defs: Domain specialist definitions
            num_processes: Number of parallel processes
        """
        print("Training domain specialists...")
        results = train_specialists_parallel(domain_specialist_defs, num_processes)
        self.domain_specialists = results
        print(f"Completed {len(results)} domain specialists")
        
        return results
    
    def train_concept_specialists(
        self,
        concept_specialist_defs: List[Dict[str, Any]],
        num_processes: int = 8
    ):
        """
        Train concept specialists (Phase 2 of curriculum).
        Initialized from domain specialists via transfer learning.
        
        Args:
            concept_specialist_defs: Concept specialist definitions
            num_processes: Number of parallel processes
        """
        print("Training concept specialists with transfer learning...")
        
        def train_worker_with_transfer(spec_def):
            """Worker function with transfer learning from domain specialist."""
            # Find parent domain specialist
            parent_domain = spec_def.get('parent_domain')
            parent_specialist = self.domain_specialists.get(f"domain_{parent_domain}_000")
            
            # Generate corpus
            corpus = generate_concept_corpus(
                spec_def['specialization'],
                parent_domain,
                n_samples=5000
            )
            
            # Initialize from parent specialist if available
            if parent_specialist is not None:
                # Transfer learning: initialize weights from parent
                spec_def['transfer_from'] = parent_specialist
                print(f"Initializing {spec_def['specialist_id']} from domain specialist")
            
            # Train specialist with PyTorch for GPU acceleration
            from starlit.training_pipeline import train_specialist
            model = train_specialist(spec_def, corpus, use_pytorch=True)
            
            return spec_def['specialist_id'], model
        
        # Use multiprocessing pool
        from multiprocessing import Pool
        
        with Pool(processes=num_processes) as pool:
            results = pool.map(train_worker_with_transfer, concept_specialist_defs)
        
        self.concept_specialists = dict(results)
        print(f"Completed {len(results)} concept specialists with transfer learning")
        
        return self.concept_specialists
    
    def train_pattern_specialists(
        self,
        pattern_specialist_defs: List[Dict[str, Any]],
        num_processes: int = 8
    ):
        """
        Train pattern specialists (Phase 3 of curriculum).
        Initialized from concept specialists via transfer learning.
        
        Args:
            pattern_specialist_defs: Pattern specialist definitions
            num_processes: Number of parallel processes
        """
        print("Training pattern specialists with transfer learning...")
        
        def train_worker_with_transfer(spec_def):
            """Worker function with transfer learning from concept specialist."""
            # Find parent concept specialist
            parent_concept = spec_def.get('parent_concept')
            parent_specialist = self.concept_specialists.get(f"concept_{parent_concept}_000")
            
            # Generate corpus
            corpus = generate_pattern_corpus(
                spec_def['specialization'],
                parent_concept,
                spec_def.get('parent_domain'),
                n_samples=1000
            )
            
            # Initialize from parent specialist if available
            if parent_specialist is not None:
                # Transfer learning: initialize weights from parent
                spec_def['transfer_from'] = parent_specialist
                print(f"Initializing {spec_def['specialist_id']} from concept specialist")
            
            # Train specialist with PyTorch for GPU acceleration
            from starlit.training_pipeline import train_specialist
            model = train_specialist(spec_def, corpus, use_pytorch=True)
            
            return spec_def['specialist_id'], model
        
        # Use multiprocessing pool
        from multiprocessing import Pool
        
        with Pool(processes=num_processes) as pool:
            results = pool.map(train_worker_with_transfer, pattern_specialist_defs)
        
        self.pattern_specialists = dict(results)
        print(f"Completed {len(results)} pattern specialists with transfer learning")
        
        return self.pattern_specialists
    
    def train_curriculum(
        self,
        domain_defs: List[Dict[str, Any]],
        concept_defs: List[Dict[str, Any]],
        pattern_defs: List[Dict[str, Any]],
        num_processes: int = 8
    ):
        """
        Train all specialists using curriculum learning.
        
        Args:
            domain_defs: Domain specialist definitions
            concept_defs: Concept specialist definitions
            pattern_defs: Pattern specialist definitions
            num_processes: Number of parallel processes
        """
        # Phase 1: Domain specialists
        self.train_domain_specialists(domain_defs, num_processes)
        
        # Phase 2: Concept specialists
        self.train_concept_specialists(concept_defs, num_processes)
        
        # Phase 3: Pattern specialists
        self.train_pattern_specialists(pattern_defs, num_processes)
        
        return {
            'domain': self.domain_specialists,
            'concept': self.concept_specialists,
            'pattern': self.pattern_specialists
        }


if __name__ == "__main__":
    # Example usage
    if len(sys.argv) > 1 and sys.argv[1] == "distributed":
        # Distributed training example
        world_size = 4
        mp.spawn(
            train_worker,
            args=(world_size,),
            nprocs=world_size,
            join=True
        )
    else:
        # Parallel training example
        print("Use 'python distributed_training.py distributed' for distributed training")
