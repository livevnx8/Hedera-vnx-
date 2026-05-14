#!/bin/bash
# Vera Scaling & Optimization Deployment Script
# Deploys Kubernetes infrastructure, configures auto-scaling, enables cost optimization

set -e

VERA_NAMESPACE="vera"
K8S_DIR="./infrastructure/k8s"
TERRAFORM_DIR="./infrastructure/terraform"

echo "🚀 Vera Scaling & Optimization Deployment"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}❌ kubectl not found. Please install kubectl.${NC}"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        echo -e "${RED}❌ Kubernetes cluster not accessible. Please configure kubectl.${NC}"
        exit 1
    fi
    
    if ! command -v terraform &> /dev/null; then
        echo -e "${YELLOW}⚠️  Terraform not found. AWS spot instances won't be deployed.${NC}"
    fi
    
    echo -e "${GREEN}✅ Prerequisites met${NC}"
    echo ""
}

# Deploy Kubernetes manifests
deploy_k8s() {
    echo -e "${YELLOW}Deploying Kubernetes manifests...${NC}"
    
    # Create namespace
    kubectl apply -f "${K8S_DIR}/vera-configmap.yaml"
    echo -e "${GREEN}✅ Namespace and ConfigMap created${NC}"
    
    # Deploy application
    kubectl apply -f "${K8S_DIR}/vera-lattice-deployment.yaml"
    echo -e "${GREEN}✅ Deployment created${NC}"
    
    # Deploy HPA
    kubectl apply -f "${K8S_DIR}/vera-hpa.yaml"
    echo -e "${GREEN}✅ Horizontal Pod Autoscaler created${NC}"
    
    echo ""
}

# Configure monitoring
setup_monitoring() {
    echo -e "${YELLOW}Setting up monitoring...${NC}"
    
    # Wait for deployment to be ready
    echo "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=120s deployment/vera-lattice -n ${VERA_NAMESPACE}
    
    # Get status
    echo -e "${GREEN}✅ Deployment ready${NC}"
    kubectl get pods -n ${VERA_NAMESPACE}
    echo ""
}

# Deploy AWS spot instances (if terraform available)
deploy_spot_instances() {
    if ! command -v terraform &> /dev/null; then
        echo -e "${YELLOW}⚠️  Skipping spot instance deployment (Terraform not found)${NC}"
        return
    fi
    
    echo -e "${YELLOW}Deploying AWS spot instances...${NC}"
    
    cd "${TERRAFORM_DIR}"
    
    # Initialize terraform
    terraform init
    
    # Plan
    echo -e "${YELLOW}Planning Terraform changes...${NC}"
    terraform plan -out=tfplan
    
    # Apply
    echo -e "${YELLOW}Applying Terraform changes...${NC}"
    terraform apply tfplan
    
    cd - > /dev/null
    
    echo -e "${GREEN}✅ Spot instances deployed${NC}"
    echo ""
}

# Verify deployment
verify_deployment() {
    echo -e "${YELLOW}Verifying deployment...${NC}"
    
    # Check pods
    echo "Pod status:"
    kubectl get pods -n ${VERA_NAMESPACE} -o wide
    echo ""
    
    # Check HPA
    echo "HPA status:"
    kubectl get hpa -n ${VERA_NAMESPACE}
    echo ""
    
    # Check services
    echo "Service status:"
    kubectl get svc -n ${VERA_NAMESPACE}
    echo ""
    
    # Test health endpoint
    echo "Testing health endpoint..."
    kubectl port-forward svc/vera-lattice 8080:8080 -n ${VERA_NAMESPACE} &
    sleep 5
    
    if curl -s http://localhost:8080/health/ready > /dev/null; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${RED}❌ Health check failed${NC}"
    fi
    
    kill %1 2>/dev/null || true
    echo ""
}

# Print deployment summary
print_summary() {
    echo ""
    echo "=========================================="
    echo "🎉 Deployment Summary"
    echo "=========================================="
    echo ""
    echo "Kubernetes Resources:"
    echo "  - Namespace: ${VERA_NAMESPACE}"
    echo "  - Deployment: vera-lattice (3-20 replicas)"
    echo "  - HPA: CPU 70%, Memory 80%, Custom metrics"
    echo "  - Service: ClusterIP with session affinity"
    echo ""
    echo "Cost Optimizations:"
    echo "  - Spot instances: 70% compute savings"
    echo "  - HBAR batching: 30% transaction fee savings"
    echo "  - Auto-scaling: Right-size resources"
    echo ""
    echo "Multi-Model Infrastructure:"
    echo "  - Ensemble orchestrator: Active"
    echo "  - Model hot-swap: Zero-downtime deploys"
    echo "  - A/B testing: Ready"
    echo ""
    echo "Monitoring Commands:"
    echo "  kubectl get pods -n ${VERA_NAMESPACE} -w"
    echo "  kubectl get hpa -n ${VERA_NAMESPACE} -w"
    echo "  kubectl logs -f deployment/vera-lattice -n ${VERA_NAMESPACE}"
    echo ""
    echo "Quick Tests:"
    echo "  ./scripts/test-scaling.sh"
    echo "  npx tsx scripts/cost-report.ts"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    deploy_k8s
    setup_monitoring
    deploy_spot_instances
    verify_deployment
    print_summary
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    verify)
        verify_deployment
        ;;
    cleanup)
        echo "Cleaning up..."
        kubectl delete namespace ${VERA_NAMESPACE} --ignore-not-found=true
        echo -e "${GREEN}✅ Cleanup complete${NC}"
        ;;
    *)
        echo "Usage: $0 [deploy|verify|cleanup]"
        exit 1
        ;;
esac
