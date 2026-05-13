#!/usr/bin/env bash
# Vera OS — one-command setup
set -e

echo "⚡ Vera OS Quickstart"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create venv if not active
if [ -z "$VIRTUAL_ENV" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "   Activated .venv"
else
    echo "📦 Using existing venv: $VIRTUAL_ENV"
fi

# Install
echo "📥 Installing vera-os-hedera..."
pip install -e ".[production]" --quiet 2>/dev/null || pip install -e . --quiet

# Validate
echo ""
echo "✅ Verifying installation..."
python3 -c "
from vera_os import __version__, get_visual_assets, PredictionService, HederaSpecialistSwarm
assets = get_visual_assets()
print(f'   vera_os v{__version__} — {len(assets)} visual assets ready')
print(f'   PredictionService: OK')
print(f'   HederaSpecialistSwarm: OK')
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Ready! Try:"
echo ""
echo "   source .venv/bin/activate"
echo "   python3 examples/vera_os_visual_assets.py"
echo "   python3 examples/vera_os_run_hedera_swarm.py"
echo "   python3 examples/vera_os_predict_hbar.py --predict"
echo ""
echo "   make help          # see all commands"
echo "   make verify        # run validation suite"
echo "   make infra-up      # start Docker stack"
