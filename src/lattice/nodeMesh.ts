/**
 * Quantum Lattice Grid - Distributed Node Mesh
 * 
 * Implements gossip protocol with real networking and cryptography
 * - WebSocket transport for message propagation
 * - Ed25519 signatures for message integrity
 * - O(log n) per node with fanout-based dissemination
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { LatticeWebsocketTransport } from '../vera/lattice/network/WebsocketTransport.js';
import { LatticeCrypto, SignedMessage } from '../vera/lattice/crypto/LatticeCrypto.js';

export interface NodeInfo {
  id: string;
  host: string;
  port: number;
  region: string;
  lastSeen: number;
  status: 'healthy' | 'degraded' | 'offline';
  load: number; // 0.0 - 1.0
  capabilities: string[];
  publicKey?: string; // For signature verification
}

export interface GossipMessage {
  type: 'state' | 'heartbeat' | 'join' | 'leave' | 'topology_change';
  sender: string;
  payload: any;
  timestamp: number;
  ttl: number;
  signature?: string;
  signed?: SignedMessage; // Full cryptographic signature
}

export interface MeshConfig {
  fanout: number;
  interval: number;
  maxNodes: number;
  syncTimeout: number;
  enableCrypto: boolean;
  serverPort: number;
}

export class NodeMesh extends EventEmitter {
  private nodes: Map<string, NodeInfo> = new Map();
  private localNodeId: string;
  private config: MeshConfig;
  private gossipInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageCache: Set<string> = new Set();
  private maxCacheSize = 10000;
  private transport: LatticeWebsocketTransport | null = null;
  private crypto: LatticeCrypto | null = null;

  constructor(localNodeId: string, config: Partial<MeshConfig> = {}) {
    super();
    this.localNodeId = localNodeId;
    this.config = {
      fanout: config.fanout || 3,
      interval: config.interval || 100,
      maxNodes: config.maxNodes || 100,
      syncTimeout: config.syncTimeout || 5000,
      enableCrypto: config.enableCrypto !== false,
      serverPort: config.serverPort || 0, // 0 = don't start server
    };
  }

  /**
   * Initialize the node mesh with real networking and cryptography
   */
  async initialize(seedNodes: NodeInfo[] = []): Promise<void> {
    logger.info('NodeMesh', { 
      nodeId: this.localNodeId,
      config: this.config,
      message: 'Initializing node mesh with real networking' 
    });

    // Initialize cryptography
    if (this.config.enableCrypto) {
      this.crypto = new LatticeCrypto(this.localNodeId);
      logger.info('NodeMesh', { 
        nodeId: this.localNodeId,
        publicKey: this.crypto.getPublicKey().slice(0, 16) + '...',
        message: 'Cryptography initialized' 
      });
    }

    // Initialize WebSocket transport
    this.transport = new LatticeWebsocketTransport(this.localNodeId);
    
    // Setup transport event handlers
    this.transport.on('gossip_received', ({ sender, message }) => {
      this.receiveGossip(message as GossipMessage);
    });

    this.transport.on('node_connected', ({ nodeId, url }) => {
      logger.info('NodeMesh', { nodeId, url, message: 'Node connected via WebSocket' });
    });

    this.transport.on('node_disconnected', ({ nodeId, code }) => {
      logger.warn('NodeMesh', { nodeId, code, message: 'Node disconnected' });
      const node = this.nodes.get(nodeId);
      if (node) {
        node.status = 'offline';
        this.emit('node_offline', node);
      }
    });

    // Start transport server if port specified
    if (this.config.serverPort > 0) {
      await this.transport.startServer(this.config.serverPort);
    }

    // Connect to seed nodes
    for (const node of seedNodes) {
      this.addNode(node);
      // Establish WebSocket connection
      const wsUrl = `ws://${node.host}:${node.port}/lattice`;
      try {
        await this.transport!.connect(node.id, wsUrl);
      } catch (error) {
        logger.warn('NodeMesh', {
          nodeId: node.id,
          url: wsUrl,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to connect to seed node'
        });
      }
    }

    // Start gossip protocol
    this.startGossip();
    this.startHeartbeat();

    this.emit('initialized', { 
      nodeId: this.localNodeId, 
      nodes: this.nodes.size,
      transportReady: true,
      cryptoEnabled: this.config.enableCrypto
    });
  }

  /**
   * Add a node to the mesh
   */
  addNode(node: NodeInfo): void {
    if (this.nodes.has(node.id)) {
      // Update existing node
      const existing = this.nodes.get(node.id)!;
      this.nodes.set(node.id, { ...existing, ...node, lastSeen: Date.now() });
    } else {
      this.nodes.set(node.id, { ...node, lastSeen: Date.now() });
      this.emit('node_added', node);
      logger.info('NodeMesh', { nodeId: node.id, message: 'Node added to mesh' });
    }
  }

  /**
   * Remove a node from the mesh
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      this.emit('node_removed', node);
      logger.info('NodeMesh', { nodeId, message: 'Node removed from mesh' });
    }
  }

  /**
   * Get all healthy nodes
   */
  getHealthyNodes(): NodeInfo[] {
    return Array.from(this.nodes.values())
      .filter(n => n.status === 'healthy');
  }

  /**
   * Get nodes by region
   */
  getNodesByRegion(region: string): NodeInfo[] {
    return Array.from(this.nodes.values())
      .filter(n => n.region === region);
  }

  /**
   * Get least loaded node for task routing
   */
  getLeastLoadedNode(): NodeInfo | null {
    const healthy = this.getHealthyNodes();
    if (healthy.length === 0) return null;
    return healthy.reduce((min, node) => node.load < min.load ? node : min);
  }

  /**
   * Broadcast message via gossip protocol
   */
  broadcast(message: Omit<GossipMessage, 'sender' | 'timestamp' | 'ttl'>): void {
    const fullMessage: GossipMessage = {
      ...message,
      sender: this.localNodeId,
      timestamp: Date.now(),
      ttl: Math.ceil(Math.log2(this.nodes.size + 1)) + 1
    };

    this.gossip(fullMessage);
  }

  /**
   * Gossip protocol implementation
   */
  private gossip(message: GossipMessage): void {
    // Check if already seen
    const messageId = this.hashMessage(message);
    if (this.messageCache.has(messageId)) return;
    this.messageCache.add(messageId);

    // Trim cache if needed
    if (this.messageCache.size > this.maxCacheSize) {
      const iter = this.messageCache.values();
      this.messageCache.delete(iter.next().value);
    }

    // Select random fanout nodes
    const targets = this.selectRandomNodes(this.config.fanout);
    
    for (const target of targets) {
      this.sendToNode(target, message);
    }

    this.emit('gossip_sent', { message, targets: targets.length });
  }

  /**
   * Receive gossip message from another node
   */
  receiveGossip(message: GossipMessage): void {
    // Validate sender
    if (!this.nodes.has(message.sender) && message.sender !== this.localNodeId) {
      // Unknown node - add if join message
      if (message.type === 'join') {
        this.addNode(message.payload);
      }
      return;
    }

    // Check if already seen
    const messageId = this.hashMessage(message);
    if (this.messageCache.has(messageId)) return;

    // Update sender last seen
    const sender = this.nodes.get(message.sender);
    if (sender) {
      sender.lastSeen = Date.now();
      sender.status = 'healthy';
    }

    // Process based on type
    this.processMessage(message);

    // Forward if TTL > 0
    if (message.ttl > 0) {
      this.gossip({ ...message, ttl: message.ttl - 1 });
    }
  }

  /**
   * Process incoming gossip message
   */
  private processMessage(message: GossipMessage): void {
    switch (message.type) {
      case 'state':
        this.emit('state_update', message.payload);
        break;
      case 'heartbeat':
        this.handleHeartbeat(message.sender, message.payload);
        break;
      case 'join':
        this.addNode(message.payload);
        break;
      case 'leave':
        this.removeNode(message.sender);
        break;
      case 'topology_change':
        this.emit('topology_change', message.payload);
        break;
    }
  }

  /**
   * Handle heartbeat from node
   */
  private handleHeartbeat(nodeId: string, payload: any): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.lastSeen = Date.now();
      node.load = payload.load || node.load;
      node.status = payload.status || node.status;
    }
  }

  /**
   * Start gossip protocol loop
   */
  private startGossip(): void {
    this.gossipInterval = setInterval(() => {
      // Broadcast local state periodically
      this.broadcast({
        type: 'state',
        payload: {
          nodeId: this.localNodeId,
          nodeCount: this.nodes.size,
          timestamp: Date.now()
        }
      });
    }, this.config.interval);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    // Send heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        payload: {
          load: this.getLocalLoad(),
          status: 'healthy'
        }
      });
    }, this.config.interval * 3);

    // Check node health
    setInterval(() => {
      this.checkNodeHealth();
    }, this.config.interval * 5);
  }

  /**
   * Check health of all nodes
   */
  private checkNodeHealth(): void {
    const now = Date.now();
    const timeout = this.config.syncTimeout * 3;

    for (const [nodeId, node] of Array.from(this.nodes)) {
      if (now - node.lastSeen > timeout) {
        if (node.status !== 'offline') {
          node.status = 'offline';
          this.emit('node_offline', node);
          logger.warn('NodeMesh', { nodeId, message: 'Node marked offline' });
        }
      } else if (now - node.lastSeen > timeout / 2) {
        node.status = 'degraded';
      }
    }
  }

  /**
   * Select random nodes for gossip
   */
  private selectRandomNodes(count: number): NodeInfo[] {
    const healthy = this.getHealthyNodes()
      .filter(n => n.id !== this.localNodeId);
    
    if (healthy.length <= count) return healthy;

    // Fisher-Yates shuffle
    const shuffled = [...healthy];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }

  /**
   * Send message to specific node using real WebSocket transport
   */
  private sendToNode(node: NodeInfo, message: GossipMessage): void {
    if (!this.transport) {
      // Fallback to event emit if transport not initialized
      this.emit('send_message', { node, message });
      return;
    }

    // Sign message if crypto enabled
    let finalMessage = message;
    if (this.crypto && this.config.enableCrypto) {
      const signed = this.crypto.signMessage(message as unknown as Record<string, unknown>);
      finalMessage = { ...message, signed };
    }

    // Send via WebSocket
    this.transport.sendToNode(node.id, finalMessage).then(sent => {
      if (!sent) {
        logger.debug('NodeMesh', {
          nodeId: node.id,
          messageType: message.type,
          message: 'Message queued for retry'
        });
      }
    });
  }

  /**
   * Get local system load
   */
  private getLocalLoad(): number {
    // Placeholder - would integrate with system metrics
    return 0.5;
  }

  /**
   * Hash message for deduplication
   */
  /**
   * Verify signed message
   */
  verifyMessage(message: GossipMessage): boolean {
    if (!this.crypto || !message.signed) {
      return true; // Accept unsigned if crypto disabled
    }

    const result = this.crypto.verifyMessage(message.signed);
    if (!result.valid) {
      logger.warn('NodeMesh', {
        sender: message.sender,
        error: result.error,
        message: 'Message signature verification failed'
      });
    }
    return result.valid;
  }

  /**
   * Get mesh statistics
   */
  getStats(): any {
    const transportStats = this.transport?.getStats();
    const cryptoStats = this.crypto?.getStats();
    
    return {
      nodeCount: this.nodes.size,
      healthyNodes: this.getHealthyNodes().length,
      localNodeId: this.localNodeId,
      config: this.config,
      messageCacheSize: this.messageCache.size,
      transport: transportStats,
      crypto: cryptoStats,
    };
  }

  /**
   * Stop the mesh and cleanup resources
   */
  async stop(): Promise<void> {
    if (this.gossipInterval) clearInterval(this.gossipInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    
    // Stop transport
    if (this.transport) {
      await this.transport.stop();
    }
    
    // Stop crypto
    if (this.crypto) {
      this.crypto.stop();
    }
    
    // Announce departure
    this.broadcast({ type: 'leave', payload: {} });
    
    logger.info('NodeMesh', { message: 'Node mesh stopped' });
    this.emit('stopped');
  }

  /**
   * Hash message for deduplication
   */
  private hashMessage(message: GossipMessage): string {
    const str = `${message.sender}:${message.timestamp}:${JSON.stringify(message.payload)}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36).padStart(16, '0');
  }
}
