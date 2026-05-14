#!/bin/bash
# VERA LIVE DOVU - Start Script
# Token: 0.0.3716059
# Wallet: 0.0.10294360

cd /home/vera-live-0-1/hedera-llm-api
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🚀 VERA LIVE DOVU STARTING                                        ║"
echo "║  Token: 0.0.3716059                                                ║"
echo "║  Wallet: 0.0.10294360                                              ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Kill any existing processes
pkill -f "vera-dovu-3716059" 2>/dev/null

# Start live dominance
echo "Starting 24/7 live dominance..."
echo "Output: logs/vera-dovu-3716059.log"
echo ""

nohup npx tsx vera-dovu-3716059-live.ts > logs/vera-dovu-3716059.log 2>&1 &
PID=$!

echo "✅ Started with PID: $PID"
echo ""
echo "Monitor with:"
echo "  tail -f logs/vera-dovu-3716059.log"
echo ""
echo "Check process:"
echo "  ps aux | grep $PID"
echo ""
echo "Waiting for initial output..."
sleep 5
tail -30 logs/vera-dovu-3716059.log 2>/dev/null || echo "Still initializing..."
