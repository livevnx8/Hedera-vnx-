import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { featureFlags } from '../orchestrator/featureFlags.js';
import { validateVeraMemoryPacket, type VeraMemoryPacket } from './veraMemoryPacket.js';

export type VeraMemoryPacketEmission =
  | {
      mode: 'submitted';
      topicId: string;
      sequenceNumber: number;
      transactionId: string;
      hashscanUrl: string;
      chunks: number;
      chunkSequenceNumbers: number[];
      packetHash: string;
    }
  | {
      mode: 'dry_run' | 'skipped' | 'failed';
      topicId?: string;
      reason: string;
      error?: string;
      packetHash: string;
    };

function hashscanTransactionUrl(transactionId: string): string {
  return `https://hashscan.io/${config.HEDERA_NETWORK}/transaction/${transactionId}`;
}

export async function emitVeraMemoryPacketToHcs(packet: VeraMemoryPacket): Promise<VeraMemoryPacketEmission> {
  const packetHash = packet.proof.packetHash ?? '';
  const issues = validateVeraMemoryPacket(packet);
  if (issues.length > 0) {
    return {
      mode: 'skipped',
      reason: `Memory packet failed validation: ${issues.join(', ')}`,
      packetHash,
    };
  }

  const topicId = config.VERA_AUDIT_TOPIC_ID || config.HCS_TOPIC_ID;
  if (!topicId) {
    return {
      mode: 'skipped',
      reason: 'No VERA_AUDIT_TOPIC_ID or HCS_TOPIC_ID configured',
      packetHash,
    };
  }

  const validation = featureFlags.validateOperation({ type: 'hcs_write' });
  if (!validation.allowed) {
    return {
      mode: 'skipped',
      topicId,
      reason: validation.reason ?? 'HCS write blocked by feature flags',
      packetHash,
    };
  }

  if (!featureFlags.shouldWriteToHCS()) {
    return {
      mode: 'dry_run',
      topicId,
      reason: validation.reason ?? 'Dry run mode - memory packet not submitted to HCS',
      packetHash,
    };
  }

  try {
    const { hederaMaster } = await import('../../hedera/hederaMasterClass.js');
    const result = await hederaMaster.submitMessage(topicId, packet, {
      maxChunkSize: packet._hip993.max_chunk_size,
    });

    return {
      mode: 'submitted',
      topicId,
      sequenceNumber: result.sequenceNumber,
      transactionId: result.transactionId,
      hashscanUrl: hashscanTransactionUrl(result.transactionId),
      chunks: result.chunks,
      chunkSequenceNumbers: result.chunkSequenceNumbers,
      packetHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('VeraMemoryEmitter', {
      message: 'Failed to submit Vera memory packet to HCS',
      topicId,
      packetHash,
      error: message,
    });
    return {
      mode: 'failed',
      topicId,
      reason: 'HCS memory packet submission failed',
      error: message,
      packetHash,
    };
  }
}
