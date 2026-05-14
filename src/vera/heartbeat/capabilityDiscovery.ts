/**
 * Vera Capability Discovery
 *
 * Query and discover agents/nodes by their advertised capabilities.
 * Enables capability-based routing and load balancing.
 */

import { EventEmitter } from 'events';
import {
  CapabilityRegistry,
  EnterpriseCapabilities,
  MinimalCapabilityStatus,
  CapabilityQuery,
} from './capabilityRegistry.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiscoveredNode {
  nodeId: string;
  nodeType: EnterpriseCapabilities['node_type'];
  lastSeen: number;
  status: MinimalCapabilityStatus['status'];
  load: number;
  capabilitiesHash: string;
  capabilities?: EnterpriseCapabilities; // Only if cached
  hcsSequence?: number;
  topicId: string;
}

export interface DiscoveryResult {
  nodes: DiscoveredNode[];
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  queryTimeMs: number;
}

export interface RoutingRecommendation {
  recommended: DiscoveredNode | null;
  alternatives: DiscoveredNode[];
  reason: string;
}

// ─── Capability Discovery Service ────────────────────────────────────────────

export class CapabilityDiscovery extends EventEmitter {
  private nodeCache: Map<string, DiscoveredNode> = new Map();
  private registry: CapabilityRegistry;
  private discoveryTimeoutMs: number;

  constructor(options: { discoveryTimeoutMs?: number } = {}) {
    super();
    this.registry = new CapabilityRegistry();
    this.discoveryTimeoutMs = options.discoveryTimeoutMs || 300_000; // 5 min
  }

  // ─── Discovery API ─────────────────────────────────────────────────────────

  /**
   * Process a heartbeat message from HCS
   */
  processHeartbeat(
    nodeId: string,
    status: MinimalCapabilityStatus,
    topicId: string,
    sequenceNumber?: number,
    fullCapabilities?: EnterpriseCapabilities
  ): void {
    const existing = this.nodeCache.get(nodeId);
    const now = Date.now();

    const node: DiscoveredNode = {
      nodeId,
      nodeType: status.node_type,
      lastSeen: now,
      status: status.status,
      load: status.load,
      capabilitiesHash: status.capabilities_hash,
      capabilities: fullCapabilities || existing?.capabilities,
      hcsSequence: sequenceNumber,
      topicId,
    };

    // Check if capabilities changed
    if (existing && existing.capabilitiesHash !== status.capabilities_hash) {
      this.emit('capabilities_changed', { nodeId, oldHash: existing.capabilitiesHash, newHash: status.capabilities_hash });
    }

    // Check if status changed
    if (existing && existing.status !== status.status) {
      this.emit('status_changed', { nodeId, oldStatus: existing.status, newStatus: status.status });
    }

    // New node discovered
    if (!existing) {
      this.emit('node_discovered', node);
    }

    this.nodeCache.set(nodeId, node);
  }

  /**
   * Find nodes by capability query
   */
  findByCapabilities(query: CapabilityQuery): DiscoveryResult {
    const startTime = Date.now();
    const matching: DiscoveredNode[] = [];
    const now = Date.now();

    for (const node of this.nodeCache.values()) {
      // Skip stale nodes
      if (now - node.lastSeen > this.discoveryTimeoutMs) continue;

      // Skip unhealthy unless explicitly requested
      if (node.status === 'unhealthy' && !query.include_unhealthy) continue;

      // Check if we have full capabilities cached
      if (node.capabilities) {
        // Create temporary registry to test match
        const testRegistry = new CapabilityRegistry(node.capabilities);
        if (testRegistry.matchesQuery(query)) {
          matching.push(node);
        }
      }
    }

    // Sort by load (lowest first), then by last seen (most recent)
    matching.sort((a, b) => {
      if (a.load !== b.load) return a.load - b.load;
      return b.lastSeen - a.lastSeen;
    });

    const healthy = matching.filter(n => n.status === 'healthy').length;
    const degraded = matching.filter(n => n.status === 'degraded').length;
    const unhealthy = matching.filter(n => n.status === 'unhealthy').length;

    return {
      nodes: matching,
      total: matching.length,
      healthy,
      degraded,
      unhealthy,
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get a single node by ID
   */
  getNode(nodeId: string): DiscoveredNode | undefined {
    return this.nodeCache.get(nodeId);
  }

  /**
   * Get all known nodes
   */
  getAllNodes(): DiscoveredNode[] {
    return Array.from(this.nodeCache.values());
  }

  /**
   * Get healthy nodes only
   */
  getHealthyNodes(): DiscoveredNode[] {
    return this.getAllNodes().filter(n => n.status === 'healthy');
  }

  /**
   * Get nodes by type
   */
  getNodesByType(type: EnterpriseCapabilities['node_type']): DiscoveredNode[] {
    return this.getAllNodes().filter(n => n.nodeType === type);
  }

  /**
   * Recommend best node for a task
   */
  recommendForTask(
    query: CapabilityQuery,
    strategy: 'least_loaded' | 'round_robin' | 'random' = 'least_loaded'
  ): RoutingRecommendation {
    const result = this.findByCapabilities(query);

    if (result.nodes.length === 0) {
      return {
        recommended: null,
        alternatives: [],
        reason: 'No nodes match the required capabilities',
      };
    }

    // Filter to healthy only
    const healthy = result.nodes.filter(n => n.status === 'healthy');
    const candidates = healthy.length > 0 ? healthy : result.nodes;

    let recommended: DiscoveredNode;

    switch (strategy) {
      case 'least_loaded':
        // Already sorted by load
        recommended = candidates[0];
        break;

      case 'round_robin':
        // Simple round-robin based on timestamp
        const index = Math.floor(Date.now() / 1000) % candidates.length;
        recommended = candidates[index];
        break;

      case 'random':
        recommended = candidates[Math.floor(Math.random() * candidates.length)];
        break;

      default:
        recommended = candidates[0];
    }

    // Alternatives are other matching nodes (excluding recommended)
    const alternatives = candidates.filter(n => n.nodeId !== recommended.nodeId);

    return {
      recommended,
      alternatives: alternatives.slice(0, 3), // Top 3 alternatives
      reason: `Selected by ${strategy} strategy from ${result.total} matching nodes`,
    };
  }

  /**
   * Check if a specific capability is available in the network
   */
  hasCapability(
    capability: keyof EnterpriseCapabilities['domains'] |
              EnterpriseCapabilities['hedera']['services'][number] |
              EnterpriseCapabilities['ai']['providers'][number]
  ): boolean {
    for (const node of this.nodeCache.values()) {
      if (!node.capabilities) continue;

      // Check domains
      if (node.capabilities.domains[capability as keyof EnterpriseCapabilities['domains']]) {
        return true;
      }

      // Check Hedera services
      if (node.capabilities.hedera.services.includes(capability as EnterpriseCapabilities['hedera']['services'][number])) {
        return true;
      }

      // Check AI providers
      if (node.capabilities.ai.providers.includes(capability as EnterpriseCapabilities['ai']['providers'][number])) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get capability distribution across the network
   */
  getCapabilityDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const node of this.nodeCache.values()) {
      if (!node.capabilities) continue;

      // Count Hedera services
      for (const svc of node.capabilities.hedera.services) {
        distribution[`hedera_${svc}`] = (distribution[`hedera_${svc}`] || 0) + 1;
      }

      // Count AI providers
      for (const provider of node.capabilities.ai.providers) {
        distribution[`ai_${provider}`] = (distribution[`ai_${provider}`] || 0) + 1;
      }

      // Count domains
      for (const [domain, enabled] of Object.entries(node.capabilities.domains)) {
        if (enabled) {
          distribution[`domain_${domain}`] = (distribution[`domain_${domain}`] || 0) + 1;
        }
      }
    }

    return distribution;
  }

  /**
   * Get stale nodes (haven't sent heartbeat recently)
   */
  getStaleNodes(): DiscoveredNode[] {
    const now = Date.now();
    return this.getAllNodes().filter(n => now - n.lastSeen > this.discoveryTimeoutMs);
  }

  /**
   * Remove stale nodes from cache
   */
  pruneStaleNodes(): number {
    const stale = this.getStaleNodes();
    for (const node of stale) {
      this.nodeCache.delete(node.nodeId);
      this.emit('node_removed', { nodeId: node.nodeId, reason: 'stale' });
    }
    return stale.length;
  }

  /**
   * Clear all cached nodes
   */
  clear(): void {
    this.nodeCache.clear();
    this.emit('cleared');
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  /**
   * Get discovery statistics
   */
  getStats() {
    const nodes = this.getAllNodes();
    const now = Date.now();

    return {
      totalNodes: nodes.length,
      healthy: nodes.filter(n => n.status === 'healthy').length,
      degraded: nodes.filter(n => n.status === 'degraded').length,
      unhealthy: nodes.filter(n => n.status === 'unhealthy').length,
      stale: nodes.filter(n => now - n.lastSeen > this.discoveryTimeoutMs).length,
      withFullCapabilities: nodes.filter(n => !!n.capabilities).length,
      averageLoad: nodes.reduce((sum, n) => sum + n.load, 0) / Math.max(1, nodes.length),
    };
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const capabilityDiscovery = new CapabilityDiscovery();
