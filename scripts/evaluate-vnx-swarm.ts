import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runVnxSwarmEvaluation } from '../src/vnx/swarmEvaluation.js';

const report = await runVnxSwarmEvaluation();
const evidenceDir = join(process.cwd(), 'docs', 'evidence');
const evidencePath = join(evidenceDir, 'vnx-swarm-eval-latest.json');

console.log(`VNX Swarm Evaluation (${report.standard})`);
console.log(`Cases: ${report.passed}/${report.caseCount} passed`);
console.log(`Score: ${report.score}/${report.maxScore}`);
console.log(`Promotion ready: ${report.promotionReady ? 'yes' : 'no'}`);
console.log('');

for (const item of report.cases) {
  const mark = item.pass ? 'PASS' : 'FAIL';
  console.log(`${mark} ${item.id} [${item.category}]`);
  console.log(`  selected: ${item.selected.join(', ') || 'none'}`);
  console.log(`  score: ${item.score}/${item.maxScore}`);
  if (item.notes.length) {
    console.log(`  notes: ${item.notes.join('; ')}`);
  }
}

console.log('');
console.log('Recommended route weights:');
console.log(JSON.stringify(report.recommendedRouteWeights, null, 2));

await mkdir(evidenceDir, { recursive: true });
await writeFile(evidencePath, JSON.stringify(report, null, 2));
console.log('');
console.log(`Evidence written: ${evidencePath}`);

if (!report.promotionReady) {
  process.exitCode = 1;
}
