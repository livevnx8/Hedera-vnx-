---
description: Backup and restore Vera's lattice knowledge base
---

# Backup and Restore Lattice

Complete backup and recovery procedures for Vera's Flower of Life lattice.

## Prerequisites

- Lattice deployed and running
- Backup storage configured
- Sufficient disk space (>10GB recommended)

## Automated Backups

### Setup Daily Backup Cron

```bash
// turbo
./setup-cron.sh
```

**Verifies:**
- Cron job installed
- Backup script configured
- Log rotation enabled

### Manual Backup

```bash
// turbo
./backup-lattice.sh
```

**Creates:**
- `vera-lattice-backup-YYYYMMDD.tar.gz`
- Mirror shard snapshot
- Redis data dump
- Configuration files
- HCS topic state

## What Gets Backed Up

### 1. Lattice Knowledge Base

```
/mnt/vera-mirror-shards/vera-lattice/
├── lattice-index.json       # Node positions
├── agent-registry.json      # Agent data
├── topic-mappings.json      # HCS topics
├── knowledge-base.json      # AI knowledge
└── auto-docs/              # Generated docs
```

### 2. AI Optimization Data

```
/var/lib/vera/ai/
├── response-cache.json      # Cached responses
├── knowledge-capture.json   # Learned patterns
├── router-stats.json       # Routing metrics
└── tool-optimizer.json     # Tool batch data
```

### 3. Configuration

```
/etc/vera/
├── vera.conf               # Main config
├── topics.env             # HCS topic IDs
├── ai-config.json         # AI settings
└── ssl/                   # Certificates
```

### 4. HCS Topic State

```bash
// turbo
# Export HCS messages
node export-hcs-messages.mjs \
  --topics $(cat .env.topics | grep = | cut -d= -f2 | tr '\n' ',') \
  --output hcs-export-$(date +%Y%m%d).json
```

## Backup Verification

### Test Backup Integrity

```bash
// turbo
# Verify backup file
tar -tzf vera-lattice-backup-YYYYMMDD.tar.gz > /dev/null && echo "✅ Valid"

# Check file sizes
tar -tzf vera-lattice-backup-YYYYMMDD.tar.gz | awk '{print $3, $5}' | sort -k2 -n

# Test extraction to temp
tar -xzf vera-lattice-backup-YYYYMMDD.tar.gz -C /tmp/backup-test/
ls -la /tmp/backup-test/
```

### Automated Verification Script

```bash
// turbo
cat > verify-backup.sh << 'EOF'
#!/bin/bash
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./verify-backup.sh <backup-file>"
  exit 1
fi

echo "Verifying $BACKUP_FILE..."

# Check file exists and is readable
if [ ! -r "$BACKUP_FILE" ]; then
  echo "❌ Cannot read backup file"
  exit 1
fi

# Verify tar integrity
if ! tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
  echo "❌ Backup file is corrupted"
  exit 1
fi

# Check critical files exist
REQUIRED_FILES=(
  "lattice-index.json"
  "agent-registry.json"
  "topics.env"
)

for file in "${REQUIRED_FILES[@]}"; do
  if ! tar -tzf "$BACKUP_FILE" | grep -q "$file"; then
    echo "❌ Missing required file: $file"
    exit 1
  fi
done

echo "✅ Backup verified successfully"
EOF
chmod +x verify-backup.sh
```

## Restore Procedures

### Full Lattice Restore

```bash
// turbo
# 1. Stop services
sudo systemctl stop vera

# 2. Backup current state (just in case)
mv /mnt/vera-mirror-shards/vera-lattice /mnt/vera-mirror-shards/vera-lattice-pre-restore-$(date +%s)

# 3. Extract backup
tar -xzf vera-lattice-backup-YYYYMMDD.tar.gz -C /mnt/vera-mirror-shards/

# 4. Restore Redis
redis-cli FLUSHDB
cat /path/to/backup/redis-dump.rdb | redis-cli --pipe

# 5. Verify configuration
./verify-lattice-topics.mjs

# 6. Restart services
sudo systemctl start vera

# 7. Verify restoration
./vera-status.sh
```

### Selective Restore

**Restore only agent registry:**
```bash
// turbo
tar -xzf vera-lattice-backup-YYYYMMDD.tar.gz \
  -C /mnt/vera-mirror-shards/ \
  vera-lattice/agent-registry.json
```

**Restore only AI knowledge:**
```bash
// turbo
tar -xzf vera-lattice-backup-YYYYMMDD.tar.gz \
  -C /var/lib/vera/ai/ \
  ai/knowledge-capture.json
```

## Point-in-Time Recovery

### Restore to Specific Date

```bash
// turbo
# List available backups
ls -lt backups/vera-lattice-backup-* | head -10

# Restore specific date
BACKUP_DATE="20240115"
RESTORE_FILE="backups/vera-lattice-backup-${BACKUP_DATE}.tar.gz"

if [ -f "$RESTORE_FILE" ]; then
  echo "Restoring from $BACKUP_DATE..."
  ./restore-lattice.sh "$RESTORE_FILE"
else
  echo "❌ No backup found for $BACKUP_DATE"
fi
```

### Incremental Recovery

For incremental backup strategy:

```bash
// turbo
# Restore base backup
tar -xzf vera-lattice-backup-base.tar.gz -C /mnt/vera-mirror-shards/

# Apply incremental updates
for delta in vera-lattice-delta-*.tar.gz; do
  echo "Applying $delta..."
  tar -xzf "$delta" -C /mnt/vera-mirror-shards/
done
```

## Offsite Backup

### Sync to Cloud Storage

```bash
// turbo
# AWS S3
aws s3 sync /backups/vera/ s3://vera-backups/lattice/ \
  --storage-class STANDARD_IA

# Google Cloud Storage
gsutil -m rsync -r /backups/vera/ gs://vera-backups/lattice/

# Azure Blob
azcopy sync /backups/vera/ "https://verabackups.blob.core.windows.net/lattice/"
```

### Encrypted Backup

```bash
// turbo
# Encrypt before upload
gpg --symmetric --cipher-algo AES256 \
  vera-lattice-backup-YYYYMMDD.tar.gz

# Upload encrypted file
aws s3 cp vera-lattice-backup-YYYYMMDD.tar.gz.gpg \
  s3://vera-backups/lattice/encrypted/

# Store passphrase securely (use password manager)
# Never commit passphrase to repository
```

## Disaster Recovery

### Complete System Loss

```bash
// turbo
# 1. Provision new server
# 2. Install dependencies
npm install

# 3. Download latest backup
aws s3 cp s3://vera-backups/lattice/vera-lattice-backup-latest.tar.gz .

# 4. Restore
./restore-lattice.sh vera-lattice-backup-latest.tar.gz

# 5. Verify HCS topics
./verify-lattice-topics.mjs

# 6. Start services
sudo systemctl start vera

# 7. Full system test
./final-polish.sh
```

### Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single file restore | 5 min | 0 (current) |
| Full lattice restore | 30 min | 24 hours (daily backup) |
| Complete system rebuild | 2 hours | 24 hours |
| Multi-region failover | 4 hours | 1 hour (replication) |

## Backup Retention Policy

### Recommended Schedule

```bash
// turbo
# Daily backups - keep 7 days
0 2 * * * /home/vera/backup-lattice.sh daily

# Weekly backups - keep 4 weeks
0 3 * * 0 /home/vera/backup-lattice.sh weekly

# Monthly backups - keep 12 months
0 4 1 * * /home/vera/backup-lattice.sh monthly

# Cleanup old backups
0 5 * * * find /backups -name "*.tar.gz" -mtime +30 -delete
```

### Storage Requirements

| Backup Type | Size | Frequency | Retention | Total |
|-------------|------|-----------|-----------|-------|
| Daily | 500MB | 7 days | 7 days | 3.5GB |
| Weekly | 500MB | 4 weeks | 4 weeks | 2GB |
| Monthly | 500MB | 12 months | 12 months | 6GB |
| **Total** | | | | **~12GB/year** |

## Testing Restores

### Monthly Restore Test

```bash
// turbo
# Automated test script
cat > test-restore.sh << 'EOF'
#!/bin/bash
set -e

TEST_DIR="/tmp/vera-restore-test-$(date +%s)"
LATEST_BACKUP=$(ls -t backups/vera-lattice-backup-*.tar.gz | head -1)

echo "Testing restore from: $LATEST_BACKUP"

# Create test environment
mkdir -p "$TEST_DIR"

# Extract backup
tar -xzf "$LATEST_BACKUP" -C "$TEST_DIR"

# Verify critical files
for file in lattice-index.json agent-registry.json; do
  if [ ! -f "$TEST_DIR/vera-lattice/$file" ]; then
    echo "❌ Missing $file"
    exit 1
  fi
done

# Parse JSON validity
if ! jq empty "$TEST_DIR/vera-lattice/lattice-index.json" 2>/dev/null; then
  echo "❌ Invalid JSON in lattice-index.json"
  exit 1
fi

echo "✅ Restore test passed"

# Cleanup
rm -rf "$TEST_DIR"
EOF
chmod +x test-restore.sh

# Run monthly
echo "0 6 1 * * /home/vera/test-restore.sh" | crontab -
```

## Troubleshooting

### Issue: "Backup file too large"

**Fix:** Compress more aggressively
```bash
// turbo
# Use better compression
tar -czf - vera-lattice/ | gzip -9 > backup.tar.gz

# Or exclude logs
tar -czf backup.tar.gz --exclude='*.log' vera-lattice/
```

### Issue: "Restore fails with permission denied"

**Fix:** Fix permissions
```bash
// turbo
sudo chown -R vera:vera /mnt/vera-mirror-shards/vera-lattice
sudo chmod -R 755 /mnt/vera-mirror-shards/vera-lattice
```

### Issue: "Missing HCS topics after restore"

**Fix:** Recreate topics
```bash
// turbo
node create-vera-payment-topics.mjs --restore-from-backup
```

## Next Steps

1. Configure automated offsite backups
2. Test restore procedure monthly
3. Document backup locations
4. Set up backup monitoring alerts
