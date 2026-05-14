#!/bin/bash
# Vera Lattice Backup Script
# Backs up knowledge base to 4TB drive with versioning

set -e

# Config
LATTICE_DIR="/mnt/vera-mirror-shards/vera-lattice"
BACKUP_DIR="/mnt/vera-mirror-shards/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="vera-lattice-${TIMESTAMP}"
RETENTION_DAYS=30

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🌸 Vera Lattice Backup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Check disk space
AVAILABLE=$(df -BG "${BACKUP_DIR}" | tail -1 | awk '{print $4}' | tr -d 'G')
if [ "$AVAILABLE" -lt 10 ]; then
    echo -e "${YELLOW}⚠️  Warning: Low disk space (${AVAILABLE}GB available)${NC}"
fi

echo -e "${BLUE}📦 Creating backup: ${BACKUP_NAME}${NC}"
echo "   Source: ${LATTICE_DIR}"
echo "   Target: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo ""

# Create compressed backup
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "${LATTICE_DIR}" . 2>/dev/null || {
    echo -e "${YELLOW}⚠️  tar failed, trying with sudo...${NC}"
    sudo tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "${LATTICE_DIR}" .
}

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)

echo -e "${GREEN}✅ Backup created: ${BACKUP_SIZE}${NC}"
echo ""

# Create latest symlink
ln -sf "${BACKUP_NAME}.tar.gz" "${BACKUP_DIR}/vera-lattice-latest.tar.gz"

# Clean old backups
echo -e "${BLUE}🧹 Cleaning backups older than ${RETENTION_DAYS} days...${NC}"
DELETED=$(find "${BACKUP_DIR}" -name "vera-lattice-*.tar.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo -e "${GREEN}✅ Removed ${DELETED} old backups${NC}"
echo ""

# Show backup stats
echo -e "${BLUE}📊 Backup Statistics:${NC}"
echo "   Total backups: $(ls -1 ${BACKUP_DIR}/vera-lattice-*.tar.gz 2>/dev/null | wc -l)"
echo "   Backup size: ${BACKUP_SIZE}"
echo "   Available space: $(df -h ${BACKUP_DIR} | tail -1 | awk '{print $4}')"
echo ""

# Also backup critical code files
echo -e "${BLUE}💾 Backing up critical source files...${NC}"
mkdir -p "${BACKUP_DIR}/source-snapshots"

# Backup key working code
tar -czf "${BACKUP_DIR}/source-snapshots/carbon-${TIMESTAMP}.tar.gz" \
    -C /home/vera-live-0-1/hedera-llm-api \
    src/carbon/wvCarbonRetirementLogger.ts \
    wv-carbon-retirement-demo.mjs \
    2>/dev/null || true

echo -e "${GREEN}✅ Source snapshot created${NC}"
echo ""

echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🌸 Backup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Backup location: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "Latest symlink:  ${BACKUP_DIR}/vera-lattice-latest.tar.gz"
echo ""
