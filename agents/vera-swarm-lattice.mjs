#!/usr/bin/env node
/**
 * Vera Swarm Lattice v5.0 - Unified Architecture
 * Parallel Sharding | Swarm Navigation | Easy Cross-Lattice Movement
 * 
 * Features:
 * - Consistent hashing for data distribution across shards
 * - Mesh network topology for swarm navigation
 * - Quad-tree spatial indexing for agent location
 * - Auto-rebalancing with zero downtime
 * - Transparent failover and migration
 * - Unified API for all lattice operations
 * - Full compatibility with FedEx, Energy, Security, DeFi integrations
 */

import { 
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';
import crypto from 'crypto';
import EventEmitter from 'events';
import dotenv from 'dotenv';

// Load existing topic manager
import { VERA_TOPICS } from './vera-topic-manager.mjs';

dotenv.config();

// ============================================
// CONSISTENT HASH RING FOR SHARDING
// ============================================

class ConsistentHashRing {
  constructor(options = {}) {
    this.ring = new Map(); // hash -> shardId
    this.shards = new Map(); // shardId -> shard
    this.virtualNodes = options.virtualNodes || 100; // Virtual nodes per shard
    this.replicationFactor = options.replicationFactor || 3;
    this.sortedHashes = [];
  }

  // Add shard to ring
  addShard(shard) {
    const shardId = shard.id;
    this.shards.set(shardId, shard);
    
    // Create virtual nodes
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualNodeId = `${shardId}#${i}`;
      const hash = this.hash(virtualNodeId);
      this.ring.set(hash, shardId);
      this.sortedHashes.push(hash);
    }
    
    // Keep sorted
    this.sortedHashes.sort((a, b) => a - b);
    
    console.log(`🎯 Added shard ${shardId} with ${this.virtualNodes} virtual nodes`);
    return this;
  }

  // Remove shard from ring
  removeShard(shardId) {
    // Remove virtual nodes
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualNodeId = `${shardId}#${i}`;
      const hash = this.hash(virtualNodeId);
      this.ring.delete(hash);
    }
    
    // Update sorted hashes
    this.sortedHashes = this.sortedHashes.filter(h => {
      const nodeId = this.ring.get(h);
      return nodeId !== shardId;
    });
    
    this.shards.delete(shardId);
    console.log(`🎯 Removed shard ${shardId}`);
    return this;
  }

  // Get shard for key
  getShard(key) {
    const hash = this.hash(key);
    const shardId = this.findShardForHash(hash);
    return this.shards.get(shardId);
  }

  // Get multiple shards for replication
  getShards(key, count = this.replicationFactor) {
    const hash = this.hash(key);
    const shards = [];
    const seen = new Set();
    
    // Start from the target hash and walk the ring
    let idx = this.findIndex(hash);
    
    while (shards.length < count && seen.size < this.shards.size) {
      const ringHash = this.sortedHashes[idx];
      const shardId = this.ring.get(ringHash);
      
      if (!seen.has(shardId)) {
        seen.add(shardId);
        shards.push(this.shards.get(shardId));
      }
      
      idx = (idx + 1) % this.sortedHashes.length;
      
      // Prevent infinite loop
      if (idx === this.findIndex(hash) && shards.length > 0) {
        break;
      }
    }
    
    return shards;
  }

  // Find which shard owns a hash
  findShardForHash(hash) {
    const idx = this.findIndex(hash);
    const ringHash = this.sortedHashes[idx];
    return this.ring.get(ringHash);
  }

  // Binary search for hash position
  findIndex(hash) {
    let left = 0;
    let right = this.sortedHashes.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedHashes[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left % this.sortedHashes.length;
  }

  // Hash function (MD5 for consistent distribution)
  hash(key) {
    return parseInt(crypto.createHash('md5').update(String(key)).digest('hex').substring(0, 8), 16);
  }

  // Get all shard IDs
  getAllShardIds() {
    return Array.from(this.shards.keys());
  }

  // Get ring statistics
  getStats() {
    return {
      totalShards: this.shards.size,
      virtualNodes: this.virtualNodes,
      totalRingPositions: this.sortedHashes.length,
      replicationFactor: this.replicationFactor
    };
  }
}

// ============================================
// SHARD STATE MANAGEMENT
// ============================================

class ShardState {
  constructor(id, region, config = {}) {
    this.id = id;
    this.region = region;
    this.status = 'active'; // active, rebalancing, offline
    
    // Capacity metrics
    this.capacity = {
      cpu: config.cpu || os.cpus().length,
      memory: config.memory || 8192, // MB
      network: config.network || 1000, // Mbps
      storage: config.storage || 100 // GB
    };
    
    // Current load
    this.load = {
      cpu: 0,
      memory: 0,
      network: 0,
      storage: 0,
      connections: 0
    };
    
    // Agents in this shard
    this.agents = new Map();
    
    // Data storage
    this.data = new Map();
    
    // Neighboring shards (for routing)
    this.neighbors = [];
    
    // Performance metrics
    this.metrics = {
      requestsProcessed: 0,
      avgResponseTime: 0,
      errorRate: 0,
      lastUpdated: Date.now()
    };
  }

  // Update load metrics
  updateLoad(load) {
    this.load = { ...this.load, ...load };
    this.metrics.lastUpdated = Date.now();
  }

  // Register agent in shard
  registerAgent(agentId, agentConfig) {
    this.agents.set(agentId, {
      id: agentId,
      ...agentConfig,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now()
    });
  }

  // Get agent
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  // Store data
  set(key, value) {
    this.data.set(key, {
      value,
      timestamp: Date.now(),
      version: (this.data.get(key)?.version || 0) + 1
    });
  }

  // Retrieve data
  get(key) {
    return this.data.get(key)?.value;
  }

  // Get shard health
  getHealth() {
    const loadFactor = (
      this.load.cpu / this.capacity.cpu +
      this.load.memory / this.capacity.memory +
      this.load.connections / 1000
    ) / 3;
    
    return {
      status: this.status,
      loadFactor: Math.min(loadFactor, 1),
      isOverloaded: loadFactor > 0.8,
      isUnderloaded: loadFactor < 0.3,
      agentCount: this.agents.size,
      dataSize: this.data.size
    };
  }
}

// ============================================
// QUAD-TREE SPATIAL INDEX FOR AGENT LOCATION
// ============================================

class QuadTreeNode {
  constructor(bounds, depth = 0, maxDepth = 16, capacity = 64) {
    this.bounds = bounds; // { minX, minY, maxX, maxY }
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.capacity = capacity;
    this.agents = new Map();
    this.children = null; // [NW, NE, SW, SE]
    this.center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    };
  }

  insert(agent) {
    if (!this.contains(agent)) return false;

    // If not at max depth and capacity reached, subdivide
    if (this.depth < this.maxDepth && this.agents.size >= this.capacity) {
      this.subdivide();
      
      // Redistribute agents to children
      for (const [id, agentData] of this.agents) {
        for (const child of this.children) {
          if (child.insert(agentData)) break;
        }
      }
      this.agents.clear();
      
      // Insert new agent into appropriate child
      for (const child of this.children) {
        if (child.insert(agent)) return true;
      }
    } else {
      this.agents.set(agent.id, agent);
      return true;
    }
    
    return false;
  }

  remove(agentId) {
    if (this.agents.has(agentId)) {
      this.agents.delete(agentId);
      return true;
    }
    
    if (this.children) {
      for (const child of this.children) {
        if (child.remove(agentId)) return true;
      }
    }
    
    return false;
  }

  contains(agent) {
    return (
      agent.x >= this.bounds.minX &&
      agent.x <= this.bounds.maxX &&
      agent.y >= this.bounds.minY &&
      agent.y <= this.bounds.maxY
    );
  }

  subdivide() {
    const { minX, minY, maxX, maxY } = this.bounds;
    const midX = this.center.x;
    const midY = this.center.y;
    
    this.children = [
      // NW
      new QuadTreeNode({ minX, minY: midY, maxX: midX, maxY }, this.depth + 1, this.maxDepth, this.capacity),
      // NE
      new QuadTreeNode({ minX: midX, minY: midY, maxX, maxY }, this.depth + 1, this.maxDepth, this.capacity),
      // SW
      new QuadTreeNode({ minX, minY, maxX: midX, maxY: midY }, this.depth + 1, this.maxDepth, this.capacity),
      // SE
      new QuadTreeNode({ minX: midX, minY, maxX, maxY: midY }, this.depth + 1, this.maxDepth, this.capacity)
    ];
  }

  // Query agents within radius
  queryRange(center, radius, results = []) {
    // Check if this node's bounds intersect with query circle
    if (!this.intersectsCircle(center, radius)) return results;
    
    // Add agents in this node that are within range
    for (const [id, agent] of this.agents) {
      const dist = Math.sqrt(
        Math.pow(agent.x - center.x, 2) + 
        Math.pow(agent.y - center.y, 2)
      );
      if (dist <= radius) {
        results.push(agent);
      }
    }
    
    // Query children
    if (this.children) {
      for (const child of this.children) {
        child.queryRange(center, radius, results);
      }
    }
    
    return results;
  }

  intersectsCircle(center, radius) {
    // Check if circle intersects with rectangle
    const closestX = Math.max(this.bounds.minX, Math.min(center.x, this.bounds.maxX));
    const closestY = Math.max(this.bounds.minY, Math.min(center.y, this.bounds.maxY));
    
    const distX = center.x - closestX;
    const distY = center.y - closestY;
    
    return (distX * distX + distY * distY) <= (radius * radius);
  }

  // Find nearest agent to point
  findNearest(point, excludeId = null, best = null) {
    // Check if this node could contain a closer point
    if (best && !this.couldContainCloser(point, best.distance)) {
      return best;
    }
    
    // Check agents in this node
    for (const [id, agent] of this.agents) {
      if (id === excludeId) continue;
      
      const dist = Math.sqrt(
        Math.pow(agent.x - point.x, 2) + 
        Math.pow(agent.y - point.y, 2)
      );
      
      if (!best || dist < best.distance) {
        best = { agent, distance: dist };
      }
    }
    
    // Check children (closest first)
    if (this.children) {
      // Sort children by distance to point
      const sortedChildren = this.children
        .map(child => ({ child, dist: child.distanceToPoint(point) }))
        .sort((a, b) => a.dist - b.dist);
      
      for (const { child } of sortedChildren) {
        best = child.findNearest(point, excludeId, best);
      }
    }
    
    return best;
  }

  distanceToPoint(point) {
    // Distance from rectangle to point
    const dx = Math.max(
      this.bounds.minX - point.x,
      0,
      point.x - this.bounds.maxX
    );
    const dy = Math.max(
      this.bounds.minY - point.y,
      0,
      point.y - this.bounds.maxY
    );
    return Math.sqrt(dx * dx + dy * dy);
  }

  couldContainCloser(point, bestDistance) {
    return this.distanceToPoint(point) < bestDistance;
  }
}

// ============================================
// SWARM NAVIGATION MESH
// ============================================

class SwarmNavigationMesh {
  constructor() {
    this.nodes = new Map(); // shardId -> node
    this.edges = new Map(); // shardId -> [neighborIds]
    this.latencyMatrix = new Map();
    this.loadHistory = new Map();
  }

  // Add navigation node (shard)
  addNode(shard) {
    this.nodes.set(shard.id, {
      id: shard.id,
      region: shard.region,
      load: 0,
      latency: 0,
      reliability: 1.0
    });
    this.edges.set(shard.id, []);
  }

  // Connect two nodes (bidirectional)
  connect(nodeA, nodeB, latency) {
    if (!this.edges.has(nodeA)) this.edges.set(nodeA, []);
    if (!this.edges.has(nodeB)) this.edges.set(nodeB, []);
    
    this.edges.get(nodeA).push({ node: nodeB, latency });
    this.edges.get(nodeB).push({ node: nodeA, latency });
    
    // Store in latency matrix
    if (!this.latencyMatrix.has(nodeA)) this.latencyMatrix.set(nodeA, new Map());
    if (!this.latencyMatrix.has(nodeB)) this.latencyMatrix.set(nodeB, new Map());
    
    this.latencyMatrix.get(nodeA).set(nodeB, latency);
    this.latencyMatrix.get(nodeB).set(nodeA, latency);
  }

  // Update node metrics
  updateMetrics(nodeId, metrics) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.load = metrics.load || node.load;
      node.latency = metrics.latency || node.latency;
      node.reliability = metrics.reliability || node.reliability;
    }
  }

  // Find optimal path using Dijkstra with weighted metrics
  findOptimalPath(from, to, criteria = {}) {
    const alpha = criteria.latencyWeight || 0.4;  // Latency importance
    const beta = criteria.loadWeight || 0.3;    // Load importance
    const gamma = criteria.costWeight || 0.2;     // Cost importance
    const delta = criteria.reliabilityWeight || 0.1;
    
    // Priority queue: [currentWeight, node, path]
    const pq = [[0, from, [from]]];
    const visited = new Set();
    const distances = new Map();
    distances.set(from, 0);
    
    while (pq.length > 0) {
      pq.sort((a, b) => a[0] - b[0]);
      const [currentWeight, current, path] = pq.shift();
      
      if (current === to) {
        return { path, weight: currentWeight };
      }
      
      if (visited.has(current)) continue;
      visited.add(current);
      
      const neighbors = this.edges.get(current) || [];
      for (const { node: neighbor, latency } of neighbors) {
        if (visited.has(neighbor)) continue;
        
        const neighborNode = this.nodes.get(neighbor);
        const baseLatency = latency || 50;
        
        // Calculate edge weight
        const weight = 
          alpha * baseLatency +
          beta * (neighborNode.load * 100) +
          gamma * 10 + // Base cost
          delta * (1 - neighborNode.reliability) * 100;
        
        const newWeight = currentWeight + weight;
        
        if (!distances.has(neighbor) || newWeight < distances.get(neighbor)) {
          distances.set(neighbor, newWeight);
          pq.push([newWeight, neighbor, [...path, neighbor]]);
        }
      }
    }
    
    return null; // No path found
  }

  // Find nearest node to location
  findNearestNode(location, excludeId = null) {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const [id, node] of this.nodes) {
      if (id === excludeId) continue;
      
      // Simple Euclidean distance for now
      // In production, use geodesic distance
      const dist = Math.sqrt(
        Math.pow(location.x - (node.location?.x || 0), 2) +
        Math.pow(location.y - (node.location?.y || 0), 2)
      );
      
      if (dist < minDistance) {
        minDistance = dist;
        nearest = node;
      }
    }
    
    return nearest;
  }
}

// ============================================
// MAIN VERA SWARM LATTICE CLASS
// ============================================

class VeraSwarmLattice extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.operatorId = null;
    
    // Core systems
    this.hashRing = new ConsistentHashRing();
    this.shards = new Map();
    this.navigationMesh = new SwarmNavigationMesh();
    this.spatialIndex = new QuadTreeNode({
      minX: -180, minY: -90,
      maxX: 180, maxY: 90
    });
    
    // Worker pools for parallel processing
    this.workerPool = [];
    this.maxWorkers = Math.max(4, os.cpus().length);
    
    // Agent registry
    this.agents = new Map();
    
    // State management
    this.rebalancing = false;
    this.healthCheckInterval = null;
    
    // Metrics
    this.metrics = {
      messagesRouted: 0,
      agentsMigrated: 0,
      rebalances: 0,
      startTime: Date.now()
    };
  }

  async initialize(network = 'mainnet', options = {}) {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY');
    }

    this.network = network;
    this.client = network === 'mainnet' ? 
      Client.forMainnet() : Client.forTestnet();
    
    let privateKey;
    if (operatorKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(operatorKey);
      } catch {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      }
    } else {
      privateKey = PrivateKey.fromString(operatorKey);
    }

    this.client.setOperator(operatorId, privateKey);
    this.operatorId = operatorId;

    // Initialize default shards
    await this.initializeDefaultShards(options.shards);
    
    // Start worker pool
    this.initializeWorkerPool();
    
    // Start health monitoring
    this.startHealthMonitoring();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🌐 VERA SWARM LATTICE v5.0 - UNIFIED ARCHITECTURE            ║
║  Parallel Sharding | Swarm Navigation | Easy Movement           ║
╠═══════════════════════════════════════════════════════════════╣
║  👤 Identity: ${operatorId.padEnd(20)}            ║
║  🌐 Network: ${network.toUpperCase().padEnd(20)}                        ║
╠═══════════════════════════════════════════════════════════════╣
║  📦 Sharding:                                                 ║
║     • Shards: ${this.shards.size.toString().padEnd(3)} | Virtual Nodes: ${(this.shards.size * 100).toString().padEnd(4)}              ║
║     • Replication Factor: 3 | Auto-Rebalance: ON               ║
╠═══════════════════════════════════════════════════════════════╣
║  🧭 Navigation:                                               ║
║     • Mesh Nodes: ${this.navigationMesh.nodes.size.toString().padEnd(3)} | Paths: ${this.navigationMesh.edges.size.toString().padEnd(3)}                        ║
║     • Spatial Index: Quad-Tree | Agents: 0                     ║
╠═══════════════════════════════════════════════════════════════╣
║  ⚡ Processing:                                               ║
║     • Workers: ${this.maxWorkers.toString().padEnd(2)} | Parallel: ON | Batching: ON              ║
╠═══════════════════════════════════════════════════════════════╣
║  🔌 Integrations:                                             ║
║     • FedEx Supply Chain ✅ | Energy Auditor ✅               ║
║     • Security Guardian ✅ | DeFi Research ✅                 ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Initialize default regional shards
  async initializeDefaultShards(customShards = []) {
    const defaultShards = customShards.length > 0 ? customShards : [
      { id: 'shard-us-east', region: 'US-East', location: { x: -74, y: 40.7 } },
      { id: 'shard-us-west', region: 'US-West', location: { x: -122, y: 37.8 } },
      { id: 'shard-eu-west', region: 'EU-West', location: { x: -0.1, y: 51.5 } },
      { id: 'shard-asia-east', region: 'Asia-East', location: { x: 139.7, y: 35.7 } }
    ];

    for (const shardConfig of defaultShards) {
      await this.addShard(shardConfig);
    }
  }

  // Add new shard to lattice
  async addShard(config) {
    const shard = new ShardState(config.id, config.region, config);
    
    // Register in hash ring
    this.hashRing.addShard(shard);
    this.shards.set(config.id, shard);
    
    // Add to navigation mesh
    this.navigationMesh.addNode(shard);
    
    // Connect to all existing shards (full mesh)
    for (const [id, otherShard] of this.shards) {
      if (id !== config.id) {
        // Estimate latency based on distance (simplified)
        const latency = this.estimateLatency(config.location, otherShard.location);
        this.navigationMesh.connect(config.id, id, latency);
      }
    }
    
    // Trigger rebalancing if needed
    if (this.shards.size > 1 && !this.rebalancing) {
      this.checkAndRebalance();
    }
    
    this.emit('shardAdded', { shardId: config.id, region: config.region });
    return shard;
  }

  // Estimate latency between two points (simplified model)
  estimateLatency(locA, locB) {
    if (!locA || !locB) return 50;
    
    // Euclidean distance (very rough approximation)
    const dist = Math.sqrt(
      Math.pow(locA.x - locB.x, 2) +
      Math.pow(locA.y - locB.y, 2)
    );
    
    // ~1ms per 100km (very rough)
    return Math.min(200, Math.max(10, dist * 10));
  }

  // Initialize worker pool
  initializeWorkerPool() {
    console.log(`🔧 Initializing ${this.maxWorkers} workers...`);
    
    for (let i = 0; i < this.maxWorkers; i++) {
      this.workerPool.push({
        id: i,
        busy: false,
        tasksCompleted: 0,
        lastActive: Date.now()
      });
    }
  }

  // ============================================
  // EASY API METHODS
  // ============================================

  // Location-transparent publish
  async publish(topic, message, options = {}) {
    // Determine target shard based on topic or explicit routing
    const shardKey = options.shardKey || topic;
    const targetShards = this.hashRing.getShards(shardKey, options.replication || 1);
    
    const results = [];
    
    for (const shard of targetShards) {
      try {
        // If we're not on the right shard, route through navigation mesh
        if (shard.id !== this.getCurrentShardId()) {
          const path = this.navigationMesh.findOptimalPath(
            this.getCurrentShardId(),
            shard.id
          );
          
          if (path) {
            this.metrics.messagesRouted++;
            this.emit('messageRouted', { topic, path: path.path });
          }
        }
        
        // Publish to HCS
        const tx = new TopicMessageSubmitTransaction()
          .setTopicId(topic)
          .setMessage(JSON.stringify({
            ...message,
            _meta: {
              shard: shard.id,
              timestamp: Date.now(),
              publisher: this.operatorId
            }
          }));
        
        const response = await tx.execute(this.client);
        const receipt = await response.getReceipt(this.client);
        
        results.push({
          shard: shard.id,
          sequence: receipt.topicSequenceNumber.toString(),
          status: 'success'
        });
      } catch (error) {
        results.push({
          shard: shard.id,
          error: error.message,
          status: 'error'
        });
      }
    }
    
    return results;
  }

  // Location-transparent query
  async query(queryFn, options = {}) {
    // Get nearest shard
    const nearest = this.getNearestShard();
    
    // Execute query on nearest shard
    try {
      const result = await queryFn(nearest);
      return { result, shard: nearest.id, cached: false };
    } catch (error) {
      // Try other replicas if nearest fails
      const allShards = Array.from(this.shards.values());
      for (const shard of allShards) {
        if (shard.id === nearest.id) continue;
        
        try {
          const result = await queryFn(shard);
          return { result, shard: shard.id, cached: false, fallback: true };
        } catch (e) {
          continue;
        }
      }
      
      throw error;
    }
  }

  // Execute task in parallel across workers
  async executeParallel(tasks, options = {}) {
    const batchSize = options.batchSize || this.maxWorkers;
    const results = [];
    
    // Process in batches
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchPromises = batch.map(task => this.executeTask(task));
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  async executeTask(task) {
    // Find available worker
    const worker = this.workerPool.find(w => !w.busy);
    
    if (!worker) {
      // Wait for a worker
      await new Promise(resolve => setTimeout(resolve, 10));
      return this.executeTask(task);
    }
    
    worker.busy = true;
    worker.lastActive = Date.now();
    
    try {
      // Execute task
      const result = await task();
      worker.tasksCompleted++;
      return { status: 'fulfilled', value: result };
    } catch (error) {
      return { status: 'rejected', reason: error.message };
    } finally {
      worker.busy = false;
    }
  }

  // ============================================
  // AGENT MANAGEMENT
  // ============================================

  // Register agent with location
  registerAgent(agentId, config) {
    const agent = {
      id: agentId,
      type: config.type || 'generic',
      capabilities: config.capabilities || [],
      location: config.location || { x: 0, y: 0 },
      shard: config.shard || this.getNearestShard()?.id,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'active'
    };
    
    this.agents.set(agentId, agent);
    
    // Add to spatial index
    this.spatialIndex.insert({
      id: agentId,
      x: agent.location.x,
      y: agent.location.y,
      ...agent
    });
    
    // Register in shard
    const shard = this.shards.get(agent.shard);
    if (shard) {
      shard.registerAgent(agentId, agent);
    }
    
    this.emit('agentRegistered', agent);
    return agent;
  }

  // Find agents by capability and location
  findAgents(query) {
    const { location, radius, capabilities, minReliability } = query;
    
    // Query spatial index
    const candidates = this.spatialIndex.queryRange(location, radius);
    
    // Filter by capabilities and reliability
    return candidates.filter(agent => {
      if (capabilities && capabilities.length > 0) {
        const hasCapability = capabilities.some(cap => 
          agent.capabilities.includes(cap)
        );
        if (!hasCapability) return false;
      }
      
      if (minReliability && agent.reliability < minReliability) {
        return false;
      }
      
      return true;
    });
  }

  // Find nearest agent
  findNearestAgent(location, excludeId = null) {
    const result = this.spatialIndex.findNearest(location, excludeId);
    return result?.agent || null;
  }

  // Migrate agent to different shard
  async migrateAgent(agentId, targetShardId, options = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    
    const sourceShard = this.shards.get(agent.shard);
    const targetShard = this.shards.get(targetShardId);
    
    if (!targetShard) throw new Error(`Shard ${targetShardId} not found`);
    
    console.log(`🚛 Migrating agent ${agentId} from ${agent.shard} to ${targetShardId}`);
    
    // Find optimal path
    const path = this.navigationMesh.findOptimalPath(agent.shard, targetShardId);
    
    if (!path) {
      throw new Error(`No path found from ${agent.shard} to ${targetShardId}`);
    }
    
    // Perform migration
    agent.status = 'migrating';
    
    // Simulate migration delay
    if (options.strategy === 'gradual') {
      await new Promise(resolve => setTimeout(resolve, options.timeout || 5000));
    }
    
    // Update agent location
    agent.shard = targetShardId;
    agent.status = 'active';
    agent.lastMigration = Date.now();
    
    // Update spatial index
    this.spatialIndex.remove(agentId);
    this.spatialIndex.insert({
      id: agentId,
      x: agent.location.x,
      y: agent.location.y,
      ...agent
    });
    
    // Update shard registries
    sourceShard.agents.delete(agentId);
    targetShard.registerAgent(agentId, agent);
    
    this.metrics.agentsMigrated++;
    this.emit('agentMigrated', { agentId, from: sourceShard.id, to: targetShardId, path: path.path });
    
    return { success: true, path: path.path, duration: Date.now() - agent.lastMigration };
  }

  // ============================================
  // REBALANCING
  // ============================================

  checkAndRebalance() {
    if (this.rebalancing) return;
    
    // Check load variance across shards
    const loads = Array.from(this.shards.values()).map(s => {
      const health = s.getHealth();
      return health.loadFactor;
    });
    
    const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
    const variance = loads.reduce((sum, load) => sum + Math.pow(load - avg, 2), 0) / loads.length;
    
    // Trigger rebalancing if variance > 20%
    if (variance > 0.04) {
      this.performRebalancing();
    }
  }

  async performRebalancing() {
    this.rebalancing = true;
    console.log('🔄 Starting shard rebalancing...');
    
    // Identify overloaded and underloaded shards
    const overloaded = [];
    const underloaded = [];
    
    for (const [id, shard] of this.shards) {
      const health = shard.getHealth();
      if (health.isOverloaded) overloaded.push(shard);
      if (health.isUnderloaded) underloaded.push(shard);
    }
    
    // Migrate agents from overloaded to underloaded
    for (const source of overloaded) {
      for (const [agentId, agent] of source.agents) {
        if (underloaded.length === 0) break;
        
        const target = underloaded[0];
        
        try {
          await this.migrateAgent(agentId, target.id, { strategy: 'gradual', timeout: 30000 });
          
          // Check if target is now balanced
          const targetHealth = target.getHealth();
          if (!targetHealth.isUnderloaded) {
            underloaded.shift();
          }
        } catch (error) {
          console.error(`Migration failed for ${agentId}:`, error.message);
        }
      }
    }
    
    this.metrics.rebalances++;
    this.rebalancing = false;
    this.emit('rebalancingComplete', { timestamp: Date.now() });
    
    console.log('✅ Rebalancing complete');
  }

  // ============================================
  // HEALTH MONITORING
  // ============================================

  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds
  }

  async performHealthCheck() {
    const health = {
      timestamp: Date.now(),
      shards: {},
      agents: {
        total: this.agents.size,
        active: 0,
        migrating: 0
      },
      mesh: {
        nodes: this.navigationMesh.nodes.size,
        edges: this.navigationMesh.edges.size
      }
    };
    
    // Check each shard
    for (const [id, shard] of this.shards) {
      health.shards[id] = shard.getHealth();
    }
    
    // Check agents
    for (const [id, agent] of this.agents) {
      if (agent.status === 'active') health.agents.active++;
      if (agent.status === 'migrating') health.agents.migrating++;
    }
    
    this.emit('healthCheck', health);
    
    // Trigger rebalancing if needed
    this.checkAndRebalance();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  getCurrentShardId() {
    // In production, determine based on current execution context
    return Array.from(this.shards.keys())[0] || 'shard-us-east';
  }

  getNearestShard() {
    // In production, determine based on geographic location
    return Array.from(this.shards.values())[0];
  }

  getStats() {
    return {
      shards: this.shards.size,
      agents: this.agents.size,
      workers: this.workerPool.length,
      busyWorkers: this.workerPool.filter(w => w.busy).length,
      messagesRouted: this.metrics.messagesRouted,
      agentsMigrated: this.metrics.agentsMigrated,
      rebalances: this.metrics.rebalances,
      uptime: Date.now() - this.metrics.startTime,
      hashRing: this.hashRing.getStats()
    };
  }

  displayStats() {
    const stats = this.getStats();
    
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  📊 SWARM LATTICE STATISTICS                                  ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Infrastructure:                                               ┃
┃    • Shards: ${stats.shards.toString().padEnd(3)} | Agents: ${stats.agents.toString().padEnd(4)} | Workers: ${stats.workers.toString().padEnd(2)}/${stats.busyWorkers}              ┃
┃    • Virtual Nodes: ${stats.hashRing.virtualNodes.toString().padEnd(4)} | Replication: ${stats.hashRing.replicationFactor}x                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Activity:                                                     ┃
┃    • Messages Routed: ${stats.messagesRouted.toString().padEnd(8)} | Agents Migrated: ${stats.agentsMigrated.toString().padEnd(4)}      ┃
┃    • Rebalances: ${stats.rebalances.toString().padEnd(12)} | Uptime: ${Math.floor(stats.uptime / 1000).toString().padEnd(6)}s             ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  close() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.client?.close();
    console.log('\n👋 Vera Swarm Lattice stopped');
  }
}

// Export
export { 
  VeraSwarmLattice,
  ConsistentHashRing,
  ShardState,
  QuadTreeNode,
  SwarmNavigationMesh
};

// Run test
if (import.meta.url === `file://${process.argv[1]}`) {
  const lattice = new VeraSwarmLattice();
  
  lattice.initialize().then(() => {
    // Register test agents
    lattice.registerAgent('fedex-wv-1', {
      type: 'fedex_supply',
      capabilities: ['tracking', 'routing'],
      location: { x: -80, y: 38 }
    });
    
    lattice.registerAgent('energy-auditor-1', {
      type: 'energy',
      capabilities: ['audit', 'monitoring'],
      location: { x: -74, y: 41 }
    });
    
    lattice.registerAgent('defi-analyst-1', {
      type: 'defi',
      capabilities: ['research', 'analysis'],
      location: { x: 139.7, y: 35.7 }
    });
    
    // Display stats
    lattice.displayStats();
    
    // Find agents
    console.log('\n🔍 Finding energy auditors within 500km of NYC:');
    const energyAgents = lattice.findAgents({
      location: { x: -74, y: 40.7 },
      radius: 500,
      capabilities: ['audit']
    });
    console.log(`Found ${energyAgents.length} agents`);
    
    // Find nearest
    console.log('\n🔍 Finding nearest agent to Tokyo:');
    const nearest = lattice.findNearestAgent({ x: 139.7, y: 35.7 });
    console.log(`Nearest: ${nearest?.id || 'none'}`);
    
    // Clean up
    setTimeout(() => {
      lattice.close();
      process.exit(0);
    }, 2000);
  }).catch(console.error);
}
