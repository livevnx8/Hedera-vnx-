#!/bin/bash
# Post-create script for Vera Sandbox Dev Container

echo "🧪 Setting up Vera Sandbox development environment..."

# Install dependencies if not present
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
fi

# Build the project
echo "🔨 Building TypeScript..."
npm run build 2>/dev/null || echo "⚠️  Build had warnings, continuing..."

# Setup git hooks (optional)
if [ -d ".git" ]; then
    echo "⚙️  Setting up git hooks..."
    # npx husky install 2>/dev/null || true
fi

# Create necessary directories
mkdir -p data logs checkpoints

# Copy environment template if .env doesn't exist
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
fi

# Source sandbox environment
if [ -f ".env.sandbox.local" ]; then
    echo "🔧 Loading sandbox configuration..."
    set -a
    source .env.sandbox.local
    set +a
fi

# Create vera-sandbox CLI symlink
if [ -f "vera-sandbox" ]; then
    chmod +x vera-sandbox
    # Add to PATH if not already there
    if ! command -v vera-sandbox &> /dev/null; then
        sudo ln -sf "$(pwd)/vera-sandbox" /usr/local/bin/vera-sandbox
    fi
fi

echo ""
echo "✅ Vera Sandbox development environment ready!"
echo ""
echo "Quick commands:"
echo "  vera-sandbox start     - Start the sandbox"
echo "  vera-sandbox status    - Check status"
echo "  vera-sandbox test      - Run tests"
echo "  npm run dev            - Start dev server"
echo ""
echo "Happy coding! 🚀"
