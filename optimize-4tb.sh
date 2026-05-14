#!/bin/bash
# Optimize 4TB Drive Usage
# Move logs and data from main drive to 4TB

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🌸 Optimizing 4TB Drive for Vera${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

LATTICE_DIR="/mnt/vera-mirror-shards/vera-lattice"
PROJECT_DIR="/home/vera-live-0-1/hedera-llm-api"

# Ensure directories exist
mkdir -p "${LATTICE_DIR}/logs"
mkdir -p "${LATTICE_DIR}/backups"
mkdir -p "${LATTICE_DIR}/data"
mkdir -p "${LATTICE_DIR}/node_modules-archive"

# Move existing logs
echo -e "${BLUE}📁 Moving logs to 4TB drive...${NC}"
if [ -f "${PROJECT_DIR}/*.log" ]; then
    mv ${PROJECT_DIR}/*.log "${LATTICE_DIR}/logs/" 2>/dev/null || true
    echo -e "${GREEN}✅ Moved project logs${NC}"
fi

# Move data directory if it exists
if [ -d "${PROJECT_DIR}/data" ]; then
    echo -e "${BLUE}📁 Moving data directory...${NC}"
    mv "${PROJECT_DIR}/data" "${LATTICE_DIR}/"
    ln -sf "${LATTICE_DIR}/data" "${PROJECT_DIR}/data"
    echo -e "${GREEN}✅ Data moved and symlinked${NC}"
fi

# Create symlinks for logs
echo -e "${BLUE}🔗 Creating log symlinks...${NC}"
ln -sf "${LATTICE_DIR}/logs" "${PROJECT_DIR}/logs-4tb"
echo -e "${GREEN}✅ Logs symlinked${NC}"

# Move node_modules if user wants (optional)
echo ""
echo -e "${YELLOW}⚠️  Optional: Move node_modules to 4TB?${NC}"
echo "   This will free up 1.7 GB on main drive"
echo "   but may impact build performance."
echo ""
echo "   Run manually if desired:"
echo "   mv ${PROJECT_DIR}/node_modules ${LATTICE_DIR}/"
echo "   ln -s ${LATTICE_DIR}/node_modules ${PROJECT_DIR}/node_modules"
echo ""

# Show space usage
echo -e "${BLUE}📊 Storage Status After Optimization:${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
df -h / | tail -1 | awk '{printf "   Main Drive (/):     %s used, %s free\n", $3, $4}'
df -h /mnt/vera-mirror-shards | tail -1 | awk '{printf "   4TB Drive:          %s used, %s free\n", $3, $4}'
echo ""
echo -e "   Lattice Files:      $(find ${LATTICE_DIR} -type f | wc -l) files"
echo -e "   Lattice Size:       $(du -sh ${LATTICE_DIR} | cut -f1)"
echo ""

echo -e "${GREEN}✅ 4TB Drive Optimization Complete!${NC}"
echo ""
echo "Next steps:"
echo "   1. Run backup:     ./backup-lattice.sh"
echo "   2. Setup cron:     ./setup-cron.sh"
echo "   3. View status:    ./vera-status.sh"
echo ""
