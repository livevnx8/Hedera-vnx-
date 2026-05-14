---
description: Upgrade Vera to latest version
---

# Upgrade System

Safely upgrade Vera lattice.

## Pre-Upgrade

```bash
// turbo
# Backup current state
./backup-lattice.sh

# Check current version
cat package.json | grep version

# Review changelog
cat CHANGELOG.md | head -50
```

## Perform Upgrade

```bash
// turbo
# Pull latest
git pull origin main

# Install updates
npm install

# Run migrations
npm run migrate

# Build
npm run build
```

## Verify Upgrade

```bash
// turbo
# Test health
./vera-status.sh

# Run integration tests
./verify-integration.sh

# Check AI components
curl http://localhost:8088/api/ai/health
```

## Rollback (if needed)

```bash
// turbo
./restore-lattice.sh backups/vera-lattice-backup-*.tar.gz
```
