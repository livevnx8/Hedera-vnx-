# ProofPublisher - Production Hardened HCS Integration

Enterprise-grade Hedera Consensus Service (HCS) publisher for Vera AI proof anchoring with comprehensive testing, cost optimization, and GDPR compliance.

## Features

### ✅ Production Hardening (Option A)
- **41 comprehensive tests** covering all code paths
- **Observability hooks** with structured metrics events
- **Deduplication** by run ID and packet hash
- **Retry logic** with exponential backoff
- **Mirror node replay** verification

### ✅ Cost Optimization (Option B)
- **Batch publishing**: Submit multiple proofs in one HCS transaction
- **90% HBAR savings** when batching 10 proofs
- **Automatic fallback** to individual publish on batch failure
- **Real-time cost tracking** with savings percentage

### ✅ Full Compliance (Option C)
- **Ed25519 packet signing** with verification chain
- **4 privacy levels**: public | hash_only | encrypted | gdpr_compliant
- **GDPR Article 17** (Right to Erasure) support
- **PII detection** and pseudonymization
- **Privacy audit reports**

## Quick Start

```typescript
import { proofPublisher, ProofPublisher } from './proofPublisher.js';

// Use global instance
const proof = await proofPublisher.publishProof(run);

// Or create custom instance
const publisher = new ProofPublisher({
  topicId: '0.0.12345',
  network: 'testnet',
  maxRetries: 3,
  signingEnabled: true,
  defaultPrivacyLevel: 'gdpr_compliant'
});
```

## API Reference

### Core Methods

#### `publishProof(run: VerifiableAIProofRun): Promise<PublishedProof | null>`
Publish a single proof to HCS with automatic deduplication and retry logic.

```typescript
const result = await publisher.publishProof(run);
// result.hcsReceipt.sequenceNumber - HCS sequence number
// result.hcsReceipt.hashscanUrl - View on HashScan
```

#### `batchPublish(runs: VerifiableAIProofRun[], options?): Promise<BatchPublishResult>`
Publish multiple proofs in one HCS transaction for 60-90% cost savings.

```typescript
const batch = await publisher.batchPublish(runs, {
  maxBatchSize: 10,
  skipFailed: true
});

console.log(`Published ${batch.proofs.length} proofs`);
console.log(`Saved ${batch.hbarSaved.savingsPercent}% HBAR`);
console.log(`Individual cost: ${batch.hbarSaved.individualCost} HBAR`);
console.log(`Actual cost: ${batch.hbarSaved.estimatedCost} HBAR`);
```

### Signing & Verification

#### `signPacket(packet, options?): Promise<SignedPacket>`
Sign a packet with Ed25519 signature (Hedera compatible).

```typescript
const signed = await publisher.signPacket(packet, {
  keyId: 'vera-key-001',
  privateKey: process.env.HEDERA_PRIVATE_KEY,
  privacyLevel: 'gdpr_compliant'
});

// signed.signature.algorithm = 'ed25519'
// signed.signature.signature = 'sig-abc123...'
// signed.verificationChain = [hash, sig, key, timestamp, prevHash]
```

#### `verifyPacketSignature(signedPacket, options?): Promise<VerificationResult>`
Verify a signed packet's signature and trust status.

```typescript
const result = await publisher.verifyPacketSignature(signed, {
  trustedKeys: [veraPublicKey]
});

// result.valid - All checks passed
// result.trustStatus - 'trusted' | 'untrusted' | 'unknown'
// result.signatureValid - Signature cryptographically valid
// result.chainValid - Verification chain intact
```

### Privacy Levels

#### `applyPrivacyLevel(packet, level, metadata?): { packet, metadata }`
Apply privacy transformations to a packet.

```typescript
// Level 1: public - No transformation, 7 year retention
const public = publisher.applyPrivacyLevel(packet, 'public');

// Level 2: hash_only - Only publish hash, 10 year retention
const hashOnly = publisher.applyPrivacyLevel(packet, 'hash_only');
// packetHash: 'abc123...', originalSize: 2048

// Level 3: encrypted - Encrypt sensitive fields, 5 year retention
const encrypted = publisher.applyPrivacyLevel(packet, 'encrypted');
// _vera.encrypted: true, _privacy.encryptedFields: ['payload']

// Level 4: gdpr_compliant - Full GDPR compliance, 1 year retention
const gdpr = publisher.applyPrivacyLevel(packet, 'gdpr_compliant');
// userId → [ANONYMIZED:hash123]
// email → [ANONYMIZED:hash456]
// _gdpr.complianceVersion: 'GDPR-2016-679'
```

### GDPR Compliance

#### `canEraseData(runId): { canErase, reason? }`
Check if data can be erased (respects HCS immutability).

```typescript
const { canErase, reason } = publisher.canEraseData(runId);

// canErase: false
// reason: 'Data already anchored to immutable HCS ledger - cannot erase on-chain data'
```

#### `eraseLocalData(runId): Promise<{ success, message }>`
Erase local data (only local cache - HCS data is immutable).

```typescript
const result = await publisher.eraseLocalData(runId);
// result.success: true
// result.message: 'Local data for run-123 has been erased. Note: HCS blockchain data is immutable and cannot be erased.'
```

#### `getPrivacyReport(runId): PrivacyReport`
Generate a privacy audit report.

```typescript
const report = publisher.getPrivacyReport(runId);
// {
//   runId: 'run-123',
//   privacyLevel: 'gdpr_compliant',
//   dataRetentionDays: 365,
//   ageDays: 45,
//   canErase: false,
//   piiFields: ['userId', 'email'],
//   gdprCompliant: true,
//   hcsAnchored: true
// }
```

## Events

The ProofPublisher extends EventEmitter and emits the following events:

```typescript
publisher.on('published', ({ runId, receipt }) => {
  console.log(`Proof ${runId} published to HCS seq ${receipt.sequenceNumber}`);
});

publisher.on('failed', ({ runId, error, willRetry }) => {
  console.error(`Proof ${runId} failed: ${error}`);
});

publisher.on('metrics', (metrics: ProofMetrics) => {
  // Track all operations
  console.log(`${metrics.type}: ${metrics.latencyMs}ms`);
});

publisher.on('packetSigned', ({ packetHash, keyId }) => {
  console.log(`Packet ${packetHash} signed with ${keyId}`);
});

publisher.on('packetVerified', ({ packetHash, valid, trustStatus }) => {
  console.log(`Packet ${packetHash} verification: ${valid} (${trustStatus})`);
});

publisher.on('dataErased', ({ runId }) => {
  console.log(`Data for ${runId} erased per GDPR request`);
});
```

## Configuration

```typescript
interface ProofPublisherConfig {
  topicId: string;                    // HCS topic ID (e.g., '0.0.12345')
  network: 'testnet' | 'mainnet' | 'previewnet';
  maxRetries: number;                 // Default: 3
  retryDelayMs: number;               // Default: 1000
  compressionEnabled: boolean;        // Default: true
  maxChunkSize: number;               // Default: 4096 (HIP-993)
  signingEnabled?: boolean;           // Enable packet signing
  signingKeyId?: string;              // Default key ID for signing
  defaultPrivacyLevel?: PrivacyLevel; // Default: 'public'
}
```

## Cost Optimization

### Individual Publishing (Baseline)
- 10 proofs × 0.0001 HBAR = **0.001 HBAR**

### Batch Publishing (90% Savings)
- 1 transaction × 0.0001 HBAR = **0.0001 HBAR**
- **Savings: 0.0009 HBAR (90%)**

```typescript
const runs = Array.from({ length: 10 }, (_, i) => createRun(i));
const result = await publisher.batchPublish(runs);

console.log(result.hbarSaved);
// {
//   estimatedCost: 0.0001,
//   individualCost: 0.001,
//   savings: 0.0009,
//   savingsPercent: 90
// }
```

## Privacy Levels Reference

| Level | Retention | On-Chain Data | Use Case |
|-------|-----------|---------------|----------|
| `public` | 7 years | Full packet | Open audit, transparency |
| `hash_only` | 10 years | Hash only | Proof of existence, content private |
| `encrypted` | 5 years | Encrypted fields | Sensitive data with key escrow |
| `gdpr_compliant` | 1 year | Anonymized PII | Personal data with erasure rights |

## Testing

```bash
# Run all ProofPublisher tests
npm test -- src/tests/vera/proofPublisher.test.ts

# 41 tests covering:
# - Core publishing (16 tests)
# - Batch operations (6 tests)
# - Signing & verification (4 tests)
# - Privacy & GDPR (11 tests)
# - Integration (4 tests)
```

## Integration Example

```typescript
import { proofPublisher } from './proofPublisher.js';
import { VerifiableAIProofKernel } from './proofKernel.js';

// Create proof
const kernel = new VerifiableAIProofKernel();
const run = await kernel.runTask(task);

// Apply GDPR privacy
const { packet: privatePacket } = proofPublisher.applyPrivacyLevel(
  run.memoryPacket,
  'gdpr_compliant'
);

// Sign for authenticity
const signed = await proofPublisher.signPacket(privatePacket, {
  keyId: 'vera-production-key',
  privacyLevel: 'gdpr_compliant'
});

// Batch publish with cost tracking
const batch = await proofPublisher.batchPublish([run]);

if (batch.hbarSaved.savingsPercent > 50) {
  console.log('✅ Significant cost savings achieved');
}

// Verify later
const replayed = await proofPublisher.replayFromMirrorNode(
  batch.proofs[0].hcsReceipt.sequenceNumber
);

const verification = await proofPublisher.verifyPacketSignature(
  replayed as SignedPacket,
  { trustedKeys: [veraPublicKey] }
);

if (verification.valid && verification.trustStatus === 'trusted') {
  console.log('✅ Proof verified on-chain');
}
```

## License

MIT - Vera AI Network
