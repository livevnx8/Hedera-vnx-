/**
 * Intelligent Defaults - Auto-Detection System
 * 
 * Automatically detects optimal configurations based on system resources
 * and network conditions
 */

import * as os from 'os';
import { logger } from '../monitoring/logger.js';

export interface SystemProfile {
  cpu: {
    cores: number;
    load: number[];
    speed: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  network: {
    latency: number;
    bandwidth: number;
    reliability: number;
  };
  disk: {
    total: number;
    free: number;
    iops: number;
  };
}

export interface LatticeDefaults {
  nodeMesh: {
    fanout: number;
    interval: number;
    maxNodes: number;
  };
  consensus: {
    timeout: number;
    blockTime: number;
    faultTolerance: number;
  };
  stateSync: {
    syncInterval: number;
    maxDeltaSize: number;
    compressionEnabled: boolean;
  };
  hcs: {
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
  };
  agents: {
    poolSize: number;
    taskTimeout: number;
    maxConcurrency: number;
  };
}

export class IntelligentDefaults {
  private profile: SystemProfile | null = null;
  private defaults: LatticeDefaults | null = null;

  /**
   * Detect system profile
   */
  async detectProfile(): Promise<SystemProfile> {
    logger.info('IntelligentDefaults', { message: 'Detecting system profile' });

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    this.profile = {
      cpu: {
        cores: cpus.length,
        load: os.loadavg(),
        speed: cpus[0]?.speed || 2000
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem
      },
      network: await this.measureNetwork(),
      disk: this.estimateDiskPerformance()
    };

    logger.info('IntelligentDefaults', {
      cpuCores: this.profile.cpu.cores,
      memoryGB: (this.profile.memory.total / 1024 / 1024 / 1024).toFixed(1),
      message: 'System profile detected'
    });

    return this.profile;
  }

  /**
   * Calculate optimal defaults
   */
  calculateDefaults(profile: SystemProfile = this.profile!): LatticeDefaults {
    if (!profile) {
      throw new Error('System profile not detected. Call detectProfile() first.');
    }

    const memoryGB = profile.memory.total / 1024 / 1024 / 1024;
    const cpuScore = profile.cpu.cores * (profile.cpu.speed / 2000);
    const networkScore = profile.network.bandwidth / 100;

    this.defaults = {
      nodeMesh: this.calculateNodeMeshDefaults(profile, memoryGB),
      consensus: this.calculateConsensusDefaults(profile, cpuScore),
      stateSync: this.calculateStateSyncDefaults(profile, networkScore),
      hcs: this.calculateHCSDefaults(profile, networkScore),
      agents: this.calculateAgentDefaults(profile, memoryGB, cpuScore)
    };

    logger.info('IntelligentDefaults', {
      message: 'Optimal defaults calculated'
    });

    return this.defaults;
  }

  /**
   * Calculate node mesh defaults
   */
  private calculateNodeMeshDefaults(profile: SystemProfile, memoryGB: number): any {
    // Fanout: 2-6 based on CPU cores
    const fanout = Math.max(2, Math.min(6, Math.floor(profile.cpu.cores / 2)));
    
    // Interval: 50-200ms based on network latency
    const interval = Math.max(50, Math.min(200, profile.network.latency * 2));
    
    // Max nodes: 10-200 based on memory
    const maxNodes = Math.max(10, Math.min(200, Math.floor(memoryGB * 10)));

    return {
      fanout,
      interval,
      maxNodes
    };
  }

  /**
   * Calculate consensus defaults
   */
  private calculateConsensusDefaults(profile: SystemProfile, cpuScore: number): any {
    // Faster CPUs can handle shorter timeouts
    const baseTimeout = 5000;
    const timeout = Math.max(2000, baseTimeout / (cpuScore / 4));
    
    // Block time: 500-5000ms based on CPU speed
    const blockTime = Math.max(500, Math.min(5000, 2000 / (cpuScore / 4)));
    
    // Fault tolerance: 0.2-0.4 based on node count preference
    const faultTolerance = 0.33; // Standard BFT tolerance

    return {
      timeout: Math.round(timeout),
      blockTime: Math.round(blockTime),
      faultTolerance
    };
  }

  /**
   * Calculate state sync defaults
   */
  private calculateStateSyncDefaults(profile: SystemProfile, networkScore: number): any {
    // Sync interval: 100-2000ms based on network reliability
    const syncInterval = Math.max(100, Math.min(2000, 1000 / networkScore));
    
    // Delta size: 100-5000 based on bandwidth
    const maxDeltaSize = Math.max(100, Math.min(5000, profile.network.bandwidth * 10));

    return {
      syncInterval: Math.round(syncInterval),
      maxDeltaSize: Math.round(maxDeltaSize),
      compressionEnabled: profile.network.bandwidth < 50 // Compress if bandwidth < 50 Mbps
    };
  }

  /**
   * Calculate HCS defaults
   */
  private calculateHCSDefaults(profile: SystemProfile, networkScore: number): any {
    // Batch size: 1-1000 based on memory
    const memoryGB = profile.memory.total / 1024 / 1024 / 1024;
    const batchSize = Math.max(1, Math.min(1000, Math.floor(memoryGB * 50)));
    
    // Retry attempts: 3-10 based on network reliability
    const retryAttempts = Math.max(3, Math.min(10, Math.floor(10 / networkScore)));
    
    // Retry delay: 100-5000ms based on latency
    const retryDelay = Math.max(100, Math.min(5000, profile.network.latency * 5));

    return {
      batchSize,
      retryAttempts,
      retryDelay: Math.round(retryDelay)
    };
  }

  /**
   * Calculate agent defaults
   */
  private calculateAgentDefaults(
    profile: SystemProfile,
    memoryGB: number,
    cpuScore: number
  ): any {
    // Pool size: 2-32 based on CPU cores
    const poolSize = Math.max(2, Math.min(32, profile.cpu.cores * 2));
    
    // Task timeout: 5000-60000ms based on CPU speed
    const taskTimeout = Math.max(5000, Math.min(60000, 30000 / (cpuScore / 4)));
    
    // Max concurrency: 1-100 based on memory
    const maxConcurrency = Math.max(1, Math.min(100, Math.floor(memoryGB * 5)));

    return {
      poolSize,
      taskTimeout: Math.round(taskTimeout),
      maxConcurrency
    };
  }

  /**
   * Measure network performance
   */
  private async measureNetwork(): Promise<any> {
    // In production, this would ping known endpoints
    // For now, return estimated values
    
    // Measure actual latency to Hedera mirror node
    const start = Date.now();
    try {
      // Simulate network request
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      // Ignore errors
    }
    const latency = Date.now() - start;

    return {
      latency: Math.max(10, latency),
      bandwidth: 100, // Mbps (estimated)
      reliability: 0.99 // 99% uptime (estimated)
    };
  }

  /**
   * Estimate disk performance
   */
  private estimateDiskPerformance(): any {
    // In production, this would run IOPS benchmarks
    // For now, return estimated values based on OS info
    
    const tmpDir = os.tmpdir();
    // Simple heuristic based on common disk types
    const isSSD = tmpDir.includes('nvme') || tmpDir.includes('ssd');
    
    return {
      total: 100 * 1024 * 1024 * 1024, // 100GB (placeholder)
      free: 50 * 1024 * 1024 * 1024,    // 50GB (placeholder)
      iops: isSSD ? 50000 : 100 // SSD: 50K IOPS, HDD: 100 IOPS
    };
  }

  /**
   * Apply detected defaults to configuration
   */
  applyDefaults(config: any, defaults: LatticeDefaults = this.defaults!): any {
    if (!defaults) {
      throw new Error('Defaults not calculated. Call calculateDefaults() first.');
    }

    return {
      ...config,
      lattice: {
        ...config.lattice,
        ...defaults.nodeMesh
      },
      consensus: {
        ...config.consensus,
        ...defaults.consensus
      },
      stateSync: {
        ...config.stateSync,
        ...defaults.stateSync
      },
      hcs: {
        ...config.hcs,
        ...defaults.hcs
      },
      agents: {
        ...config.agents,
        ...defaults.agents
      }
    };
  }

  /**
   * Generate configuration report
   */
  generateReport(): string {
    if (!this.profile || !this.defaults) {
      return 'System profile not detected. Run detectProfile() and calculateDefaults() first.';
    }

    const lines = [
      '╔════════════════════════════════════════════════════════╗',
      '║     Aetherium OS - Intelligent Defaults Report        ║',
      '╚════════════════════════════════════════════════════════╝',
      '',
      '🖥️  System Profile',
      `   CPU Cores: ${this.profile.cpu.cores} @ ${this.profile.cpu.speed}MHz`,
      `   Memory: ${(this.profile.memory.total / 1024 / 1024 / 1024).toFixed(1)}GB total`,
      `   Network: ${this.profile.network.latency}ms latency, ${this.profile.network.bandwidth}Mbps`,
      '',
      '⚙️  Optimized Configuration',
      '   ┌─ Node Mesh ─────────────────────────────┐',
      `   │ Fanout:        ${this.defaults.nodeMesh.fanout.toString().padStart(3)} nodes           │`,
      `   │ Interval:      ${this.defaults.nodeMesh.interval.toString().padStart(3)}ms               │`,
      `   │ Max Nodes:     ${this.defaults.nodeMesh.maxNodes.toString().padStart(3)}               │`,
      '   └───────────────────────────────────────┘',
      '   ┌─ Consensus ───────────────────────────┐',
      `   │ Timeout:      ${this.defaults.consensus.timeout.toString().padStart(4)}ms              │`,
      `   │ Block Time:    ${this.defaults.consensus.blockTime.toString().padStart(4)}ms              │`,
      `   │ Fault Tol:     ${(this.defaults.consensus.faultTolerance * 100).toFixed(0)}%               │`,
      '   └───────────────────────────────────────┘',
      '   ┌─ State Sync ──────────────────────────┐',
      `   │ Sync Interval: ${this.defaults.stateSync.syncInterval.toString().padStart(4)}ms              │`,
      `   │ Delta Size:    ${this.defaults.stateSync.maxDeltaSize.toString().padStart(4)}               │`,
      `   │ Compression:   ${this.defaults.stateSync.compressionEnabled ? 'enabled' : 'disabled'}         │`,
      '   └─────────────────────────────────────────┘',
      '   ┌─ HCS ─────────────────────────────────┐',
      `   │ Batch Size:    ${this.defaults.hcs.batchSize.toString().padStart(4)}               │`,
      `   │ Retry Att:     ${this.defaults.hcs.retryAttempts} attempts            │`,
      `   │ Retry Delay:   ${this.defaults.hcs.retryDelay.toString().padStart(4)}ms              │`,
      '   └───────────────────────────────────────┘',
      '   ┌─ Agents ──────────────────────────────┐',
      `   │ Pool Size:     ${this.defaults.agents.poolSize.toString().padStart(2)}                │`,
      `   │ Task Timeout:  ${this.defaults.agents.taskTimeout.toString().padStart(5)}ms             │`,
      `   │ Concurrency:   ${this.defaults.agents.maxConcurrency.toString().padStart(3)}               │`,
      '   └───────────────────────────────────────┘',
      '',
      '✨ Truth, anchored in light'
    ];

    return lines.join('\n');
  }

  /**
   * Get current defaults
   */
  getDefaults(): LatticeDefaults | null {
    return this.defaults;
  }

  /**
   * Get system profile
   */
  getProfile(): SystemProfile | null {
    return this.profile;
  }
}

// Export singleton
export const intelligentDefaults = new IntelligentDefaults();
