---
description: Perform comprehensive load testing on Vera lattice
---

# Perform Load Testing

Load testing and performance benchmarking.

## Quick Test

```bash
// turbo
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run basic load test
k6 run --vus 100 --duration 5m load-test.js
```

## Test Scenarios

### 1. API Endpoints

```bash
// turbo
cat > vera-api-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.post('http://localhost:8088/api/ai/generate', {
    query: 'What is the capital of France?',
    context: {}
  });
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(1);
}
EOF

k6 run vera-api-test.js
```

### 2. Concurrent Users

```bash
// turbo
cat > concurrent-test.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '10m',
    },
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 5000 },
        { duration: '10m', target: 5000 },
        { duration: '5m', target: 0 },
      ],
    },
  },
};

export default function () {
  const res = http.get('http://localhost:8088/api/health');
  check(res, { 'healthy': (r) => r.status === 200 });
}
EOF
```

### 3. Stress Test

```bash
// turbo
cat > stress-test.js << 'EOF'
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 2000 },
    { duration: '2m', target: 4000 },
    { duration: '5m', target: 4000 },
    { duration: '5m', target: 0 },
  ],
};

export default function () {
  http.post('http://localhost:8088/api/ai/generate', JSON.stringify({
    query: 'Generate a response',
    max_tokens: 500
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
EOF

k6 run stress-test.js --out influxdb=http://localhost:8086/k6
```

### 4. Spike Test

```bash
// turbo
cat > spike-test.js << 'EOF'
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '10s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '10s', target: 2000 },
    { duration: '3m', target: 2000 },
    { duration: '10s', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  http.get('http://localhost:8088/api/vera/lattice/state');
}
EOF
```

## Performance Benchmarking

```bash
// turbo
# Apache Bench
ab -n 10000 -c 100 -H "Authorization: Bearer $TOKEN" \
  http://localhost:8088/api/health

# wrk
wrk -t12 -c400 -d30s http://localhost:8088/api/health

# vegeta
echo "GET http://localhost:8088/api/health" | vegeta attack \
  -duration=5m -rate=1000 | vegeta report
```

## Analysis

```bash
// turbo
# Generate report
k6 run --out json=results.json vera-api-test.js
node analyze-load-test.mjs --input results.json --output report.html

# Compare with baseline
curl http://localhost:8088/api/performance/compare \
  -d '{"baseline": "2024-01-01", "current": "2024-01-15"}' | jq .
```

## Capacity Planning

```bash
// turbo
# Determine max capacity
node -e "
import { capacityPlanner } from './src/performance/capacityPlanner.js';
const results = await capacityPlanner.analyze({
  testResults: 'results.json',
  targetLatency: 200,
  targetErrorRate: 0.01
});
console.log('Max capacity:', results.maxUsers);
console.log('Recommended:', results.recommendedUsers);
console.log('Bottleneck:', results.bottleneck);
"
```
