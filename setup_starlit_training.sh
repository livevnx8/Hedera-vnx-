#!/bin/bash
# Setup script for Starlit training infrastructure

set -e

echo "Setting up Starlit training infrastructure..."

# Check for CUDA
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA GPU detected"
    nvidia-smi
else
    echo "✗ No NVIDIA GPU detected - using CPU mode"
fi

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install PyTorch with CUDA support
echo "Installing PyTorch with CUDA..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install distributed training libraries
echo "Installing distributed training libraries..."
pip install torchelastic
pip install horovod

# Install JAX for TPU support (optional)
echo "Installing JAX (for TPU support)..."
pip install jax jaxlib

# Install other dependencies
echo "Installing other dependencies..."
pip install numpy
pip install scipy
pip install scikit-learn
pip install transformers
pip install datasets
pip install accelerate
pip install deepspeed

# Install monitoring tools
echo "Installing monitoring tools..."
pip install tensorboard
pip install wandb
pip install prometheus-client

# Install development tools
echo "Installing development tools..."
pip install pytest
pip install black
pip install flake8
pip install mypy

# Create directories
echo "Creating directories..."
mkdir -p starlit-artifacts/domain
mkdir -p starlit-artifacts/concept
mkdir -p starlit-artifacts/pattern
mkdir -p logs
mkdir -p checkpoints

# Set environment variables
echo "Setting environment variables..."
export CUDA_VISIBLE_DEVICES=0,1,2,3,4,5,6,7
export NCCL_DEBUG=INFO

# Download pre-trained models for transfer learning (optional)
echo "Downloading pre-trained models (optional)..."
# This would download a base model for distillation
# Uncomment when ready:
# python download_base_model.py

echo "✓ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Activate virtual environment: source venv/bin/activate"
echo "2. Test GPU setup: python -c 'import torch; print(torch.cuda.device_count())'"
echo "3. Run distributed training: python src/starlit/distributed_training.py distributed"
echo "4. Monitor with TensorBoard: tensorboard --logdir logs"
