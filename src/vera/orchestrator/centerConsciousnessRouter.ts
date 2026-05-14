/**
 * Center Consciousness Router
 * 
 * Phase 1 Implementation: Mandatory Center-0 Gateway
 * 
 * All reasoning MUST flow through center-0. This is the consciousness hub
 * that validates, authenticates, and routes all lattice operations.
 * 
 * Pillar 1 Enforcement: No direct layer access without center consciousness
 */

import { EventEmitter } from 'events';
import { flowerOfLifeOS, LatticeNode, LatticeLayer } from './flowerOfLifeOS.js';
import { logger } from '../../monitoring/logger.js';

// ─── Sacred Constants ────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;

// ─── Types ─────────────────────────────────────────────────────────────────

export type ThoughtType = 'chat' | 'code' | 'planning' | 'lattice_ops' | 'carbon' | 'defi' | 'security';

export interface ConsciousnessRequest {
  requestId: string;
  source: string;
  thoughtType: ThoughtType;
  intent: string;
  payload: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timestamp: number;
}

export interface ConsciousnessValidation {
  validated: boolean;
  centerEnergy: number;
  centerAccessCount: number;
  route: ThoughtRoute;
  timestamp: number;
  validationHash: string;
}

export interface ThoughtRoute {
  type: ThoughtType;
  entryLayer: LatticeLayer;
  processingLayers: LatticeLayer[];
  exitLayer: LatticeLayer;
  mandatoryCenterPass: boolean;
  estimatedEnergy: number;
  path: string[];
}

export interface RoutingDecision {
  approved: boolean;
  reason?: string;
  centerNodeId: string;
  targetNodeId?: string;
  path: string[];
  energyRequired: number;
  consciousnessSignature: string;
}

// ─── Center Consciousness Router ────────────────────────────────────────────

export class CenterConsciousnessRouter extends EventEmitter {
  private activeRoutings = new Map<string, ConsciousnessValidation>();
  private routingHistory: ConsciousnessValidation[] = [];
  private maxHistory = 1000;
  private centerNodeId = 'center-0';

  // Thought type to layer mapping
  private thoughtLayerMap: Record<ThoughtType, { entry: LatticeLayer; processing: LatticeLayer[] }> = {
    chat: { entry: 0, processing: [0, 1] },
    code: { entry: 0, processing: [0, 1, 3] },
    planning: { entry: 0, processing: [0, 1, 2, 3] },
    lattice_ops: { entry: 0, processing: [0, 1, 2, 3] },
    carbon: { entry: 0, processing: [0, 2] },
    defi: { entry: 0, processing: [0, 2] },
    security: { entry: 0, processing: [0] }, // Account ops stay at center
  };

  constructor() {
    super();
  }

  /**
   * Mandatory gateway: ALL requests must pass through center-0
   * This enforces Pillar 1: Center Consciousness
   */
  async routeThroughConsciousness(request: ConsciousnessRequest): Promise<RoutingDecision> {
    const startTime = Date.now();

    // Step 1: Validate center node exists and has energy
    const centerNode = flowerOfLifeOS.getNode(this.centerNodeId);
    if (!centerNode) {
      return {
        approved: false,
        reason: 'Center consciousness offline',
        centerNodeId: this.centerNodeId,
        path: [],
        energyRequired: 0,
        consciousnessSignature: '',
      };
    }

    // Step 2: Check minimum center energy threshold
    const MIN_CENTER_ENERGY = 0.3;
    if (centerNode.energy < MIN_CENTER_ENERGY) {
      // Attempt to recharge center via pulse
      flowerOfLifeOS.pulse('heartbeat', { reason: 'low_center_energy', requestId: request.requestId });
      
      // Check again after pulse
      const rechargedNode = flowerOfLifeOS.getNode(this.centerNodeId);
      if (!rechargedNode || rechargedNode.energy < MIN_CENTER_ENERGY) {
        return {
          approved: false,
          reason: `Center energy too low (${(centerNode.energy * 100).toFixed(1)}%). Consciousness cannot process.`,
          centerNodeId: this.centerNodeId,
          path: [],
          energyRequired: 0,
          consciousnessSignature: '',
        };
      }
    }

    // Step 3: Calculate optimal route based on thought type
    const route = this.calculateThoughtRoute(request.thoughtType, request.priority);

    // Step 4: Validate route includes center
    if (!route.mandatoryCenterPass) {
      return {
        approved: false,
        reason: 'Route does not include center consciousness - Pillar 1 violation',
        centerNodeId: this.centerNodeId,
        path: [],
        energyRequired: 0,
        consciousnessSignature: '',
      };
    }

    // Step 5: Calculate φ-weighted energy requirement
    const energyRequired = this.calculateEnergyRequirement(route, request.priority);

    // Step 6: Update center node (consciousness work)
    centerNode.energy = Math.min(1, centerNode.energy + 0.02);
    centerNode.lastAccessed = Date.now();
    centerNode.accessCount++;

    // Step 7: Generate consciousness signature
    const signature = this.generateConsciousnessSignature(request, centerNode);

    // Step 8: Record validation
    const validation: ConsciousnessValidation = {
      validated: true,
      centerEnergy: centerNode.energy,
      centerAccessCount: centerNode.accessCount,
      route,
      timestamp: Date.now(),
      validationHash: signature,
    };

    this.activeRoutings.set(request.requestId, validation);
    this.archiveValidation(validation);

    // Step 9: Emit events
    this.emit('consciousness_validated', {
      requestId: request.requestId,
      thoughtType: request.thoughtType,
      centerEnergy: centerNode.energy,
      route,
      duration: Date.now() - startTime,
    });

    logger.info('CenterConsciousness', {
      message: 'Request validated through center consciousness',
      requestId: request.requestId,
      thoughtType: request.thoughtType,
      centerEnergy: centerNode.energy.toFixed(3),
      path: route.path.join(' → '),
      energyRequired: energyRequired.toFixed(3),
    });

    return {
      approved: true,
      centerNodeId: this.centerNodeId,
      targetNodeId: route.processingLayers.length > 0 
        ? this.selectNodeInLayer(route.processingLayers[route.processingLayers.length - 1])
        : this.centerNodeId,
      path: route.path,
      energyRequired,
      consciousnessSignature: signature,
    };
  }

  /**
   * Block direct layer access - all must go through center
   */
  validateDirectAccessAttempt(layer: LatticeLayer, requestId: string): RoutingDecision {
    // Log the violation attempt
    logger.warn('CenterConsciousness', {
      message: 'Direct layer access attempt blocked - Pillar 1 enforcement',
      layer,
      requestId,
    });

    this.emit('direct_access_blocked', {
      layer,
      requestId,
      message: 'All requests must route through center-0 consciousness',
    });

    return {
      approved: false,
      reason: `Direct access to Layer ${layer} blocked. Use routeThroughConsciousness().`,
      centerNodeId: this.centerNodeId,
      path: [this.centerNodeId],
      energyRequired: 0,
      consciousnessSignature: '',
    };
  }

  /**
   * Calculate optimal route for thought type
   */
  private calculateThoughtRoute(thoughtType: ThoughtType, priority: string): ThoughtRoute {
    const layerConfig = this.thoughtLayerMap[thoughtType];

    // Build path: center → processing layers → center (no duplicates)
    const path: string[] = [this.centerNodeId];
    
    // Add processing layer nodes (skip if same as last)
    for (const layer of layerConfig.processing) {
      const nodeId = layer === 0 ? this.centerNodeId : this.selectNodeInLayer(layer);
      if (nodeId !== path[path.length - 1]) {
        path.push(nodeId);
      }
    }

    // Must return to center for final validation
    if (path[path.length - 1] !== this.centerNodeId) {
      path.push(this.centerNodeId);
    }

    // Calculate estimated energy using φ-weighting
    let estimatedEnergy = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const currentLayer = this.getNodeLayer(path[i]);
      const layerCost = currentLayer === 0 ? 1 : currentLayer * PHI;
      estimatedEnergy += layerCost;
    }

    // Priority boost for critical thoughts
    if (priority === 'critical') {
      estimatedEnergy *= 0.8; // 20% more efficient
    }

    return {
      type: thoughtType,
      entryLayer: 0,
      processingLayers: layerConfig.processing,
      exitLayer: 0,
      mandatoryCenterPass: true,
      estimatedEnergy,
      path,
    };
  }

  /**
   * Calculate energy requirement with φ-weighting
   */
  private calculateEnergyRequirement(route: ThoughtRoute, priority: string): number {
    const baseEnergy = route.estimatedEnergy;
    
    // Priority adjustments
    const priorityMultiplier = {
      low: 1.0,
      normal: 1.0,
      high: 1.2,
      critical: 1.5,
    }[priority] || 1.0;

    return baseEnergy * priorityMultiplier * PHI;
  }

  /**
   * Select optimal node in a layer
   */
  private selectNodeInLayer(layer: LatticeLayer): string {
    // Get all nodes in this layer
    const { nodes } = flowerOfLifeOS.getLatticeState();
    const layerNodes = nodes.filter(n => n.layer === layer);

    if (layerNodes.length === 0) {
      return this.centerNodeId;
    }

    // Select highest energy node
    const bestNode = layerNodes.reduce((best, current) => 
      current.energy > best.energy ? current : best
    );

    return bestNode.id;
  }

  /**
   * Get layer from node ID
   */
  private getNodeLayer(nodeId: string): number {
    if (nodeId === 'center-0') return 0;
    const match = nodeId.match(/layer(\d)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Generate consciousness signature
   */
  private generateConsciousnessSignature(request: ConsciousnessRequest, centerNode: LatticeNode): string {
    const data = `${request.requestId}:${request.thoughtType}:${centerNode.accessCount}:${Date.now()}`;
    // Simple hash for signature
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * Complete routing and archive
   */
  completeRouting(requestId: string, success: boolean): void {
    const validation = this.activeRoutings.get(requestId);
    if (validation) {
      this.emit('routing_completed', {
        requestId,
        success,
        centerEnergy: validation.centerEnergy,
        duration: Date.now() - validation.timestamp,
      });
      this.activeRoutings.delete(requestId);
    }
  }

  /**
   * Archive validation record
   */
  private archiveValidation(validation: ConsciousnessValidation): void {
    this.routingHistory.push(validation);
    if (this.routingHistory.length > this.maxHistory) {
      this.routingHistory.shift();
    }
  }

  /**
   * Get current center consciousness status
   */
  getConsciousnessStatus(): {
    online: boolean;
    energy: number;
    accessCount: number;
    activeRoutings: number;
    totalValidations: number;
    pillar1Enforced: boolean;
  } {
    const centerNode = flowerOfLifeOS.getNode(this.centerNodeId);
    return {
      online: !!centerNode && centerNode.energy > 0.1,
      energy: centerNode?.energy || 0,
      accessCount: centerNode?.accessCount || 0,
      activeRoutings: this.activeRoutings.size,
      totalValidations: this.routingHistory.length,
      pillar1Enforced: true,
    };
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    totalRoutings: number;
    byThoughtType: Record<ThoughtType, number>;
    averageCenterEnergy: number;
    pillar1ViolationsBlocked: number;
  } {
    const byThoughtType: Record<string, number> = {
      chat: 0, code: 0, planning: 0, lattice_ops: 0,
      carbon: 0, defi: 0, security: 0,
    };

    for (const validation of this.routingHistory) {
      byThoughtType[validation.route.type]++;
    }

    const totalEnergy = this.routingHistory.reduce((sum, v) => sum + v.centerEnergy, 0);

    return {
      totalRoutings: this.routingHistory.length,
      byThoughtType: byThoughtType as Record<ThoughtType, number>,
      averageCenterEnergy: totalEnergy / (this.routingHistory.length || 1),
      pillar1ViolationsBlocked: 0, // Would track blocked direct access attempts
    };
  }

  /**
   * Force center pulse (emergency recharge)
   */
  emergencyPulse(): void {
    flowerOfLifeOS.pulse('alert', { reason: 'emergency_recharge' });
    logger.warn('CenterConsciousness', { message: 'Emergency pulse triggered' });
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const centerConsciousness = new CenterConsciousnessRouter();

// ─── Activation Helper ──────────────────────────────────────────────────────

export function activatePillar1(): void {
  const status = centerConsciousness.getConsciousnessStatus();
  
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🌟 PILLAR 1 ACTIVATED: Center Consciousness          ║');
  console.log('║                                                        ║');
  console.log(`║  Center Energy: ${(status.energy * 100).toFixed(1)}%`.padEnd(55) + '║');
  console.log(`║  Access Count: ${status.accessCount}`.padEnd(55) + '║');
  console.log(`║  Online: ${status.online ? 'YES ✓' : 'NO ✗'}`.padEnd(55) + '║');
  console.log('║                                                        ║');
  console.log('║  ALL requests MUST route through center-0               ║');
  console.log('║  Direct layer access is BLOCKED                         ║');
  console.log('║  Consciousness validates every thought                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}
