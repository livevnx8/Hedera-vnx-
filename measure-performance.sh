#!/bin/bash
# Vera Performance Measurement Script
# Measures before/after optimization metrics

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

OUTPUT_FILE="/mnt/vera-mirror-shards/vera-lattice/performance-metrics-$(date +%Y%m%d-%H%M%S).json"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  📊 VERA PERFORMANCE MEASUREMENT                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Initialize results
declare -A RESULTS

# 1. API Response Time
echo -e "${BLUE}1. Measuring API Response Time...${NC}"
RESPONSE_TIMES=()
for i in {1..10}; do
    START=$(date +%s%N)
    curl -s http://localhost:8088/health > /dev/null 2>&1
    END=$(date +%s%N)
    TIME=$(( (END - START) / 1000000 )) # Convert to ms
    RESPONSE_TIMES+=($TIME)
    echo "   Request $i: ${TIME}ms"
done

# Calculate average
TOTAL=0
for t in "${RESPONSE_TIMES[@]}"; do
    TOTAL=$((TOTAL + t))
done
AVG=$((TOTAL / 10))
MIN=${RESPONSE_TIMES[0]}
MAX=${RESPONSE_TIMES[0]}
for t in "${RESPONSE_TIMES[@]}"; do
    (( t < MIN )) && MIN=$t
    (( t > MAX )) && MAX=$t
done

RESULTS[api_avg]=${AVG}
RESULTS[api_min]=${MIN}
RESULTS[api_max]=${MAX}
echo -e "   ${GREEN}✅ Average: ${AVG}ms (Min: ${MIN}ms, Max: ${MAX}ms)${NC}"
echo ""

# 2. Response Size
echo -e "${BLUE}2. Measuring Response Size...${NC}"
RESPONSE_SIZE=$(curl -s http://localhost:8088/health | wc -c)
RESULTS[response_size]=${RESPONSE_SIZE}
echo -e "   ${GREEN}✅ Health endpoint: ${RESPONSE_SIZE} bytes${NC}"
echo ""

# 3. Memory Usage
echo -e "${BLUE}3. Measuring Memory Usage...${NC}"
VERA_PID=$(pgrep -f "tsx.*index" | head -1)
if [ -n "$VERA_PID" ]; then
    MEMORY_KB=$(ps -p $VERA_PID -o rss= 2>/dev/null | tr -d ' ')
    MEMORY_MB=$((MEMORY_KB / 1024))
    RESULTS[memory_mb]=${MEMORY_MB}
    RESULTS[vera_pid]=${VERA_PID}
    echo -e "   ${GREEN}✅ Vera PID ${VERA_PID}: ${MEMORY_MB} MB${NC}"
else
    echo -e "   ${YELLOW}⚠️ Vera process not found${NC}"
    RESULTS[memory_mb]=0
fi
echo ""

# 4. Disk Space
echo -e "${BLUE}4. Checking Disk Space...${NC}"
DISK_AVAIL=$(df / | tail -1 | awk '{print $4}')
DISK_AVAIL_GB=$((DISK_AVAIL / 1024 / 1024))
RESULTS[disk_avail_gb]=${DISK_AVAIL_GB}
echo -e "   ${GREEN}✅ Available: ${DISK_AVAIL_GB} GB${NC}"
echo ""

# 5. Redis Status
echo -e "${BLUE}5. Checking Redis...${NC}"
REDIS_PING=$(redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
    REDIS_INFO=$(redis-cli info stats 2>/dev/null | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
    RESULTS[redis_status]="active"
    RESULTS[redis_hits]=${REDIS_INFO:-0}
    echo -e "   ${GREEN}✅ Redis: ACTIVE${NC}"
else
    RESULTS[redis_status]="inactive"
    echo -e "   ${YELLOW}⚠️ Redis: INACTIVE${NC}"
fi
echo ""

# 6. System Load
echo -e "${BLUE}6. Measuring System Load...${NC}"
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
RESULTS[load_avg]=${LOAD_AVG}
echo -e "   ${GREEN}✅ Load average: ${LOAD_AVG}${NC}"
echo ""

# 7. Network Latency
echo -e "${BLUE}7. Measuring Network Latency...${NC}"
PING_AVG=$(ping -c 3 localhost 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
if [ -n "$PING_AVG" ]; then
    RESULTS[ping_ms]=${PING_AVG}
    echo -e "   ${GREEN}✅ Localhost: ${PING_AVG}ms${NC}"
else
    RESULTS[ping_ms]=0
    echo -e "   ${YELLOW}⚠️ Ping test failed${NC}"
fi
echo ""

# Save results to JSON
cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "api_response_ms": {
    "average": ${RESULTS[api_avg]},
    "min": ${RESULTS[api_min]},
    "max": ${RESULTS[api_max]}
  },
  "response_size_bytes": ${RESULTS[response_size]},
  "memory_usage_mb": ${RESULTS[memory_mb]},
  "vera_pid": ${RESULTS[vera_pid]:-0},
  "disk_avail_gb": ${RESULTS[disk_avail_gb]},
  "redis_status": "${RESULTS[redis_status]}",
  "system_load": "${RESULTS[load_avg]}",
  "network_latency_ms": ${RESULTS[ping_ms]}
}
EOF

# Display summary
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  📊 MEASUREMENT SUMMARY                                         ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "API Response:     ${RESULTS[api_avg]}ms (avg)"
echo "Response Size:    ${RESULTS[response_size]} bytes"
echo "Memory Usage:     ${RESULTS[memory_mb]} MB"
echo "Disk Available:   ${RESULTS[disk_avail_gb]} GB"
echo "Redis Status:     ${RESULTS[redis_status]}"
echo "System Load:      ${RESULTS[load_avg]}"
echo "Network Latency:  ${RESULTS[ping_ms]}ms"
echo ""
echo -e "${GREEN}✅ Results saved to: ${OUTPUT_FILE}${NC}"
echo ""

# Compare with previous if exists
LATEST=$(ls -t /mnt/vera-mirror-shards/vera-lattice/performance-metrics-*.json 2>/dev/null | head -2 | tail -1)
if [ -n "$LATEST" ] && [ "$LATEST" != "$OUTPUT_FILE" ]; then
    echo -e "${BLUE}📈 Comparison with previous:${NC}"
    echo "   Previous: $LATEST"
    echo "   Current:  $OUTPUT_FILE"
fi
