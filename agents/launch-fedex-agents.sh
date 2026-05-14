#!/bin/bash
#
# Vera FedEx Supply Chain Launcher
# Launches all three FedEx agents with proper configuration
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        VERA FEDEX SUPPLY CHAIN AGENT LAUNCHER              ║${NC}"
echo -e "${BLUE}║              Hedera Consensus Service Powered                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "   Please copy .env.example to .env and configure your Hedera credentials"
    exit 1
fi

# Check if topics are configured
if [ -z "$FEDEX_ROUTE_TOPIC_ID" ]; then
    echo -e "${YELLOW}⚠️  FedEx HCS topics not configured${NC}"
    echo "   Run the topic creation script first:"
    echo "   node scripts/create-fedex-topics.mjs"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Function to start an agent
start_agent() {
    local agent_name=$1
    local agent_file=$2
    local log_file=$3
    
    echo -e "${GREEN}🚀 Starting ${agent_name}...${NC}"
    
    if pgrep -f "${agent_file}" > /dev/null; then
        echo -e "${YELLOW}   ${agent_name} is already running${NC}"
        return 0
    fi
    
    nohup node "${agent_file}" > "${log_file}" 2>&1 &
    local pid=$!
    
    # Wait a moment and check if process is still running
    sleep 2
    if ps -p $pid > /dev/null; then
        echo -e "${GREEN}   ✓ ${agent_name} started (PID: ${pid})${NC}"
        echo "   Log: ${log_file}"
        return 0
    else
        echo -e "${RED}   ✗ ${agent_name} failed to start${NC}"
        echo "   Check ${log_file} for errors"
        return 1
    fi
}

# Start agents
start_agent "Supply Chain Agent" "agents/vera-fedex-supply-agent.mjs" "logs/fedex-supply-agent.log"
start_agent "Route Optimization Agent" "agents/vera-fedex-route-agent.mjs" "logs/fedex-route-agent.log"
start_agent "Compliance Agent" "agents/vera-fedex-compliance-agent.mjs" "logs/fedex-compliance-agent.log"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}📊 All FedEx agents launched successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Dashboard: http://localhost:8080/fedex-vera-dashboard.html"
echo ""
echo "Agent Commands:"
echo "  Supply Chain:  tail -f logs/fedex-supply-agent.log"
echo "  Route Optim:   tail -f logs/fedex-route-agent.log"
echo "  Compliance:    tail -f logs/fedex-compliance-agent.log"
echo ""
echo "Stop all agents: ./agents/stop-fedex-agents.sh"
echo ""
