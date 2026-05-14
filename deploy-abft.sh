#!/bin/bash
# Deploy ABFT Consensus to Production
# Usage: ./deploy-abft.sh

set -e

echo "🚀 Deploying Vera Lattice ABFT Consensus to Production"
echo "========================================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}ERROR: .env.production not found${NC}"
    exit 1
fi

# Build TypeScript
echo -e "\n${YELLOW}1. Building TypeScript...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}   ✓ Build successful${NC}"
else
    echo -e "${RED}   ✗ Build failed${NC}"
    exit 1
fi

# Copy .env.production to .env for production
echo -e "\n${YELLOW}2. Setting production environment...${NC}"
cp .env.production .env
echo -e "${GREEN}   ✓ Environment configured${NC}"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}   Installing PM2...${NC}"
    npm install -g pm2
fi

# Stop existing processes
echo -e "\n${YELLOW}3. Stopping existing services...${NC}"
pm2 stop vera-lattice-api 2>/dev/null || true
pm2 stop vera-abft-consensus 2>/dev/null || true
pm2 stop vera-hcs-gossip 2>/dev/null || true
pm2 delete vera-lattice-api 2>/dev/null || true
pm2 delete vera-abft-consensus 2>/dev/null || true
pm2 delete vera-hcs-gossip 2>/dev/null || true
echo -e "${GREEN}   ✓ Services stopped${NC}"

# Start services with PM2
echo -e "\n${YELLOW}4. Starting production services...${NC}"
pm2 start ecosystem.json
echo -e "${GREEN}   ✓ Services started${NC}"

# Save PM2 config
echo -e "\n${YELLOW}5. Saving PM2 configuration...${NC}"
pm2 save
echo -e "${GREEN}   ✓ Configuration saved${NC}"

# Setup PM2 startup script
echo -e "\n${YELLOW}6. Setting up PM2 startup...${NC}"
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
echo -e "${GREEN}   ✓ Startup configured${NC}"

# Wait for services to be ready
echo -e "\n${YELLOW}7. Waiting for services (10s)...${NC}"
sleep 10

# Check service status
echo -e "\n${YELLOW}8. Checking service status...${NC}"
pm2 status

# Test health endpoint
echo -e "\n${YELLOW}9. Testing health endpoint...${NC}"
if curl -s http://localhost:8080/health | grep -q "ok"; then
    echo -e "${GREEN}   ✓ API is healthy${NC}"
else
    echo -e "${RED}   ✗ API health check failed${NC}"
fi

# Display logs
echo -e "\n${YELLOW}10. Recent logs...${NC}"
pm2 logs --lines 20

echo -e "\n${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "ABFT Consensus is now LIVE:"
echo "  - Main API: http://localhost:8080"
echo "  - ABFT Worker: $(pm2 show vera-abft-consensus 2>/dev/null | grep 'status' | head -1)"
echo "  - Gossip Worker: $(pm2 show vera-hcs-gossip 2>/dev/null | grep 'status' | head -1)"
echo ""
echo "Commands:"
echo "  pm2 status           - Check service status"
echo "  pm2 logs             - View all logs"
echo "  pm2 logs vera-abft-consensus - View ABFT logs"
echo "  pm2 stop all         - Stop all services"
echo "  pm2 restart all      - Restart all services"
