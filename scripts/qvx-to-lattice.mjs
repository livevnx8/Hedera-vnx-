#!/usr/bin/env node
// QVX → Lattice Pipeline
import fs from 'fs';
import path from 'path';

const QVX_ARCHIVE = '/mnt/vera-ssd/qvx-archive';
const LATTICE = '/mnt/vera-mirror-shards/vera-lattice/qvx-shards';

fs.mkdirSync(LATTICE, { recursive: true });

function classifyLayer(content) {
  const text = String(content).toLowerCase();
  if (text.includes('consensus') || text.includes('decision')) return 0;
  if (text.includes('balance') || text.includes('transfer') || text.includes('account')) return 1;
  if (text.includes('hts') || text.includes('hcs') || text.includes('carbon')) return 2;
  return 3;
}

async function ingest() {
  console.log('🌸 QVX → Lattice Pipeline Starting...');
  
  const captureDirs = ['bot-captures', 'bot-features'];
  let total = 0;
  
  for (const dir of captureDirs) {
    const dirPath = `${QVX_ARCHIVE}/${dir}`;
    if (!fs.existsSync(dirPath)) continue;
    
    const files = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isFile())
      .slice(0, 500)
      .map(d => d.name);
    
    console.log(`  Processing ${files.length} from ${dir}...`);
    
    for (const file of files) {
      try {
        const filePath = `${dirPath}/${file}`;
        const stat = fs.statSync(filePath);
        if (stat.size > 500_000) continue; // skip huge files
        
        const raw = fs.readFileSync(filePath, 'utf8').slice(0, 5000);
        const layer = classifyLayer(raw);
        
        const shard = {
          id: `${dir}-${file}`,
          source: 'qvx-' + dir,
          timestamp: Date.now(),
          layer,
          size: stat.size,
          preview: raw.slice(0, 500),
          metadata: { originalFile: file, archivedAt: stat.mtime }
        };
        
        fs.writeFileSync(
          `${LATTICE}/${shard.id}.json`,
          JSON.stringify(shard)
        );
        total++;
      } catch (e) {
        // skip malformed
      }
    }
  }
  
  console.log(`✅ Ingested ${total} QVX shards into lattice`);
  
  // Write manifest
  const manifest = {
    lastRun: new Date().toISOString(),
    totalShards: total,
    layers: { 0: 0, 1: 0, 2: 0, 3: 0 }
  };
  
  fs.readdirSync(LATTICE).forEach(f => {
    try {
      const s = JSON.parse(fs.readFileSync(`${LATTICE}/${f}`, 'utf8'));
      manifest.layers[s.layer] = (manifest.layers[s.layer] || 0) + 1;
    } catch {}
  });
  
  fs.writeFileSync(
    '/mnt/vera-mirror-shards/vera-lattice/qvx-manifest.json',
    JSON.stringify(manifest, null, 2)
  );
  
  console.log('📊 Manifest:', manifest);
}

ingest().catch(console.error);
