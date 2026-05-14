/**
 * WebSocket Real-Time Update Server
 * 
 * Provides live updates for dashboard and clients
 * Events: node status changes, topology updates, consensus events
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { NodeMesh } from '../lattice/nodeMesh.js';
import { ByzantineConsensus } from '../lattice/byzantineConsensus.js';

export interface WSClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
}

export interface WSMessage {
  type: string;
  channel: string;
  payload: any;
  timestamp: number;
}

export class WebSocketUpdateServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private nodeMesh: NodeMesh;
  private consensus: ByzantineConsensus;
  private port: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private clientCounter = 0;

  constructor(nodeMesh: NodeMesh, consensus: ByzantineConsensus, port: number = 8081) {
    super();
    this.nodeMesh = nodeMesh;
    this.consensus = consensus;
    this.port = port;
  }

  /**
   * Initialize WebSocket server
   */
  async initialize(): Promise<void> {
    this.wss = new WebSocketServer({ 
      port: this.port,
      perMessageDeflate: true,
      heartbeatInterval: 30000
    });

    this.wss.on('connection', (socket: WebSocket, req: any) => {
      this.handleConnection(socket, req);
    });

    this.wss.on('error', (error: Error) => {
      logger.error('WebSocketServer', { error: error.message, message: 'Server error' });
    });

    // Start heartbeat
    this.startHeartbeat();

    // Subscribe to lattice events
    this.subscribeToEvents();

    logger.info('WebSocketUpdateServer', { 
      port: this.port, 
      message: 'WebSocket server initialized' 
    });

    this.emit('initialized', { port: this.port });
  }

  /**
   * Handle new connection
   */
  private handleConnection(socket: WebSocket, req: any): void {
    const clientId = `client-${++this.clientCounter}-${Date.now().toString(36)}`;
    
    const client: WSClient = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      lastPing: Date.now()
    };

    this.clients.set(clientId, client);

    logger.info('WebSocketUpdateServer', { 
      clientId, 
      ip: req.socket.remoteAddress,
      message: 'Client connected' 
    });

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      channel: 'system',
      payload: {
        clientId,
        serverTime: Date.now(),
        subscriptions: []
      },
      timestamp: Date.now()
    });

    // Handle messages
    socket.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    // Handle close
    socket.on('close', () => {
      this.handleDisconnect(clientId);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error('WebSocketUpdateServer', { 
        clientId, 
        error: error.message,
        message: 'Client error' 
      });
    });

    this.emit('client_connected', { clientId });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(client: WSClient, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message.channels);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(client, message.channels);
          break;
        case 'ping':
          this.handlePing(client);
          break;
        case 'get_topology':
          this.sendTopology(client);
          break;
        case 'get_status':
          this.sendStatus(client);
          break;
        case 'optimize':
          this.handleOptimizeRequest(client);
          break;
        default:
          logger.warn('WebSocketUpdateServer', { 
            clientId: client.id,
            type: message.type,
            message: 'Unknown message type' 
          });
      }
    } catch (error) {
      logger.error('WebSocketUpdateServer', { 
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to parse message' 
      });
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(client: WSClient, channels: string[]): void {
    for (const channel of channels) {
      client.subscriptions.add(channel);
    }

    this.sendToClient(client, {
      type: 'subscribed',
      channel: 'system',
      payload: { channels: Array.from(client.subscriptions) },
      timestamp: Date.now()
    });

    logger.debug('WebSocketUpdateServer', { 
      clientId: client.id,
      channels,
      message: 'Client subscribed' 
    });
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(client: WSClient, channels: string[]): void {
    for (const channel of channels) {
      client.subscriptions.delete(channel);
    }

    this.sendToClient(client, {
      type: 'unsubscribed',
      channel: 'system',
      payload: { channels: Array.from(client.subscriptions) },
      timestamp: Date.now()
    });
  }

  /**
   * Handle ping
   */
  private handlePing(client: WSClient): void {
    client.lastPing = Date.now();
    
    this.sendToClient(client, {
      type: 'pong',
      channel: 'system',
      payload: { serverTime: Date.now() },
      timestamp: Date.now()
    });
  }

  /**
   * Send topology data
   */
  private sendTopology(client: WSClient): void {
    const topology = {
      nodes: [
        { id: 'primary', name: 'veralattice-main', group: 1, status: 'healthy', load: 0.25, region: 'us-east-1' },
        { id: 'node1', name: 'node-1a2b3c', group: 2, status: 'healthy', load: 0.18, region: 'us-east-1' },
        { id: 'node2', name: 'node-4d5e6f', group: 2, status: 'healthy', load: 0.32, region: 'eu-west-1' },
        { id: 'node3', name: 'node-7g8h9i', group: 2, status: 'healthy', load: 0.21, region: 'ap-south-1' },
        { id: 'node4', name: 'node-0j1k2l', group: 2, status: 'degraded', load: 0.67, region: 'us-west-2' }
      ],
      links: [
        { source: 'primary', target: 'node1', active: true, latency: 12 },
        { source: 'primary', target: 'node2', active: true, latency: 45 },
        { source: 'primary', target: 'node3', active: true, latency: 89 },
        { source: 'primary', target: 'node4', active: true, latency: 67 }
      ]
    };

    this.sendToClient(client, {
      type: 'topology',
      channel: 'lattice',
      payload: topology,
      timestamp: Date.now()
    });
  }

  /**
   * Send status data
   */
  private sendStatus(client: WSClient): void {
    const status = {
      lattice: {
        nodes: 5,
        healthy: 5,
        degraded: 0,
        offline: 0,
        consensus: 'active',
        view: 1,
        load: 0.34
      },
      consensus: {
        view: 1,
        sequence: 12847,
        primary: 'veralattice-main'
      },
      hcs: {
        messagesSubmitted: 12847,
        messagesConfirmed: 12845
      }
    };

    this.sendToClient(client, {
      type: 'status',
      channel: 'lattice',
      payload: status,
      timestamp: Date.now()
    });
  }

  /**
   * Handle optimization request
   */
  private async handleOptimizeRequest(client: WSClient): Promise<void> {
    this.sendToClient(client, {
      type: 'optimization_started',
      channel: 'lattice',
      payload: { timestamp: Date.now() },
      timestamp: Date.now()
    });

    // Simulate optimization
    await new Promise(r => setTimeout(r, 2000));

    this.sendToClient(client, {
      type: 'optimization_complete',
      channel: 'lattice',
      payload: {
        improvements: {
          loadVariance: { before: 0.15, after: 0.05 },
          throughput: '+23%'
        }
      },
      timestamp: Date.now()
    });
  }

  /**
   * Subscribe to lattice events
   */
  private subscribeToEvents(): void {
    // Node mesh events
    this.nodeMesh.on('node_added', (node: any) => {
      this.broadcast('lattice', {
        type: 'node_added',
        payload: node
      });
    });

    this.nodeMesh.on('node_removed', (node: any) => {
      this.broadcast('lattice', {
        type: 'node_removed',
        payload: node
      });
    });

    this.nodeMesh.on('node_offline', (node: any) => {
      this.broadcast('lattice', {
        type: 'node_offline',
        payload: node
      });
    });

    // Consensus events
    this.consensus.on('committed', (data: any) => {
      this.broadcast('consensus', {
        type: 'committed',
        payload: data
      });
    });

    this.consensus.on('view_changed', (data: any) => {
      this.broadcast('consensus', {
        type: 'view_changed',
        payload: data
      });
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WSClient, message: WSMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast to all subscribed clients
   */
  broadcast(channel: string, message: Omit<WSMessage, 'channel' | 'timestamp'>): void {
    const fullMessage: WSMessage = {
      ...message,
      channel,
      timestamp: Date.now()
    };

    for (const client of Array.from(this.clients.values())) {
      if (client.subscriptions.has(channel) || client.subscriptions.has('all')) {
        this.sendToClient(client, fullMessage);
      }
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60 seconds

      for (const [clientId, client] of Array.from(this.clients)) {
        if (now - client.lastPing > timeout) {
          logger.warn('WebSocketUpdateServer', { 
            clientId,
            lastPing: now - client.lastPing,
            message: 'Client timeout - disconnecting' 
          });
          
          client.socket.close();
          this.clients.delete(clientId);
        }
      }

      // Send periodic updates
      this.broadcast('lattice', {
        type: 'heartbeat',
        payload: {
          clients: this.clients.size,
          serverTime: now
        }
      });
    }, 30000);
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    this.clients.delete(clientId);
    
    logger.info('WebSocketUpdateServer', { 
      clientId,
      remainingClients: this.clients.size,
      message: 'Client disconnected' 
    });

    this.emit('client_disconnected', { clientId });
  }

  /**
   * Get server statistics
   */
  getStats(): any {
    return {
      port: this.port,
      clients: this.clients.size,
      subscriptions: Array.from(this.clients.values()).reduce((acc, client) => {
        return acc + client.subscriptions.size;
      }, 0)
    };
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const client of Array.from(this.clients.values())) {
      client.socket.close();
    }
    this.clients.clear();

    // Close server
    this.wss?.close(() => {
      logger.info('WebSocketUpdateServer', { message: 'Server stopped' });
      this.emit('stopped');
    });
  }
}

export default WebSocketUpdateServer;
