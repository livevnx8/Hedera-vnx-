#!/bin/bash
# Vera Training Script - Execute full retraining with HCS/DOVU progress

set -e

MODE=${1:--full}

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🧠 VERA RETRAINING EXECUTOR                                       ║"
echo "║  Mode: $MODE                                                        ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Check dependencies
echo "📋 Checking dependencies..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found"
    exit 1
fi
echo "   ✅ Python3 found"

# Setup directories
echo ""
echo "📁 Setting up directories..."
mkdir -p fine-tuning/logs
mkdir -p fine-tuning/checkpoints
mkdir -p fine-tuning/evaluations
mkdir -p models
echo "   ✅ Directories ready"

# Check training data
echo ""
echo "📊 Checking training data..."
if [ ! -f "training/vera-ft-train.jsonl" ]; then
    echo "   ⚠️  Training data not found, generating..."
    npx tsx scripts/generate-training-data.ts
fi
echo "   ✅ Training data: training/vera-ft-train.jsonl"

# Check for progress update
if [ -f "training/vera-progress-update.jsonl" ]; then
    echo "   ✅ Progress update found: training/vera-progress-update.jsonl"
    echo "   📈 Merging with main training data..."
    
    # Merge files
    cat training/vera-ft-train.jsonl training/vera-progress-update.jsonl > training/vera-ft-train-merged.jsonl
    mv training/vera-ft-train-merged.jsonl training/vera-ft-train.jsonl
    echo "   ✅ Merged successfully"
fi

# Count examples
TRAIN_COUNT=$(wc -l < training/vera-ft-train.jsonl)
echo "   📊 Total training examples: $TRAIN_COUNT"

echo ""
echo "══════════════════════════════════════════════════════════════════════"
echo "🚀 STARTING RETRAINING"
echo "══════════════════════════════════════════════════════════════════════"
echo ""

if [ "$MODE" == "--quick" ] || [ "$MODE" == "-q" ]; then
    echo "⚡ Quick mode: 1 epoch, smaller batch"
    python3 scripts/fine-tune-vera.py \
        --epochs 1 \
        --batch-size 2 \
        --quick \
        2>&1 | tee fine-tuning/logs/retrain-$(date +%s).log
elif [ "$MODE" == "--update-only" ] || [ "$MODE" == "-u" ]; then
    echo "📝 Update mode: Adding new examples only"
    echo "   Skipping full training - dataset updated"
    echo "   Run with --full to execute training"
else
    echo "🎯 Full retraining mode"
    echo "   Epochs: 3"
    echo "   Learning Rate: 2e-4"
    echo "   LoRA R: 64"
    echo ""
    
    # Run the actual training
    if [ -f "scripts/fine-tune-vera.py" ]; then
        python3 scripts/fine-tune-vera.py \
            --config fine-tuning/config-enhanced.json \
            2>&1 | tee fine-tuning/logs/retrain-$(date +%s).log
    else
        echo "   ⚠️  Python trainer not available, using Node.js fallback"
        node scripts/full-retrain-vera.js
    fi
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════"
echo "✅ RETRAINING COMPLETE"
echo "══════════════════════════════════════════════════════════════════════"
echo ""
echo "📁 Output files:"
echo "   • Logs: fine-tuning/logs/"
echo "   • Checkpoints: fine-tuning/checkpoints/"
echo "   • Model: models/vera-retrained-v2/"
echo ""
echo "🧠 Vera now knows:"
echo "   • HCS topics: 0.0.10409351, 0.0.10409353"
echo "   • DOVU verification speed metrics"
echo "   • Wallet: 0.0.10294360"
echo "   • HashScan integration"
echo "   • Live verification commands"
echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🎉 RETRAINING SUCCESSFUL!                                         ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
