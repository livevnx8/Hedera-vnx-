# Contributing to VNX

Welcome to the VNX Oasis marketplace! This guide covers development, contributing, and training new models.

## Getting Started

### Prerequisites
- Node.js 20.x+
- npm or yarn
- Hedera testnet account (for development)
- NVIDIA GPU (recommended for model training)

### Setup

```bash
# Clone and install
git clone https://github.com/yourusername/hedera-llm-api.git
cd hedera-llm-api
npm install

# Install UI dependencies
npm --prefix ui install

# Configure environment
cp .env.example .env
# Edit .env with your Hedera credentials
```

### Development Server

```bash
# Backend (runs on 8080)
npm run dev

# UI (runs on 5173)
npm --prefix ui run dev

# Both in one terminal
npm run dev:all
```

## Code Style

We follow standard Node.js conventions:

- **Language**: TypeScript + JavaScript (ESM)
- **Formatting**: 2-space indentation
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Comments**: JSDoc for public APIs, inline for complex logic

### Linting

```bash
npm run lint
npm run lint:fix
```

## Project Structure

```
├── src/
│   ├── routes.ts           # API route definitions
│   ├── agents/             # Agent implementations
│   ├── chat/               # Chat system (Vera lattice)
│   └── inference/          # Model inference layer
├── ui/
│   ├── src/
│   │   ├── App.tsx         # Main React component
│   │   └── components/     # UI components
│   └── vite.config.ts
├── training-data/          # Training datasets
├── models/                 # Trained model binaries
├── docs/                   # Documentation
└── package.json
```

## Making Changes

### Small Fixes
1. Create a feature branch: `git checkout -b fix/issue-name`
2. Make changes and commit: `git commit -m "fix: description"`
3. Push: `git push origin fix/issue-name`
4. Open a pull request

### New Features
1. Open an issue to discuss the feature
2. Create feature branch: `git checkout -b feat/feature-name`
3. Implement with tests
4. Update documentation
5. Submit PR with description of changes

### Commit Message Format

```
type(scope): description

feat(chat): add streaming response optimization
fix(routes): resolve memory leak in HCS polling
docs(training): add model fine-tuning guide
refactor(embedding): improve similarity calculation
test(agent): add integration tests
```

## Testing

```bash
# Run all tests
npm test

# Run specific suite
npm test -- src/chat

# Watch mode for development
npm test -- --watch

# Coverage report
npm test -- --coverage
```

## Model Training & Improvements

See [VNX_MODEL_TRAINING.md](VNX_MODEL_TRAINING.md) for complete training guide.

### Quick Model Training

```bash
# Collect training data from HCS
npm run collect:hcs-training-data

# Train a model
npm run train:vnx-base

# Validate performance
npm run validate:model

# Deploy to production
npm run deploy:model
```

## API Development

### Adding New Endpoints

1. Add route in `src/routes.ts`:
```typescript
app.post('/api/vnx/custom', async (req, res) => {
  // Implementation
  res.json({ result: 'success' });
});
```

2. Test with:
```bash
curl -X POST http://localhost:8080/api/vnx/custom \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. Document in [API_ENDPOINTS_REFERENCE.md](API_ENDPOINTS_REFERENCE.md)

### Integration with Chat System

The chat system uses HCS (Hedera Consensus Service) for distributed memory:

```typescript
// Access memory layer
const memory = new HCSMemoryLayer(hederaClient);

// Store conversation
await memory.store(sessionId, 'user', userMessage, {
  intent: 'planning',
  domain: 'defi'
});

// Recall relevant context
const context = await memory.recall(query, sessionId, 5);
```

## Documentation

- Update [API_ENDPOINTS_REFERENCE.md](API_ENDPOINTS_REFERENCE.md) for new APIs
- Add JSDoc comments to new functions
- Keep README.md synchronized with major changes
- Create additional docs in `docs/` for complex features

## Performance

VNX targets production-grade performance:

- **Chat response**: <300ms p99
- **API endpoints**: <100ms p99
- **Memory**: <500MB footprint
- **Throughput**: 100+ concurrent users

Check performance with:
```bash
npm run benchmark
npm run profile:inference
```

## Security

- **Never commit credentials** - use environment variables
- **Validate all inputs** - especially from external sources
- **Sanitize HCS messages** - prevent injection attacks
- **Rate limit APIs** - protect against abuse

Report security issues to: security@vnx.example.com

## Git Workflow

1. Keep `main` branch deployable at all times
2. Use `develop` for integration testing
3. Feature branches off `develop`: `feature/*`
4. Release branches: `release/*`
5. Hotfixes: `hotfix/*`

```bash
# Typical flow
git checkout -b feat/my-feature develop
# ... make changes ...
git commit -m "feat: my feature"
git push origin feat/my-feature

# After PR review & approval
git checkout develop
git pull origin develop
git merge feat/my-feature
git push origin develop

# Before release
git checkout -b release/1.2.0 develop
# ... version bumps, final fixes ...
git checkout main
git merge --no-ff release/1.2.0
git tag -a v1.2.0
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release tag: `git tag v1.2.0`
4. Push to GitHub: `git push origin main --tags`
5. Create GitHub Release with notes
6. Deploy to production

## Issues & Discussions

- **Bugs**: [GitHub Issues](https://github.com/yourusername/hedera-llm-api/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/hedera-llm-api/discussions)
- **Roadmap**: [VNX Product Path](VNX_PRODUCT_PATH.md)

## Community

- Join us on [Discord](https://discord.gg/vnx)
- Follow [@VNXOasis](https://twitter.com/vnxoasis)
- Read the [Blog](https://blog.vnx.example.com/)

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## Questions?

- Check [API documentation](API_ENDPOINTS_REFERENCE.md)
- Review [training guide](VNX_MODEL_TRAINING.md)
- Open an issue with the `question` label
- Join our Discord community

Thank you for contributing to VNX! 🚀
