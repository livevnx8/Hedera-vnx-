#!/bin/bash

# Vera Reasoning Enhancement Fine-Tuning Script
# Trains Vera on the new reasoning capabilities

set -e

echo "🧠 Starting Vera Reasoning Enhancement Fine-Tuning..."
echo "=========================================="

# Check if required files exist
if [ ! -f "./fine-tuning/vera-enhanced-dataset.jsonl" ]; then
    echo "❌ Training dataset not found. Generating first..."
    node --import tsx/esm scripts/generate-reasoning-dataset.ts
fi

if [ ! -f "./models/vera-model.gguf" ]; then
    echo "❌ Base model not found at ./models/vera-model.gguf"
    echo "Please ensure the base Vera model is available before fine-tuning"
    exit 1
fi

# Create fine-tuning directory structure
mkdir -p ./fine-tuning/checkpoints
mkdir -p ./fine-tuning/logs
mkdir -p ./models

echo "📋 Configuration:"
echo "- Base Model: ./models/vera-model.gguf"
echo "- Training Data: ./fine-tuning/vera-enhanced-dataset.jsonl"
echo "- Output Model: ./models/vera-reasoning-enhanced.gguf"
echo "- Context Length: 4096 tokens"
echo "- Training Steps: 1000"
echo ""

# Check GPU availability
echo "🔍 Checking GPU availability..."
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits
    GPU_AVAILABLE=true
else
    echo "⚠️  No NVIDIA GPU detected, will use CPU training (slower)"
    GPU_AVAILABLE=false
fi

# Set environment variables
export CUDA_VISIBLE_DEVICES=0
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
export FINE_TUNING_CONFIG="./fine-tuning/config-enhanced.json"

# Memory and performance settings
if [ "$GPU_AVAILABLE" = true ]; then
    export GPU_LAYERS=-1  # Use all available GPU layers
    export THREADS=8
    echo "🚀 Using GPU acceleration"
else
    export GPU_LAYERS=0   # CPU only
    export THREADS=4
    echo "🐌 Using CPU training"
fi

echo ""
echo "🎯 Training Focus Areas:"
echo "- Deductive Reasoning: Logical step-by-step analysis"
echo "- Inductive Reasoning: Pattern recognition and generalization" 
echo "- Abductive Reasoning: Best explanation finding"
echo "- Bayesian Reasoning: Probabilistic inference"
echo "- Causal Reasoning: Cause-effect analysis"
echo "- Analogical Reasoning: Similarity-based insights"
echo ""

# Start fine-tuning
echo "⚡ Starting fine-tuning process..."
echo "This may take several hours depending on hardware..."
echo ""

# Run the fine-tuning script
python3 scripts/fine-tune-vera.py \
    --config ./fine-tuning/config-enhanced.json

# Check if fine-tuning completed successfully
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Fine-tuning completed successfully!"
    echo "=========================================="
    echo "📁 Enhanced model saved to: ./models/vera-reasoning-enhanced.gguf"
    echo ""
    echo "🧠 New Capabilities:"
    echo "- Advanced reasoning methods"
    echo "- Information synthesis from multiple sources"
    echo "- Hypothesis generation and testing"
    echo "- Quality assessment and bias detection"
    echo "- Step-by-step reasoning with confidence scoring"
    echo ""
    echo "📊 Performance Metrics:"
    echo "- Reasoning accuracy: Target >90%"
    echo "- Logical coherence: Target >85%"
    echo "- Evidence quality: Target >80%"
    echo ""
    echo "🔄 Next Steps:"
    echo "1. Test the enhanced model with reasoning queries"
    echo "2. Update production configuration to use new model"
    echo "3. Monitor performance and collect feedback"
    echo "4. Plan next enhancement phase (Adaptive Learning)"
    echo ""
    echo "✨ Vera is now ready with advanced reasoning capabilities!"
else
    echo ""
    echo "❌ Fine-tuning failed. Check logs in ./fine-tuning/logs/"
    echo "Common issues:"
    echo "- Insufficient memory (try reducing batch_size or gradient_accumulation_steps)"
    echo "- GPU memory issues (try reducing gpu_layers)"
    echo "- Dataset format errors (check JSONL format)"
    exit 1
fi
