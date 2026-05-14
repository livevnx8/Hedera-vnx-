#!/bin/bash
# Vera Multi-Agent Launcher
# Runs all 4 specialized agents simultaneously

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  🤖 VERA MULTI-AGENT SWARM LAUNCHER                                 ║"
echo "║  Starting all 4 specialized agents...                               ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Network: Hedera Mainnet"
echo "📡 HCS Topics:"
echo "   • Core (0.0.10409351) - Security Guardian"
echo "   • DeFi (0.0.10409352) - DeFi Analyst"
echo "   • Carbon (0.0.10409353) - Energy Auditor + Carbon Validator"
echo "   • Bridge (0.0.10409354) - Cross-agent collaboration"
echo ""
echo "Press Ctrl+C to stop all agents"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Create logs directory
mkdir -p logs

# Launch DeFi Analyst Agent (2 min cycles)
echo "💰 Launching DeFi Analyst Agent..."
node vera-defi-analyst.mjs > logs/defi-analyst.log 2>&1 &
DEFI_PID=$!
echo "   PID: $DEFI_PID"

# Launch Energy Auditor Agent (3 min cycles)
echo "⚡ Launching Energy Auditor Agent..."
node vera-energy-auditor.mjs > logs/energy-auditor.log 2>&1 &
ENERGY_PID=$!
echo "   PID: $ENERGY_PID"

# Launch Security Guardian Agent (90 sec cycles)
echo "🛡️  Launching Security Guardian Agent..."
node vera-security-guardian.mjs > logs/security-guardian.log 2>&1 &
SECURITY_PID=$!
echo "   PID: $SECURITY_PID"

# Launch Carbon Validator Agent (4 min cycles)
echo "🌱 Launching Carbon Validator Agent..."
node vera-carbon-validator.mjs > logs/carbon-validator.log 2>&1 &
CARBON_PID=$!
echo "   PID: $CARBON_PID"

echo ""
echo "✅ All agents launched!"
echo ""
echo "📊 Live Logs:"
echo "   tail -f logs/defi-analyst.log"
echo "   tail -f logs/energy-auditor.log"
echo "   tail -f logs/security-guardian.log"
echo "   tail -f logs/carbon-validator.log"
echo ""
echo "🔗 HashScan: https://hashscan.io/mainnet/topic/0.0.10409351"
echo ""

# Save PIDs for cleanup
echo $DEFI_PID > logs/agent.pids
echo $ENERGY_PID >> logs/agent.pids
echo $SECURITY_PID >> logs/agent.pids
echo $CARBON_PID >> logs/agent.pids

# Wait for all agents
wait
