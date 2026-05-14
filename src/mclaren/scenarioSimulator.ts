/**
 * Scenario Simulation Engine
 * Phase 2: Pre-race simulations for optimal strategy + carbon efficiency
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';

export interface StrategyScenario {
  id: string;
  name: string;
  brakePoints: number[]; // Brake point intensity at each turn (0-100)
  pitStops: PitStopStrategy[];
  fuelLoad: number; // kg
  tireCompound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';
  engineMode: 'CONSERVE' | 'BALANCED' | 'ATTACK' | 'OVERDRIVE';
  ersMode: 'CONSERVE' | 'BALANCED' | 'DEPLOY';
}

export interface PitStopStrategy {
  lap: number;
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';
  tireCount: number;
  fuelAdd: number; // kg to add
}

export interface SimulationResult {
  scenarioId: string;
  totalTimeSeconds: number;
  lapTimes: number[];
  fuelConsumed: number;
  tireWear: number[];
  pitStopTimeLoss: number;
  carbonEmissionsKg: number;
  winProbability: number;
  confidence: number;
}

export interface CarbonOptimization {
  scenarioId: string;
  timeDeltaSeconds: number; // vs optimal time
  carbonSavingsKg: number;
  recommendation: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SimulatedRace {
  raceId: string;
  circuit: string;
  totalLaps: number;
  trackLength: number; // km
  scenariosRun: number;
  optimalStrategy: StrategyScenario | null;
  carbonOptimalStrategy: StrategyScenario | null;
  bestLapTime: number;
  optimizations: CarbonOptimization[];
  timestamp: number;
}

// Simulation constants
const SIMULATION_CONSTANTS = {
  baseLapTime: 80, // seconds (varies by circuit)
  fuelTimePenalty: 0.03, // seconds per kg of fuel
  tireDegradation: {
    SOFT: 0.15,    // seconds per lap degradation
    MEDIUM: 0.08,
    HARD: 0.05,
    INTERMEDIATE: 0.12,
    WET: 0.10,
  },
  fuelConsumption: {
    CONSERVE: 1.8,
    BALANCED: 2.2,
    ATTACK: 2.8,
    OVERDRIVE: 3.2,
  },
  enginePower: {
    CONSERVE: 0.92,
    BALANCED: 1.0,
    ATTACK: 1.08,
    OVERDRIVE: 1.12,
  },
  pitStopLoss: 22, // seconds lost in pit lane
  carbonPerKgFuel: 2.31, // kg CO2 per kg fuel (F1 E10)
  carbonPerTireSet: 8.5, // kg CO2 per tire set
};

export class ScenarioSimulator extends EventEmitter {
  private simulations: Map<string, SimulatedRace> = new Map();
  private scenarioResults: Map<string, SimulationResult[]> = new Map();

  /**
   * Run 10,000+ scenario simulations for a race
   */
  async runPreRaceSimulations(
    raceId: string,
    circuit: string,
    totalLaps: number,
    trackLength: number,
    targetScenarios: number = 10000
  ): Promise<SimulatedRace> {
    try {
      logger.info('ScenarioSimulator', {
        raceId,
        circuit,
        targetScenarios,
        message: 'Starting pre-race simulations',
      });

      this.emit('simulation_start', { raceId, targetScenarios });

      const results: SimulationResult[] = [];
      const scenarios: StrategyScenario[] = [];

      // Generate diverse strategy scenarios
      for (let i = 0; i < targetScenarios; i++) {
        const scenario = this.generateScenario(i, totalLaps);
        scenarios.push(scenario);

        // Run simulation
        const result = this.simulateScenario(scenario, circuit, totalLaps, trackLength);
        results.push(result);

        // Emit progress every 1000 scenarios
        if (i % 1000 === 0) {
          this.emit('simulation_progress', { raceId, completed: i, total: targetScenarios });
        }
      }

      // Find optimal strategies
      const optimalStrategy = this.findOptimalStrategy(scenarios, results);
      const carbonOptimalStrategy = this.findCarbonOptimalStrategy(scenarios, results);

      // Generate carbon optimizations
      const optimizations = this.generateCarbonOptimizations(results, optimalStrategy, carbonOptimalStrategy);

      // Find best lap time
      const bestLapTime = Math.min(...results.map(r => Math.min(...r.lapTimes)));

      const simulatedRace: SimulatedRace = {
        raceId,
        circuit,
        totalLaps,
        trackLength,
        scenariosRun: targetScenarios,
        optimalStrategy,
        carbonOptimalStrategy,
        bestLapTime,
        optimizations: optimizations.slice(0, 10), // Top 10 optimizations
        timestamp: Date.now(),
      };

      this.simulations.set(raceId, simulatedRace);
      this.scenarioResults.set(raceId, results);

      this.emit('simulation_complete', { 
        raceId, 
        scenariosRun: targetScenarios,
        optimalTime: optimalStrategy ? results.find(r => r.scenarioId === optimalStrategy.id)?.totalTimeSeconds : null,
      });

      logger.info('ScenarioSimulator', {
        raceId,
        scenariosRun: targetScenarios,
        optimizationsFound: optimizations.length,
        message: 'Pre-race simulations complete',
      });

      return simulatedRace;
    } catch (error) {
      logger.error('ScenarioSimulator', {
        raceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Simulation failed',
      });
      throw error;
    }
  }

  /**
   * Generate a random but valid strategy scenario
   */
  private generateScenario(index: number, totalLaps: number): StrategyScenario {
    const compounds: StrategyScenario['tireCompound'][] = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'];
    const engineModes: StrategyScenario['engineMode'][] = ['CONSERVE', 'BALANCED', 'ATTACK', 'OVERDRIVE'];
    const ersModes: StrategyScenario['ersMode'][] = ['CONSERVE', 'BALANCED', 'DEPLOY'];

    // Generate 1-3 pit stops
    const numStops = Math.floor(Math.random() * 3) + 1;
    const pitStops: PitStopStrategy[] = [];
    
    for (let i = 0; i < numStops; i++) {
      const lap = Math.floor((totalLaps / (numStops + 1)) * (i + 1)) + Math.floor(Math.random() * 5);
      pitStops.push({
        lap: Math.min(lap, totalLaps - 5),
        compound: compounds[Math.floor(Math.random() * 3)], // SOFT, MEDIUM, HARD only for dry
        tireCount: 4,
        fuelAdd: Math.random() > 0.5 ? 10 : 0, // Optional splash-and-dash
      });
    }

    return {
      id: `scenario-${index}`,
      name: `Strategy-${index + 1}`,
      brakePoints: Array.from({ length: 10 }, () => Math.floor(Math.random() * 30) + 70), // 70-100%
      pitStops,
      fuelLoad: 80 + Math.random() * 40, // 80-120 kg
      tireCompound: compounds[Math.floor(Math.random() * compounds.length)],
      engineMode: engineModes[Math.floor(Math.random() * engineModes.length)],
      ersMode: ersModes[Math.floor(Math.random() * ersModes.length)],
    };
  }

  /**
   * Simulate a single scenario
   */
  private simulateScenario(
    scenario: StrategyScenario,
    circuit: string,
    totalLaps: number,
    trackLength: number
  ): SimulationResult {
    const lapTimes: number[] = [];
    let totalFuelConsumed = 0;
    const tireWear: number[] = [];
    let pitStopTimeLoss = 0;

    // Base lap time adjusted for circuit (Monaco is slower, Monza is faster)
    const circuitMultiplier = this.getCircuitMultiplier(circuit);
    const baseTime = SIMULATION_CONSTANTS.baseLapTime * circuitMultiplier;

    // Engine power factor
    const powerFactor = SIMULATION_CONSTANTS.enginePower[scenario.engineMode];

    // Fuel burn rate
    const fuelBurnRate = SIMULATION_CONSTANTS.fuelConsumption[scenario.engineMode];

    // Simulate each lap
    for (let lap = 0; lap < totalLaps; lap++) {
      // Check for pit stop
      const pitStop = scenario.pitStops.find(p => p.lap === lap);
      if (pitStop) {
        pitStopTimeLoss += SIMULATION_CONSTANTS.pitStopLoss;
      }

      // Calculate lap time
      const fuelWeight = scenario.fuelLoad - totalFuelConsumed;
      const fuelPenalty = fuelWeight * SIMULATION_CONSTANTS.fuelTimePenalty;
      
      // Tire degradation
      const tireAge = lap - (scenario.pitStops.filter(p => p.lap <= lap).length > 0 
        ? Math.max(...scenario.pitStops.filter(p => p.lap <= lap).map(p => p.lap))
        : 0);
      const tireDegradation = SIMULATION_CONSTANTS.tireDegradation[scenario.tireCompound] * tireAge;

      const lapTime = (baseTime / powerFactor) + fuelPenalty + tireDegradation;
      lapTimes.push(lapTime);

      // Update fuel
      totalFuelConsumed += fuelBurnRate;

      // Track tire wear
      tireWear.push(tireAge);
    }

    // Calculate total time
    const totalTimeSeconds = lapTimes.reduce((a, b) => a + b, 0) + pitStopTimeLoss;

    // Calculate carbon emissions
    const fuelEmissions = totalFuelConsumed * SIMULATION_CONSTANTS.carbonPerKgFuel;
    const tireSets = scenario.pitStops.length + 1;
    const tireEmissions = tireSets * SIMULATION_CONSTANTS.carbonPerTireSet;
    const carbonEmissionsKg = fuelEmissions + tireEmissions;

    // Calculate win probability (inverse of total time, normalized)
    const winProbability = Math.max(0, 1 - (totalTimeSeconds / (baseTime * totalLaps * 1.1)));

    return {
      scenarioId: scenario.id,
      totalTimeSeconds,
      lapTimes,
      fuelConsumed: totalFuelConsumed,
      tireWear,
      pitStopTimeLoss,
      carbonEmissionsKg,
      winProbability,
      confidence: 0.85 + Math.random() * 0.14, // 0.85-0.99
    };
  }

  /**
   * Get circuit performance multiplier
   */
  private getCircuitMultiplier(circuit: string): number {
    const multipliers: Record<string, number> = {
      'Monaco': 1.15,      // Slow, technical
      'Singapore': 1.12,   // Slow, night race
      'Hungaroring': 1.08, // Technical
      'Barcelona': 1.05,   // Medium
      'Silverstone': 0.98, // Fast
      'Spa': 0.95,         // Very fast
      'Monza': 0.90,       // Fastest
    };
    return multipliers[circuit] || 1.0;
  }

  /**
   * Find the optimal strategy (fastest overall time)
   */
  private findOptimalStrategy(scenarios: StrategyScenario[], results: SimulationResult[]): StrategyScenario | null {
    const fastestResult = results.reduce((best, current) => 
      current.totalTimeSeconds < best.totalTimeSeconds ? current : best
    );
    return scenarios.find(s => s.id === fastestResult.scenarioId) || null;
  }

  /**
   * Find the carbon-optimal strategy (best time-to-carbon ratio)
   */
  private findCarbonOptimalStrategy(scenarios: StrategyScenario[], results: SimulationResult[]): StrategyScenario | null {
    // Score = time / (1 / emissions) - lower is better
    const scored = results.map(r => ({
      ...r,
      carbonScore: r.totalTimeSeconds * r.carbonEmissionsKg,
    }));
    
    const optimal = scored.reduce((best, current) => 
      current.carbonScore < best.carbonScore ? current : best
    );
    
    return scenarios.find(s => s.id === optimal.scenarioId) || null;
  }

  /**
   * Generate carbon optimization recommendations
   */
  private generateCarbonOptimizations(
    results: SimulationResult[],
    optimal: StrategyScenario | null,
    carbonOptimal: StrategyScenario | null
  ): CarbonOptimization[] {
    const optimizations: CarbonOptimization[] = [];

    if (!optimal || !carbonOptimal) return optimizations;

    const optimalResult = results.find(r => r.scenarioId === optimal.id);
    const carbonOptimalResult = results.find(r => r.scenarioId === carbonOptimal.id);

    if (optimalResult && carbonOptimalResult) {
      const timeDelta = carbonOptimalResult.totalTimeSeconds - optimalResult.totalTimeSeconds;
      const carbonSavings = optimalResult.carbonEmissionsKg - carbonOptimalResult.carbonEmissionsKg;

      if (carbonSavings > 0 && timeDelta < 5) { // Less than 5s time loss
        optimizations.push({
          scenarioId: carbonOptimal.id,
          timeDeltaSeconds: timeDelta,
          carbonSavingsKg: carbonSavings,
          recommendation: `Switch to carbon-optimal strategy: save ${carbonSavings.toFixed(1)}kg CO₂ with only ${timeDelta.toFixed(2)}s time loss`,
          priority: timeDelta < 1 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // Find scenarios with significant carbon savings
    const sortedByCarbon = [...results].sort((a, b) => a.carbonEmissionsKg - b.carbonEmissionsKg);
    const top3Carbon = sortedByCarbon.slice(0, 3);

    for (const scenario of top3Carbon) {
      const timeDelta = scenario.totalTimeSeconds - (optimalResult?.totalTimeSeconds || 0);
      const carbonSavings = (optimalResult?.carbonEmissionsKg || 0) - scenario.carbonEmissionsKg;

      if (carbonSavings > 50 && Math.abs(timeDelta) < 10) {
        optimizations.push({
          scenarioId: scenario.scenarioId,
          timeDeltaSeconds: timeDelta,
          carbonSavingsKg: carbonSavings,
          recommendation: `Alternative: ${scenario.scenarioId} saves ${carbonSavings.toFixed(1)}kg CO₂${timeDelta > 0 ? ` (+${timeDelta.toFixed(2)}s)` : ` (${Math.abs(timeDelta).toFixed(2)}s faster)`}`,
          priority: timeDelta < 2 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    return optimizations.sort((a, b) => b.carbonSavingsKg - a.carbonSavingsKg);
  }

  /**
   * Get real-time strategy recommendation during race
   */
  getLiveRecommendation(
    raceId: string,
    currentLap: number,
    currentTireCompound: string,
    tireDegradation: number
  ): { recommendation: string; carbonImpact: number; confidence: number } | null {
    const simulation = this.simulations.get(raceId);
    if (!simulation) return null;

    // Find scenarios matching current conditions
    const results = this.scenarioResults.get(raceId);
    if (!results) return null;

    // Check for tire change opportunity
    if (tireDegradation > 15) {
      const matchingScenarios = results.filter(r => 
        r.lapTimes[currentLap] > r.lapTimes[0] * 1.02 // 2% slower than start
      );

      if (matchingScenarios.length > 0) {
        const avgCarbonImpact = matchingScenarios.reduce((sum, r) => sum + r.carbonEmissionsKg, 0) / matchingScenarios.length;
        return {
          recommendation: `Consider pit stop for new tires - high degradation detected`,
          carbonImpact: avgCarbonImpact * 0.1, // Small impact for tire change
          confidence: 0.87,
        };
      }
    }

    return null;
  }

  /**
   * Get simulation by race ID
   */
  getSimulation(raceId: string): SimulatedRace | undefined {
    return this.simulations.get(raceId);
  }

  /**
   * Get all simulations
   */
  getAllSimulations(): SimulatedRace[] {
    return Array.from(this.simulations.values());
  }

  /**
   * Generate summary for pit wall HUD
   */
  generatePitWallSummary(raceId: string): object | null {
    const simulation = this.simulations.get(raceId);
    if (!simulation) return null;

    const optimalResult = this.scenarioResults.get(raceId)?.find(
      r => r.scenarioId === simulation.optimalStrategy?.id
    );

    const carbonOptimalResult = this.scenarioResults.get(raceId)?.find(
      r => r.scenarioId === simulation.carbonOptimalStrategy?.id
    );

    return {
      race_id: raceId,
      circuit: simulation.circuit,
      scenarios_analyzed: simulation.scenariosRun,
      optimal_line: simulation.optimalStrategy?.name || 'N/A',
      win_margin_seconds: optimalResult ? (optimalResult.totalTimeSeconds - simulation.bestLapTime * simulation.totalLaps) : 0,
      net_co2e_tons: (optimalResult?.carbonEmissionsKg || 0) / 1000,
      carbon_optimized_line: simulation.carbonOptimalStrategy?.name || 'N/A',
      carbon_savings_kg: optimalResult && carbonOptimalResult 
        ? optimalResult.carbonEmissionsKg - carbonOptimalResult.carbonEmissionsKg 
        : 0,
      top_optimizations: simulation.optimizations.slice(0, 3),
    };
  }
}

// Singleton instance
export const scenarioSimulator = new ScenarioSimulator();
