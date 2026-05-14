#!/bin/bash
# Stop all Vera v2.0 Agents

cd "$(dirname "$0")"

LOG_DIR="./logs"

echo "🛑 Stopping Vera Agent Swarm v2.0..."
echo ""

# Function to stop agent
stop_agent() {
    local agent_name=$1
    local pid_file="$LOG_DIR/${agent_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "   🛑 Stopping $agent_name (PID: $pid)..."
            kill -SIGINT "$pid"
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo "      Force killing $agent_name..."
                kill -9 "$pid" 2>/dev/null
            fi
            
            rm "$pid_file"
            echo "      ✅ $agent_name stopped"
        else
            echo "   ⚠️  $agent_name not running (stale PID file)"
            rm "$pid_file"
        fi
    else
        echo "   ⚠️  $agent_name PID file not found"
    fi
}

# Stop all agents
stop_agent "defi-analyst"
stop_agent "energy-auditor"
stop_agent "security-guardian"
stop_agent "carbon-validator"

echo ""
echo "✅ All agents stopped!"
echo ""
echo "📁 Logs preserved in: $LOG_DIR/"
