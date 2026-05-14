---
description: Integrate Vera with external systems
---

# Integrate Externally

Connect Vera to external APIs and services.

## Webhook Setup

```bash
// turbo
# Configure webhook endpoint
curl -X POST http://localhost:8088/api/webhooks \
  -d '{
    "url": "https://your-app.com/webhook",
    "events": ["carbon.retired", "agent.joined"],
    "secret": "webhook-secret"
  }'
```

## ERP Integration

```bash
// turbo
# SAP/Oracle integration
node -e "
import { erpConnector } from './src/integrations/erpConnector.js';
await erpConnector.configure({
  type: 'sap',
  endpoint: 'https://sap.company.com/api',
  auth: { username: 'vera', password: '***' }
});
"
```

## Slack Notifications

```bash
// turbo
# Setup Slack
curl -X POST http://localhost:8088/api/integrations/slack \
  -d '{"webhook": "https://hooks.slack.com/...", "channel": "#vera-alerts"}'
```

## Custom API Client

```bash
// turbo
# Generate client SDK
npm run generate:client -- --language typescript --output ./clients/ts

# Python client
npm run generate:client -- --language python --output ./clients/python
```

## External Auth

```bash
// turbo
# OAuth2 integration
curl -X POST http://localhost:8088/api/auth/oauth \
  -d '{
    "provider": "google",
    "clientId": "...",
    "clientSecret": "..."
  }'
```
