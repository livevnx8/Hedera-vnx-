#!/bin/bash
# Vera Enhanced System Deployment

echo "🚀 Deploying Vera Enhanced System..."

# Stop current system
echo "⏹️  Stopping current system..."
pm2 stop vera || true

# Update dependencies
echo "📦 Updating dependencies..."
npm install

# Build enhanced system
echo "🔨 Building enhanced system..."
npm run build

# Start enhanced system
echo "▶️  Starting enhanced system..."
pm2 start dist/index.js --name "vera-enhanced"

# Verify deployment
echo "🔍 Verifying deployment..."
sleep 5

# Check health
curl -f http://localhost:8080/health || {
  echo "❌ Health check failed"
  exit 1
}

echo "✅ Enhanced Vera deployed successfully!"
echo "🌐 Dashboard: http://localhost:8080/public/qvx-quantum-duet-dashboard.html"
echo "📊 Metrics: http://localhost:8080/api/qvx-quantum/metrics"
