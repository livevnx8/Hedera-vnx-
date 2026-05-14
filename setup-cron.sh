#!/bin/bash
# Setup Cron Jobs for Vera Rig Maintenance

echo "🌸 Setting up Vera Rig Cron Jobs"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Create cron jobs
CRON_JOBS="
# Vera Rig Maintenance
# Backup lattice daily at 3 AM
0 3 * * * /home/vera-live-0-1/hedera-llm-api/backup-lattice.sh >> /mnt/vera-mirror-shards/vera-lattice/logs/backup.log 2>&1

# Log rotation check hourly
0 * * * * /usr/sbin/logrotate -f /home/vera-live-0-1/hedera-llm-api/logrotate-vera 2>/dev/null || true

# Clear temp files weekly (Sunday 2 AM)
0 2 * * 0 rm -rf /tmp/* /var/tmp/* 2>/dev/null || true

# Disk cleanup - remove old npm cache weekly
0 4 * * 0 npm cache clean --force 2>/dev/null || true

# Check Vera status every 5 minutes (restart if down)
*/5 * * * * pgrep -f 'node.*index' > /dev/null || (cd /home/vera-live-0-1/hedera-llm-api && PORT=8088 npm run dev >> /dev/null 2>&1 &)

# Daily status report at 8 AM
0 8 * * * /home/vera-live-0-1/hedera-llm-api/vera-status.sh > /mnt/vera-mirror-shards/vera-lattice/logs/status-$(date +\%Y\%m\%d).txt 2>&1
"

# Install cron jobs
(crontab -l 2>/dev/null || echo "") | grep -v "Vera Rig Maintenance" | grep -v "backup-lattice" | grep -v "vera-status" > /tmp/current_crontab
echo "$CRON_JOBS" >> /tmp/current_crontab
crontab /tmp/current_crontab
rm /tmp/current_crontab

echo "✅ Cron jobs installed:"
echo ""
echo "   📦 Daily Backup:        3:00 AM"
echo "   🔄 Log Rotation:        Every hour"
echo "   🧹 Temp Cleanup:        Sunday 2:00 AM"
echo "   📊 Status Report:        Daily 8:00 AM"
echo "   👁️  Process Monitor:    Every 5 minutes"
echo ""
echo "View with: crontab -l"
echo "Edit with: crontab -e"
echo ""
