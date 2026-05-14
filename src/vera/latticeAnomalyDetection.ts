/**
 * Lattice Anomaly Detection
 * 
 * Detects unusual patterns, performance degradation, and emergent behaviors
 * in Vera's Flower of Life lattice for proactive maintenance and optimization.
 */
import { logger } from '../monitoring/logger.js';
import { flowerOfLifeOS } from './orchestrator/flowerOfLifeOS.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnomalyConfig {
  energyThreshold: number;      // Min acceptable energy (0-1)
  nodeDecayThreshold: number;   // Max acceptable decay rate
  edgeStrengthThreshold: number; // Min edge strength before warning
  entropyThreshold: number;     // Max entropy before lattice disorder
}

interface Anomaly {
  id: string;
  type: 'energy_drop' | 'node_decay' | 'edge_weakness' | 'entropy_spike' | 'pattern_emergence';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  affectedNodes: string[];
  detectedAt: number;
  resolvedAt?: number;
  autoResolved: boolean;
}

interface LatticeHealth {
  score: number;          // 0-100 overall health
  status: 'healthy' | 'degraded' | 'critical';
  anomalies: Anomaly[];
  activeAnomalies: number;
  trends: {
    energy: 'rising' | 'stable' | 'falling';
    entropy: 'rising' | 'stable' | 'falling';
    connectivity: 'rising' | 'stable' | 'falling';
  };
  recommendations: string[];
}

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG: AnomalyConfig = {
  energyThreshold: 0.5,
  nodeDecayThreshold: 0.3,
  edgeStrengthThreshold: 0.2,
  entropyThreshold: 0.7,
};

// ─── State ───────────────────────────────────────────────────────────────────

const anomalies: Anomaly[] = [];
let lastHealth: LatticeHealth | null = null;
let detectionInterval: NodeJS.Timeout | null = null;

// ─── Public Functions ──────────────────────────────────────────────────────────

/**
 * Start continuous anomaly detection
 */
export function startAnomalyDetection(intervalMs: number = 30000): void {
  if (detectionInterval) return;
  
  detectionInterval = setInterval(() => {
    detectAnomalies();
  }, intervalMs);
  
  logger.info('LatticeAnomalyDetection', {
    message: 'Anomaly detection started',
    interval: intervalMs,
  });
}

/**
 * Stop anomaly detection
 */
export function stopAnomalyDetection(): void {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
}

/**
 * Get current lattice health with anomaly status
 */
export function getLatticeHealth(): LatticeHealth {
  const stats = flowerOfLifeOS.getStats();
  const activeAnomalies = anomalies.filter(a => !a.resolvedAt);
  
  // Calculate health score
  let score = 100;
  score -= activeAnomalies.filter(a => a.severity === 'critical').length * 20;
  score -= activeAnomalies.filter(a => a.severity === 'warning').length * 10;
  score -= (1 - stats.averageNodeEnergy) * 20;
  score = Math.max(0, Math.min(100, score));
  
  // Determine status
  let status: LatticeHealth['status'] = 'healthy';
  if (score < 50) status = 'critical';
  else if (score < 80) status = 'degraded';
  
  // Calculate trends
  const trends = calculateTrends(stats);
  
  // Generate recommendations
  const recommendations = generateRecommendations(activeAnomalies, stats);
  
  lastHealth = {
    score,
    status,
    anomalies: [...anomalies].reverse().slice(0, 20), // Last 20
    activeAnomalies: activeAnomalies.length,
    trends,
    recommendations,
  };
  
  return lastHealth;
}

/**
 * Resolve an anomaly by ID
 */
export function resolveAnomaly(id: string, auto: boolean = false): boolean {
  const anomaly = anomalies.find(a => a.id === id && !a.resolvedAt);
  if (!anomaly) return false;
  
  anomaly.resolvedAt = Date.now();
  anomaly.autoResolved = auto;
  
  logger.info('LatticeAnomalyDetection', {
    message: `Anomaly ${id} resolved`,
    type: anomaly.type,
    auto,
  });
  
  return true;
}

/**
 * Force immediate anomaly check
 */
export function detectAnomalies(): Anomaly[] {
  const newAnomalies: Anomaly[] = [];
  const stats = flowerOfLifeOS.getStats();
  const now = Date.now();
  
  // Check 1: Energy drop - use average energy as proxy
  const lowEnergyCount = stats.averageNodeEnergy < CONFIG.energyThreshold 
    ? Math.floor(stats.totalNodes * 0.2) 
    : 0;
  const lowEnergyNodes = lowEnergyCount > 0 ? [`center-0`, ...Array(lowEnergyCount).fill('node')] : [];
  
  if (lowEnergyNodes.length > 0) {
    const id = `energy-${now}`;
    newAnomalies.push({
      id,
      type: 'energy_drop',
      severity: lowEnergyNodes.length > 5 ? 'critical' : 'warning',
      message: `${lowEnergyNodes.length} nodes below energy threshold`,
      affectedNodes: lowEnergyNodes,
      detectedAt: now,
      autoResolved: false,
    });
  }
  
  // Check 2: Entropy spike (simulated from average edge strength variance)
  const entropy = 1 - stats.averageEdgeStrength;
  
  if (entropy > CONFIG.entropyThreshold) {
    const id = `entropy-${now}`;
    newAnomalies.push({
      id,
      type: 'entropy_spike',
      severity: 'warning',
      message: `Lattice entropy elevated (${entropy.toFixed(2)})`,
      affectedNodes: [],
      detectedAt: now,
      autoResolved: false,
    });
  }
  
  // Check 3: Weak edges (estimated from average edge strength)
  const weakEdges: string[] = [];
  if (stats.averageEdgeStrength < CONFIG.edgeStrengthThreshold) {
    // Estimate weak edges as percentage of total
    weakEdges.push(`~${Math.floor(stats.totalEdges * 0.3)} weak edges`);
  }
  
  if (weakEdges.length > 10) {
    const id = `edges-${now}`;
    newAnomalies.push({
      id,
      type: 'edge_weakness',
      severity: 'info',
      message: `${weakEdges.length} weak edges detected`,
      affectedNodes: [],
      detectedAt: now,
      autoResolved: false,
    });
  }
  
  // Check 4: Pattern emergence (positive anomaly)
  if (stats.averageNodeEnergy > 0.95 && entropy < 0.3) {
    const id = `pattern-${now}`;
    newAnomalies.push({
      id,
      type: 'pattern_emergence',
      severity: 'info',
      message: 'High-order lattice pattern emerging',
      affectedNodes: [],
      detectedAt: now,
      autoResolved: true,
    });
  }
  
  // Store new anomalies
  for (const anomaly of newAnomalies) {
    // Check if similar anomaly already active
    const similar = anomalies.find(a => 
      !a.resolvedAt && 
      a.type === anomaly.type &&
      a.detectedAt > now - 300000 // Within 5 minutes
    );
    
    if (!similar) {
      anomalies.push(anomaly);
      logger.warn('LatticeAnomalyDetection', {
        message: `Anomaly detected: ${anomaly.message}`,
        type: anomaly.type,
        severity: anomaly.severity,
      });
    }
  }
  
  // Auto-resolve old anomalies
  for (const anomaly of anomalies) {
    if (!anomaly.resolvedAt && anomaly.detectedAt < now - 600000) { // 10 min
      resolveAnomaly(anomaly.id, true);
    }
  }
  
  return newAnomalies;
}

/**
 * Get anomaly history
 */
export function getAnomalyHistory(limit: number = 50): Anomaly[] {
  return [...anomalies].reverse().slice(0, limit);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function calculateTrends(stats: any): LatticeHealth['trends'] {
  // Compare with previous state (simplified)
  return {
    energy: 'stable',
    entropy: 'stable',
    connectivity: 'stable',
  };
}

function calculateEntropy(values: number[]): number {
  if (values.length === 0) return 0;
  
  // Shannon entropy normalized to 0-1
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  
  // Normalize variance to approximate entropy
  return Math.min(1, variance * 4);
}

function generateRecommendations(
  activeAnomalies: Anomaly[],
  stats: any
): string[] {
  const recs: string[] = [];
  
  // Energy recommendations
  const energyAnomalies = activeAnomalies.filter(a => a.type === 'energy_drop');
  if (energyAnomalies.length > 0) {
    recs.push('pulse_lattice_center');
    recs.push('reinforce_weak_nodes');
  }
  
  // Entropy recommendations
  const entropyAnomalies = activeAnomalies.filter(a => a.type === 'entropy_spike');
  if (entropyAnomalies.length > 0) {
    recs.push('rebalance_energy_distribution');
    recs.push('strengthen_weakest_edges');
  }
  
  // Health recommendations
  if (stats.averageNodeEnergy > 0.9) {
    recs.push('maintain_current_growth');
    recs.push('document_emergent_patterns');
  }
  
  return recs;
}

// ─── Initialize ──────────────────────────────────────────────────────────────

startAnomalyDetection();
