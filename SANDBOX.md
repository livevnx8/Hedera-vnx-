# Vera Sandbox Documentation

A comprehensive developer sandbox for VeraLattice with support for local Docker, cloud development (Gitpod/GitHub Codespaces), Hedera testnet, and lightweight local development.

## Quick Start (5 Minutes)

### Option 1: Local Docker (Recommended)
```bash
# One-command setup
curl -fsSL https://raw.githubusercontent.com/your-org/vera-sandbox/main/scripts/quick-start.sh | bash

# Or manually:
git clone https://github.com/your-org/hedera-llm-api.git
cd hedera-llm-api
./scripts/quick-start.sh
```

### Option 2: Gitpod (Cloud IDE)
[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/your-org/hedera-llm-api)

### Option 3: GitHub Codespaces
1. Click "Code" → "Codespaces" → "Create codespace on main"
2. Wait for prebuild to complete (~2 minutes)
3. Sandbox starts automatically

## What's Included

### Services
| Service | Port | Description |
|---------|------|-------------|
| Vera API | 8080 | Main application server |
| Dashboard | 3000 | Web UI and monitoring |
| Grafana | 3001 | Metrics dashboards |
| QVX Mock | 5101 | ML inference mock service |
| Redis | 6379 | Cache and session store |
| PostgreSQL | 5432 | Development database |
| Prometheus | 9090 | Metrics collection |

### Features
- ✅ **Testnet Mode** - Uses Hedera testnet (no real HBAR cost)
- ✅ **Mock Services** - Offline development without blockchain
- ✅ **Hot Reload** - Automatic code reloading
- ✅ **Debug Support** - Node.js debugger on port 9229
- ✅ **Pre-configured** - Topics, accounts, and test data ready

## Sandbox CLI

The `vera-sandbox` CLI manages the entire environment:

```bash
# Start sandbox
./vera-sandbox start

# Start with specific profile
./vera-sandbox start --api        # API-only mode
./vera-sandbox start --offline   # Mock mode (no Hedera)
./vera-sandbox start --monitoring # With metrics

# Check status
./vera-sandbox status

# View logs
./vera-sandbox logs
./vera-sandbox logs vera-sandbox  # Specific service

# Enter container shell
./vera-sandbox shell

# Run tests
./vera-sandbox test

# Stop everything
./vera-sandbox stop

# Reset (clears all data)
./vera-sandbox reset

# Update images
./vera-sandbox update

# Diagnose issues
./vera-sandbox doctor
```

## Environment Modes

### 1. Testnet Mode (Default)
Uses Hedera testnet with real (free) transactions.
```bash
export HEDERA_NETWORK=testnet
export HEDERA_TESTNET_ACCOUNT_ID=0.0.xxxx
export HEDERA_TESTNET_PRIVATE_KEY=...
./vera-sandbox start
```

**Setup:**
```bash
# Auto-configure testnet account
node scripts/setup-testnet.mjs
```

### 2. Offline/Mock Mode
No Hedera network required. Uses mock services.
```bash
export MOCK_MODE=true
./vera-sandbox start --offline
```

### 3. Local Development
Run natively without Docker:
```bash
npm install
npm run dev
```

## Project Structure

```
hedera-llm-api/
├── docker-compose.sandbox.yml    # Main sandbox config
├── docker-compose.yml            # Production config
├── Dockerfile.sandbox            # Dev image
├── vera-sandbox                  # CLI tool
├── .devcontainer/                # VS Code Dev Container
│   ├── devcontainer.json
│   └── post-create.sh
├── .gitpod.yml                  # Gitpod configuration
├── scripts/
│   ├── quick-start.sh           # One-command setup
│   ├── setup-testnet.mjs        # Testnet configuration
│   └── init-sandbox-db.sql      # Database seed
├── src/mocks/                   # Mock services
│   ├── mockHcsService.ts
│   ├── mockQvxService.ts
│   └── mockMirrorNode.ts
└── examples/sandbox/            # Example workflows
```

## Development Workflow

### 1. Initial Setup
```bash
# Clone repo
git clone https://github.com/your-org/hedera-llm-api.git
cd hedera-llm-api

# Quick start (sets up everything)
./scripts/quick-start.sh
```

### 2. Daily Development
```bash
# Start sandbox
./vera-sandbox start

# Code changes auto-reload (hot reload enabled)
# Edit files in your IDE

# Check logs
./vera-sandbox logs

# Stop when done
./vera-sandbox stop
```

### 3. Testing
```bash
# Run all tests
./vera-sandbox test

# Or inside container
./vera-sandbox shell
npm test
```

### 4. API Testing
Use the provided REST Client file `vera-sandbox.http`:
```bash
# In VS Code with REST Client extension
# Click "Send Request" on any endpoint
```

Or use curl:
```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/status
```

## Example Workflows

See `examples/sandbox/` for complete examples:

### Hello Vera
```javascript
// examples/sandbox/01-hello-vera.mjs
const response = await fetch('http://localhost:8080/health');
const data = await response.json();
console.log('Vera Status:', data);
```

### Create HCS Topic
```javascript
// examples/sandbox/02-create-topic.mjs
import { TopicCreateTransaction } from '@hashgraph/sdk';

const tx = await new TopicCreateTransaction()
  .setTopicMemo('My Test Topic')
  .execute(client);

const receipt = await tx.getReceipt(client);
console.log('Topic ID:', receipt.topicId.toString());
```

### Deploy Agent
```javascript
// examples/sandbox/03-deploy-agent.mjs
const agent = {
  id: 'test-agent-001',
  type: 'CARBON_VALIDATOR',
  config: { interval: 60000 }
};

const response = await fetch('http://localhost:8080/api/v1/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(agent)
});
```

## Troubleshooting

### Port Conflicts
```bash
# Find what's using port 8080
lsof -i :8080

# Kill conflicting process or use different port
PORT=8081 ./vera-sandbox start
```

### Permission Issues
```bash
# Fix ownership
sudo chown -R $USER:$USER data/ logs/

# Or reset everything
./vera-sandbox reset
```

### Slow Startup
```bash
# Check resources
docker stats

# Prune unused images
docker system prune -f
```

### Connection Refused
```bash
# Check if services are running
./vera-sandbox status

# Restart
./vera-sandbox restart

# View startup logs
./vera-sandbox logs
```

### Testnet Issues
```bash
# Verify testnet connectivity
node scripts/setup-testnet.mjs

# Switch to mock mode
MOCK_MODE=true ./vera-sandbox start --offline
```

## Advanced Configuration

### Custom Environment Variables
Create `.env.sandbox.local`:
```bash
HEDERA_NETWORK=testnet
HEDERA_TESTNET_ACCOUNT_ID=0.0.xxxx
HEDERA_TESTNET_PRIVATE_KEY=...

# Topics
VERA_CORE_TOPIC_ID=0.0.xxxx
VERA_DEFI_TOPIC_ID=0.0.xxxx

# Feature flags
MOCK_MODE=false
AUTO_CREATE_TOPICS=true
```

### Docker Compose Profiles
```bash
# API only (lightweight)
docker-compose -f docker-compose.sandbox.yml --profile api up

# With monitoring
docker-compose -f docker-compose.sandbox.yml --profile monitoring up

# Full offline mode
docker-compose -f docker-compose.sandbox.yml --profile mock-all up
```

### Resource Limits
Edit `docker-compose.sandbox.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '4'
```

## Best Practices

1. **Use Testnet** - Always develop against testnet first
2. **Commit Often** - Sandbox data is ephemeral, commit code frequently
3. **Reset Regularly** - Run `./vera-sandbox reset` weekly to clean up
4. **Monitor Logs** - Check logs when things don't work
5. **Use Mock Mode** - For offline development or CI/CD

## Contributing

To add features to the sandbox:
1. Edit `docker-compose.sandbox.yml` for new services
2. Update `vera-sandbox` CLI for new commands
3. Add examples to `examples/sandbox/`
4. Update this documentation

## Support

- 📖 Full API docs: [API.md](./API.md)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/hedera-llm-api/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-org/hedera-llm-api/discussions)

## License

MIT License - See [LICENSE](./LICENSE) for details

---

**Happy Coding! 🚀**
