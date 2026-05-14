#!/usr/bin/env python3
"""
Train 740 Starlit specialists using automated pipeline
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.pipeline_orchestrator import MicroSpecialistPipeline

def main():
    print("Starting Starlit specialist training pipeline...")
    print("This will train 35 specialists (5 domain + 10 concept + 20 pattern) for pipeline validation")
    print("This is a subset to validate the pipeline before full training.\n")
    
    # Initialize pipeline
    pipeline = MicroSpecialistPipeline(artifact_dir="/home/vera-live-0-1/hedera-llm-api/starlit-artifacts")
    
    # Generate subset of specialists for validation
    pipeline.generate_all_specialists(domain_n=5, concept_n=10, pattern_n=20)
    
    print("\nTraining complete!")
    print("Artifacts saved to /home/vera-live-0-1/hedera-llm-api/starlit-artifacts")

if __name__ == "__main__":
    main()
