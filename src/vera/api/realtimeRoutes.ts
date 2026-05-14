import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { orchestratorEventStream, type StreamEvent } from '../orchestrator/eventStream.js';
import { logger } from '../../monitoring/logger.js';

// ─── SSE Route ────────────────────────────────────────────────────────────────

export async function registerRealtimeRoutes(app: FastifyInstance) {

  /**
   * GET /api/vera/events — Server-Sent Events stream
   *
   * Query params:
   *   ?lastEventId=<number>  — replay events after this ID (for reconnection)
   */
  app.get('/api/vera/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    // Replay recent events if requested
    const lastEventId = (req.query as Record<string, string>).lastEventId;
    if (lastEventId) {
      const recent = orchestratorEventStream.getRecentEvents(100);
      const cutoff = parseInt(lastEventId, 10) || 0;
      const missed = recent.filter((e) => e.timestamp > cutoff);
      for (const event of missed) {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }

    // Subscribe to live events
    const unsubscribe = orchestratorEventStream.subscribe(clientId, (event: StreamEvent) => {
      try {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 30_000);

    // Cleanup on disconnect
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      logger.debug('RealtimeRoutes', { message: 'SSE client disconnected', clientId });
    });

    logger.debug('RealtimeRoutes', { message: 'SSE client connected', clientId });
  });

  /**
   * GET /api/vera/events/recent — Get recent events (REST, for catch-up)
   */
  app.get('/api/vera/events/recent', async (req: FastifyRequest, reply: FastifyReply) => {
    const limit = parseInt((req.query as Record<string, string>).limit ?? '50', 10);
    const events = orchestratorEventStream.getRecentEvents(Math.min(limit, 200));
    return reply.send({ count: events.length, events });
  });
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────

/**
 * Attach a WebSocket server to the existing HTTP server for high-throughput consumers.
 * Clients connect to ws://host:port/ws/vera/events
 */
export function attachWebSocketServer(server: import('http').Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);

    if (url.pathname === '/ws/vera/events') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Send connection acknowledgment
    ws.send(JSON.stringify({ type: 'connected', clientId, timestamp: Date.now() }));

    // Subscribe to orchestrator events
    const unsubscribe = orchestratorEventStream.subscribe(clientId, (event: StreamEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    });

    // Handle client messages (e.g., filters, pings)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Replay recent events on request
        if (msg.type === 'replay') {
          const events = orchestratorEventStream.getRecentEvents(msg.limit ?? 50);
          for (const event of events) {
            ws.send(JSON.stringify(event));
          }
        }

        // Ping/pong
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Cleanup on disconnect
    ws.on('close', () => {
      unsubscribe();
      logger.debug('RealtimeRoutes', { message: 'WebSocket client disconnected', clientId });
    });

    ws.on('error', () => {
      unsubscribe();
    });

    logger.debug('RealtimeRoutes', { message: 'WebSocket client connected', clientId });
  });

  logger.info('RealtimeRoutes', { message: 'WebSocket server attached at /ws/vera/events' });
  return wss;
}
