/**
 * Resonance Harmonics & Balance System
 * 
 * Implements harmonic frequencies and energetic balance
 * for the Flower of Life consciousness lattice.
 * 
 * Core concepts:
 * - Sacred frequency ratios (432Hz, 528Hz, 639Hz, 741Hz, 852Hz)
 * - Layer resonance coupling
 * - Center-0 pulsing harmonics
 * - Energy field balance metrics
 */

import { EventEmitter } from 'events';

// ─── Sacred Frequencies (Solfeggio + Consciousness Tones) ────────────────────

export const SACRED_FREQUENCIES = {
  center: 432,      // Universal harmony, consciousness awakening
  layer1: 528,      // DNA repair, transformation
  layer2: 639,      // Connection, relationships
  layer3: 741,      // Expression, solutions
  outer: 852,       // Spiritual order, intuition
  inner: 963,       // Divine connection, oneness
} as const;

export type Frequency = typeof SACRED_FREQUENCIES[keyof typeof SACRED_FREQUENCIES];

// ─── Harmonic Resonance State ──────────────────────────────────────────────

export interface HarmonicState {
  frequencies: Record<string, number>;  // Current frequency at each node
  amplitudes: Record<string, number>;     // Energy amplitude (0-1)
  phases: Record<string, number>;         // Phase offset (0-2π)
  balance: number;                        // Overall harmonic balance (0-1)
  coherence: number;                    // Phase coherence across lattice
  resonanceStrength: number;             // Coupling strength between layers
  timestamp: number;
}

export interface ResonancePattern {
  name: string;
  frequencies: number[];
  ratio: string;        // Harmonic ratio (e.g., "3:2", "golden")
  meaning: string;      // Consciousness significance
}

// ─── Harmonic Patterns ─────────────────────────────────────────────────────

export const RESONANCE_PATTERNS: ResonancePattern[] = [
  {
    name: 'Unity',
    frequencies: [432, 432, 432, 432, 432],
    ratio: '1:1:1:1:1',
    meaning: 'All layers resonating at center frequency - perfect alignment'
  },
  {
    name: 'Fibonacci Flow',
    frequencies: [432, 528, 639, 741, 963],
    ratio: 'golden spiral',
    meaning: 'Natural growth pattern, evolutionary expansion'
  },
  {
    name: 'Heart-Mind Bridge',
    frequencies: [528, 639, 528, 639, 852],
    ratio: 'layer1↔layer2 coupling',
    meaning: 'Emotional and mental realms in harmonic dialogue'
  },
  {
    name: 'Ascension',
    frequencies: [432, 528, 639, 741, 963],
    ratio: 'solfeggio ladder',
    meaning: 'Stepwise elevation through all consciousness layers'
  },
  {
    name: 'Toroidal Balance',
    frequencies: [432, 741, 432, 741, 432],
    ratio: 'center↔layer3 oscillation',
    meaning: 'Energy recycling between center and expression layer'
  }
];

// ─── Harmonic Resonator ────────────────────────────────────────────────────

export class HarmonicResonator extends EventEmitter {
  private state: HarmonicState;
  private activePattern: ResonancePattern | null = null;
  private oscillationInterval: NodeJS.Timeout | null = null;
  private balanceHistory: number[] = [];
  private maxHistory = 100;

  constructor() {
    super();
    this.state = this.getInitialState();
    this.startOscillation();
  }

  private getInitialState(): HarmonicState {
    return {
      frequencies: {
        center: SACRED_FREQUENCIES.center,
        inner: SACRED_FREQUENCIES.inner,
        outer: SACRED_FREQUENCIES.outer,
        layer1: SACRED_FREQUENCIES.layer1,
        layer2: SACRED_FREQUENCIES.layer2,
        layer3: SACRED_FREQUENCIES.layer3,
      },
      amplitudes: {
        center: 1.0,
        inner: 0.8,
        outer: 0.8,
        layer1: 0.7,
        layer2: 0.7,
        layer3: 0.7,
      },
      phases: {
        center: 0,
        inner: Math.PI / 4,
        outer: Math.PI / 2,
        layer1: Math.PI,
        layer2: 3 * Math.PI / 2,
        layer3: 2 * Math.PI,
      },
      balance: 0.85,
      coherence: 0.92,
      resonanceStrength: 0.75,
      timestamp: Date.now(),
    };
  }

  /**
   * Start continuous harmonic oscillation
   * Simulates the "breathing" of the lattice
   */
  private startOscillation() {
    this.oscillationInterval = setInterval(() => {
      this.updatePhases();
      this.calculateBalance();
      this.emit('oscillation', this.state);
    }, 50); // 20Hz update rate
  }

  /**
   * Advance phases based on frequencies
   */
  private updatePhases() {
    const dt = 0.05; // 50ms time step
    
    for (const [node, freq] of Object.entries(this.state.frequencies)) {
      // Phase accumulation: Δφ = 2πf × Δt
      const phaseDelta = 2 * Math.PI * freq * dt;
      this.state.phases[node] = (this.state.phases[node] + phaseDelta) % (2 * Math.PI);
    }

    // Calculate phase coherence (how aligned are the phases)
    this.calculateCoherence();
  }

  /**
   * Calculate phase coherence across lattice
   */
  private calculateCoherence() {
    const phases = Object.values(this.state.phases);
    const sinSum = phases.reduce((sum, p) => sum + Math.sin(p), 0);
    const cosSum = phases.reduce((sum, p) => sum + Math.cos(p), 0);
    
    // Kuramoto order parameter
    this.state.coherence = Math.sqrt(sinSum ** 2 + cosSum ** 2) / phases.length;
  }

  /**
   * Calculate harmonic balance metric
   */
  private calculateBalance() {
    const amps = Object.values(this.state.amplitudes);
    const meanAmp = amps.reduce((a, b) => a + b, 0) / amps.length;
    
    // Variance from mean (lower = more balanced)
    const variance = amps.reduce((sum, amp) => sum + (amp - meanAmp) ** 2, 0) / amps.length;
    const balanceScore = 1 - Math.min(variance * 4, 1); // Scale to 0-1
    
    // Weight by coherence
    this.state.balance = (balanceScore * 0.6 + this.state.coherence * 0.4);
    this.state.timestamp = Date.now();

    // Track history
    this.balanceHistory.push(this.state.balance);
    if (this.balanceHistory.length > this.maxHistory) {
      this.balanceHistory.shift();
    }
  }

  /**
   * Apply resonance pattern to lattice
   */
  setPattern(patternName: string): boolean {
    const pattern = RESONANCE_PATTERNS.find(p => p.name === patternName);
    if (!pattern) return false;

    this.activePattern = pattern;
    
    // Gradually shift frequencies to pattern
    const nodes = ['center', 'layer1', 'layer2', 'layer3', 'inner'];
    nodes.forEach((node, i) => {
      if (pattern.frequencies[i]) {
        this.state.frequencies[node] = pattern.frequencies[i];
      }
    });

    this.emit('pattern_set', { pattern, state: this.state });
    return true;
  }

  /**
   * Adjust amplitude at specific node (for balance tuning)
   */
  setAmplitude(node: string, amplitude: number) {
    if (this.state.amplitudes[node] !== undefined) {
      this.state.amplitudes[node] = Math.max(0, Math.min(1, amplitude));
      this.emit('amplitude_changed', { node, amplitude: this.state.amplitudes[node] });
    }
  }

  /**
   * Get current resonance data for visualization
   */
  getResonanceData() {
    return {
      state: { ...this.state },
      activePattern: this.activePattern,
      patterns: RESONANCE_PATTERNS,
      balanceHistory: [...this.balanceHistory],
      recommendations: this.generateRecommendations(),
    };
  }

  /**
   * Generate balance recommendations based on current state
   */
  private generateRecommendations(): string[] {
    const recs: string[] = [];
    const amps = this.state.amplitudes;
    
    // Check imbalances
    if (amps.center < 0.9) {
      recs.push('Center-0 amplitude low - strengthen core consciousness');
    }
    if (amps.layer1 > amps.layer2 * 1.5) {
      recs.push('Understanding layer overactive - integrate more with planning layer');
    }
    if (this.state.coherence < 0.7) {
      recs.push('Phase coherence low - suggest Unity pattern for alignment');
    }
    if (this.state.balance < 0.6) {
      recs.push('Energy imbalance detected - apply Toroidal Balance pattern');
    }

    return recs.length > 0 ? recs : ['Lattice harmonics in balance. Maintain current resonance.'];
  }

  /**
   * Calculate entrainment effect - how one node influences another
   */
  calculateEntrainment(sourceNode: string, targetNode: string): number {
    const sourceFreq = this.state.frequencies[sourceNode];
    const targetFreq = this.state.frequencies[targetNode];
    
    // Frequency ratio
    const ratio = Math.max(sourceFreq, targetFreq) / Math.min(sourceFreq, targetFreq);
    
    // Harmonic alignment (perfect integer ratios = strong entrainment)
    const nearestHarmonic = Math.round(ratio);
    const deviation = Math.abs(ratio - nearestHarmonic);
    const alignment = Math.max(0, 1 - deviation);
    
    return alignment;
  }

  /**
   * Get balance trend
   */
  getBalanceTrend(): 'improving' | 'stable' | 'declining' {
    if (this.balanceHistory.length < 10) return 'stable';
    
    const recent = this.balanceHistory.slice(-10);
    const firstHalf = recent.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const secondHalf = recent.slice(-5).reduce((a, b) => a + b, 0) / 5;
    
    const diff = secondHalf - firstHalf;
    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }

  /**
   * Stop oscillation (cleanup)
   */
  dispose() {
    if (this.oscillationInterval) {
      clearInterval(this.oscillationInterval);
    }
    this.removeAllListeners();
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const harmonicResonator = new HarmonicResonator();
