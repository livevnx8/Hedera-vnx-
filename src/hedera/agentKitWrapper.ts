/**
 * Hedera Agent Kit Wrapper
 *
 * Lazily instantiates HederaAIToolkit (v3.8.2) with Vera's operator credentials.
 * Exposes a single `runAgentKitTool(method, args)` entry-point used by the executor.
 *
 * READ tools  → execute immediately (autonomous mode, read-only, safe)
 * WRITE tools → execute via the toolkit in AUTONOMOUS mode
 */

import { config } from '../config.js';
import type { PrivateKey as PrivateKeyType } from '@hashgraph/sdk';
import { redis } from '../cache/redis.js';

// Read-only tools that can execute autonomously without user approval
const READ_ONLY_TOOLS = new Set([
  'get_hbar_balance_query_tool',
  'get_account_query_tool',
  'get_account_token_balances_query_tool',
  'get_topic_messages_query_tool',
  'get_topic_info_query_tool',
  'get_token_info_query_tool',
  'get_contract_info_query_tool',
  'get_exchange_rate_tool',
  'get_pending_airdrop_tool',
  'get_transaction_record_query_tool',
]);

type ToolkitInstance = {
  run: (method: string, args: unknown) => Promise<string>;
};

let _toolkit: ToolkitInstance | null = null;

async function getToolkit(): Promise<ToolkitInstance> {
  if (_toolkit) return _toolkit;

  if (!config.HEDERA_OPERATOR_ACCOUNT_ID || !config.HEDERA_OPERATOR_PRIVATE_KEY) {
    throw new Error(
      'Hedera Agent Kit requires HEDERA_OPERATOR_ACCOUNT_ID and HEDERA_OPERATOR_PRIVATE_KEY in .env — please set these in your .env file',
    );
  }

  const { Client, PrivateKey } = await import('@hashgraph/sdk');
  const {
    HederaAIToolkit,
    AgentMode,
    // Token operations (replaces deprecated coreHTSPlugin)
    coreTokenPlugin,
    // Account operations
    coreAccountPlugin,
    // Consensus operations
    coreConsensusPlugin,
    // EVM operations
    coreEVMPlugin,
    // Query plugins (replaces deprecated coreQueriesPlugin)
    coreAccountQueryPlugin,
    coreTokenQueryPlugin,
    coreConsensusQueryPlugin,
    coreEVMQueryPlugin,
    coreTransactionQueryPlugin,
    // Misc
    coreMiscQueriesPlugin,
  } = await import('hedera-agent-kit');

  const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

  // Auto-detect key format: DER prefix = fromStringDer, raw 64-char hex = try ECDSA first
  let privateKey: PrivateKeyType;
  const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY!;
  if (keyStr.startsWith('302')) {
    privateKey = PrivateKey.fromStringDer(keyStr);
  } else if (keyStr.length === 64) {
    try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
    catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
  } else {
    privateKey = PrivateKey.fromString(keyStr);
  }
  client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);

  _toolkit = new HederaAIToolkit({
    client: client as never,
    configuration: {
      plugins: [
        coreTokenPlugin,
        coreAccountPlugin,
        coreConsensusPlugin,
        coreEVMPlugin,
        coreAccountQueryPlugin,
        coreTokenQueryPlugin,
        coreConsensusQueryPlugin,
        coreEVMQueryPlugin,
        coreTransactionQueryPlugin,
        coreMiscQueriesPlugin,
      ],
      context: {
        accountId: config.HEDERA_OPERATOR_ACCOUNT_ID,
        mode: AgentMode.AUTONOMOUS,
      },
    },
  }) as unknown as ToolkitInstance;

  return _toolkit;
}

export interface AgentKitResult {
  success: boolean;
  data?: unknown;
  error?: string;
  raw?: string;
}

export async function runAgentKitTool(
  method: string,
  args: Record<string, unknown>,
  agentId: string = 'vera-agent',
): Promise<AgentKitResult> {
  const startedAt = Date.now();

  // Phase 1 Optimization: Smart Caching for Read-Only Queries
  if (READ_ONLY_TOOLS.has(method)) {
    const cacheKey = `agentkit:ro:${method}:${JSON.stringify(args)}`;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        let data: unknown = cachedData;
        try { data = JSON.parse(cachedData); } catch { /* keep as string */ }
        void recordLearning(method, args, agentId, true, String(cachedData), undefined, Date.now() - startedAt);
        return { success: true, data, raw: cachedData };
      }
    } catch (e) {
      // Non-fatal, proceed without cache
    }
  }

  try {
    const toolkit = await getToolkit();
    // Use the internal HederaAgentAPI run() method
    const raw = await (toolkit as any)._hedera.run(method, args);

    // Parse the result — Agent Kit returns JSON strings
    let data: unknown = raw;
    try { data = JSON.parse(raw); } catch { /* keep as string */ }

    // If the tool was read-only and the call was successful, cache the raw result
    if (READ_ONLY_TOOLS.has(method)) {
      const cacheKey = `agentkit:ro:${method}:${JSON.stringify(args)}`;
      // Cache for 20 seconds
      await redis.set(cacheKey, raw, 20);
    }

    const durationMs = Date.now() - startedAt;

    // Fire-and-forget HCS verification for write actions (non-blocking)
    if (!READ_ONLY_TOOLS.has(method)) {
      void verifyToolCall(method, args, data);
    }

    // Fire-and-forget learning record (non-blocking)
    void recordLearning(method, args, agentId, true, typeof raw === 'string' ? raw : JSON.stringify(raw), undefined, durationMs);

    return { success: true, data, raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void recordLearning(method, args, agentId, false, '', message, Date.now() - startedAt);
    return { success: false, error: message };
  }
}

/**
 * Record tool usage into the learning system (lazy-imported to avoid circulars,
 * fire-and-forget to keep hot path fast).
 */
async function recordLearning(
  method: string,
  args: Record<string, unknown>,
  agentId: string,
  success: boolean,
  output: string,
  error: string | undefined,
  durationMs: number,
): Promise<void> {
  try {
    const { agentLearningSystem } = await import('../agent/learningSystem.js');
    agentLearningSystem.recordToolUsage({
      toolName: method,
      agentId,
      input: JSON.stringify(args).slice(0, 500),
      output: output.slice(0, 500),
      success,
      error,
      durationMs,
      timestamp: Date.now(),
    });
  } catch {
    // Learning must never break tool execution
  }
}

/**
 * Submit a cryptographic proof of a tool call to HCS via actionVerifier.
 * Lazy-imports to avoid circular deps and keep hot path fast.
 */
async function verifyToolCall(
  method: string,
  args: Record<string, unknown>,
  result: unknown,
): Promise<void> {
  try {
    const { actionVerifier } = await import('../vera/verification/actionVerifier.js');
    await actionVerifier.verifyAction({
      domain: 'tool-call',
      type: method,
      actor: 'vera-agent',
      payload: { method, args },
      result: summarizeResult(result),
    });
  } catch {
    // Verification failure must never break the tool call
  }
}

function summarizeResult(result: unknown): unknown {
  if (result === null || result === undefined) return result;
  if (typeof result !== 'object') return result;
  const str = JSON.stringify(result);
  // Keep payload small on hot path; full result is retrievable from app logs
  return str.length > 512 ? { _truncated: true, size: str.length } : result;
}

export { READ_ONLY_TOOLS };

/** Reset the singleton (useful for credential changes at runtime) */
export function resetToolkit(): void {
  _toolkit = null;
}
