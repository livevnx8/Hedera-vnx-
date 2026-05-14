import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { logger } from '../../monitoring/logger.js';
import type { VeraMemoryIndexRecord } from './mirrorReplayWorker.js';
import type { VeraMemoryPacket } from './veraMemoryPacket.js';

export interface StoredVeraMemoryRecord {
  packet: VeraMemoryPacket;
  packetHash: string;
  eventId: string;
  eventType: string;
  taskId?: string;
  agentId?: string;
  runId?: string;
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  transactionId?: string;
  hashscanUrl?: string;
  current: boolean;
  supersededBy: string | null;
  indexedAt: string;
}

export interface VeraMemoryReplaySummary {
  records: number;
  current: number;
  superseded: number;
  taskIds: number;
  agentIds: number;
  eventTypes: number;
  lastIndexedAt?: string;
}

export class VeraMemoryReplayStore {
  private records = new Map<string, StoredVeraMemoryRecord>();
  private loaded = false;

  constructor(private readonly storagePath = path.join(process.cwd(), 'data', 'vera-memory-replay.json')) {}

  async ingestRecord(record: VeraMemoryIndexRecord): Promise<StoredVeraMemoryRecord> {
    await this.load();
    const stored = this.toStoredRecord(record);
    this.records.set(stored.packetHash, stored);
    await this.persist();
    return stored;
  }

  async ingestRecords(records: VeraMemoryIndexRecord[]): Promise<StoredVeraMemoryRecord[]> {
    await this.load();
    const stored = records.map((record) => this.toStoredRecord(record));
    for (const item of stored) {
      this.records.set(item.packetHash, item);
    }
    await this.persist();
    return stored;
  }

  async getByPacketHash(packetHash: string): Promise<StoredVeraMemoryRecord | undefined> {
    await this.load();
    return this.records.get(packetHash);
  }

  async listByTaskId(taskId: string): Promise<StoredVeraMemoryRecord[]> {
    await this.load();
    return this.sortedRecords((record) => record.taskId === taskId);
  }

  async listByAgentId(agentId: string): Promise<StoredVeraMemoryRecord[]> {
    await this.load();
    return this.sortedRecords((record) => record.agentId === agentId);
  }

  async listByEventType(eventType: string): Promise<StoredVeraMemoryRecord[]> {
    await this.load();
    return this.sortedRecords((record) => record.eventType === eventType);
  }

  async listRecent(limit = 100): Promise<StoredVeraMemoryRecord[]> {
    await this.load();
    return this.sortedRecords(() => true).slice(0, limit);
  }

  async getSummary(): Promise<VeraMemoryReplaySummary> {
    await this.load();
    const records = Array.from(this.records.values());
    return {
      records: records.length,
      current: records.filter((record) => record.current).length,
      superseded: records.filter((record) => !record.current).length,
      taskIds: new Set(records.map((record) => record.taskId).filter(Boolean)).size,
      agentIds: new Set(records.map((record) => record.agentId).filter(Boolean)).size,
      eventTypes: new Set(records.map((record) => record.eventType)).size,
      lastIndexedAt: this.sortedRecords(() => true)[0]?.indexedAt,
    };
  }

  async clear(): Promise<void> {
    await this.load();
    this.records.clear();
    await this.persist();
  }

  private toStoredRecord(record: VeraMemoryIndexRecord): StoredVeraMemoryRecord {
    const packet = record.packet;
    return {
      packet,
      packetHash: record.packetHash,
      eventId: packet._vera.eventId,
      eventType: packet._vera.eventType,
      taskId: packet._vera.taskId,
      agentId: packet._vera.agentId,
      runId: packet._vera.runId,
      topicId: packet.refs.hcsTopicId,
      sequenceNumber: record.sequenceNumber ?? packet.refs.hcsSequence,
      consensusTimestamp: record.consensusTimestamp,
      transactionId: record.transactionId ?? packet.refs.transactionId,
      hashscanUrl: packet.refs.hashscanUrl,
      current: true,
      supersededBy: null,
      indexedAt: record.indexedAt,
    };
  }

  private sortedRecords(predicate: (record: StoredVeraMemoryRecord) => boolean): StoredVeraMemoryRecord[] {
    return Array.from(this.records.values())
      .filter(predicate)
      .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const raw = await readFile(this.storagePath, 'utf-8');
      const records = JSON.parse(raw) as StoredVeraMemoryRecord[];
      this.records.clear();
      for (const record of records) {
        this.records.set(record.packetHash, record);
      }
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'ENOENT') {
        logger.warn('VeraMemoryReplayStore', {
          message: 'Failed to load Vera memory replay store',
          storagePath: this.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, `${JSON.stringify(Array.from(this.records.values()), null, 2)}\n`, 'utf-8');
  }
}

export const veraMemoryReplayStore = new VeraMemoryReplayStore();
