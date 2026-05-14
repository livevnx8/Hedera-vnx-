#!/bin/bash
# Emergency Disk Cleanup Script
# Frees up space on main drive immediately

echo "🚨 Emergency Disk Cleanup Starting..."
echo "======================================"

BEFORE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
echo "Before: ${BEFORE}% used"
echo ""

# 1. Clear package cache
echo "📦 Clearing apt cache..."
sudo apt clean
sudo apt autoremove -y 2>/dev/null

# 2. Clear npm cache
echo "📦 Clearing npm cache..."
npm cache clean --force 2>/dev/null

# 3. Clear old logs
echo "📝 Clearing old logs..."
sudo journalctl --vacuum-time=3d
sudo find /var/log -name "*.gz" -mtime +7 -delete 2>/dev/null
sudo find /var/log -name "*.old" -mtime +7 -delete 2>/dev/null

# 4. Clear temp files
echo "🧹 Clearing temp files..."
sudo rm -rf /tmp/* /var/tmp/* 2>/dev/null

# 5. Move build artifacts to 4TB (if not already done)
echo "📁 Moving build artifacts to 4TB..."
if [ -d "/home/vera-live-0-1/hedera-llm-api/dist" ]; then
    sudo mv /home/vera-live-0-1/hedera-llm-api/dist /mnt/vera-mirror-shards/vera-lattice/
    ln -sf /mnt/vera-mirror-shards/vera-lattice/dist /home/vera-live-0-1/hedera-llm-api/dist
fi

# 6. Move logs to 4TB
echo "📁 Moving logs to 4TB..."
if [ -d "/home/vera-live-0-1/hedera-llm-api/logs" ]; then
    sudo mv /home/vera-live-0-1/hedera-llm-api/logs/* /mnt/vera-mirror-shards/vera-lattice/logs/ 2>/dev/null
fi

# 7. Clear old backups
echo "💾 Clearing old backups..."
find /home/vera-live-0-1/hedera-llm-api -name "*.backup" -mtime +7 -delete 2>/dev/null
find /home/vera-live-0-1/hedera-llm-api -name "*.old" -mtime +7 -delete 2>/dev/null

# 8. Clear Docker (if present)
if command -v docker &> /dev/null; then
    echo "🐳 Cleaning Docker..."
    docker system prune -f 2>/dev/null
fi

AFTER=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
FREED=$((BEFORE - AFTER))

echo ""
echo "======================================"
echo "✅ Cleanup Complete!"
echo "Before: ${BEFORE}% used"
echo "After:  ${AFTER}% used"
echo "Freed:  ${FREED}%"
echo ""
df -h /
