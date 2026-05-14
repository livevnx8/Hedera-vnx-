#!/bin/bash
#
# Vera Core V2 Agents Launcher
# Launches all 4 refactored AgentBase agents
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        VERA CORE V2 AGENTS LAUNCHER                        ║${NC}"
echo -e "${BLUE}║        AgentBase + Queue-Based HCS Logging                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create logs directory
mkdir -p logs

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "   Please copy .env.example to .env and configure your Hedera credentials"
    exit 1
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

# Start all 4 core V2 agents
start_agent "Energy Auditor" "agents/vera-energy-auditor-v2.mjs" "logs/energy-auditor-v2.log"
start_agent "DeFi Analyst" "agents/vera-defi-analyst-v2.mjs" "logs/defi-analyst-v2.log"
start_agent "Security Guardian" "agents/vera-security-guardian-v2.mjs" "logs/security-guardian-v2.log"
start_agent "Carbon Validator" "agents/vera-carbon-validator-v2.mjs" "logs/carbon-validator-v2.log"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}📊 All Core V2 agents launched successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Dashboard: http://localhost:8080/swarm"
echo ""
echo "Agent Logs:"
echo "  Energy Auditor:  tail -f logs/energy-auditor-v2.log"
echo "  DeFi Analyst:    tail -f logs/defi-analyst-v2.log"
echo "  Security:        tail -f logs/security-guardian-v2.log"
echo "  Carbon:          tail -f logs/carbon-validator-v2.log"
echo ""
echo "Stop all agents: ./agents/stop-core-v2-agents.sh"
echo ""
