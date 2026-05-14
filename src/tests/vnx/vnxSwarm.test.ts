import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importVnxModel } from '../../../public/js/vnx-lm-core.js';
import { selectSwarmSpecialists } from '../../../public/js/vnx-swarm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swarmDir = path.resolve(__dirname, '../../../public/vnx-swarm');

const SWARM_MODELS = [
  { id: 'vera-dialogue', name: 'Vera-Dialogue' },
  { id: 'qvx-telemetry', name: 'QVX-Telemetry' },
  { id: 'ledger-ops', name: 'Ledger-Ops' },
  { id: 'proof-kernel', name: 'Proof-Kernel' },
  { id: 'manifesto-spirit', name: 'Manifesto-Spirit' },
  { id: 'code-forge', name: 'Code-Forge' },
  { id: 'security-warden', name: 'Security-Warden' },
  { id: 'memory-weave', name: 'Memory-Weave' },
  { id: 'creative-nexus', name: 'Creative-Nexus' },
  { id: 'logic-sage', name: 'Logic-Sage' },
  { id: 'data-weaver', name: 'Data-Weaver' },
  { id: 'network-pulse', name: 'Network-Pulse' },
];

describe('VNX Swarm pre-trained models', () => {
  it('all 12 .vnx specialist models exist', () => {
    for (const model of SWARM_MODELS) {
      const filePath = path.join(swarmDir, `${model.id}.vnx`);
      expect(fs.existsSync(filePath), `${model.id}.vnx should exist`).toBe(true);
    }
  });

  it('each .vnx model is valid and imports correctly', async () => {
    for (const model of SWARM_MODELS) {
      const filePath = path.join(swarmDir, `${model.id}.vnx`);
      const buffer = fs.readFileSync(filePath);
      const imported = importVnxModel(new Uint8Array(buffer));
      expect(imported.format.magic).toBe('VNX');
      expect(imported.name).toBe(model.id);
      expect(imported.weights.length).toBeGreaterThan(0);
      expect(imported.vertexCount).toBe(60);
      expect(imported.contextSize).toBe(8);
      expect(buffer.length).toBeLessThan(5 * 1024);
    }
  });

  it('browser swarm router selects specialists by prompt keywords', () => {
    const selected = selectSwarmSpecialists('debug a TypeScript build failure for the Hedera proof API', { limit: 4 });
    const ids = selected.map((item) => item.id);
    expect(ids).toContain('code-forge');
    expect(ids.some((id) => id === 'ledger-ops' || id === 'proof-kernel')).toBe(true);
    expect(selected.length).toBeLessThanOrEqual(4);
  });
});
