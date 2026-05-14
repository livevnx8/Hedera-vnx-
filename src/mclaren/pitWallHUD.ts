/**
 * Pit Wall HUD Integration
 * Phase 2: Real-time dashboard for McLaren pit wall
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { realTimeCarbonValidator, type LiveRaceData, type StrategyFlag } from './realTimeValidator.js';
import { scenarioSimulator } from './scenarioSimulator.js';

export interface HUDDisplay {
  raceId: string;
  timestamp: number;
  layout: 'FULL' | 'COMPACT' | 'MINIMAL';
  sections: {
    raceStatus: RaceStatusSection;
    carbonMetrics: CarbonMetricsSection;
    strategy: StrategySection;
    alerts: AlertsSection;
  };
}

export interface RaceStatusSection {
  lap: string;
  position: string;
  gap: string;
  tire: string;
  fuel: string;
  weather: string;
}

export interface CarbonMetricsSection {
  netCo2e: string;
  savings: string;
  treesEquivalent: number;
  confidence: string;
  trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
}

export interface StrategySection {
  optimalLine: string;
  winMargin: string;
  recommendation: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

export interface AlertsSection {
  active: number;
  critical: number;
  latest: string;
}

export interface HUDConfig {
  teamId: string;
  driverId: string;
  refreshRate: number; // ms
  layout: 'FULL' | 'COMPACT' | 'MINIMAL';
  carbonDisplay: boolean;
  strategyOverlay: boolean;
}

export class PitWallHUD extends EventEmitter {
  private activeConfigs: Map<string, HUDConfig> = new Map();
  private displays: Map<string, HUDDisplay> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initialize HUD for a team/driver
   */
  async initializeHUD(
    raceId: string,
    teamId: string,
    driverId: string,
    config?: Partial<HUDConfig>
  ): Promise<HUDDisplay> {
    try {
      const hudConfig: HUDConfig = {
        teamId,
        driverId,
        refreshRate: config?.refreshRate || 1000, // 1 second default
        layout: config?.layout || 'FULL',
        carbonDisplay: config?.carbonDisplay ?? true,
        strategyOverlay: config?.strategyOverlay ?? true,
      };

      this.activeConfigs.set(raceId, hudConfig);

      // Create initial display
      const display = this.generateDisplay(raceId);
      this.displays.set(raceId, display);

      // Start auto-update
      this.startAutoUpdate(raceId, hudConfig.refreshRate);

      logger.info('PitWallHUD', {
        raceId,
        teamId,
        driverId,
        layout: hudConfig.layout,
        message: 'HUD initialized',
      });

      this.emit('hud_initialized', { raceId, config: hudConfig });

      return display;
    } catch (error) {
      logger.error('PitWallHUD', {
        raceId,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to initialize HUD',
      });
      throw error;
    }
  }

  /**
   * Generate HUD display data
   */
  private generateDisplay(raceId: string): HUDDisplay {
    const config = this.activeConfigs.get(raceId);
    const validator = realTimeCarbonValidator;
    
    // Get live data
    const telemetry = validator.getLiveCarbonSummary(raceId);
    const flags = validator.getActiveFlags(raceId);
    const criticalAlerts = validator.getCriticalAlerts(raceId);

    // Get simulation data
    const simulation = scenarioSimulator.getSimulation(raceId);

    // Find most important flag
    const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const topFlag = flags.sort((a, b) => 
      priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
    )[0];

    // Calculate trees equivalent
    const telemetryData = telemetry as any;
    const netCo2e = telemetryData?.optimized_emissions_tco2e || 0;
    const treesEquivalent = Math.round(netCo2e * 1000 / 42); // ~42kg CO2 per tree/year

    // Generate sections based on layout
    const layout = config?.layout || 'FULL';

    return {
      raceId,
      timestamp: Date.now(),
      layout,
      sections: {
        raceStatus: this.generateRaceStatusSection(telemetryData, layout),
        carbonMetrics: this.generateCarbonMetricsSection(telemetryData, treesEquivalent, layout),
        strategy: this.generateStrategySection(topFlag, simulation, layout),
        alerts: this.generateAlertsSection(flags, criticalAlerts, layout),
      },
    };
  }

  private generateRaceStatusSection(telemetry: any, layout: string): RaceStatusSection {
    if (layout === 'MINIMAL') {
      return {
        lap: `${telemetry?.current_lap || 0}/${telemetry?.total_laps || 0}`,
        position: 'P1',
        gap: '+0.0s',
        tire: 'MED',
        fuel: `${telemetry?.fuelRemaining?.toFixed?.(1) || 'N/A'}kg`,
        weather: 'DRY',
      };
    }

    return {
      lap: `Lap ${telemetry?.current_lap || 0} of ${telemetry?.total_laps || 0}`,
      position: 'P1',
      gap: '+0.0s to leader',
      tire: 'MEDIUM (8 laps)',
      fuel: `${telemetry?.fuelRemaining?.toFixed?.(1) || '100.0'}kg remaining`,
      weather: 'DRY | 35°C',
    };
  }

  private generateCarbonMetricsSection(
    telemetry: any, 
    treesEquivalent: number, 
    layout: string
  ): CarbonMetricsSection {
    const netCo2e = telemetry?.optimized_emissions_tco2e || 0.12;
    const savings = telemetry?.potential_savings_kg || 0;

    if (layout === 'MINIMAL') {
      return {
        netCo2e: `${netCo2e.toFixed(2)}t`,
        savings: `-${savings.toFixed(0)}kg`,
        treesEquivalent,
        confidence: '94%',
        trend: 'IMPROVING',
      };
    }

    return {
      netCo2e: `${netCo2e.toFixed(3)} tons CO₂e`,
      savings: `-${savings.toFixed(1)}kg CO₂e potential`,
      treesEquivalent,
      confidence: '94%',
      trend: savings > 50 ? 'IMPROVING' : savings > 0 ? 'STABLE' : 'DEGRADING',
    };
  }

  private generateStrategySection(
    topFlag: StrategyFlag | undefined, 
    simulation: any, 
    layout: string
  ): StrategySection {
    if (!topFlag) {
      return {
        optimalLine: simulation?.optimalStrategy?.name || 'Strategy-42',
        winMargin: '+5.1s',
        recommendation: 'No active alerts',
        priority: 'NONE',
      };
    }

    const winMargin = topFlag.timeImpact > 0 
      ? `+${topFlag.timeImpact.toFixed(1)}s` 
      : `${topFlag.timeImpact.toFixed(1)}s`;

    if (layout === 'MINIMAL') {
      return {
        optimalLine: topFlag.type,
        winMargin,
        recommendation: topFlag.recommendation.slice(0, 25) + '...',
        priority: topFlag.priority,
      };
    }

    return {
      optimalLine: simulation?.optimalStrategy?.name || 'Strategy-42',
      winMargin,
      recommendation: topFlag.recommendation,
      priority: topFlag.priority,
    };
  }

  private generateAlertsSection(
    flags: StrategyFlag[], 
    criticalAlerts: any[], 
    layout: string
  ): AlertsSection {
    const active = flags.length;
    const critical = criticalAlerts.length;
    const latest = flags[0]?.recommendation || 'No new alerts';

    if (layout === 'MINIMAL') {
      return {
        active,
        critical,
        latest: latest.slice(0, 20) + '...',
      };
    }

    return {
      active,
      critical,
      latest,
    };
  }

  /**
   * Start auto-update loop
   */
  private startAutoUpdate(raceId: string, refreshRate: number): void {
    // Clear existing interval
    const existing = this.updateIntervals.get(raceId);
    if (existing) clearInterval(existing);

    // Start new interval
    const interval = setInterval(() => {
      const display = this.generateDisplay(raceId);
      this.displays.set(raceId, display);
      this.emit('hud_update', { raceId, display });
    }, refreshRate);

    this.updateIntervals.set(raceId, interval);
  }

  /**
   * Get current HUD display
   */
  getDisplay(raceId: string): HUDDisplay | undefined {
    return this.displays.get(raceId);
  }

  /**
   * Force refresh HUD display
   */
  refreshDisplay(raceId: string): HUDDisplay | null {
    const display = this.generateDisplay(raceId);
    this.displays.set(raceId, display);
    this.emit('hud_refresh', { raceId, display });
    return display;
  }

  /**
   * Update HUD configuration
   */
  updateConfig(raceId: string, updates: Partial<HUDConfig>): HUDConfig | null {
    const existing = this.activeConfigs.get(raceId);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.activeConfigs.set(raceId, updated);

    // Restart with new refresh rate if changed
    if (updates.refreshRate && updates.refreshRate !== existing.refreshRate) {
      this.startAutoUpdate(raceId, updates.refreshRate);
    }

    this.emit('hud_config_updated', { raceId, config: updated });
    return updated;
  }

  /**
   * Get display as formatted text for simple terminals
   */
  getTextDisplay(raceId: string): string {
    const display = this.displays.get(raceId);
    if (!display) return 'HUD not initialized';

    const { sections } = display;

    return `
┌─────────────────────────────────────────────────────────┐
│  🏎️ MCLAREN PIT WALL HUD - ${display.raceId.toUpperCase().slice(0, 15).padEnd(15)}│
├─────────────────────────────────────────────────────────┤
│  ${sections.raceStatus.lap.padEnd(20)} ${sections.raceStatus.weather.padEnd(25)}│
│  ${sections.raceStatus.position.padEnd(20)} ${sections.raceStatus.gap.padEnd(25)}│
│  ${sections.raceStatus.tire.padEnd(20)} ${sections.raceStatus.fuel.padEnd(25)}│
├─────────────────────────────────────────────────────────┤
│  🌱 CARBON: ${sections.carbonMetrics.netCo2e.padEnd(15)} 🌳 ${sections.carbonMetrics.treesEquivalent.toString().padEnd(4)} trees│
│  💰 SAVINGS: ${sections.carbonMetrics.savings.padEnd(15)} 📈 ${sections.carbonMetrics.trend.padEnd(14)}│
├─────────────────────────────────────────────────────────┤
│  🎯 STRATEGY: ${sections.strategy.optimalLine.padEnd(16)} ${sections.strategy.winMargin.padEnd(16)}│
│  ⚠️  ${sections.strategy.recommendation.slice(0, 50).padEnd(49)}│
├─────────────────────────────────────────────────────────┤
│  🔔 ALERTS: ${sections.alerts.active.toString().padEnd(3)} active │ CRITICAL: ${sections.alerts.critical.toString().padEnd(3)}          │
│  ${sections.alerts.latest.slice(0, 54).padEnd(54)}│
└─────────────────────────────────────────────────────────┘
`;
  }

  /**
   * Get compact display for mobile/small screens
   */
  getCompactDisplay(raceId: string): object | null {
    const display = this.displays.get(raceId);
    if (!display) return null;

    const { sections } = display;

    return {
      line1: `L${sections.raceStatus.lap} | ${sections.raceStatus.position} | ${sections.raceStatus.tire}`,
      line2: `${sections.carbonMetrics.netCo2e} CO₂e | ${sections.carbonMetrics.savings}`,
      line3: sections.strategy.priority !== 'NONE' 
        ? `${sections.strategy.priority}: ${sections.strategy.recommendation.slice(0, 30)}...`
        : 'No alerts',
      line4: `${sections.alerts.critical > 0 ? '🔴' : '🟢'} ${sections.alerts.active} alerts | ${sections.carbonMetrics.confidence} conf`,
    };
  }

  /**
   * Stop HUD updates for a race
   */
  stopHUD(raceId: string): void {
    const interval = this.updateIntervals.get(raceId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(raceId);
    }

    this.activeConfigs.delete(raceId);
    this.displays.delete(raceId);

    logger.info('PitWallHUD', {
      raceId,
      message: 'HUD stopped',
    });

    this.emit('hud_stopped', { raceId });
  }

  /**
   * Get all active HUDs
   */
  getActiveHUDs(): Array<{ raceId: string; config: HUDConfig; display: HUDDisplay }> {
    const active: Array<{ raceId: string; config: HUDConfig; display: HUDDisplay }> = [];
    
    for (const [raceId, config] of this.activeConfigs.entries()) {
      const display = this.displays.get(raceId);
      if (display) {
        active.push({ raceId, config, display });
      }
    }

    return active;
  }
}

// Singleton instance
export const pitWallHUD = new PitWallHUD();
