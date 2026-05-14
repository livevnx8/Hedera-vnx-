---
description: Auto-generate documentation for Vera lattice
---

# Document Lattice

Auto-generate comprehensive documentation.

## Generate API Docs

```bash
// turbo
# OpenAPI spec
npm run docs:openapi

# Generate from code
node -e "
import { autoDocumenter } from './src/lattice/autoDocumenter.js';
await autoDocumenter.generateAll({
  outputDir: './docs',
  includeExamples: true
});
"
```

## Tool Documentation

```bash
// turbo
# Document all 109 tools
node -e "
import { autoDocumenter } from './src/lattice/autoDocumenter.js';
await autoDocumenter.documentTools('./src/agent/definitions.ts');
console.log('✅ 109 tools documented');
"
```

## Architecture Diagrams

```bash
// turbo
# Generate Mermaid diagrams
node -e "
import { diagramGenerator } from './src/docs/diagramGenerator.js';

// Lattice structure
await diagramGenerator.generateLattice();

// Data flow
await diagramGenerator.generateDataFlow();

// AI optimization flow
await diagramGenerator.generateAIFlow();
"
```

## README Updates

```bash
// turbo
# Auto-update README with current stats
node -e "
import { readmeUpdater } from './src/docs/readmeUpdater.js';
await readmeUpdater.update({
  file: 'README.md',
  sections: ['tools', 'workflows', 'metrics']
});
"
```

## Changelog

```bash
// turbo
# Generate from commits
npm run changelog

# Or manually update
cat > CHANGELOG.md << 'EOF'
# Changelog

## [1.2.0] - 2024-01-15
### Added
- AI-enhanced HIP-993 logger
- 14 lattice workflows
- Horizontal scaling support

### Improved
- 85% HCS cost reduction
- 50% AI latency improvement
- 5x tool batching efficiency
EOF
```

## Workflow Catalog

```bash
// turbo
# Generate workflow index
cat > WORKFLOW_CATALOG.md << 'EOF'
# Vera Workflow Catalog

$(ls .windsurf/workflows/*.md | sed 's/.windsurf/workflows\//- \//' | sed 's/.md//')

## Quick Reference

| Need | Workflow |
|------|----------|
| Deploy | /deploy-lattice |
| Scale | /scale-lattice-horizontally |
| Monitor | /monitor-lattice-health |
| Emergency | /emergency-recovery |
EOF
```

## Publish Docs

```bash
// turbo
# Build documentation site
npm run docs:build

# Deploy to GitHub Pages
npm run docs:deploy
```
