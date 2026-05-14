---
description: Setup feature flag system for gradual rollouts
---

# Setup Feature Flags

Feature flags for safe deployments and A/B testing.

## Quick Setup

```bash
// turbo
# Install LaunchDarkly SDK
npm install launchdarkly-node-server-sdk

# Or use Unleash (open source)
docker run -d -p 4242:4242 unleashorg/unleash-server
```

## LaunchDarkly Integration

```bash
// turbo
# Initialize in Vera
node -e "
import LaunchDarkly from 'launchdarkly-node-server-sdk';
const client = LaunchDarkly.init(process.env.LD_SDK_KEY);
await client.waitForInitialization();

// Check feature flag
const enabled = await client.variation('new-ai-model', { key: 'user-123' }, false);
console.log('New AI model enabled:', enabled);
"
```

## Unleash Self-Hosted

```bash
// turbo
# Deploy Unleash
cat > unleash-deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: unleash
spec:
  replicas: 2
  selector:
    matchLabels:
      app: unleash
  template:
    spec:
      containers:
        - name: unleash
          image: unleashorg/unleash-server:latest
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: unleash-db
                  key: url
          ports:
            - containerPort: 4242
EOF

kubectl apply -f unleash-deployment.yaml
```

## Feature Flag Client

```bash
// turbo
cat > src/features/featureFlags.ts << 'EOF'
import { Unleash } from 'unleash-client';

export class FeatureFlagManager {
  private unleash: Unleash;

  constructor(config: { url: string; appName: string; instanceId: string }) {
    this.unleash = new Unleash(config);
  }

  isEnabled(flagName: string, context?: Record<string, unknown>): boolean {
    return this.unleash.isEnabled(flagName, context);
  }

  getVariant(flagName: string, context?: Record<string, unknown>): string {
    return this.unleash.getVariant(flagName, context).name;
  }

  async destroy(): Promise<void> {
    await this.unleash.destroy();
  }
}

// Singleton instance
export const featureFlags = new FeatureFlagManager({
  url: process.env.UNLEASH_URL || 'http://localhost:4242/api',
  appName: 'vera-lattice',
  instanceId: process.env.HOSTNAME || 'local'
});
EOF
```

## Gradual Rollouts

```bash
// turbo
# Create rollout strategy via API
curl -X POST http://localhost:4242/api/admin/projects/default/features \
  -H "Authorization: $UNLEASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ai-model-v2",
    "description": "New AI model rollout",
    "type": "release",
    "environments": [
      {
        "name": "production",
        "strategies": [
          {
            "name": "gradualRollout",
            "parameters": {
              "percentage": 10,
              "groupId": "ai-model-v2"
            }
          }
        ]
      }
    ]
  }'

# Increase rollout gradually
curl -X PUT http://localhost:4242/api/admin/projects/default/features/ai-model-v2/environments/production/strategies/1 \
  -H "Authorization: $UNLEASH_TOKEN" \
  -d '{"parameters": {"percentage": 50}}'
```

## A/B Testing

```bash
// turbo
# Create experiment
curl -X POST http://localhost:4242/api/admin/projects/default/features \
  -H "Authorization: $UNLEASH_TOKEN" \
  -d '{
    "name": "response-format-test",
    "type": "experiment",
    "variants": [
      {"name": "control", "weight": 50},
      {"name": "treatment", "weight": 50}
    ]
  }'

# Use in code
const variant = featureFlags.getVariant('response-format-test', { userId });
if (variant === 'treatment') {
  return newFormatResponse();
} else {
  return standardResponse();
}
```

## Context-Aware Flags

```bash
// turbo
# Target specific users/regions
const context = {
  userId: req.user.id,
  region: req.headers['x-region'],
  tier: req.user.subscriptionTier,
  gpuEnabled: req.user.hasGPU
};

if (featureFlags.isEnabled('advanced-ai-features', context)) {
  // Use advanced features
}
```

## Kill Switch

```bash
// turbo
# Emergency kill switch
curl -X POST http://localhost:8088/api/admin/killswitch \
  -d '{
    "feature": "carbon-retirement",
    "reason": "Hedera maintenance",
    "duration": "2h"
  }'

# Check status
curl http://localhost:8088/api/features/status | jq '.disabledFeatures'
```

## Analytics Integration

```bash
// turbo
# Track flag usage
node -e "
import { analytics } from './src/analytics/featureAnalytics.js';
analytics.trackFlagUsage({
  flag: 'ai-model-v2',
  enabled: true,
  userId: 'user-123',
  timestamp: Date.now()
});
"

# Generate report
curl http://localhost:8088/api/features/report/ai-model-v2 | jq '.{
  totalEvaluations: .count,
  enabledCount: .enabled,
  disabledCount: .disabled,
  conversionImpact: .metrics.conversion
}'
```
