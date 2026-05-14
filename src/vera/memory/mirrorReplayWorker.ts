import { getHcsMessages } from '../../hedera/mirrorApi.js';
import { hashMemoryPacket, validateVeraMemoryPacket, type VeraMemoryPacket } from './veraMemoryPacket.js';

export interface MirrorReplayMessage {
  sequence_number?: number;
  consensus_timestamp?: string;
  transaction_id?: string;
  message: string;
}

export interface VeraMemoryIndexRecord {
  packet: VeraMemoryPacket;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  transactionId?: string;
  packetHash: string;
  indexedAt: string;
}

export interface VeraMemoryReplayStats {
  packets: number;
  invalidPackets: number;
  pendingChunkGroups: number;
  taskIds: number;
  agentIds: number;
  eventTypes: number;
}

interface Hip993Envelope {
  _hip993?: {
    chunk?: number;
    total?: number;
    messageId?: string;
    chunked?: boolean;
  };
  data?: unknown;
}

interface PendingChunk {
  sequenceNumber?: number;
  consensusTimestamp?: string;
  transactionId?: string;
  data: string;
}

export class VeraMemoryReplayWorker {
  private readonly byTaskId = new Map<string, VeraMemoryIndexRecord[]>();
  private readonly byAgentId = new Map<string, VeraMemoryIndexRecord[]>();
  private readonly byEventType = new Map<string, VeraMemoryIndexRecord[]>();
  private readonly byPacketHash = new Map<string, VeraMemoryIndexRecord>();
  private readonly pendingChunks = new Map<string, { total: number; chunks: Map<number, PendingChunk> }>();
  private invalidPackets = 0;

  async replayTopic(topicId: string, limit = 25): Promise<VeraMemoryIndexRecord[]> {
    const messages = await getHcsMessages(topicId, limit);
    return this.ingestMirrorMessages(messages);
  }

  ingestMirrorMessages(messages: MirrorReplayMessage[]): VeraMemoryIndexRecord[] {
    const indexed: VeraMemoryIndexRecord[] = [];

    for (const message of messages) {
      for (const packet of this.extractPackets(message)) {
        const record = this.ingestPacket(packet, {
          sequenceNumber: message.sequence_number,
          consensusTimestamp: message.consensus_timestamp,
          transactionId: message.transaction_id,
        });
        if (record) indexed.push(record);
      }
    }

    return indexed;
  }

  ingestPacket(
    packet: VeraMemoryPacket,
    refs: Pick<VeraMemoryIndexRecord, 'sequenceNumber' | 'consensusTimestamp' | 'transactionId'> = {},
  ): VeraMemoryIndexRecord | null {
    const issues = validateVeraMemoryPacket(packet);
    const expectedHash = packet.proof.packetHash;
    const actualHash = hashMemoryPacket(packet);

    if (issues.length > 0 || !expectedHash || expectedHash !== actualHash) {
      this.invalidPackets += 1;
      return null;
    }

    const existing = this.byPacketHash.get(expectedHash);
    if (existing) return existing;

    const record: VeraMemoryIndexRecord = {
      packet,
      packetHash: expectedHash,
      sequenceNumber: refs.sequenceNumber,
      consensusTimestamp: refs.consensusTimestamp,
      transactionId: refs.transactionId,
      indexedAt: new Date().toISOString(),
    };

    this.byPacketHash.set(expectedHash, record);
    this.addToIndex(this.byEventType, packet._vera.eventType, record);
    if (packet._vera.taskId) this.addToIndex(this.byTaskId, packet._vera.taskId, record);
    if (packet._vera.agentId) this.addToIndex(this.byAgentId, packet._vera.agentId, record);

    return record;
  }

  getByTaskId(taskId: string): VeraMemoryIndexRecord[] {
    return this.byTaskId.get(taskId) ?? [];
  }

  getByAgentId(agentId: string): VeraMemoryIndexRecord[] {
    return this.byAgentId.get(agentId) ?? [];
  }

  getByEventType(eventType: string): VeraMemoryIndexRecord[] {
    return this.byEventType.get(eventType) ?? [];
  }

  getByPacketHash(packetHash: string): VeraMemoryIndexRecord | undefined {
    return this.byPacketHash.get(packetHash);
  }

  getStats(): VeraMemoryReplayStats {
    return {
      packets: this.byPacketHash.size,
      invalidPackets: this.invalidPackets,
      pendingChunkGroups: this.pendingChunks.size,
      taskIds: this.byTaskId.size,
      agentIds: this.byAgentId.size,
      eventTypes: this.byEventType.size,
    };
  }

  private addToIndex(index: Map<string, VeraMemoryIndexRecord[]>, key: string, record: VeraMemoryIndexRecord): void {
    const records = index.get(key) ?? [];
    records.push(record);
    index.set(key, records);
  }

  private extractPackets(message: MirrorReplayMessage): VeraMemoryPacket[] {
    const parsed = this.parseJson(message.message);
    if (!parsed) return [];

    if (this.isVeraMemoryPacket(parsed)) return [parsed];

    const envelope = parsed as Hip993Envelope;
    if (!envelope._hip993 || envelope.data === undefined) return [];

    const data = typeof envelope.data === 'string' ? envelope.data : JSON.stringify(envelope.data);
    const messageId = envelope._hip993.messageId;
    const chunk = envelope._hip993.chunk ?? 1;
    const total = envelope._hip993.total ?? 1;

    if (!messageId || total <= 1) {
      const packet = this.parseJson(data);
      return this.isVeraMemoryPacket(packet) ? [packet] : [];
    }

    const group = this.pendingChunks.get(messageId) ?? { total, chunks: new Map<number, PendingChunk>() };
    group.total = total;
    group.chunks.set(chunk, {
      sequenceNumber: message.sequence_number,
      consensusTimestamp: message.consensus_timestamp,
      transactionId: message.transaction_id,
      data,
    });
    this.pendingChunks.set(messageId, group);

    if (group.chunks.size < group.total) return [];

    const joined = Array.from({ length: group.total }, (_, index) => group.chunks.get(index + 1)?.data ?? '').join('');
    this.pendingChunks.delete(messageId);
    const packet = this.parseJson(joined);
    return this.isVeraMemoryPacket(packet) ? [packet] : [];
  }

  private parseJson(input: string): unknown {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  private isVeraMemoryPacket(input: unknown): input is VeraMemoryPacket {
    if (!input || typeof input !== 'object') return false;
    const candidate = input as Partial<VeraMemoryPacket>;
    return candidate._vera?.schema === 'vera.memory.packet.v1'
      && candidate._hip993?.type === 'VERA_MEMORY_PACKET';
  }
}
