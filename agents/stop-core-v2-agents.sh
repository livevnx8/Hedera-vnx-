#!/bin/bash
#
# Stop all Vera Core V2 Agents
#

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping Vera Core V2 Agents...${NC}"

AGENTS=(
    "vera-energy-auditor-v2.mjs:Energy Auditor"
    "vera-defi-analyst-v2.mjs:DeFi Analyst"
    "vera-security-guardian-v2.mjs:Security Guardian"
    "vera-carbon-validator-v2.mjs:Carbon Validator"
)

for agent in "${AGENTS[@]}"; do
    IFS=':' read -r file name <<< "$agent"
    pid=$(pgrep -f "$file" || true)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}Stopping ${name} (PID: ${pid})...${NC}"
        kill $pid 2>/dev/null || true
        sleep 1
        if ps -p $pid > /dev/null 2>&1; then
            kill -9 $pid 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ ${name} stopped${NC}"
    else
        echo -e "${YELLOW}   ${name} not running${NC}"
    fi
done

echo ""
echo -e "${GREEN}All Core V2 agents stopped.${NC}"
