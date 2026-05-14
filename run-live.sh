#!/bin/bash
# Vera DOVU Live - Simple Start Script

cd /home/vera-live-0-1/hedera-llm-api

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🚀 VERA LIVE DOVU - 0.0.3716059                                   ║"
echo "║  Wallet: 0.0.10294360                                              ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if already running
if pgrep -f "vera-dovu-3716059-live" > /dev/null; then
    echo "⚠️  Already running! Checking logs..."
    tail -30 logs/vera-dovu-*.log 2>/dev/null | head -30
    exit 0
fi

echo "📦 Starting 24/7 live dominance..."
echo "Log: logs/vera-dovu-$(date +%Y%m%d-%H%M%S).log"
echo ""

# Run directly (not in background so you see output)
npx tsx vera-dovu-3716059-live.ts 2>&1 | tee logs/vera-dovu-$(date +%Y%m%d-%H%M%S).log
