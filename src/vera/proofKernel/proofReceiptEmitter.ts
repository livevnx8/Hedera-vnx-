import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { featureFlags } from '../orchestrator/featureFlags.js';

export type ProofReceiptEmission =
  | {
      mode: 'submitted';
      topicId: string;
      sequenceNumber: number;
      transactionId: string;
      hashscanUrl: string;
    }
  | {
      mode: 'dry_run' | 'skipped' | 'failed';
      topicId?: string;
      reason: string;
      error?: string;
    };

function hashscanTransactionUrl(transactionId: string): string {
  return `https://hashscan.io/${config.HEDERA_NETWORK}/transaction/${transactionId}`;
}

export async function emitProofReceiptToHcs(payload: Record<string, unknown>): Promise<ProofReceiptEmission> {
  const topicId = config.VERA_AUDIT_TOPIC_ID || config.HCS_TOPIC_ID;
  if (!topicId) {
    return { mode: 'skipped', reason: 'No VERA_AUDIT_TOPIC_ID or HCS_TOPIC_ID configured' };
  }

  const validation = featureFlags.validateOperation({ type: 'hcs_write' });
  if (!validation.allowed) {
    return { mode: 'skipped', topicId, reason: validation.reason ?? 'HCS write blocked by feature flags' };
  }

  if (!featureFlags.shouldWriteToHCS()) {
    return { mode: 'dry_run', topicId, reason: validation.reason ?? 'Dry run mode - HCS write not submitted' };
  }

  try {
    const [{ TopicMessageSubmitTransaction }, { getClient }] = await Promise.all([
      import('@hashgraph/sdk'),
      import('../../hedera/tools/client.js'),
    ]);
    const client = getClient();
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(payload))
      .execute(client);
    const receipt = await response.getReceipt(client);
    const transactionId = response.transactionId.toString();

    return {
      mode: 'submitted',
      topicId,
      sequenceNumber: Number(receipt.topicSequenceNumber?.toString() ?? '0'),
      transactionId,
      hashscanUrl: hashscanTransactionUrl(transactionId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('ProofReceiptEmitter', {
      message: 'Failed to submit verifiable AI proof receipt to HCS',
      topicId,
      error: message,
    });
    return { mode: 'failed', topicId, reason: 'HCS receipt submission failed', error: message };
  }
}
