#!/bin/bash
# Vera Performance Optimization Script
# Implements Phase 3 of the rig optimization plan

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🚀 Vera Performance Optimization${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check current performance baseline
echo -e "${BLUE}📊 Current System Status:${NC}"
echo "   CPU cores: $(nproc)"
echo "   Memory: $(free -h | grep Mem | awk '{print $2}')"
echo ""

# Install Redis if not present
if ! command -v redis-cli &> /dev/null; then
    echo -e "${BLUE}📦 Installing Redis...${NC}"
    sudo apt-get update -qq
    sudo apt-get install -y -qq redis-server
    sudo systemctl enable redis
    sudo systemctl start redis
    echo -e "${GREEN}✅ Redis installed${NC}"
else
    echo -e "${GREEN}✅ Redis already installed${NC}"
fi

# Test Redis connection
echo -e "${BLUE}🧪 Testing Redis connection...${NC}"
if redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✅ Redis responding${NC}"
else
    echo -e "${YELLOW}⚠️  Redis not responding, will use memory cache${NC}"
fi

# Node.js optimization settings
echo -e "${BLUE}⚙️  Node.js Optimization Settings:${NC}"
export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
export UV_THREADPOOL_SIZE=128
echo "   NODE_OPTIONS: $NODE_OPTIONS"
echo "   UV_THREADPOOL_SIZE: $UV_THREADPOOL_SIZE"

# Performance mode for Linux
echo -e "${BLUE}🔧 Linux Performance Tuning:${NC}"
# Increase file descriptor limits
ulimit -n 65535 2>/dev/null || echo "   Note: Run with sudo for full optimization"

# Enable TCP optimizations (requires sudo)
if [ "$EUID" -eq 0 ]; then
    sysctl -w net.core.somaxconn=65535 2>/dev/null || true
    sysctl -w net.ipv4.tcp_max_syn_backlog=65535 2>/dev/null || true
    echo -e "${GREEN}✅ TCP optimizations applied${NC}"
else
    echo -e "${YELLOW}⚠️  Run with sudo for TCP optimizations${NC}"
fi

# Start performance monitor
echo -e "${BLUE}📈 Starting Performance Monitor...${NC}"
nohup node /home/vera-live-0-1/hedera-llm-api/performance-monitor.mjs > /mnt/vera-mirror-shards/vera-lattice/logs/perf-monitor.log 2>&1 &
echo "   PID: $!"
echo "   Log: /mnt/vera-mirror-shards/vera-lattice/logs/perf-monitor.log"

# Start metrics endpoint
echo -e "${BLUE}📊 Starting Metrics Endpoint...${NC}"
nohup node /home/vera-live-0-1/hedera-llm-api/metrics-endpoint.mjs > /mnt/vera-mirror-shards/vera-lattice/logs/metrics.log 2>&1 &
echo "   PID: $!"
echo "   Endpoint: http://localhost:9091/metrics"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Performance Optimization Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "   🎯 Next steps:"
echo "      1. Start cluster server: node cluster-server.mjs"
echo "      2. Setup monitoring: ./setup-monitoring.sh"
echo "      3. Check status: ./vera-status.sh"
echo ""
