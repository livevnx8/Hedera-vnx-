---
description: Test and validate Vera's lattice system
---

# Test and Validate Lattice

Comprehensive testing workflow for Vera's lattice.

## Quick Test Suite

```bash
// turbo
./verify-integration.sh
```

## Unit Tests

```bash
// turbo
npm test
```

## Integration Tests

### 1. Test AI Components

```bash
// turbo
node test-smart-router.mjs
node test-week2-optimizations.mjs
node test-week3-knowledge.mjs
```

### 2. Test Lattice Connectivity

```bash
// turbo
node -e "
import { flowerOfLifeOS } from './src/vera/orchestrator/flowerOfLifeOS.js';
const status = await flowerOfLifeOS.getStatus();
console.log('✅ Lattice:', status.active ? 'Active' : 'Inactive');
console.log('✅ Nodes:', status.nodeCount);
"
```

### 3. Test HCS Topics

```bash
// turbo
node verify-lattice-topics.mjs
```

### 4. Test Carbon Retirement

```bash
// turbo
curl -X POST http://localhost:8088/api/carbon/retire \
  -d '{"projectId": "TEST-001", "tons": 1, "test": true}'
```

## Load Testing

```bash
// turbo
# Install k6
npm install -g k6

# Run load test
k6 run load-test.js
```

## Validation Checklist

- [ ] API responds <200ms
- [ ] Cache hit rate >80%
- [ ] All agents beacon active
- [ ] HCS messages publishing
- [ ] Carbon retirement works
- [ ] AI routing functional
- [ ] Backup completes
- [ ] Metrics reporting

## Generate Test Report

```bash
// turbo
npm run test:report > test-report-$(date +%Y%m%d).html
```
