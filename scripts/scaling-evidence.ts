#!/usr/bin/env tsx
/**
 * Collect a repeatable scaling evidence packet.
 *
 * Defaults are read-only. Use --run-verify to include
 * ./scripts/deploy-scaling.sh verify, which may open a temporary port-forward.
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

interface CommandResult {
  title: string;
  command: string;
  exitCode: number | null;
  required: boolean;
  skipped?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface Options {
  namespace: string;
  deployment: string;
  hpa: string;
  outputDir: string;
  runVerify: boolean;
  includeLogs: boolean;
  costBaseline?: string;
}

const options = parseOptions(process.argv.slice(2));
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const results: CommandResult[] = [];

results.push(runCommand('Git revision', 'git', ['rev-parse', '--short', 'HEAD'], { required: false }));
results.push(runCommand('Kubectl client', 'kubectl', ['version', '--client']));
results.push(runCommand('Cluster access', 'kubectl', ['cluster-info']));

if (options.runVerify) {
  results.push(
    runCommand('Deployment verify', './scripts/deploy-scaling.sh', ['verify'], {
      timeoutMs: 180000,
    })
  );
} else {
  results.push(skippedResult('Deployment verify', './scripts/deploy-scaling.sh verify', 'not requested; pass --run-verify to include it'));
}

results.push(runKubectl('Namespace resources', ['get', 'all', '-n', options.namespace]));
results.push(runKubectl('HPA status', ['get', 'hpa', '-n', options.namespace]));
results.push(runKubectl('HPA details', ['describe', 'hpa', options.hpa, '-n', options.namespace]));
results.push(
  runKubectl('Rollout status', ['rollout', 'status', `deployment/${options.deployment}`, '-n', options.namespace], {
    timeoutMs: 120000,
  })
);
results.push(runKubectl('Deployment details', ['describe', 'deployment', options.deployment, '-n', options.namespace]));
results.push(runKubectl('Recent events', ['get', 'events', '-n', options.namespace, '--sort-by=.lastTimestamp']));

if (options.includeLogs) {
  results.push(runKubectl('Recent deployment logs', ['logs', '-n', options.namespace, `deployment/${options.deployment}`, '--tail=100']));
} else {
  results.push(skippedResult('Recent deployment logs', `kubectl logs -n ${options.namespace} deployment/${options.deployment} --tail=100`, 'not requested; pass --include-logs to include it'));
}

const costArgs = ['tsx', 'scripts/cost-report.ts', '--json'];
if (options.costBaseline) {
  costArgs.push('--baseline-monthly', options.costBaseline);
}
results.push(runCommand('Cost report JSON', 'npx', costArgs));

const finishedAt = new Date();
const packet = buildPacket(results, startedAt, finishedAt, options);
const json = JSON.stringify({ startedAt, finishedAt, options, results }, null, 2);
const mdPath = join(options.outputDir, `scaling-run-${stamp}.md`);
const jsonPath = join(options.outputDir, `scaling-run-${stamp}.json`);

if (!existsSync(options.outputDir)) {
  mkdirSync(options.outputDir, { recursive: true });
}

writeFileSync(mdPath, packet);
writeFileSync(jsonPath, json);

const failed = getBlockingFailures(results);

console.log(`Scaling evidence packet: ${resolve(mdPath)}`);
console.log(`Raw command output: ${resolve(jsonPath)}`);
console.log(`Commands run: ${results.filter((result) => !result.skipped).length}`);
console.log(`Commands skipped: ${results.filter((result) => result.skipped).length}`);
console.log(`Required commands failed: ${failed.length}`);

if (failed.length > 0) {
  console.log('');
  console.log('Failed required commands:');
  for (const result of failed) {
    console.log(`- ${result.title}: ${result.command}`);
  }
  process.exit(1);
}

function parseOptions(args: string[]): Options {
  return {
    namespace: readArg(args, '--namespace') ?? process.env.VERA_NAMESPACE ?? 'vera',
    deployment: readArg(args, '--deployment') ?? process.env.VERA_DEPLOYMENT ?? 'vera-lattice',
    hpa: readArg(args, '--hpa') ?? process.env.VERA_HPA ?? 'vera-lattice-hpa',
    outputDir: readArg(args, '--output-dir') ?? 'docs/evidence',
    runVerify: args.includes('--run-verify'),
    includeLogs: args.includes('--include-logs'),
    costBaseline: readArg(args, '--baseline-monthly') ?? process.env.VERA_BASELINE_MONTHLY_COST,
  };
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function runKubectl(title: string, args: string[], config?: { timeoutMs?: number }): CommandResult {
  return runCommand(title, 'kubectl', args, config);
}

function runCommand(
  title: string,
  command: string,
  args: string[],
  config: { timeoutMs?: number; required?: boolean } = {}
): CommandResult {
  const started = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: config.timeoutMs ?? 30000,
  });

  return {
    title,
    command: [command, ...args].join(' '),
    exitCode: result.status,
    required: config.required ?? true,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
    durationMs: Date.now() - started,
  };
}

function skippedResult(title: string, command: string, skipped: string): CommandResult {
  return {
    title,
    command,
    exitCode: null,
    required: false,
    skipped,
    stdout: '',
    stderr: '',
    durationMs: 0,
  };
}

function buildPacket(
  commandResults: CommandResult[],
  started: Date,
  finished: Date,
  runOptions: Options
): string {
  const blockingFailures = getBlockingFailures(commandResults);
  const skipped = commandResults.filter((result) => result.skipped);
  const promotionDecision = blockingFailures.length === 0 ? 'Evidence captured; operator review required.' : 'Hold promotion until failed required commands are resolved.';

  return `# VeraLattice Scaling Evidence Run

## Run Metadata

- Started: ${started.toISOString()}
- Finished: ${finished.toISOString()}
- Namespace: \`${runOptions.namespace}\`
- Deployment: \`${runOptions.deployment}\`
- HPA: \`${runOptions.hpa}\`
- Run verify: ${runOptions.runVerify ? 'yes' : 'no'}
- Include logs: ${runOptions.includeLogs ? 'yes' : 'no'}
- Baseline monthly cost: ${runOptions.costBaseline ?? 'default'}

## Summary

- Commands run: ${commandResults.filter((result) => !result.skipped).length}
- Commands skipped: ${skipped.length}
- Required commands failed: ${blockingFailures.length}
- Promotion decision: ${promotionDecision}

## Promotion Checklist

- [ ] Cluster deploys cleanly.
- [ ] HPA state is captured.
- [ ] Load test proves scale-up and readiness.
- [ ] Health/readiness evidence is clean.
- [ ] Cost report includes observed runtime samples or records the instrumentation gap.
- [ ] Model checkpoint validation is attached when promoting a model.
- [ ] HCS, settlement, reputation, or dashboard proof is attached when claiming production readiness.

## Command Evidence

${commandResults.map(formatResult).join('\n\n')}

## Autoscaling Evidence To Attach

- Load method:
- Starting replicas:
- Peak replicas:
- Final replicas:
- Scale-up latency:
- Scale-down behavior:
- Failed scheduling events:

## Ledger And Proof Evidence To Attach

- HCS topic ID:
- HCS transaction ID:
- Settlement record:
- Reputation update:
- Dashboard metric:
- HIP-1056 block-stream reference:

## Gaps And Follow-Up

${blockingFailures.length === 0 ? '- Operator review still required before changing readiness labels.' : blockingFailures.map((result) => `- Resolve failed command: ${result.title}`).join('\n')}
`;
}

function formatResult(result: CommandResult): string {
  if (result.skipped) {
    return `### ${result.title}

- Command: \`${result.command}\`
- Status: skipped
- Reason: ${result.skipped}`;
  }

  return `### ${result.title}

- Command: \`${result.command}\`
- Exit code: ${result.exitCode}
- Required: ${result.required ? 'yes' : 'no'}
- Duration: ${result.durationMs}ms

Stdout:

\`\`\`text
${trimOutput(result.stdout)}
\`\`\`

Stderr:

\`\`\`text
${trimOutput(result.stderr)}
\`\`\``;
}

function trimOutput(output: string): string {
  const value = output.trim();
  if (value.length <= 12000) {
    return value;
  }

  return `${value.slice(0, 12000)}\n... output truncated by scaling-evidence.ts ...`;
}

function getBlockingFailures(commandResults: CommandResult[]): CommandResult[] {
  return commandResults.filter(
    (result) => result.required && !result.skipped && result.exitCode !== 0
  );
}
