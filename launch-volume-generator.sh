#!/bin/bash
# Launch script for Vera HBAR Volume Generator
# Creates constant volume for token 0.0.9356476 at lowest cost

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  🔥 VERA HBAR VOLUME GENERATOR LAUNCHER                         ║"
echo "║  Token: 0.0.9356476 (hbar.h)                                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check environment
if [ -f ".env" ]; then
    echo "✅ Environment file found"
else
    echo "⚠️  No .env file - running in SIMULATION mode"
    echo "   To enable live Hedera transactions, set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY"
    echo ""
fi

# Check node modules
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Set agent ID
export VOLUME_AGENT_ID="${VOLUME_AGENT_ID:-vera-hbar-volume-$(date +%s)}"

echo "🚀 Starting Volume Generator..."
echo "   Agent ID: $VOLUME_AGENT_ID"
echo "   Target TPS: 100+"
echo "   TX Cost: $0.0001 per transfer"
echo "   Press Ctrl+C to stop"
echo ""

# Run the generator
exec node agents/vera-hbar-volume.mjs "$@"
