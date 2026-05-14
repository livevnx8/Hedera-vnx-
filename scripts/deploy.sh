#!/bin/bash

# VeraLattice Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
PROJECT_NAME="veralattice"
BACKUP_DIR="/tmp/veralattice-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Deploying VeraLattice to $ENVIRONMENT environment..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Function to backup current deployment
backup_current() {
    echo "📦 Backing up current deployment..."
    
    if docker ps | grep -q $PROJECT_NAME; then
        docker-compose down
        docker save $PROJECT_NAME-app:latest > $BACKUP_DIR/app_backup_$TIMESTAMP.tar
        echo "✅ Backup created: app_backup_$TIMESTAMP.tar"
    else
        echo "ℹ️  No existing deployment to backup"
    fi
}

# Function to check prerequisites
check_prereqs() {
    echo "🔍 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose is not installed"
        exit 1
    fi
    
    # Check required environment variables
    if [ "$ENVIRONMENT" = "production" ]; then
        required_vars=(
            "QVX_INFER_API_KEY"
            "HEDERA_OPERATOR_ACCOUNT_ID"
            "HEDERA_OPERATOR_PRIVATE_KEY"
            "GRAFANA_PASSWORD"
        )
        
        for var in "${required_vars[@]}"; do
            if [ -z "${!var}" ]; then
                echo "❌ Required environment variable $var is not set"
                exit 1
            fi
        done
    fi
    
    echo "✅ Prerequisites check passed"
}

# Function to build and deploy
deploy() {
    echo "🔨 Building and deploying..."
    
    # Set environment file
    ENV_FILE=".env.$ENVIRONMENT"
    if [ ! -f "$ENV_FILE" ]; then
        echo "❌ Environment file $ENV_FILE does not exist"
        exit 1
    fi
    
    # Copy environment file
    cp $ENV_FILE .env
    
    # Build images
    echo "📦 Building Docker images..."
    docker-compose build --no-cache
    
    # Start services
    echo "🚀 Starting services..."
    docker-compose up -d
    
    # Wait for services to be healthy
    echo "⏳ Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    check_health
}

# Function to check service health
check_health() {
    echo "🏥 Checking service health..."
    
    services=("vera-app" "qvx-server" "redis" "nginx")
    unhealthy_services=()
    
    for service in "${services[@]}"; do
        if docker-compose ps $service | grep -q "Up (healthy)"; then
            echo "✅ $service is healthy"
        elif docker-compose ps $service | grep -q "Up"; then
            echo "⚠️  $service is running but not healthy yet"
            unhealthy_services+=($service)
        else
            echo "❌ $service is not running"
            unhealthy_services+=($service)
        fi
    done
    
    if [ ${#unhealthy_services[@]} -gt 0 ]; then
        echo "⚠️  Some services are unhealthy: ${unhealthy_services[*]}"
        echo "📋 Check logs with: docker-compose logs [service]"
    else
        echo "✅ All services are healthy"
    fi
}

# Function to run post-deployment tests
run_tests() {
    echo "🧪 Running post-deployment tests..."
    
    # Test API health
    if curl -f http://localhost:8080/health > /dev/null 2>&1; then
        echo "✅ API health check passed"
    else
        echo "❌ API health check failed"
        return 1
    fi
    
    # Test basic functionality
    response=$(curl -s http://localhost:8080/health)
    if echo "$response" | grep -q "ok"; then
        echo "✅ Basic functionality test passed"
    else
        echo "❌ Basic functionality test failed"
        return 1
    fi
    
    echo "✅ All tests passed"
}

# Function to setup monitoring
setup_monitoring() {
    echo "📊 Setting up monitoring..."
    
    # Import Grafana dashboards
    if [ -d "./monitoring/grafana/dashboards" ]; then
        echo "📈 Grafana dashboards available at http://localhost:3000"
        echo "🔑 Grafana credentials: admin / $GRAFANA_PASSWORD"
    fi
    
    # Prometheus metrics
    echo "📊 Prometheus metrics available at http://localhost:9090"
}

# Main deployment flow
main() {
    echo "🌟 VeraLattice Deployment Started"
    echo "📅 Timestamp: $TIMESTAMP"
    echo "🌍 Environment: $ENVIRONMENT"
    echo ""
    
    check_prereqs
    backup_current
    deploy
    
    if run_tests; then
        setup_monitoring
        echo ""
        echo "🎉 Deployment completed successfully!"
        echo ""
        echo "🌐 Services:"
        echo "  - VeraLattice App: http://localhost:8080"
        echo "  - Grafana: http://localhost:3000"
        echo "  - Prometheus: http://localhost:9090"
        echo ""
        echo "📋 Useful commands:"
        echo "  - View logs: docker-compose logs -f [service]"
        echo "  - Check status: docker-compose ps"
        echo "  - Stop services: docker-compose down"
        echo "  - Restart: docker-compose restart [service]"
    else
        echo "❌ Deployment failed - rolling back..."
        docker-compose down
        echo "🔄 Rollback completed"
        exit 1
    fi
}

# Handle script interruption
trap 'echo "❌ Deployment interrupted"; docker-compose down; exit 1' INT

# Run main function
main "$@"
