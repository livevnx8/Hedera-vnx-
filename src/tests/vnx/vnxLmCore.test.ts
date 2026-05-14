import { describe, expect, it } from 'vitest';
import {
  createVnxProofPacket,
  exportVnxModel,
  generateText,
  importVnxModel,
  packTernaryWeights,
  trainVnxModelWithHash,
  unpackTernaryWeights,
} from '../../../public/js/vnx-lm-core.js';

describe('VNX-LM browser core', () => {
  it('packs five ternary weights into each byte and unpacks losslessly', () => {
    const weights = [-1, 0, 1, 1, -1, 0, 0, 1, -1, 1, 1, 0];

    const packed = packTernaryWeights(weights);
    const unpacked = unpackTernaryWeights(packed, weights.length);

    expect(packed.length).toBe(Math.ceil(weights.length / 5));
    expect(unpacked).toEqual(weights);
  });

  it('exports and imports a portable .vnx artifact with corpus provenance', async () => {
    const corpus = 'vera nexum routes every token through the lattice. vera proves the trace.';
    const model = await trainVnxModelWithHash(corpus, { contextSize: 4, name: 'test-vnx' });

    const bytes = await exportVnxModel(model);
    const imported = importVnxModel(bytes);

    expect(bytes[0]).toBe(0x56);
    expect(bytes[1]).toBe(0x4e);
    expect(bytes[2]).toBe(0x58);
    expect(imported.name).toBe('test-vnx');
    expect(imported.tokenizerFamily).toBe('char');
    expect(imported.contextSize).toBe(4);
    expect(imported.vertexCount).toBe(60);
    expect(imported.vocab).toEqual(model.vocab);
    expect(imported.weights).toEqual(model.weights);
    expect(imported.corpusHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps a 60-vertex lattice artifact under 5KB', async () => {
    const corpus = [
      'vera routes tokens through sixty local vertices',
      'qvx proof receipts keep the lattice inspectable',
      'ternary weights stay portable at the sovereign edge',
    ].join(' ').repeat(8);
    const model = await trainVnxModelWithHash(corpus, {
      contextSize: 8,
      vertexCount: 60,
      name: 'sixty-vertex-vnx',
    });

    const bytes = await exportVnxModel(model);
    const imported = importVnxModel(bytes);

    expect(imported.vertexCount).toBe(60);
    expect(imported.weights).toHaveLength(60);
    expect(bytes.length).toBeLessThan(5 * 1024);
  });

  it('generates traceable output with vertex labels and top candidates', async () => {
    const corpus = 'qvx lattice qvx lattice vnx proof vnx proof vera trace vera trace';
    const model = await trainVnxModelWithHash(corpus, { contextSize: 4 });

    const result = generateText(model, 'qvx ', {
      maxTokens: 12,
      random: () => 0.01,
      temperature: 0.85,
    });

    expect(result.text.length).toBeGreaterThan(0);
    expect(result.trace).toHaveLength(12);
    expect(result.trace[0].vertexLabel).toMatch(/^v\d{2}$/);
    expect(result.trace[0].top.length).toBeGreaterThan(0);
    expect(result.trace[0].top[0].probability).toBeGreaterThan(0);
  });

  it('creates deterministic hash-only proof summaries for QVX/HCS evidence', async () => {
    const corpus = 'edge proof lattice edge proof lattice qvx vnx qvx vnx';
    const model = await trainVnxModelWithHash(corpus, {
      contextSize: 4,
      createdAt: '2026-04-29T00:00:00.000Z',
    });
    const result = generateText(model, 'edge', {
      maxTokens: 10,
      random: () => 0.01,
      temperature: 0.85,
    });
    const input = {
      model,
      prompt: 'private operator prompt',
      output: result.text,
      trace: result.trace,
      runtimeTier: 'forge-browser',
      createdAt: '2026-04-29T00:00:01.000Z',
    };

    const proofA = await createVnxProofPacket(input);
    const proofB = await createVnxProofPacket(input);

    expect(proofA.proofHash).toBe(proofB.proofHash);
    expect(proofA.model.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(proofA.inference.traceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(proofA.hcsReadySummary.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(proofA.hcsReadySummary.outputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(proofA.hcsReadySummary.uniqueVertexCount).toBeGreaterThan(0);
    expect(JSON.stringify(proofA.hcsReadySummary)).not.toContain('private operator prompt');
    expect(JSON.stringify(proofA.hcsReadySummary)).not.toContain(result.text);
  });
});
