#!/usr/bin/env tsx
/**
 * Vera Training Dashboard
 *
 * Real-time monitoring of Meridian model training with live metrics.
 * Run: npx tsx scripts/training-dashboard.ts
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const TRAINING_LOG = '/tmp/medium_compact_training.log';
const CHECKPOINT_DIR = 'models/meridian/checkpoints/medium-compact-gpt2-v1';

interface TrainingMetrics {
  step: number;
  loss: number;
  timestamp: string;
}

interface GpuMetrics {
  utilization: number;
  memoryUsed: number;
  temperature: number;
}

function getTrainingMetrics(): TrainingMetrics | null {
  if (!existsSync(TRAINING_LOG)) return null;

  try {
    const content = readFileSync(TRAINING_LOG, 'utf8');
    const lines = content.trim().split('\n');
    const lastLine = lines[lines.length - 1];

    // Parse: "step=3960 loss=10.1070"
    const stepMatch = lastLine.match(/step=(\d+)/);
    const lossMatch = lastLine.match(/loss=([\d.]+)/);

    if (stepMatch && lossMatch) {
      return {
        step: parseInt(stepMatch[1], 10),
        loss: parseFloat(lossMatch[1]),
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function getGpuMetrics(): GpuMetrics | null {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 5000 }
    );
    const [util, mem, temp] = output.trim().split(',').map(s => parseFloat(s.trim()));
    return {
      utilization: util,
      memoryUsed: mem,
      temperature: temp,
    };
  } catch {
    return null;
  }
}

function getTrainingProcess(): { running: boolean; runtime: string; pid?: number } {
  try {
    const output = execSync(
      'ps aux | grep train_large_gpt2 | grep -v grep',
      { encoding: 'utf8' }
    );
    const lines = output.trim().split('\n');
    if (lines.length > 0 && lines[0].trim()) {
      const parts = lines[0].trim().split(/\s+/);
      return {
        running: true,
        runtime: parts[9] || 'unknown',
        pid: parseInt(parts[1], 10),
      };
    }
  } catch {
    // Process not found
  }
  return { running: false, runtime: 'N/A' };
}

function getCheckpoints(): Array<{ name: string; size: string; epoch: number; date: string }> {
  if (!existsSync(CHECKPOINT_DIR)) return [];

  try {
    const output = execSync(`ls -lh ${CHECKPOINT_DIR}/*.pt 2>/dev/null || echo ""`, { encoding: 'utf8' });
    return output
      .trim()
      .split('\n')
      .filter(line => line.includes('.pt'))
      .map(line => {
        const parts = line.trim().split(/\s+/);
        const name = parts[parts.length - 1].split('/').pop() || 'unknown';
        const size = parts[4] || 'unknown';
        const date = `${parts[5]} ${parts[6]} ${parts[7]}`;
        const epochMatch = name.match(/epoch[_-]?(\d+)/);
        return {
          name,
          size,
          epoch: epochMatch ? parseInt(epochMatch[1], 10) : 0,
          date,
        };
      })
      .sort((a, b) => b.epoch - a.epoch);
  } catch {
    return [];
  }
}

function formatRuntime(runtime: string): string {
  if (!runtime || runtime === 'N/A') return 'Unknown';
  const parts = runtime.split(':');
  if (parts.length === 1) return runtime; // Just minutes
  if (parts.length === 2) {
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    return `${hours}h ${mins}m`;
  }
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseInt(parts[2], 10);
    return `${hours}h ${mins}m ${secs}s`;
  }
  return runtime;
}

function clearScreen() {
  console.log('\x1b[2J\x1b[0f');
}

function renderDashboard() {
  clearScreen();

  const metrics = getTrainingMetrics();
  const gpu = getGpuMetrics();
  const process = getTrainingProcess();
  const checkpoints = getCheckpoints();

  // Header
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           🧠 VERA MERIDIAN TRAINING DASHBOARD                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();

  // Training Status
  const statusEmoji = process.running ? '🟢' : '🔴';
  const statusText = process.running ? 'TRAINING' : 'STOPPED';
  console.log(`  ${statusEmoji}  Status: ${statusText}`);
  console.log(`  ⏱️  Runtime: ${formatRuntime(process.runtime)}`);
  if (process.pid) {
    console.log(`  🆔  PID: ${process.pid}`);
  }
  console.log();

  // Training Metrics
  if (metrics) {
    const lossTrend = metrics.loss < 10 ? '↘️ improving' : metrics.loss < 12 ? '➡️ stable' : '↗️ high';
    console.log('  📊 TRAINING METRICS');
    console.log('  ─────────────────────');
    console.log(`  Step:    ${metrics.step.toLocaleString()}`);
    console.log(`  Loss:    ${metrics.loss.toFixed(4)} ${lossTrend}`);
    console.log();
  }

  // GPU Metrics
  if (gpu) {
    const tempEmoji = gpu.temperature > 80 ? '🔥' : gpu.temperature > 70 ? '⚠️' : '✅';
    const utilBar = '█'.repeat(Math.floor(gpu.utilization / 5)) + '░'.repeat(20 - Math.floor(gpu.utilization / 5));

    console.log('  🎮 GPU METRICS');
    console.log('  ─────────────────────');
    console.log(`  Utilization: [${utilBar}] ${gpu.utilization.toFixed(0)}%`);
    console.log(`  Memory:      ${gpu.memoryUsed.toFixed(0)} MB / ~7600 MB`);
    console.log(`  Temperature: ${gpu.temperature.toFixed(0)}°C ${tempEmoji}`);
    console.log();
  }

  // Checkpoints
  if (checkpoints.length > 0) {
    console.log('  💾 CHECKPOINTS');
    console.log('  ─────────────────────');
    checkpoints.slice(0, 3).forEach(cp => {
      console.log(`  • ${cp.name} (${cp.size}) - ${cp.date}`);
    });
    console.log();
  }

  // Quick Actions
  console.log('  ⌨️  QUICK ACTIONS');
  console.log('  ─────────────────────');
  console.log('  Press Ctrl+C to exit dashboard');
  console.log(`  Run: npx tsx scripts/validate-checkpoint.ts ${checkpoints[0]?.name || '[checkpoint]'}`);
  console.log('  Run: tail -f /tmp/medium_compact_training.log');
  console.log();

  // Footer
  console.log('  Last updated: ' + new Date().toLocaleTimeString());
  console.log();
  console.log('  Quantum-Enhanced • Geometry-Routed • Hedera-Anchored');
}

// Main loop
console.log('🚀 Starting Vera Training Dashboard...');
console.log('Press Ctrl+C to exit\n');

renderDashboard();

// Update every 5 seconds
const interval = setInterval(renderDashboard, 5000);

// Graceful exit
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n👋 Dashboard stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  process.exit(0);
});
