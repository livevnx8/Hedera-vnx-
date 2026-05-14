#!/usr/bin/env tsx
/**
 * VeraLattice scaling cost report.
 *
 * The in-process tracker is useful for app-runtime summaries. This CLI also
 * prints planning estimates so deploy operators can sanity-check the scaling
 * savings path before a persistent metrics sink is wired in.
 */

import { costTracker } from '../src/optimization/costTracker.js';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface SavingEstimate {
  optimization: string;
  low: number;
  high: number;
  basis: string;
}

const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const baselineMonthly = readBaselineMonthly();
const runtimeSamples = readRuntimeSampleCount();
const runtimeReport = sanitize(costTracker.generateReport()) as Record<string, JsonValue>;
const estimates = buildSavingEstimates(baselineMonthly);

const report = {
  generatedAt: new Date().toISOString(),
  runtimeSamples,
  baselineMonthly,
  runtime: runtimeReport,
  planning: {
    estimates,
    combinedTarget: {
      low: baselineMonthly * 0.5,
      high: baselineMonthly * 0.6,
      basis: 'Expected combined savings after overlap between compute, HBAR, and GPU optimizations',
    },
  },
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

printTextReport(report);
process.exit(0);

function readBaselineMonthly(): number {
  const baselineFlag = args.findIndex((arg) => arg === '--baseline-monthly');
  const raw =
    baselineFlag >= 0 ? args[baselineFlag + 1] : process.env.VERA_BASELINE_MONTHLY_COST;
  const parsed = Number(raw ?? 4000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 4000;
  }

  return parsed;
}

function readRuntimeSampleCount(): number {
  try {
    const exported = JSON.parse(costTracker.exportData('json'));
    return Array.isArray(exported) ? exported.length : 0;
  } catch {
    return 0;
  }
}

function buildSavingEstimates(baseline: number): SavingEstimate[] {
  return [
    {
      optimization: 'Spot instances',
      low: baseline * 0.3,
      high: baseline * 0.45,
      basis: '70% compute savings on the eligible GPU/compute share',
    },
    {
      optimization: 'Right-sizing',
      low: baseline * 0.1,
      high: baseline * 0.15,
      basis: 'Autoscaling and resource waste reduction',
    },
    {
      optimization: 'HBAR batching',
      low: baseline * 0.025,
      high: baseline * 0.05,
      basis: '30-40% fee savings on Hedera transaction volume',
    },
    {
      optimization: 'GPU optimizer',
      low: baseline * 0.075,
      high: baseline * 0.125,
      basis: 'Dynamic layer placement and utilization tuning',
    },
  ];
}

function sanitize(value: unknown): JsonValue {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitize(entry));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitize(entry),
      ])
    ) as { [key: string]: JsonValue };
  }

  return null;
}

function printTextReport(summary: typeof report): void {
  const totalCost = numberFrom(summary.runtime.totalCost);
  const costPerRequest = numberFrom(summary.runtime.costPerRequest);
  const costPerTransaction = numberFrom(summary.runtime.costPerTransaction);

  console.log('VeraLattice Cost Report');
  console.log('=======================');
  console.log(`Generated: ${summary.generatedAt}`);
  console.log(`Runtime samples: ${summary.runtimeSamples}`);
  console.log('');

  if (summary.runtimeSamples === 0) {
    console.log('Runtime tracker');
    console.log('  No cost samples are available in this CLI process yet.');
    console.log('  Wire the tracker to a persistent metrics sink or call it from the running service for live cost data.');
  } else {
    console.log('Runtime tracker');
    console.log(`  7d total: ${formatCurrency(totalCost)}`);
    console.log(`  Cost/request: ${formatCurrency(costPerRequest, 6)}`);
    console.log(`  Cost/Hedera transaction: ${formatCurrency(costPerTransaction, 6)}`);
  }

  console.log('');
  console.log(`Planning baseline: ${formatCurrency(summary.baselineMonthly)}/month`);
  console.log('');
  console.log('Estimated monthly optimization impact');
  for (const estimate of summary.planning.estimates) {
    console.log(
      `  ${estimate.optimization.padEnd(16)} ${formatCurrency(estimate.low).padStart(12)} - ${formatCurrency(estimate.high).padStart(12)}  ${estimate.basis}`
    );
  }

  console.log('');
  console.log(
    `Combined target: ${formatCurrency(summary.planning.combinedTarget.low)} - ${formatCurrency(summary.planning.combinedTarget.high)}/month`
  );
  console.log(
    'Note: individual estimates are gross levers; the combined target accounts for overlap.'
  );
  console.log('');
  console.log('Options: --json, --baseline-monthly <usd>');
}

function numberFrom(value: JsonValue | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatCurrency(value: number, fractionDigits = 2): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}
