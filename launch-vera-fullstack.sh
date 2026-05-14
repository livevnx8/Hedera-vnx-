#!/bin/bash
#
# Vera Full Stack Launcher
# Starts all Vera capabilities: API server, x402 marketplace, and monitoring
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VERA_DIR="/home/vera-live-0-1/hedera-llm-api"
API_PORT=8080
X402_PORT=8082
LOG_DIR="$VERA_DIR/logs"
PID_DIR="$VERA_DIR/pids"

# Create necessary directories
mkdir -p "$LOG_DIR" "$PID_DIR"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup() {
    log_info "Shutting down Vera services..."
    
    # Kill main API server
    if [ -f "$PID_DIR/api.pid" ]; then
        kill -TERM "$(cat "$PID_DIR/api.pid")" 2>/dev/null || true
        rm -f "$PID_DIR/api.pid"
    fi
    
    # Kill x402 marketplace
    if [ -f "$PID_DIR/x402.pid" ]; then
        kill -TERM "$(cat "$PID_DIR/x402.pid")" 2>/dev/null || true
        rm -f "$PID_DIR/x402.pid"
    fi
    
    # Kill any remaining node processes on Vera ports
    lsof -ti:$API_PORT | xargs kill -9 2>/dev/null || true
    lsof -ti:$X402_PORT | xargs kill -9 2>/dev/null || true
    
    log_success "All Vera services stopped"
    exit 0
}

# Set trap for cleanup
trap cleanup SIGINT SIGTERM EXIT

# Health check function
check_health() {
    local port=$1
    local name=$2
    local retries=30
    local wait=2
    
    log_info "Waiting for $name on port $port..."
    
    for i in $(seq 1 $retries); do
        if curl -s "http://localhost:$port/api/vera/health" >/dev/null 2>&1 || \
           curl -s "http://localhost:$port/health" >/dev/null 2>&1; then
            log_success "$name is healthy on port $port"
            return 0
        fi
        sleep $wait
    done
    
    log_error "$name failed to start on port $port"
    return 1
}

# Start main Vera API server
start_api_server() {
    log_info "Starting Vera API Server on port $API_PORT..."
    
    cd "$VERA_DIR"
    
    # Ensure port is free
    lsof -ti:$API_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
    
    # Start the server
    nohup node dist/index.js > "$LOG_DIR/vera-api.log" 2>&1 &
    echo $! > "$PID_DIR/api.pid"
    
    # Wait for health check
    if check_health $API_PORT "Vera API Server"; then
        log_success "Vera API Server started (PID: $(cat "$PID_DIR/api.pid"))"
        log_info "API Logs: tail -f $LOG_DIR/vera-api.log"
        return 0
    else
        log_error "Failed to start Vera API Server"
        return 1
    fi
}

# Start x402 marketplace
start_x402_marketplace() {
    log_info "Starting Vera x402 Marketplace on port $X402_PORT..."
    
    cd "$VERA_DIR"
    
    # Ensure port is free
    lsof -ti:$X402_PORT | xargs kill -9 2>/dev/null || true
    sleep 1
    
    # Start x402 marketplace in background
    nohup node vera-marketplace-x402.mjs > "$LOG_DIR/vera-x402.log" 2>&1 &
    echo $! > "$PID_DIR/x402.pid"
    
    # Give it time to initialize
    sleep 5
    
    # Check if process is running
    if kill -0 "$(cat "$PID_DIR/x402.pid")" 2>/dev/null; then
        log_success "Vera x402 Marketplace started (PID: $(cat "$PID_DIR/x402.pid"))"
        log_info "x402 Logs: tail -f $LOG_DIR/vera-x402.log"
        return 0
    else
        log_warn "x402 Marketplace may have exited (check logs)"
        return 1
    fi
}

# Display status
display_status() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║                    🚀 VERA FULL STACK ACTIVE                       ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📊 Services:"
    echo "   • API Server:     http://localhost:$API_PORT"
    echo "   • x402 Marketplace: http://localhost:$X402_PORT"
    echo ""
    echo "🔧 API Endpoints:"
    echo "   GET  /api/vera/health      - Health check"
    echo "   GET  /api/vera/stats       - Orchestrator stats"
    echo "   GET  /api/vera/agents      - Registered agents"
    echo "   POST /api/vera/agents      - Register new agent"
    echo "   GET  /api/vera/tasks       - List tasks"
    echo "   POST /api/vera/tasks       - Submit new task"
    echo "   GET  /api/vera/reputation  - Agent reputation"
    echo "   GET  /api/vera/pricing     - Dynamic pricing"
    echo ""
    echo "💰 x402 Endpoints:"
    echo "   POST /x402/pay           - Submit x402 payment"
    echo "   GET  /tasks              - List tasks"
    echo "   GET  /streams            - Active payment streams"
    echo "   GET  /metrics            - Real-time metrics"
    echo ""
    echo "📜 Logs:"
    echo "   API:    tail -f $LOG_DIR/vera-api.log"
    echo "   x402:   tail -f $LOG_DIR/vera-x402.log"
    echo ""
    echo "🛑 To stop: Press Ctrl+C or run: killall -9 node"
    echo ""
}

# Quick test
run_quick_test() {
    log_info "Running quick health tests..."
    
    # Test API health
    API_HEALTH=$(curl -s "http://localhost:$API_PORT/api/vera/health" 2>/dev/null || echo '{"status":"error"}')
    echo "   API Health: $API_HEALTH"
    
    # Test API stats
    API_STATS=$(curl -s "http://localhost:$API_PORT/api/vera/stats" 2>/dev/null || echo '{"error":"failed"}')
    echo "   API Stats: $(echo $API_STATS | jq -c . 2>/dev/null || echo 'raw output')"
    
    log_success "Quick tests completed"
}

# Main execution
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║           🧠 VERA ORCHESTRATOR - FULL STACK LAUNCHER               ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
    
    cd "$VERA_DIR"
    
    # Check if dist exists
    if [ ! -d "$VERA_DIR/dist" ]; then
        log_error "Build output not found. Run: npm run build"
        exit 1
    fi
    
    # Start services
    start_api_server
    start_x402_marketplace
    
    # Display status
    display_status
    
    # Run quick test
    sleep 2
    run_quick_test
    
    # Keep script running
    log_info "All services running. Press Ctrl+C to stop."
    while true; do
        sleep 10
        # Monitor processes
        if ! kill -0 "$(cat "$PID_DIR/api.pid" 2>/dev/null)" 2>/dev/null; then
            log_warn "API server stopped unexpectedly, restarting..."
            start_api_server
        fi
    done
}

# Run main
main "$@"
