#!/bin/bash
# Vera Quality Check - Verify Everything Works

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔍 VERA QUALITY CHECK                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

PASS=0
FAIL=0

# 1. Check Vera Process
echo -e "${BLUE}1. Checking Vera Process...${NC}"
VERA_PID=$(pgrep -f "tsx.*index" | head -1)
if [ -n "$VERA_PID" ]; then
    echo -e "   ${GREEN}✅ Vera running (PID: $VERA_PID)${NC}"
    ((PASS++))
else
    echo -e "   ${RED}❌ Vera NOT running${NC}"
    ((FAIL++))
fi

# 2. Check Vera API
echo -e "${BLUE}2. Checking Vera API...${NC}"
HEALTH=$(curl -s http://localhost:8088/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo -e "   ${GREEN}✅ API responding${NC}"
    echo "   Response: $HEALTH"
    ((PASS++))
else
    echo -e "   ${RED}❌ API not responding${NC}"
    ((FAIL++))
fi

# 3. Check Redis
echo -e "${BLUE}3. Checking Redis...${NC}"
REDIS_PING=$(redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
    echo -e "   ${GREEN}✅ Redis responding (PONG)${NC}"
    ((PASS++))
else
    echo -e "   ${YELLOW}⚠️ Redis not responding${NC}"
    ((FAIL++))
fi

# 4. Check Enhanced Processes
echo -e "${BLUE}4. Checking Enhanced Processes...${NC}"
ENHANCED_PIDS=$(pgrep -f "activate-enhanced-speeds\|metrics-endpoint\|cluster-server" | wc -l)
if [ "$ENHANCED_PIDS" -gt 0 ]; then
    echo -e "   ${GREEN}✅ $ENHANCED_PIDS enhanced processes running${NC}"
    ((PASS++))
else
    echo -e "   ${YELLOW}⚠️ No enhanced processes found${NC}"
    ((FAIL++))
fi

# 5. Check Disk Space
echo -e "${BLUE}5. Checking Disk Space...${NC}"
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -lt 90 ]; then
    echo -e "   ${GREEN}✅ Disk: ${DISK_USAGE}% used (healthy)${NC}"
    ((PASS++))
else
    echo -e "   ${RED}❌ Disk: ${DISK_USAGE}% used (critical)${NC}"
    ((FAIL++))
fi

# 6. Check Symlinks
echo -e "${BLUE}6. Checking Symlinks...${NC}"
if [ -L "models" ] && [ -L "node_modules" ]; then
    echo -e "   ${GREEN}✅ Models and node_modules symlinked to 4TB${NC}"
    ((PASS++))
else
    echo -e "   ${YELLOW}⚠️ Some symlinks missing${NC}"
    ((FAIL++))
fi

# 7. Check HCS Topics File
echo -e "${BLUE}7. Checking Lattice Documentation...${NC}"
if [ -f "/mnt/vera-mirror-shards/vera-lattice/quick-ref/topic-directory/HCS-TOPICS.md" ]; then
    TOPIC_COUNT=$(grep -c "0\.0\." /mnt/vera-mirror-shards/vera-lattice/quick-ref/topic-directory/HCS-TOPICS.md 2>/dev/null || echo "0")
    echo -e "   ${GREEN}✅ Lattice docs exist ($TOPIC_COUNT topics documented)${NC}"
    ((PASS++))
else
    echo -e "   ${RED}❌ Lattice docs missing${NC}"
    ((FAIL++))
fi

# 8. Check for Errors in Logs
echo -e "${BLUE}8. Checking Recent Errors...${NC}"
RECENT_ERRORS=$(journalctl -n 50 --no-pager 2>/dev/null | grep -i "error\|fatal" | wc -l)
if [ "$RECENT_ERRORS" -lt 10 ]; then
    echo -e "   ${GREEN}✅ Low error count ($RECENT_ERRORS recent errors)${NC}"
    ((PASS++))
else
    echo -e "   ${YELLOW}⚠️ $RECENT_ERRORS recent errors detected${NC}"
    ((FAIL++))
fi

# Summary
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  QUALITY CHECK COMPLETE                                         ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ PASSED: $PASS${NC}"
echo -e "${RED}❌ FAILED: $FAIL${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL QUALITY CHECKS PASSED - Vera is production ready!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️ $FAIL issues detected - review above${NC}"
    exit 1
fi
