/**
 * Local LLM Server Manager
 * Manages llama.cpp or vLLM server lifecycle for sovereign inference
 * 
 * Responsibilities:
 * - Start/stop local LLM server process
 * - Monitor GPU availability and health
 * - Auto-restart on crashes
 * - Queue management when overloaded
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

export interface LocalLlmConfig {
  modelPath: string;           // Path to GGUF model file
  gpuLayers?: number;          // Number of layers to offload to GPU
  contextSize?: number;        // Context window size
  port?: number;               // Server port
  threads?: number;            // CPU threads
  batchSize?: number;          // Batch size for processing
}

export interface ServerHealth {
  status: 'running' | 'stopped' | 'crashed' | 'overloaded';
  uptimeMs: number;
  requestsInFlight: number;
  gpuUtilization?: number;
  vramUsageMB?: number;
  lastError?: string;
}

export class LocalLlmServer extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: Required<LocalLlmConfig>;
  private health: ServerHealth = {
    status: 'stopped',
    uptimeMs: 0,
    requestsInFlight: 0,
  };
  private startTime = 0;
  private restartAttempts = 0;
  private maxRestarts = 5;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private requestQueue: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = [];

  constructor(userConfig: LocalLlmConfig) {
    super();
    this.config = {
      modelPath: userConfig.modelPath,
      gpuLayers: userConfig.gpuLayers ?? config.NATIVE_GPU_LAYERS ?? 35,
      contextSize: userConfig.contextSize ?? config.NATIVE_CONTEXT_SIZE ?? 4096,
      port: userConfig.port ?? 8081,
      threads: userConfig.threads ?? 4,
      batchSize: userConfig.batchSize ?? 512,
    };
  }

  /**
   * Start the local LLM server
   */
  async start(): Promise<void> {
    if (this.process) {
      logger.warn('LocalLlmServer', { message: 'Server already running' });
      return;
    }

    logger.info('LocalLlmServer', {
      message: 'Starting local LLM server',
      model: this.config.modelPath,
      gpuLayers: this.config.gpuLayers,
      port: this.config.port,
    });

    try {
      // Spawn llama.cpp server
      this.process = spawn('llama-server', [
        '-m', this.config.modelPath,
        '--n-gpu-layers', this.config.gpuLayers.toString(),
        '-c', this.config.contextSize.toString(),
        '--port', this.config.port.toString(),
        '-t', this.config.threads.toString(),
        '-b', this.config.batchSize.toString(),
        '--log-disable',  // We'll handle logging ourselves
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.startTime = Date.now();
      this.health.status = 'running';
      this.restartAttempts = 0;

      // Handle process output
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.parseServerOutput(output);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const error = data.toString();
        logger.debug('LocalLlmServer', { message: 'Server stderr', error: error.slice(0, 200) });
      });

      // Handle crashes
      this.process.on('exit', (code: number | null) => {
        this.handleExit(code);
      });

      // Start health checks
      this.startHealthChecks();

      // Wait for server to be ready
      await this.waitForReady();

      this.emit('started', { port: this.config.port });
      
      logger.info('LocalLlmServer', {
        message: 'Local LLM server ready',
        port: this.config.port,
        model: this.config.modelPath,
      });
    } catch (error) {
      this.health.status = 'crashed';
      this.health.lastError = error instanceof Error ? error.message : String(error);
      logger.error('LocalLlmServer', {
        message: 'Failed to start server',
        error: this.health.lastError,
      });
      throw error;
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    logger.info('LocalLlmServer', { message: 'Stopping server' });

    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Kill process
    this.process.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await sleep(5000);
    
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }

    this.process = null;
    this.health.status = 'stopped';
    this.health.uptimeMs = 0;

    this.emit('stopped');
  }

  /**
   * Get current server health
   */
  getHealth(): ServerHealth {
    if (this.health.status === 'running') {
      this.health.uptimeMs = Date.now() - this.startTime;
    }
    return { ...this.health };
  }

  /**
   * Check if server is ready to accept requests
   */
  isReady(): boolean {
    return this.health.status === 'running' && this.process !== null;
  }

  /**
   * Wait for server to be ready (health check endpoint responds)
   */
  private async waitForReady(): Promise<void> {
    const maxAttempts = 30;
    const delayMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.config.port}/health`, {
          method: 'GET',
        });
        if (response.ok) {
          return;
        }
      } catch {
        // Server not ready yet
      }
      await sleep(delayMs);
    }

    throw new Error('Server failed to become ready within timeout');
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${this.config.port}/health`, {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json() as { status?: string; gpu_util?: number; vram_used?: number };
          this.health.gpuUtilization = data.gpu_util;
          this.health.vramUsageMB = data.vram_used;
        }
      } catch (error) {
        logger.warn('LocalLlmServer', {
          message: 'Health check failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle process exit/crash
   */
  private handleExit(code: number | null): void {
    this.health.status = 'crashed';
    this.health.uptimeMs = Date.now() - this.startTime;

    logger.error('LocalLlmServer', {
      message: 'Server process exited',
      exitCode: code,
      uptimeMs: this.health.uptimeMs,
    });

    this.emit('crashed', { exitCode: code, uptimeMs: this.health.uptimeMs });

    // Auto-restart if within limits
    if (this.restartAttempts < this.maxRestarts) {
      this.restartAttempts++;
      logger.info('LocalLlmServer', {
        message: 'Attempting restart',
        attempt: this.restartAttempts,
        maxRestarts: this.maxRestarts,
      });

      setTimeout(() => {
        void this.start();
      }, 5000);
    } else {
      logger.error('LocalLlmServer', {
        message: 'Max restarts reached, giving up',
      });
      this.emit('failed');
    }
  }

  /**
   * Parse server output for metrics
   */
  private parseServerOutput(output: string): void {
    // Look for queue depth indicators
    const queueMatch = output.match(/queue:\s*(\d+)/i);
    if (queueMatch) {
      this.health.requestsInFlight = parseInt(queueMatch[1], 10);
    }

    // Look for overload indicators
    if (output.includes('overloaded') || output.includes('queue full')) {
      this.health.status = 'overloaded';
      this.emit('overloaded');
    }
  }

  /**
   * Get server statistics
   */
  getStats(): {
    uptimeMs: number;
    status: string;
    restartAttempts: number;
    requestsInFlight: number;
    gpuUtilization?: number;
    vramUsageMB?: number;
  } {
    return {
      uptimeMs: this.health.status === 'running' ? Date.now() - this.startTime : 0,
      status: this.health.status,
      restartAttempts: this.restartAttempts,
      requestsInFlight: this.health.requestsInFlight,
      gpuUtilization: this.health.gpuUtilization,
      vramUsageMB: this.health.vramUsageMB,
    };
  }
}

// Singleton instance for default configuration
export let defaultLocalServer: LocalLlmServer | null = null;

export function initializeLocalServer(config: LocalLlmConfig): LocalLlmServer {
  defaultLocalServer = new LocalLlmServer(config);
  return defaultLocalServer;
}
