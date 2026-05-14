import os from 'os';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';

const execFileAsync = promisify(execFile);

export interface RigDiskState {
  path: string;
  available: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  utilization: number | null;
  error?: string;
}

export interface RigGpuState {
  available: boolean;
  source: 'nvidia-smi' | 'env' | 'none';
  deviceCount: number;
  utilization: number | null;
  memoryUsedMiB: number | null;
  memoryTotalMiB: number | null;
  error?: string;
}

export interface RigSnapshot {
  timestamp: number;
  hostname: string;
  platform: string;
  arch: string;
  uptimeSec: number;
  process: {
    pid: number;
    cwd: string;
    nodeVersion: string;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
  };
  cpu: {
    coreCount: number;
    model: string;
    loadAverage: number[];
    normalizedLoad1m: number;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    utilization: number;
  };
  disks: RigDiskState[];
  gpu: RigGpuState;
  networkInterfaces: Array<{
    name: string;
    address: string;
    family: string;
    internal: boolean;
  }>;
  health: 'healthy' | 'pressured' | 'critical';
  issues: string[];
}

export interface RigPressureMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  diskUtilization: number;
  gpuUtilization: number | null;
  gpuAvailable: boolean;
  health: RigSnapshot['health'];
}

export interface RigStateConfig {
  intervalMs: number;
  diskPaths: string[];
  historyLimit: number;
  enableGpuProbe: boolean;
}

const DEFAULT_RIG_STATE_CONFIG: RigStateConfig = {
  intervalMs: 15000,
  diskPaths: [],
  historyLimit: 120,
  enableGpuProbe: true,
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

export class RigStateManager extends EventEmitter {
  private readonly config: RigStateConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastSnapshot: RigSnapshot | null = null;
  private history: RigSnapshot[] = [];

  constructor(config: Partial<RigStateConfig> = {}) {
    super();
    const envPaths = (process.env.VERA_RIG_PATHS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    this.config = {
      ...DEFAULT_RIG_STATE_CONFIG,
      ...config,
      diskPaths: uniquePaths([
        process.cwd(),
        '/tmp',
        ...(config.diskPaths ?? []),
        ...envPaths,
      ]),
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.sampleNow();
    this.timer = setInterval(() => {
      this.sampleNow().catch((error) => {
        logger.debug('RigState', {
          message: 'Periodic rig sample failed',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.intervalMs);

    logger.info('RigState', {
      message: 'Rig state monitoring started',
      intervalMs: this.config.intervalMs,
      diskPaths: this.config.diskPaths,
    });
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getSnapshot(): RigSnapshot | null {
    return this.lastSnapshot;
  }

  getHistory(limit = 20): RigSnapshot[] {
    return this.history.slice(-Math.max(1, limit));
  }

  getPressureMetrics(snapshot = this.lastSnapshot): RigPressureMetrics | null {
    if (!snapshot) return null;

    const diskUtilizations = snapshot.disks
      .map((disk) => disk.utilization)
      .filter((value): value is number => typeof value === 'number');

    return {
      cpuUtilization: clamp(snapshot.cpu.normalizedLoad1m),
      memoryUtilization: clamp(snapshot.memory.utilization),
      diskUtilization: diskUtilizations.length > 0
        ? clamp(Math.max(...diskUtilizations))
        : 0,
      gpuUtilization: snapshot.gpu.utilization,
      gpuAvailable: snapshot.gpu.available,
      health: snapshot.health,
    };
  }

  getStats() {
    return {
      running: this.running,
      intervalMs: this.config.intervalMs,
      samples: this.history.length,
      lastSampleAt: this.lastSnapshot?.timestamp ?? null,
      health: this.lastSnapshot?.health ?? 'healthy',
    };
  }

  async sampleNow(): Promise<RigSnapshot> {
    const memoryUsage = process.memoryUsage();
    const disks = await Promise.all(this.config.diskPaths.map((diskPath) => this.getDiskState(diskPath)));
    const gpu = await this.getGpuState();
    const cpuInfo = os.cpus();
    const loadAverage = os.loadavg();
    const normalizedLoad1m = cpuInfo.length > 0 ? loadAverage[0] / cpuInfo.length : 0;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const snapshot: RigSnapshot = {
      timestamp: Date.now(),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptimeSec: os.uptime(),
      process: {
        pid: process.pid,
        cwd: process.cwd(),
        nodeVersion: process.version,
        rssBytes: memoryUsage.rss,
        heapUsedBytes: memoryUsage.heapUsed,
        heapTotalBytes: memoryUsage.heapTotal,
        externalBytes: memoryUsage.external,
      },
      cpu: {
        coreCount: cpuInfo.length,
        model: cpuInfo[0]?.model ?? 'unknown',
        loadAverage,
        normalizedLoad1m,
      },
      memory: {
        totalBytes: totalMemory,
        freeBytes: freeMemory,
        usedBytes: usedMemory,
        utilization: totalMemory > 0 ? usedMemory / totalMemory : 0,
      },
      disks,
      gpu,
      networkInterfaces: this.collectNetworkInterfaces(),
      health: 'healthy',
      issues: [],
    };

    snapshot.issues = this.deriveIssues(snapshot);
    snapshot.health = this.deriveHealth(snapshot.issues);

    this.lastSnapshot = snapshot;
    this.history.push(snapshot);
    if (this.history.length > this.config.historyLimit) {
      this.history.shift();
    }

    this.emit('snapshot', snapshot);
    return snapshot;
  }

  private deriveIssues(snapshot: RigSnapshot): string[] {
    const issues: string[] = [];

    if (snapshot.cpu.normalizedLoad1m >= 1.25) {
      issues.push(`cpu pressure ${(snapshot.cpu.normalizedLoad1m * 100).toFixed(0)}%`);
    } else if (snapshot.cpu.normalizedLoad1m >= 0.9) {
      issues.push(`cpu warm ${(snapshot.cpu.normalizedLoad1m * 100).toFixed(0)}%`);
    }

    if (snapshot.memory.utilization >= 0.92) {
      issues.push(`memory critical ${(snapshot.memory.utilization * 100).toFixed(0)}%`);
    } else if (snapshot.memory.utilization >= 0.82) {
      issues.push(`memory pressured ${(snapshot.memory.utilization * 100).toFixed(0)}%`);
    }

    for (const disk of snapshot.disks) {
      if (disk.utilization === null) continue;
      if (disk.utilization >= 0.95) {
        issues.push(`disk critical ${disk.path} ${(disk.utilization * 100).toFixed(0)}%`);
      } else if (disk.utilization >= 0.85) {
        issues.push(`disk pressured ${disk.path} ${(disk.utilization * 100).toFixed(0)}%`);
      }
    }

    if (snapshot.gpu.available && snapshot.gpu.utilization !== null && snapshot.gpu.utilization >= 0.95) {
      issues.push(`gpu saturated ${(snapshot.gpu.utilization * 100).toFixed(0)}%`);
    }

    return issues;
  }

  private deriveHealth(issues: string[]): RigSnapshot['health'] {
    if (issues.some((issue) => issue.includes('critical') || issue.includes('saturated'))) {
      return 'critical';
    }
    if (issues.length > 0) {
      return 'pressured';
    }
    return 'healthy';
  }

  private collectNetworkInterfaces(): RigSnapshot['networkInterfaces'] {
    const interfaces = os.networkInterfaces();
    const results: RigSnapshot['networkInterfaces'] = [];

    for (const [name, values] of Object.entries(interfaces)) {
      for (const value of values ?? []) {
        results.push({
          name,
          address: value.address,
          family: value.family,
          internal: value.internal,
        });
      }
    }

    return results;
  }

  private async getDiskState(diskPath: string): Promise<RigDiskState> {
    try {
      const stats = await fs.statfs(diskPath);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bavail;
      const usedBytes = totalBytes - freeBytes;
      return {
        path: diskPath,
        available: true,
        totalBytes,
        freeBytes,
        usedBytes,
        utilization: totalBytes > 0 ? usedBytes / totalBytes : 0,
      };
    } catch (error) {
      return {
        path: diskPath,
        available: false,
        totalBytes: null,
        freeBytes: null,
        usedBytes: null,
        utilization: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getGpuState(): Promise<RigGpuState> {
    if (!this.config.enableGpuProbe) {
      return {
        available: false,
        source: 'none',
        deviceCount: 0,
        utilization: null,
        memoryUsedMiB: null,
        memoryTotalMiB: null,
      };
    }

    try {
      const { stdout } = await execFileAsync(
        'nvidia-smi',
        ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
        { timeout: 1500 }
      );
      const rows = stdout
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(',').map((value) => Number(value.trim())));

      if (rows.length === 0) {
        throw new Error('no gpu rows returned');
      }

      const totalUtilization = rows.reduce((sum, row) => sum + (row[0] || 0), 0);
      const totalMemoryUsed = rows.reduce((sum, row) => sum + (row[1] || 0), 0);
      const totalMemory = rows.reduce((sum, row) => sum + (row[2] || 0), 0);

      return {
        available: true,
        source: 'nvidia-smi',
        deviceCount: rows.length,
        utilization: rows.length > 0 ? clamp((totalUtilization / rows.length) / 100) : null,
        memoryUsedMiB: totalMemoryUsed,
        memoryTotalMiB: totalMemory,
      };
    } catch (error) {
      const cudaDevices = process.env.CUDA_VISIBLE_DEVICES;
      if (cudaDevices && cudaDevices !== 'none' && cudaDevices !== '') {
        const deviceCount = cudaDevices.split(',').filter(Boolean).length;
        return {
          available: true,
          source: 'env',
          deviceCount,
          utilization: null,
          memoryUsedMiB: null,
          memoryTotalMiB: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        available: false,
        source: 'none',
        deviceCount: 0,
        utilization: null,
        memoryUsedMiB: null,
        memoryTotalMiB: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const rigState = new RigStateManager();
