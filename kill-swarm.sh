#!/bin/bash
# Emergency Stop Script for Vera Swarm
# Kills all Vera-related processes

echo "🛑 EMERGENCY STOP: Vera Swarm Termination"
echo "=========================================="
echo ""

# Kill all node processes running Vera agents
echo "Step 1: Killing Vera agent processes..."
pkill -9 -f "vera-" 2>/dev/null
pkill -9 -f "hashscan" 2>/dev/null
pkill -9 -f "lattice" 2>/dev/null
pkill -9 -f "topic-manager" 2>/dev/null
sleep 1

# Kill any remaining node processes in agents directory
echo "Step 2: Killing agents directory processes..."
kill -9 $(pgrep -f "node.*agents.*mjs" 2>/dev/null) 2>/dev/null
sleep 1

# Kill any hanging node processes
echo "Step 3: Force kill remaining node processes..."
killall -9 node 2>/dev/null
sleep 1

# Check what's left
echo ""
echo "Step 4: Verifying termination..."
REMAINING=$(ps aux | grep -E "vera|hashscan|lattice|topic" | grep -v grep | grep -v bash | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo "✅ ALL VERA SWARM ACTIVITY STOPPED"
    echo ""
    echo "Stopped systems:"
    echo "  • HashScan Monitor"
    echo "  • Lattice Hub"
    echo "  • Master Brain"
    echo "  • Topic Manager"
    echo "  • Expanded Lattice"
    echo "  • External Tool Bridge"
    echo "  • Language Learner"
    echo "  • Advanced NLP"
    echo "  • Reasoning Engine"
    echo "  • All agent processes"
    echo ""
    echo "System is now QUIET."
else
    echo "⚠️  $REMAINING processes still running:"
    ps aux | grep -E "vera|hashscan|lattice|topic" | grep -v grep | grep -v bash
fi

echo ""
echo "=========================================="
echo "Emergency stop complete."
