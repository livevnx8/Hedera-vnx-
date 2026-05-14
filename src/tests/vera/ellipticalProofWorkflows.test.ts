import { describe, expect, it } from 'vitest';
import { getEllipticalProofWorkflowModel } from '../../vera/workflows/ellipticalProofWorkflows.js';

describe('Elliptical proof workflows', () => {
  it('keeps marketplace work and verifiable proof as paired foci', () => {
    const model = getEllipticalProofWorkflowModel();

    expect(model.foci.map((focus) => focus.focus)).toEqual(['work', 'proof']);
    expect(model.loop[0].stage).toBe('brief');
    expect(model.loop.at(-1)?.stage).toBe('upgrade_package');
    expect(model.loop.some((step) => step.stage === 'receipt' && step.requiredEvidence.includes('hip1056_block_stream'))).toBe(true);
  });

  it('uses HIP-1056 as an observe-first evidence lane', () => {
    const model = getEllipticalProofWorkflowModel();

    expect(model.blockStream.hip).toBe('HIP-1056');
    expect(model.blockStream.status).toBe('approved');
    expect(model.blockStream.ingestionPolicy.storeRawBlocks).toBe(false);
    expect(model.blockStream.ingestionPolicy.persistOnly).toContain('blockProofHash');
  });

  it('defines HCS/HIP lattice abilities and replayable workflow recipes', () => {
    const model = getEllipticalProofWorkflowModel();

    expect(model.hcsMemoryPlane.hipCapabilities.map((capability) => capability.hip)).toEqual([
      'HIP-993',
      'HIP-1056',
      'HIP-991',
      'HIP-1200',
    ]);
    expect(model.hcsMemoryPlane.replayIndexes).toContain('packetHash');
    expect(model.latticeAbilities.map((ability) => ability.id)).toContain('proof-backed-recall');
    expect(model.latticeAbilities.find((ability) => ability.id === 'workflow-recovery')?.promotionEvidence).toContain('test');
    expect(model.workflowRecipes.find((recipe) => recipe.id === 'marketplace-proof-loop')?.emits).toContain('settlement.released');
    expect(model.workflowRecipes.find((recipe) => recipe.id === 'mirror-recovery-loop')?.closesWhen).toContain('packet hashes verify');
  });

  it('exposes proof surfaces, risk controls, and promotion milestones for operators', () => {
    const model = getEllipticalProofWorkflowModel();

    expect(model.proofSurfaces.find((surface) => surface.id === 'memory-loop-script')?.readiness).toBe('wired');
    expect(model.proofSurfaces.find((surface) => surface.id === 'memory-proof-api')?.mustExpose).toContain('hashscanUrl');
    expect(model.riskControls.map((risk) => risk.risk)).toContain('Raw private data is written to immutable HCS topics.');
    expect(model.promotionMilestones.map((milestone) => milestone.label)).toEqual([
      'local-proof',
      'testnet-proof',
      'dashboard-proof',
      'production-proof',
    ]);
    expect(model.promotionMilestones.find((milestone) => milestone.label === 'testnet-proof')?.requiredProof).toContain('HashScan link');
  });
});
