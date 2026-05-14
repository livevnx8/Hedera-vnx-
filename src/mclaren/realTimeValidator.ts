/**
 * Real-Time Carbon Validator
 * Phase 2: Live race monitoring with carbon-efficient strategy flags
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { scenarioSimulator, type SimulatedRace, type SimulationResult } from './scenarioSimulator.js';
import { raceCarbonAuditor, type RaceTelemetry } from './raceCarbonAuditor.js';

export interface LiveRaceData {
  raceId: string;
  currentLap: number;
  totalLaps: number;
  position: number;
  gapToLeader: number; // seconds
  tireCompound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';
  tireAge: number; // laps on current tires
  tireDegradation: number; // 0-100%
  fuelRemaining: number; // kg
  fuelConsumptionRate: number; // kg/lap
  trackTemp: number; // celsius
  weather: 'DRY' | 'LIGHT_RAIN' | 'HEAVY_RAIN';
  drsEnabled: boolean;
  timestamp: number;
}

export interface StrategyFlag {
  id: string;
  type: 'TIRE_CHANGE' | 'FUEL_SAVE' | 'PIT_STOP' | 'INTERMEDIATE_PIVOT' | 'ATTACK_MODE';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  lapWindow: [number, number]; // [start, end] lap range for action
  recommendation: string;
  carbonImpact: number; // kg CO2 saved (positive) or added (negative)
  timeImpact: number; // seconds gained (positive) or lost (negative)
  confidence: number; // 0-1
  triggeredAt: number;
  expiresAt: number;
}

export interface ValidationAlert {
  raceId: string;
  timestamp: number;
  alert: StrategyFlag;
  context: {
    currentLap: number;
    currentTire: string;
    fuelStatus: string;
    weatherCondition: string;
  };
}

export class RealTimeCarbonValidator extends EventEmitter {
  private activeRaces: Map<string, LiveRaceData> = new Map();
  private strategyFlags: Map<string, StrategyFlag[]> = new Map();
  private alerts: Map<string, ValidationAlert[]> = new Map();
  private alertIdCounter = 0;

  // Validation thresholds
  private readonly THRESHOLDS = {
    tireDegradationCritical: 75,
    tireDegradationWarning: 50,
    fuelReserveLaps: 3,
    fuelSaveWindow: 5,
    rainThreshold: 0.3, // probability
    optimalPitWindow: 3, // laps
  };

  /**
   * Start monitoring a race for real-time carbon validation
   */
  async startRaceMonitoring(raceId: string, simulation: SimulatedRace): Promise<void> {
    try {
      logger.info('RealTimeCarbonValidator', {
        raceId,
        message: 'Starting real-time carbon validation monitoring',
      });

      // Initialize monitoring state
      this.activeRaces.set(raceId, {
        raceId,
        currentLap: 0,
        totalLaps: simulation.totalLaps,
        position: 1,
        gapToLeader: 0,
        tireCompound: 'MEDIUM',
        tireAge: 0,
        tireDegradation: 0,
        fuelRemaining: 100,
        fuelConsumptionRate: 2.5,
        trackTemp: 35,
        weather: 'DRY',
        drsEnabled: false,
        timestamp: Date.now(),
      });

      this.strategyFlags.set(raceId, []);
      this.alerts.set(raceId, []);

      this.emit('monitoring_started', { raceId, totalLaps: simulation.totalLaps });
    } catch (error) {
      logger.error('RealTimeCarbonValidator', {
        raceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to start race monitoring',
      });
      throw error;
    }
  }

  /**
   * Update live telemetry and generate strategy flags
   */
  async updateTelemetry(telemetry: LiveRaceData): Promise<StrategyFlag[]> {
    const raceId = telemetry.raceId;
    
    try {
      // Update race state
      this.activeRaces.set(raceId, telemetry);

      // Generate new strategy flags based on conditions
      const newFlags = this.generateStrategyFlags(telemetry);
      
      // Store flags
      const existingFlags = this.strategyFlags.get(raceId) || [];
      const activeFlags = existingFlags.filter(f => f.expiresAt > Date.now());
      this.strategyFlags.set(raceId, [...activeFlags, ...newFlags]);

      // Create alerts for high-priority flags
      for (const flag of newFlags.filter(f => f.priority === 'CRITICAL' || f.priority === 'HIGH')) {
        this.createAlert(raceId, flag, telemetry);
      }

      // Emit updates
      if (newFlags.length > 0) {
        this.emit('strategy_flags', { raceId, flags: newFlags });
      }

      logger.info('RealTimeCarbonValidator', {
        raceId,
        lap: telemetry.currentLap,
        flagsGenerated: newFlags.length,
        message: 'Telemetry processed',
      });

      return newFlags;
    } catch (error) {
      logger.error('RealTimeCarbonValidator', {
        raceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to process telemetry',
      });
      return [];
    }
  }

  /**
   * Generate strategy flags based on current race conditions
   */
  private generateStrategyFlags(telemetry: LiveRaceData): StrategyFlag[] {
    const flags: StrategyFlag[] = [];

    // 1. Tire degradation flag
    if (telemetry.tireDegradation > this.THRESHOLDS.tireDegradationCritical) {
      flags.push({
        id: `tire-critical-${++this.alertIdCounter}`,
        type: 'TIRE_CHANGE',
        priority: 'CRITICAL',
        lapWindow: [telemetry.currentLap, telemetry.currentLap + 3],
        recommendation: 'CRITICAL: Tire degradation at critical level. Pit for new tires immediately.',
        carbonImpact: -15, // kg CO2 saved by avoiding slower laps
        timeImpact: 3, // seconds gained per lap with fresh tires
        confidence: 0.92,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 300000, // 5 minutes
      });
    } else if (telemetry.tireDegradation > this.THRESHOLDS.tireDegradationWarning) {
      flags.push({
        id: `tire-warning-${++this.alertIdCounter}`,
        type: 'TIRE_CHANGE',
        priority: 'HIGH',
        lapWindow: [telemetry.currentLap + 2, telemetry.currentLap + 5],
        recommendation: 'Plan pit stop within next 3 laps. Tire degradation at warning level.',
        carbonImpact: -8,
        timeImpact: 1.5,
        confidence: 0.85,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 600000, // 10 minutes
      });
    }

    // 2. Fuel efficiency flag
    const lapsRemaining = telemetry.totalLaps - telemetry.currentLap;
    const fuelLapsRemaining = telemetry.fuelRemaining / telemetry.fuelConsumptionRate;
    
    if (fuelLapsRemaining < lapsRemaining + this.THRESHOLDS.fuelReserveLaps) {
      flags.push({
        id: `fuel-save-${++this.alertIdCounter}`,
        type: 'FUEL_SAVE',
        priority: 'HIGH',
        lapWindow: [telemetry.currentLap, telemetry.currentLap + this.THRESHOLDS.fuelSaveWindow],
        recommendation: 'Activate fuel save mode. Low fuel margin detected. Lean mix recommended.',
        carbonImpact: -25, // kg CO2 saved by lean mix
        timeImpact: -0.3, // slight time loss per lap
        confidence: 0.88,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 300000,
      });
    }

    // 3. Intermediate tire pivot (rain condition)
    if (telemetry.weather === 'LIGHT_RAIN' && telemetry.tireCompound !== 'INTERMEDIATE') {
      flags.push({
        id: `intermediate-pivot-${++this.alertIdCounter}`,
        type: 'INTERMEDIATE_PIVOT',
        priority: 'CRITICAL',
        lapWindow: [telemetry.currentLap, telemetry.currentLap + 2],
        recommendation: 'INTERMEDIATES PIVOT: Light rain detected. Switch to intermediate tires for +4.2s gain, -110 kg CO₂e saved.',
        carbonImpact: -110, // Major carbon savings from avoiding full wet tire waste
        timeImpact: 4.2,
        confidence: 0.87,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 180000, // 3 minutes
      });
    }

    // 4. Optimal pit window flag
    const raceId = telemetry.raceId;
    const simulation = scenarioSimulator.getSimulation(raceId);
    if (simulation?.optimalStrategy) {
      const optimalPitLap = simulation.optimalStrategy.pitStops[0]?.lap;
      if (optimalPitLap && Math.abs(telemetry.currentLap - optimalPitLap) <= this.THRESHOLDS.optimalPitWindow) {
        flags.push({
          id: `pit-window-${++this.alertIdCounter}`,
          type: 'PIT_STOP',
          priority: 'MEDIUM',
          lapWindow: [optimalPitLap - 1, optimalPitLap + 2],
          recommendation: `Optimal pit window open. Recommended lap: ${optimalPitLap}. Undercut opportunity available.`,
          carbonImpact: -5,
          timeImpact: 2,
          confidence: 0.82,
          triggeredAt: Date.now(),
          expiresAt: Date.now() + 240000, // 4 minutes
        });
      }
    }

    // 5. Attack mode flag (DRS + good tires + fuel)
    if (telemetry.drsEnabled && telemetry.tireDegradation < 30 && fuelLapsRemaining > lapsRemaining + 5) {
      flags.push({
        id: `attack-mode-${++this.alertIdCounter}`,
        type: 'ATTACK_MODE',
        priority: 'LOW',
        lapWindow: [telemetry.currentLap, telemetry.currentLap + 1],
        recommendation: 'Attack mode available. DRS enabled, good tire condition, fuel margin healthy.',
        carbonImpact: 5, // Slight carbon increase from aggressive driving
        timeImpact: 0.5,
        confidence: 0.78,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 120000, // 2 minutes
      });
    }

    return flags;
  }

  /**
   * Create a validation alert
   */
  private createAlert(raceId: string, flag: StrategyFlag, telemetry: LiveRaceData): void {
    const alert: ValidationAlert = {
      raceId,
      timestamp: Date.now(),
      alert: flag,
      context: {
        currentLap: telemetry.currentLap,
        currentTire: telemetry.tireCompound,
        fuelStatus: `${telemetry.fuelRemaining.toFixed(1)}kg (${(telemetry.fuelRemaining / telemetry.fuelConsumptionRate).toFixed(1)} laps)`,
        weatherCondition: telemetry.weather,
      },
    };

    const alerts = this.alerts.get(raceId) || [];
    alerts.push(alert);
    this.alerts.set(raceId, alerts);

    this.emit('validation_alert', alert);

    logger.info('RealTimeCarbonValidator', {
      raceId,
      alertId: flag.id,
      type: flag.type,
      priority: flag.priority,
      carbonImpact: flag.carbonImpact,
      message: `Alert created: ${flag.recommendation}`,
    });
  }

  /**
   * Get active strategy flags for a race
   */
  getActiveFlags(raceId: string): StrategyFlag[] {
    const flags = this.strategyFlags.get(raceId) || [];
    return flags.filter(f => f.expiresAt > Date.now());
  }

  /**
   * Get all alerts for a race
   */
  getAlerts(raceId: string): ValidationAlert[] {
    return this.alerts.get(raceId) || [];
  }

  /**
   * Get critical alerts only
   */
  getCriticalAlerts(raceId: string): ValidationAlert[] {
    const alerts = this.alerts.get(raceId) || [];
    return alerts.filter(a => a.alert.priority === 'CRITICAL');
  }

  /**
   * Get carbon summary for current race state
   */
  getLiveCarbonSummary(raceId: string): object | null {
    const telemetry = this.activeRaces.get(raceId);
    if (!telemetry) return null;

    const flags = this.getActiveFlags(raceId);
    const potentialSavings = flags.reduce((sum, f) => f.carbonImpact > 0 ? sum + f.carbonImpact : sum, 0);

    // Get base carbon estimate from auditor
    const calculation = raceCarbonAuditor.getCalculation(raceId, 'RACE');
    const baseEmissions = calculation?.teamEmissionsTco2e || 1.0;

    return {
      race_id: raceId,
      current_lap: telemetry.currentLap,
      total_laps: telemetry.totalLaps,
      base_emissions_tco2e: baseEmissions,
      potential_savings_kg: potentialSavings,
      optimized_emissions_tco2e: baseEmissions - (potentialSavings / 1000),
      active_flags: flags.length,
      critical_flags: flags.filter(f => f.priority === 'CRITICAL').length,
      recommendations: flags.map(f => f.recommendation),
    };
  }

  /**
   * Stop monitoring a race
   */
  stopRaceMonitoring(raceId: string): void {
    this.activeRaces.delete(raceId);
    this.strategyFlags.delete(raceId);
    this.alerts.delete(raceId);

    logger.info('RealTimeCarbonValidator', {
      raceId,
      message: 'Race monitoring stopped',
    });
  }

  /**
   * Get pit wall display data
   */
  getPitWallDisplay(raceId: string): object | null {
    const telemetry = this.activeRaces.get(raceId);
    const flags = this.getActiveFlags(raceId);
    const summary = this.getLiveCarbonSummary(raceId);

    if (!telemetry || !summary) return null;

    // Find the most important flag
    const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const importantFlag = flags.sort((a, b) => 
      priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
    )[0];

    return {
      display: {
        line1: `Lap ${telemetry.currentLap}/${telemetry.totalLaps} | ${telemetry.tireCompound} (${telemetry.tireAge}l)`,
        line2: `Fuel: ${telemetry.fuelRemaining.toFixed(1)}kg | ${telemetry.weather}`,
        line3: importantFlag 
          ? `${importantFlag.type}: ${importantFlag.recommendation.slice(0, 40)}...`
          : 'No active alerts',
        line4: `Net CO₂e: ${(summary as any).optimized_emissions_tco2e.toFixed(3)} tons`,
      },
      flags: flags.slice(0, 3), // Top 3 flags
      carbon_summary: summary,
      timestamp: Date.now(),
    };
  }
}

// Singleton instance
export const realTimeCarbonValidator = new RealTimeCarbonValidator();
