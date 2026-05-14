/**
 * Mock Block Node (HIP-1056)
 *
 * Lightweight gRPC server that simulates block stream output.
 * Used until the official Hiero Block Node preview image is available.
 *
 * Emits blocks every ~2s with synthetic HCS topic messages so
 * downstream consumers can test their ingestion pipelines.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../monitoring/logger.js';

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

interface MockBlockNodeConfig {
  port: number;
  blockIntervalMs: number;
  hcsTopicIds: string[];
  simulateLatencyMs: number;
}

interface SyntheticHcsMessage {
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: number;
  message: string;
}

// ─── Mock Block Generator ──────────────────────────────────────────────────

class MockBlockGenerator extends EventEmitter {
  private config: MockBlockNodeConfig;
  private blockNumber = 1000000n;
  private roundNumber = 500000n;
  private sequenceCounters: Map<string, number> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private callStreams: Map<string, grpc.ServerWritableStream<any, any>> = new Map();

  constructor(config: MockBlockNodeConfig) {
    super();
    this.config = config;
    for (const tid of config.hcsTopicIds) this.sequenceCounters.set(tid, 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('MockBlockNode', {
      message: 'Block generator started',
      intervalMs: this.config.blockIntervalMs,
      topics: this.config.hcsTopicIds,
    });
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const stream of this.callStreams.values()) {
      try { stream.end(); } catch { /* ignore */ }
    }
    this.callStreams.clear();
    logger.info('MockBlockNode', { message: 'Block generator stopped' });
  }

  addStream(id: string, stream: grpc.ServerWritableStream<any, any>): void {
    this.callStreams.set(id, stream);
    // Immediately send a block so the client sees activity
    this.emitBlock();
  }

  removeStream(id: string): void {
    this.callStreams.delete(id);
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.emitBlock();
      this.scheduleNext();
    }, this.config.blockIntervalMs);
  }

  private emitBlock(): void {
    const now = Date.now();
    const blockNumber = Number(this.blockNumber++);
    const roundNumber = Number(this.roundNumber++);
    const timestampNs = BigInt(now) * 1000000n;

    // Generate synthetic HCS messages for tracked topics
    const hcsMessages: SyntheticHcsMessage[] = [];
    for (const topicId of this.config.hcsTopicIds) {
      const seq = this.sequenceCounters.get(topicId)!;
      this.sequenceCounters.set(topicId, seq + 1);
      hcsMessages.push({
        topicId,
        sequenceNumber: seq,
        consensusTimestamp: now,
        message: JSON.stringify({
          type: 'HCS_LEARN',
          source: 'vera-lattice',
          seq,
          ts: now,
          data: { metric: Math.random() },
        }),
      });
    }

    // Build block items
    const items: any[] = [];

    // 1. BlockHeader
    items.push({
      header: {
        block_number: blockNumber.toString(),
        previous_block_hash: Buffer.from(`hash-${blockNumber - 1}`).toString('base64'),
        hash: Buffer.from(`hash-${blockNumber}`).toString('base64'),
        consensus_timestamp: timestampNs.toString(),
      },
    });

    // 2. RoundHeader
    items.push({
      round_header: {
        round_number: roundNumber.toString(),
        consensus_timestamp: timestampNs.toString(),
      },
    });

    // 3. HCS EventTransactions + Results
    for (const msg of hcsMessages) {
      const txHash = Buffer.from(`tx-${msg.topicId}-${msg.sequenceNumber}`).toString('base64');

      items.push({
        event_transaction: {
          transaction_bytes: Buffer.from(JSON.stringify({
            topicID: { shardNum: 0, realmNum: 0, topicNum: parseInt(msg.topicId.split('.')[2]) },
            message: Buffer.from(msg.message).toString('base64'),
            sequenceNumber: msg.sequenceNumber,
            runningHash: txHash,
            consensusTimestamp: { seconds: Math.floor(now / 1000), nanos: (now % 1000) * 1000000 },
          })).toString('base64'),
          transaction_hash: txHash,
        },
      });

      items.push({
        transaction_result: {
          transaction_hash: txHash,
          status: '22', // SUCCESS
          result_bytes: Buffer.from(JSON.stringify({ receipt: { status: 'SUCCESS' } })).toString('base64'),
        },
      });
    }

    // 4. StateChanges (lightweight)
    items.push({
      state_changes: {
        changes: [{
          key: Buffer.from(`state-${blockNumber}`).toString('base64'),
          value: Buffer.from(JSON.stringify({ blockNumber })).toString('base64'),
          slot: '0',
        }],
      },
    });

    // 5. BlockProof (self-contained verifiable)
    const proofHash = Buffer.from(`proof-${blockNumber}`).toString('base64');
    items.push({
      block_proof: {
        block_number: blockNumber.toString(),
        block_hash: Buffer.from(`hash-${blockNumber}`).toString('base64'),
        signature: Buffer.from(`sig-${blockNumber}-ed25519`).toString('base64'),
        signers: [
          Buffer.from('node1-ed25519-pub').toString('base64'),
          Buffer.from('node2-ed25519-pub').toString('base64'),
          Buffer.from('node3-ed25519-pub').toString('base64'),
        ],
        signature_algorithm: '1',
      },
    });

    // Push to all active streams (write raw BlockItem so protobuf oneof deserializes)
    for (const [id, stream] of this.callStreams) {
      for (const item of items) {
        try {
          stream.write(item);
        } catch (err) {
          logger.warn('MockBlockNode', { message: 'Stream write failed, removing', streamId: id });
          this.removeStream(id);
          break;
        }
      }
    }

    logger.debug('MockBlockNode', {
      blockNumber,
      roundNumber,
      hcsMessages: hcsMessages.length,
      activeStreams: this.callStreams.size,
      message: 'Emitted synthetic block',
    });
  }
}

// ─── gRPC Server ───────────────────────────────────────────────────────────

let server: grpc.Server | null = null;
let generator: MockBlockGenerator | null = null;

export function startMockBlockNode(config: Partial<MockBlockNodeConfig> = {}): Promise<number> {
  const cfg: MockBlockNodeConfig = {
    port: config.port ?? 8085,
    blockIntervalMs: config.blockIntervalMs ?? 2000,
    hcsTopicIds: config.hcsTopicIds ?? ['0.0.1774506'],
    simulateLatencyMs: config.simulateLatencyMs ?? 0,
  };

  // Prevent double-start leaks
  if (generator) {
    generator.stop();
  }
  generator = new MockBlockGenerator(cfg);

  server = new grpc.Server();

  server.addService(blockStreamPkg.BlockStreamService.service, {
    SubscribeBlockStream: (call: grpc.ServerWritableStream<any, any>) => {
      const id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      logger.info('MockBlockNode', { message: 'New SubscribeBlockStream client', streamId: id });
      generator!.addStream(id, call);
      call.on('cancelled', () => generator?.removeStream(id));
      call.on('error', () => generator?.removeStream(id));
    },

    SubscribeBlockStreamBidirectional: (call: grpc.ServerDuplexStream<any, any>) => {
      const id = `bidi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      logger.info('MockBlockNode', { message: 'New bidirectional stream client', streamId: id });

      call.on('data', (req: any) => {
        logger.debug('MockBlockNode', { message: 'Bidirectional request', startBlock: req.start_block_number });
      });

      generator!.addStream(id, call as any);
      call.on('cancelled', () => generator?.removeStream(id));
      call.on('error', () => generator?.removeStream(id));
      call.on('end', () => generator?.removeStream(id));
    },
  });

  server.addService(blockStreamPkg.BlockAccessService.service, {
    GetBlockByNumber: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
      const req = call.request;
      logger.debug('MockBlockNode', { message: 'GetBlockByNumber', blockNumber: req.block_number });
      // Return a minimal single-item list
      callback(null, {
        items: [{
          header: {
            block_number: req.block_number,
            previous_block_hash: '',
            hash: Buffer.from(`hash-${req.block_number}`).toString('base64'),
            consensus_timestamp: (BigInt(Date.now()) * 1000000n).toString(),
          },
        }],
      });
    },

    GetLatestBlock: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
      const bn = generator ? Number(1000000n) : 0;
      callback(null, {
        items: [{
          header: {
            block_number: bn.toString(),
            previous_block_hash: '',
            hash: Buffer.from(`hash-${bn}`).toString('base64'),
            consensus_timestamp: (BigInt(Date.now()) * 1000000n).toString(),
          },
        }],
      });
    },
  });

  return new Promise((resolve, reject) => {
    server!.bindAsync(
      `0.0.0.0:${cfg.port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, actualPort) => {
        if (err) {
          logger.error('MockBlockNode', { message: 'Failed to start', error: err.message });
          reject(err);
          return;
        }
        generator!.start();
        logger.info('MockBlockNode', {
          message: 'gRPC server listening',
          port: actualPort,
          topics: cfg.hcsTopicIds,
        });
        resolve(actualPort);
      }
    );
  });
}

export function stopMockBlockNode(): Promise<void> {
  return new Promise((resolve) => {
    if (generator) {
      generator.stop();
      generator = null;
    }
    if (server) {
      const s = server;
      server = null;
      s.tryShutdown(() => {
        logger.info('MockBlockNode', { message: 'gRPC server shut down' });
        resolve();
      });
      // Fallback: force kill after 3 s if streams block graceful shutdown
      setTimeout(() => {
        try {
          s.forceShutdown();
          logger.warn('MockBlockNode', { message: 'gRPC server force-shutdown after timeout' });
        } catch { /* already closed */ }
        resolve();
      }, 3000);
    } else {
      resolve();
    }
  });
}

export { MockBlockGenerator };
