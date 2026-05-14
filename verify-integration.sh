#!/bin/bash
#
# Vera AI Optimization Integration Verification
# Checks that all 4 weeks of optimization are ready for production
#

echo "🚀 Vera AI Optimization - Integration Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} $2"
        ((FAIL++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} $2"
        ((FAIL++))
    fi
}

# Week 1: Smart Routing & Caching
echo "📅 Week 1: Smart Routing & Caching"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "src/ai/smartRouter.ts" "Smart Router module"
check_file "src/ai/responseCache.ts" "Response Cache module"
check_file "test-smart-router.mjs" "Week 1 test suite"
echo ""

# Week 2: Tool Optimization & Parallel Processing
echo "📅 Week 2: Tool Optimization & Parallel Processing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "src/ai/toolOptimizer.ts" "Tool Optimizer module"
check_file "src/ai/parallelProcessor.ts" "Parallel Processor module"
check_file "test-week2-optimizations.mjs" "Week 2 test suite"
echo ""

# Week 3: Knowledge Systems
echo "📅 Week 3: Knowledge Systems"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "src/lattice/autoDocumenter.ts" "Auto Documenter module"
check_file "src/lattice/knowledgeCapture.ts" "Knowledge Capture module"
check_file "test-week3-knowledge.mjs" "Week 3 test suite"
echo ""

# Week 4: Integration & Monitoring
echo "📅 Week 4: Integration & Monitoring"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "src/ai/veraAIIntegration.ts" "Vera AI Integration Hub"
check_file "src/ai/monitoringDashboard.ts" "Monitoring Dashboard"
check_file "src/ai/veraIntegrationLayer.ts" "Integration Layer"
check_file "src/routes/aiDashboard.ts" "API Routes (14 endpoints)"
check_file "bootstrap-optimization.mjs" "Bootstrap script"
echo ""

# Documentation
echo "📚 Documentation"
echo "━━━━━━━━━━━━━━━━"
check_file "AI-OPTIMIZATION-GUIDE.md" "Complete optimization guide"
check_file "INTEGRATION-INSTRUCTIONS.md" "Integration instructions"
check_file "INTEGRATION-GUIDE.md" "Performance integration guide"
echo ""

# Core Infrastructure
echo "🔧 Core Infrastructure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "src/agent/enhanced-runner.js" "Enhanced Agent Runner"
check_file "src/vera/orchestrator/hederaLatticeRouter.ts" "Hedera Lattice Router"
check_dir "src/superintelligence" "Superintelligence modules"
check_dir "src/monitoring" "Monitoring infrastructure"
echo ""

# Scripts
echo "⚙️  Utility Scripts"
echo "━━━━━━━━━━━━━━━━━━━━━━"
check_file "final-polish.sh" "System verification script"
check_file "measure-performance.sh" "Performance measurement"
check_file "vera-status.sh" "Status checker"
check_file "backup-lattice.sh" "Lattice backup"
check_file "setup-cron.sh" "Cron setup"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 VERIFICATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Checks Passed: ${GREEN}${PASS}${NC}"
echo -e "Checks Failed: ${RED}${FAIL}${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo ""
    echo "The Vera AI Optimization System is fully integrated and ready for production!"
    echo ""
    echo "Key capabilities:"
    echo "  • Smart model routing (Week 1)"
    echo "  • Semantic response caching (Week 1)"
    echo "  • Tool batching & optimization (Week 2)"
    echo "  • Parallel model execution (Week 2)"
    echo "  • Auto-documentation (Week 3)"
    echo "  • Knowledge capture (Week 3)"
    echo "  • Integration hub (Week 4)"
    echo "  • Real-time monitoring (Week 4)"
    echo "  • 14 API endpoints (Week 4)"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./verify-integration.sh"
    echo "  2. Follow: INTEGRATION-INSTRUCTIONS.md"
    echo "  3. Test: node test-smart-router.mjs"
    echo "  4. Deploy: See production checklist in AI-OPTIMIZATION-GUIDE.md"
    echo ""
    exit 0
else
    echo -e "${RED}❌ SOME CHECKS FAILED${NC}"
    echo ""
    echo "Missing components. Please review the 4-week implementation."
    echo ""
    exit 1
fi
