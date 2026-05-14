#!/bin/bash
# Move Vera data to 4TB storage device
# Run: chmod +x move-to-4tb.sh && ./move-to-4tb.sh

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Moving Vera Data to 4TB Storage                          ║"
echo "║  Target: /mnt/vera-mirror-shards/vera-data               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Create directory structure on 4TB drive
sudo mkdir -p /mnt/vera-mirror-shards/vera-data
sudo mkdir -p /mnt/vera-mirror-shards/vera-data/{logs,backups,cache,data}

# Set ownership
sudo chown -R $(whoami):$(whoami) /mnt/vera-mirror-shards/vera-data

echo "✅ Directory structure created on 4TB drive"
echo ""
echo "📁 Structure:"
echo "   /mnt/vera-mirror-shards/vera-data/"
echo "   ├── logs/      ← Move large log files here"
echo "   ├── backups/   ← Database backups"
echo "   ├── cache/     ← Build caches"
echo "   └── data/      ← Vera data files"
echo ""

# Check current Vera project size
echo "📊 Current Vera project size:"
du -sh /home/vera-live-0-1/hedera-llm-api 2>/dev/null

# List large files in Vera project
echo ""
echo "🔍 Large files (>100MB) in Vera project:"
find /home/vera-live-0-1/hedera-llm-api -type f -size +100M 2>/dev/null | head -10

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Next steps:"
echo ""
echo "1. Move logs to 4TB:"
echo "   mv /home/vera-live-0-1/hedera-llm-api/*.log /mnt/vera-mirror-shards/vera-data/logs/"
echo ""
echo "2. Set up symlink for data directory:"
echo "   mv /home/vera-live-0-1/hedera-llm-api/data /mnt/vera-mirror-shards/vera-data/"
echo "   ln -s /mnt/vera-mirror-shards/vera-data/data /home/vera-live-0-1/hedera-llm-api/data"
echo ""
echo "3. Move node_modules (optional):"
echo "   mv /home/vera-live-0-1/hedera-llm-api/node_modules /mnt/vera-mirror-shards/vera-data/"
echo "   ln -s /mnt/vera-mirror-shards/vera-data/node_modules /home/vera-live-0-1/hedera-llm-api/"
echo ""
echo "💾 Available space after move:"
df -h /mnt/vera-mirror-shards
