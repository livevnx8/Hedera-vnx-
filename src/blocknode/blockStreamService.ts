/**
 * Block Stream Service (HIP-1056)
 *
 * gRPC consumer that subscribes to a local Block Node and emits parsed BlockItems.
 * Extracts HCS topic messages from EventTransaction payloads and feeds them into
 * the existing topic poller pipeline.
 *
 * Supports both real Hiero Block Node and the mock implementation.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import { blockProofValidator, LegacyBlockProof, Hip1056BlockProof } from './blockProofValidator.js';
import { prometheus } from '../monitoring/prometheus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = resolveProtoPath();

function resolveProtoPath(): string {
  const candidates = [
    path.join(__dirname, 'proto', 'block_stream.proto'),
    path.join(process.cwd(), 'src', 'blocknode', 'proto', 'block_stream.proto'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to locate block_stream.proto. Checked: ${candidates.join(', ')}`);
  }
  return found;
}

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDef) as any;
const blockStreamPkg = proto.hedera.block;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ParsedBlockItem {
  type: 'header' | 'round_header' | 'event_transaction' | 'transaction_result' |
        'state_changes' | 'block_data' | 'block_proof' | 'unknown';
  blockNumber?: string;
  roundNumber?: string;
  timestamp?: string;
  payload: unknown;
  raw: unknown;
}

export interface HcsExtractedMessage {
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  message: string;
  transactionHash: string;
  blockNumber: string;
}

export interface BlockStreamStats {
  connected: boolean;
  lastBlockNumber: string;
  lastRoundNumber: string;
  itemsReceived: number;
  hcsMessagesExtracted: number;
  streamLatencyMs: number;
  startTime: number;
  lastItemTime: number;
  errors: number;
  reconnects: number;
}

export interface BlockStreamConfig {
  endpoint: string;       // e.g. "localhost:8085"
  reconnectDelayMs: number;
  startBlockNumber?: string;
  filterTopics?: string[];
}

// ─── Block Stream Consumer ─────────────────────────────────────────────────

export class BlockStreamConsumer extends EventEmitter {
  private config: BlockStreamConfig;
  private client: grpc.Client | null = null;
  private stream: grpc.ClientDuplexStream<any, any> | grpc.ClientReadableStream<any> | null = null;
  private stats: BlockStreamStats;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(cfg?: Partial<BlockStreamConfig>) {
    super();
    this.config = {
      endpoint: cfg?.endpoint ?? (config.BLOCK_STREAM_ENDPOINT || 'localhost:8085'),
      reconnectDelayMs: cfg?.reconnectDelayMs ?? 5000,
      startBlockNumber: cfg?.startBlockNumber,
      filterTopics: cfg?.filterTopics,
    };
    this.stats = {
      connected: false,
      lastBlockNumber: '0',
      lastRoundNumber: '0',
      itemsReceived: 0,
      hcsMessagesExtracted: 0,
      streamLatencyMs: 0,
      startTime: Date.now(),
      lastItemTime: Date.now(),
      errors: 0,
      reconnects: 0,
    };
  }

  /**
   * Start consuming the block stream.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('BlockStreamConsumer', {
      message: 'Starting block stream consumer',
      endpoint: this.config.endpoint,
    });
    this.connect();
  }

  /**
   * Stop consuming and clean up.
   */
  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeStream();
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.stats.connected = false;
    logger.info('BlockStreamConsumer', { message: 'Stopped' });
  }

  getStats(): BlockStreamStats {
    return { ...this.stats };
  }

  configure(cfg: Partial<BlockStreamConfig>): void {
    this.config = {
      ...this.config,
      ...cfg,
      filterTopics: cfg.filterTopics ?? this.config.filterTopics,
    };
  }

  private connect(): void {
    if (!this.running) return;
    this.closeStream();

    // Dispose previous client to prevent memory leak on repeated reconnects
    if (this.client) {
      try { this.client.close(); } catch { /* ignore */ }
      this.client = null;
    }

    try {
      this.client = new blockStreamPkg.BlockStreamService(
        this.config.endpoint,
        grpc.credentials.createInsecure()
      );

      const request = {
        start_block_number: this.config.startBlockNumber ?? '0',
        include_proofs: true,
        filter_topics: this.config.filterTopics ?? [],
      };

      this.stream = (this.client as any).SubscribeBlockStream(request);
      this.stats.connected = true;

      this.stream.on('data', (blockItem: any) => {
        const dataStart = Date.now();
        this.handleBlockItem(blockItem);
        prometheus.recordGrpcReadLatency(Date.now() - dataStart);
      });

      this.stream.on('error', (err: Error) => {
        if (!this.running) return;
        this.stats.errors++;
        this.stats.connected = false;
        prometheus.recordBlockStreamError();
        logger.warn('BlockStreamConsumer', {
          message: 'Stream error',
          error: err.message,
          endpoint: this.config.endpoint,
        });
        this.scheduleReconnect();
      });

      this.stream.on('end', () => {
        if (!this.running) return;
        this.stats.connected = false;
        prometheus.recordBlockStreamReconnect();
        logger.info('BlockStreamConsumer', { message: 'Stream ended' });
        this.scheduleReconnect();
      });

      logger.info('BlockStreamConsumer', {
        message: 'Connected to block stream',
        endpoint: this.config.endpoint,
        startBlock: request.start_block_number,
      });

    } catch (err) {
      this.stats.errors++;
      logger.error('BlockStreamConsumer', {
        message: 'Connection failed',
        error: err instanceof Error ? err.message : String(err),
      });
      this.scheduleReconnect();
    }
  }

  private closeStream(): void {
    if (this.stream) {
      try { this.stream.cancel(); } catch { /* ignore */ }
      this.stream = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.stats.reconnects++;
    prometheus.recordBlockStreamReconnect();
    prometheus.setBlockStreamReconnectCount(this.stats.reconnects);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.config.reconnectDelayMs);
  }

  /** Emit an event and catch listener errors so they don't kill the gRPC stream. */
  private safeEmit(event: string, data: unknown): void {
    try {
      this.emit(event, data);
    } catch (err) {
      logger.error('BlockStreamConsumer', {
        message: 'Event listener threw',
        event,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private handleBlockItem(blockItem: any): void {
    this.stats.itemsReceived++;
    this.stats.streamLatencyMs = Date.now() - this.stats.lastItemTime;
    this.stats.lastItemTime = Date.now();
    prometheus.recordBlockReceived();
    // protobufjs oneof sets `item` to the field name string (e.g. "header").
    // Unwrap only when it's an actual object (legacy mock wrapper format).
    const item = (typeof blockItem.item === 'object' && blockItem.item !== null)
      ? blockItem.item
      : blockItem;

    let parsed: ParsedBlockItem = { type: 'unknown', payload: item, raw: item };

    if (item.header) {
      parsed = {
        type: 'header',
        blockNumber: String(item.header.block_number),
        timestamp: String(item.header.consensus_timestamp),
        payload: item.header,
        raw: item,
      };
      this.stats.lastBlockNumber = String(item.header.block_number);
      prometheus.setBlockStreamBlockNumber(parseInt(String(item.header.block_number), 10) || 0);
      this.safeEmit('block_header', parsed);
    }
    else if (item.round_header) {
      parsed = {
        type: 'round_header',
        roundNumber: String(item.round_header.round_number),
        timestamp: String(item.round_header.consensus_timestamp),
        payload: item.round_header,
        raw: item,
      };
      this.stats.lastRoundNumber = String(item.round_header.round_number);
      prometheus.setBlockStreamRoundNumber(parseInt(String(item.round_header.round_number), 10) || 0);
      this.safeEmit('round_header', parsed);
    }
    else if (item.event_transaction) {
      parsed = {
        type: 'event_transaction',
        payload: item.event_transaction,
        raw: item,
      };
      this.safeEmit('event_transaction', parsed);

      // Try to extract HCS messages from transaction bytes
      const hcs = this.extractHcsFromTransaction(item.event_transaction);
      if (hcs) {
        this.stats.hcsMessagesExtracted++;
        prometheus.recordHcsMessageExtracted();
        hcs.blockNumber = this.stats.lastBlockNumber;
        this.safeEmit('hcs_message', hcs);
      }
    }
    else if (item.transaction_result) {
      parsed = {
        type: 'transaction_result',
        payload: item.transaction_result,
        raw: item,
      };
      this.safeEmit('transaction_result', parsed);
    }
    else if (item.state_changes) {
      parsed = {
        type: 'state_changes',
        payload: item.state_changes,
        raw: item,
      };
      this.safeEmit('state_changes', parsed);
    }
    else if (item.block_data) {
      parsed = {
        type: 'block_data',
        payload: item.block_data,
        raw: item,
      };
      this.safeEmit('block_data', parsed);
    }
    else if (item.block_proof) {
      parsed = {
        type: 'block_proof',
        blockNumber: String(item.block_proof.block_number),
        payload: item.block_proof,
        raw: item,
      };
      this.safeEmit('block_proof', parsed);

      // Auto-verify proof against validator
      void this.verifyBlockProof(item.block_proof);
    }

    this.safeEmit('item', parsed);
  }

  /**
   * Extract HCS topic messages from event transaction bytes.
   * Handles both base64-encoded JSON and raw protobuf-ish structures.
   */
  private extractHcsFromTransaction(eventTx: any): HcsExtractedMessage | null {
    try {
      const txBytes = eventTx.transaction_bytes;
      if (!txBytes) return null;

      let decoded: any;
      try {
        decoded = JSON.parse(Buffer.from(txBytes, 'base64').toString('utf-8'));
      } catch {
        // Not base64 JSON — skip extraction for now
        return null;
      }

      // Look for HCS SubmitMessage-like structure
      if (decoded.topicID && decoded.message) {
        const topicId = `${decoded.topicID.shardNum}.${decoded.topicID.realmNum}.${decoded.topicID.topicNum}`;
        const msg = Buffer.from(decoded.message, 'base64').toString('utf-8');

        return {
          topicId,
          sequenceNumber: decoded.sequenceNumber ?? 0,
          consensusTimestamp: decoded.consensusTimestamp
            ? `${decoded.consensusTimestamp.seconds}.${String(decoded.consensusTimestamp.nanos).padStart(9, '0')}`
            : Date.now().toString(),
          message: msg,
          transactionHash: eventTx.transaction_hash ?? '',
          blockNumber: this.stats.lastBlockNumber,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Verify a block proof against the validator on arrival.
   * Fire-and-forget so stream processing is never blocked.
   */
  private async verifyBlockProof(proof: LegacyBlockProof | Hip1056BlockProof): Promise<void> {
    const startMs = Date.now();
    try {
      // Proof format varies (legacy vs HIP-1056); probe common fields
      const p = proof as Record<string, unknown>;
      const bn = String(p.block_number ?? p.block ?? '0');
      const bh = String(p.block_hash ?? '');
      const result = await blockProofValidator.verifyBlockProof(bn, bh, proof);
      prometheus.recordProofVerificationLatency(Date.now() - startMs);
      if (!result.verified) {
        prometheus.recordBlockStreamDivergence();
      }
      logger.debug('BlockStreamConsumer', {
        blockNumber: bn,
        verified: result.verified,
        message: 'Block proof auto-verified',
      });
    } catch (err) {
      prometheus.recordBlockStreamDivergence();
      logger.warn('BlockStreamConsumer', {
        message: 'Block proof verification error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const blockStreamConsumer = new BlockStreamConsumer();
export default blockStreamConsumer;
