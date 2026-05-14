---
description: Setup event sourcing architecture for Vera lattice
---

# Setup Event Sourcing

Event sourcing for audit trail and state reconstruction.

## Quick Setup

```bash
// turbo
# Install EventStoreDB
docker run -d --name eventstore -p 2113:2113 \
  -e EVENTSTORE_CLUSTER_SIZE=1 \
  -e EVENTSTORE_RUN_PROJECTIONS=All \
  eventstore/eventstore:latest

# Or use Kafka with event sourcing
docker-compose -f event-sourcing-compose.yml up -d
```

## Event Store Configuration

```bash
// turbo
# Configure Vera for event sourcing
export VERA_EVENT_SOURCING_ENABLED=true
export EVENT_STORE_URL=esdb://localhost:2113
export EVENT_STORE_STREAM_PREFIX=vera

# Initialize event store
node -e "
import { eventStore } from './src/events/eventStore.js';
await eventStore.connect(process.env.EVENT_STORE_URL);
console.log('Event store connected');
"
```

## Define Events

```bash
// turbo
# Create event types
cat > src/events/veraEvents.ts << 'EOF'
export interface DomainEvent {
  id: string;
  type: string;
  streamId: string;
  version: number;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface AgentJoinedEvent extends DomainEvent {
  type: 'AgentJoined';
  data: {
    agentId: string;
    nodeId: string;
    capabilities: string[];
  };
}

export interface TaskAssignedEvent extends DomainEvent {
  type: 'TaskAssigned';
  data: {
    taskId: string;
    agentId: string;
    taskType: string;
    priority: number;
  };
}

export interface TaskCompletedEvent extends DomainEvent {
  type: 'TaskCompleted';
  data: {
    taskId: string;
    agentId: string;
    result: unknown;
    duration: number;
  };
}

export interface LatticeReconfiguredEvent extends DomainEvent {
  type: 'LatticeReconfigured';
  data: {
    previousConfig: Record<string, unknown>;
    newConfig: Record<string, unknown>;
    reason: string;
  };
}
EOF
```

## Event Store Implementation

```bash
// turbo
cat > src/events/eventStore.ts << 'EOF'
import { EventStoreDBClient } from '@eventstore/db-client';
import { DomainEvent } from './veraEvents.js';

export class VeraEventStore {
  private client: EventStoreDBClient;

  async connect(connectionString: string): Promise<void> {
    this.client = EventStoreDBClient.connectionString(connectionString);
  }

  async appendEvent(streamId: string, event: DomainEvent): Promise<void> {
    await this.client.appendToStream(streamId, [{
      type: event.type,
      data: event.data,
      metadata: {
        ...event.metadata,
        timestamp: event.timestamp.toISOString()
      }
    }]);
  }

  async getEvents(streamId: string, fromVersion = 0): Promise<DomainEvent[]> {
    const events: DomainEvent[] = [];
    const stream = this.client.readStream(streamId, {
      fromRevision: BigInt(fromVersion)
    });

    for await (const event of stream) {
      events.push(this.toDomainEvent(event));
    }

    return events;
  }

  async getAllEvents(eventTypes?: string[]): Promise<DomainEvent[]> {
    const filter = eventTypes ? { eventTypes } : undefined;
    const stream = this.client.readAll({ filter });
    
    const events: DomainEvent[] = [];
    for await (const event of stream) {
      events.push(this.toDomainEvent(event));
    }
    
    return events;
  }

  private toDomainEvent(event: any): DomainEvent {
    return {
      id: event.event.id,
      type: event.event.type,
      streamId: event.event.streamId,
      version: Number(event.event.revision),
      timestamp: new Date(event.event.created),
      data: event.event.data,
      metadata: event.event.metadata
    };
  }
}
EOF
```

## Projection Handlers

```bash
// turbo
# Create read model projections
cat > src/events/projections.ts << 'EOF'
import { VeraEventStore } from './eventStore.js';

export class AgentProjection {
  private agents = new Map<string, any>();

  async rebuild(eventStore: VeraEventStore): Promise<void> {
    const events = await eventStore.getAllEvents([
      'AgentJoined', 'AgentLeft', 'AgentStatusChanged'
    ]);

    for (const event of events) {
      this.apply(event);
    }
  }

  private apply(event: any): void {
    switch (event.type) {
      case 'AgentJoined':
        this.agents.set(event.data.agentId, {
          id: event.data.agentId,
          nodeId: event.data.nodeId,
          status: 'active',
          capabilities: event.data.capabilities
        });
        break;
      
      case 'AgentLeft':
        this.agents.delete(event.data.agentId);
        break;
      
      case 'AgentStatusChanged':
        const agent = this.agents.get(event.data.agentId);
        if (agent) {
          agent.status = event.data.status;
          agent.lastUpdated = event.timestamp;
        }
        break;
    }
  }

  getActiveAgents(): any[] {
    return Array.from(this.agents.values())
      .filter(a => a.status === 'active');
  }
}
EOF
```

## Event Bus

```bash
// turbo
# Event bus for decoupled communication
cat > src/events/eventBus.ts << 'EOF'
import { EventEmitter } from 'events';
import { DomainEvent } from './veraEvents.js';

export class EventBus extends EventEmitter {
  async publish(event: DomainEvent): Promise<void> {
    this.emit(event.type, event);
    this.emit('*', event);
  }

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => void | Promise<void>
  ): () => void {
    this.on(eventType, handler);
    return () => this.off(eventType, handler);
  }
}

export const globalEventBus = new EventBus();
EOF
```

## Snapshotting

```bash
// turbo
# Periodic snapshots for performance
cat > src/events/snapshotManager.ts << 'EOF'
import { VeraEventStore } from './eventStore.js';

export class SnapshotManager {
  private snapshotThreshold = 100; // events

  async createSnapshot(streamId: string, state: unknown): Promise<void> {
    await this.saveSnapshot(streamId, {
      state,
      version: await this.getCurrentVersion(streamId),
      timestamp: Date.now()
    });
  }

  async loadSnapshot(streamId: string): Promise<{ state: unknown; version: number } | null> {
    const snapshot = await this.getLatestSnapshot(streamId);
    if (!snapshot) return null;

    // Replay events after snapshot
    const events = await eventStore.getEvents(streamId, snapshot.version);
    let state = snapshot.state;

    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    return { state, version: snapshot.version + events.length };
  }
}
EOF
```

## Event Replay

```bash
// turbo
# Replay events for debugging
curl -X POST http://localhost:8088/api/admin/events/replay \
  -d '{
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-15T00:00:00Z",
    "types": ["TaskCompleted", "AgentJoined"]
  }'

# View event stream
curl http://localhost:8088/api/events/stream/vera-lattice | jq '.events'
```

## Audit Trail

```bash
// turbo
# Generate audit report
node -e "
import { auditTrail } from './src/compliance/auditTrail.js';
const report = await auditTrail.generate({
  entityType: 'agent',
  entityId: 'agent-001',
  from: '2024-01-01',
  to: '2024-01-31'
});
console.log(JSON.stringify(report, null, 2));
"
```
