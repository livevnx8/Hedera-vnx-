#!/usr/bin/env tsx
/**
 * NVIDIA runtime health check for Vera.
 *
 * This is intentionally non-invasive: it checks local GPU/NVML access,
 * NIM/Nemotron OpenAI-compatible endpoints, and GPU optimizer bounds.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { GPULayerOptimizer } from '../src/optimization/gpuLayerOptimizer.js';

interface Check {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

const checks: Check[] = [];

const outputJson = process.argv.includes('--json');
const nimUrl = normalizeApiBaseUrl(process.env.NIM_URL || 'http://localhost:8000');
const nemotronUrl = normalizeApiBaseUrl(process.env.NEMOTRON_URL || process.env.NIM_URL || 'http://localhost:8000');

checks.push(checkDeviceNodes());
checks.push(checkNvidiaSmi());
checks.push(await checkEndpoint('NIM models endpoint', `${nimUrl}/models`, Boolean(process.env.USE_NIM === 'true')));
checks.push(await checkEndpoint('Nemotron health/models endpoint', `${nemotronUrl}/health`, false, `${nemotronUrl}/models`));
checks.push(checkGpuOptimizer());

const summary = {
  generatedAt: new Date().toISOString(),
  ok: checks.every((check) => check.status !== 'fail'),
  checks,
};

if (outputJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('Vera NVIDIA Health Check');
  console.log('========================');
  for (const check of checks) {
    const mark = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${mark.padEnd(4)} ${check.name}: ${check.detail}`);
  }
}

process.exit(summary.ok ? 0 : 1);

function checkDeviceNodes(): Check {
  const nodes = ['/dev/nvidia0', '/dev/nvidiactl', '/dev/nvidia-uvm'];
  const missing = nodes.filter((node) => !existsSync(node));

  if (missing.length === 0) {
    return { name: 'NVIDIA device nodes', status: 'pass', detail: nodes.join(', ') };
  }

  return {
    name: 'NVIDIA device nodes',
    status: 'warn',
    detail: `Missing ${missing.join(', ')}; GPU runtime may still work through another device mapping`,
  };
}

function checkNvidiaSmi(): Check {
  let lastError = '';
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const output = execFileSync('nvidia-smi', [
          '--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu',
          '--format=csv,noheader,nounits',
        ], {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();

        return {
          name: 'NVML / nvidia-smi',
          status: 'pass',
          detail: output || 'nvidia-smi returned no rows',
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    // fall through to failure after retries
  }

  return {
    name: 'NVML / nvidia-smi',
    status: 'fail',
    detail: lastError || 'nvidia-smi failed after retries',
  };
}

async function checkEndpoint(name: string, url: string, required: boolean, fallbackUrl?: string): Promise<Check> {
  const first = await fetchStatus(url);
  if (first.ok) {
    return { name, status: 'pass', detail: `${url} returned ${first.status}` };
  }

  if (fallbackUrl) {
    const fallback = await fetchStatus(fallbackUrl);
    if (fallback.ok) {
      return { name, status: 'pass', detail: `${fallbackUrl} returned ${fallback.status}` };
    }
  }

  return {
    name,
    status: required ? 'fail' : 'warn',
    detail: `${url}${fallbackUrl ? ` or ${fallbackUrl}` : ''} unavailable (${first.detail})`,
  };
}

async function fetchStatus(url: string): Promise<{ ok: boolean; status?: number; detail: string }> {
  try {
    const response = await fetch(url, {
      headers: process.env.NIM_API_KEY ? { Authorization: `Bearer ${process.env.NIM_API_KEY}` } : undefined,
      signal: AbortSignal.timeout(2000),
    });
    return {
      ok: response.ok,
      status: response.status,
      detail: `${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkGpuOptimizer(): Check {
  const optimizer = new GPULayerOptimizer();
  const critical = optimizer.optimizeForRequest({
    estimatedTokens: 4096,
    toolCount: 6,
    complexity: 'critical',
    priority: 10,
    requiresReasoning: true,
  });
  optimizer.destroy();

  const ok = critical.layers === 35
    && critical.contextSize === 4096
    && critical.sacredFrequency === 741;

  return {
    name: 'GPU layer optimizer',
    status: ok ? 'pass' : 'fail',
    detail: `layers=${critical.layers}, context=${critical.contextSize}, frequency=${critical.sacredFrequency}`,
  };
}

function normalizeApiBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
