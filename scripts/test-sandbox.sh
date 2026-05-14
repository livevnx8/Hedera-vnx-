#!/bin/bash
# Vera Sandbox Integration Test Suite
# Verifies all sandbox components are working correctly

set -e

API_URL="${VERA_API_URL:-http://localhost:8080}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Test API health
test_api_health() {
    info "Testing API health..."
    if curl -s "${API_URL}/health" > /dev/null 2>&1; then
        pass "API is healthy"
    else
        fail "API health check failed"
    fi
}

# Test QVX Mock
test_qvx_mock() {
    info "Testing QVX Mock service..."
    if curl -s "http://localhost:5101/health" > /dev/null 2>&1; then
        pass "QVX Mock is healthy"
        
        # Test inference
        response=$(curl -s -X POST "http://localhost:5101/infer" \
            -H "Content-Type: application/json" \
            -d '{"prompt": "test", "max_tokens": 50}' 2>/dev/null)
        
        if echo "$response" | grep -q "text"; then
            pass "QVX inference works"
        else
            fail "QVX inference failed"
        fi
    else
        fail "QVX Mock is not responding"
    fi
}

# Test Redis
test_redis() {
    info "Testing Redis..."
    if command -v redis-cli > /dev/null 2>&1; then
        if redis-cli -h localhost ping | grep -q "PONG"; then
            pass "Redis is responding"
        else
            fail "Redis ping failed"
        fi
    else
        warn "redis-cli not found, skipping Redis test"
    fi
}

# Test PostgreSQL
test_postgres() {
    info "Testing PostgreSQL..."
    if command -v psql > /dev/null 2>&1; then
        if PGPASSWORD=vera psql -h localhost -U vera -d vera_sandbox -c "SELECT 1" > /dev/null 2>&1; then
            pass "PostgreSQL is accessible"
        else
            warn "PostgreSQL test failed (may need time to initialize)"
        fi
    else
        warn "psql not found, skipping PostgreSQL test"
    fi
}

# Test mock HCS
test_mock_hcs() {
    info "Testing Mock HCS service..."
    if curl -s "http://localhost:8081/health" > /dev/null 2>&1; then
        pass "Mock HCS is healthy"
        
        # Test topic creation
        response=$(curl -s -X POST "http://localhost:8081/api/v1/topics" \
            -H "Content-Type: application/json" \
            -d '{"memo": "test topic"}' 2>/dev/null)
        
        if echo "$response" | grep -q "topicId"; then
            pass "Mock HCS topic creation works"
        else
            fail "Mock HCS topic creation failed"
        fi
    else
        warn "Mock HCS is not running (optional service)"
    fi
}

# Test mock Mirror Node
test_mock_mirror() {
    info "Testing Mock Mirror Node..."
    if curl -s "http://localhost:8082/health" > /dev/null 2>&1; then
        pass "Mock Mirror Node is healthy"
        
        # Test account query
        response=$(curl -s "http://localhost:8082/api/v1/accounts/0.0.1001" 2>/dev/null)
        if echo "$response" | grep -q "account"; then
            pass "Mock Mirror account query works"
        else
            fail "Mock Mirror account query failed"
        fi
    else
        warn "Mock Mirror Node is not running (optional service)"
    fi
}

# Test environment files
test_env_files() {
    info "Testing environment configuration..."
    
    if [ -f ".env.sandbox.local" ]; then
        pass "Sandbox environment file exists"
    else
        warn "No .env.sandbox.local found (run setup-testnet.mjs)"
    fi
    
    if [ -f "docker-compose.sandbox.yml" ]; then
        pass "Docker Compose file exists"
    else
        fail "Docker Compose file not found"
    fi
}

# Test examples
test_examples() {
    info "Testing example files..."
    
    examples=(
        "examples/sandbox/01-hello-vera.mjs"
        "examples/sandbox/02-create-topic.mjs"
        "examples/sandbox/03-deploy-agent.mjs"
        "examples/sandbox/04-carbon-audit.mjs"
        "examples/sandbox/05-energy-monitor.mjs"
    )
    
    for example in "${examples[@]}"; do
        if [ -f "$example" ]; then
            pass "Example exists: $(basename $example)"
        else
            fail "Example missing: $example"
        fi
    done
}

# Main test execution
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       🧪 VERA SANDBOX INTEGRATION TESTS                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Run all tests
test_env_files
test_api_health
test_qvx_mock
test_redis
test_postgres
test_mock_hcs
test_mock_mirror
test_examples

# Summary
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    TEST SUMMARY                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Sandbox is ready.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed. Check the output above.${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Start the sandbox: ./vera-sandbox start"
    echo "  2. Wait for services to initialize (30s-60s)"
    echo "  3. Run diagnostics: ./vera-sandbox doctor"
    echo "  4. View logs: ./vera-sandbox logs"
    exit 1
fi
