import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Import vnx-lm-core.js as an ES module. Node.js 20 supports crypto.subtle natively.
const corePath = path.resolve(rootDir, 'public/js/vnx-lm-core.js');
const core = await import(corePath);

const SWARM_CONFIG = [
  {
    name: 'vera-dialogue',
    corpusFile: 'scripts/corpora/vera-dialogue.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'qvx-telemetry',
    corpusFile: 'scripts/corpora/qvx-telemetry.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'ledger-ops',
    corpusFile: 'scripts/corpora/ledger-ops.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'proof-kernel',
    corpusFile: 'scripts/corpora/proof-kernel.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'manifesto-spirit',
    corpusFile: 'scripts/corpora/manifesto-spirit.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'code-forge',
    corpusFile: 'scripts/corpora/code-forge.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'security-warden',
    corpusFile: 'scripts/corpora/security-warden.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'memory-weave',
    corpusFile: 'scripts/corpora/memory-weave.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'creative-nexus',
    corpusFile: 'scripts/corpora/creative-nexus.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'logic-sage',
    corpusFile: 'scripts/corpora/logic-sage.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'data-weaver',
    corpusFile: 'scripts/corpora/data-weaver.txt',
    vertexCount: 60,
    contextSize: 8,
  },
  {
    name: 'network-pulse',
    corpusFile: 'scripts/corpora/network-pulse.txt',
    vertexCount: 60,
    contextSize: 8,
  },
];

const outputDir = path.resolve(rootDir, 'public/vnx-swarm');
fs.mkdirSync(outputDir, { recursive: true });

for (const config of SWARM_CONFIG) {
  const corpusPath = path.resolve(rootDir, config.corpusFile);
  const corpus = fs.readFileSync(corpusPath, 'utf-8');

  console.log(`\nForging ${config.name}...`);
  console.log(`  corpus: ${config.corpusFile} (${corpus.length} chars)`);
  console.log(`  vertices: ${config.vertexCount}, context: ${config.contextSize}`);

  const started = performance.now();
  const model = await core.trainVnxModelWithHash(corpus, {
    vertexCount: config.vertexCount,
    contextSize: config.contextSize,
    name: config.name,
    onProgress: (p: { progress: number }) => {
      if (p.progress === 1 || Math.floor(p.progress * 10) !== Math.floor((p.progress - 0.001) * 10)) {
        process.stdout.write(`\r  progress: ${Math.round(p.progress * 100)}%`);
      }
    },
  });
  const elapsed = performance.now() - started;

  const exported = await core.exportVnxModel(model);
  const outputFile = path.resolve(outputDir, `${config.name}.vnx`);
  fs.writeFileSync(outputFile, exported);

  const modelHash = await core.hashVnxModel(model);
  console.log(`\n  forged in ${elapsed.toFixed(1)}ms`);
  console.log(`  model hash: ${modelHash}`);
  console.log(`  file: ${outputFile} (${exported.length} bytes)`);
}

console.log('\nSwarm pre-training complete.');
