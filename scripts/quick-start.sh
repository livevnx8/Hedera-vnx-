#!/bin/bash
# Vera Sandbox Quick Start Script
# One-command setup for Vera development environment

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="vera-sandbox"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   🧪 VERA SANDBOX - Quick Start                              ║"
echo "║   Development Environment Setup                              ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "   Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    echo "   Install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⚠️  Git is not installed${NC}"
fi

echo -e "${GREEN}✅ Prerequisites met${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "docker-compose.sandbox.yml" ]; then
    echo -e "${YELLOW}⚠️  Not in Vera project directory${NC}"
    
    # Check if we should clone
    if [ ! -d "hedera-llm-api" ]; then
        read -p "Clone Vera repository? (y/n): " clone_repo
        if [ "$clone_repo" = "y" ]; then
            echo -e "${BLUE}📥 Cloning Vera repository...${NC}"
            git clone https://github.com/your-org/hedera-llm-api.git
            cd hedera-llm-api
        else
            echo -e "${RED}❌ Please run this script from the Vera project directory${NC}"
            exit 1
        fi
    else
        cd hedera-llm-api
    fi
fi

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Setup environment
echo -e "${BLUE}⚙️  Setting up environment...${NC}"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env from template${NC}"
    fi
fi

# Setup testnet configuration
if [ ! -f ".env.sandbox.local" ]; then
    echo -e "${BLUE}🔧 Configuring testnet...${NC}"
    node scripts/setup-testnet.mjs || echo -e "${YELLOW}⚠️  Testnet setup skipped (will use mock mode)${NC}"
fi

echo -e "${GREEN}✅ Environment configured${NC}"
echo ""

# Make CLI executable
if [ -f "vera-sandbox" ]; then
    chmod +x vera-sandbox
fi

# Start sandbox
echo -e "${BLUE}🚀 Starting Vera Sandbox...${NC}"
docker-compose -f docker-compose.sandbox.yml up -d

# Wait for services
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 10

# Check health
echo ""
echo -e "${BLUE}🏥 Health Check:${NC}"

HEALTHY=0

if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✅ API Server (localhost:8080)${NC}"
    HEALTHY=$((HEALTHY + 1))
else
    echo -e "${YELLOW}  ⏳ API Server starting...${NC}"
fi

if curl -s http://localhost:5101/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✅ QVX Mock (localhost:5101)${NC}"
    HEALTHY=$((HEALTHY + 1))
else
    echo -e "${YELLOW}  ⏳ QVX Mock starting...${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Vera Sandbox is running!                                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Services:"
echo "  🌐 API:       http://localhost:8080"
echo "  📊 Dashboard: http://localhost:3000"
echo "  📈 Grafana:   http://localhost:3001 (admin/admin)"
echo "  🤖 QVX Mock:  http://localhost:5101"
echo "  💾 Redis:     localhost:6379"
echo "  🐘 Postgres:  localhost:5432"
echo ""
echo "Commands:"
echo "  ./vera-sandbox status    - Check status"
echo "  ./vera-sandbox logs      - View logs"
echo "  ./vera-sandbox shell     - Enter container"
echo "  ./vera-sandbox stop      - Stop sandbox"
echo ""
echo "Documentation:"
echo "  📖 SANDBOX.md            - Full documentation"
echo "  🔧 .env.sandbox.local    - Your testnet config"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
