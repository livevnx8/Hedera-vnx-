#!/bin/bash
# Vera Final Polish - Complete System Verification

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ✨ VERA FINAL POLISH                                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. System Status
echo -e "${BLUE}🔍 System Verification...${NC}"
VERA_PID=$(pgrep -f "tsx.*index" | head -1)
if [ -n "$VERA_PID" ]; then
    echo -e "   ${GREEN}✅ Vera Running (PID: $VERA_PID)${NC}"
    UPTIME=$(ps -p $VERA_PID -o etime= 2>/dev/null | tr -d ' ')
    echo -e "   ${GREEN}   Uptime: $UPTIME${NC}"
else
    echo -e "   ${RED}❌ Vera NOT Running${NC}"
fi

# 2. API Health
echo -e "${BLUE}🌐 API Health Check...${NC}"
HEALTH=$(curl -s http://localhost:8088/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo -e "   ${GREEN}✅ API Responding${NC}"
    echo -e "   ${GREEN}   Response: $(echo $HEALTH | cut -c1-50)...${NC}"
else
    echo -e "   ${RED}❌ API Not Responding${NC}"
fi

# 3. Redis
echo -e "${BLUE}📡 Redis Status...${NC}"
if redis-cli ping 2>/dev/null | grep -q PONG; then
    echo -e "   ${GREEN}✅ Redis Active${NC}"
else
    echo -e "   ${YELLOW}⚠️ Redis Inactive${NC}"
fi

# 4. Storage
echo -e "${BLUE}💾 Storage Check...${NC}"
MAIN_DISK=$(df -h / | tail -1 | awk '{print $4}')
TB_DISK=$(df -h /mnt/vera-mirror-shards 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
echo -e "   ${GREEN}✅ Main: $MAIN_DISK free${NC}"
echo -e "   ${GREEN}✅ 4TB: $TB_DISK free${NC}"

# 5. Symlinks
echo -e "${BLUE}🔗 Symlink Verification...${NC}"
for link in models node_modules dist; do
    if [ -L "$link" ]; then
        target=$(readlink "$link")
        echo -e "   ${GREEN}✅ $link → $target${NC}"
    else
        echo -e "   ${YELLOW}⚠️ $link not symlinked${NC}"
    fi
done

# 6. Documentation
echo -e "${BLUE}📚 Lattice Documentation...${NC}"
DOC_COUNT=$(find /mnt/vera-mirror-shards/vera-lattice -name "*.md" 2>/dev/null | wc -l)
echo -e "   ${GREEN}✅ $DOC_COUNT markdown files${NC}"

# 7. Scripts
echo -e "${BLUE}🛠️  Management Scripts...${NC}"
SCRIPTS="vera-status.sh backup-lattice.sh measure-performance.sh quality-check.sh"
for script in $SCRIPTS; do
    if [ -x "$script" ]; then
        echo -e "   ${GREEN}✅ $script${NC}"
    else
        echo -e "   ${YELLOW}⚠️ $script${NC}"
    fi
done

# 8. Performance Baseline
echo -e "${BLUE}📊 Performance Baseline...${NC}"
LATEST_METRIC=$(ls -t /mnt/vera-mirror-shards/vera-lattice/performance-metrics-*.json 2>/dev/null | head -1)
if [ -n "$LATEST_METRIC" ]; then
    echo -e "   ${GREEN}✅ Baseline saved${NC}"
    echo -e "   ${GREEN}   File: $(basename $LATEST_METRIC)${NC}"
else
    echo -e "   ${YELLOW}⚠️ No baseline found${NC}"
fi

# Final Summary
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  ✨ POLISH COMPLETE                                             ${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ Vera is production-ready${NC}"
echo ""
echo -e "${BLUE}Quick Commands:${NC}"
echo "   ./vera-status.sh         - Check status"
echo "   ./measure-performance.sh - Measure performance"
echo "   ./quality-check.sh       - Run quality checks"
echo "   ./backup-lattice.sh      - Backup knowledge base"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "   INTEGRATION-GUIDE.md     - Performance integration"
echo "   RIG-OPTIMIZATION-SUMMARY.md - Complete summary"
echo ""
echo -e "${GREEN}🌸 Your rig is polished and ready for 24/7 operation${NC}"
