"""
Pipeline orchestrator for micro-specialist generation
"""

import os
import json
from typing import List, Dict, Any
from .corpus_generation import (
    generate_domain_corpus,
    generate_concept_corpus,
    generate_pattern_corpus,
    get_concepts_for_domain,
    get_patterns_for_concept,
    DOMAINS
)
from .training_pipeline import train_specialist, export_bitlattice_artifact
from .validation import validate_specialist
from .benchmarking import benchmark_specialist
from .artifact_storage import store_artifact


class MicroSpecialistPipeline:
    """
    Orchestrator for micro-specialist generation pipeline.
    """
    
    def __init__(self, artifact_dir: str = "starlit-artifacts"):
        """
        Initialize pipeline.
        
        Args:
            artifact_dir: Directory for storing artifacts
        """
        self.artifact_dir = artifact_dir
        self.domain_specialists = []
        self.concept_specialists = []
        self.pattern_specialists = []
        
        # Create artifact directory structure
        os.makedirs(f"{artifact_dir}/domain", exist_ok=True)
        os.makedirs(f"{artifact_dir}/concept", exist_ok=True)
        os.makedirs(f"{artifact_dir}/pattern", exist_ok=True)
    
    def generate_domain_specialists(self, n: int = 40):
        """
        Generate domain specialists.
        
        Args:
            n: Number of specialists to generate
        """
        print(f"Generating {n} domain specialists...")
        
        for i in range(n):
            domain = DOMAINS[i % len(DOMAINS)]
            spec_def = self._create_domain_spec_def(domain, i)
            corpus = generate_domain_corpus(domain, n_samples=10000)
            
            print(f"Training {spec_def['specialist_id']}...")
            model = train_specialist(spec_def, corpus)
            artifact = export_bitlattice_artifact(model, spec_def, corpus)
            
            artifact_path = f"{self.artifact_dir}/domain/{spec_def['specialist_id']}.vnx"
            artifact.save(artifact_path)
            
            validation = validate_specialist(model, spec_def, corpus[:1000])
            benchmark = benchmark_specialist(model, spec_def, artifact_path)
            
            store_artifact(artifact, validation, benchmark, self.artifact_dir, "domain")
            self.domain_specialists.append(spec_def)
            
            if (i + 1) % 10 == 0:
                print(f"Completed {i + 1}/{n} domain specialists")
        
        print(f"Completed {n} domain specialists")
    
    def generate_concept_specialists(self, n: int = 200):
        """
        Generate concept specialists.
        
        Args:
            n: Number of specialists to generate
        """
        print(f"Generating {n} concept specialists...")
        
        count = 0
        for domain in DOMAINS:
            concepts = get_concepts_for_domain(domain)
            for concept in concepts:
                if count >= n:
                    break
                
                spec_def = self._create_concept_spec_def(concept, domain, count)
                corpus = generate_concept_corpus(concept, domain, n_samples=5000)
                
                print(f"Training {spec_def['specialist_id']}...")
                model = train_specialist(spec_def, corpus)
                artifact = export_bitlattice_artifact(model, spec_def, corpus)
                
                artifact_path = f"{self.artifact_dir}/concept/{spec_def['specialist_id']}.vnx"
                artifact.save(artifact_path)
                
                validation = validate_specialist(model, spec_def, corpus[:500])
                benchmark = benchmark_specialist(model, spec_def, artifact_path)
                
                store_artifact(artifact, validation, benchmark, self.artifact_dir, "concept")
                self.concept_specialists.append(spec_def)
                
                count += 1
                if count % 20 == 0:
                    print(f"Completed {count}/{n} concept specialists")
            
            if count >= n:
                break
        
        print(f"Completed {count} concept specialists")
    
    def generate_pattern_specialists(self, n: int = 500):
        """
        Generate pattern specialists.
        
        Args:
            n: Number of specialists to generate
        """
        print(f"Generating {n} pattern specialists...")
        
        count = 0
        for domain in DOMAINS:
            concepts = get_concepts_for_domain(domain)
            for concept in concepts:
                patterns = get_patterns_for_concept(concept)
                for pattern in patterns:
                    if count >= n:
                        break
                    
                    spec_def = self._create_pattern_spec_def(pattern, concept, domain, count)
                    corpus = generate_pattern_corpus(pattern, concept, domain, n_samples=1000)
                    
                    print(f"Training {spec_def['specialist_id']}...")
                    model = train_specialist(spec_def, corpus)
                    artifact = export_bitlattice_artifact(model, spec_def, corpus)
                    
                    artifact_path = f"{self.artifact_dir}/pattern/{spec_def['specialist_id']}.vnx"
                    artifact.save(artifact_path)
                    
                    validation = validate_specialist(model, spec_def, corpus[:100])
                    benchmark = benchmark_specialist(model, spec_def, artifact_path)
                    
                    store_artifact(artifact, validation, benchmark, self.artifact_dir, "pattern")
                    self.pattern_specialists.append(spec_def)
                    
                    count += 1
                    if count % 50 == 0:
                        print(f"Completed {count}/{n} pattern specialists")
                
                if count >= n:
                    break
            
            if count >= n:
                break
        
        print(f"Completed {count} pattern specialists")
    
    def _create_domain_spec_def(self, domain: str, index: int) -> Dict[str, Any]:
        """Create domain specialist definition."""
        return {
            "specialist_id": f"domain_{domain}_{index:03d}",
            "layer": "domain",
            "specialization": domain,
            "lattice_size": 120,
            "vocabulary_size": 128,
            "training_epochs": 100,
            "learning_rate": 0.01,
            "batch_size": 32
        }
    
    def _create_concept_spec_def(self, concept: str, domain: str, index: int) -> Dict[str, Any]:
        """Create concept specialist definition."""
        return {
            "specialist_id": f"concept_{concept}_{index:03d}",
            "layer": "concept",
            "specialization": concept,
            "parent_domain": domain,
            "lattice_size": 30,
            "vocabulary_size": 256,
            "training_epochs": 100,
            "learning_rate": 0.01,
            "batch_size": 32
        }
    
    def _create_pattern_spec_def(self, pattern: str, concept: str, domain: str, index: int) -> Dict[str, Any]:
        """Create pattern specialist definition."""
        pattern_safe = pattern.replace(" ", "_").replace("<", "lt").replace(">", "gt")
        return {
            "specialist_id": f"pattern_{pattern_safe}_{index:03d}",
            "layer": "pattern",
            "specialization": pattern,
            "parent_concept": concept,
            "parent_domain": domain,
            "lattice_size": 15,
            "vocabulary_size": 128,
            "training_epochs": 100,
            "learning_rate": 0.01,
            "batch_size": 32
        }
    
    def generate_all_specialists(self, domain_n: int = 40, concept_n: int = 200, pattern_n: int = 500):
        """
        Generate all specialists.
        
        Args:
            domain_n: Number of domain specialists
            concept_n: Number of concept specialists
            pattern_n: Number of pattern specialists
        """
        print("Starting micro-specialist generation pipeline...")
        print(f"Target: {domain_n} domain + {concept_n} concept + {pattern_n} pattern = {domain_n + concept_n + pattern_n} total")
        
        self.generate_domain_specialists(domain_n)
        self.generate_concept_specialists(concept_n)
        self.generate_pattern_specialists(pattern_n)
        
        total = len(self.domain_specialists) + len(self.concept_specialists) + len(self.pattern_specialists)
        print(f"\nPipeline complete! Generated {total} specialists:")
        print(f"  - Domain: {len(self.domain_specialists)}")
        print(f"  - Concept: {len(self.concept_specialists)}")
        print(f"  - Pattern: {len(self.pattern_specialists)}")
