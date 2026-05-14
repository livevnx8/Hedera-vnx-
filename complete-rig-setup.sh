#!/bin/bash
# Complete Rig Setup Script
# Runs all optimization phases in sequence

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🌸 Vera Complete Rig Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Phase 1: Storage Optimization
echo -e "${BLUE}📦 Phase 1: Storage Optimization${NC}"
echo "═══════════════════════════════════════════════════════════════"
./optimize-4tb.sh 2>/dev/null || echo "   (Already optimized or manual step needed)"
./setup-cron.sh
echo -e "${GREEN}✅ Phase 1 complete${NC}"
echo ""

# Phase 2: Lattice Knowledge Base
echo -e "${BLUE}📚 Phase 2: Lattice Knowledge Base${NC}"
echo "═══════════════════════════════════════════════════════════════"
./backup-lattice.sh
echo -e "${GREEN}✅ Phase 2 complete - Knowledge base backed up${NC}"
echo ""

# Phase 3: Performance Optimization
echo -e "${BLUE}🚀 Phase 3: Performance Optimization${NC}"
echo "═══════════════════════════════════════════════════════════════"
./optimize-performance.sh
echo -e "${GREEN}✅ Phase 3 complete${NC}"
echo ""

# Phase 4: Monitoring (optional - requires Docker)
echo -e "${BLUE}📊 Phase 4: Monitoring Stack${NC}"
echo "═══════════════════════════════════════════════════════════════"
read -p "Deploy monitoring stack (Prometheus/Grafana)? Requires Docker. [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./setup-monitoring.sh
    echo -e "${GREEN}✅ Phase 4 complete${NC}"
else
    echo -e "${YELLOW}⏭️  Phase 4 skipped (can run later with ./setup-monitoring.sh)${NC}"
fi
echo ""

# Start Vera
echo -e "${BLUE}🤖 Starting Vera${NC}"
echo "═══════════════════════════════════════════════════════════════"
sudo systemctl start vera 2>/dev/null || {
    echo "   Systemd not configured, starting manually..."
    cd /home/vera-live-0-1/hedera-llm-api
    nohup npm run dev > /mnt/vera-mirror-shards/vera-lattice/logs/vera.log 2>&1 &
    echo "   Started on port 8088"
}
echo -e "${GREEN}✅ Vera started${NC}"
echo ""

# Final status
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Rig Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
./vera-status.sh 2>/dev/null || echo "   Run ./vera-status.sh to check status"
echo ""
echo "   Access your rig:"
echo "   - API:        http://localhost:8088"
echo "   - Health:     http://localhost:8088/health"
echo "   - Metrics:    http://localhost:9091/metrics"
echo "   - Lattice:    /mnt/vera-mirror-shards/vera-lattice/"
echo ""
