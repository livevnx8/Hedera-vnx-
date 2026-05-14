#!/bin/bash
# Launch Vera Hummingbird Volume Generator
# Ultra-efficient micro-volume for token 0.0.9356476 (hbar.h)
# No loss method - creates constant volume at minimal cost

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  🐦 VERA HUMMINGBIRD VOLUME GENERATOR                          ║"
echo "║  Token: 0.0.9356476 (hbar.h)                                   ║"
echo "║  Method: Rapid micro self-transfers (NO LOSS)                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check environment
if [ -f ".env" ]; then
    source .env
    echo "✅ Environment loaded"
else
    echo "⚠️  No .env file"
fi

# Check node modules
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Set agent ID
export HUMMER_AGENT_ID="${HUMMER_AGENT_ID:-vera-hummingbird-$(date +%s)}"

# Show config
echo ""
echo "🐦 HUMMINGBIRD CONFIGURATION:"
echo "   Micro Amount: 0.00001 HBAR (tiny!)"
echo "   Target TPS: 50"
echo "   Daily Limit: $0.05"
echo "   Method: Self-transfers (no loss of funds)"
echo "   Est. Daily TX: ~4.3 million"
echo ""
echo "🚀 Starting Hummingbird..."
echo "   Press Ctrl+C to stop"
echo ""

# Run
exec node agents/vera-hummingbird-volume.mjs "$@"
