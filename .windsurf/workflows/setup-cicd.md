---
description: Setup CI/CD pipeline for Vera
---

# Setup CI/CD

Automate testing and deployment.

## GitHub Actions

```yaml
# .github/workflows/vera-cicd.yml
name: Vera CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: ./verify-integration.sh

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --audit-level=moderate
      - run: npm run security:scan

  deploy-staging:
    needs: [test, security]
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying to staging..."
      - run: ./deploy-lattice.sh --env staging

  deploy-production:
    needs: [test, security]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying to production..."
      - run: ./deploy-lattice.sh --env production
```

## Local Git Hooks

```bash
// turbo
# Pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
npm run lint || exit 1
npm run test:quick || exit 1
EOF
chmod +x .git/hooks/pre-commit
```

## Automated Testing

```bash
// turbo
# Run on every commit
npm run test:unit
npm run test:integration
./verify-lattice-topics.mjs
```

## Deployment Pipeline

### Staging

```bash
// turbo
# Auto-deploy on merge to develop
./deploy-lattice.sh --env staging --skip-tests
./run-smoke-tests.sh staging
```

### Production

```bash
// turbo
# Manual approval required
./deploy-lattice.sh --env production
./verify-integration.sh
./run-smoke-tests.sh production
```

## Rollback

```bash
// turbo
# Auto-rollback on failure
if ! ./run-health-check.sh; then
  ./restore-lattice.sh latest-stable
fi
```
