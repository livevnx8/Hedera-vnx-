#!/bin/bash
#
# Vera Unified Swarm Launcher - ALL AGENTS LIVE
# Launches all FedEx + McLaren swarm processors with real data
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     VERA UNIFIED SWARM LAUNCHER - LIVE MODE                ║${NC}"
echo -e "${BLUE}║     FedEx + McLaren + Core Agents - All Topics Active      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

# Source .env
export $(grep -v '^#' .env | xargs 2>/dev/null || true)

# Function to start a swarm
start_swarm() {
    local name=$1
    local file=$2
    local log=$3
    local color=$4
    
    echo -e "${color}🚀 ${name}${NC}"
    
    if pgrep -f "${file}" > /dev/null 2>&1; then
        echo -e "${YELLOW}   Already running${NC}"
        return 0
    fi
    
    nohup node "${file}" > "${log}" 2>&1 &
    local pid=$!
    sleep 3
    
    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Started (PID: ${pid})${NC}"
        return 0
    else
        echo -e "${RED}   ✗ Failed${NC}"
        return 1
    fi
}

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  🏎️  McLaren F1 Carbon Swarms${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_swarm "Carbon Auditor Swarm"     "mclaren-swarm-auditor.mjs"      "logs/mclaren-carbon-swarm.log" "$CYAN"
start_swarm "Season Summary Swarm"     "mclaren-season-summary.mjs"   "logs/mclaren-season-swarm.log" "$CYAN"
start_swarm "Offset Retirement Swarm"  "mclaren-offset-retirement.mjs" "logs/mclaren-offset-swarm.log" "$CYAN"
start_swarm "Scenario Simulator"       "mclaren-scenario-simulator.mjs" "logs/mclaren-scenario-swarm.log" "$CYAN"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🚚 FedEx Supply Chain Swarms${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_swarm "Route Optimization"       "fedex-route-swarm.mjs"          "logs/fedex-route-swarm.log" "$GREEN"
start_swarm "Package Tracking"       "fedex-package-swarm.mjs"        "logs/fedex-package-swarm.log" "$GREEN"
start_swarm "Supply Chain Verify"    "fedex-supply-chain-swarm.mjs"   "logs/fedex-supply-swarm.log" "$GREEN"
start_swarm "Compliance Audit"       "fedex-compliance-swarm.mjs"     "logs/fedex-compliance-swarm.log" "$GREEN"

echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  ⚡ Core Vera Agents${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_swarm "Energy Auditor"         "agents/vera-energy-auditor-v2.mjs"     "logs/energy-auditor.log" "$MAGENTA"
start_swarm "Security Guardian"      "agents/vera-security-guardian-v2.mjs" "logs/security-guardian.log" "$MAGENTA"
start_swarm "DeFi Analyst"           "agents/vera-defi-analyst-v2.mjs"     "logs/defi-analyst.log" "$MAGENTA"
start_swarm "Carbon Validator"       "agents/vera-carbon-validator-v2.mjs" "logs/carbon-validator.log" "$MAGENTA"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  🚚 FedEx Live Agents${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_swarm "FedEx Supply Chain"      "agents/vera-fedex-supply-agent.mjs"    "logs/fedex-supply.log" "$YELLOW"
start_swarm "FedEx Route Optim"       "agents/vera-fedex-route-agent.mjs"   "logs/fedex-route.log" "$YELLOW"
start_swarm "FedEx Compliance"        "agents/vera-fedex-compliance-agent.mjs" "logs/fedex-compliance.log" "$YELLOW"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ ALL VERA SWARMS LAUNCHED!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${WHITE}Active HCS Topics:${NC}"
echo "  🏎️  McLaren: 0.0.10414316-0.0.10414318"
echo "  🚚 FedEx:   0.0.10414355-0.0.10414362"
echo "  ⚡ Core:    0.0.10412577-0.0.10412579, 0.0.10409351"
echo ""
echo -e "${WHITE}Dashboards:${NC}"
echo "  • v3 Command Center: http://localhost:8080/dashboard-v3.html"
echo "  • FedEx Dashboard:   http://localhost:8080/fedex-vera-dashboard.html"
echo ""
echo -e "${WHITE}Monitor All Logs:${NC}"
echo "  tail -f logs/*-swarm.log logs/*-auditor.log logs/*-guardian.log logs/*-analyst.log logs/fedex-*.log"
echo ""
echo -e "${WHITE}API Status:${NC}"
echo "  curl http://localhost:8080/agents"
echo ""
echo -e "${WHITE}Stop All:${NC} pkill -f 'vera-\|mclaren\|fedex-swarm\|mclaren-swarm'"
echo ""
