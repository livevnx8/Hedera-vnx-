#!/bin/bash
cd /home/vera-live-0-1/hedera-llm-api
echo "=== Starting Vera Retraining with HCS ==="
node retrain-live.mjs 2>&1
echo "=== Done ==="
