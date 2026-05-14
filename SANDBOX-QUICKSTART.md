# 🧪 Vera Sandbox

> **Complete development environment for VeraLattice with Docker, cloud IDE support, and mock services**

## 🚀 Quick Start (60 seconds)

```bash
# Clone and enter directory
git clone https://github.com/your-org/hedera-llm-api.git
cd hedera-llm-api

# One-command setup
./scripts/quick-start.sh
```

That's it! The sandbox starts with:
- ✅ Vera API running at http://localhost:8080
- ✅ QVX mock inference service (no GPU needed)
- ✅ Redis cache & PostgreSQL database
- ✅ Grafana dashboards at http://localhost:3001

## 📦 What's Included

### **Core Services** (always running)
| Service | Port | Purpose |
|---------|------|---------|
| Vera API | 8080 | Main application with hot reload |
| QVX Mock | 5101 | ML inference mock (fast, no GPU) |
| Redis | 6379 | Cache and sessions |
| PostgreSQL | 5432 | Development database |

### **Optional Profiles**
```bash
./vera-sandbox start --offline    # Mock services only (no blockchain)
./vera-sandbox start --monitoring # With Prometheus + Grafana
./vera-sandbox start --docs       # With documentation server
```

### **Development Modes**
1. **Testnet Mode** (default) - Uses real Hedera testnet
2. **Offline Mode** - Uses mock HCS and mirror node
3. **Cloud IDE** - Works in Gitpod/GitHub Codespaces
4. **Local Native** - Run without Docker: `npm run dev`

## 🎮 CLI Commands

```bash
# Lifecycle
./vera-sandbox start      # Start all services
./vera-sandbox stop       # Stop everything
./vera-sandbox status     # Check health
./vera-sandbox restart    # Restart services

# Development
./vera-sandbox logs       # View logs
./vera-sandbox shell      # Enter container
./vera-sandbox test       # Run test suite

# Maintenance
./vera-sandbox doctor     # Diagnose issues
./vera-sandbox update     # Update images
./vera-sandbox reset      # Clear all data

# Setup
./vera-sandbox setup      # Configure testnet
```

## 📚 Example Workflows

```bash
# Run examples
node examples/sandbox/01-hello-vera.mjs      # Health check
node examples/sandbox/02-create-topic.mjs    # HCS topics
node examples/sandbox/03-deploy-agent.mjs    # Agent lifecycle
node examples/sandbox/04-carbon-audit.mjs      # WV carbon validation
node examples/sandbox/05-energy-monitor.mjs  # WV energy grid
```

## 🔧 Configuration

### Environment Setup
```bash
# Auto-configure testnet account and topics
node scripts/setup-testnet.mjs

# Or copy template and edit manually
cp .env.sandbox.template .env.sandbox.local
```

### Key Environment Variables
```bash
HEDERA_NETWORK=testnet                  # or 'mainnet'
HEDERA_TESTNET_ACCOUNT_ID=0.0.xxxx    # Your account
HEDERA_TESTNET_PRIVATE_KEY=...        # Your key
MOCK_MODE=false                       # Set 'true' for offline
```

## 🏗️ Project Structure

```
hedera-llm-api/
├── docker-compose.sandbox.yml    # Main sandbox config
├── Dockerfile.sandbox            # Dev image
├── vera-sandbox                  # CLI tool
├── .devcontainer/                # VS Code Dev Containers
├── .gitpod.yml                   # Gitpod cloud IDE
├── scripts/
│   ├── quick-start.sh           # One-command setup
│   ├── setup-testnet.mjs        # Testnet configuration
│   ├── test-sandbox.sh          # Integration tests
│   └── init-sandbox-db.sql      # Database seed
├── src/mocks/
│   ├── mockQvxService.js        # ML inference mock
│   ├── mockHcsService.js        # HCS simulation
│   └── mockMirrorNode.js        # Mirror node mock
├── examples/sandbox/            # Working examples
│   ├── 01-hello-vera.mjs
│   ├── 02-create-topic.mjs
│   ├── 03-deploy-agent.mjs
│   ├── 04-carbon-audit.mjs
│   └── 05-energy-monitor.mjs
├── monitoring/
│   ├── prometheus-sandbox.yml
│   └── grafana/dashboards/
└── SANDBOX.md                   # Full documentation
```

## 🧪 Testing

```bash
# Run integration tests
./scripts/test-sandbox.sh

# Run end-to-end tests
./scripts/test-e2e.sh

# Test individual components
./vera-sandbox test
```

## ☁️ Cloud Development

### Gitpod
[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/your-org/hedera-llm-api)

### GitHub Codespaces
1. Click **Code** → **Codespaces** → **Create codespace on main**
2. Prebuild completes in ~2 minutes
3. Sandbox starts automatically

## 📖 Documentation

- [Full Sandbox Guide](SANDBOX.md) - Complete documentation
- [API Reference](API.md) - API endpoints and examples
- [Examples README](examples/sandbox/README.md) - Example walkthroughs

## 🐛 Troubleshooting

```bash
# Check what's wrong
./vera-sandbox doctor

# View logs for specific service
./vera-sandbox logs vera-sandbox

# Reset everything
./vera-sandbox reset

# Port conflicts?
PORT=8081 ./vera-sandbox start
```

## 🤝 Contributing

To add features to the sandbox:
1. Edit `docker-compose.sandbox.yml` for new services
2. Update `vera-sandbox` CLI for new commands
3. Add examples to `examples/sandbox/`
4. Update documentation

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details

---

**Happy Coding! 🚀**
