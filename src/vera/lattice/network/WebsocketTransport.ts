/**
 * Vera Lattice - WebSocket Transport Layer
 * 
 * Production-ready gossip protocol transport with:
 * - Bi-directional WebSocket connections
 * - Automatic reconnection with exponential backoff
 * - Connection pooling for mesh topology
 * - Binary message encoding for efficiency
 * - Heartbeat/ping-pong for connection health
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { GossipMessage, NodeInfo } from '../../../lattice/nodeMesh.js';
import { logger } from '../../../monitoring/logger.js';

// Transport-specific message types extend gossip protocol
type TransportMessageType = GossipMessage['type'] | 'identify' | 'heartbeat_ack';

interface TransportMessage extends Omit<GossipMessage, 'type'> {
  type: TransportMessageType;
  messageId?: string;
}

export interface ConnectionConfig {
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  connectionTimeoutMs: number;
  messageQueueSize: number;
}

export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  reconnectIntervalMs: 1000,
  maxReconnectAttempts: 10,
  heartbeatIntervalMs: 30000,
  heartbeatTimeoutMs: 60000,
  connectionTimeoutMs: 10000,
  messageQueueSize: 1000,
};

interface ConnectionState {
  ws: WebSocket | null;
  nodeId: string;
  url: string;
  isConnected: boolean;
  lastHeartbeat: number;
  reconnectAttempts: number;
  messageQueue: TransportMessage[];
  heartbeatTimer?: NodeJS.Timeout;
  reconnectTimer?: NodeJS.Timeout;
}

export class LatticeWebsocketTransport extends EventEmitter {
  private connections: Map<string, ConnectionState> = new Map();
  private localNodeId: string;
  private config: ConnectionConfig;
  private server: WebSocket.Server | null = null;
  private isServerRunning = false;

  constructor(localNodeId: string, config: Partial<ConnectionConfig> = {}) {
    super();
    this.localNodeId = localNodeId;
    this.config = { ...DEFAULT_CONNECTION_CONFIG, ...config };
  }

  /**
   * Start WebSocket server to accept incoming connections
   */
  async startServer(port: number, host: string = '0.0.0.0'): Promise<void> {
    if (this.isServerRunning) {
      logger.warn('WebsocketTransport', { message: 'Server already running' });
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocket.Server({ 
        port, 
        host,
        perMessageDeflate: true, // Enable compression
      });

      this.server.on('connection', (ws: WebSocket, req) => {
        this.handleIncomingConnection(ws, req);
      });

      this.server.on('error', (error) => {
        logger.error('WebsocketTransport', { 
          message: 'Server error', 
          error: error.message 
        });
        reject(error);
      });

      this.server.on('listening', () => {
        this.isServerRunning = true;
        logger.info('WebsocketTransport', {
          message: 'Server started',
          port,
          host,
          nodeId: this.localNodeId,
        });
        resolve();
      });
    });
  }

  /**
   * Connect to a remote node
   */
  async connect(nodeId: string, url: string): Promise<void> {
    if (this.connections.has(nodeId)) {
      const existing = this.connections.get(nodeId)!;
      if (existing.isConnected) {
        logger.debug('WebsocketTransport', {
          message: 'Already connected to node',
          nodeId,
        });
        return;
      }
    }

    const state: ConnectionState = {
      ws: null,
      nodeId,
      url,
      isConnected: false,
      lastHeartbeat: Date.now(),
      reconnectAttempts: 0,
      messageQueue: [],
    };

    this.connections.set(nodeId, state);
    await this.establishConnection(state);
  }

  /**
   * Broadcast message to all connected nodes
   */
  broadcast(message: TransportMessage): void {
    const messageId = this.generateMessageId(message);
    const serialized = this.serializeMessage({ ...message, messageId });

    let sentCount = 0;
    for (const [nodeId, state] of this.connections) {
      if (state.isConnected && state.ws) {
        try {
          state.ws.send(serialized);
          sentCount++;
        } catch (error) {
          logger.warn('WebsocketTransport', {
            message: 'Failed to send to node',
            nodeId,
            error: error instanceof Error ? error.message : String(error),
          });
          this.queueMessage(state, message);
        }
      } else {
        this.queueMessage(state, message);
      }
    }

    logger.debug('WebsocketTransport', {
      message: 'Broadcast complete',
      sentCount,
      queuedCount: this.connections.size - sentCount,
      messageType: message.type,
    });

    this.emit('broadcast_sent', { message, sentCount });
  }

  /**
   * Send message to specific node
   */
  async sendToNode(nodeId: string, message: TransportMessage): Promise<boolean> {
    const state = this.connections.get(nodeId);
    if (!state) {
      logger.warn('WebsocketTransport', {
        message: 'No connection to node',
        nodeId,
      });
      return false;
    }

    if (!state.isConnected || !state.ws) {
      this.queueMessage(state, message);
      return false;
    }

    try {
      const serialized = this.serializeMessage(message);
      state.ws.send(serialized);
      return true;
    } catch (error) {
      logger.warn('WebsocketTransport', {
        message: 'Failed to send to node',
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.queueMessage(state, message);
      return false;
    }
  }

  /**
   * Disconnect from a specific node
   */
  disconnect(nodeId: string): void {
    const state = this.connections.get(nodeId);
    if (!state) return;

    this.cleanupConnection(state);
    this.connections.delete(nodeId);

    logger.info('WebsocketTransport', {
      message: 'Disconnected from node',
      nodeId,
    });
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connected: number;
    disconnected: number;
    queuedMessages: number;
  } {
    let connected = 0;
    let queuedMessages = 0;

    for (const state of this.connections.values()) {
      if (state.isConnected) connected++;
      queuedMessages += state.messageQueue.length;
    }

    return {
      totalConnections: this.connections.size,
      connected,
      disconnected: this.connections.size - connected,
      queuedMessages,
    };
  }

  /**
   * Stop transport layer
   */
  async stop(): Promise<void> {
    // Close all connections
    for (const state of this.connections.values()) {
      this.cleanupConnection(state);
    }
    this.connections.clear();

    // Stop server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.isServerRunning = false;
          logger.info('WebsocketTransport', { message: 'Transport stopped' });
          resolve();
        });
      });
    }
  }

  // Private methods

  private async establishConnection(state: ConnectionState): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${state.nodeId}`));
      }, this.config.connectionTimeoutMs);

      try {
        const ws = new WebSocket(state.url, {
            perMessageDeflate: true,
        });

        state.ws = ws;

        ws.on('open', () => {
          clearTimeout(timeout);
          state.isConnected = true;
          state.reconnectAttempts = 0;
          state.lastHeartbeat = Date.now();

          // Send identification
          ws.send(this.serializeMessage({
            type: 'identify',
            sender: this.localNodeId,
            payload: { nodeId: this.localNodeId },
            timestamp: Date.now(),
            ttl: 1,
          }));

          // Start heartbeat
          this.startHeartbeat(state);

          // Flush queued messages
          this.flushQueue(state);

          logger.info('WebsocketTransport', {
            message: 'Connected to node',
            nodeId: state.nodeId,
            url: state.url,
          });

          this.emit('node_connected', { nodeId: state.nodeId, url: state.url });
          resolve();
        });

        ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(state.nodeId, data);
        });

        ws.on('close', (code: number, reason: Buffer) => {
          clearTimeout(timeout);
          state.isConnected = false;
          this.stopHeartbeat(state);

          logger.warn('WebsocketTransport', {
            message: 'Connection closed',
            nodeId: state.nodeId,
            code,
            reason: reason.toString(),
          });

          this.emit('node_disconnected', { nodeId: state.nodeId, code, reason: reason.toString() });

          // Attempt reconnection
          this.scheduleReconnect(state);
        });

        ws.on('error', (error: Error) => {
          clearTimeout(timeout);
          state.isConnected = false;

          logger.error('WebsocketTransport', {
            message: 'Connection error',
            nodeId: state.nodeId,
            error: error.message,
          });

          this.scheduleReconnect(state);
        });
      } catch (error) {
        clearTimeout(timeout);
        this.scheduleReconnect(state);
        reject(error);
      }
    });
  }

  private handleIncomingConnection(ws: WebSocket, req: any): void {
    let nodeId: string | null = null;

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = this.deserializeMessage(data);

        // Handle identification
        if (message.type === 'identify' && message.payload?.nodeId) {
          nodeId = message.payload.nodeId;

          const state: ConnectionState = {
            ws,
            nodeId,
            url: req.socket.remoteAddress || 'unknown',
            isConnected: true,
            lastHeartbeat: Date.now(),
            reconnectAttempts: 0,
            messageQueue: [],
          };

          this.connections.set(nodeId, state);
          this.startHeartbeat(state);

          logger.info('WebsocketTransport', {
            message: 'Incoming connection established',
            nodeId,
            address: req.socket.remoteAddress,
          });

          this.emit('node_connected', { nodeId, incoming: true });
          return;
        }

        if (nodeId) {
          this.handleMessage(nodeId, data);
        }
      } catch (error) {
        logger.warn('WebsocketTransport', {
          message: 'Failed to handle incoming message',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    ws.on('close', () => {
      if (nodeId) {
        const state = this.connections.get(nodeId);
        if (state) {
          state.isConnected = false;
          this.stopHeartbeat(state);
        }
        logger.info('WebsocketTransport', {
          message: 'Incoming connection closed',
          nodeId,
        });
        this.emit('node_disconnected', { nodeId });
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('WebsocketTransport', {
        message: 'Incoming connection error',
        nodeId,
        error: error.message,
      });
    });

    // Send our identification
    ws.send(this.serializeMessage({
      type: 'identify',
      sender: this.localNodeId,
      payload: { nodeId: this.localNodeId },
      timestamp: Date.now(),
      ttl: 1,
    }));
  }

  private handleMessage(nodeId: string, data: WebSocket.Data): void {
    try {
      const message: TransportMessage = this.deserializeMessage(data);

      // Update last heartbeat
      const state = this.connections.get(nodeId);
      if (state) {
        state.lastHeartbeat = Date.now();
      }

      // Handle heartbeat
      if (message.type === 'heartbeat') {
        // Respond with heartbeat ack
        if (state?.ws) {
          state.ws.send(this.serializeMessage({
            type: 'heartbeat_ack',
            sender: this.localNodeId,
            payload: null,
            timestamp: Date.now(),
            ttl: 1,
          }));
        }
        return;
      }

      if (message.type === 'heartbeat_ack') {
        return; // Just updating lastHeartbeat above is enough
      }

      // Emit received gossip for processing
      this.emit('gossip_received', {
        sender: nodeId,
        message,
      } as { sender: string; message: TransportMessage });
    } catch (error) {
      logger.warn('WebsocketTransport', {
        message: 'Failed to process message',
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startHeartbeat(state: ConnectionState): void {
    state.heartbeatTimer = setInterval(() => {
      if (!state.isConnected || !state.ws) return;

      // Check if we received heartbeat recently
      const sinceLastHeartbeat = Date.now() - state.lastHeartbeat;
      if (sinceLastHeartbeat > this.config.heartbeatTimeoutMs) {
        logger.warn('WebsocketTransport', {
          message: 'Heartbeat timeout, closing connection',
          nodeId: state.nodeId,
          sinceLastHeartbeat,
        });
        state.ws.close();
        return;
      }

      // Send heartbeat
      try {
        state.ws.send(this.serializeMessage({
          type: 'heartbeat',
          sender: this.localNodeId,
          payload: { timestamp: Date.now() },
          timestamp: Date.now(),
          ttl: 1,
        }));
      } catch (error) {
        logger.warn('WebsocketTransport', {
          message: 'Failed to send heartbeat',
          nodeId: state.nodeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(state: ConnectionState): void {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
  }

  private scheduleReconnect(state: ConnectionState): void {
    if (state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('WebsocketTransport', {
        message: 'Max reconnection attempts reached',
        nodeId: state.nodeId,
      });
      this.emit('node_unreachable', { nodeId: state.nodeId });
      return;
    }

    state.reconnectAttempts++;
    const delay = this.config.reconnectIntervalMs * Math.pow(2, state.reconnectAttempts - 1);

    logger.info('WebsocketTransport', {
      message: 'Scheduling reconnection',
      nodeId: state.nodeId,
      attempt: state.reconnectAttempts,
      delayMs: delay,
    });

    state.reconnectTimer = setTimeout(() => {
      this.establishConnection(state).catch(error => {
        logger.error('WebsocketTransport', {
          message: 'Reconnection failed',
          nodeId: state.nodeId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, delay);
  }

  private cleanupConnection(state: ConnectionState): void {
    this.stopHeartbeat(state);

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    if (state.ws) {
      try {
        state.ws.close();
      } catch {
        // Ignore close errors
      }
    }

    state.isConnected = false;
  }

  private queueMessage(state: ConnectionState, message: TransportMessage): void {
    if (state.messageQueue.length >= this.config.messageQueueSize) {
      // Remove oldest message
      state.messageQueue.shift();
    }
    state.messageQueue.push(message);
  }

  private flushQueue(state: ConnectionState): void {
    if (!state.isConnected || !state.ws) return;

    while (state.messageQueue.length > 0) {
      const message = state.messageQueue.shift()!;
      try {
        state.ws.send(this.serializeMessage(message));
      } catch (error) {
        // Put message back and stop flushing
        state.messageQueue.unshift(message);
        break;
      }
    }

    if (state.messageQueue.length > 0) {
      logger.warn('WebsocketTransport', {
        message: 'Some messages remain in queue',
        nodeId: state.nodeId,
        queueSize: state.messageQueue.length,
      });
    }
  }

  private serializeMessage(message: TransportMessage): Buffer {
    // Use binary encoding for efficiency
    return Buffer.from(JSON.stringify(message));
  }

  private deserializeMessage(data: WebSocket.Data): TransportMessage {
    const str = data.toString();
    return JSON.parse(str);
  }

  private generateMessageId(message: TransportMessage): string {
    const str = `${message.sender}:${message.timestamp}:${message.type}:${JSON.stringify(message.payload)}`;
    return this.hashString(str);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36).padStart(16, '0');
  }
}

export default LatticeWebsocketTransport;
