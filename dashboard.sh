#!/bin/bash
# Vera Agent Metrics Dashboard
# Real-time stats from all v2 agents

cd "$(dirname "$0")"

LOG_DIR="./logs"

show_dashboard() {
  clear
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║  📊 VERA AGENT METRICS DASHBOARD          $(date '+%H:%M:%S')          ║"
  echo "║  Phase 2: AgentBase + Queue-based HCS                              ║"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo
  
  # Function to extract stats from logs
  get_stat() {
    local log_file=$1
    local pattern=$2
    grep -o "$pattern" "$LOG_FILE/$log_file" 2>/dev/null | wc -l
  }
  
  # DEFI Analyst
  echo "┌─ 📈 DeFi Analyst"
  if [ -f "$LOG_DIR/defi-analyst.log" ]; then
    CYCLES=$(grep -c "CYCLE #" "$LOG_DIR/defi-analyst.log" 2>/dev/null || echo 0)
    ARB=$(grep -c "Arbitrage" "$LOG_DIR/defi-analyst.log" 2>/dev/null || echo 0)
    WHALE=$(grep -c "Whale" "$LOG_DIR/defi-analyst.log" 2>/dev/null || echo 0)
    ERRORS=$(grep -cE "❌|Error" "$LOG_DIR/defi-analyst.log" 2>/dev/null || echo 0)
    STATUS=$(ps aux | grep "defi-analyst-v2" | grep -v grep > /dev/null && echo "🟢 RUNNING" || echo "🔴 STOPPED")
    echo "│  Status: $STATUS | Cycles: $CYCLES | Arbitrage: $ARB | Whale: $WHALE | Errors: $ERRORS"
  else
    echo "│  ⚠️  No log file"
  fi
  echo "└─"
  echo
  
  # Energy Auditor  
  echo "┌─ ⚡ Energy Auditor"
  if [ -f "$LOG_DIR/energy-auditor.log" ]; then
    CYCLES=$(grep -c "CYCLE #" "$LOG_DIR/energy-auditor.log" 2>/dev/null || echo 0)
    READINGS=$(grep -c "MW" "$LOG_DIR/energy-auditor.log" 2>/dev/null || echo 0)
    PRED=$(grep -c "Prediction" "$LOG_DIR/energy-auditor.log" 2>/dev/null || echo 0)
    ANOM=$(grep -c "Anomaly" "$LOG_DIR/energy-auditor.log" 2>/dev/null || echo 0)
    STATUS=$(ps aux | grep "energy-auditor-v2" | grep -v grep > /dev/null && echo "🟢 RUNNING" || echo "🔴 STOPPED")
    echo "│  Status: $STATUS | Cycles: $CYCLES | Readings: $READINGS | Predictions: $PRED | Anomalies: $ANOM"
  else
    echo "│  ⚠️  No log file"
  fi
  echo "└─"
  echo
  
  # Security Guardian
  echo "┌─ 🔒 Security Guardian"
  if [ -f "$LOG_DIR/security-guardian.log" ]; then
    CYCLES=$(grep -c "CYCLE #" "$LOG_DIR/security-guardian.log" 2>/dev/null || echo 0)
    SCANS=$(grep -c "Scanning" "$LOG_DIR/security-guardian.log" 2>/dev/null || echo 0)
    THREATS=$(grep -c "THREAT" "$LOG_DIR/security-guardian.log" 2>/dev/null || echo 0)
    STATUS=$(ps aux | grep "security-guardian-v2" | grep -v grep > /dev/null && echo "🟢 RUNNING" || echo "🔴 STOPPED")
    echo "│  Status: $STATUS | Cycles: $CYCLES | Contracts: $SCANS | Threats: $THREATS"
  else
    echo "│  ⚠️  No log file"
  fi
  echo "└─"
  echo
  
  # Carbon Validator
  echo "┌─ 🌱 Carbon Validator"
  if [ -f "$LOG_DIR/carbon-validator.log" ]; then
    CYCLES=$(grep -c "CYCLE #" "$LOG_DIR/carbon-validator.log" 2>/dev/null || echo 0)
    CREDITS=$(grep -c "tons" "$LOG_DIR/carbon-validator.log" 2>/dev/null || echo 0)
    STATUS=$(ps aux | grep "carbon-validator-v2" | grep -v grep > /dev/null && echo "🟢 RUNNING" || echo "🔴 STOPPED")
    echo "│  Status: $STATUS | Cycles: $CYCLES | Credits: $CREDITS"
  else
    echo "│  ⚠️  No log file"
  fi
  echo "└─"
  echo
  
  # Summary
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  TOTAL_CYCLES=$(grep -h "CYCLE #" $LOG_DIR/*.log 2>/dev/null | wc -l)
  echo "📈 Total Cycles: $TOTAL_CYCLES | Press Ctrl+C to exit"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main loop
while true; do
  show_dashboard
  sleep 3
done
