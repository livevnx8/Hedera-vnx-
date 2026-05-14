#!/bin/bash
# Run Vera Multi-Task HCS Logger continuously

cd /home/vera-live-0-1/hedera-llm-api

echo "=================================="
echo "Vera Multi-Task HCS Logger"
echo "=================================="
echo ""
echo "This will run continuously, logging to:"
echo "  - Nerves (0.0.10409351): System events"
echo "  - Lungs (0.0.10409353):  Analysis metrics"
echo "  - Memory (0.0.10409351): Attestations"
echo ""
echo "View on HashScan: https://hashscan.io/mainnet/topic/0.0.10409351"
echo ""
echo "Press Ctrl+C to stop"
echo "=================================="
echo ""

node vera-multi-task-logger.mjs
