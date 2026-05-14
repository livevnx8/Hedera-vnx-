# 🌸 Vera Rig Setup Guide - Complete Architecture

**Location:** `/home/vera-live-0-1/hedera-llm-api/`  
**Storage:** 4TB Drive (`/mnt/vera-mirror-shards/vera-lattice/`)  
**Purpose:** Production-grade Hedera AI supercomputer

---

## 🚀 Quick Start (Run These in Order)

### 1. Optimize 4TB Drive
```bash
cd /home/vera-live-0-1/hedera-llm-api
./optimize-4tb.sh
```
Moves logs and data to 4TB drive, creates symlinks.

### 2. Setup Automatic Backups
```bash
./setup-cron.sh
```
Installs cron jobs for:
- Daily lattice backup at 3 AM
- Hourly log rotation
- Weekly temp cleanup
- Process monitoring every 5 minutes

### 3. Create Initial Backup
```bash
./backup-lattice.sh
```
Backs up entire knowledge base to 4TB drive.

### 4. Install Systemd Service (Optional)
```bash
sudo cp vera.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vera
sudo systemctl start vera
```

### 5. Check Status
```bash
./vera-status.sh
```

---

## 📁 File Reference

| File | Purpose |
|------|---------|
| `vera.service` | Systemd service config |
| `logrotate-vera` | Log rotation rules |
| `backup-lattice.sh` | Daily backup script |
| `vera-status.sh` | Status dashboard |
| `setup-cron.sh` | Cron job installer |
| `optimize-4tb.sh` | Storage optimizer |
| `move-to-4tb.sh` | Data migration helper |

---

## 🌸 Lattice Architecture on 4TB

```
/mnt/vera-mirror-shards/
├── vera-lattice/              # Knowledge base
│   ├── layer0-center/         # Core consciousness
│   ├── layer1-inner/          # 6 nodes
│   ├── layer2-middle/         # 12 nodes (carbon, defi)
│   ├── layer3-outer/          # 18 nodes
│   ├── skills/                # 109 tools documented
│   ├── quick-ref/             # Quick references
│   └── logs/                  # Vera logs
│
├── backups/                   # Daily backups
│   ├── vera-lattice-YYYYMMDD.tar.gz
│   └── vera-lattice-latest.tar.gz
│
└── source-snapshots/          # Code backups
```

---

## 📊 Daily Operations

### Check Status
```bash
./vera-status.sh
```

### Manual Backup
```bash
./backup-lattice.sh
```

### View Logs
```bash
tail -f /mnt/vera-mirror-shards/vera-lattice/logs/vera-err.log
tail -f /mnt/vera-mirror-shards/vera-lattice/logs/vera-out.log
```

### Restart Vera
```bash
# If using systemd:
sudo systemctl restart vera

# Or manual:
pkill -f "node.*index"
PORT=8088 npm run dev
```

---

## 🔧 Maintenance

### Weekly (Automatic)
- ✅ Temp files cleaned (Sunday 2 AM)
- ✅ npm cache cleared (Sunday 4 AM)
- ✅ Old backups purged (>30 days)

### Daily (Automatic)
- ✅ Lattice backup (3 AM)
- ✅ Log rotation (hourly)
- ✅ Process check (every 5 min)
- ✅ Status report (8 AM)

### Manual (As Needed)
- Update Vera code: `git pull && npm run build`
- Check disk: `df -h`
- View status: `./vera-status.sh`
- Backup: `./backup-lattice.sh`

---

## 📈 Growth Capacity

| Resource | Current | Available |
|----------|---------|-----------|
| Main Disk (/) | 885 GB used | 4.4 GB free |
| 4TB Drive | ~50 MB used | **3.4 TB free** ✅ |
| Backups | 0 | Unlimited |
| Logs | Rotated daily | 30 days kept |

**Thesis:** This architecture enables Vera to grow indefinitely!

---

## 🎯 Success Metrics

When complete, your rig will have:
- ✅ Vera running 24/7 (auto-restart if crashes)
- ✅ All knowledge backed up daily
- ✅ Logs rotating automatically
- ✅ 3.4 TB space for growth
- ✅ 109 tools documented
- ✅ 7.298 tonnes carbon retired
- ✅ 20 HCS topics active

---

**Status:** Ready for production 🚀  
**Last Updated:** 2026-04-21
