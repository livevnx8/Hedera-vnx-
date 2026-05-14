#!/bin/bash
#
# Stop Vera FedEx Supply Chain Agents
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping Vera FedEx Supply Chain Agents...${NC}"
echo ""

# Function to stop an agent
stop_agent() {
    local agent_name=$1
    local agent_file=$2
    
    local pids=$(pgrep -f "${agent_file}" || true)
    
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}  Stopping ${agent_name}...${NC}"
        for pid in $pids; do
            kill $pid 2>/dev/null || true
            echo -e "    ✓ Process ${pid} stopped"
        done
    else
        echo -e "${GREEN}  ${agent_name} not running${NC}"
    fi
}

stop_agent "Supply Chain Agent" "vera-fedex-supply-agent.mjs"
stop_agent "Route Optimization Agent" "vera-fedex-route-agent.mjs"
stop_agent "Compliance Agent" "vera-fedex-compliance-agent.mjs"

echo ""
echo -e "${GREEN}✓ All FedEx agents stopped${NC}"
