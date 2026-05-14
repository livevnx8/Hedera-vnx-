#!/bin/bash
#
# Vera Unified Agent Launcher - ALL AGENTS
# Launches ALL agents with live HCS logging
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
echo -e "${BLUE}║     VERA UNIFIED AGENT LAUNCHER - LIVE HCS MODE            ║${NC}"
echo -e "${BLUE}║     FedEx + WV Energy + Security + DeFi + Carbon           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

# Source .env for topic IDs
export $(grep -v '^#' .env | xargs 2>/dev/null || true)

# Function to start an agent
start_agent() {
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
    sleep 2
    
    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Started (PID: ${pid})${NC}"
        return 0
    else
        echo -e "${RED}   ✗ Failed${NC}"
        return 1
    fi
}

# McLaren agents temporarily disabled - dist/mclaren/ files need rebuilding
# echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# echo -e "${CYAN}  🏎️  McLaren F1 Carbon Agents${NC}"
# echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# start_agent "Race Carbon Auditor"   "dist/mclaren/raceCarbonAuditor.js"   "logs/mclaren-carbon.log"   "$CYAN"
# start_agent "Real-Time Validator"   "dist/mclaren/realTimeValidator.js"   "logs/mclaren-validator.log" "$CYAN"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🚚 FedEx Supply Chain Agents${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_agent "Supply Chain Agent"    "agents/vera-fedex-supply-agent.mjs"    "logs/fedex-supply.log"     "$GREEN"
start_agent "Route Optimization"    "agents/vera-fedex-route-agent.mjs"     "logs/fedex-route.log"      "$GREEN"
start_agent "Compliance Agent"      "agents/vera-fedex-compliance-agent.mjs"  "logs/fedex-compliance.log" "$GREEN"

echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}  ⚡ WV Energy Auditor${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_agent "Energy Auditor v2"     "agents/vera-energy-auditor-v2.mjs"     "logs/energy-auditor.log"   "$MAGENTA"

echo ""
echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${WHITE}  🛡️  Security Guardian${NC}"
echo -e "${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_agent "Security Guardian v2"  "agents/vera-security-guardian-v2.mjs"  "logs/security-guardian.log" "$WHITE"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  🔷 DeFi Analyst${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_agent "DeFi Analyst v2"       "agents/vera-defi-analyst-v2.mjs"       "logs/defi-analyst.log"     "$YELLOW"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🌱 Carbon Validator${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
start_agent "Carbon Validator v2"   "agents/vera-carbon-validator-v2.mjs"   "logs/carbon-validator.log" "$BLUE"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ ALL VERA AGENTS LAUNCHED!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${WHITE}Active HCS Topics:${NC}"
echo "  • FedEx:   0.0.10414355-0.0.10414362"
echo ""
echo -e "${WHITE}Dashboards:${NC}"
echo "  • Main:    http://localhost:8080/dashboard.html"
echo "  • FedEx:   http://localhost:8080/fedex-vera-dashboard.html"
echo ""
echo -e "${WHITE}Monitor Logs:${NC}"
echo "  tail -f logs/fedex-*.log logs/*-auditor.log logs/*-guardian.log logs/*-analyst.log logs/*-validator.log"
echo ""
echo -e "${WHITE}Stop All:${NC} pkill -f 'vera-\\|mclaren'"
