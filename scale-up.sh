#!/bin/bash
#
# VeraLattice Horizontal Scaling Quick Start
# Launches 3-node clustered deployment with Redis and nginx load balancer
#

set -e

echo "🚀 VeraLattice Horizontal Scaling Launcher"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo -e "${BLUE}📦 Step 1: Stopping any existing containers...${NC}"
docker-compose -f docker-compose.scaling.yml down 2>/dev/null || true
sleep 2

echo -e "${BLUE}🗄️  Step 2: Ensuring volumes exist...${NC}"
docker volume create vera_data 2>/dev/null || true
docker volume create vera_logs 2>/dev/null || true
docker volume create redis_data 2>/dev/null || true
docker volume create qvx_cache 2>/dev/null || true

echo -e "${BLUE}🔧 Step 3: Building images...${NC}"
docker-compose -f docker-compose.scaling.yml build --parallel

echo -e "${BLUE}🚀 Step 4: Starting scaled infrastructure...${NC}"
docker-compose -f docker-compose.scaling.yml up -d

echo ""
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Health checks
echo -e "${BLUE}🏥 Step 5: Health checks...${NC}"

# Check Redis
if docker-compose -f docker-compose.scaling.yml exec -T redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✅ Redis: Connected${NC}"
else
    echo -e "❌ Redis: Not responding"
fi

# Check each Vera instance
for i in 1 2 3; do
    if curl -s http://localhost:808$i/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Vera Instance $i: Running on port 808$i${NC}"
    else
        echo -e "⏳ Vera Instance $i: Still starting..."
    fi
done

# Check load balancer
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    INSTANCE=$(curl -s http://localhost:8080/health | grep -o '"instance":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Load Balancer: Active (serving from $INSTANCE)${NC}"
else
    echo -e "⏳ Load Balancer: Still starting..."
fi

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 VeraLattice Scaling Infrastructure Active!${NC}"
echo "=========================================="
echo ""
echo "📊 Access Points:"
echo "   • Load Balancer (HTTP):  http://localhost:8080"
echo "   • Vera Instance 1:      http://localhost:8081"
echo "   • Vera Instance 2:      http://localhost:8082"
echo "   • Vera Instance 3:      http://localhost:8083"
echo "   • Redis:                localhost:6379"
echo "   • Prometheus:           http://localhost:9090"
echo "   • Grafana:              http://localhost:3000"
echo ""
echo "🔧 Management Commands:"
echo "   • View logs:    docker-compose -f docker-compose.scaling.yml logs -f"
echo "   • Scale down:   docker-compose -f docker-compose.scaling.yml stop"
echo "   • Scale up:     docker-compose -f docker-compose.scaling.yml up -d"
echo "   • Full stop:    docker-compose -f docker-compose.scaling.yml down"
echo ""
echo "📈 Load Balancer Algorithm: least_conn (sends to instance with fewest active connections)"
echo "🔗 Shared State: Redis (1GB memory, allkeys-lru eviction)"
echo ""

# Test load distribution
echo -e "${BLUE}🧪 Testing load distribution across instances...${NC}"
for i in {1..6}; do
    RESPONSE=$(curl -s http://localhost:8080/health 2>/dev/null | grep -o '"instance":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    echo "   Request $i: Handled by $RESPONSE"
done

echo ""
echo -e "${GREEN}✨ Scaling complete! VeraLattice is now handling traffic across 3 nodes.${NC}"
