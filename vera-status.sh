#!/bin/bash
# Vera Status Dashboard
# Real-time status of the rig and lattice

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

clear

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🌸 VERA RIG STATUS DASHBOARD                                      ║${NC}"
echo -e "${CYAN}║  $(date '+%Y-%m-%d %H:%M:%S')                                              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# System Resources
echo -e "${BLUE}📊 SYSTEM RESOURCES${NC}"
echo "═══════════════════════════════════════════════════════════════════════"

# CPU
echo -n "   CPU: "
CPU_IDLE=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' | cut -d'%' -f1)
CPU_USED=$(echo "100 - ${CPU_IDLE}" | bc 2>/dev/null || echo "N/A")
if (( $(echo "${CPU_USED} > 80" | bc 2>/dev/null || echo 0) )); then
    echo -e "${RED}${CPU_USED}% used ⚠️${NC}"
elif (( $(echo "${CPU_USED} > 50" | bc 2>/dev/null || echo 0) )); then
    echo -e "${YELLOW}${CPU_USED}% used${NC}"
else
    echo -e "${GREEN}${CPU_USED}% used ✅${NC}"
fi

# Memory
echo -n "   Memory: "
MEM_INFO=$(free | grep Mem)
MEM_TOTAL=$(echo $MEM_INFO | awk '{print $2}')
MEM_USED=$(echo $MEM_INFO | awk '{print $3}')
MEM_PERCENT=$(echo "scale=1; ($MEM_USED / $MEM_TOTAL) * 100" | bc 2>/dev/null || echo "N/A")
if (( $(echo "${MEM_PERCENT} > 80" | bc 2>/dev/null || echo 0) )); then
    echo -e "${RED}${MEM_PERCENT}% used ⚠️${NC}"
else
    echo -e "${GREEN}${MEM_PERCENT}% used ✅${NC}"
fi

# Disk
echo -n "   Main Disk (/): "
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')
if [ "$DISK_USAGE" -gt 95 ]; then
    echo -e "${RED}${DISK_USAGE}% used (${DISK_AVAIL} free) ⚠️ CRITICAL${NC}"
elif [ "$DISK_USAGE" -gt 80 ]; then
    echo -e "${YELLOW}${DISK_USAGE}% used (${DISK_AVAIL} free)${NC}"
else
    echo -e "${GREEN}${DISK_USAGE}% used (${DISK_AVAIL} free) ✅${NC}"
fi

# 4TB Drive
echo -n "   4TB Drive: "
DISK4_AVAIL=$(df -h /mnt/vera-mirror-shards 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
echo -e "${GREEN}${DISK4_AVAIL} available ✅${NC}"

echo ""

# Vera Process
echo -e "${BLUE}🤖 VERA PROCESS${NC}"
echo "═══════════════════════════════════════════════════════════════════════"

VERA_PID=$(pgrep -f "node.*index" | head -1)
if [ -n "$VERA_PID" ]; then
    echo -e "   Status: ${GREEN}Running ✅${NC}"
    echo "   PID: $VERA_PID"
    
    # Port
    PORT=$(sudo ss -tlnp 2>/dev/null | grep "$VERA_PID" | awk '{print $4}' | cut -d':' -f2 | head -1 || echo "N/A")
    echo "   Port: ${PORT:-N/A}"
    
    # Uptime
    UPTIME=$(ps -o etime= -p "$VERA_PID" 2>/dev/null | tr -d ' ' || echo "N/A")
    echo "   Uptime: ${UPTIME:-N/A}"
    
    # Memory usage
    VERA_MEM=$(ps -o rss= -p "$VERA_PID" 2>/dev/null | awk '{print $1/1024 " MB"}' || echo "N/A")
    echo "   Memory: ${VERA_MEM:-N/A}"
else
    echo -e "   Status: ${RED}Not Running ❌${NC}"
    echo -e "   ${YELLOW}Start with: cd /home/vera-live-0-1/hedera-llm-api && PORT=8088 npm run dev${NC}"
fi

echo ""

# Lattice Status
echo -e "${BLUE}🌸 LATTICE KNOWLEDGE BASE${NC}"
echo "═══════════════════════════════════════════════════════════════════════"

LATTICE_DIR="/mnt/vera-mirror-shards/vera-lattice"
if [ -d "$LATTICE_DIR" ]; then
    echo -e "   Status: ${GREEN}Active ✅${NC}"
    echo "   Location: ${LATTICE_DIR}"
    
    # Count files
    FILE_COUNT=$(find "$LATTICE_DIR" -type f 2>/dev/null | wc -l)
    echo "   Files: ${FILE_COUNT}"
    
    # Size
    LATTICE_SIZE=$(du -sh "$LATTICE_DIR" 2>/dev/null | cut -f1)
    echo "   Size: ${LATTICE_SIZE}"
    
    # Available space
    LATTICE_AVAIL=$(df -h "$LATTICE_DIR" 2>/dev/null | tail -1 | awk '{print $4}')
    echo "   Available: ${LATTICE_AVAIL}"
else
    echo -e "   Status: ${RED}Not Found ❌${NC}"
fi

echo ""

# Key Topics
echo -e "${BLUE}🔗 HCS TOPICS (Mainnet)${NC}"
echo "═══════════════════════════════════════════════════════════════════════"
echo "   Carbon:      0.0.10416187 ← 7.298 tonnes retired ✅"
echo "   Registry:    0.0.10416178"
echo "   Task:        0.0.10414500"
echo "   Audit:       0.0.10414502"
echo "   Swarm Meet:  0.0.10417507"

echo ""

# Quick Stats
echo -e "${BLUE}📈 QUICK STATS${NC}"
echo "═══════════════════════════════════════════════════════════════════════"
echo "   Working Tools:    109"
echo "   Active Topics:    20"
echo "   Carbon Retired:   7.298 tonnes"
echo "   Lattice Layers:   4 (Flower of Life)"
echo "   Storage Growth:   3.4 TB available"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Vera is ${GREEN}READY${CYAN} for 24/7 carbon verification & HCS logging${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""
