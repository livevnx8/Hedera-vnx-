---
description: Create custom integration for external systems
---

# Create Custom Integration

Build custom integrations for Vera lattice.

## Quick Start

```bash
// turbo
# Generate integration scaffold
./generate-integration.sh --name my-integration --type webhook
```

## Webhook Integration

```bash
// turbo
# Create webhook handler
cat > src/integrations/myIntegration.ts << 'EOF'
import { EventEmitter } from 'events';

interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export class MyIntegration extends EventEmitter {
  private webhookUrl: string;
  private secret: string;

  constructor(config: { url: string; secret: string }) {
    super();
    this.webhookUrl = config.url;
    this.secret = config.secret;
  }

  async send(event: string, data: Record<string, unknown>): Promise<void> {
    const payload: WebhookPayload = {
      event,
      data,
      timestamp: Date.now()
    };

    const signature = this.sign(payload);

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }
  }

  private sign(payload: WebhookPayload): string {
    // HMAC signature
    return crypto.createHmac('sha256', this.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
EOF
```

## API Integration

```bash
// turbo
# REST API client
cat > src/integrations/apiIntegration.ts << 'EOF'
import axios, { AxiosInstance } from 'axios';

export class APIIntegration {
  private client: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Interceptors
    this.client.interceptors.request.use(
      (config) => {
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  async getData(endpoint: string): Promise<unknown> {
    const response = await this.client.get(endpoint);
    return response.data;
  }

  async postData(endpoint: string, data: unknown): Promise<unknown> {
    const response = await this.client.post(endpoint, data);
    return response.data;
  }
}
EOF
```

## GraphQL Integration

```bash
// turbo
# GraphQL client
cat > src/integrations/graphqlIntegration.ts << 'EOF'
import { GraphQLClient, gql } from 'graphql-request';

export class GraphQLIntegration {
  private client: GraphQLClient;

  constructor(endpoint: string, token: string) {
    this.client = new GraphQLClient(endpoint, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
  }

  async query(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    return this.client.request(gql`${query}`, variables);
  }
}
EOF
```

## Message Queue Integration

```bash
// turbo
# RabbitMQ integration
cat > src/integrations/rabbitIntegration.ts << 'EOF'
import amqp from 'amqplib';

export class RabbitIntegration {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  async connect(url: string): Promise<void> {
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
  }

  async publish(queue: string, message: unknown): Promise<void> {
    await this.channel?.assertQueue(queue);
    this.channel?.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  }

  async consume(queue: string, handler: (msg: unknown) => void): Promise<void> {
    await this.channel?.assertQueue(queue);
    this.channel?.consume(queue, (msg) => {
      if (msg) {
        handler(JSON.parse(msg.content.toString()));
        this.channel?.ack(msg);
      }
    });
  }
}
EOF
```

## Register with Vera

```bash
// turbo
# Register integration
cat > src/integrations/index.ts << 'EOF'
export { MyIntegration } from './myIntegration.js';
export { APIIntegration } from './apiIntegration.js';
export { GraphQLIntegration } from './graphqlIntegration.js';
export { RabbitIntegration } from './rabbitIntegration.js';

// Integration registry
export const INTEGRATIONS = {
  myIntegration: MyIntegration,
  apiIntegration: APIIntegration,
  graphqlIntegration: GraphQLIntegration,
  rabbitIntegration: RabbitIntegration
};
EOF

# Configure in Vera
node -e "
import { integrationRegistry } from './src/vera/integrationRegistry.js';
await integrationRegistry.register({
  name: 'my-integration',
  handler: 'MyIntegration',
  events: ['agent.joined', 'task.completed'],
  config: { url: 'https://...', secret: '...' }
});
"
```

## Testing

```bash
// turbo
# Integration tests
cat > tests/myIntegration.test.ts << 'EOF'
import { MyIntegration } from '../src/integrations/myIntegration.js';

describe('MyIntegration', () => {
  let integration: MyIntegration;

  beforeEach(() => {
    integration = new MyIntegration({
      url: 'https://httpbin.org/post',
      secret: 'test-secret'
    });
  });

  test('should send webhook', async () => {
    await expect(
      integration.send('test.event', { foo: 'bar' })
    ).resolves.not.toThrow();
  });
});
EOF

npm test -- myIntegration.test.ts
```

## Documentation

```bash
// turbo
# Generate API docs
npx typedoc src/integrations/*.ts --out docs/integrations

# Create README
cat > src/integrations/my-integration/README.md << 'EOF'
# My Integration

## Configuration
\`\`\`typescript
const integration = new MyIntegration({
  url: 'https://my-service.com/webhook',
  secret: process.env.MY_INTEGRATION_SECRET
});
\`\`\`

## Events
- `agent.joined` - Agent joined lattice
- `task.completed` - Task completed
EOF
```
