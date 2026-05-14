---
description: Real-time WebSocket streaming for lattice events
---

# Setup WebSocket Streaming

Live event streaming from lattice to clients via WebSocket.

## Install

```bash
npm install ws @types/ws
```

## Server

```bash
cat > src/streaming/wsServer.ts << 'EOF'
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

export class LatticeStream extends EventEmitter {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(port: number = 8089) {
    super();
    this.wss = new WebSocketServer({ port });
    
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`WS client connected (${this.clients.size} total)`);
      
      ws.on('message', (data) => this.handleMessage(ws, data.toString()));
      ws.on('close', () => this.clients.delete(ws));
    });
  }

  broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify({ event, data, timestamp: Date.now() });
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  private handleMessage(ws: WebSocket, data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg.subscribe) ws.send(JSON.stringify({ ack: msg.subscribe }));
    } catch {}
  }
}

export const latticeStream = new LatticeStream();
EOF
```

## Stream Events

```bash
# From anywhere in Vera:
latticeStream.broadcast('hcs:message', { topic: '0.0.10416187', data: '...' });
latticeStream.broadcast('agent:joined', { agentId: 'agent-001' });
latticeStream.broadcast('task:completed', { taskId: 't-123' });
```

## Client Example

```html
<script>
const ws = new WebSocket('ws://localhost:8089');

ws.onopen = () => {
  ws.send(JSON.stringify({ subscribe: ['hcs:*', 'agent:*'] }));
};

ws.onmessage = (e) => {
  const { event, data } = JSON.parse(e.data);
  console.log(`🌸 ${event}:`, data);
};
</script>
```
