"""
Corpus generation for micro-specialist training
"""

import json
import random
from typing import List, Dict, Any


# Domain definitions
DOMAINS = [
    "mathematics",
    "language",
    "logic",
    "reasoning",
    "creativity"
]

# Concept definitions per domain
DOMAIN_CONCEPTS = {
    "mathematics": ["addition", "subtraction", "multiplication", "division"],
    "language": ["grammar", "spelling", "vocabulary", "syntax"],
    "logic": ["deduction", "induction", "abduction", "syllogism"],
    "reasoning": ["inference", "analogy", "causality", "classification"],
    "creativity": ["metaphor", "imagery", "narrative", "innovation"]
}

# Pattern definitions per concept
CONCEPT_PATTERNS = {
    "addition": [
        "add two positive integers < 100",
        "add two negative integers",
        "add positive to negative",
        "add three integers"
    ],
    "subtraction": [
        "subtract positive from positive",
        "subtract negative from positive",
        "subtract positive from negative",
        "subtract three integers"
    ],
    "multiplication": [
        "multiply two positive integers < 10",
        "multiply by negative",
        "multiply three integers"
    ],
    "division": [
        "divide positive by positive",
        "divide by negative",
        "divide three integers"
    ]
}


def generate_domain_corpus(domain: str, n_samples: int = 10000) -> List[Dict[str, Any]]:
    """
    Generate training corpus for domain specialist.
    
    Args:
        domain: Domain name
        n_samples: Number of samples to generate
        
    Returns:
        List of training samples
    """
    corpus = []
    
    for i in range(n_samples):
        # Generate task for domain
        task = generate_domain_task(domain)
        
        sample = {
            "task": task,
            "domain": domain,
            "confidence": random.uniform(0.8, 1.0)
        }
        
        corpus.append(sample)
    
    return corpus


def generate_concept_corpus(concept: str, domain: str, n_samples: int = 5000) -> List[Dict[str, Any]]:
    """
    Generate training corpus for concept specialist.
    
    Args:
        concept: Concept name
        domain: Parent domain
        n_samples: Number of samples to generate
        
    Returns:
        List of training samples
    """
    corpus = []
    
    for i in range(n_samples):
        # Generate task for concept
        task = generate_concept_task(concept, domain)
        
        sample = {
            "task": task,
            "domain": domain,
            "concept": concept,
            "confidence": random.uniform(0.7, 1.0)
        }
        
        corpus.append(sample)
    
    return corpus


def generate_pattern_corpus(pattern: str, concept: str, domain: str, n_samples: int = 1000) -> List[Dict[str, Any]]:
    """
    Generate training corpus for pattern specialist.
    
    Args:
        pattern: Pattern description
        concept: Parent concept
        domain: Parent domain
        n_samples: Number of samples to generate
        
    Returns:
        List of training samples
    """
    corpus = []
    
    for i in range(n_samples):
        # Generate task for pattern
        task = generate_pattern_task(pattern, concept, domain)
        
        sample = {
            "task": task,
            "domain": domain,
            "concept": concept,
            "pattern": pattern,
            "confidence": random.uniform(0.6, 1.0)
        }
        
        corpus.append(sample)
    
    return corpus


def generate_domain_task(domain: str) -> str:
    """
    Generate task for domain specialist.
    
    Args:
        domain: Domain name
        
    Returns:
        Task description
    """
    if domain == "mathematics":
        return f"Solve this math problem: {random.randint(1, 100)} + {random.randint(1, 100)}"
    elif domain == "language":
        return f"Correct the grammar in this sentence"
    elif domain == "logic":
        return f"Determine if this statement is valid"
    elif domain == "reasoning":
        return f"Draw an inference from this scenario"
    elif domain == "creativity":
        return f"Create a metaphor for this concept"
    else:
        return f"Process this {domain} task"


def generate_concept_task(concept: str, domain: str) -> str:
    """
    Generate task for concept specialist.
    
    Args:
        concept: Concept name
        domain: Parent domain
        
    Returns:
        Task description
    """
    if concept == "addition":
        a = random.randint(1, 100)
        b = random.randint(1, 100)
        return f"What is {a} + {b}?"
    elif concept == "subtraction":
        a = random.randint(1, 100)
        b = random.randint(1, 100)
        return f"What is {a} - {b}?"
    elif concept == "multiplication":
        a = random.randint(1, 10)
        b = random.randint(1, 10)
        return f"What is {a} × {b}?"
    elif concept == "division":
        a = random.randint(1, 100)
        b = random.randint(1, 10)
        return f"What is {a} ÷ {b}?"
    else:
        return f"Process this {concept} task in {domain}"


def generate_pattern_task(pattern: str, concept: str, domain: str) -> str:
    """
    Generate task for pattern specialist.
    
    Args:
        pattern: Pattern description
        concept: Parent concept
        domain: Parent domain
        
    Returns:
        Task description
    """
    if "add two positive integers < 100" in pattern:
        a = random.randint(1, 99)
        b = random.randint(1, 99)
        return f"Calculate: {a} + {b}"
    elif "add two negative integers" in pattern:
        a = random.randint(-99, -1)
        b = random.randint(-99, -1)
        return f"Calculate: {a} + {b}"
    elif "add positive to negative" in pattern:
        a = random.randint(1, 99)
        b = random.randint(-99, -1)
        return f"Calculate: {a} + {b}"
    elif "multiply two positive integers < 10" in pattern:
        a = random.randint(1, 9)
        b = random.randint(1, 9)
        return f"Calculate: {a} × {b}"
    else:
        return f"Execute pattern: {pattern}"


def prepare_training_data(corpus: List[Dict[str, Any]]) -> tuple:
    """
    Prepare training data from corpus.
    
    Args:
        corpus: Training corpus
        
    Returns:
        Tuple of (inputs, outputs)
    """
    inputs = []
    outputs = []
    
    for sample in corpus:
        inputs.append(sample["task"])
        outputs.append(sample.get("answer", "processed"))
    
    return inputs, outputs


def create_batches(inputs: List, outputs: List, batch_size: int):
    """
    Create batches from training data.
    
    Args:
        inputs: Input data
        outputs: Output data
        batch_size: Batch size
        
    Yields:
        Batches of (input, output) pairs
    """
    for i in range(0, len(inputs), batch_size):
        batch_inputs = inputs[i:i+batch_size]
        batch_outputs = outputs[i:i+batch_size]
        yield {"input": batch_inputs, "output": batch_outputs}


def get_concepts_for_domain(domain: str) -> List[str]:
    """
    Get concepts for a given domain.
    
    Args:
        domain: Domain name
        
    Returns:
        List of concept names
    """
    return DOMAIN_CONCEPTS.get(domain, [])


def get_patterns_for_concept(concept: str) -> List[str]:
    """
    Get patterns for a given concept.
    
    Args:
        concept: Concept name
        
    Returns:
        List of pattern descriptions
    """
    return CONCEPT_PATTERNS.get(concept, [])
