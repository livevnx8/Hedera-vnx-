import { describe, expect, it } from 'vitest';
import {
  buildVnxSwarmPromptContext,
  selectVnxSwarmSpecialists,
} from '../../vnx/swarmPromptContext.js';

describe('VNX swarm prompt context', () => {
  it('routes coding prompts to Code-Forge without running every specialist', () => {
    const selected = selectVnxSwarmSpecialists('fix the TypeScript API test and rebuild', { limit: 4 });
    expect(selected.map((item) => item.id)).toContain('code-forge');
    expect(selected.length).toBeLessThanOrEqual(4);
  });

  it('routes Hedera proof prompts to ledger and proof specialists', () => {
    const selected = selectVnxSwarmSpecialists('verify the Hedera HCS receipt hash and topic provenance', { limit: 4 });
    const ids = selected.map((item) => item.id);
    expect(ids.some((id) => id === 'ledger-ops' || id === 'proof-kernel')).toBe(true);
    expect(selected.length).toBeLessThanOrEqual(4);
  });

  it('builds compact advisory context from selected local .vnx models', async () => {
    const context = await buildVnxSwarmPromptContext('qvx telemetry proof for a Hedera receipt', {
      maxSpecialists: 4,
      maxTokens: 12,
    });

    expect(context.selected.length).toBeLessThanOrEqual(4);
    expect(context.outputs.length).toBeLessThanOrEqual(4);
    expect(context.enabled).toBe(true);
    expect(context.briefing).toContain('Route=');
    expect(context.promptContext).toContain('VNX Swarm Context');
    expect(context.promptContext).toContain('Selected specialists');
    expect(context.promptContext).toContain('Specialist guidance');
  });
});
