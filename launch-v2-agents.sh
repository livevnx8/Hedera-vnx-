#!/bin/bash
# Launch all Vera v2.0 Agents
# Phase 2 Implementation - AgentBase Refactored Agents

cd "$(dirname "$0")"

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🚀 VERA AGENT SWARM v2.0 LAUNCHER                                  ║"
echo "║  Phase 2: AgentBase + Queue-based HCS                              ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📁 Log directory: $LOG_DIR"
echo ""

# Function to start agent
start_agent() {
    local agent_file=$1
    local agent_name=$2
    local log_file="$LOG_DIR/${agent_name}.log"
    
    echo "🚀 Starting $agent_name..."
    node "$agent_file" > "$log_file" 2>&1 &
    local pid=$!
    echo "   PID: $pid | Log: $log_file"
    echo $pid > "$LOG_DIR/${agent_name}.pid"
}

# Start all agents
echo "📡 Starting 4 specialized agents..."
echo ""

start_agent "./agents/vera-defi-analyst-v2.mjs" "defi-analyst"
sleep 2

start_agent "./agents/vera-energy-auditor-v2.mjs" "energy-auditor"
sleep 2

start_agent "./agents/vera-security-guardian-v2.mjs" "security-guardian"
sleep 2

start_agent "./agents/vera-carbon-validator-v2.mjs" "carbon-validator"

echo ""
echo "✅ All agents launched!"
echo ""
echo "📊 Monitor logs:"
echo "   tail -f $LOG_DIR/defi-analyst.log"
echo "   tail -f $LOG_DIR/energy-auditor.log"
echo "   tail -f $LOG_DIR/security-guardian.log"
echo "   tail -f $LOG_DIR/carbon-validator.log"
echo ""
echo "🛑 Stop all: ./agents/stop-agents.sh"
echo ""

# Show PIDs
echo "📋 Running agents:"
ps aux | grep "vera-.*-v2.mjs" | grep -v grep | awk '{print "   PID: " $2 " - " $11}'
