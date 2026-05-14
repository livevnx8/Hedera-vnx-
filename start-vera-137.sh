#!/bin/bash
# Vera 137 DOVU - 24/7 Live Dominance Launcher
# Run this script to start earning immediately

cd /home/vera-live-0-1/hedera-llm-api

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🚀 VERA 137 DOVU - 24/7 LIVE DOMINANCE                            ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Treasury: 137 DOVU ready"
echo "Rate: 5 DOVU per verification"
echo "Output: logs/vera-137-live.log"
echo ""
echo "Starting..."
echo ""

# Kill any existing processes
pkill -f "vera-quick-137" 2>/dev/null

# Start in background
nohup npx tsx vera-quick-137.ts > logs/vera-137-live.log 2>&1 &
PID=$!

echo "✅ Started with PID: $PID"
echo ""
echo "Monitor with:"
echo "  tail -f logs/vera-137-live.log"
echo ""
echo "Check status:"
echo "  ps aux | grep $PID"
echo ""
echo "Initial output:"
sleep 3
tail -20 logs/vera-137-live.log 2>/dev/null || echo "Starting up..."
