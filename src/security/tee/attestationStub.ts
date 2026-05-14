/**
 * Confidential Computing Attestation Stub
 *
 * Intel TDX / AMD SEV attestation integration for zero-trust agent execution.
 * In production, this wraps libtdx-attest or snpguest to generate quotes.
 *
 * Architecture:
 *   1. Node boots inside a confidential VM (TDX/SEV)
 *   2. Agent generates an attestation quote of its enclave measurement
 *   3. Quote is submitted to Vera's attestation verifier via HCS
 *   4. Verifier checks the quote against a known-good MRTD/MRSIGNER
 *   5. Only verified agents receive private keys and HCS topic credentials
 */

import { logger } from '../../monitoring/logger.js';
import { createHash } from 'crypto';

export interface AttestationQuote {
  type: 'TDX' | 'SEV-SNP' | 'SGX';
  quote: string;            // Base64-encoded raw quote
  nonce: string;
  timestamp: number;
  agentId: string;
  mrtd?: string;            // TDX: measurement of TD
  mrsigner?: string;        // SGX: signer measurement
  reportData?: string;      // Custom report data (e.g., agent pubkey hash)
}

export interface AttestationPolicy {
  allowedTypes: Array<'TDX' | 'SEV-SNP' | 'SGX'>;
  allowedMrtds: string[];   // Hex SHA-256 of known-good measurements
  minVersion: string;       // Minimum firmware / microcode version
  requireDebugDisabled: boolean;
}

// ─── Stub Implementations ───────────────────────────────────────────────────

function getAttestationStub(): AttestationQuote {
  // In production, this calls the platform-specific attestation library:
  //   TDX:   /dev/tdx-guest via ioctl(TDX_CMD_GET_REPORT)
  //   SEV:   snpguest report <nonce> --random
  //   SGX:   sgx_get_quote()
  return {
    type: 'TDX',
    quote: Buffer.from('STUB_QUOTE_' + crypto.randomUUID()).toString('base64'),
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
    agentId: process.env.VERA_AGENT_ID || 'unknown',
    reportData: '',
  };
}

export async function generateQuote(agentId: string, nonce?: string): Promise<AttestationQuote> {
  const quote = getAttestationStub();
  quote.agentId = agentId;
  if (nonce) quote.nonce = nonce;
  logger.info('Attestation', { message: 'Quote generated', agentId, type: quote.type });
  return quote;
}

// ─── Verification ───────────────────────────────────────────────────────────

export async function verifyQuote(
  quote: AttestationQuote,
  policy: AttestationPolicy
): Promise<{ valid: boolean; reason?: string; mrtd?: string }> {
  // In production:
  //   1. Parse the quote structure (TDX: TDVM quote, SEV: attestation report)
  //   2. Validate the signature chain (Intel/AMD cert -> platform -> QE/QV)
  //   3. Compare MRTD against allowedMrtds
  //   4. Check TCB level (microcode, firmware, PCE SVN)
  //   5. Verify nonce matches to prevent replay

  if (!policy.allowedTypes.includes(quote.type)) {
    return { valid: false, reason: `Attestation type ${quote.type} not allowed` };
  }

  if (quote.quote.startsWith('STUB_QUOTE_')) {
    // Development mode — accept stub quotes with warning
    logger.warn('Attestation', { message: 'Stub quote accepted (dev mode)', agentId: quote.agentId });
    return { valid: true, mrtd: 'dev-mode-stub' };
  }

  // Production path would parse the real quote here
  return { valid: true };
}

// ─── HCS Attestation Publish ──────────────────────────────────────────────────

export async function publishAttestationToHcs(quote: AttestationQuote): Promise<void> {
  const { TopicMessageSubmitTransaction, TopicId } = await import('@hashgraph/sdk');
  const { getClient } = await import('../../hedera/tools/client.js');

  const client = getClient();
  const topicId = process.env.VERA_ATTESTATION_TOPIC_ID;
  if (!client || !topicId) {
    logger.warn('Attestation', { message: 'HCS not configured — attestation logged locally only' });
    return;
  }

  const payload = JSON.stringify({
    type: 'attestation',
    agentId: quote.agentId,
    attestationType: quote.type,
    nonce: quote.nonce,
    timestamp: quote.timestamp,
    quoteHash: hashQuote(quote.quote),
  });

  await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(payload)
    .execute(client);

  logger.info('Attestation', { message: 'Published to HCS', agentId: quote.agentId, topicId });
}

// ─── Policy Enforcement ─────────────────────────────────────────────────────

export async function enforceAttestationPolicy(
  agentId: string,
  policy: AttestationPolicy = defaultPolicy()
): Promise<boolean> {
  const quote = await generateQuote(agentId);
  const result = await verifyQuote(quote, policy);

  if (!result.valid) {
    logger.error('Attestation', {
      message: 'Attestation failed',
      agentId,
      reason: result.reason,
    });
    return false;
  }

  await publishAttestationToHcs(quote);
  return true;
}

function defaultPolicy(): AttestationPolicy {
  return {
    allowedTypes: ['TDX', 'SEV-SNP'],
    allowedMrtds: process.env.VERA_ALLOWED_MRTDS?.split(',') ?? [],
    minVersion: process.env.VERA_MIN_TCB_VERSION ?? '0.0',
    requireDebugDisabled: true,
  };
}

function hashQuote(quote: string): string {
  return createHash('sha256').update(quote).digest('hex');
}
