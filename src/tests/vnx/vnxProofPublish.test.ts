import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const configMock = {
  VNX_PROOF_TOPIC_ID: undefined as string | undefined,
  VERA_PROOF_TOPIC_ID: undefined as string | undefined,
  HCS_TOPIC_ID: undefined as string | undefined,
  HEDERA_OPERATOR_ACCOUNT_ID: undefined as string | undefined,
  HEDERA_OPERATOR_PRIVATE_KEY: undefined as string | undefined,
  HEDERA_NETWORK: 'testnet' as string,
  MIRROR_NODE_BASE_URL: 'https://testnet.mirrornode.hedera.com',
};

vi.mock('../../config.js', () => ({ config: configMock }));

describe('VNX proof publisher unit tests', () => {
  beforeEach(() => {
    configMock.VNX_PROOF_TOPIC_ID = undefined;
    configMock.VERA_PROOF_TOPIC_ID = undefined;
    configMock.HCS_TOPIC_ID = undefined;
    configMock.HEDERA_OPERATOR_ACCOUNT_ID = undefined;
    configMock.HEDERA_OPERATOR_PRIVATE_KEY = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when topic ID is unconfigured', async () => {
    const { publishVnxProof } = await import('../../vnx/proofPublisher.js');
    await expect(publishVnxProof({ standard: 'VNX-LM-PROOF-1', modelHash: 'a'.repeat(64) }))
      .rejects.toThrow('VNX_PROOF_TOPIC_ID');
  });

  it('throws when Hedera operator is unconfigured', async () => {
    const { publishVnxProof } = await import('../../vnx/proofPublisher.js');
    configMock.HCS_TOPIC_ID = '0.0.12345';
    await expect(publishVnxProof({ standard: 'VNX-LM-PROOF-1', modelHash: 'a'.repeat(64) }))
      .rejects.toThrow('not configured');
  });
});
